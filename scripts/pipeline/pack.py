"""Output the pipeline result to JSON for the JS runtime to fetch.

Phase 1: a simple JSON array of {text, tags, quality, source}. With
~50k entries, the JSON is ~3 MB uncompressed, ~500 KB after brotli —
fine for browser fetch. We'll switch to a packed binary (TypedArray-
friendly) in Phase 2 if loading becomes a hot path.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

from .types import ScoredPhrase


def pack_json(
    phrases: Iterable[ScoredPhrase],
    output_path: str | os.PathLike[str],
    *,
    include_sub_scores: bool = False,
    sort: bool = True,
) -> int:
    """Write a JSON array. Returns the number of entries written."""
    items = list(phrases)
    if sort:
        items.sort(key=lambda p: (-p.quality, p.text))

    def to_dict(p: ScoredPhrase) -> dict:
        d = {
            "text": p.text,
            "tags": list(p.tags),
            "quality": round(p.quality, 4),
            "source": p.source,
        }
        if include_sub_scores:
            d["sub_scores"] = {k: round(v, 4) for k, v in p.sub_scores.items()}
        return d

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "version": 1,
                "count": len(items),
                "phrases": [to_dict(p) for p in items],
            },
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    return len(items)
