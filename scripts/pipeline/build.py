"""Pipeline orchestrator.

Flow per source:
    source.iter_phrases() → RawPhrase
        ↓  (phonology stage: attach syllables / rhyme_keys / tones)
    PhonologyPhrase
        ↓  (tagger stage: attach word-level POS segments)
    TaggedPhrase
        ↓  (pack: sort, serialize, write JSON)
    EnrichedPhrase → lexicon.json

Usage:
    python -m pipeline.build                              # all sources
    python -m pipeline.build --sources zh:xinhua_idiom    # just one
    python -m pipeline.build --tagger zh:jieba            # pick tagger
    python -m pipeline.build --max 5000                   # limit output
    python -m pipeline.build --out static/data/lexicon.json

Output schema (matches TypeScript PhraseRecord at src/lib/core/corpus/types.ts):
    { text, language, length, syllables, rhyme_keys, tones?, stress?,
      segments: [{text, pos}], quality, tags, source }
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
import time
from pathlib import Path
from typing import Callable, Iterable, Iterator

from .phonology import zh_pinyin
from .taggers import base as tagger_base
from .types import (
    EnrichedPhrase,
    RawPhrase,
    WordSegment,
    pipeline_stats,
)


# ---------------------------------------------------------------------------
# Source registry. Adding a new source = adding one line here.
# Keyed by "<language>:<name>" for clarity.
# ---------------------------------------------------------------------------

SOURCE_REGISTRY: dict[str, str] = {
    "zh:xinhua_idiom":     "pipeline.sources.zh.xinhua_idiom",
    "zh:xiehouyu":         "pipeline.sources.zh.xiehouyu",
    "zh:poetry_tang":      "pipeline.sources.zh.poetry_tang",
    "zh:poetry_song":      "pipeline.sources.zh.poetry_song",
    "zh:wiktionary_slang": "pipeline.sources.zh.wiktionary_slang",
    # Future:
    # "zh:opensubtitles":    "pipeline.sources.zh.opensubtitles",
    # "en:opensubtitles":    "pipeline.sources.en.opensubtitles",
}


def _load_source(name: str) -> Callable[[], Iterable[RawPhrase]]:
    if name not in SOURCE_REGISTRY:
        raise SystemExit(
            f"Unknown source: {name}\n"
            f"Known: {', '.join(SOURCE_REGISTRY)}"
        )
    mod = importlib.import_module(SOURCE_REGISTRY[name])
    return getattr(mod, "iter_phrases")


# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------

def _phonology_for(raw: RawPhrase) -> dict | None:
    """Language-specific phonology. Returns dict with length/syllables/
    rhyme_keys/tones, or None if the text has no parseable syllables."""
    if raw.language == "zh":
        return zh_pinyin.text_to_phonology(raw.text)
    # TODO: en / ja / ko plugins
    return None


def _enrich(
    raws: Iterable[RawPhrase],
    *,
    tagger_spec: str,
    include_sub_scores: bool,
) -> Iterator[EnrichedPhrase]:
    """Run phonology + tagging on each raw phrase."""
    # Cache one tagger per language so we don't reload HanLP per phrase.
    taggers: dict[str, object] = {}

    def _tagger_for(lang: str):
        if lang in taggers:
            return taggers[lang]
        # tagger_spec can be "zh:jieba" or just "jieba" (implicit lang from raw)
        if ":" in tagger_spec:
            tlang, tname = tagger_spec.split(":", 1)
        else:
            tlang, tname = lang, tagger_spec
        if tlang != lang:
            raise ValueError(f"Tagger {tagger_spec} doesn't match language {lang}")
        t = tagger_base.get_tagger(lang, tname)
        taggers[lang] = t
        return t

    dropped_no_phonology = 0
    for raw in raws:
        phon = _phonology_for(raw)
        if phon is None:
            dropped_no_phonology += 1
            continue

        t = _tagger_for(raw.language)
        segments = t.tag(raw.text)

        yield EnrichedPhrase(
            text=raw.text,
            language=raw.language,
            source=raw.source,
            tags=raw.tags,
            length=phon["length"],
            syllables=tuple(phon["syllables"]),
            rhyme_keys=tuple(phon["rhyme_keys"]),
            tones=tuple(phon["tones"]) if phon.get("tones") else None,
            stress=None,
            segments=segments,
            quality=raw.quality,
            sub_scores={},
        )

    if dropped_no_phonology:
        print(
            f"[enrich] dropped {dropped_no_phonology} entries with no parseable syllables",
            file=sys.stderr,
        )


# ---------------------------------------------------------------------------
# Pack: write JSON
# ---------------------------------------------------------------------------

def _to_json(p: EnrichedPhrase) -> dict:
    """Serialize to the shape TS PhraseRecord expects."""
    d: dict = {
        "text": p.text,
        "language": p.language,
        "source": p.source,
        "tags": list(p.tags),
        "length": p.length,
        "syllables": list(p.syllables),
        "rhymeKeys": list(p.rhyme_keys),                        # camelCase for TS
        "segments": [{"text": s.text, "pos": s.pos} for s in p.segments],
        "quality": round(p.quality, 4),
    }
    if p.tones is not None:
        d["tones"] = list(p.tones)
    if p.stress is not None:
        d["stress"] = list(p.stress)
    return d


def _write_json(
    phrases: list[EnrichedPhrase],
    out_path: Path,
) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(
            {
                "version": 3,                    # bumped from 2 (new schema with pos/language)
                "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "count": len(phrases),
                "phrases": [_to_json(p) for p in phrases],
            },
            f,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    return len(phrases)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

_DEFAULT_OUT = Path(__file__).resolve().parents[2] / "static" / "data" / "lexicon.json"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Build the rhyme-finder lexicon (Python pipeline)."
    )
    p.add_argument(
        "--sources",
        nargs="+",
        default=list(SOURCE_REGISTRY.keys()),
        help="Sources to include (default: all registered).",
    )
    p.add_argument(
        "--tagger",
        default="jieba",
        help="POS tagger name (default: jieba; alt: hanlp if installed).",
    )
    p.add_argument(
        "--max",
        type=int,
        default=None,
        help="Cap total output entries (for quick test builds).",
    )
    p.add_argument("--out", default=str(_DEFAULT_OUT), help=f"Output path (default: {_DEFAULT_OUT}).")
    p.add_argument("--include-sub-scores", action="store_true")
    args = p.parse_args(argv)

    out_path = Path(args.out)
    start = time.time()

    # Stream raws from each source
    raws: list[RawPhrase] = []
    for name in args.sources:
        fn = _load_source(name)
        before = len(raws)
        raws.extend(fn())
        print(f"[source] {name}: +{len(raws) - before}", file=sys.stderr)
    print(f"[source] total raw: {len(raws)}", file=sys.stderr)

    # Enrich with phonology + POS
    enriched = list(
        _enrich(
            raws,
            tagger_spec=args.tagger,
            include_sub_scores=args.include_sub_scores,
        )
    )
    print(f"[enrich] {len(enriched)} after phonology + tagging", file=sys.stderr)

    # Sort by quality desc, then text for stability
    enriched.sort(key=lambda p: (-p.quality, p.text))
    if args.max is not None:
        enriched = enriched[: args.max]
        print(f"[cap] kept top {len(enriched)} by quality", file=sys.stderr)

    # Summary
    stats = pipeline_stats(enriched)
    print(
        f"[stats] {stats['count']} entries, "
        f"mean quality {stats.get('mean_quality', 0):.3f}",
        file=sys.stderr,
    )
    print(f"[stats] by language: {stats.get('by_language')}", file=sys.stderr)
    print(f"[stats] by source:   {stats.get('by_source')}", file=sys.stderr)

    # Write
    n = _write_json(enriched, out_path)
    elapsed = time.time() - start
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(
        f"[pack] wrote {n} entries to {out_path} ({size_mb:.1f} MB) "
        f"in {elapsed:.1f}s",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
