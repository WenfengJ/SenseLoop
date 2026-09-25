#!/usr/bin/env python3
"""Extract text and build JSONL chunks for the TCM knowledge-base sources.

Usage:
  python3 scripts/build_kb_chunks.py
  python3 scripts/build_kb_chunks.py --chunk-size 900 --overlap 120

Outputs:
  extracted_text/<source_id>_<title>.txt
  chunks/knowledge_chunks.jsonl
  chunks/chunk_report.md
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from pypdf import PdfReader
except ImportError as exc:
    raise SystemExit("pypdf is required. Use the Codex bundled Python runtime or install pypdf.") from exc


@dataclass
class TextBlock:
    text: str
    page: int | None


def clean_text(value: str) -> str:
    value = value.replace("\u3000", " ")
    value = value.replace("\xa0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def clean_html(data: bytes) -> str:
    text = data.decode("utf-8", "ignore")
    text = select_main_html(text)
    text = re.sub(r"(?is)<script.*?</script>", " ", text)
    text = re.sub(r"(?is)<style.*?</style>", " ", text)
    text = re.sub(r"(?is)<noscript.*?</noscript>", " ", text)
    text = re.sub(r"(?is)<(br|p|div|li|tr|h[1-6])\b[^>]*>", "\n", text)
    text = re.sub(r"(?is)<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    text = re.sub(r"\n\s+", "\n", text)
    return clean_text(text)


def select_main_html(text: str) -> str:
    """Prefer article body fragments over full government/WHO pages.

    The source pages are static HTML mirrors with a lot of navigation text.
    These patterns intentionally cover common article containers first, then
    fall back to a broad content section, and finally to the full document.
    """
    patterns = [
        r"(?is)<div[^>]+class\s*=\s*['\"]?TRS_Editor['\"]?[^>]*>(.*?)<!--\s*正文end\s*-->",
        r"(?is)<div[^>]+class\s*=\s*['\"][^'\"]*\barticle_con\b[^'\"]*['\"][^>]*>(.*?)(?:</div>\s*</div>\s*<div|</div>\s*</div>\s*</div>)",
        r"(?is)<article\b[^>]*>(.*?)</article>",
        r"(?is)<main\b[^>]*>(.*?)</main>",
        r"(?is)<section[^>]+id\s*=\s*['\"]content['\"][^>]*>(.*?)(?:<footer\b|</section>\s*<!--\s*footer)",
        r"(?is)<div[^>]+class\s*=\s*['\"][^'\"]*\bsf-content-block\b[^'\"]*['\"][^>]*>(.*?)(?:<footer\b|</section>)",
    ]
    candidates: list[str] = []
    for pattern in patterns:
        for match in re.finditer(pattern, text):
            fragment = match.group(1)
            plain = re.sub(r"(?is)<script.*?</script>|<style.*?</style>|<[^>]+>", " ", fragment)
            plain = re.sub(r"\s+", " ", html.unescape(plain)).strip()
            if len(plain) >= 300:
                candidates.append(fragment)
    if candidates:
        return max(candidates, key=len)
    return text


def extract_pdf_blocks(path: Path) -> list[TextBlock]:
    reader = PdfReader(str(path))
    blocks: list[TextBlock] = []
    for index, page in enumerate(reader.pages, start=1):
        text = clean_text(page.extract_text() or "")
        if text:
            blocks.append(TextBlock(text=text, page=index))
    return blocks


def extract_html_blocks(path: Path) -> list[TextBlock]:
    text = clean_html(path.read_bytes())
    return [TextBlock(text=text, page=None)] if text else []


def split_paragraphs(blocks: list[TextBlock]) -> list[TextBlock]:
    paragraphs: list[TextBlock] = []
    for block in blocks:
        for part in re.split(r"\n{2,}|(?<=[。！？；])\s+", block.text):
            text = clean_text(part)
            if len(text) >= 8:
                paragraphs.append(TextBlock(text=text, page=block.page))
    return paragraphs


def make_chunks(paragraphs: list[TextBlock], chunk_size: int, overlap: int) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    current: list[TextBlock] = []
    current_len = 0

    def flush() -> None:
        nonlocal current, current_len
        if not current:
            return
        text = clean_text("\n".join(block.text for block in current))
        if len(text) >= 80:
            pages = [block.page for block in current if block.page is not None]
            chunks.append(
                {
                    "text": text,
                    "page_start": min(pages) if pages else None,
                    "page_end": max(pages) if pages else None,
                }
            )
        if overlap <= 0:
            current = []
            current_len = 0
            return
        tail: list[TextBlock] = []
        tail_len = 0
        for block in reversed(current):
            tail.insert(0, block)
            tail_len += len(block.text)
            if tail_len >= overlap:
                break
        current = tail
        current_len = tail_len

    for paragraph in paragraphs:
        text_len = len(paragraph.text)
        if text_len > chunk_size * 1.4:
            flush()
            for start in range(0, text_len, max(1, chunk_size - overlap)):
                piece = paragraph.text[start : start + chunk_size]
                if len(piece) >= 80:
                    chunks.append({"text": piece, "page_start": paragraph.page, "page_end": paragraph.page})
            current = []
            current_len = 0
            continue
        if current_len + text_len > chunk_size:
            flush()
        current.append(paragraph)
        current_len += text_len
    flush()
    return chunks


def source_text_path(source: dict[str, Any], extracted_dir: Path) -> Path:
    title = re.sub(r'[\\/:*?"<>|\s]+', "_", source["title"]).strip("_")[:80]
    return extracted_dir / f"{source['id']}_{title}.txt"


def build_for_source(source: dict[str, Any], extracted_dir: Path, chunk_size: int, overlap: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    path = Path(source["file"])
    if source.get("status") != "ok" or not path.exists():
        return [], {"id": source["id"], "title": source["title"], "status": "skipped", "reason": "missing or not ok"}

    if source["kind"] == "pdf":
        blocks = extract_pdf_blocks(path)
    else:
        blocks = extract_html_blocks(path)

    extracted_text = "\n\n".join(f"[page {block.page}]\n{block.text}" if block.page else block.text for block in blocks)
    extracted_text = clean_text(extracted_text)
    out_text_path = source_text_path(source, extracted_dir)
    out_text_path.write_text(extracted_text, encoding="utf-8")

    paragraphs = split_paragraphs(blocks)
    raw_chunks = make_chunks(paragraphs, chunk_size=chunk_size, overlap=overlap)
    chunks = []
    for index, chunk in enumerate(raw_chunks, start=1):
        chunk_id = f"{source['id']}-{index:04d}"
        text = chunk["text"]
        chunks.append(
            {
                "chunk_id": chunk_id,
                "source_id": source["id"],
                "title": source["title"],
                "topic": source["topic"],
                "publisher": source["publisher"],
                "url": source["url"],
                "local_file": source["file"],
                "extracted_text_file": str(out_text_path),
                "page_start": chunk["page_start"],
                "page_end": chunk["page_end"],
                "char_count": len(text),
                "content_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
                "text": text,
            }
        )

    report = {
        "id": source["id"],
        "title": source["title"],
        "status": "ok",
        "blocks": len(blocks),
        "paragraphs": len(paragraphs),
        "chunks": len(chunks),
        "chars": len(extracted_text),
        "extracted_text_file": str(out_text_path),
    }
    return chunks, report


def write_report(reports: list[dict[str, Any]], chunks_path: Path, report_path: Path) -> None:
    total_chunks = sum(item.get("chunks", 0) for item in reports)
    total_chars = sum(item.get("chars", 0) for item in reports)
    lines = [
        "# 知识库切片报告\n",
        f"- JSONL：{chunks_path}\n",
        f"- 总切片数：{total_chunks}\n",
        f"- 抽取字符数：{total_chars}\n",
        "\n|序号|资料|状态|段落数|切片数|字符数|抽取文本|\n",
        "|---|---|---|---:|---:|---:|---|\n",
    ]
    for item in reports:
        lines.append(
            "|{id}|{title}|{status}|{paragraphs}|{chunks}|{chars}|{text_file}|\n".format(
                id=item["id"],
                title=item["title"].replace("|", "\\|"),
                status=item["status"],
                paragraphs=item.get("paragraphs", 0),
                chunks=item.get("chunks", 0),
                chars=item.get("chars", 0),
                text_file=item.get("extracted_text_file", ""),
            )
        )
    report_path.write_text("".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", default="sources.json")
    parser.add_argument("--out-dir", default=".")
    parser.add_argument("--chunk-size", type=int, default=900)
    parser.add_argument("--overlap", type=int, default=120)
    args = parser.parse_args()

    root = Path(args.out_dir).resolve()
    sources = json.loads((root / args.sources).read_text(encoding="utf-8"))
    extracted_dir = root / "extracted_text"
    chunks_dir = root / "chunks"
    extracted_dir.mkdir(exist_ok=True)
    chunks_dir.mkdir(exist_ok=True)

    all_chunks: list[dict[str, Any]] = []
    reports: list[dict[str, Any]] = []
    for source in sources:
        chunks, report = build_for_source(source, extracted_dir, args.chunk_size, args.overlap)
        all_chunks.extend(chunks)
        reports.append(report)
        print(f"{report['id']} {report['status']} {report['title']} -> {report.get('chunks', 0)} chunks", flush=True)

    chunks_path = chunks_dir / "knowledge_chunks.jsonl"
    with chunks_path.open("w", encoding="utf-8") as handle:
        for chunk in all_chunks:
            handle.write(json.dumps(chunk, ensure_ascii=False) + "\n")

    write_report(reports, chunks_path, chunks_dir / "chunk_report.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
