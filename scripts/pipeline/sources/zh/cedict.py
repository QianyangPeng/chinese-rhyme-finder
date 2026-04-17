"""Source: CC-CEDICT Chinese-English dictionary (CC-BY-SA 4.0).

Upstream: https://www.mdbg.net/chinese/dictionary?page=cc-cedict
Download: https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz

Each line has format:  Traditional Simplified [pin1 yin1] /English def 1/def 2/
We extract simplified Chinese entries of length 2-4, skipping single characters.

This fills the critical gap: the lexicon has idioms (4-char), lyrics (4-8 char),
but very few basic 2-3 character modern Chinese words. CC-CEDICT provides
~80k such entries covering everyday vocabulary.
"""

from __future__ import annotations

import gzip
import re
import sys
import urllib.request
from pathlib import Path
from typing import Iterator

from ...types import RawPhrase

SOURCE_NAME = "cedict"
CEDICT_URL = (
    "https://www.mdbg.net/chinese/export/cedict/"
    "cedict_1_0_ts_utf-8_mdbg.txt.gz"
)
CACHE_PATH = Path(__file__).resolve().parents[3] / ".cache" / "cedict.txt.gz"

# Regex to parse a CC-CEDICT line:
#   Traditional Simplified [pin1 yin1] /def1/def2/
_LINE_RE = re.compile(
    r"^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+/(.+)/$"
)

# Characters that indicate proper nouns / place names / abbreviations we
# want to downweight. These are useful in the dictionary but less useful
# as rhyme candidates.
_PROPER_NOUN_HINTS = re.compile(
    r"(surname|province|city|county|district|prefecture|"
    r"township|village|mountain|river|lake|island|"
    r"CL:|abbr\. for|variant of|see [A-Z]|old variant)",
    re.IGNORECASE,
)

# Archaic / literary markers in definitions.
_LITERARY_HINTS = re.compile(
    r"(literary|archaic|old form|classical|ancient)",
    re.IGNORECASE,
)


def _cjk_count(text: str) -> int:
    """Count CJK ideographs (excludes punctuation, Latin, numerals)."""
    n = 0
    for ch in text:
        cp = ord(ch)
        if 0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF:
            n += 1
    return n


def _is_all_cjk(text: str) -> bool:
    """True if every character is a CJK ideograph."""
    for ch in text:
        cp = ord(ch)
        if not (0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF):
            return False
    return True


def _score(simplified: str, definition: str) -> float:
    """Quality score in [0, 1]. Favors common 2-3 char words."""
    score = 0.55
    n = len(simplified)

    # Length preference: 2-3 char words are the sweet spot for rhyming
    if n == 2:
        score += 0.15
    elif n == 3:
        score += 0.10
    elif n == 4:
        score += 0.02

    # Definitions with more English text tend to be more common/useful
    def_len = len(definition)
    if def_len > 40:
        score += 0.08
    elif def_len > 20:
        score += 0.04

    # Multiple definitions suggest a common word with many uses
    slash_count = definition.count("/")
    if slash_count >= 4:
        score += 0.08
    elif slash_count >= 2:
        score += 0.04

    # Downweight proper nouns, place names, abbreviations
    if _PROPER_NOUN_HINTS.search(definition):
        score -= 0.20

    # Downweight literary/archaic terms
    if _LITERARY_HINTS.search(definition):
        score -= 0.10

    return max(0.0, min(1.0, score))


def _ensure_cache() -> Path:
    """Download the CC-CEDICT gzipped file if not cached. Idempotent."""
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 100_000:
        return CACHE_PATH
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(f"[cedict] downloading {CEDICT_URL}", file=sys.stderr)
    req = urllib.request.Request(
        CEDICT_URL,
        headers={"User-Agent": "chinese-rhyme-finder/1.0"},
    )
    with urllib.request.urlopen(req) as resp:
        CACHE_PATH.write_bytes(resp.read())
    print(f"[cedict] cached at {CACHE_PATH}", file=sys.stderr)
    return CACHE_PATH


def _iter_entries(path: Path) -> Iterator[tuple[str, str, str]]:
    """Yield (simplified, pinyin, definition) from the gzipped CEDICT file."""
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            # Skip comments
            if line.startswith("#"):
                continue
            m = _LINE_RE.match(line)
            if not m:
                continue
            _traditional, simplified, pinyin, definition = m.groups()
            yield simplified, pinyin, definition


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def iter_phrases() -> Iterator[RawPhrase]:
    """Yield one RawPhrase per valid CC-CEDICT entry (2-4 chars, CJK only)."""
    path = _ensure_cache()
    count = 0
    skipped = 0

    for simplified, _pinyin, definition in _iter_entries(path):
        n = len(simplified)

        # Only 2-4 character entries
        if n < 2 or n > 4:
            skipped += 1
            continue

        # Must be pure CJK (no mixed Latin/digits/punctuation)
        if not _is_all_cjk(simplified):
            skipped += 1
            continue

        quality = _score(simplified, definition)
        count += 1

        yield RawPhrase(
            text=simplified,
            language="zh",
            source=SOURCE_NAME,
            quality=round(quality, 4),
            tags=("dictionary", "cedict"),
        )

    print(
        f"[cedict] yielded {count} entries (skipped {skipped})",
        file=sys.stderr,
    )


if __name__ == "__main__":
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
    phrases = list(iter_phrases())
    print(f"Yielded {len(phrases)} cedict entries")
    # Length distribution
    from collections import Counter
    lengths = Counter(len(p.text) for p in phrases)
    print(f"By length: {dict(sorted(lengths.items()))}")
    # Quality peek
    phrases.sort(key=lambda p: -p.quality)
    print("\nTop 10 by quality:")
    for p in phrases[:10]:
        print(f"  {p.quality:.4f}  {p.text}")
    print("\nBottom 5:")
    for p in phrases[-5:]:
        print(f"  {p.quality:.4f}  {p.text}")
