#!/usr/bin/env python3
"""TERRITORY: D. Hydrate weekly props snapshots from the committed historical
stores, so the props arm can be backtested on 2023-25.

Prereg: draft/PROPS-WEEKLY-BACKTEST-PREREG-2026-08-27.md (P347, register 361).

REUSES rather than reimplements (Rule 11): the pricing is
props_season_projection.line_to_points / week_implied_points, including its
_any_td_rate, which is the only sound way to price the anytime-TD market and
returns None rather than guessing if this league ever prices rush_td and
rec_td differently. The snapshot shape is fetch_weekly_props.build_snapshot's
contract -- `players[pid].points` -- because that is what weekly_props_arm.py
reads.

ONE THING IS NOT REUSED, deliberately. props_season_projection.build_name_index
calls nfl_data_py.import_ids() over the network. This runs offline against the
id->name pairs already on disk (six sources, 4,267 pairs), because a backtest
that cannot be re-run without a network call is not reproducible. The
normalizer IS theirs (normalize_name), so the join behaves the same way
everywhere in the repo.

PROVENANCE, which is the point of the stamp: every snapshot written here is
marked `hydrated_from_historical` with the source store's sha256, and NEVER
`markets_confirmed_live`. A backtest fold must not be able to masquerade as a
live capture.

Controls gate the exit code:
  C1  KNOWN-POSITIVE, hand-computed: a player-week with exactly one market
      must price to line x that market's own rate in the frozen table.
  C2  the arm must actually LOAD what this writes -- weekly_props_arm's own
      loader, not a shape I assert is right.
  C3  K and DEF must be ABSENT from every snapshot. Props do not quote them;
      their presence would mean the name join matched the wrong people.
  C4  no snapshot may claim markets_confirmed_live.
"""
import argparse
import collections
import glob
import hashlib
import json
import os
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "tools"))

import props_season_projection as PSP          # noqa: E402
import fetch_component_stats as FCS            # noqa: E402
from weekly_props_arm import load_props_arm    # noqa: E402

# NOT draft/data/props — that directory is the LIVE capture path the 2026
# fetch writes into, and mixing backtest folds with live captures in one
# directory is a stronger version of exactly the failure the provenance stamp
# guards against. A field says "this is hydrated"; a separate directory means
# a live reader never sees a fold at all. The arm takes props_dir as a
# parameter, so nothing needs to change in it.
OUT_DIR = ROOT / "draft" / "data" / "props_backtest"
SEASONS = ("2023", "2024", "2025")


def offline_name_index():
    """{normalized_name: sleeper_id} from every id->name pair on disk.

    First-wins per normalized name, and collisions are COUNTED rather than
    silently resolved -- two different players normalizing to one key is a
    data-quality fact the caller should see, not something to average away.
    """
    idx, collisions = {}, collections.Counter()
    for pat in ("draft/data/*.json", "draft/backtest/*.json", "public/*.json"):
        for f in sorted(glob.glob(str(ROOT / pat))):
            try:
                if os.path.getsize(f) > 40_000_000:
                    continue
                doc = json.load(open(f))
            except Exception:
                continue

            def walk(o):
                if isinstance(o, dict):
                    pid = o.get("player_id") or o.get("sleeper_id") or o.get("id")
                    nm = o.get("name") or o.get("full_name") or o.get("player_name")
                    if pid and isinstance(nm, str) and nm:
                        k = PSP.normalize_name(nm)
                        if k not in idx:
                            idx[k] = str(pid)
                        elif idx[k] != str(pid):
                            collisions[k] += 1
                    for v in o.values():
                        walk(v)
                elif isinstance(o, list):
                    for v in o:
                        walk(v)

            walk(doc)
    return idx, collisions


def hydrate(write=True):
    table = FCS.frozen_scoring_table()
    idx, collisions = offline_name_index()
    positions = json.load(open(ROOT / "draft/data/player_positions.json"))
    positions = positions.get("positions") or positions

    written, stats = [], collections.Counter()
    unmatched_all = set()
    for season in SEASONS:
        src = ROOT / ("draft/backtest/historical_props_%s.json" % season)
        raw = src.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        doc = json.loads(raw)
        for wk in doc["weeks"]:
            week = int(wk["week"])
            priced_by_name = PSP.week_implied_points(wk.get("players") or {}, table)
            players, unmatched = {}, []
            for name, pts in priced_by_name.items():
                pid = PSP.match_player_name(name, idx)
                if pid is None:
                    unmatched.append(name)
                    continue
                if pts is None:
                    continue
                players[str(pid)] = {"points": round(float(pts), 2),
                                     "markets": sorted((wk["players"][name] or {}).keys())}
            unmatched_all.update(unmatched)
            stats["priced"] += len(players)
            stats["unmatched"] += len(unmatched)
            snap = {
                "_territory": "TERRITORY: D — produced by "
                              "draft/tools/hydrate_weekly_props_from_historical.py",
                "_note": ("BACKTEST HYDRATION, not a live capture. Implied points for one "
                          "week, priced from the committed historical prop-line store under "
                          "this league's frozen scoring table. A player with no quoted "
                          "market that week is ABSENT, never a zero."),
                "season": int(season), "week": week,
                "formula": PSP.__name__ + ".line_to_points",
                "provenance": {
                    "source": "hydrated_from_historical",
                    "source_store": os.path.relpath(src, ROOT),
                    "source_sha256": sha,
                    "markets_confirmed_live": [],
                    "why": "prereg §8 — a backtest fold must not be able to "
                           "masquerade as a live capture.",
                },
                "players": players,
                "unmatched_names": sorted(unmatched),
            }
            path = OUT_DIR / ("weekly_props_%s_w%d.json" % (season, week))
            if write:
                OUT_DIR.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(snap, indent=1))
            written.append((season, week, len(players), len(unmatched)))
    return written, stats, unmatched_all, collisions, positions, table


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    written, stats, unmatched, collisions, positions, table = hydrate(write=not a.dry_run)

    print("hydrated %d week-snapshots across %s" % (len(written), "/".join(SEASONS)))
    print("  priced player-weeks: %d   unmatched name-weeks: %d   distinct unmatched names: %d"
          % (stats["priced"], stats["unmatched"], len(unmatched)))
    print("  normalized-name collisions in the offline index: %d" % len(collisions))

    ctl = {}
    # C1 — hand-computed known positive on a single-market player-week
    hit = None
    for season, week, _, _ in written:
        doc = json.loads(json.loads(json.dumps(
            (OUT_DIR / ("weekly_props_%s_w%d.json" % (season, week))).read_text()))) \
            if False else json.loads((OUT_DIR / ("weekly_props_%s_w%d.json" % (season, week))).read_text())
        raw = json.loads((ROOT / ("draft/backtest/historical_props_%s.json" % season)).read_text())
        wkraw = next(w for w in raw["weeks"] if int(w["week"]) == week)
        for pid, row in doc["players"].items():
            if len(row["markets"]) != 1:
                continue
            m = row["markets"][0]
            name = next((n for n, s in wkraw["players"].items()
                         if sorted((s or {}).keys()) == [m]
                         and str(PSP.match_player_name(n, offline_name_index()[0]) or "") == pid), None)
            if name is None:
                continue
            rate = table.get(m) or (PSP._any_td_rate(table) if m == "any_td" else None)
            if rate is None:
                continue
            want = round(float(wkraw["players"][name][m]) * float(rate), 2)
            hit = {"season": season, "week": week, "player": name, "market": m,
                   "line": wkraw["players"][name][m], "rate": rate,
                   "want": want, "got": row["points"]}
            break
        if hit:
            break
    ctl["C1_hand_computed_single_market"] = {
        "ok": bool(hit) and abs(hit["want"] - hit["got"]) < 0.02, "detail": hit}

    # C2 — the ARM's own loader must read it
    s0, w0, _, _ = written[0]
    loaded = load_props_arm(OUT_DIR, int(s0), w0)
    ctl["C2_the_arm_loads_it"] = {
        "ok": bool(loaded), "n": len(loaded or {}),
        "why": "weekly_props_arm.load_props_arm, not a shape I assert is right"}

    # C3 — no kickers or defences
    kd = collections.Counter()
    for season, week, _, _ in written:
        doc = json.loads((OUT_DIR / ("weekly_props_%s_w%d.json" % (season, week))).read_text())
        for pid in doc["players"]:
            p = positions.get(str(pid))
            if isinstance(p, str) and p in ("K", "DEF"):
                kd[p] += 1
    ctl["C3_no_K_or_DEF"] = {"ok": not kd, "found": dict(kd),
                             "why": "props do not quote them; presence means the join matched the wrong people"}

    # C4 — nothing may claim a live capture
    bad = []
    for season, week, _, _ in written:
        doc = json.loads((OUT_DIR / ("weekly_props_%s_w%d.json" % (season, week))).read_text())
        pv = doc.get("provenance", {})
        if pv.get("source") != "hydrated_from_historical" or pv.get("markets_confirmed_live"):
            bad.append((season, week))
    ctl["C4_never_claims_live"] = {"ok": not bad, "bad": bad[:5]}

    print("\ncontrols:")
    for k, v in ctl.items():
        print("  %s %s %s" % ("OK " if v["ok"] else "!! ", k,
                              json.dumps({x: y for x, y in v.items() if x != "why"})[:220]))
    if any(not v["ok"] for v in ctl.values()):
        print("\n⛔ CONTROLS FAILED — the snapshots are written but are NOT a measurement.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
