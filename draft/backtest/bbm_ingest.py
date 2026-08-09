#!/usr/bin/env python3
"""BBM INGEST — parse an Underdog Best Ball Mania pick-by-pick CSV into rosters.

The reachability finding that shaped this module: the Underdog data is hosted on
`storage.googleapis.com/underdog-inc/...`, and THAT host is reachable from the
sandbox (the `underdognetwork.com` landing pages are egress-blocked, but the GCS
CSVs are not). So the smaller per-round FINALS dumps (a few MB) can be ingested
here directly; only the multi-GB full-field regular-season dumps (`_r1_...`,
~4.8 GB) need CI streaming. See `bbm-probe.yml` / `docs/queued/bbm-ingestion.md`.

This module is PURE parsing + hashing (no egress), so it is unit-tested offline
on a tiny fixture. The fetch lives in the caller (a one-time manual pull or CI),
same split as the rest of the Lab. Every roster it emits is raw BBM — it becomes
a FINDING only after `bbm_translate` re-scores/tags it and it clears our gates.

CSV schema (BBM IV/V pick-by-pick):
    draft_id,user_id,username,...,tournament_round_number,player_name,player_id,
    position_name,projection_adp,source,pick_order,overall_pick_number,
    team_pick_number,pick_created_time,pick_points,roster_points,made_playoffs

Key columns we use:
  * tournament_round_draft_entry_id — the roster identity within a tournament round
  * position_name                   — RB/WR/TE/QB (BBM has no K/DEF)
  * team_pick_number                — the DRAFT ROUND for that entry (1..18, snake)
  * projection_adp                  — BBM's contemporaneous ADP (populated in R1;
                                      'NA' in the finals dumps)
  * pick_points                     — the player's points in that tournament round
  * roster_points                   — the roster's total for the round (the outcome)
  * made_playoffs                   — advanced past the regular season (1/0)
"""
from __future__ import annotations
import csv
import hashlib
from pathlib import Path


def content_hash(path: str | Path, chunk: int = 1 << 20) -> str:
    """sha256 of a file, streamed — the raw-forever L2 archive identity. A TB or a
    KB, same call; the caller records this in the provenance manifest so a re-pull
    of the same tournament is provably the same bytes."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def _num(v):
    """A BBM numeric cell -> float, or None for 'NA'/blank (never a silent 0.0,
    which would look like a real score)."""
    if v is None:
        return None
    s = str(v).strip()
    if s == "" or s.upper() == "NA":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_pick_by_pick(csv_path: str | Path) -> list[dict]:
    """Group a pick-by-pick CSV into rosters keyed by tournament_round_draft_entry_id.

    Returns [{entry_id, ids, pos_by_id, outcome, made_playoffs, picks}] where:
      * ids          — the roster's player_ids (BBM UUIDs)
      * pos_by_id    — {player_id: position_name} (the crosswalk travels in-file, so
                       positional shape needs no external id map)
      * outcome      — roster_points for the round (the outcome we rank by)
      * made_playoffs— 1/0
      * picks        — [{player_id, position, draft_round, overall_pick, adp, pick_points}]

    Malformed rows (no entry id or no position) are skipped, counted by the caller
    via the returned rosters vs the raw line count if it wants a completeness check.
    """
    entries: dict[str, dict] = {}
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            eid = (row.get("tournament_round_draft_entry_id") or "").strip()
            pos = (row.get("position_name") or "").strip()
            pid = (row.get("player_id") or "").strip()
            if not eid or not pos or not pid:
                continue
            e = entries.get(eid)
            if e is None:
                e = entries[eid] = {
                    "entry_id": eid, "ids": [], "pos_by_id": {},
                    "outcome": _num(row.get("roster_points")),
                    "made_playoffs": int(_num(row.get("made_playoffs")) or 0),
                    "picks": [],
                }
            e["ids"].append(pid)
            e["pos_by_id"][pid] = pos
            e["picks"].append({
                "player_id": pid,
                "position": pos,
                "draft_round": int(_num(row.get("team_pick_number")) or 0),
                "overall_pick": int(_num(row.get("overall_pick_number")) or 0),
                "adp": _num(row.get("projection_adp")),
                "pick_points": _num(row.get("pick_points")),
            })
    return list(entries.values())


def rosters_for_shape(parsed: list[dict]) -> list[dict]:
    """Shape `parse_pick_by_pick` output into the {ids, outcome} rows
    `bbm_translate.winning_shape` consumes (dropping rosters with no outcome)."""
    return [{"ids": r["ids"], "outcome": r["outcome"]}
            for r in parsed if r.get("outcome") is not None]


def pos_by_id_of(parsed: list[dict]) -> dict[str, str]:
    """Union crosswalk {player_id: position} across all rosters (positions are
    consistent within a tournament, so last-wins is safe)."""
    out: dict[str, str] = {}
    for r in parsed:
        out.update(r.get("pos_by_id") or {})
    return out


def stream_positional_by_round(line_iter) -> dict:
    """Streaming aggregate for the multi-GB full-field regular-season dumps (R1,
    ~4.8 GB) — the DEAD-ZONE instrument at full N without holding the file in memory.

    `line_iter` is any iterator of raw CSV lines (the first line is the header), so
    CI can feed it `urllib`'s response line-by-line and never materialise the file.
    Memory is O(distinct position × draft_round), not O(rows). Accumulates, per
    (position, draft_round): pick count, sum of pick_points, sum of adp — enough to
    answer "do round-3-6 RBs underperform" and "how well does BBM ADP order outcomes"
    at a sample our three seasons cannot touch. Returns nested
    {position: {draft_round: {n, points_sum, points_mean, adp_sum, adp_mean}}}."""
    import csv as _csv
    agg: dict[str, dict[int, dict]] = {}
    reader = _csv.DictReader(line_iter)
    for row in reader:
        pos = (row.get("position_name") or "").strip()
        rnd = _num(row.get("team_pick_number"))
        if not pos or rnd is None:
            continue
        rnd = int(rnd)
        pts = _num(row.get("pick_points"))
        adp = _num(row.get("projection_adp"))
        cell = agg.setdefault(pos, {}).setdefault(
            rnd, {"n": 0, "points_sum": 0.0, "adp_sum": 0.0, "adp_n": 0})
        cell["n"] += 1
        if pts is not None:
            cell["points_sum"] += pts
        if adp is not None:
            cell["adp_sum"] += adp
            cell["adp_n"] += 1
    for pos, rounds in agg.items():
        for rnd, cell in rounds.items():
            cell["points_mean"] = round(cell["points_sum"] / cell["n"], 3) if cell["n"] else None
            cell["adp_mean"] = round(cell["adp_sum"] / cell["adp_n"], 3) if cell["adp_n"] else None
    return agg


if __name__ == "__main__":   # pragma: no cover - manual ingest entry point
    import sys
    import json
    p = sys.argv[1]
    parsed = parse_pick_by_pick(p)
    print(json.dumps({
        "file": p,
        "sha256": content_hash(p),
        "rosters": len(parsed),
        "with_outcome": len(rosters_for_shape(parsed)),
    }, indent=2))
