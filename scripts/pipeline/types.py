"""Shared dataclasses used across the pipeline.

Kept deliberately small — each stage of the pipeline produces or consumes
one of these, and the fields line up with what the TypeScript
`PhraseRecord` expects at the far end (after JSON serialization).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


@dataclass(frozen=True)
class RawPhrase:
    """Output of a source adapter. Minimal information: just the text
    and the source label. Cleaning + scoring comes later."""

    text: str
    source: str              # e.g., "cc-cedict", "chengyu-5000", "weibo-trending"
    hint_tags: tuple[str, ...] = ()   # optional hints a source may provide


@dataclass(frozen=True)
class CleanPhrase:
    """After clean.py. Text is normalized; duplicates have been dropped."""

    text: str
    source: str
    tags: tuple[str, ...]


@dataclass(frozen=True)
class ScoredPhrase:
    """After score.py. `quality` is in [0, 1]; sub_scores is a dict of
    the individual feature contributions for transparency / tuning."""

    text: str
    source: str
    tags: tuple[str, ...]
    quality: float
    sub_scores: dict[str, float] = field(default_factory=dict)


def pipeline_stats(items: Iterable[ScoredPhrase]) -> dict[str, float]:
    """Simple summary used at the end of `build.py`."""
    items = list(items)
    if not items:
        return {"count": 0}
    qualities = [it.quality for it in items]
    return {
        "count": len(items),
        "mean_quality": sum(qualities) / len(qualities),
        "min_quality": min(qualities),
        "max_quality": max(qualities),
    }
