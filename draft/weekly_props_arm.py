#!/usr/bin/env python3
# TERRITORY: A
"""props_weekly_v1 — the STUDY arm reader, wired into weekly_own_grade.py.

Counterpart to draft/tools/fetch_weekly_props.py (read its header first) and
part of the same split Cory asked for 2026-08-16 ("one for season projections
for draft and another for weekly projections specific to that week?"). Full
framing, the preregistration and the fixture-tested proof:
draft/audit/weekly_props_study_2026-08-16.md.

WHY THIS IS A SEPARATE, TINY FILE RATHER THAN A COLUMN INSIDE
weekly_own_projection.py's arm machinery — the explicit, honest choice this
study preregisters:

  Every arm in weekly_own_projection.DEFAULT_ARMS (v1, v1_tilt150, ...) is
  computed from `proj_ownmodel` (a SEASON total) for EVERY player the board
  prices that week — price_week() guarantees full-population coverage across
  every arm in `challengers`, and weekly_own_grade.grade_week()'s `own_arms`
  scoring path RELIES on that: it scores every arm over the SAME `with_actual`
  population the champion covers, so `proj[p]` for a pid the champion priced
  but a challenger didn't would KeyError.

  props_weekly_v1 CANNOT honestly promise that. A prop line exists for a
  player only when a market was actually quoted that week — never every
  player on the board. Inventing a value for the rest (blending down to the
  season-rate arm, or backfilling zero) would either quietly re-become the
  champion arm under a different name or violate "absent, not zero" outright.
  So props_weekly_v1 prices ONLY the players a market covered that week and
  is ABSENT everywhere else — the explicit fallback rule this study
  preregisters, stated so nobody re-discovers it as a bug.

  weekly_own_grade.py ALREADY has a slot built for exactly this shape: the
  PROVIDER study-arm pathway (sleeper / fantasypros / sleeper_fp_average) —
  narrower, independently-populated arms graded on their OWN population AND
  on the population shared with the champion, honestly labeled, NEVER
  auto-promoted. props_weekly_v1 enters the ledger through that identical
  pathway (main() merges it into the same `provider_proj` dict passed to
  `grade_week`) — reusing the harness that already solves this exact
  population problem, rather than building a parallel one. It is not a
  third-party feed; it is OUR arm, graded via the provider-shaped slot
  because the slot's shape, not its label, is what this arm needs.

  A consequence worth stating plainly: because it never enters `active_arms`,
  `weekly_own_grade.decide_promotion()` can never auto-promote props_weekly_v1
  — appropriate for an arm whose real-world MAE is entirely unmeasured
  (draft/data/props/ is empty pending a human-dispatched real fetch). If a
  real backtest someday earns it a promotion, that is a human ruling made
  with the evidence in hand, the same as every provider-arm question here.
"""
from __future__ import annotations

import json
from pathlib import Path

ARM_NAME = "props_weekly_v1"


def props_snapshot_path(props_dir: Path, season: int, week: int) -> Path:
    return props_dir / f"weekly_props_{season}_w{week}.json"


def load_props_arm(props_dir: Path, season: int, week: int) -> dict | None:
    """{pid: implied_points} for one committed weekly-props snapshot, or None
    when no snapshot is committed for that week — a clean, expected absence
    (the fetch is a separate, human-dispatched, credit-spending step; a week
    with no snapshot is simply not gradeable for this arm yet), never an
    error. A snapshot that fails to parse is treated the same way, named in
    the caller's log rather than crashing a grading run over one bad file."""
    path = props_snapshot_path(props_dir, season, week)
    if not path.exists():
        return None
    try:
        doc = json.loads(path.read_text())
    except ValueError:
        return None
    players = doc.get("players") if isinstance(doc, dict) else None
    if not isinstance(players, dict):
        return None
    out: dict = {}
    for pid, row in players.items():
        if not isinstance(row, dict):
            continue
        pts = row.get("points")
        if pts is None:
            continue
        try:
            out[str(pid)] = float(pts)
        except (TypeError, ValueError):
            continue
    return out or None
