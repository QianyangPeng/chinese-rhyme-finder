"""Source: 漢語網路用語 category on zh.wiktionary (CC-BY-SA).

Titles are 繁體 — convert to 简体 via OpenCC. These entries fill the
modern / meme / internet slang gap in our otherwise idiom-heavy corpus.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path
from typing import Iterator

from opencc import OpenCC

from ...types import RawPhrase
from ._utils import cjk_count


SOURCE_NAME = "wiktionary-slang"
URL = (
    "https://zh.wiktionary.org/w/api.php?action=query&list=categorymembers"
    "&cmtitle=Category:%E6%BC%A2%E8%AA%9E%E7%B6%B2%E8%B7%AF%E7%94%A8%E8%AA%9E"
    "&cmlimit=500&format=json"
)
CACHE_PATH = Path(__file__).resolve().parents[3] / ".cache" / "wiktionary-slang.json"

FILLER_STARTS = ("的", "了", "是", "就", "也", "又", "还", "都")
TRAILING_PARTICLE = re.compile(r"[了啊呢吗的呀]$")

_cc = OpenCC("tw2s")


def _score(text: str) -> float:
    score = 0.72
    n = len(text)
    if n in (3, 4):     score += 0.12
    elif n in (2, 5):   score += 0.08
    elif n == 6:        score += 0.04
    elif n == 7:        score += 0.02
    else:               score -= 0.1
    if text.startswith(FILLER_STARTS):              score -= 0.08
    if TRAILING_PARTICLE.search(text) and n <= 3:   score -= 0.12
    return max(0.0, min(1.0, score))


def _ensure_cache() -> Path:
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 0:
        return CACHE_PATH
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"[slang] downloading {URL}")
    with urllib.request.urlopen(URL) as resp:
        CACHE_PATH.write_bytes(resp.read())
    return CACHE_PATH


def iter_phrases() -> Iterator[RawPhrase]:
    path = _ensure_cache()
    with path.open(encoding="utf-8") as f:
        raw = json.load(f)
    members = (raw.get("query") or {}).get("categorymembers") or []

    seen: set[str] = set()
    for m in members:
        title = (m.get("title") or "").strip()
        if not title:
            continue
        if cjk_count(title) < 2:
            continue
        text = _cc.convert(title).strip()
        if not text or text in seen:
            continue
        if len(text) < 2 or len(text) > 8:
            continue
        quality = _score(text)
        if quality < 0.55:
            continue
        seen.add(text)
        yield RawPhrase(
            text=text,
            language="zh",
            source=SOURCE_NAME,
            quality=round(quality, 4),
            tags=("modern", "slang", "wiktionary"),
        )
