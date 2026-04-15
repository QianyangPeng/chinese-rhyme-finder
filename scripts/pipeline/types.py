"""Shared dataclasses used across the pipeline.

Stages produce/consume these dataclasses. The final `EnrichedPhrase` is
what gets serialized into `static/data/lexicon.json` and matches the
TypeScript `PhraseRecord` shape at the far end.

Schema is **language-agnostic**: the algorithm layer (Discover miner,
Search, Analyze) only needs `rhyme_keys` and is completely unaware of
what language the phrase is in. Each language plugin (phonology +
tagger + source) fills the fields its own way:

  zh  →  syllables = pinyin-with-tone, rhyme_keys = final[+tone], tones set
  en  →  syllables = ARPABET/IPA, rhyme_keys = vowel+coda of last stress, stress set
  ja  →  syllables = mora, rhyme_keys = last mora (+ 2nd-to-last)
  ko  →  syllables = hangul, rhyme_keys = 중성+종성 of last syllable
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Literal


Language = Literal["zh", "en", "ja", "ko"]


@dataclass(frozen=True)
class RawPhrase:
    """Output of a source adapter. Each source computes its own quality
    score (since the signals available differ per source: idiom length +
    explanation vs. poem anthology frequency vs. slang usage marker...).

    Downstream stages add phonology + POS tags; the source stays simple.
    """

    text: str
    language: Language
    source: str
    quality: float                        # [0, 1], source-computed
    tags: tuple[str, ...] = ()            # Final tags, source-chosen


@dataclass(frozen=True)
class CleanPhrase:
    """After clean.py. Text is normalized (繁→简 for zh, etc.); duplicates dropped."""

    text: str
    language: Language
    source: str
    tags: tuple[str, ...]


@dataclass(frozen=True)
class WordSegment:
    """Tokenizer word boundary + POS. Used for template extraction:
    the text "姜维的戏" segments to (姜维/nr, 的/u, 戏/n)."""

    text: str
    pos: str                # Universal POS Dependencies tag (NOUN/VERB/...)
                            # or tagger-native (zh: nr/n/v/a... for backward-compat)


@dataclass(frozen=True)
class PhonologyPhrase:
    """After phonology stage. Syllables + rhyme keys + optional tones/stress."""

    text: str
    language: Language
    source: str
    tags: tuple[str, ...]

    length: int                         # syllable count
    syllables: tuple[str, ...]          # per-syllable surface
    rhyme_keys: tuple[str, ...]         # per-syllable rhyme (language-specific composition)
    tones: tuple[int, ...] | None = None     # zh-specific
    stress: tuple[int, ...] | None = None    # en-specific


@dataclass(frozen=True)
class TaggedPhrase:
    """After POS tagging. Adds `segments` (word-level tokenization + POS)."""

    text: str
    language: Language
    source: str
    tags: tuple[str, ...]
    length: int
    syllables: tuple[str, ...]
    rhyme_keys: tuple[str, ...]
    tones: tuple[int, ...] | None
    stress: tuple[int, ...] | None
    segments: tuple[WordSegment, ...]


@dataclass(frozen=True)
class EnrichedPhrase:
    """Final record written to lexicon.json. Adds quality score."""

    text: str
    language: Language
    source: str
    tags: tuple[str, ...]
    length: int
    syllables: tuple[str, ...]
    rhyme_keys: tuple[str, ...]
    tones: tuple[int, ...] | None
    stress: tuple[int, ...] | None
    segments: tuple[WordSegment, ...]
    quality: float
    sub_scores: dict[str, float] = field(default_factory=dict)


def pipeline_stats(items: Iterable[EnrichedPhrase]) -> dict[str, float]:
    """Summary printed at end of `build.py`."""
    items = list(items)
    if not items:
        return {"count": 0}
    qualities = [it.quality for it in items]
    by_lang: dict[str, int] = {}
    by_source: dict[str, int] = {}
    for it in items:
        by_lang[it.language] = by_lang.get(it.language, 0) + 1
        by_source[it.source] = by_source.get(it.source, 0) + 1
    return {
        "count": len(items),
        "mean_quality": sum(qualities) / len(qualities),
        "min_quality": min(qualities),
        "max_quality": max(qualities),
        "by_language": by_lang,
        "by_source": by_source,
    }
