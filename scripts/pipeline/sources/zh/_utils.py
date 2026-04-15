"""Shared helpers for Chinese source adapters."""

from __future__ import annotations


def cjk_count(text: str) -> int:
    """Count CJK ideographs in text (excludes punctuation, Latin, numerals)."""
    n = 0
    for ch in text:
        cp = ord(ch)
        if 0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF:
            n += 1
    return n
