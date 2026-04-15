"""Quality scoring per D-005.

Each entry gets a score in [0, 1]. Phase 1 uses simple heuristics based
on text length, character frequency, and tag presence — Phase 1.4 will
add corpus-derived features (lyric attestation, domain frequency, etc.)
once we have source data.
"""

from __future__ import annotations

from typing import Iterable, Iterator

from .types import CleanPhrase, ScoredPhrase

# Weights from DECISIONS.md D-005. Sum of positives = 1.0.
_W_DOMAIN_FREQ      = 0.25
_W_CULTURAL_RELV    = 0.20
_W_LYRICAL_ATTEST   = 0.15
_W_POS_VALIDITY     = 0.15
_W_DISTINCT         = 0.10
_W_SURPRISE         = 0.10
_P_BLACKLIST        = 0.20   # penalty
_P_FILLER           = 0.10   # penalty

# Heuristic: recognized cultural / domain tags hint at higher quality.
_CULTURAL_TAGS = frozenset({
    "sanguo", "wuxia", "myth", "classical", "opera",
    "cultural", "name", "lyric", "film", "water-margin"
})
_MODERN_TAGS = frozenset({"modern", "internet", "meme", "workplace", "psychology"})
_TECH_TAGS = frozenset({"tech", "ai", "finance", "business"})

# Phrases starting with these are penalized as "filler-led".
_FILLER_STARTS = ("的", "了", "是", "就", "都", "还", "又", "也")


def _score_domain_frequency(phrase: CleanPhrase) -> float:
    """Phase 1 stand-in: give full credit to lyric/idiom/modern
    tags, partial to others. Real implementation uses corpus frequencies."""
    tags = set(phrase.tags)
    if tags & {"lyric", "idiom"}:
        return 1.0
    if tags & _MODERN_TAGS:
        return 0.8
    if tags & _CULTURAL_TAGS:
        return 0.7
    if tags & _TECH_TAGS:
        return 0.6
    return 0.5


def _score_cultural_relevance(phrase: CleanPhrase) -> float:
    tags = set(phrase.tags)
    hits = len(tags & _CULTURAL_TAGS)
    return min(1.0, hits / 2.0)


def _score_lyrical_attestation(phrase: CleanPhrase) -> float:
    return 1.0 if "lyric" in phrase.tags else 0.3


def _score_pos_validity(phrase: CleanPhrase) -> float:
    """Phase 1: assume 2-7 character phrases are well-formed, penalize
    extremes. Phase 1.4 should use jieba POS tagging."""
    n = len(phrase.text)
    if n == 0:
        return 0.0
    if 2 <= n <= 7:
        return 1.0
    if n == 1:
        return 0.4
    return 0.7  # longer than 7


def _score_distinctiveness(phrase: CleanPhrase) -> float:
    """Placeholder — needs a corpus. Flat 0.5 for Phase 1."""
    return 0.5


def _score_surprise(phrase: CleanPhrase) -> float:
    """Proxy: multi-tag phrases tend to be more surprising / more cross-domain."""
    return min(1.0, len(phrase.tags) / 3.0)


def _penalty_blacklist(phrase: CleanPhrase) -> float:
    """Real implementation would check against a sensitive-word list."""
    return 0.0


def _penalty_common_filler(phrase: CleanPhrase) -> float:
    return 1.0 if phrase.text.startswith(_FILLER_STARTS) else 0.0


def score_one(phrase: CleanPhrase) -> ScoredPhrase:
    sub = {
        "domain_frequency": _score_domain_frequency(phrase),
        "cultural_relevance": _score_cultural_relevance(phrase),
        "lyrical_attestation": _score_lyrical_attestation(phrase),
        "pos_validity": _score_pos_validity(phrase),
        "distinctiveness": _score_distinctiveness(phrase),
        "surprise": _score_surprise(phrase),
        "blacklist_penalty": _penalty_blacklist(phrase),
        "filler_penalty": _penalty_common_filler(phrase),
    }

    quality = (
        _W_DOMAIN_FREQ    * sub["domain_frequency"]
        + _W_CULTURAL_RELV  * sub["cultural_relevance"]
        + _W_LYRICAL_ATTEST * sub["lyrical_attestation"]
        + _W_POS_VALIDITY   * sub["pos_validity"]
        + _W_DISTINCT       * sub["distinctiveness"]
        + _W_SURPRISE       * sub["surprise"]
        - _P_BLACKLIST      * sub["blacklist_penalty"]
        - _P_FILLER         * sub["filler_penalty"]
    )
    quality = max(0.0, min(1.0, quality))

    return ScoredPhrase(
        text=phrase.text,
        source=phrase.source,
        tags=phrase.tags,
        quality=quality,
        sub_scores=sub,
    )


def score(
    phrases: Iterable[CleanPhrase],
    *,
    min_quality: float = 0.3,
) -> Iterator[ScoredPhrase]:
    """Stream scorer. Drops entries below `min_quality`."""
    for p in phrases:
        scored = score_one(p)
        if scored.quality >= min_quality:
            yield scored
