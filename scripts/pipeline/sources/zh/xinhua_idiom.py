"""Source: xinhua 成语 dataset (~30k entries, MIT licensed).

Upstream: https://github.com/pwxcoo/chinese-xinhua

The cached file at scripts/.cache/xinhua-idiom.json is a JSON array
of entries with fields {word, pinyin, explanation, derivation, example}.
We re-use the cache to avoid network dependency during build.

Scoring formula ported verbatim from scripts/build_lexicon.mjs
(`scoreIdiom`): favors 4-char canonical length, substantive explanations,
modern examples, and well-known derivations; penalizes archaic chars
and unusual lengths.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path
from typing import Iterator

from ...types import RawPhrase


# ---------------------------------------------------------------------------
# Constants — ported from build_lexicon.mjs
# ---------------------------------------------------------------------------

SOURCE_NAME = "xinhua-idiom"
XINHUA_URL = (
    "https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/"
    "master/data/idiom.json"
)
CACHE_PATH = Path(__file__).resolve().parents[3] / ".cache" / "xinhua-idiom.json"

# Archaic / pejorative / obscure chars — strong downweight. Expanded to
# cover chars found in top-ranked clusters that nobody recognizes:
# 鸱 犊 谡 挹 匍 俟 蠹 茹 鹢 觞 衢 涂(archaic 途) 蔬(archaic in 弊衣蔬食)
ARCHAIC_CHARS = re.compile(
    r"[鄙贱陋妓妾奴孽蛮夷虏俎胄嫔樽觞圭彘牝牡虺蠡鹢鸱髫髭髦髻"
    r"犊谡挹匍俟蠹茹涂蔬鹬蚌鳖鹄鸢鸩鸮鸨鸪鸫鸬鸲鸳鸵鸶鸷鸸鸹鸺鸻"
    r"膑髡黥劓笞箠殛殄殁殇殉殚殡殪殣殂戮馘豸獬]"
)
# Common only-in-archaic-idioms (light penalty).
LIGHT_ARCHAIC = re.compile(r"[酋囹圄鞋匏彝觥蠖衢邙薨崩亡觯觚箸簋簠]")

# Well-known classical sources → familiar idioms.
KNOWN_SOURCES = (
    "论语", "孟子", "庄子", "老子", "韩非子", "史记", "左传",
    "战国策", "三国志", "世说新语", "红楼梦", "水浒", "三国演义",
    "西游记", "金瓶梅", "儒林外史", "聊斋", "唐诗", "宋词",
    "毛泽东", "鲁迅", "毛主席", "现代汉语",
)


def _cjk_count(text: str) -> int:
    """Count CJK ideographs only (excludes punctuation, Latin, numerals)."""
    n = 0
    for ch in text:
        cp = ord(ch)
        if 0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF:
            n += 1
    return n


def _score(entry: dict) -> float:
    """Quality score in [0, 1]. Direct port of scoreIdiom in build_lexicon.mjs."""
    score = 0.6
    text = entry.get("word", "") or ""
    n = len(text)

    # Length preference
    if n == 4:      score += 0.15
    elif n == 3:    score += 0.05
    elif n == 5:    score += 0.02
    elif n == 6:    score -= 0.05
    else:           score -= 0.15

    explanation = entry.get("explanation", "") or ""
    if len(explanation) > 30:  score += 0.08
    elif len(explanation) > 10: score += 0.04
    else:                       score -= 0.1

    if len(entry.get("example", "") or "") > 10:
        score += 0.1

    derivation = entry.get("derivation", "") or ""
    if any(src in derivation for src in KNOWN_SOURCES):
        score += 0.05

    if ARCHAIC_CHARS.search(text):
        score -= 0.25
    elif LIGHT_ARCHAIC.search(text):
        score -= 0.1

    return max(0.0, min(1.0, score))


def _ensure_cache() -> Path:
    """Download data if not cached. Idempotent."""
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 0:
        return CACHE_PATH
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"[xinhua-idiom] downloading {XINHUA_URL}")
    with urllib.request.urlopen(XINHUA_URL) as resp:
        CACHE_PATH.write_bytes(resp.read())
    return CACHE_PATH


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _dedup_near_variants(phrases: list[RawPhrase]) -> list[RawPhrase]:
    """Remove near-duplicate idiom variants that differ by exactly 1 character.

    Uses a wildcard-pattern approach: for each phrase, replace each
    character position with a sentinel → hash → group. Phrases sharing
    any pattern are 1-edit variants.

    O(n * k) where k = max phrase length. Replaces the O(n²) pairwise
    approach that took 10+ minutes on 28k idioms.

    Groups are transitive: if A≈B and B≈C, {A,B,C} are one group.
    """
    import sys
    n = len(phrases)

    # Union-Find
    parent = list(range(n))
    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def union(x: int, y: int) -> None:
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry

    # Build wildcard patterns: for each phrase, generate k patterns
    # (one per character position). Phrases sharing a pattern are 1-edit.
    pattern_to_first: dict[str, int] = {}
    for i, p in enumerate(phrases):
        chars = list(p.text)
        for pos in range(len(chars)):
            original = chars[pos]
            chars[pos] = '\x00'   # sentinel
            pattern = ''.join(chars)
            chars[pos] = original  # restore

            if pattern in pattern_to_first:
                union(i, pattern_to_first[pattern])
            else:
                pattern_to_first[pattern] = i

    # For each group, keep only the highest-quality member.
    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    kept: list[RawPhrase] = []
    dropped = 0
    for members in groups.values():
        if len(members) == 1:
            kept.append(phrases[members[0]])
        else:
            members.sort(key=lambda i: -phrases[i].quality)
            kept.append(phrases[members[0]])
            dropped += len(members) - 1

    if dropped:
        print(f"[xinhua-idiom] deduped {dropped} near-variant idioms", file=sys.stderr)
    return kept


def iter_phrases() -> Iterator[RawPhrase]:
    """Yield one RawPhrase per valid xinhua idiom (near-variants deduped)."""
    path = _ensure_cache()
    with path.open(encoding="utf-8") as f:
        entries = json.load(f)

    raw: list[RawPhrase] = []
    for entry in entries:
        text = (entry.get("word") or "").strip()
        if not text:
            continue
        if _cjk_count(text) < 2:
            continue
        if len(text) > 15:
            continue

        quality = _score(entry)
        raw.append(RawPhrase(
            text=text,
            language="zh",
            source=SOURCE_NAME,
            quality=round(quality, 4),
            tags=("idiom", "xinhua"),
        ))

    yield from _dedup_near_variants(raw)


if __name__ == "__main__":
    import sys
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
    phrases = list(iter_phrases())
    print(f"Yielded {len(phrases)} xinhua idioms")
    # Peek at top-quality and bottom-quality samples
    phrases.sort(key=lambda p: -p.quality)
    print("\nTop 5 by quality:")
    for p in phrases[:5]:
        print(f"  {p.quality:.4f}  {p.text}")
    print("\nBottom 5:")
    for p in phrases[-5:]:
        print(f"  {p.quality:.4f}  {p.text}")
