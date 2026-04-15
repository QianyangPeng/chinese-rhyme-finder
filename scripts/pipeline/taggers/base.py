"""Abstract POS tagger interface.

All language taggers implement `tag(text) -> list[WordSegment]`. The
pipeline is tagger-agnostic: you can swap in a different backend by
writing a new module here.

Why a protocol instead of just a function? So taggers can carry state
(loaded model, dictionary) across calls — loading HanLP is expensive,
we want to amortize it across the 44k+ corpus entries.
"""

from __future__ import annotations

from typing import Protocol

from ..types import WordSegment


class Tagger(Protocol):
    """Stateful POS tagger for a single language."""

    language: str                        # 'zh' / 'en' / 'ja' / 'ko'
    name: str                            # 'jieba' / 'hanlp' / 'spacy' / ...

    def tag(self, text: str) -> tuple[WordSegment, ...]:
        """Tokenize `text` and label each token with its POS.

        Returns word-level segments. An empty tuple is fine for
        unparseable input (e.g., emoji-only, non-language text).
        """
        ...


# ---------------------------------------------------------------------------
# Registry — maps (language, name) → factory function.
# Sources register here so build.py can pick a tagger by CLI flag.
# ---------------------------------------------------------------------------

_REGISTRY: dict[str, Tagger] = {}


def register(language: str, name: str, instance: Tagger) -> None:
    """Called by each tagger module at import time."""
    _REGISTRY[f"{language}:{name}"] = instance


def get_tagger(language: str, name: str) -> Tagger:
    """Look up a tagger by (language, name). Raises if unregistered."""
    key = f"{language}:{name}"
    if key not in _REGISTRY:
        # Try to import the module so it self-registers.
        import importlib
        try:
            importlib.import_module(f"pipeline.taggers.{language}_{name}")
        except ImportError as e:
            raise ValueError(
                f"No tagger for {language}:{name} — install the plugin or "
                f"check scripts/pipeline/taggers/. Error: {e}"
            ) from e
    if key not in _REGISTRY:
        raise ValueError(
            f"Tagger module loaded but did not register {language}:{name}"
        )
    return _REGISTRY[key]
