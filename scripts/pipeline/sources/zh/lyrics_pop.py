"""Source: Chinese pop/rock/folk lyrics (MIT licensed).

Upstream: https://github.com/gaussic/Chinese-Lyric-Corpus
~50,000 songs from 500+ artists (NetEase Cloud Music).

Format: ZIP archive → one .txt file per song under
Chinese_Lyrics/{artist_id}/{song_title}.txt. Each file is plain text,
one lyrics line per line.
"""

from __future__ import annotations

import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Iterator

from ...types import RawPhrase
from ._lyrics_extractor import extract_lyrics_phrases

SOURCE_NAME = "lyrics-pop"
REPO_URL = "https://github.com/gaussic/Chinese-Lyric-Corpus.git"
CACHE_DIR = Path(__file__).resolve().parents[3] / ".cache" / "pop-lyrics"
ZIP_PATH = CACHE_DIR / "Chinese_Lyrics.zip"


def _ensure_cache() -> Path:
    """Shallow-clone the repo if not already cached."""
    if ZIP_PATH.exists() and ZIP_PATH.stat().st_size > 1_000_000:
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
    """Stream-read all .txt lyrics files from the ZIP without extracting."""
    zip_path = cache_dir / "Chinese_Lyrics.zip"
    if not zip_path.exists():
        print(f"[{SOURCE_NAME}] ZIP not found at {zip_path}", file=sys.stderr)
        return

    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            if not name.endswith(".txt"):
                continue
            try:
                with zf.open(name) as f:
                    for raw_line in f:
                        line = raw_line.decode("utf-8", errors="ignore").strip()
                        if line:
                            yield line
            except Exception:
                continue


def iter_phrases() -> Iterator[RawPhrase]:
    """Yield extracted phrases from Chinese pop/rock/folk lyrics."""
    cache_dir = _ensure_cache()
    yield from extract_lyrics_phrases(
        _iter_lines(cache_dir),
        source=SOURCE_NAME,
        tags=("lyrics", "pop"),
        min_length=4,
        max_length=8,
        min_quality=0.72,
    )
