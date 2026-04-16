"""Source: OpenSubtitles 中文 dialogue dump (OPUS project).

License: CC-BY-ND-4.0 (http://www.opensubtitles.org). We extract statistical
n-gram counts + sample phrases — not redistributing the raw source text.

Upstream: https://opus.nlpl.eu/OpenSubtitles/v2018/download.php

Size: ~200MB gzipped, ~20M dialogue lines. The downloaded .gz is cached
at scripts/.cache/opensubtitles-zh.txt.gz — only pulled once.

This module is intentionally thin: all the heavy n-gram mining lives in
_ngram_extractor.py. To add a different big corpus (Weibo dump, rap
lyric archive, Wikipedia intros), copy this file, change the download
URL and tags, and you're done.
"""

from __future__ import annotations

import gzip
import os
import sys
from pathlib import Path
from typing import Iterator

import requests
from opencc import OpenCC

from ...types import RawPhrase
from ._ngram_extractor import mine_ngrams

# zh_cn.txt.gz from OPUS is predominantly simplified but has some partial
# traditional-character lines from movies released in HK/TW. Normalize
# every line to simplified before n-gram counting so that '什麼時候' and
# '什么时候' end up in the same bucket (instead of as two half-frequency
# entries that never reach min_count).
_cc_t2s = OpenCC("t2s")


SOURCE_NAME = "opensubtitles-zh"
URL = (
    "https://object.pouta.csc.fi/OPUS-OpenSubtitles/"
    "v2018/mono/zh_cn.txt.gz"
)
CACHE_PATH = (
    Path(__file__).resolve().parents[3] / ".cache" / "opensubtitles-zh.txt.gz"
)

# Tuning defaults — can be overridden via env vars for experimentation.
DEFAULT_MIN_COUNT = int(os.environ.get("OPENSUBS_MIN_COUNT", "30"))
DEFAULT_MAX_OUTPUT = int(os.environ.get("OPENSUBS_MAX_OUTPUT", "50000"))
DEFAULT_MAX_LINES = os.environ.get("OPENSUBS_MAX_LINES")  # None = all
DEFAULT_MAX_LINES = int(DEFAULT_MAX_LINES) if DEFAULT_MAX_LINES else None


def _ensure_cache() -> Path:
    if CACHE_PATH.exists() and CACHE_PATH.stat().st_size > 1_000_000:
        return CACHE_PATH
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    print(
        f"[opensubtitles-zh] downloading {URL}\n"
        f"  → {CACHE_PATH} (~200MB, 1-5 minutes)",
        file=sys.stderr,
    )
    # Using requests (not urllib) because Windows Python installs often ship
    # without up-to-date CA certs, causing SSLCertVerificationError. requests
    # bundles certifi.
    with requests.get(URL, stream=True, timeout=60) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        done = 0
        chunk_size = 64 * 1024
        with CACHE_PATH.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=chunk_size):
                if not chunk:
                    continue
                f.write(chunk)
                done += len(chunk)
                if (done // chunk_size) % 200 == 0:
                    got_mb = done / (1024 * 1024)
                    total_mb = total / (1024 * 1024) if total else 0
                    print(
                        f"  ... {got_mb:.1f} / {total_mb:.1f} MB",
                        file=sys.stderr,
                        end="\r",
                    )
    print(file=sys.stderr)  # newline after progress
    return CACHE_PATH


def _iter_lines(path: Path) -> Iterator[str]:
    """Stream-read the gzipped text file line by line, normalizing 繁→简."""
    with gzip.open(path, "rt", encoding="utf-8", errors="ignore") as f:
        for line in f:
            s = line.strip()
            if not s:
                continue
            # Normalize traditional → simplified so 什麼時候 ≡ 什么时候.
            yield _cc_t2s.convert(s)


def iter_phrases(
    *,
    min_count: int = DEFAULT_MIN_COUNT,
    max_output: int = DEFAULT_MAX_OUTPUT,
    max_lines: int | None = DEFAULT_MAX_LINES,
    skip_texts: set[str] | None = None,
) -> Iterator[RawPhrase]:
    """Yield extracted phrases from OpenSubtitles zh.

    The parameters are tunable — defaults come from env vars:
      OPENSUBS_MIN_COUNT=30        (threshold to survive)
      OPENSUBS_MAX_OUTPUT=50000    (final cap)
      OPENSUBS_MAX_LINES=200000    (sample N lines, omit for full corpus)

    Example:
      OPENSUBS_MAX_LINES=500000 python -m pipeline.build \
          --sources zh:opensubtitles
    """
    path = _ensure_cache()
    yield from mine_ngrams(
        _iter_lines(path),
        source=SOURCE_NAME,
        tags=("opensubs", "modern", "colloquial"),
        min_length=2,
        max_length=6,
        min_count=min_count,
        max_output=max_output,
        max_lines=max_lines,
        skip_texts=skip_texts,
    )
