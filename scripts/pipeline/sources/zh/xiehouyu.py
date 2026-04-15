"""Source: 歇后语 answer-halves from pwxcoo/chinese-xinhua.

Entries have {riddle, answer} — we take the answer, split on ；/;/、
(multi-alternative answers), filter to 2-7 chars, and score.

These are colloquial image-heavy phrases that slot naturally into rap
lines, unlike 成语 which read as literary.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path
from typing import Iterator

from ...types import RawPhrase
from ._utils import cjk_count


SOURCE_NAME = "xinhua-xiehouyu"
URL = (
    "https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/"
    "master/data/xiehouyu.json"
)
CACHE_PATH = Path(__file__).resolve().parents[3] / ".cache" / "xinhua-xiehouyu.json"

FILLER_STARTS = ("的", "了", "是", "就", "也", "又", "还", "都")
TRAILING_PARTICLE = re.compile(r"[了啊呢吗的呀]$")
VIVID_VERB = re.compile(r"[打击踢杀拍抱喊笑哭骂吃吹]")


def _score(text: str) -> float:
    score = 0.55
    n = len(text)
    if n == 4:          score += 0.14
    elif n in (3, 5):   score += 0.1
    elif n == 2:        score += 0.05
    elif n == 6:        score += 0.02
    else:               score -= 0.1
    if text.startswith(FILLER_STARTS):              score -= 0.1
    if TRAILING_PARTICLE.search(text) and n <= 3:   score -= 0.15
    if VIVID_VERB.search(text):                     score += 0.03
    return max(0.0, min(1.0, score))


def _ensure_cache() -> Path:
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 0:
        return CACHE_PATH
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"[xiehouyu] downloading {URL}")
    with urllib.request.urlopen(URL) as resp:
        CACHE_PATH.write_bytes(resp.read())
    return CACHE_PATH


def iter_phrases() -> Iterator[RawPhrase]:
    path = _ensure_cache()
    with path.open(encoding="utf-8") as f:
        entries = json.load(f)

    seen: set[str] = set()
    for entry in entries:
        raw_answer = (entry.get("answer") or "").strip()
        if not raw_answer:
            continue
        for part in re.split(r"[;；、]", raw_answer):
            text = part.strip()
            if not text or text in seen:
                continue
            if cjk_count(text) < 2:
                continue
            if len(text) < 2 or len(text) > 7:
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
                tags=("xiehouyu", "colloquial"),
            )
