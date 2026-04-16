"""Split a monolithic lexicon.json into per-source files for incremental loading.

Usage:
    python scripts/split_lexicon.py [--input static/data/lexicon.json]

Output: static/data/{source-name}.json for each source in the lexicon,
plus a manifest.json listing all source files with counts.
"""

import json
import sys
import time
from pathlib import Path


def main():
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("static/data/lexicon.json")
    output_dir = input_path.parent

    print(f"[split] reading {input_path}", file=sys.stderr)
    with input_path.open(encoding="utf-8") as f:
        data = json.load(f)

    # Group phrases by source.
    by_source: dict[str, list] = {}
    for phrase in data["phrases"]:
        src = phrase.get("source", "unknown")
        by_source.setdefault(src, []).append(phrase)

    # Write per-source files.
    manifest = []
    for source, phrases in sorted(by_source.items()):
        # File name: replace / with - for filesystem safety.
        filename = source.replace("/", "-") + ".json"
        out_path = output_dir / filename
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(
                {
                    "version": data.get("version", 3),
                    "source": source,
                    "count": len(phrases),
                    "phrases": phrases,
                },
                f,
                ensure_ascii=False,
                separators=(",", ":"),
            )
        size_kb = out_path.stat().st_size / 1024
        manifest.append({"source": source, "file": filename, "count": len(phrases), "sizeKB": round(size_kb, 1)})
        print(f"  {filename}: {len(phrases):>8,} phrases ({size_kb:.0f} KB)", file=sys.stderr)

    # Write manifest.
    manifest_path = output_dir / "manifest.json"
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"[split] manifest → {manifest_path} ({len(manifest)} sources)", file=sys.stderr)


if __name__ == "__main__":
    main()
