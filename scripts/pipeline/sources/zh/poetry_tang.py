"""Source: 唐诗三百首 fragments from chinese-poetry/chinese-poetry.

Each poem has `paragraphs: list[str]`; we split each line on punctuation
and yield 2-7 char fragments. Tang file uses 繁體 — run through OpenCC.
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


SOURCE_NAME = "chinese-poetry/tang"
URL = (
    "https://raw.githubusercontent.com/chinese-poetry/chinese-poetry/"
    "master/%E8%92%99%E5%AD%A6/tangshisanbaishou.json"
)
CACHE_PATH = Path(__file__).resolve().parents[3] / ".cache" / "tangshi300.json"
SPLIT_RE = re.compile(r"[，。；、！？：\s]+")
ARCHAIC_PARTICLE = re.compile(r"[兮哉矣乎夫者]")

_cc = OpenCC("tw2s")


def _score(text: str) -> float:
    score = 0.7
    n = len(text)
    if n in (4, 5):     score += 0.12
    elif n in (3, 6):   score += 0.06
    elif n == 7:        score += 0.04
    elif n == 2:        score += 0.02
    else:               score -= 0.1
    score += 0.04                         # anthology bonus
    if ARCHAIC_PARTICLE.search(text):
        score -= 0.05
    return max(0.0, min(1.0, score))


def _ensure_cache() -> Path:
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 0:
        return CACHE_PATH
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"[tang] downloading {URL}")
    with urllib.request.urlopen(URL) as resp:
        CACHE_PATH.write_bytes(resp.read())
    return CACHE_PATH


def _walk_poems(node) -> Iterator[dict]:
    """Tang file nests by poem type: data.content = [{type, content: [poems]}, ...]
    where each poem has `paragraphs`. Walk recursively to find all poems."""
    if isinstance(node, dict):
        if "paragraphs" in node:
            yield node
        else:
            for v in node.values():
                yield from _walk_poems(v)
    elif isinstance(node, list):
        for item in node:
            yield from _walk_poems(item)


def iter_phrases() -> Iterator[RawPhrase]:
    path = _ensure_cache()
    with path.open(encoding="utf-8") as f:
        root = json.load(f)

    seen: set[str] = set()
    for poem in _walk_poems(root):
        paragraphs = poem.get("paragraphs", []) if isinstance(poem, dict) else []
        for line in paragraphs:
            if not isinstance(line, str):
                continue
            simplified = _cc.convert(line)
            for frag in SPLIT_RE.split(simplified):
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
                    tags=("classical", "poem", "tang"),
                )
