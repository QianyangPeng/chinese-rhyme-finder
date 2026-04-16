"""Source: Chinese hip-hop / rap lyrics (MIT licensed).

Upstream: https://github.com/djwackey/chinese-hiphop-lyrics
~70 artists, ~75 JSON files, each containing multiple songs.

Format per file:
    { "artist": "...", "songs": [{ "name": "...", "lyrics": ["line", ...] }] }

This is the HIGHEST creative-density source we have — every line was
written by a rapper specifically to rhyme. No frequency threshold
needed; each line is pre-curated creative content.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Iterator

from ...types import RawPhrase
from ._lyrics_extractor import extract_lyrics_phrases

SOURCE_NAME = "lyrics-hiphop"
REPO_URL = "https://github.com/djwackey/chinese-hiphop-lyrics.git"
CACHE_DIR = Path(__file__).resolve().parents[3] / ".cache" / "hiphop-lyrics"


def _ensure_cache() -> Path:
    """Shallow-clone the repo if not already cached."""
    if CACHE_DIR.exists() and any(CACHE_DIR.glob("*.json")):
        return CACHE_DIR
    CACHE_DIR.parent.mkdir(parents=True, exist_ok=True)
    print(f"[{SOURCE_NAME}] cloning {REPO_URL}", file=sys.stderr)
    subprocess.run(
        ["git", "clone", "--depth", "1", REPO_URL, str(CACHE_DIR)],
        check=True,
        capture_output=True,
    )
    return CACHE_DIR


def _iter_lines(cache_dir: Path) -> Iterator[str]:
    """Yield every lyrics line from every artist JSON file."""
    for json_path in sorted(cache_dir.glob("*.json")):
        try:
            with json_path.open(encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue

        songs = data.get("songs", [])
        for song in songs:
            lyrics = song.get("lyrics", [])
            if isinstance(lyrics, list):
                for line in lyrics:
                    if isinstance(line, str) and line.strip():
                        yield line.strip()


def iter_phrases() -> Iterator[RawPhrase]:
    """Yield extracted phrases from Chinese rap lyrics."""
    cache_dir = _ensure_cache()
    yield from extract_lyrics_phrases(
        _iter_lines(cache_dir),
        source=SOURCE_NAME,
        tags=("hiphop", "lyrics", "rap"),
        min_length=4,
        max_length=8,
        min_quality=0.72,
    )
