"""Split a monolithic lexicon.json into per-source files for incremental loading.

Large sources (>20MB) are further chunked into multiple files so each
download is manageable (~6MB per chunk). The manifest.json lists all
files — the browser loader reads it to know what to fetch.

Usage:
    python scripts/split_lexicon.py [--input static/data/lexicon.json]
"""

import json
import sys
from pathlib import Path

MAX_CHUNK_SIZE_KB = 6 * 1024   # ~6MB per chunk


def main():
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("static/data/lexicon.json")
    output_dir = input_path.parent

    print(f"[split] reading {input_path}", file=sys.stderr)
    with input_path.open(encoding="utf-8") as f:
        data = json.load(f)

    version = data.get("version", 3)

    # Group phrases by source.
    by_source: dict[str, list] = {}
    for phrase in data["phrases"]:
        src = phrase.get("source", "unknown")
        by_source.setdefault(src, []).append(phrase)

    manifest: list[dict] = []

    for source, phrases in sorted(by_source.items()):
        base_filename = source.replace("/", "-")

        # Estimate size: serialize to get byte count
        test_json = json.dumps(phrases[:100], ensure_ascii=False, separators=(",", ":"))
        avg_bytes = len(test_json.encode("utf-8")) / max(len(phrases[:100]), 1)
        estimated_kb = (avg_bytes * len(phrases)) / 1024

        if estimated_kb > MAX_CHUNK_SIZE_KB and len(phrases) > 1000:
            # Split into chunks
            chunk_size = max(100, int(len(phrases) * MAX_CHUNK_SIZE_KB / estimated_kb))
            chunk_idx = 0
            for i in range(0, len(phrases), chunk_size):
                chunk = phrases[i : i + chunk_size]
                chunk_idx += 1
                filename = f"{base_filename}-{chunk_idx}.json"
                out_path = output_dir / filename
                with out_path.open("w", encoding="utf-8") as f:
                    json.dump(
                        {"version": version, "source": source, "count": len(chunk),
                         "chunk": chunk_idx, "phrases": chunk},
                        f, ensure_ascii=False, separators=(",", ":"),
                    )
                size_kb = out_path.stat().st_size / 1024
                manifest.append({
                    "source": source, "file": filename,
                    "count": len(chunk), "sizeKB": round(size_kb, 1),
                    "chunk": chunk_idx,
                })
                print(f"  {filename}: {len(chunk):>8,} phrases ({size_kb:.0f} KB)", file=sys.stderr)
        else:
            # Single file
            filename = f"{base_filename}.json"
            out_path = output_dir / filename
            with out_path.open("w", encoding="utf-8") as f:
                json.dump(
                    {"version": version, "source": source, "count": len(phrases),
                     "phrases": phrases},
                    f, ensure_ascii=False, separators=(",", ":"),
                )
            size_kb = out_path.stat().st_size / 1024
            manifest.append({
                "source": source, "file": filename,
                "count": len(phrases), "sizeKB": round(size_kb, 1),
            })
            print(f"  {filename}: {len(phrases):>8,} phrases ({size_kb:.0f} KB)", file=sys.stderr)

    # Write manifest
    manifest_path = output_dir / "manifest.json"
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    total_files = len(manifest)
    total_phrases = sum(m["count"] for m in manifest)
    print(
        f"[split] manifest → {manifest_path} ({total_files} files, "
        f"{total_phrases:,} phrases)",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
