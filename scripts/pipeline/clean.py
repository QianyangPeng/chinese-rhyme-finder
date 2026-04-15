"""Dedup + normalize + blacklist-filter a stream of RawPhrase.

Runs without any network access. Pure data cleaning.
"""

from __future__ import annotations

import re
from typing import Iterable, Iterator

from .types import CleanPhrase, RawPhrase

# Minimal blacklist — expand for production use. Separate from the
# sensitive-word dictionary maintained by legal/compliance; this is just
# the floor.
BLACKLIST_SUBSTRINGS: frozenset[str] = frozenset([
    # placeholder; real list would come from a maintained resource file.
])

# Characters that shouldn't appear in clean phrases (besides Chinese,
# ASCII letters/digits, and a small punct set).
_DISALLOWED_CHARS = re.compile(r"[\u0000-\u001f\u007f-\u00a0\ufff0-\uffff]")

# Collapse runs of whitespace and strip.
_MULTI_WS = re.compile(r"\s+")


def normalize_text(text: str) -> str:
    """Strip, lowercase ASCII, collapse whitespace, drop control chars."""
    s = text.strip()
    s = _DISALLOWED_CHARS.sub("", s)
    s = _MULTI_WS.sub(" ", s)
    return s


def is_blacklisted(text: str) -> bool:
    return any(bw in text for bw in BLACKLIST_SUBSTRINGS)


def has_enough_chinese(text: str, min_chars: int = 1) -> bool:
    """At least `min_chars` CJK ideographs required — filters out pure
    English / pure punctuation entries."""
    count = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    return count >= min_chars


def clean(
    raws: Iterable[RawPhrase],
    *,
    min_chinese_chars: int = 1,
    max_length: int = 20,
) -> Iterator[CleanPhrase]:
    """Stream cleaner. De-dups on normalized text (first source wins for
    tag provenance). Drops:
      - items with < `min_chinese_chars` CJK characters
      - items longer than `max_length` (after normalization)
      - items containing blacklist substrings
    """
    seen: dict[str, CleanPhrase] = {}
    for raw in raws:
        text = normalize_text(raw.text)
        if not text:
            continue
        if len(text) > max_length:
            continue
        if not has_enough_chinese(text, min_chinese_chars):
            continue
        if is_blacklisted(text):
            continue
        if text in seen:
            # Merge tags from multiple sources; keep first source label.
            existing = seen[text]
            merged_tags = tuple(sorted(set(existing.tags) | set(raw.hint_tags)))
            seen[text] = CleanPhrase(
                text=existing.text,
                source=existing.source,
                tags=merged_tags,
            )
            continue
        seen[text] = CleanPhrase(text=text, source=raw.source, tags=tuple(raw.hint_tags))

    yield from seen.values()
