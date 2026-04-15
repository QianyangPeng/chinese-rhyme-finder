"""Pipeline orchestrator / CLI.

Usage:
  python -m pipeline.build                    # run all sources → static/data/lexicon.json
  python -m pipeline.build --sources seed_export
  python -m pipeline.build --out ../static/data/lexicon.json --include-sub-scores
"""

from __future__ import annotations

import argparse
import importlib
import sys
from itertools import chain
from pathlib import Path
from typing import Callable, Iterable

from .clean import clean
from .pack import pack_json
from .score import score
from .types import RawPhrase, pipeline_stats

# Registry of available sources. Add new ones here after writing the module
# under pipeline/sources/.
SOURCE_REGISTRY: dict[str, str] = {
    "seed_export": "pipeline.sources.seed_export",
    # "idioms_5000": "pipeline.sources.idioms_5000",
    # "cc_cedict":   "pipeline.sources.cc_cedict",
    # "lyrics_v1":   "pipeline.sources.lyrics_v1",
}


def _load_source(name: str) -> Callable[[], Iterable[RawPhrase]]:
    if name not in SOURCE_REGISTRY:
        raise SystemExit(
            f"Unknown source: {name}. Known: {', '.join(SOURCE_REGISTRY)}"
        )
    mod = importlib.import_module(SOURCE_REGISTRY[name])
    return getattr(mod, "iter_phrases")


_DEFAULT_OUT = (
    Path(__file__).resolve().parents[2] / "static" / "data" / "lexicon.json"
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build the rhyme-finder lexicon.")
    parser.add_argument(
        "--sources",
        nargs="+",
        default=list(SOURCE_REGISTRY.keys()),
        help="Sources to run (default: all registered).",
    )
    parser.add_argument(
        "--out",
        default=str(_DEFAULT_OUT),
        help=f"Output JSON path (default: {_DEFAULT_OUT}).",
    )
    parser.add_argument(
        "--min-quality",
        type=float,
        default=0.3,
        help="Drop entries below this quality score (default 0.3).",
    )
    parser.add_argument(
        "--include-sub-scores",
        action="store_true",
        help="Include the per-feature score breakdown in output (larger file).",
    )
    args = parser.parse_args(argv)

    # Collect raws from every requested source.
    raws = chain.from_iterable(_load_source(s)() for s in args.sources)

    cleaned = list(clean(raws))
    print(f"[clean] {len(cleaned)} phrases after dedup + normalization", file=sys.stderr)

    scored = list(score(cleaned, min_quality=args.min_quality))
    stats = pipeline_stats(scored)
    print(
        f"[score] kept {stats['count']} / {len(cleaned)} "
        f"(mean quality {stats.get('mean_quality', 0):.3f})",
        file=sys.stderr,
    )

    written = pack_json(scored, args.out, include_sub_scores=args.include_sub_scores)
    print(f"[pack] wrote {written} entries to {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
