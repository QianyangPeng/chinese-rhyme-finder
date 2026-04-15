"""Source: 宋词三百首 fragments (chinese-poetry). Already 简体, no OpenCC."""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path
from typing import Iterator

from ...types import RawPhrase
from ._utils import cjk_count


SOURCE_NAME = "chinese-poetry/song"
URL = (
    "https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/"
    "master/%E5%AE%8B%E8%AF%8D/%E5%AE%8B%E8%AF%8D%E4%B8%89%E7%99%BE%E9%A6%96.json"
)
CACHE_PATH = Path(__file__).resolve().parents[3] / ".cache" / "ci300.json"
SPLIT_RE = re.compile(r"[，。；、！？：\s]+")
ARCHAIC_PARTICLE = re.compile(r"[兮哉矣乎夫者]")


def _score(text: str) -> float:
    score = 0.7
    n = len(text)
    if n in (4, 5):     score += 0.12
    elif n in (3, 6):   score += 0.06
    elif n == 7:        score += 0.04
    elif n == 2:        score += 0.02
    else:               score -= 0.1
    score += 0.04
    if ARCHAIC_PARTICLE.search(text):
        score -= 0.05
    return max(0.0, min(1.0, score))


def _ensure_cache() -> Path:
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 0:
        return CACHE_PATH
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"[song] downloading {URL}")
    with urllib.request.urlopen(URL) as resp:
        CACHE_PATH.write_bytes(resp.read())
    return CACHE_PATH


def iter_phrases() -> Iterator[RawPhrase]:
    path = _ensure_cache()
    with path.open(encoding="utf-8") as f:
        poems = json.load(f)
    if not isinstance(poems, list):
        return

    seen: set[str] = set()
    for poem in poems:
        paragraphs = poem.get("paragraphs", []) if isinstance(poem, dict) else []
        for line in paragraphs:
            if not isinstance(line, str):
                continue
            for frag in SPLIT_RE.split(line):
                text = frag.strip()
                if not text or text in seen:
                    continue
                if len(text) < 2 or len(text) > 7:
                    continue
                if cjk_count(text) < 2:
                    continue
                quality = _score(text)
                if quality < 0.5:
                    continue
                seen.add(text)
                yield RawPhrase(
                    text=text,
                    language="zh",
                    source=SOURCE_NAME,
                    quality=round(quality, 4),
                    tags=("classical", "poem", "song"),
                )
