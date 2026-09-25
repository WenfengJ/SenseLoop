#!/usr/bin/env python3
"""Import curated TCM and health guideline sources into SenseLoop knowledge tables.

The script intentionally imports a selected subset first. Large terminology
books and policy documents are useful later, but they add noise to the first
assistant retrieval experience.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid5, NAMESPACE_URL

from pypdf import PdfReader
from sqlalchemy import delete, select

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.db import init_db, open_session  # noqa: E402
from app.models.tables import KnowledgeChunkTable, KnowledgeSourceTable  # noqa: E402


DEFAULT_SOURCE_IDS = {"01", "02", "04", "05", "06", "08", "09", "15", "18", "19", "20"}
IMPORTER = "senseloop_tcm_import_v1"
MAX_CHUNKS_PER_SOURCE = {
    "01": 28,
    "02": 28,
    "04": 28,
    "05": 28,
    "06": 32,
    "08": 18,
    "09": 18,
    "15": 24,
    "18": 24,
    "19": 12,
    "20": 14,
}

TOPIC_TAGS = {
    "01": ["血脂", "饮食调理", "药食同源", "慢病食养"],
    "02": ["血压", "饮食调理", "药食同源", "慢病食养"],
    "04": ["血糖", "糖尿病", "饮食调理", "慢病食养"],
    "05": ["尿酸", "痛风", "饮食调理", "慢病食养"],
    "06": ["体重管理", "肥胖", "饮食调理", "运动"],
    "08": ["肾脏", "高风险边界", "饮食调理"],
    "09": ["药食同源", "食药物质", "安全边界"],
    "15": ["四诊", "舌诊", "问诊", "中医诊断"],
    "18": ["睡眠", "失眠", "就医提醒", "安全边界"],
    "19": ["膳食指南", "基础营养", "健康生活方式"],
    "20": ["健康素养", "运动", "睡眠", "医疗边界"],
}

SOURCE_TYPES = {
    "01": "dietary_guideline",
    "02": "dietary_guideline",
    "04": "dietary_guideline",
    "05": "dietary_guideline",
    "06": "dietary_guideline",
    "08": "dietary_guideline",
    "09": "food_medicine_catalog",
    "15": "tcm_diagnosis",
    "18": "sleep_guideline",
    "19": "dietary_guideline",
    "20": "health_literacy",
}

HIGH_VALUE_PATTERNS = [
    "食养", "膳食", "饮食", "原则", "建议", "推荐", "限制", "避免", "适宜", "不宜",
    "证型", "辨证", "舌", "望诊", "闻诊", "问诊", "切诊", "睡眠", "失眠", "运动",
    "风险", "就医", "治疗", "药物", "健康", "素养", "高血压", "糖尿病", "高尿酸",
    "痛风", "肥胖", "血脂", "慢性肾脏病", "食药物质",
]

RISK_PATTERNS = ["就医", "治疗", "药物", "禁忌", "严重", "持续", "风险", "诊断", "慢性肾脏病", "失眠障碍"]


@dataclass
class ExtractedBlock:
    text: str
    page: int | None


def stable_id(value: str) -> str:
    return str(uuid5(NAMESPACE_URL, value))


def normalize_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"fmx_[A-Za-z0-9_]+", " ", text)
    text = re.sub(r"Chin J [A-Za-z, ]+Vol\.[^。；\n]{0,120}", " ", text)
    text = re.sub(r"[ \t\u3000]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"([\u4e00-\u9fff])\s+([\u4e00-\u9fff])", r"\1\2", text)
    return text.strip()


def clean_html(raw: str) -> str:
    raw = re.sub(r"<(script|style).*?</\1>", " ", raw, flags=re.I | re.S)
    raw = re.sub(r"<[^>]+>", " ", raw)
    raw = raw.replace("&nbsp;", " ")
    return normalize_text(raw)


def extract_pdf(path: Path) -> list[ExtractedBlock]:
    reader = PdfReader(str(path))
    blocks: list[ExtractedBlock] = []
    for index, page in enumerate(reader.pages, start=1):
        text = normalize_text(page.extract_text() or "")
        if text:
            blocks.extend(split_page_text(text, index))
    return blocks


def extract_html(path: Path) -> list[ExtractedBlock]:
    text = clean_html(path.read_text(encoding="utf-8", errors="ignore"))
    return split_page_text(text, None)


def split_page_text(text: str, page: int | None) -> list[ExtractedBlock]:
    pieces = [piece.strip() for piece in re.split(r"\n\s*\n|(?<=。)\s+", text) if piece.strip()]
    merged: list[ExtractedBlock] = []
    buffer = ""
    for piece in pieces:
        if len(piece) < 28 and not any(pattern in piece for pattern in HIGH_VALUE_PATTERNS):
            continue
        if len(buffer) + len(piece) <= 900:
            buffer = f"{buffer}\n{piece}".strip()
        else:
            if buffer:
                merged.append(ExtractedBlock(buffer, page))
            buffer = piece
    if buffer:
        merged.append(ExtractedBlock(buffer, page))
    return merged


def block_score(block: ExtractedBlock, source_id: str) -> int:
    text = block.text
    head = text[:120]
    if "目录" in head and ("....." in text or "····" in text or "----" in text):
        return -20
    if any(noise in text for noise in ["囊尾蚴病诊断标准", "食品安全风险评估管理规定", "食品安全风险监测管理规定"]):
        return -20
    if re.search(r"[A-Za-z0-9_]{18,}", head) and len(re.findall(r"[\u4e00-\u9fff]", head)) < 20:
        return -10
    score = sum(2 for pattern in HIGH_VALUE_PATTERNS if pattern in text)
    score += sum(1 for tag in TOPIC_TAGS.get(source_id, []) if tag in text)
    if 120 <= len(text) <= 1100:
        score += 3
    if re.search(r"[一二三四五六七八九十][、.．]|（[一二三四五六七八九十]）", text):
        score += 2
    if "参考文献" in text or "目录" in text[:20]:
        score -= 6
    if len(text) > 1800:
        score -= 4
    return score


def select_blocks(blocks: list[ExtractedBlock], source_id: str) -> list[ExtractedBlock]:
    scored = [(block_score(block, source_id), index, block) for index, block in enumerate(blocks)]
    scored = [item for item in scored if item[0] > 0 and len(item[2].text) >= 60]
    scored.sort(key=lambda item: (-item[0], item[1]))
    limit = MAX_CHUNKS_PER_SOURCE.get(source_id, 20)
    selected = scored[:limit]
    selected.sort(key=lambda item: item[1])
    return [block for _, _, block in selected]


def tags_for(source_id: str, text: str) -> list[str]:
    tags = list(TOPIC_TAGS.get(source_id, []))
    for pattern in HIGH_VALUE_PATTERNS:
        if pattern in text and pattern not in tags:
            tags.append(pattern)
    return tags[:12]


def safety_level_for(text: str, source_id: str) -> str:
    if source_id in {"08", "18", "20"} or any(pattern in text for pattern in RISK_PATTERNS):
        return "medical_boundary"
    if source_id == "09":
        return "safety_rule"
    return "normal"


def source_to_row(record: dict[str, Any], source_id: str) -> KnowledgeSourceTable:
    return KnowledgeSourceTable(
        id=source_id,
        source_type=SOURCE_TYPES.get(record["id"], "reference"),
        title=record["title"],
        author=record.get("publisher"),
        source_uri=record.get("url"),
        version="v1",
        language="zh-CN",
        review_status="approved",
        extra_metadata={
            "importer": IMPORTER,
            "originalId": record["id"],
            "topic": record.get("topic"),
            "why": record.get("why"),
            "sha256": record.get("sha256"),
            "localFile": Path(record.get("file", "")).name,
            "copyrightNote": "内部研究与摘要检索使用；回答时避免大段复述原文。",
        },
    )


def import_sources(records: list[dict[str, Any]], dry_run: bool = False) -> dict[str, Any]:
    selected_records = [record for record in records if record.get("id") in DEFAULT_SOURCE_IDS and record.get("status") == "ok"]
    result = {"sources": 0, "chunks": 0, "details": []}
    prepared: list[tuple[dict[str, Any], str, list[ExtractedBlock]]] = []
    for record in selected_records:
        path = Path(record["file"])
        blocks = extract_pdf(path) if record.get("kind") == "pdf" else extract_html(path)
        selected_blocks = select_blocks(blocks, record["id"])
        source_id = f"kb-tcm-{record['id']}"
        prepared.append((record, source_id, selected_blocks))
        result["details"].append({"id": record["id"], "title": record["title"], "chunks": len(selected_blocks)})
        result["sources"] += 1
        result["chunks"] += len(selected_blocks)

    if dry_run:
        return result

    init_db()
    with open_session() as session:
        for _, source_id, _ in prepared:
            session.execute(delete(KnowledgeChunkTable).where(KnowledgeChunkTable.source_id == source_id))
            row = session.get(KnowledgeSourceTable, source_id)
            if row is not None:
                session.delete(row)
        session.commit()

        for record, source_id, blocks in prepared:
            source = source_to_row(record, source_id)
            session.add(source)
            session.flush()
            for index, block in enumerate(blocks):
                content = block.text[:1400]
                session.add(
                    KnowledgeChunkTable(
                        id=stable_id(f"{source_id}:{index}:{content[:80]}"),
                        source_id=source_id,
                        chunk_index=index,
                        content=content,
                        summary=content[:180],
                        tags=tags_for(record["id"], content),
                        applies_to=["qihuang_agent", "daily_report", "document_summary"],
                        safety_level=safety_level_for(content, record["id"]),
                        extra_metadata={
                            "page": block.page,
                            "sourceOriginalId": record["id"],
                            "topic": record.get("topic"),
                            "importer": IMPORTER,
                        },
                    )
                )
        session.commit()
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", default=str(ROOT / "中医知识" / "sources.json"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", default=str(ROOT / "中医知识" / "knowledge_import_report.json"))
    args = parser.parse_args()

    records = json.loads(Path(args.sources).read_text(encoding="utf-8"))
    result = import_sources(records, dry_run=args.dry_run)
    Path(args.report).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
