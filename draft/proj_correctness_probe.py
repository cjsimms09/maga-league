#!/usr/bin/env python3
"""PROJECTION-CORRECTNESS EVIDENCE PROBE — the raw rows both open items need.

Cory's ruling (2026-08-16), verbatim: "Don't agree with timelines we fix now" —
overriding the defer-to-post-draft recommendations on DECISIONS-NEEDED.md #0
(DEF `def_fum_td` maps to nothing) and #000 (WR/TE FP-vs-Sleeper ~20% scale
gap). Both fixes are gated on evidence this sandbox cannot fetch (Sleeper and
FantasyPros are 403 at the egress proxy — policy denial, same as
rule12_statline_probe.py records), so this probe runs in CI and commits the raw
provider rows the fixes must be derived from.

WHAT IT DELIBERATELY DOES NOT DO — same discipline as rule12_statline_probe.py:
it does not score anything, does not import score_stat_line, and does not
decide either mapping. The conversion and the mapping are the things under
audit; the file that fetches the inputs must not produce the answer.

WHAT IT CAPTURES:

  #0 (DEF):  the raw Sleeper projection row for ALL 32 team defenses (the
             committed record had exactly one, the Rams), plus a key census
             across the 32 — so the alias/component table (`def_td` vs
             `def_int_td` vs `def_fum_td`) is built from the full set in one
             pass, exactly as the 2026-08-15 re-check of #0 specified.

  #000 (FP): FantasyPros' 2026 rows as served — BOTH the raw stat field names
             (before _FP_STAT_MAP drops unknown keys) and FP's own precomputed
             `fpts`, per position — plus Sleeper's projected component rows for
             the board's top skill players, so the two providers' reception/
             yardage assumptions can be diffed player by player. The 2026-08-15
             re-check of #000 named this diff as the blocked next step.

Run: python3 draft/proj_correctness_probe.py         (needs provider egress)
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "backtest"))

OUT = HERE / "audit" / "proj_correctness_evidence_2026-08-16.json"
BOARD = HERE.parent / "public" / "draft_data.json"

SEASON = "2026"
TOP_N = {"QB": 30, "RB": 60, "WR": 70, "TE": 40}


def _stats_of(row):
    """Sleeper rows sometimes nest the stat line under 'stats'."""
    if isinstance(row, dict) and isinstance(row.get("stats"), dict):
        return row["stats"]
    return row if isinstance(row, dict) else {}


def sleeper_evidence(board):
    import sleeper_import as SI

    rows = SI.fetch_projections(SEASON)
    out = {"rows_total": len(rows)}

    # -- #0: every DEF row, raw, plus the key census across all of them -------
    def_ids = [str(p["player_id"]) for p in board if p.get("position") == "DEF"]
    def_rows, census = {}, {}
    for pid in def_ids:
        line = _stats_of(rows.get(pid))
        if line:
            def_rows[pid] = line
            for k in line:
                census[k] = census.get(k, 0) + 1
    out["def_rows"] = def_rows
    out["def_rows_captured"] = len(def_rows)
    out["def_key_census"] = dict(sorted(census.items()))
    # The specific double-count question, counted rather than sampled:
    for k in ("def_td", "def_int_td", "def_fum_td", "def_kr_td", "def_pr_td",
              "def_st_td", "fum_rec_td", "int_td"):
        out.setdefault("def_td_vocabulary_counts", {})[k] = census.get(k, 0)

    # -- #000: component rows for the board's top skill players ---------------
    skill = {}
    for pos, n in TOP_N.items():
        ranked = sorted((p for p in board if p.get("position") == pos
                         and p.get("proj_sleeper") is not None),
                        key=lambda p: -p["proj_sleeper"])[:n]
        for p in ranked:
            pid = str(p["player_id"])
            line = _stats_of(rows.get(pid))
            if line:
                skill[pid] = {"name": p.get("name"), "position": pos, "stats": line}
    out["skill_rows"] = skill
    out["skill_rows_captured"] = len(skill)
    return out


def fantasypros_evidence():
    import fantasypros_adp as FP

    text, url, diag = FP.fetch_projections(int(SEASON))
    out = {"fp_url": url, "fetch_diag": {k: v for k, v in (diag or {}).items()
                                         if k != "api_tried"} | {
        "api_tried": (diag or {}).get("api_tried", [])[:6]}}
    if not text:
        out["rows"] = []
        return out

    # The mapped view (what the build actually consumes) — includes fp_fpts.
    parsed = FP.parse_projections(text)
    out["rows_parsed"] = len(parsed)

    # The RAW view: field names as served, BEFORE _FP_STAT_MAP drops unknowns.
    # parse_projections cannot show a key it dropped; the raw census can.
    raw_rows = []
    try:
        data = json.loads(text.strip())
        for o in (data.get("players") if isinstance(data, dict) else data) or []:
            if not isinstance(o, dict):
                continue
            src = o.get("stats") if isinstance(o.get("stats"), dict) else o
            raw_rows.append({
                "name": (o.get("player") or {}).get("name") or o.get("name")
                        or o.get("player_name"),
                "pos": o.get("pos") or o.get("position") or o.get("player_position_id"),
                "raw_stats": {k: v for k, v in src.items()
                              if isinstance(v, (int, float, str))},
            })
    except (ValueError, TypeError, AttributeError) as exc:
        out["raw_parse_error"] = f"{type(exc).__name__}: {exc}"

    key_census = {}
    for r in raw_rows:
        pos = str(r.get("pos") or "?").upper()[:2]
        cen = key_census.setdefault(pos, {})
        for k in r["raw_stats"]:
            cen[k] = cen.get(k, 0) + 1
    out["raw_key_census_by_pos"] = {p: dict(sorted(c.items()))
                                    for p, c in sorted(key_census.items())}

    # Commit the mapped rows in full (they are small): name, pos, mapped stats,
    # and FP's own fpts. The offline analysis joins them to the board by name.
    out["rows"] = [{"name": r.get("name"), "position": r.get("position"),
                    "team": r.get("team"), "stats": r.get("stats"),
                    "fp_fpts": r.get("fp_fpts")} for r in parsed]
    # And the raw stat lines for the same rows, keyed by (name, pos), so a
    # dropped-by-the-map field is visible per player, not only in the census.
    out["raw_rows"] = raw_rows
    return out


def main() -> int:
    board_doc = json.loads(BOARD.read_text())
    board = list(board_doc["players"]) + list(board_doc.get("kept_players") or [])

    evidence = {
        "_what": ("Raw provider rows for DECISIONS-NEEDED #0 (all-32 DEF "
                  "vocabulary) and #000 (FP-vs-Sleeper WR/TE scale). NOT scored "
                  "here — the conversion and the mapping are the things under "
                  "audit; this file must not perform them."),
        "_ruling": ("Cory 2026-08-16: \"Don't agree with timelines we fix now\" "
                    "— both items fixed pre-draft, evidence-first."),
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "board_built_at": board_doc.get("built_at"),
        "season": SEASON,
    }

    try:
        evidence["sleeper"] = sleeper_evidence(board)
    except Exception as exc:  # noqa: BLE001 — partial evidence still commits
        evidence["sleeper"] = {"error": f"{type(exc).__name__}: {exc}"}
    try:
        evidence["fantasypros"] = fantasypros_evidence()
    except Exception as exc:  # noqa: BLE001
        evidence["fantasypros"] = {"error": f"{type(exc).__name__}: {exc}"}

    OUT.write_text(json.dumps(evidence, indent=1, sort_keys=True) + "\n")
    sl = evidence.get("sleeper", {})
    fp = evidence.get("fantasypros", {})
    print(f"wrote {OUT}")
    print(f"  sleeper: {sl.get('def_rows_captured', 0)}/32 DEF rows, "
          f"{sl.get('skill_rows_captured', 0)} skill rows"
          + (f"  ERROR {sl['error']}" if "error" in sl else ""))
    print(f"  fantasypros: {fp.get('rows_parsed', 0)} rows parsed"
          + (f"  ERROR {fp['error']}" if "error" in fp else ""))
    # Fail the run only if BOTH providers came back empty — half the evidence
    # is still worth committing, and the JSON records exactly which half.
    got_any = bool(sl.get("def_rows_captured")) or bool(fp.get("rows_parsed"))
    return 0 if got_any else 1


if __name__ == "__main__":
    raise SystemExit(main())
