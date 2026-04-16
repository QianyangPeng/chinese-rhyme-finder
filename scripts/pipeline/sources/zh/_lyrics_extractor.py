"""Shared lyrics line → phrase extractor.

Unlike _ngram_extractor (designed for noisy freq-based mining of large
corpora like OpenSubtitles), this module handles CURATED creative content
where every line is intentional. No frequency threshold is needed —
a phrase appearing once in a published song is already "attested."

Flow:
  1. Split each lyrics line on punctuation → CJK-only fragments
  2. Filter to 2–8 char fragments
  3. Score by POS content density (lyrics naturally have high density)
  4. Deduplicate by text (same phrase from different songs → keep one)
  5. Yield RawPhrases
"""

from __future__ import annotations

import re
import sys
from typing import Iterator, Iterable

import jieba
import jieba.posseg as pseg
from opencc import OpenCC

from ...types import RawPhrase

# Normalize traditional → simplified (some lyrics have mixed 繁简).
_cc_t2s = OpenCC("t2s")

jieba.setLogLevel(40)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Split lyrics lines on any non-CJK char (punctuation, spaces, English, etc.)
_NON_CJK = re.compile(r"[^\u4e00-\u9fff\u3400-\u4dbf]+")

# Content POS families — used for quality scoring.
_CONTENT_POS = frozenset({
    "n", "nr", "ns", "nt", "nz", "nrt", "nl",
    "v", "vn", "vd",
    "a", "ad", "an",
    "i", "l", "t", "s", "z",
})

# Edge particles that ruin phrase boundaries.
_EDGE_PARTICLES = set("的了啊呢吗呀哦哈嗯啦哒噢喔嘛")


# ---------------------------------------------------------------------------
# Quality scoring
# ---------------------------------------------------------------------------

def _score_fragment(text: str) -> float:
    """Score a lyrics fragment by POS content density + length.

    Base quality is higher than OpenSubtitles (0.75 vs 0.55) because
    lyrics are pre-curated creative content. We still penalize
    function-word-heavy fragments.
    """
    if not text or len(text) < 2:
        return 0.0

    # Edge particle check
    if text[0] in _EDGE_PARTICLES or text[-1] in _EDGE_PARTICLES:
        return 0.0

    # POS analysis
    tokens = list(pseg.cut(text))
    if not tokens:
        return 0.0

    content_count = sum(1 for _, pos in tokens if pos in _CONTENT_POS)
    content_ratio = content_count / len(tokens) if tokens else 0

    # Must have at least one content word
    if content_count == 0:
        return 0.0

    # Base score: lyrics get a generous base
    score = 0.75

    # Content density bonus
    score += content_ratio * 0.15  # max +0.15 at 100% content

    # Length sweet spot: 3-5 chars optimal for rhyme clusters
    n = len(text)
    if n in (3, 4):
        score += 0.08
    elif n in (2, 5):
        score += 0.04
    elif n in (6, 7, 8):
        score += 0.0
    else:
        score -= 0.1

    # Repeated-char penalty (e.g., "爱爱爱" from chorus)
    unique_ratio = len(set(text)) / len(text)
    if unique_ratio < 0.6:
        score -= 0.2

    return max(0.0, min(1.0, score))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_lyrics_phrases(
    line_iterator: Iterable[str],
    *,
    source: str,
    tags: tuple[str, ...],
    min_length: int = 2,
    max_length: int = 8,
    min_quality: float = 0.65,
) -> Iterator[RawPhrase]:
    """Extract rhyme-worthy phrases from lyrics lines.

    Parameters
    ----------
    line_iterator
        Yields one lyrics line per call (may contain punctuation, English,
        whitespace — all stripped during extraction).
    source
        Source label, e.g. "lyrics-hiphop" or "lyrics-pop".
    tags
        Tag tuple, e.g. ("hiphop", "lyrics", "rap").
    min_length, max_length
        Character count range for extracted fragments.
    min_quality
        Floor quality to emit. Default 0.65 (generous for curated content).
    """
    seen: set[str] = set()
    total_lines = 0
    emitted = 0

    for raw_line in line_iterator:
        total_lines += 1
        line = _cc_t2s.convert(raw_line)
        # Split on non-CJK → CJK-only fragments
        for fragment in _NON_CJK.split(line):
            text = fragment.strip()
            if not text or len(text) < min_length or len(text) > max_length:
                continue
            if text in seen:
                continue

            quality = _score_fragment(text)
            if quality < min_quality:
                continue

            seen.add(text)
            emitted += 1
            yield RawPhrase(
                text=text,
                language="zh",
                source=source,
                quality=round(quality, 4),
                tags=tags,
            )

    print(
        f"[{source}] {total_lines:,} lines → {emitted:,} phrases "
        f"({len(seen):,} unique)",
        file=sys.stderr,
    )
