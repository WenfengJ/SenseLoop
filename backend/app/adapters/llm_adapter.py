import json
import os
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.config import load_local_env

load_local_env()


@dataclass
class LlmResult:
    content: str
    model: str
    provider: str
    raw: dict[str, Any]


class LlmNotConfiguredError(RuntimeError):
    pass


class LlmCallError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY"))


def config_status() -> dict[str, Any]:
    return {
        "configured": is_configured(),
        "provider": os.environ.get("AI_PROVIDER", "deepseek"),
        "baseUrl": _base_url(),
        "model": _model(),
    }


def chat_completion(messages: list[dict[str, str]], *, temperature: float = 0.35, max_tokens: int = 900) -> LlmResult:
    api_key = os.environ.get("DEEPSEEK_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise LlmNotConfiguredError("DEEPSEEK_API_KEY or OPENAI_API_KEY is required")

    model = _model()
    request_body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    request = urllib.request.Request(
        f"{_base_url().rstrip('/')}/chat/completions",
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=float(os.environ.get("AI_TIMEOUT_SECONDS", "25")),
            context=_ssl_context(),
        ) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise LlmCallError(f"LLM HTTP {exc.code}: {body[:500]}") from exc
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise LlmCallError(str(exc)) from exc

    content = _extract_content(raw)
    if not content:
        raise LlmCallError("LLM response did not include assistant content")

    return LlmResult(
        content=content,
        model=raw.get("model") or model,
        provider=os.environ.get("AI_PROVIDER", "deepseek"),
        raw=raw,
    )


def polish_report(report: dict) -> dict:
    if not is_configured():
        return report
    try:
        result = chat_completion(
            [
                {"role": "system", "content": "你是 SenseLoop 健康日报编辑，只润色表达，不新增诊断结论。"},
                {"role": "user", "content": json.dumps(report, ensure_ascii=False)},
            ],
            max_tokens=700,
        )
    except (LlmNotConfiguredError, LlmCallError):
        return report
    return {**report, "aiPolishedText": result.content, "aiModel": result.model}


def _base_url() -> str:
    return os.environ.get("OPENAI_BASE_URL") or os.environ.get("DEEPSEEK_BASE_URL") or "https://api.deepseek.com"


def _model() -> str:
    return os.environ.get("OPENAI_MODEL") or os.environ.get("DEEPSEEK_MODEL") or "deepseek-chat"


def _extract_content(raw: dict[str, Any]) -> str:
    choices = raw.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    return content.strip() if isinstance(content, str) else ""


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()
