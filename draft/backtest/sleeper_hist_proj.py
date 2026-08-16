# TERRITORY: A
"""SLEEPER-HIST-PROJ — does Sleeper serve historical PRESEASON projections, and
if it does, are they genuinely preseason?

Implements `draft/backtest/SLEEPER-HIST-PROJ-PREREG.md`, committed BEFORE this
file and before any fetch. Every threshold below is that document's; changing
one here without changing it there breaks the preregistration.

WHY THIS EXISTS. Cory, 2026-08-16: *"we still haven't answered why we're
drafting are using sleeper projections vs fantasy pros vs a blend of both"*.
The board's `proj_mean` is Sleeper-derived and has never been graded against
anything, because three separate records assert the same blocking claim —

    exp_fp_hist_proj.json      "Sleeper's own historical skill remains
                                structurally unmeasurable until Jan 2027"
    projection_skill_backtest  "permanently unmeasurable"
    SOURCE-WEIGHT-PRIOR-PREREG "NOT constructible offline" -> deferred to 2027

— and **none of them ever asked the API.** `sleeper_import.fetch_projections`
is season-parameterized and probes three endpoint shapes. This asks it for
2023/2024/2025 and files whatever comes back.

REFUSAL-FIRST, in the exp33 / exp_fp_hist_proj tradition. Sleeper's
`/projections/nfl/regular/{season}` is a LIVE surface, not an archive: it is
the same URL the app reads in week 12. A projection revised during the season
and graded against that season's outcome is leakage, and it produces a
spectacular, worthless result about the source the board already uses — the
single most dangerous artifact this probe could emit. So the leak gates run
BEFORE any accuracy number exists, in a fixed order, and the first failing gate
is the year's filed verdict.

    no_fetch / no_rows /       nothing usable served               (step 1)
    no_scored_rows
    leaked_identity            projections ARE the realized totals (step 2)
    leaked_rho                 ordering too good to be a forecast
    leaked_timestamp           payload dates itself into the season
    leaked_markers /           a dead season is projected dead
    ambiguous_markers /
    no_markers
    regenerated                built from today's player DB, not archived
    clean                      every gate passed; a grade becomes licensable
                               UNDER ITS OWN SEPARATE PREREGISTRATION

PURE core (`evaluate_year` + every gate function): fixtures in, verdict out,
both arms unit-tested in `draft/tests/test_sleeper_hist_proj.py`. The egress
runs in CI only (`.github/workflows/sleeper-hist-proj.yml`) — the sandbox's
proxy answers `api.sleeper.app` with 000.

PRINTS COUNTS ONLY. No payload, no row, no player line, ever — the prereg
fixes that and `_key_census` is the only thing that touches raw rows.

Run (CI): python3 draft/backtest/sleeper_hist_proj.py
Writes draft/backtest/sleeper_hist_proj.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

from lab_projections import spearman           # noqa: E402  reused, unit-tested
from scoring import score_stat_line            # noqa: E402
from exp_fp_hist_proj import season_totals     # noqa: E402  same semantics, one definition

# ── preregistered constants (mirror SLEEPER-HIST-PROJ-PREREG.md exactly) ─────
YEARS = (2023, 2024, 2025)
CONTROL_YEAR = 2026            # the 13g positive control: the live board's season
LAST_SCORED_WEEK = 17
POSITIONS = ("QB", "RB", "WR", "TE")
MIN_N = 10

# step 1
PROJ_ROWS_FLOOR = 50
SCORED_ROWS_FLOOR = 50

# step 2 — L1 identity
IDENTITY_ABS = 0.5
IDENTITY_MIN_ACTUAL = 20.0
IDENTITY_FRAC_MAX = 0.05

# step 2 — L2 rank ceiling
LEAK_RHO_MAX = 0.90
BINDING_POSITIONS = ("WR", "RB")

# step 2 — L3 provenance
TIMESTAMP_KEYS = ("updated_at", "last_modified", "date", "generated_at",
                  "created", "ts", "week", "season_type", "category", "company")
CENSUS_MAX_CARDINALITY = 12    # only low-cardinality keys get a value histogram

# step 2 — L4 markers
MARKER_PRIOR_MIN = 200.0
MARKER_REALIZED_MAX = 30.0
MARKER_FULL_SEASON_MIN = 100.0
MARKER_LEAK_MAX = 60.0

# step 2 — L5 ghosts
GHOST_MIN = 10
LATEST_STORE_YEAR = 2025

OUT = HERE / "sleeper_hist_proj.json"


# ── payload shape ────────────────────────────────────────────────────────────
def stat_line(row) -> dict:
    """Sleeper serves two row shapes and `_best_payload` normalises only the
    OUTER container, not the row. `{pid: {stat: v}}` gives the stat line
    directly; `{pid: {player_id, stats: {...}, ...}}` nests it. Same rule
    `sleeper_import._rows_with_stats` uses, so the count this probe scores and
    the count the fetcher prints describe the same rows."""
    if not isinstance(row, dict):
        return {}
    inner = row.get("stats") if "stats" in row else row
    return inner if isinstance(inner, dict) else {}


def score_payload(payload: dict, scoring: dict) -> tuple[dict, dict]:
    """({pid: points}, counts). A row scoring exactly 0.0 is kept out of
    `scored` — under this table a genuine projection of a rostered skill player
    is never 0, so a zero is an empty stat line wearing a row, which is the
    failure mode `_PROJECTION_PATHS` exists to catch."""
    scored: dict[str, float] = {}
    counts = {"rows": 0, "rows_with_stats": 0, "rows_scored_nonzero": 0,
              "rows_scored_zero": 0}
    for pid, row in (payload or {}).items():
        counts["rows"] += 1
        line = stat_line(row)
        if not line or not any(isinstance(v, (int, float)) and v
                               for v in line.values()):
            continue
        counts["rows_with_stats"] += 1
        pts = score_stat_line({k: v for k, v in line.items()
                               if isinstance(v, (int, float))}, scoring)
        if pts:
            counts["rows_scored_nonzero"] += 1
            scored[str(pid)] = float(pts)
        else:
            counts["rows_scored_zero"] += 1
    return scored, counts


# ── L3: the key census. THE ONLY function that reads raw rows, and it emits
#    key names and counts — never a value that could carry a player. ──────────
def key_census(payload: dict) -> dict:
    """{key: {"rows": n, "values": {v: n}}} for keys of interest. `values` is
    present only when the key's cardinality is <= CENSUS_MAX_CARDINALITY, so a
    per-player field (a name, a total) can never be printed through here."""
    seen: dict[str, dict] = {}
    for row in (payload or {}).values():
        if not isinstance(row, dict):
            continue
        for k in row:
            if k == "stats":
                continue
            slot = seen.setdefault(k, {"rows": 0, "_vals": {}})
            slot["rows"] += 1
            v = row[k]
            if isinstance(v, (str, int, float, bool)) or v is None:
                slot["_vals"][repr(v)] = slot["_vals"].get(repr(v), 0) + 1
    out = {}
    for k, slot in sorted(seen.items()):
        entry = {"rows": slot["rows"], "distinct": len(slot["_vals"])}
        if 0 < len(slot["_vals"]) <= CENSUS_MAX_CARDINALITY:
            entry["values"] = dict(sorted(slot["_vals"].items(),
                                          key=lambda kv: -kv[1]))
        out[k] = entry
    return out


def gate_timestamp(census: dict, year: int) -> dict:
    """Does the payload date itself INTO the season it claims to forecast?

    A `week` marker that is a real in-season week number, or any date/updated
    field whose value reaches `{year}-09-01`, means these numbers were touched
    after kickoff. **No timestamp key at all is `no_timestamp` — undecidable,
    blocking nothing.** Absence is entered as absence."""
    present = {k: census[k] for k in TIMESTAMP_KEYS if k in census}
    if not present:
        return {"status": "no_timestamp", "keys_present": [],
                "note": ("the payload carries no date, week or update marker; "
                         "this gate is UNDECIDABLE and blocks nothing — had a "
                         "marker been present it would have named the season "
                         "it was generated in")}
    cutoff = f"{year}-09-01"
    hits = []
    for k, entry in present.items():
        for raw, n in (entry.get("values") or {}).items():
            v = raw.strip("'\"")
            if k == "week":
                try:
                    if 1 <= int(float(v)) <= 22:
                        hits.append({"key": k, "value": v, "rows": n,
                                     "why": "in-season week number"})
                except (TypeError, ValueError):
                    pass
                continue
            if k in ("season_type", "category", "company"):
                continue
            if isinstance(v, str) and len(v) >= 10 and v[:10] >= cutoff \
                    and v[4] == "-" and v[7] == "-":
                hits.append({"key": k, "value": v[:10], "rows": n,
                             "why": f"at or after {cutoff} kickoff"})
    return {"status": ("leaked_timestamp" if hits else "pass"),
            "keys_present": sorted(present), "hits": hits}


# ── L1: identity ─────────────────────────────────────────────────────────────
def gate_identity(proj: dict, actual: dict) -> dict:
    """Is the 'projection' the realized total? Only players who actually scored
    (>= IDENTITY_MIN_ACTUAL) are eligible — a bench player's 0-vs-0 would
    manufacture a match and inflate the fraction toward a false leak."""
    eligible, matches = 0, 0
    for pid, p in proj.items():
        a = actual.get(pid)
        if a is None or float(a) < IDENTITY_MIN_ACTUAL:
            continue
        eligible += 1
        if abs(float(p) - float(a)) <= IDENTITY_ABS:
            matches += 1
    if eligible < MIN_N:
        return {"status": "unmeasurable", "eligible": eligible,
                "matches": matches, "fraction": None}
    frac = matches / eligible
    return {"status": ("leaked_identity" if frac > IDENTITY_FRAC_MAX else "pass"),
            "eligible": eligible, "matches": matches, "fraction": round(frac, 4)}


# ── L2: rank ceiling ─────────────────────────────────────────────────────────
def _cell(pairs: list) -> dict:
    if len(pairs) < MIN_N:
        return {"n": len(pairs), "status": "unmeasurable"}
    errs = [p - a for p, a in pairs]
    return {"n": len(pairs), "status": "measured",
            "spearman": round(spearman([p for p, _ in pairs],
                                       [a for _, a in pairs]), 4),
            "mae": round(sum(abs(e) for e in errs) / len(errs), 2),
            "bias": round(sum(errs) / len(errs), 2)}


def build_population(proj: dict, actual: dict, positions: dict) -> dict:
    """The graded population, per the prereg. Exclusions are COUNTED, never
    scored as zero."""
    cells: dict[str, list] = {p: [] for p in POSITIONS}
    excl = {"excluded_no_position": 0, "excluded_no_weekly_row": 0}
    for pid, p in proj.items():
        pos = positions.get(pid)
        if pos not in POSITIONS:
            excl["excluded_no_position"] += 1
            continue
        a = actual.get(pid)
        if a is None:
            excl["excluded_no_weekly_row"] += 1
            continue
        cells[pos].append((float(p), float(a)))
    return {"cells": cells, "exclusions": excl}


def gate_rho(cells: dict) -> dict:
    """ρ > LEAK_RHO_MAX at a BINDING position is the leak. QB/TE are reported
    and gate nothing: both are shallow and top-heavy, where a genuine forecast
    legitimately reaches the high 0.8s."""
    graded = {p: _cell(cells.get(p) or []) for p in POSITIONS}
    over = [p for p in BINDING_POSITIONS
            if graded[p].get("status") == "measured"
            and graded[p]["spearman"] > LEAK_RHO_MAX]
    return {"status": ("leaked_rho" if over else "pass"),
            "over_ceiling": over, "cells": graded}


# ── L4: markers ──────────────────────────────────────────────────────────────
def derive_markers(prior_totals: dict, realized: dict, positions: dict) -> list:
    """A real asset last year (>= 200) whose graded season died (<= 30). No ADP
    archive needed — the committed stores carry everything this gate asks."""
    out = []
    for pid, prior in (prior_totals or {}).items():
        if float(prior) < MARKER_PRIOR_MIN:
            continue
        if positions.get(str(pid)) not in POSITIONS:
            continue
        real = float(realized.get(str(pid), 0.0))
        if real <= MARKER_REALIZED_MAX:
            out.append({"pid": str(pid), "pos": positions.get(str(pid)),
                        "prior": round(float(prior), 2), "realized": round(real, 2)})
    return sorted(out, key=lambda m: -m["prior"])


def gate_markers(markers: list, proj: dict) -> dict:
    """A preseason file still projects a season that died at full size; a
    post-hoc file already knows. Zero markers is UNDECIDABLE, not a pass."""
    if not markers:
        return {"status": "no_markers", "n": 0, "verdicts": {}}
    verdicts: dict[str, int] = {}
    for m in markers:
        v = proj.get(m["pid"])
        if v is None:
            k = "missing"
        elif float(v) >= MARKER_FULL_SEASON_MIN:
            k = "full_season"
        elif float(v) < MARKER_LEAK_MAX:
            k = "leak_sized"
        else:
            k = "ambiguous"
        verdicts[k] = verdicts.get(k, 0) + 1
    if verdicts.get("missing") or verdicts.get("leak_sized"):
        status = "leaked_markers"
    elif verdicts.get("ambiguous"):
        status = "ambiguous_markers"
    else:
        status = "pass"
    return {"status": status, "n": len(markers), "verdicts": verdicts}


# ── L5: ghosts ───────────────────────────────────────────────────────────────
def gate_ghosts(proj_pids, graded_realized: dict, latest_realized: dict,
                year: int) -> dict:
    if year >= LATEST_STORE_YEAR:
        return {"status": "not_applicable", "ghost_count": None,
                "note": "no later store exists to establish departure"}
    ghosts = [str(p) for p in proj_pids
              if str(p) in graded_realized and str(p) not in latest_realized]
    return {"status": ("pass" if len(ghosts) >= GHOST_MIN else "regenerated"),
            "ghost_count": len(ghosts)}


# ── the pure orchestrator ────────────────────────────────────────────────────
def evaluate_year(year: int, payload: dict, scoring: dict, realized: dict,
                  positions: dict, prior_totals: dict, latest_realized: dict,
                  census: dict | None = None) -> dict:
    """One year, gated in preregistered order. First failing gate is the
    verdict; NO metric is reported for a refused year — the cells computed for
    L2 are the LEAK DIAGNOSTIC and are carried inside that gate, not promoted
    to `metrics`, precisely so a leaked arm's number is never read as a grade.
    """
    res: dict = {"year": year, "gates": {}, "metrics": None}

    def refuse(status: str) -> dict:
        res["status"] = status
        return res

    proj, counts = score_payload(payload, scoring)
    res["counts"] = counts

    # ── STEP 1 ──
    if counts["rows"] == 0:
        return refuse("no_fetch")
    if counts["rows"] < PROJ_ROWS_FLOOR:
        return refuse("no_rows")
    if counts["rows_scored_nonzero"] < SCORED_ROWS_FLOOR:
        return refuse("no_scored_rows")

    # ── STEP 2 ──
    pop = build_population(proj, realized, positions)
    res["population"] = pop["exclusions"] | {
        "graded": sum(len(v) for v in pop["cells"].values())}

    l1 = gate_identity(proj, realized)
    res["gates"]["l1_identity"] = l1
    if l1["status"] == "leaked_identity":
        return refuse("leaked_identity")

    l2 = gate_rho(pop["cells"])
    res["gates"]["l2_rank_ceiling"] = l2
    if l2["status"] != "pass":
        return refuse("leaked_rho")

    l3 = gate_timestamp(census or {}, year)
    res["gates"]["l3_provenance"] = l3
    if l3["status"] == "leaked_timestamp":
        return refuse("leaked_timestamp")

    l4 = gate_markers(derive_markers(prior_totals, realized, positions), proj)
    res["gates"]["l4_markers"] = l4
    if l4["status"] != "pass":
        return refuse(l4["status"])

    l5 = gate_ghosts(proj, realized, latest_realized, year)
    res["gates"]["l5_ghosts"] = l5
    if l5["status"] not in ("pass", "not_applicable"):
        return refuse("regenerated")

    return refuse("clean")


# ── egress (CI only — the sandbox proxy answers api.sleeper.app with 000) ────
COMPONENT_SEASONS = (2021, 2022, 2023, 2024, 2025)


def _positions_from_components(season: int) -> dict:   # pragma: no cover
    """{pid: modal position} from one committed component store. Offline,
    leak-free (position is not an outcome), and it costs no egress."""
    path = HERE / f"component_stats_{season}.json"
    if not path.exists():
        return {}
    tally: dict[str, dict] = {}
    for wk in json.loads(path.read_text()).get("weeks", []):
        for pid, row in (wk.get("players") or {}).items():
            pos = row.get("pos")
            if pos:
                t = tally.setdefault(str(pid), {})
                t[pos] = t.get(pos, 0) + 1
    return {pid: max(t, key=t.get) for pid, t in tally.items()}


def _positions_for(season: int, per_season: dict) -> dict:
    """Every position we know, with the graded season's own answer winning.

    THE SEASON-ONLY MAP SILENTLY BREAKS L4, and that is why this exists: the
    STRONGEST marker is a 200-point player from year y-1 who never took a snap
    in year y — and he has no row in year y's component store, so a
    season-only map gives him no position and `derive_markers` drops exactly
    the players the gate was built to find. The union restores them; the
    graded season's own modal position still wins wherever it exists, so a
    genuine position change is not overwritten by an old one."""
    merged: dict[str, dict] = {}
    for y in COMPONENT_SEASONS:
        for pid, pos in per_season.get(y, {}).items():
            t = merged.setdefault(pid, {})
            t[pos] = t.get(pos, 0) + 1
    out = {pid: max(t, key=t.get) for pid, t in merged.items()}
    out.update(per_season.get(season, {}))
    return out


def _totals_2022(scoring: dict) -> dict:   # pragma: no cover
    """2022 realized totals for 2023's marker gate. No 2022 POINTS store
    exists, so it is built from component_stats_2022 under the SAME frozen
    table — the store-parity path the repo already pins. A failure here files
    `no_markers` for 2023 rather than skipping the gate."""
    try:
        import fetch_component_stats as FCS
        weekly = FCS.scored_weekly_points(2022, scoring, LAST_SCORED_WEEK)
    except Exception as exc:                                     # noqa: BLE001
        print(f"  ! 2022 totals unbuildable ({type(exc).__name__}) — "
              "2023 will file no_markers rather than skip the gate")
        return {}
    return {pid: round(sum(wks.values()), 2) for pid, wks in weekly.items()}


def egress_main() -> int:   # pragma: no cover
    import fetch_component_stats as FCS
    import sleeper_import as SL

    scoring = FCS.frozen_scoring_table()
    print(f"frozen scoring table: {len(scoring)} keys")

    stores = {y: json.loads((HERE / f"nflverse_weekly_points_{y}.json").read_text())
              for y in YEARS}
    realized = {y: season_totals(stores[y], LAST_SCORED_WEEK)[0] for y in YEARS}
    per_season = {y: _positions_from_components(y) for y in COMPONENT_SEASONS}
    positions = {y: _positions_for(y, per_season) for y in YEARS}
    print("positions known: " + ", ".join(
        f"{y}={len(positions[y])}" for y in YEARS))
    prior = {2024: realized[2023], 2025: realized[2024],
             2023: _totals_2022(scoring)}
    latest = realized[LATEST_STORE_YEAR]

    # ── 13g POSITIVE CONTROL, run FIRST. If the live season returns nothing
    #    either, a null for 2023-25 is a fact about this job and not about
    #    Sleeper, and the whole run is VOID rather than negative.
    print(f"── CONTROL {CONTROL_YEAR} " + "─" * 34)
    ctrl_payload = SL.fetch_projections(str(CONTROL_YEAR)) or {}
    _cp, ctrl_counts = score_payload(ctrl_payload, scoring)
    control = {"year": CONTROL_YEAR, "counts": ctrl_counts,
               "status": ("pass" if ctrl_counts["rows_scored_nonzero"]
                          >= SCORED_ROWS_FLOOR else "FAIL")}
    print(f"  control: {control['status']} — {ctrl_counts}")

    per_year = {}
    for year in YEARS:
        print(f"── {year} " + "─" * 40)
        try:
            payload = SL.fetch_projections(str(year)) or {}
        except Exception as exc:                                 # noqa: BLE001
            print(f"  ! fetch raised {type(exc).__name__}")
            payload = {}
        census = key_census(payload)
        res = evaluate_year(year, payload, scoring, realized[year],
                            positions[year], prior.get(year) or {},
                            latest, census)
        res["key_census"] = census
        per_year[year] = res
        print(f"  status: {res['status']}   counts: {res['counts']}")
        for gname, g in res["gates"].items():
            print(f"    {gname}: {g.get('status')}")
        if res["gates"].get("l2_rank_ceiling"):
            for p, c in res["gates"]["l2_rank_ceiling"]["cells"].items():
                print(f"      {p}: {c}")

    clean = [y for y, r in per_year.items() if r["status"] == "clean"]
    if control["status"] != "pass":
        headline = ("VOID — the 2026 positive control returned nothing usable, "
                    "so a null for 2023-25 is a fact about this job, the runner "
                    "or the proxy and NOT about Sleeper")
    elif clean:
        headline = (f"{len(clean)}/{len(YEARS)} season(s) passed every leak gate: "
                    f"{clean}. A three-way grade becomes licensable UNDER ITS OWN "
                    "SEPARATE PREREGISTRATION — no number is computed here.")
    else:
        headline = ("NO season passed the leak gates — the refusals above are the "
                    "filed answer to Cory's question, and no accuracy number was "
                    "computed for any refused year")

    out = {
        "_territory": "TERRITORY: A — produced by draft/backtest/sleeper_hist_proj.py",
        "_prereg": "draft/backtest/SLEEPER-HIST-PROJ-PREREG.md (committed before any fetch)",
        "_note": ("Feasibility + leakage verdict on Sleeper's HISTORICAL projection "
                  "endpoints, under our frozen scoring table. A year that failed a "
                  "gate carries its refusal as the verdict and NO accuracy number. "
                  "The rho cells inside l2_rank_ceiling are the LEAK DIAGNOSTIC, "
                  "not a grade — a leaked arm's number must never be read as one."),
        "control": control,
        "years": {str(y): per_year[y] for y in YEARS},
        "clean_years": clean,
        "headline": headline,
    }
    OUT.write_text(json.dumps(out, indent=1))
    print(f"\nwrote {OUT.name}\n{headline}")
    return 0


if __name__ == "__main__":   # pragma: no cover
    raise SystemExit(egress_main())
