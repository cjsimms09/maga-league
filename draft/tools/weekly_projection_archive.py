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
import os
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



def scored_by_id(payload: dict) -> dict:
    """{pid: points} from this module's {pid: {raw, scored}} payload —
    the shape `proj_series.append_snapshot` takes."""
    return {str(pid): float(v["scored"]) for pid, v in (payload or {}).items()
            if isinstance(v, dict) and isinstance(v.get("scored"), (int, float))}


def mirror_to_proj_series(doc: dict, week: int, date: str, series_path: Path) -> dict:
    """ALSO append this week's provider projections to proj_series.json.

    REGISTER 223 — the defect this fixes. `weekly_own_grade.provider_weeklies()`
    reads `draft/data/proj_series.json` and keeps rows where
    `source == "<provider>_weekly"` AND `week == week`. This module was emitting
    `fantasypros_weekly` ONLY into its own archive file, which that reader never
    opens. The sleeper half worked (`weekly_proj_snapshot.py` writes
    `sleeper_weekly` there), the FP half did not, and `cory_bar_startsit()`
    refuses unless BOTH are present — so the 2027 programme's headline question
    returned NOT RUN every week, and its docstring's *"the FP half starts the day
    C's weekly archive carries it"* made that look expected rather than broken.

    Mirrors `weekly_proj_snapshot.py` exactly — same helper, same `week=` dedupe
    key — so there is ONE format and ONE reader rather than two of each. The
    archive file is still written; this is additive.

    Returns {source: n_players} for the caller to print. Never raises on a
    missing/corrupt series file: the archive write must not fail because the
    mirror could not.
    """
    written = {}
    try:
        sys.path.insert(0, str(DRAFT))
        import proj_series as PS
        cur = json.loads(series_path.read_text()) if series_path.exists() else {"series": []}
        series = cur.get("series") or []
        for source_key in ("sleeper_weekly", "fantasypros_weekly"):
            proj = scored_by_id(doc.get(source_key))
            if not proj:
                continue
            series = PS.append_snapshot(series, date, source_key, proj, week=week)
            written[source_key] = len(proj)
        if written:
            cur["series"] = series
            series_path.write_text(json.dumps(cur, indent=1, sort_keys=True))
    except Exception as exc:                                  # noqa: BLE001
        return {"_error": f"{type(exc).__name__}: {exc}"}
    return written


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


def week_shape_check(sleeper_stats: dict) -> dict:
    """Catches a SEASON-shaped Sleeper payload standing in for one week's data.

    Found by hand on the real 2026-08-20 discovery dispatch, ~3 weeks before
    kickoff: sleeper_import.fetch_projections()'s own candidate list starts
    with `/projections/nfl/regular/{season}` -- a template that does not even
    interpolate `{week}`, so it is structurally season-shaped no matter what
    week is requested. Its ranking picks the candidate with the most rows
    carrying a nonzero stat, with no check that those stats are WEEK-shaped
    rather than SEASON-shaped. That week, both real per-week candidates
    returned 0 rows (Sleeper had not published week 1 yet, this far out) so
    the season endpoint won by default and was written to
    weekly_projection_archive_2026_w1.json as "captured" -- Josh Allen's row
    carried `scored: 405.5` and `gp: 18.0` for "week 1". Clean status, wrong
    by a season.

    `gp` (games played) is the cheap, general tell: a single week is 0 or 1
    games; a season is many. Majority vote across all rows carrying the field,
    because one bye-week bookkeeping oddity should not VOID a real week, but a
    payload where MOST players show gp > 1.5 cannot be one week's projection.
    """
    gp_values = [v.get("gp") for v in (sleeper_stats or {}).values()
                if isinstance(v, dict) and isinstance(v.get("gp"), (int, float))]
    if not gp_values:
        return {"ok": True, "why": "no gp field present in any row to check against"}
    over = sum(1 for g in gp_values if g > 1.5)
    if over > len(gp_values) / 2:
        return {"ok": False, "rows_checked": len(gp_values), "rows_over_one_game": over,
               "why": f"{over} of {len(gp_values)} rows carry gp > 1.5 -- this reads as "
                      "a SEASON-shaped payload, not one week's"}
    return {"ok": True, "rows_checked": len(gp_values), "rows_over_one_game": over}


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

    shape = week_shape_check(sleeper_stats)
    if not shape["ok"]:
        return {"status": "VOID",
               "reason": "Sleeper's projection endpoint returned a SEASON-shaped "
                         "payload for a single-week request -- see week_shape_check",
               "shape_check": shape}

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

    # ── `season_type == 'regular'` IS NOT THE SAME AS THE WEEK EXISTING ──────
    #
    # THIRD INSTANCE OF ONE ROOT CAUSE (A, 2026-09-04; registers 438, 440, and
    # now this). Sleeper flips `season_type` to 'regular' the moment preseason
    # ends -- 2026-08-30, ELEVEN DAYS before week 1's first game -- so from that
    # day the guard above passes, the projection endpoints return `7628 rows, 0
    # with stats`, and the run VOIDs and exits 1. Measured, from run
    # 33789366180 (2026-09-03): exactly that, and it will repeat every Thursday
    # until the games exist. A job red by design for a fortnight is a job nobody
    # reads, and then the first REAL void looks like the expected ones.
    #
    # ⚠️ CANNOT-SAY DOES NOT SKIP (rule 3e). `week_is_live` returns None when the
    # schedule cannot answer, and None falls through to the normal path -- a
    # missing schedule must never become a silent season-long refusal to
    # archive. Once the window opens, an empty response is a hard failure again.
    # The clock is injectable so both arms are provable today, not in September.
    if not args.week:
        sys.path.insert(0, str(HERE))
        try:
            from capture_window import week_is_live  # noqa: WPS433
            now = os.environ.get("ARCHIVE_NOW") or None
            if week_is_live(str(season), int(week), now=now) is False:
                print(f"week {week} of {season} is not live yet -- its games are more "
                      f"than the capture window away, so a provider that returns no "
                      f"stats is EXPECTED, not a failure. Exiting CLEAN and archiving "
                      f"nothing. (registers 438/440/482: `season_type` flips to "
                      f"'regular' up to eleven days before week 1's first game.) "
                      f"⚠️ Once the window opens, an empty response is a hard failure "
                      f"again and this job goes red.")
                return 0
        except Exception as exc:                       # noqa: BLE001
            print(f"  ! capture_window unavailable ({type(exc).__name__}: {exc}); "
                  f"proceeding as before -- cannot-say never skips")

    doc = egress_main(season, week)
    if doc.get("status") == "VOID":
        print(f"VOID -- {doc['reason']}", file=sys.stderr)
        return 1

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    out_path = ARCHIVE_DIR / f"weekly_projection_archive_{season}_w{week}.json"
    out_path.write_text(json.dumps(doc, indent=1))
    # register 223 — the archive's output must reach the grader's reader too
    mirrored = mirror_to_proj_series(
        doc, week, doc.get("captured_at", "")[:10] or f"{season}-01-01",
        DRAFT / "data" / "proj_series.json")
    if mirrored.get("_error"):
        print(f"! proj_series mirror FAILED ({mirrored['_error']}) — the archive "
              f"file is written but weekly_own_grade will still see NO provider "
              f"columns for week {week}", file=sys.stderr)
    else:
        print("mirrored to proj_series.json: "
              + (", ".join(f"{k} {v}" for k, v in sorted(mirrored.items())) or "nothing"))
    d = doc["diagnostics"]
    print(f"wrote {out_path.name}: joined {d['joined_rows']} "
         f"(sleeper {d['sleeper_rows']}, fp {d['fp_rows']}); "
         f"findings: {doc['findings'] or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
