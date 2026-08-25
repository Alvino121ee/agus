"""DeepSeek client (OpenAI-compatible). Never exposed to frontend.

If DEEPSEEK_API_KEY is not set, callers fall back to the deterministic
rule-based simulation implemented in agents.py so the pipeline still runs
end-to-end. The moment a valid key is added to backend/.env, real DeepSeek
JSON output is used automatically.
"""
import os
import json
import time
import logging
import httpx

logger = logging.getLogger("deepseek")

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat").strip() or "deepseek-chat"
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip()


def is_live() -> bool:
    return bool(DEEPSEEK_API_KEY)


def status() -> dict:
    return {
        "connected": is_live(),
        "model": DEEPSEEK_MODEL,
        "base_url": DEEPSEEK_BASE_URL,
        "mode": "LIVE_AI" if is_live() else "SIMULATION",
    }


async def chat_json(system_prompt: str, user_prompt: str, temperature: float = 0.3) -> dict:
    """Call DeepSeek chat completions requesting a JSON object.

    Returns {"data": <parsed json>, "tokens": int, "latency_ms": int}.
    Raises RuntimeError when no key configured so callers use the fallback.
    """
    if not is_live():
        raise RuntimeError("DEEPSEEK_API_KEY not configured")

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
    }
    start = time.time()
    async with httpx.AsyncClient(timeout=60.0) as http:
        resp = await http.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions", json=payload, headers=headers
        )
        resp.raise_for_status()
        body = resp.json()
    latency_ms = int((time.time() - start) * 1000)
    content = body["choices"][0]["message"]["content"]
    tokens = body.get("usage", {}).get("total_tokens", 0)
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        start_i = content.find("{")
        end_i = content.rfind("}")
        data = json.loads(content[start_i : end_i + 1])
    return {"data": data, "tokens": tokens, "latency_ms": latency_ms}
