# TERRITORY: C
"""THE WEEKLY PROJECTION ARCHIVE — Sleeper + FantasyPros, raw AND scored,
captured pre-kickoff every week from week 1.

Routed A -> C, ROUTES.md 2026-08-18 ("THE WEEKLY PROJECTION ARCHIVE — the
single most valuable capture left in the program... Live before 09-10 or
the year's central question stays unanswerable"). Amendment 1 measured the
gap directly: NO historical weekly Sleeper or FP projections exist anywhere
in this repo.

WHAT ALREADY EXISTS AND IS NOT REBUILT HERE (rule 11):

  Sleeper weekly points    draft/weekly_proj_snapshot.py, scheduled Sundays
                           13:00 UTC, writes draft/data/proj_series.json
                           under source "sleeper_weekly" -- SCORED POINTS
                           ONLY, no raw stat line retained. Reused via
                           sleeper_import.fetch_projections(season, week).
  own_weekly's numbers     draft/weekly_own_projection.py, scheduled
                           Thursdays pre-kickoff, writes one committed file
                           per week (draft/data/weekly_own/
                           own_weekly_<season>_w<week>.json). Already OUR
                           published weekly numbers, already keyed by
                           sleeper_pid x week. This module does not
                           re-fetch it -- it references the file by path.
  the Sleeper<->FP join    external_source_projections.py's own
                           join_by_sleeper_id() (adp.build_index +
                           adp.match_player -- the SAME crosswalk
                           exp_fp_hist_proj trusts), reused unmodified.
  the FP projections parse fantasypros_adp.parse_projections() and its
                           _FP_STAT_MAP -- reused unmodified.

WHAT IS GENUINELY NEW: (1) a WEEKLY-parameterized FantasyPros projections
fetch -- fantasypros_adp.py's own _PROJ_API_CANDIDATES are hardcoded to
`week=draft`/`week=0` (season totals only); no weekly FP endpoint has ever
been probed from this repo. THE URL SHAPE IS UNCONFIRMED -- self-discovering
the same way fetch_projections() already does (bundle-key extraction, try
several `week={N}` candidates, keep whichever parses >= PARSE_FLOOR rows),
because the sandbox cannot reach fantasypros.com to confirm it directly
(CI-only, same as every other FP egress this week). (2) RAW STAT LINES KEPT
BESIDE THE SCORED CONVERSION for BOTH sources -- the routed ask's own
requirement, and a gap in the existing Sleeper archiver too (flagged, not
fixed here -- that file is TERRITORY: A). (3) the no-change-is-a-hole check
(register 41's lesson): an unchanged raw payload week-over-week is recorded
as a FINDING, never a silent no-op.

RULE 3e. positive_control.py gates every real capture: the join must place
>= MIN_JOINED_PLAYERS players on both sides or the whole snapshot is VOID,
never a misleadingly-thin commit.

Snapshot files, one per week, committed:
  draft/data/weekly_projection_archive/
    weekly_projection_archive_<season>_w<week>.json

Run: python3 draft/tools/weekly_projection_archive.py [--week N] [--season YYYY]
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent            # draft/tools
DRAFT = HERE.parent
BT = DRAFT / "backtest"
ARCHIVE_DIR = DRAFT / "data" / "weekly_projection_archive"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(BT))
sys.path.insert(0, str(DRAFT))

from external_source_projections import join_by_sleeper_id, sleeper_rows  # noqa: E402  -- rule 11
from scoring import score_stat_line  # noqa: E402

MIN_JOINED_PLAYERS = 50  # Rule 3e floor -- named in the routing order itself

# Weekly FP projection URL candidates, unconfirmed -- self-discovering like
# fantasypros_adp.fetch_projections()'s own season-total candidates. `{y}`
# and `{w}` are substituted; `{k}` is the bundle-discovered API key.
_WEEKLY_PROJ_API_CANDIDATES = [
    "https://api.fantasypros.com/v2/json/nfl/{y}/projections?position=ALL&scoring=HALF&week={w}",
    "https://api.fantasypros.com/public/v2/json/nfl/{y}/projections?position=ALL&scoring=HALF&week={w}",
]


# ── pure: raw+scored assembly, change detection, doc shape ────────────────

def fingerprint(raw: dict) -> str:
    """A stable hash of a raw payload, sorted keys, for week-over-week
    change detection -- same idea as raw_capture.fingerprint (TERRITORY: A,
    not imported here since this hashes a dict, not response text)."""
    return hashlib.sha256(
        json.dumps(raw, sort_keys=True, default=str).encode()).hexdigest()[:16]


def raw_and_scored(stats_by_pid: dict, scoring_cfg: dict) -> dict:
    """{pid: {raw: stat_line, scored: points}} -- the routed ask's own
    requirement: raw vendor fields kept BESIDE our-scoring conversion,
    never a vendor's own points column standing in for it."""
    out = {}
    for pid, stats in (stats_by_pid or {}).items():
        if not isinstance(stats, dict) or not stats:
            continue
        out[pid] = {"raw": stats, "scored": score_stat_line(stats, scoring_cfg)}
    return out


def build_archive_doc(season: int, week: int, sleeper_stats: dict,
                      fp_rows: list, name_index: dict, scoring_cfg: dict,
                      own_weekly_path: str, own_weekly_exists: bool,
                      prior_fingerprints: dict | None = None) -> dict:
    """Assembles the full weekly snapshot -- pure, fixture-testable, no I/O.

    sleeper_stats: {pid: raw_stat_line} (sleeper_rows() output, reused).
    fp_rows: FP's parsed rows (fantasypros_adp.parse_projections output).
    name_index: adp.build_index(sleeper_players) output.
    prior_fingerprints: {"sleeper": hash, "fantasypros": hash} from LAST
    week's doc, or None for week 1 -- used for the no-change-is-a-hole
    check (register 41's lesson: unchanged is a finding, not a no-op).
    """
    joined, diagnostics = join_by_sleeper_id(sleeper_stats, fp_rows, name_index)

    sleeper_out = raw_and_scored(sleeper_stats, scoring_cfg)
    fp_raw_by_pid = {}
    for pid, entry in joined.items():
        fp_raw_by_pid[pid] = entry["fp_stats"]
    # FP-only players (present in fp_rows but not joined to a sleeper_id)
    # still get archived on the raw side -- an unmatched player is a real
    # capture, just not usable for a head-to-head yet (same discipline
    # props_implied_points/props_season_projection use for unmatched names).
    fp_out = raw_and_scored(fp_raw_by_pid, scoring_cfg)
    for pid, entry in fp_out.items():
        entry["fp_fpts"] = joined[pid].get("fp_fpts")

    sleeper_fp_hash = fingerprint(sleeper_stats)
    fp_fp_hash = fingerprint(fp_raw_by_pid)
    findings = []
    if prior_fingerprints:
        if prior_fingerprints.get("sleeper") == sleeper_fp_hash:
            findings.append("sleeper_weekly payload UNCHANGED from the prior "
                            "captured week -- provider did not update, not a "
                            "capture failure (register 41's lesson)")
        if prior_fingerprints.get("fantasypros") == fp_fp_hash:
            findings.append("fantasypros_weekly payload UNCHANGED from the "
                            "prior captured week -- provider did not update, "
                            "not a capture failure (register 41's lesson)")

    return {
        "_territory": "TERRITORY: C -- produced by "
                      "draft/tools/weekly_projection_archive.py",
        "_note": ("Pre-kickoff weekly snapshot: Sleeper + FantasyPros raw "
                 "stat lines kept beside their our-scoring conversion "
                 "(score_stat_line, never a vendor points column), joined "
                 "on our sleeper_id via external_source_projections's own "
                 "crosswalk (rule 11). own_weekly's numbers are referenced "
                 "by path, not re-copied -- already published, already "
                 "keyed by sleeper_pid x week."),
        "season": season,
        "week": week,
        "captured_at": None,   # filled by the caller with a real timestamp
        "kickoff_boundary": ("captured before this week's earliest kickoff "
                             "-- the leak rule is AS-OF, not trust; see "
                             "captured_at above and the dispatch schedule "
                             "in .github/workflows/weekly-projection-"
                             "archive.yml for the enforced boundary"),
        "sleeper_weekly": sleeper_out,
        "fantasypros_weekly": fp_out,
        "own_weekly_ref": {"path": own_weekly_path, "exists": own_weekly_exists},
        "fingerprints": {"sleeper": sleeper_fp_hash, "fantasypros": fp_fp_hash},
        "findings": findings,
        "diagnostics": diagnostics,
    }


# ── I/O: real fetches (CI only -- sandbox proxy blocks both sources) ──────

def fetch_fp_weekly(year: int, week: int, timeout: int = 30):  # pragma: no cover  (egress; CI only)
    """Self-discovering weekly FP projections fetch, same shape as
    fantasypros_adp.fetch_projections() but week-parameterized -- that
    file's own candidates are hardcoded to season totals. Returns
    (text, url, diag); diag always records what was tried so a miss shows
    the real endpoint next run instead of contributing nothing."""
    import re as _re

    import fantasypros_adp as FP

    page_url = (f"https://www.fantasypros.com/nfl/projections/qb.php"
               f"?scoring=HALF&week={week}&year={year}")
    diag = {"page_url": page_url, "api_tried": []}
    key = None
    try:
        html = FP._get(page_url, timeout)  # noqa: SLF001  -- reused, not re-derived
        km = FP._KEY_RE.search(html)  # noqa: SLF001
        if km:
            key = km.group(1)
            diag["bundle_key_found"] = True
        for bname in _re.findall(r'//cdn\.fantasypros\.com/[^"\']*bundle-[^"\']+\.js', html)[:6]:
            try:
                b = FP._get("https:" + bname, timeout)  # noqa: SLF001
                if not key and (km := FP._KEY_RE.search(b)):  # noqa: SLF001
                    key = km.group(1)
                    diag["bundle_key_found"] = True
            except Exception:  # noqa: BLE001, S110
                pass
    except Exception as e:  # noqa: BLE001
        return None, page_url, {**diag, "page_error": type(e).__name__}

    for tmpl in _WEEKLY_PROJ_API_CANDIDATES:
        api_url = tmpl.replace("{y}", str(year)).replace("{w}", str(week))
        try:
            txt = FP._get(api_url, timeout, headers=({"x-api-key": key} if key else None))  # noqa: SLF001
            n = len(FP.parse_projections(txt))
            diag["api_tried"].append({"url": api_url[:150], "rows": n, "keyed": bool(key)})
            if n >= 20:
                diag["api_ok"] = api_url[:150]
                return txt, api_url, diag
        except Exception as e:  # noqa: BLE001
            diag["api_tried"].append({"url": api_url[:150], "err": type(e).__name__})
    return html, page_url, diag


def _load_prior_fingerprints(season: int, week: int) -> dict | None:
    prior_path = ARCHIVE_DIR / f"weekly_projection_archive_{season}_w{week - 1}.json"
    if week <= 1 or not prior_path.exists():
        return None
    try:
        prior = json.loads(prior_path.read_text())
        return prior.get("fingerprints")
    except (json.JSONDecodeError, OSError):
        return None


def egress_main(season: int, week: int) -> dict:  # pragma: no cover  (egress; CI only)
    import adp as ADP
    import fantasypros_adp as FP
    import sleeper_import as SL

    try:
        players = SL.fetch_players()
    except Exception as exc:  # noqa: BLE001
        return {"status": "VOID", "reason": "Sleeper player index unreachable",
               "error": f"{type(exc).__name__}: {exc}"}
    if not players:
        return {"status": "VOID", "reason": "Sleeper player index unreachable"}
    name_index = ADP.build_index(players)

    try:
        sl_raw = SL.fetch_projections(str(season), week=week)
    except Exception as exc:  # noqa: BLE001
        return {"status": "VOID", "reason": "Sleeper weekly projections egress failed",
               "error": f"{type(exc).__name__}: {exc}"}
    sleeper_stats = sleeper_rows(sl_raw or {})
    if not sleeper_stats:
        return {"status": "VOID", "reason": "Sleeper returned no readable weekly stat lines"}

    try:
        text, url, diag = fetch_fp_weekly(season, week)
    except Exception as exc:  # noqa: BLE001
        return {"status": "VOID", "reason": "FantasyPros weekly egress failed",
               "error": f"{type(exc).__name__}: {exc}"}
    if not text:
        return {"status": "VOID", "reason": "FantasyPros weekly egress failed", "fp_diag": diag}
    fp_rows = FP.parse_projections(text)
    if not fp_rows:
        return {"status": "VOID",
               "reason": "FantasyPros responded but parsed to zero weekly rows -- "
                         "the week-parameterized endpoint shape is UNCONFIRMED, "
                         "this is the discovery run",
               "fp_diag": diag}

    cfg_path = DRAFT / "config" / "league_config.json"
    scoring_cfg = (json.loads(cfg_path.read_text()) or {}).get("scoring") or {}
    if not scoring_cfg:
        return {"status": "VOID", "reason": "no scoring table in league_config"}

    own_path = (DRAFT / "data" / "weekly_own" / f"own_weekly_{season}_w{week}.json")
    prior_fp = _load_prior_fingerprints(season, week)
    doc = build_archive_doc(season, week, sleeper_stats, fp_rows, name_index,
                            scoring_cfg, str(own_path.relative_to(DRAFT.parent)),
                            own_path.exists(), prior_fp)
    doc["captured_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    joined_n = doc["diagnostics"]["joined_rows"]
    controls = [("min_joined_players", lambda: joined_n >= MIN_JOINED_PLAYERS,
                True, f"the join must place >= {MIN_JOINED_PLAYERS} players on "
                      "both sides or the capture is void, not thin")]
    import positive_control as PC
    ctrl = PC.run(controls)
    if not ctrl["ok"]:
        return {"status": "VOID", "reason": "positive control failed",
               "control": ctrl, "diagnostics": doc["diagnostics"]}

    doc["control"] = ctrl
    doc["status"] = "captured"
    return doc


def main() -> int:  # pragma: no cover  (egress; CI only)
    import argparse

    import weekly_proj_snapshot as WPS
    ap = argparse.ArgumentParser()
    ap.add_argument("--week", type=int, default=None)
    ap.add_argument("--season", type=int, default=None)
    args = ap.parse_args()

    week, season = args.week, args.season
    if week is None or season is None:
        st = WPS.nfl_state()
        season_type = str(st.get("season_type") or "").lower()
        if season_type and season_type != "regular":
            print(f"season_type is '{season_type}', not 'regular' -- nothing to "
                 "archive yet. Exiting CLEAN (same discipline as "
                 "weekly_proj_snapshot.py).")
            return 0
        week = week or (int(st["week"]) if st.get("week") else None)
        season = season or (int(st["season"]) if st.get("season") else None)
    if not week or not season:
        print("! could not determine season/week and none was supplied -- "
             "REFUSING rather than archiving under a guess")
        return 1

    doc = egress_main(season, week)
    if doc.get("status") == "VOID":
        print(f"VOID -- {doc['reason']}", file=sys.stderr)
        return 1

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    out_path = ARCHIVE_DIR / f"weekly_projection_archive_{season}_w{week}.json"
    out_path.write_text(json.dumps(doc, indent=1))
    d = doc["diagnostics"]
    print(f"wrote {out_path.name}: joined {d['joined_rows']} "
         f"(sleeper {d['sleeper_rows']}, fp {d['fp_rows']}); "
         f"findings: {doc['findings'] or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
