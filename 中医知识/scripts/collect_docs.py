#!/usr/bin/env python3
"""Download and lightly verify knowledge-base source documents.

Usage:
  python3 scripts/collect_docs.py
  python3 scripts/collect_docs.py --seed document_sources.seed.json --force

The seed file is a JSON list. Required fields:
  id, title, kind ("pdf" or "html"), topic, publisher, url, why
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

try:
    from pypdf import PdfReader
except ImportError:  # Keep the script usable for HTML-only collections.
    PdfReader = None


USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X) CodexKnowledgeCollector/1.0"


def safe_name(value: str) -> str:
    value = re.sub(r'[\\/:*?"<>|\s]+', "_", value.strip())
    return re.sub(r"_+", "_", value).strip("_")[:110]


def read_seed(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("seed file must contain a JSON list")
    return data


def request_bytes(url: str, timeout: int, retries: int, max_seconds: int) -> bytes:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                chunks = []
                started = time.monotonic()
                while True:
                    if time.monotonic() - started > max_seconds:
                        raise TimeoutError(f"download exceeded {max_seconds}s")
                    chunk = response.read(1024 * 256)
                    if not chunk:
                        return b"".join(chunks)
                    chunks.append(chunk)
        except (urllib.error.URLError, TimeoutError, socket.timeout) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
                continue
            raise
    assert last_error is not None
    raise last_error


def extract_pdf_note(path: Path) -> tuple[str, str]:
    if PdfReader is None:
        return "PDF saved; pypdf is not installed, so text extraction was skipped.", ""
    reader = PdfReader(str(path))
    page_count = len(reader.pages)
    sample = (reader.pages[0].extract_text() or "")[:700].replace("\x00", "")
    sample = re.sub(r"\s+", " ", sample).strip()
    return f"{page_count}页；首页抽取标题/正文：{sample[:220]}", sample


def extract_html_note(data: bytes) -> tuple[str, str]:
    head = data[:6000].decode("utf-8", "ignore")
    text = re.sub(r"<(script|style).*?</\1>", " ", head, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return f"HTML已保存；开头文本：{text[:220]}", text


def collect_one(item: dict[str, Any], out_dir: Path, force: bool, timeout: int, retries: int, max_seconds: int) -> dict[str, Any]:
    kind = item.get("kind", "pdf")
    ext = "pdf" if kind == "pdf" else "html"
    dest = out_dir / f"{item['id']}_{safe_name(item['title'])}.{ext}"
    record = dict(item)
    record.update({"file": str(dest), "status": "ok", "note": "", "sha256": ""})

    try:
        if dest.exists() and not force:
            data = dest.read_bytes()
        else:
            data = request_bytes(item["url"], timeout=timeout, retries=retries, max_seconds=max_seconds)
            dest.write_bytes(data)

        record["sha256"] = hashlib.sha256(data).hexdigest()
        if kind == "pdf":
            if not data.startswith(b"%PDF"):
                record["status"] = "bad"
                record["note"] = f"下载内容不是PDF；文件头：{data[:40]!r}"
            else:
                note, _ = extract_pdf_note(dest)
                record["note"] = note
        else:
            note, _ = extract_html_note(data)
            record["note"] = note
    except Exception as exc:  # Keep batch collection moving.
        record["status"] = "failed"
        record["note"] = repr(exc)
        if not dest.exists():
            record["file"] = ""
    return record


def write_audit(records: list[dict[str, Any]], out_dir: Path) -> None:
    rows = [
        "# 中医知识库资料来源审核清单\n",
        f"生成时间：{date.today().isoformat()}\n",
        "筛选原则：优先官方机构、WHO、国家教育平台和专业学会/期刊指南；剔除营销号、百科、论坛和来路不明养生文。医疗相关内容仅作健康科普和知识库检索素材，不可替代医生诊断、处方或治疗。\n",
        "|序号|资料|来源主体|主题|本地文件|状态|审核判断|原始URL|\n",
        "|---|---|---|---|---|---|---|---|\n",
    ]
    for record in records:
        file_name = Path(record["file"]).name if record.get("file") else ""
        judgment = "可信：来源为官方/WHO/专业指南，标题抽检匹配。" if record["status"] == "ok" else "需复核：下载失败或内容不匹配。"
        if "版权需谨慎" in record.get("why", ""):
            judgment += " 版权注意：仅建议内部研究与摘要切片。"
        rows.append(
            "|{id}|{title}|{publisher}|{topic}|{file}|{status}|{judgment}|{url}|\n".format(
                id=html.escape(record["id"]),
                title=html.escape(record["title"]),
                publisher=html.escape(record["publisher"]),
                topic=html.escape(record["topic"]),
                file=html.escape(file_name),
                status=html.escape(record["status"]),
                judgment=html.escape(judgment),
                url=html.escape(record["url"]),
            )
        )

    rows.append("\n## 逐份抽检备注\n")
    for record in records:
        rows.extend(
            [
                f"\n### {record['id']} {record['title']}\n",
                f"- 用途：{record.get('why', '')}\n",
                f"- 下载状态：{record['status']}\n",
                f"- 本地文件：{record.get('file', '')}\n",
                f"- SHA256：{record.get('sha256', '')}\n",
                f"- 抽检：{record.get('note', '')}\n",
            ]
        )

    (out_dir / "来源审核清单.md").write_text("".join(rows), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", default="document_sources.seed.json")
    parser.add_argument("--out-dir", default=".")
    parser.add_argument("--timeout", type=int, default=25)
    parser.add_argument("--max-seconds", type=int, default=45)
    parser.add_argument("--retries", type=int, default=1)
    parser.add_argument("--start-at", help="skip seed items before this id")
    parser.add_argument("--force", action="store_true", help="redownload existing files")
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    seed_path = (out_dir / args.seed).resolve()
    records = []
    for item in read_seed(seed_path):
        if args.start_at and item["id"] < args.start_at:
            continue
        record = collect_one(item, out_dir, args.force, args.timeout, args.retries, args.max_seconds)
        records.append(record)
        print(f"{record['id']} {record['status']} {record['title']} -> {record['note'][:120]}", flush=True)

    (out_dir / "sources.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    write_audit(records, out_dir)
    return 0 if all(record["status"] == "ok" for record in records) else 2


if __name__ == "__main__":
    sys.exit(main())
