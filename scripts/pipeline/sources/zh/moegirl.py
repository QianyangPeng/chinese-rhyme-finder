"""Source: 萌娘百科 (Moegirl) character names + ACG attributes.

Upstream: https://github.com/Zzzzzzyt/moegirl-dataset
~46k character names + ~2.5k ACG attribute terms.

The Moegirl wiki API is locked, so we use the pre-exported dataset
from GitHub. Character names are great for rap (2-4 char names that
rhyme: 初音未来, 可莉, 胡桃). Attribute terms add ACG vocabulary
(萌属性, 弹幕用语, etc.).
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Iterator

from opencc import OpenCC

from ...types import RawPhrase
from ._utils import cjk_count

SOURCE_NAME = "moegirl-acg"
REPO_URL = "https://github.com/Zzzzzzyt/moegirl-dataset.git"
CACHE_DIR = Path(__file__).resolve().parents[3] / ".cache" / "moegirl-dataset"

_cc = OpenCC("t2s")


def _ensure_cache() -> Path:
    if CACHE_DIR.exists() and (CACHE_DIR / "moegirl").exists():
        return CACHE_DIR
    CACHE_DIR.parent.mkdir(parents=True, exist_ok=True)
    print(f"[moegirl] cloning {REPO_URL}", file=sys.stderr)
    subprocess.run(
        ["git", "clone", "--depth", "1", REPO_URL, str(CACHE_DIR)],
        check=True,
        capture_output=True,
    )
    return CACHE_DIR


def _score(text: str) -> float:
    score = 0.78
    n = len(text)
    if n in (3, 4):     score += 0.10
    elif n in (2, 5):   score += 0.06
    elif n == 6:        score += 0.03
    else:               score -= 0.05
    # Penalty for mixed scripts (half CJK, half Latin)
    cjk = cjk_count(text)
    if cjk / n < 0.8:
        score -= 0.15
    return max(0.0, min(1.0, score))


def iter_phrases() -> Iterator[RawPhrase]:
    cache_dir = _ensure_cache()
    moegirl_dir = cache_dir / "moegirl"

    seen: set[str] = set()
    emitted = 0

    # 1. Character names (~46k)
    char_index = moegirl_dir / "char_index.json"
    if char_index.exists():
        with char_index.open(encoding="utf-8") as f:
            chars = json.load(f)
        names = chars if isinstance(chars, list) else list(chars.keys())
        for raw_name in names:
            name = raw_name.strip().strip('"').strip("'")
            text = _cc.convert(name).strip()
            if not text or text in seen:
                continue
            if cjk_count(text) < 2 or len(text) < 2 or len(text) > 8:
                continue
            quality = _score(text)
            if quality < 0.65:
                continue
            seen.add(text)
            emitted += 1
            yield RawPhrase(
                text=text,
                language="zh",
                source=SOURCE_NAME,
                quality=round(quality, 4),
                tags=("acg", "moegirl", "character"),
            )

    # 2. Attribute terms (~2.5k)
    attr_file = moegirl_dir / "attr2article.json"
    if attr_file.exists():
        with attr_file.open(encoding="utf-8") as f:
            attrs = json.load(f)
        for raw_attr in attrs.keys():
            # Strip parenthetical suffixes like "(萌属性)"
            name = raw_attr.split("(")[0].split("（")[0].strip()
            text = _cc.convert(name).strip()
            if not text or text in seen:
                continue
            if cjk_count(text) < 2 or len(text) < 2 or len(text) > 8:
                continue
            quality = _score(text)
            if quality < 0.65:
                continue
            seen.add(text)
            emitted += 1
            yield RawPhrase(
                text=text,
                language="zh",
                source=SOURCE_NAME,
                quality=round(quality, 4),
                tags=("acg", "moegirl", "attribute"),
            )

    print(f"[moegirl] yielded {emitted} phrases", file=sys.stderr)
