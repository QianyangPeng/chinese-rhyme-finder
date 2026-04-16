"""Reusable n-gram miner over a stream of Chinese text lines.

This is the engine for ingesting BIG corpora (OpenSubtitles, future Weibo
dumps, future rap lyric archives, Wikipedia intro sentences). Each new
big corpus only needs to provide a `line_iterator` — everything else
(n-gram counting, POS scoring, dedup) is shared.

## Why n-gram over "generate combinations"

Generating combinations from 30k words is O(n²) and produces mostly
nonsense phrases ("蓝色严谨" is grammatical but meaningless). Extracting
frequent n-grams from real-world text gives us phrases that **some
human already wrote**, so fluency is guaranteed by construction.

## Algorithm

1. **Stream lines**, split each on punctuation into CJK-only runs.
2. **Char-level n-gram counting**: for each run, emit every substring
   of length [min_len, max_len]. Use a Counter with periodic pruning
   so memory stays bounded even on 20M-line corpora.
3. **Filter by min_count** → only n-grams that recur are kept. This
   kills typos, cross-word garbage, one-off collocations.
4. **POS-tag survivors with jieba**, compute a quality score:
   - Must not start/end on a particle (的/了/啊/呢/吗/呢).
   - Must contain at least one content-word (n/v/a/nr/ns).
   - Penalty if dominated by single-char function words.
5. **Dedupe** against existing corpora (pass `skip_texts` to exclude).
6. **Top-K by count * quality**, emit as RawPhrase.

## Tuning knobs

- `min_count`: higher = fewer, higher-quality phrases (default 20).
- `min_length` / `max_length`: char-count window (default 2-6).
- `max_output`: cap final phrases. Default 50k.
"""

from __future__ import annotations

import re
import sys
import time
from collections import Counter
from typing import Iterator, Iterable

import jieba
import jieba.posseg as pseg

from ...types import RawPhrase


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Chars that cannot appear inside a phrase we'd consider extracting.
# Splitting on these leaves clean CJK-only runs to n-gram over.
_NON_PHRASE = re.compile(
    r"[^\u4e00-\u9fff\u3400-\u4dbf]+"   # anything NOT CJK ideograph
)

# Particles that look fine mid-phrase but ruin phrase boundaries.
_EDGE_PARTICLES = set("的了啊呢吗呀哦哈嗯啦哒噢喔嘛")

# POS families considered "content words" (rap-friendly).
_CONTENT_POS = {
    "n", "nr", "ns", "nt", "nz", "nrt", "nl",           # nouns
    "v", "vn", "vd",                                     # verbs
    "a", "ad", "an",                                     # adjectives
    "i",                                                 # idiom-ish
    "l",                                                 # fixed expressions
    "t",                                                 # time words
    "s",                                                 # place words
    "z",                                                 # descriptives
}

# Chars over-represented in transliterated foreign names but rare in
# native Chinese vocabulary. Used to downweight "李波斯基"-style entries
# that jieba tags as `nr` but aren't useful rap vocab.
_TRANSLIT_CHARS = set(
    "斯基尔弗莱拉维尤兰斐夫娜丽雅诺西蒂纳德夏菲洛耶雷卡贝罗"
    "索欧克朗波吉约翰亚历山卓瓦戈菲尔波泰萨"
    "吉米乔迪马格汤姆哈亨凯皮琳莎朵斯托杜邦"
)

# Subtitle-format artifacts. These appear in SRT/ASS files — not text.
_SUBTITLE_ARTIFACTS = {
    "方正黑体简体", "方正黑体", "方正宋体简体", "方正宋体",
    "华文中宋", "华文楷体", "华文行楷", "微软雅黑",
    "宋体简体", "字幕组", "翻译", "校对", "压制", "特效",
    "人人影视", "破烂熊", "伊甸园",
    # Specific high-frequency artifacts found in top clusters:
    "字幕译制", "字幕翻译", "字幕制作",
}

# Honorific suffixes: when preceded by a person-name POS, the whole
# phrase is just "ForeignName先生" — not useful rap vocabulary.
_HONORIFIC_SUFFIXES = {"先生", "女士", "太太", "小姐", "夫人", "大人"}

# Prune Counter every N lines to keep memory bounded: drop items with count=1.
_PRUNE_EVERY = 500_000


# Quiet jieba's chatty startup.
jieba.setLogLevel(40)


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def _split_cjk_runs(line: str) -> list[str]:
    """Split a line on any non-CJK char, returning CJK-only runs."""
    runs = _NON_PHRASE.split(line)
    return [r for r in runs if len(r) >= 2]


def _is_all_cjk(text: str) -> bool:
    for ch in text:
        cp = ord(ch)
        if not (0x4e00 <= cp <= 0x9fff or 0x3400 <= cp <= 0x4dbf):
            return False
    return bool(text)


def _count_ngrams(
    line_iter: Iterable[str],
    *,
    min_length: int,
    max_length: int,
    max_lines: int | None,
) -> Counter[str]:
    """Word-aware n-gram counting: generates only n-grams that align with
    jieba word boundaries. This eliminates cross-word garbage like '众们'
    (from '观众们/拍手') or '维打' (from '降维/打击').

    Uses jieba.cut (no POS) per line for speed — ~3-5x faster than
    jieba.posseg.cut. POS tagging happens later, only on min_count
    survivors.
    """
    counts: Counter[str] = Counter()
    seen_lines = 0
    start = time.time()

    for line in line_iter:
        if max_lines is not None and seen_lines >= max_lines:
            break
        seen_lines += 1

        # First peel off non-CJK to avoid running jieba on garbage
        for run in _split_cjk_runs(line):
            if len(run) < min_length:
                continue
            # Segment this CJK-only run
            words = list(jieba.cut(run, HMM=True))
            n_words = len(words)

            # Generate all contiguous word sub-sequences with total char
            # length in [min_length, max_length]. O(W^2) per line, but W
            # is small (~5-20 per dialogue line), so fast.
            for i in range(n_words):
                total = 0
                for j in range(i, n_words):
                    total += len(words[j])
                    if total > max_length:
                        break
                    if total < min_length:
                        continue
                    text = "".join(words[i : j + 1])
                    if _is_all_cjk(text):
                        counts[text] += 1

        # Periodic pruning: drop count==1 items so memory doesn't blow up.
        if seen_lines % _PRUNE_EVERY == 0:
            before = len(counts)
            counts = Counter({k: v for k, v in counts.items() if v >= 2})
            elapsed = time.time() - start
            print(
                f"[ngram] {seen_lines:,} lines · {elapsed:.0f}s · "
                f"{before:,} → {len(counts):,} unique after prune",
                file=sys.stderr,
            )

    elapsed = time.time() - start
    print(
        f"[ngram] done: {seen_lines:,} lines in {elapsed:.0f}s · "
        f"{len(counts):,} unique n-grams",
        file=sys.stderr,
    )
    return counts


def _is_phrasey(text: str, pos_seq: list[tuple[str, str]]) -> bool:
    """Reject obvious non-phrases before scoring. Cheap cutoffs."""
    if not pos_seq:
        return False
    # Subtitle format / credits metadata.
    if text in _SUBTITLE_ARTIFACTS:
        return False
    # Repetitive-char gibberish: '不不不不', '哈哈哈哈' etc.
    # If >50% of chars are the same single character, it's not a phrase.
    from collections import Counter as _C
    char_counts = _C(text)
    if char_counts.most_common(1)[0][1] / len(text) > 0.5:
        return False
    # Honorific template: X先生/女士/太太 where X is a person name → skip.
    if len(pos_seq) >= 2:
        last_word = pos_seq[-1][0]
        second_last_pos = pos_seq[-2][1]
        if last_word in _HONORIFIC_SUFFIXES and second_last_pos in ("nr", "nrt", "ns", "nz"):
            return False
    # No edge particles.
    if text[0] in _EDGE_PARTICLES or text[-1] in _EDGE_PARTICLES:
        return False
    # Must contain at least one content-word token.
    if not any(pos in _CONTENT_POS for _, pos in pos_seq):
        return False
    # Disallow text made entirely of single-char tokens (= cross-word garbage).
    if all(len(tok) == 1 for tok, _ in pos_seq):
        return False
    # Two gates for foreign / specific-entity names common in subtitle corpora:
    # (a) Transliteration-heavy chars + proper-noun POS = foreign name.
    translit_ratio = sum(1 for ch in text if ch in _TRANSLIT_CHARS) / len(text)
    is_proper_noun = any(pos in ("nr", "ns", "nrt", "nz") for _, pos in pos_seq)
    if translit_ratio >= 0.4 and is_proper_noun:
        return False
    # (b) Single-token ns/nr/nrt of length ≥ 4 is almost always a specific
    # place/person name (里约热内卢, 麦斯威尔). Rap benefits from generic
    # 2-3 char names (姜维, 孔明) but specific 4+ char entities dilute.
    if len(pos_seq) == 1:
        single_pos = pos_seq[0][1]
        if single_pos in ("ns", "nr", "nrt", "nz") and len(text) >= 4:
            return False
    return True


def _quality_score(text: str, count: int, pos_seq: list[tuple[str, str]]) -> float:
    """Phrase-likeness score in [0, 1]. Combines:
      * log-frequency (cap at 0.5 so rare-but-phrasey isn't buried)
      * POS sequence shape bonus
      * length bonus (3-5 chars are rap sweet spot)
    """
    import math

    # Frequency: log-scaled, saturates
    freq = min(0.5, math.log10(count) / 6.0)  # count=10^6 → 0.5

    # Length bonus
    n = len(text)
    if   n in (3, 4):  len_bonus = 0.15
    elif n in (2, 5):  len_bonus = 0.10
    elif n == 6:       len_bonus = 0.05
    else:              len_bonus = 0.0

    # POS shape bonus — favor sequences with content-words at the edges,
    # especially the tail (rap lines land on content, not particles).
    last_pos = pos_seq[-1][1]
    first_pos = pos_seq[0][1]
    shape = 0.0
    if last_pos in _CONTENT_POS:  shape += 0.12
    if first_pos in _CONTENT_POS: shape += 0.08
    if last_pos in ("n", "nr", "ns", "nz"):   shape += 0.05   # noun tail bonus

    # Penalties
    if len(pos_seq) == 1 and pos_seq[0][0] == text:
        # Whole thing is one jieba token — likely already a dictionary word.
        # Give a modest bonus: these are the "safest" bets.
        shape += 0.08

    # Count of single-char tokens penalty
    single_ratio = sum(1 for tok, _ in pos_seq if len(tok) == 1) / len(pos_seq)
    if single_ratio > 0.5:
        shape -= 0.15

    score = 0.3 + freq + len_bonus + shape
    return max(0.0, min(1.0, score))


def _tag_and_score(
    counts: Counter[str],
    *,
    min_count: int,
    skip_texts: set[str],
) -> Iterator[tuple[str, float, int, tuple[str, ...]]]:
    """POS-tag each surviving n-gram, compute quality, filter, yield."""
    for text, count in counts.items():
        if count < min_count:
            continue
        if text in skip_texts:
            continue

        pos_seq = [(t.word, t.flag) for t in pseg.cut(text)]
        if not _is_phrasey(text, pos_seq):
            continue

        quality = _quality_score(text, count, pos_seq)
        if quality < 0.55:
            continue

        # POS tuple hashable for output
        pos_tags = tuple(p for _, p in pos_seq)
        yield text, quality, count, pos_tags


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def mine_ngrams(
    line_iterator: Iterable[str],
    *,
    source: str,
    tags: tuple[str, ...],
    min_length: int = 2,
    max_length: int = 6,
    min_count: int = 20,
    max_output: int = 50_000,
    max_lines: int | None = None,
    skip_texts: set[str] | None = None,
) -> Iterator[RawPhrase]:
    """Mine phrase-like n-grams from a stream of Chinese lines.

    Parameters
    ----------
    line_iterator
        Yields raw text lines (each may be a whole sentence or a chunk).
    source
        Source label stamped on each output phrase, e.g. "opensubtitles-zh".
    tags
        Tag tuple attached to each output phrase, e.g. ("opensubs","modern").
    min_length, max_length
        Character-count window for candidates. Default 2-6.
    min_count
        Minimum occurrence count to survive. Default 20. Higher = fewer +
        higher-quality phrases.
    max_output
        Cap on the number of RawPhrase objects yielded.
    max_lines
        Cap on input lines processed (for sampling / testing).
    skip_texts
        Set of texts to exclude (e.g., already in another corpus).
    """
    skip = skip_texts or set()

    # Pass 1: count
    counts = _count_ngrams(
        line_iterator,
        min_length=min_length,
        max_length=max_length,
        max_lines=max_lines,
    )

    # Pass 2: POS-tag + score + filter
    candidates = list(
        _tag_and_score(counts, min_count=min_count, skip_texts=skip)
    )
    # free memory before sorting
    del counts

    # Sort by quality desc, then count desc, tie-break by length preference
    candidates.sort(key=lambda c: (-c[1], -c[2], len(c[0])))
    print(
        f"[ngram] kept {len(candidates):,} phrases after POS+quality filter",
        file=sys.stderr,
    )

    for text, quality, count, pos_tags in candidates[:max_output]:
        yield RawPhrase(
            text=text,
            language="zh",
            source=source,
            quality=round(quality, 4),
            tags=tags + (f"freq:{count}",),   # keep freq as a debug-visible tag
        )
