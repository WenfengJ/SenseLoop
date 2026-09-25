import base64
import hashlib
import os
import re
from pathlib import Path


DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def save_base64_upload(
    *,
    profile_id: str,
    file_name: str,
    mime_type: str,
    file_base64: str,
    document_type: str,
) -> dict:
    data = _decode_base64_file(file_base64)
    max_bytes = int(os.getenv("LOCAL_FILE_STORAGE_MAX_BYTES", str(DEFAULT_MAX_UPLOAD_BYTES)))
    if len(data) > max_bytes:
        raise ValueError(f"file is too large, max {max_bytes} bytes")

    digest = hashlib.sha256(data).hexdigest()
    extension = _safe_extension(file_name, mime_type)
    safe_profile = _safe_segment(profile_id)
    safe_document_type = _safe_segment(document_type or "document")
    storage_key = f"uploads/{safe_profile}/{safe_document_type}/{digest[:2]}/{digest}{extension}"
    destination = _storage_root() / storage_key
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        destination.write_bytes(data)
    return {
        "storageProvider": "local_disk",
        "storageKey": storage_key,
        "sha256": digest,
        "byteSize": len(data),
        "mimeType": mime_type or "application/octet-stream",
        "fileName": file_name,
    }


def _storage_root() -> Path:
    configured = os.getenv("LOCAL_FILE_STORAGE_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[2] / ".local"


def _decode_base64_file(file_base64: str) -> bytes:
    clean = file_base64.split(",", 1)[1] if "," in file_base64[:100] else file_base64
    return base64.b64decode(clean, validate=False)


def _safe_segment(value: str) -> str:
    segment = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip())
    return segment.strip("-")[:120] or "unknown"


def _safe_extension(file_name: str, mime_type: str) -> str:
    suffix = Path(file_name).suffix.lower()
    if re.fullmatch(r"\.[a-z0-9]{1,12}", suffix):
        return suffix
    if mime_type == "application/pdf":
        return ".pdf"
    if mime_type == "image/jpeg":
        return ".jpg"
    if mime_type == "image/png":
        return ".png"
    if mime_type == "image/webp":
        return ".webp"
    return ".bin"
