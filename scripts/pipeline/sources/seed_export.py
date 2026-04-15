"""Trivial source: re-export the TypeScript seed lexicon as RawPhrases.

Exists so the pipeline end-to-end can be exercised with zero external
data. Not useful for production (it just produces what the JS already
has) but validates the clean → score → pack chain.

Parses the TS files with a simple regex — good enough for the seed
files which follow a fixed shape. When Phase 1.4 ships a real source,
this module will be superseded.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, Iterator

from ..types import RawPhrase

_SEED_DIR = Path(__file__).resolve().parents[3] / "src" / "lib" / "core" / "corpus" / "seeds"

# Matches entries like: { text: '一帆风顺', tags: ['idiom'] },
_ENTRY_RE = re.compile(
    r"\{\s*text:\s*['\"](?P<text>[^'\"]+)['\"]\s*,\s*tags:\s*\[(?P<tags>[^\]]*)\]\s*\}"
)
_TAG_RE = re.compile(r"['\"]([^'\"]+)['\"]")


def iter_phrases() -> Iterator[RawPhrase]:
    """Yield every entry found in the seed TypeScript files."""
    if not _SEED_DIR.is_dir():
        return
    for ts_file in sorted(_SEED_DIR.glob("*.ts")):
        content = ts_file.read_text(encoding="utf-8")
        for match in _ENTRY_RE.finditer(content):
            text = match.group("text")
            tags = tuple(_TAG_RE.findall(match.group("tags")))
            yield RawPhrase(
                text=text,
                source=f"seed::{ts_file.stem}",
                hint_tags=tags,
            )


if __name__ == "__main__":
    # Smoke test: print how many entries parsed from each file.
    from collections import Counter

    counts: Counter[str] = Counter()
    for p in iter_phrases():
        counts[p.source] += 1
    for src, n in sorted(counts.items()):
        print(f"  {src}: {n}")
    print(f"Total: {sum(counts.values())}")
