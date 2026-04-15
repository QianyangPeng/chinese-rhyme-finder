"""Smoke tests for the pipeline. Run with: pytest scripts/pipeline/test_pipeline.py"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from .clean import clean, has_enough_chinese, normalize_text
from .pack import pack_json
from .score import score, score_one
from .types import CleanPhrase, RawPhrase, ScoredPhrase


# ─── clean ─────────────────────────────────────────────────────────────

def test_normalize_strips_whitespace():
    assert normalize_text("  你好  ") == "你好"


def test_normalize_collapses_multi_whitespace():
    assert normalize_text("A   B") == "A B"


def test_has_enough_chinese_false_for_english():
    assert not has_enough_chinese("hello world")


def test_has_enough_chinese_true_for_one_char():
    assert has_enough_chinese("a 好 b", min_chars=1)


def test_clean_dedups():
    raws = [
        RawPhrase("你好", "src1"),
        RawPhrase("你好", "src2", ("lyric",)),
        RawPhrase("再见", "src1"),
    ]
    out = list(clean(raws))
    assert len(out) == 2
    # First source wins for the dedup record.
    hello = next(p for p in out if p.text == "你好")
    assert hello.source == "src1"
    # Tags merged across sources.
    assert "lyric" in hello.tags


def test_clean_drops_non_chinese():
    raws = [RawPhrase("hello", "src1"), RawPhrase("你好", "src1")]
    out = list(clean(raws))
    assert [p.text for p in out] == ["你好"]


# ─── score ─────────────────────────────────────────────────────────────

def test_score_returns_value_in_unit_interval():
    sp = score_one(CleanPhrase("降维打击", "test", ("scifi", "lyric")))
    assert 0.0 <= sp.quality <= 1.0


def test_score_rewards_more_tags():
    sp1 = score_one(CleanPhrase("abc", "test", ()))
    sp2 = score_one(CleanPhrase("abc", "test", ("lyric", "cultural", "modern")))
    assert sp2.quality >= sp1.quality


def test_score_penalizes_filler_start():
    sp_filler = score_one(CleanPhrase("的时候", "test", ("modern",)))
    sp_clean = score_one(CleanPhrase("这时候", "test", ("modern",)))
    assert sp_filler.quality < sp_clean.quality


def test_score_streams_and_filters_low():
    phrases = [
        CleanPhrase("高质量", "t", ("lyric", "idiom", "cultural")),
        CleanPhrase("", "t", ()),  # won't survive clean but score handles it anyway
    ]
    # With a very high threshold nothing passes.
    assert list(score(phrases, min_quality=0.99)) == []


# ─── pack ──────────────────────────────────────────────────────────────

def test_pack_writes_valid_json():
    phrases = [
        ScoredPhrase("降维打击", "scifi", ("scifi", "lyric"), 0.85, {}),
        ScoredPhrase("春暖花开", "idiom", ("idiom",), 0.75, {}),
    ]
    with tempfile.TemporaryDirectory() as td:
        out_path = Path(td) / "lexicon.json"
        n = pack_json(phrases, out_path)
        assert n == 2
        doc = json.loads(out_path.read_text(encoding="utf-8"))
        assert doc["version"] == 1
        assert doc["count"] == 2
        # Sorted by quality desc → 降维打击 first.
        assert doc["phrases"][0]["text"] == "降维打击"


def test_pack_sub_scores_flag():
    phrases = [ScoredPhrase("test", "t", (), 0.5, {"foo": 0.1})]
    with tempfile.TemporaryDirectory() as td:
        out_path = Path(td) / "x.json"
        pack_json(phrases, out_path, include_sub_scores=True)
        doc = json.loads(out_path.read_text(encoding="utf-8"))
        assert "sub_scores" in doc["phrases"][0]
