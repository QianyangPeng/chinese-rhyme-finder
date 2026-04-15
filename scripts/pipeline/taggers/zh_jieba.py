"""Chinese POS tagger using jieba.

jieba's POS tagset is ICTCLAS-style (n, nr, ns, nt, nz, v, vn, a, ad, ...)
— we keep it as-is rather than mapping to Universal POS, because:

1. The ICTCLAS tags are finer-grained for Chinese (`nr`=person name,
   `ns`=place name, `nt`=org name are all distinct — UD collapses them
   all into NOUN/PROPN, losing the 姜维-style nr pattern).
2. Downstream template extraction benefits from this granularity.
3. The HanLP tagger (same tagset, better accuracy) is a drop-in upgrade.

For multilingual work later, we'll add a `universal_pos` mapping layer.

Trade-off vs HanLP:
- jieba: ~87% accuracy, pure Python, zero setup, ~20MB dict
- HanLP:  ~92% accuracy, deep learning, ~500MB TF/PT dependency
Ships jieba by default; swap to HanLP via `--tagger=hanlp` when quality
matters more than build speed.
"""

from __future__ import annotations

import jieba
import jieba.posseg as pseg

from ..types import WordSegment
from . import base


# Suppress jieba's chatty init log on first use.
jieba.setLogLevel(40)   # ERROR only


class JiebaTagger:
    """Dead-simple stateless wrapper around jieba.posseg.cut."""

    language = "zh"
    name = "jieba"

    def __init__(self) -> None:
        # Warm up the default dictionary on construction so we don't
        # pay the 1-2 second cold-start cost on the first real call.
        _ = list(pseg.cut("测试"))

    def tag(self, text: str) -> tuple[WordSegment, ...]:
        if not text:
            return ()
        segments: list[WordSegment] = []
        for word, pos in pseg.cut(text):
            if not word.strip():
                continue
            segments.append(WordSegment(text=word, pos=pos))
        return tuple(segments)


# Self-register on import.
base.register("zh", "jieba", JiebaTagger())


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8")
    t = JiebaTagger()
    examples = [
        "姜维的戏",
        "寄迹山林",
        "降维打击",
        "观众们拍手叫好",
        "都喜欢动画片儿看不懂姜维的戏",
    ]
    for text in examples:
        segs = t.tag(text)
        rendered = " / ".join(f"{s.text}({s.pos})" for s in segs)
        print(f"{text:30s} -> {rendered}")
