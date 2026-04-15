"""Chinese-rhyme-finder offline data pipeline.

Modules:
  - types   : shared data classes (RawPhrase, ScoredPhrase)
  - clean   : dedup + normalization + blacklist filtering
  - score   : D-005 quality scoring
  - pack    : output to JSON / binary
  - sources : per-source adapters (add your own here)
  - build   : orchestrator / CLI entry point

See scripts/README.md for high-level docs.
"""
