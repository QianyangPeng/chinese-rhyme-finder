"""Regenerate manifest.json by scanning all source json files on disk.

Used when source files are present on disk but manifest is stale (e.g., after
a partial rebuild that only regenerated some sources and overwrote the
manifest). Writes the same schema split_lexicon.py produces.
"""
import json
import os
import sys
from collections import Counter
from pathlib import Path

DATA_DIR = Path("static/data")


def main() -> int:
    manifest: list[dict] = []

    # First pass: find which sources have chunked files.
    chunked_sources: set[str] = set()
    for f in sorted(DATA_DIR.glob("*.json")):
        # names like "opensubtitles-zh-3.json" → source prefix "opensubtitles-zh"
        parts = f.stem.rsplit("-", 1)
        if len(parts) == 2 and parts[1].isdigit():
            chunked_sources.add(parts[0])

    for f in sorted(DATA_DIR.glob("*.json")):
        name = f.name
        if name in ("manifest.json", "lexicon.json") or name.startswith("_"):
            continue

        try:
            with f.open(encoding="utf-8") as fp:
                d = json.load(fp)
        except Exception as e:
            print(f"skip {name}: {e}", file=sys.stderr)
            continue

        if "phrases" not in d:
            continue

        source = d.get("source") or (
            d["phrases"][0].get("source") if d["phrases"] else None
        )
        if not source:
            continue

        # Skip monolithic file when chunks exist.
        if f.stem == source and source in chunked_sources:
            print(f"skip monolithic {name}", file=sys.stderr)
            continue

        entry: dict = {
            "source": source,
            "file": name,
            "count": d.get("count", len(d["phrases"])),
            "sizeKB": round(f.stat().st_size / 1024, 1),
        }
        parts = f.stem.rsplit("-", 1)
        if len(parts) == 2 and parts[1].isdigit():
            entry["chunk"] = int(parts[1])
        manifest.append(entry)
        print(f"  {name}: src={source} count={entry['count']:,}", file=sys.stderr)

    (DATA_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    c: Counter = Counter()
    for e in manifest:
        c[e["source"]] += e["count"]
    print("\nTotal per source:", file=sys.stderr)
    for src, n in sorted(c.items(), key=lambda x: -x[1]):
        print(f"  {src}: {n:,}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
