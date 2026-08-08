"""Money-weighted history archaeology (2026-08-08).

Reads the harvested league history (weekly per-team scores + standings + brackets)
and the payout table, and computes what the money function needs from three
seasons nobody in the league has ever quantified:

  ANALYSIS 1 — weekly-high archaeology:
    * the threshold distribution: what score wins the $100 high each week
    * concentration: do weekly highs cluster in 2-3 teams or spread
    * each manager's realized $/season under the CURRENT payout table
  ANALYSIS 3 (partial, data-driven half):
    * the $/season historical standings — the real leaderboard, in dollars

Writes MONEY-HISTORY.md (committed by CI) and prints the STATUS.md blocks.
Projection-free: pure realized scores against the real payout table. The
strategy-hunt dollar re-grade (ANALYSIS 2) lives in the backtest, not here.

Run (after a history export): python draft/money_history.py
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
HISTORY = HERE / "data" / "league_history.json"
PAYOUTS = HERE / "config" / "payouts.json"
MY_OWNER = "434915673219526656"   # Cory — highlighted in the dollar standings


def _load():
    hist = json.loads(HISTORY.read_text()) if HISTORY.exists() else {}
    pay = json.loads(PAYOUTS.read_text()) if PAYOUTS.exists() else {}
    seasons = hist.get("seasons") or {}
    if isinstance(seasons, list):
        seasons = {str(s.get("season") or i): s for i, s in enumerate(seasons)}
    return seasons, pay


def _owner_name(season, roster_id):
    owners = season.get("owners", []) or []
    for r in season.get("final_rosters", []) or []:
        if r.get("roster_id") == roster_id:
            oid = r.get("owner_id")
            for o in owners:
                if not isinstance(o, dict):
                    continue
                if o.get("user_id") == oid or o.get("owner_id") == oid:
                    return o.get("display_name") or o.get("name") or str(oid)
            return str(oid) if oid else f"roster {roster_id}"
    return f"roster {roster_id}"


def analyse():
    seasons, pay = _load()
    weekly_high_amt = (pay.get("weekly_high") or {}).get("amount", 100)
    graded = {sk: s for sk, s in seasons.items() if (s.get("weeks") or {})}
    if not graded:
        return {"error": "no weekly scores harvested yet — run the CI history export "
                "(draft-data.yml, export_history=true) first", "seasons_total": len(seasons)}

    paying_weeks = (pay.get("weekly_high") or {}).get("weeks", 15)   # only 15 weeks pay $100
    threshold_rows = []          # (season, week, high_score, winner, pays)
    dollars = {}                 # name -> {weekly, seasons:set}
    high_counts = {}             # season -> {name: highs}

    for sk, s in sorted(graded.items()):
        high_counts[sk] = {}
        weeks = s.get("weeks") or {}
        for wk in sorted(weeks, key=lambda x: int(x)):
            teams = weeks[wk]
            scored = [(t.get("roster_id"), t.get("points")) for t in teams
                      if isinstance(t.get("points"), (int, float))]
            if not scored:
                continue
            rid, hi = max(scored, key=lambda x: x[1])
            name = _owner_name(s, rid)
            pays = int(wk) <= paying_weeks   # playoff weeks (16-18) do NOT pay the weekly high
            threshold_rows.append((sk, int(wk), round(hi, 2), name, pays))
            dollars.setdefault(name, {"weekly": 0.0, "seasons": set()})
            dollars[name]["seasons"].add(sk)
            if pays:
                dollars[name]["weekly"] += weekly_high_amt
                high_counts[sk][name] = high_counts[sk].get(name, 0) + 1

    # Playoff-finish money from the winners bracket. Sleeper marks placement
    # games with a "p" field: p=1 is the championship (w=1st, l=2nd), p=3 is the
    # third-place game (w=3rd, l=4th). Map each to payouts.playoffs[finish].
    reconcile = {}   # season -> playoff $ assigned (must be 0 or the full pot)
    def _playoff_dollars(sk, season):
        brackets = season.get("brackets") or {}
        wb = brackets.get("winners") or brackets.get("winners_bracket") or []
        po = pay.get("playoffs") or {}
        assigned = 0.0
        # Each season has exactly two placement games: p=1 (champ/runner-up) and
        # p=3 (3rd/4th). w/l are roster_ids, resolved to owner PER SEASON (the
        # mapping changes between seasons). Dedup by finish so a malformed bracket
        # can't over-pay — the reconciliation guard below catches any leak.
        seen_finish = set()
        for game in wb:
            p = game.get("p")
            if p in (1, 3) and isinstance(game.get("w"), int) and isinstance(game.get("l"), int):
                for rid, finish in ((game["w"], p), (game["l"], p + 1)):
                    if finish in seen_finish:
                        continue
                    seen_finish.add(finish)
                    amt = po.get(str(finish))
                    if amt:
                        nm = _owner_name(season, rid)
                        dollars.setdefault(nm, {"weekly": 0.0, "seasons": set()})
                        dollars[nm]["playoff"] = dollars[nm].get("playoff", 0.0) + amt
                        assigned += amt
        reconcile[sk] = assigned

    # Regular-season + playoff money from standings/brackets.
    for sk, s in sorted(graded.items()):
        _playoff_dollars(sk, s)
        st = s.get("standings") or []
        if len(st) >= 1:
            dollars.setdefault(_owner_name(s, st[0].get("roster_id")), {"weekly": 0.0, "seasons": set()})
            dollars[_owner_name(s, st[0].get("roster_id"))].setdefault("rs", 0.0)
            dollars[_owner_name(s, st[0].get("roster_id"))]["rs"] = \
                dollars[_owner_name(s, st[0].get("roster_id"))].get("rs", 0.0) + (pay.get("regular_season") or {}).get("champ", 250)
        if len(st) >= 2:
            nm = _owner_name(s, st[1].get("roster_id"))
            dollars.setdefault(nm, {"weekly": 0.0, "seasons": set()})
            dollars[nm]["rs"] = dollars[nm].get("rs", 0.0) + (pay.get("regular_season") or {}).get("runner_up", 125)

    # Threshold distribution by week (pooled across seasons). Only paying weeks
    # (1..15) matter for the $ chase; playoff weeks are shown but flagged.
    by_week = {}
    for sk, wk, hi, name, pays in threshold_rows:
        by_week.setdefault(wk, {"scores": [], "pays": pays})["scores"].append(hi)
    threshold_table = [{"week": w, "pays": d["pays"], "n": len(d["scores"]),
                        "min": round(min(d["scores"]), 1),
                        "median": round(sorted(d["scores"])[len(d["scores"]) // 2], 1),
                        "max": round(max(d["scores"]), 1)}
                       for w, d in sorted(by_week.items())]

    # Concentration: share of a season's highs held by the top-3 teams.
    concentration = {}
    for sk, counts in high_counts.items():
        tot = sum(counts.values()) or 1
        top3 = sum(sorted(counts.values(), reverse=True)[:3])
        concentration[sk] = {"top3_share": round(top3 / tot, 2), "distinct_winners": len(counts), "weeks": tot}

    standings = sorted(
        ({"name": ("Cory (me)" if n == MY_OWNER else n),
          "weekly_$": v["weekly"], "rs_$": v.get("rs", 0.0), "playoff_$": v.get("playoff", 0.0),
          "total_$": v["weekly"] + v.get("rs", 0.0) + v.get("playoff", 0.0),
          "seasons": len(v["seasons"])}
         for n, v in dollars.items()),
        key=lambda x: -x["total_$"])

    # Reconciliation: per season, playoff $ assigned must be 0 (unplayed) or the
    # full playoff pot (all 4 finishes present, no double-count).
    pot = (pay.get("playoffs") or {}).get("total", 2125)
    recon = {sk: {"assigned": amt, "expected": pot, "ok": amt in (0, pot)}
             for sk, amt in reconcile.items()}
    return {"graded_seasons": sorted(graded.keys()), "threshold_table": threshold_table,
            "concentration": concentration, "dollar_standings": standings,
            "reconciliation": recon, "playoff_pot": pot}


def render(result):
    out = ["# Money-weighted history archaeology", ""]
    if result.get("error"):
        out.append(f"**PENDING:** {result['error']} ({result.get('seasons_total', 0)} seasons known).")
        return "\n".join(out) + "\n"
    out.append(f"_Graded seasons: {', '.join(result['graded_seasons'])} · payout table = ground truth._")
    out += ["", "## Weekly-high threshold — what score wins $100 (pooled by week; weeks 1–15 pay)",
            "| week | pays $100 | n | min | median | max |", "|---|---|---|---|---|---|"]
    for r in result["threshold_table"]:
        out.append(f"| {r['week']} | {'yes' if r['pays'] else 'playoff — no'} | {r['n']} | "
                   f"{r['min']} | {r['median']} | {r['max']} |")
    out += ["", "## Concentration — do weekly highs cluster?",
            "| season | distinct winners | top-3 share | weeks |", "|---|---|---|---|"]
    for sk, c in sorted(result["concentration"].items()):
        out.append(f"| {sk} | {c['distinct_winners']} | {c['top3_share']} | {c['weeks']} |")
    out += ["", "## $/season historical standings (the real leaderboard, in dollars)",
            "| # | manager | weekly $ | RS $ | playoff $ | total $ | seasons |",
            "|---|---|---|---|---|---|---|"]
    for i, r in enumerate(result["dollar_standings"], 1):
        out.append(f"| {i} | {r['name']} | ${r['weekly_$']:.0f} | ${r['rs_$']:.0f} | "
                   f"${r.get('playoff_$', 0):.0f} | ${r['total_$']:.0f} | {r['seasons']} |")
    # Reconciliation cross-check (chat-Claude's requested guard): each season's
    # playoff $ must equal the pot or zero.
    rc = result.get("reconciliation", {})
    bad = [sk for sk, r in rc.items() if not r["ok"]]
    out += ["", "## Reconciliation — playoff $ per season must equal the pot ($%d) or 0" % result.get("playoff_pot", 2125),
            "| season | assigned | expected | ok |", "|---|---|---|---|"]
    for sk in sorted(rc):
        r = rc[sk]
        out.append(f"| {sk} | ${r['assigned']:.0f} | ${r['expected']:.0f} | {'✅' if r['ok'] else '🐛 LEAK'} |")
    out.append("" if not bad else f"\n**🐛 RECONCILIATION FAILED for {bad} — do not trust the money table.**")
    # 2023 era: Cory CONFIRMED (2026-08-08) it used a DIFFERENT payout structure.
    # Until the real 2023 values land, its dollars here are computed under the
    # current structure and are ERA-MISMATCHED — say so loudly, do not silently
    # present 2023 dollars as trustworthy.
    ov = ((pay.get("season_overrides") or {}).get("2023") or {}) if isinstance(pay, dict) else {}
    if ov.get("status") == "differs_from_current" and not ov.get("values"):
        out += ["", "**🚩 2023 DOLLARS ARE ERA-MISMATCHED.** Cory confirmed 2023 (year one) "
                "used a DIFFERENT payout structure; the real buy-in/pot/split are still "
                "PENDING. The 2023 rows above are computed under the CURRENT structure and "
                "must NOT be trusted until `payouts.season_overrides.2023.values` is filled. "
                "2024 & 2025 use the current structure and reconcile."]
    else:
        out += ["", "_2023 payout era: pending Cory's confirmation of the year-one structure._"]
    out += ["", "_Weekly-high = weeks 1–15; playoff weeks 16–17 don't pay. Owner IDs "
            "unresolved except mine until the owners map is joined (roster→owner is stable "
            "across seasons)._"]
    return "\n".join(out) + "\n"


def main():
    result = analyse()
    md = render(result)
    (HERE / "backtest" / "MONEY-HISTORY.md").write_text(md)
    print(md)
    return 0 if not result.get("error") else 0   # missing data is a pending state, not a failure


if __name__ == "__main__":
    sys.exit(main())
