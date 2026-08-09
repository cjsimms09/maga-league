#!/usr/bin/env python3
"""BBM DURABLE ARCHIVE — a gzipped column-subset of a finals dump.

Underdog hosts the raw CSVs; if they delist one, a re-run loses its source. The raw
finals dump is ~2.6 MB (too much, and redundant) — but the handful of columns exp 24
actually uses gzip to a few hundred KB, which is small enough to COMMIT as the
raw-forever record. So a future re-run reproduces the finding from the repo, not
from Underdog still being up. (The 4.8 GB full-field dumps stay out of the repo —
their durable record is the derived aggregate; re-streaming is the recovery path.)

Keeps ONLY the fields the analyses read, so it is a subset, not a mirror:
  tournament_round_draft_entry_id, player_id, position_name, team_pick_number,
  overall_pick_number, projection_adp, pick_points, roster_points, made_playoffs

Run: python3 draft/backtest/bbm_archive.py <raw.csv> <out.csv.gz>
"""
from __future__ import annotations
import csv
import gzip
import sys
from pathlib import Path

KEEP = ["tournament_round_draft_entry_id", "player_id", "position_name",
        "team_pick_number", "overall_pick_number", "projection_adp",
        "pick_points", "roster_points", "made_playoffs"]


def archive(raw_path: str | Path, out_path: str | Path) -> dict:
    """Write a gzipped CSV of just the KEEP columns. Returns {rows, raw_bytes, gz_bytes}."""
    rows = 0
    with open(raw_path, newline="") as fin, gzip.open(out_path, "wt", newline="") as fout:
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=KEEP)
        writer.writeheader()
        for r in reader:
            writer.writerow({k: r.get(k, "") for k in KEEP})
            rows += 1
    return {"rows": rows,
            "raw_bytes": Path(raw_path).stat().st_size,
            "gz_bytes": Path(out_path).stat().st_size}


def read_archive(gz_path: str | Path) -> list[dict]:
    """Read a gzipped column-subset back (for re-running exp 24 from the archive)."""
    with gzip.open(gz_path, "rt", newline="") as f:
        return list(csv.DictReader(f))


if __name__ == "__main__":   # pragma: no cover
    import json
    raw, out = sys.argv[1], sys.argv[2]
    print(json.dumps(archive(raw, out), indent=2))
