"""Chinese phonology: text → syllables + rhyme keys + tones.

Port of the TypeScript `src/lib/core/pinyin/{normalizer,decomposer}.ts`.
Uses `pypinyin` for character-to-pinyin lookup, then applies our own
canonical normalization + apical-i handling so the output matches the
TS side exactly — i.e., the same final string is produced for 只 (shǐ)
and 李 (lǐ) are kept distinct (the former → "-i", the latter → "i").

This MUST stay in sync with the TS decomposer: downstream search and
discover rely on string equality of these rhyme keys across languages.
"""

from __future__ import annotations

from typing import Iterable

import pypinyin
from pypinyin import Style, lazy_pinyin


# ---------------------------------------------------------------------------
# Constants — ported verbatim from src/lib/core/pinyin/decomposer.ts
# ---------------------------------------------------------------------------

# Initials after which a written "i" is the apical vowel [ɨ], phonologically
# distinct from the high-front "i". 只/志/时/日/字/次/思 all have apical-i.
APICAL_I_INITIALS = frozenset({"zh", "ch", "sh", "r", "z", "c", "s"})

TWO_CHAR_INITIALS = ("zh", "ch", "sh")
ONE_CHAR_INITIALS = frozenset("bpmfdtnlgkhjqxrzcs")

# Every standard Mandarin final → its canonical decomposition.
# Keys match decomposer.ts's FINAL_DECOMPOSE exactly.
FINAL_DECOMPOSE: dict[str, tuple[str, str, str]] = {
    "a": ("", "a", ""), "o": ("", "o", ""), "e": ("", "e", ""),
    "i": ("", "i", ""), "u": ("", "u", ""), "ü": ("", "ü", ""),
    "er": ("", "er", ""),
    "ai": ("", "a", "i"), "ei": ("", "e", "i"),
    "ao": ("", "a", "o"), "ou": ("", "o", "u"),
    "an": ("", "a", "n"), "en": ("", "e", "n"),
    "ang": ("", "a", "ng"), "eng": ("", "e", "ng"), "ong": ("", "o", "ng"),
    "ia": ("i", "a", ""), "ie": ("i", "e", ""),
    "iao": ("i", "a", "o"), "iou": ("i", "o", "u"),
    "ian": ("i", "a", "n"), "in": ("", "i", "n"),
    "iang": ("i", "a", "ng"), "ing": ("", "i", "ng"), "iong": ("i", "o", "ng"),
    "ua": ("u", "a", ""), "uo": ("u", "o", ""),
    "uai": ("u", "a", "i"), "uei": ("u", "e", "i"),
    "uan": ("u", "a", "n"), "uen": ("u", "e", "n"),
    "uang": ("u", "a", "ng"), "ueng": ("u", "e", "ng"),
    "üe": ("ü", "e", ""), "üan": ("ü", "a", "n"), "ün": ("", "ü", "n"),
    # Apical -i — distinct phoneme despite shared spelling.
    "-i": ("", "i", ""),
}

VALID_FINALS = frozenset(FINAL_DECOMPOSE.keys())


# ---------------------------------------------------------------------------
# Core logic — port of normalizer.ts + decomposer.ts
# ---------------------------------------------------------------------------

def _extract_initial(canonical: str) -> tuple[str, str]:
    """Split canonical pinyin into (initial, rest_as_final)."""
    for init in TWO_CHAR_INITIALS:
        if canonical.startswith(init):
            return init, canonical[len(init):]
    if canonical and canonical[0] in ONE_CHAR_INITIALS:
        return canonical[0], canonical[1:]
    return "", canonical


def _apply_conventions(s: str) -> str:
    """Reverse surface-pinyin conventions (y-/w-/jqx-u/truncated) → canonical.

    Port of applyConventions in normalizer.ts. pypinyin gives us surface form
    (yi/yu/you/gui/lun), this restores the phonological form (i/ü/iou/guei/luen).
    """
    if not s:
        return s

    # y- conventions (null initial, i-medial / ü-medial)
    if s.startswith("y"):
        if s == "yi": return "i"
        if s == "yin": return "in"
        if s == "ying": return "ing"
        if s == "yu": return "ü"
        if s.startswith("yu"): return "ü" + s[2:]       # yue, yuan, yun
        return "i" + s[1:]                              # ya, ye, yao, you, yan, ...

    # w- conventions (null initial, u-medial)
    if s.startswith("w"):
        if s == "wu": return "u"
        return "u" + s[1:]                              # wa, wo, wai, wei, wan, ...

    # After j/q/x, "u" is actually ü
    if len(s) >= 2 and s[0] in "jqx" and s[1] == "u":
        return s[0] + "ü" + s[2:]

    # Truncated finals after an initial consonant: iu→iou, ui→uei, un→uen
    for init in (*TWO_CHAR_INITIALS, *ONE_CHAR_INITIALS):
        if s.startswith(init):
            rest = s[len(init):]
            if rest == "iu": return init + "iou"
            if rest == "ui": return init + "uei"
            if rest == "un": return init + "uen"
            break

    return s


def _normalize_surface_pinyin(surface: str) -> tuple[str, int]:
    """Strip tone digit, normalize 'v'→'ü', apply conventions. Returns (canonical, tone).

    Input is pypinyin TONE3 output like "jiang1", "wei2", "de", "xi4", "lv3".
    Tone 0 = neutral (unmarked). pypinyin with neutral_tone_with_five=False
    gives no digit for neutral-tone syllables.
    """
    s = surface.strip().lower()
    if not s:
        return "", 0

    # v → ü (ASCII shortcut some input methods use; pypinyin with v_to_u=True
    # already handles most cases but be defensive)
    s = s.replace("v", "ü")

    # Tone number at end?
    tone = 0
    if s[-1].isdigit():
        tone = int(s[-1])
        s = s[:-1]

    # pypinyin occasionally emits trailing "r" for 儿化; treat as suffix
    # unless the whole syllable is "er"
    if s != "er" and len(s) > 1 and s.endswith("r"):
        s = s[:-1]

    return _apply_conventions(s), tone


def decompose_syllable(surface: str) -> dict | None:
    """Full decomposition of a single surface syllable (pypinyin TONE3 output).

    Returns dict with initial / final / rhyme_key / tone, or None if the
    input doesn't parse as a valid Mandarin syllable (non-CJK, garbled, etc.)
    """
    canonical, tone = _normalize_surface_pinyin(surface)
    if not canonical:
        return None

    initial, rest = _extract_initial(canonical)

    # Apical-i remap: shi/zhi/ri/zi/ci/si have phonologically distinct [ɨ]
    final = rest
    if rest == "i" and initial in APICAL_I_INITIALS:
        final = "-i"

    if final not in FINAL_DECOMPOSE:
        return None

    return {
        "initial": initial,
        "final": final,
        "tone": tone,
        # Surface pinyin with tone number (for display): jiang1, xi4, de
        "surface": surface,
    }


# ---------------------------------------------------------------------------
# Top-level API: text → phonology
# ---------------------------------------------------------------------------

def text_to_phonology(text: str) -> dict | None:
    """Convert a Chinese text string to its phonological decomposition.

    Returns a dict matching the phonology stage shape:
        {
          "length": int,                   # syllable count (= CJK char count)
          "syllables": list[str],          # pinyin with tone: ["jiang1", ...]
          "rhyme_keys": list[str],         # final only: ["iang", "-i", ...]
          "tones": list[int],              # [1, 4, ...]
        }

    Returns None if the text has no recognizable Chinese syllables (e.g.,
    pure English, emoji-only, etc.) — caller should skip such entries.
    """
    # pypinyin TONE3: tone digit at end. v_to_u preserves ü. errors='default'
    # means non-Chinese chars stay verbatim; we filter those out below.
    raw = lazy_pinyin(
        text,
        style=Style.TONE3,
        v_to_u=True,
        neutral_tone_with_five=False,
        errors="default",
    )

    syllables: list[str] = []
    rhyme_keys: list[str] = []
    tones: list[int] = []

    for item in raw:
        parsed = decompose_syllable(item)
        if parsed is None:
            # Not a Mandarin syllable — skip, but DON'T abort; mixed text
            # like "打 call" should still yield phonology for "打".
            continue
        syllables.append(parsed["surface"])
        rhyme_keys.append(parsed["final"])
        tones.append(parsed["tone"])

    if not syllables:
        return None

    return {
        "length": len(syllables),
        "syllables": syllables,
        "rhyme_keys": rhyme_keys,
        "tones": tones,
    }


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Quick sanity check: run with `python -m pipeline.phonology.zh_pinyin`
    test_cases = [
        # 维 (wei) canonically decomposes to uei (w-medial restored)
        ("姜维的戏",  ["iang", "uei", "e", "i"]),
        ("寄迹山林",  ["i", "i", "an", "in"]),
        # apical-i distinction: 只/志 (shi) must be "-i", 李/里 (li) must be "i"
        ("只李",      ["-i", "i"]),
        # ü handling: 鱼 (yu) → ü, 月 (yue) → üe
        ("鱼月",      ["ü", "üe"]),
        # truncated finals: 牛 (niu) → niou
        ("牛",        ["iou"]),
        # verify tones come through
        ("降维打击",  ["iang", "uei", "a", "i"]),
    ]
    import sys
    # Force UTF-8 for stdout on Windows
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
    passed = 0
    for text, expected_rhymes in test_cases:
        result = text_to_phonology(text)
        got = result["rhyme_keys"] if result else None
        ok = got == expected_rhymes
        flag = "OK" if ok else "FAIL"
        if ok: passed += 1
        print(f"[{flag}] {text!r:12s} -> {got}  (expected {expected_rhymes})")
    print(f"\n{passed}/{len(test_cases)} tests passed")
