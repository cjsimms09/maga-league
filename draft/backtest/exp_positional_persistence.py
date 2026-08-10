#!/usr/bin/env python3
"""RB-vs-WR AT THE TOP — is it a persistent edge, or a 2024 fluke? (Cory's observation)

Cory: "5 RBs outscored every WR but Chase in 2024 — does our board/doctrine reflect RB
dominance?" exp_value_pockets already shows RB's top-band realized mean (~182) above WR's
(~165) POOLED over 2023-25, and reproduces the RB mid-round dead-zone. But "in 2024" is the
load-bearing word: a single RB-friendly season can manufacture a pooled gap that will not
repeat, and tilting a draft toward RB on a one-year artifact is exactly the mistake the
evidence discipline exists to prevent. Pooled cannot tell fluke from signal — only the
PER-SEASON split can.

THE QUESTION: at Cory's EARLY pick bands (his first picks land ~31-70 overall), does RB's
realized value beat WR's in EACH season, or only in 2024?

PRE-REGISTERED DECISION RULE (fixed before looking at the per-season numbers):
  * RB-tilt SUPPORTED  — RB_mean > WR_mean at the early bands in >=2 of 3 seasons AND the
    pooled early-band gap is materially positive (>= 15 realized pts) at n >= 8/pos/season.
    Even then it INSTALLS NOTHING without the money gate (realized-vs-ADP-dollars, not
    realized-vs-cross-position-average) — it becomes a close-call tie-breaker candidate.
  * FLUKE / NULL       — the gap holds only in 2024 (sign flips or vanishes in 2023/2025),
    OR per-season n is too thin to call. Then Cory's 2024 read does NOT generalize and the
    board should not tilt RB on it. Reported as a null, honestly.

DISCIPLINE: ~400 picks / 3 seasons total, so per-season early-band cells are SMALL (~10/pos).
Every cell's n is printed; a split too thin to separate fluke from signal is itself the
finding, not a number to force. Local data (exp25 spine); no egress.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import exp25_deadzone as DZ  # noqa: E402  reuse load_picks (overall, position, realized, season)

# Cory's early picks land here (build log: my_picks start 34, 41, 54, 61, ...). This is the
# region where an RB-over-WR tilt would actually change his choices; the deep board is moot.
EARLY_LO, EARLY_HI = 31, 70
MIN_CELL = 8          # below this a per-season position cell is flagged too-thin, not trusted
MATERIAL_GAP = 15.0   # realized-point gap the pre-reg rule calls "material"


def _mean(xs):
    return round(sum(xs) / len(xs), 1) if xs else None


def early_band_by_season(picks: list[dict], lo=EARLY_LO, hi=EARLY_HI) -> dict:
    """RB vs WR realized means in the early band [lo,hi], split by season. Returns
    {season: {pos: {mean, n}}} plus the RB-WR gap per season."""
    out: dict = {}
    for p in picks:
        ov = p.get("overall")
        if ov is None or not (lo <= int(ov) <= hi):
            continue
        pos = p.get("position")
        if pos not in ("RB", "WR") or p.get("realized") is None:
            continue
        s = p.get("season")
        out.setdefault(s, {}).setdefault(pos, []).append(float(p["realized"]))
    rows = {}
    for s, bypos in sorted(out.items()):
        rb, wr = bypos.get("RB", []), bypos.get("WR", [])
        rows[s] = {
            "RB": {"mean": _mean(rb), "n": len(rb)},
            "WR": {"mean": _mean(wr), "n": len(wr)},
            "rb_minus_wr": (round(_mean(rb) - _mean(wr), 1)
                            if rb and wr else None),
            "thin": len(rb) < MIN_CELL or len(wr) < MIN_CELL,
        }
    return rows


def per_band_by_season(picks: list[dict]) -> dict:
    """The finer view: RB-WR gap per 10-pick band per season, so a reader can see WHERE
    (if anywhere) the dominance lives rather than trusting one pooled early number."""
    out: dict = {}
    for p in picks:
        ov, pos = p.get("overall"), p.get("position")
        if ov is None or pos not in ("RB", "WR") or p.get("realized") is None:
            continue
        b = (int(ov) - 1) // 10
        lo, hi = b * 10 + 1, (b + 1) * 10
        key = f"{lo}-{hi}"
        out.setdefault(key, {}).setdefault(p.get("season"), {}).setdefault(pos, []).append(float(p["realized"]))
    surface = {}
    for band, byseason in sorted(out.items(), key=lambda kv: int(kv[0].split("-")[0])):
        surface[band] = {}
        for s, bypos in sorted(byseason.items()):
            rb, wr = bypos.get("RB", []), bypos.get("WR", [])
            surface[band][s] = {"RB_mean": _mean(rb), "RB_n": len(rb),
                                "WR_mean": _mean(wr), "WR_n": len(wr),
                                "rb_minus_wr": (round(_mean(rb) - _mean(wr), 1) if rb and wr else None)}
    return surface


def verdict(early: dict) -> dict:
    seasons = sorted(early)
    gaps = {s: early[s]["rb_minus_wr"] for s in seasons}
    usable = [s for s in seasons if gaps[s] is not None and not early[s]["thin"]]
    rb_wins = [s for s in usable if gaps[s] > 0]
    thin_seasons = [s for s in seasons if early[s]["thin"] or gaps[s] is None]
    # pooled early-band gap (weight by the smaller of the two n's, honestly thin either way)
    all_rb = [(early[s]["RB"]["mean"], early[s]["RB"]["n"]) for s in seasons if early[s]["RB"]["mean"] is not None]
    all_wr = [(early[s]["WR"]["mean"], early[s]["WR"]["n"]) for s in seasons if early[s]["WR"]["mean"] is not None]
    pooled_rb = round(sum(m * n for m, n in all_rb) / sum(n for _, n in all_rb), 1) if all_rb else None
    pooled_wr = round(sum(m * n for m, n in all_wr) / sum(n for _, n in all_wr), 1) if all_wr else None
    pooled_gap = round(pooled_rb - pooled_wr, 1) if (pooled_rb is not None and pooled_wr is not None) else None

    supported = (len(usable) >= 2 and len(rb_wins) >= 2
                 and pooled_gap is not None and pooled_gap >= MATERIAL_GAP)
    if len(usable) < 2:
        text = (f"NULL / UNDERPOWERED — only {len(usable)} of 3 seasons have non-thin RB and WR "
                f"early-band cells (n>={MIN_CELL}); the per-season split cannot separate a 2024 "
                f"fluke from a persistent edge. Pooled early gap RB-WR = {pooled_gap}. Do NOT tilt "
                f"RB on the 2024 observation — our sample can't verify it repeats. Thin: {thin_seasons}.")
    elif supported:
        text = (f"RB TILT SUPPORTED (candidate, not installed) — RB beat WR in the early band "
                f"({EARLY_LO}-{EARLY_HI}) in {len(rb_wins)}/{len(usable)} usable seasons, pooled gap "
                f"+{pooled_gap} realized pts. Per-season gaps: {gaps}. This is a close-call "
                f"tie-breaker candidate ONLY — it needs the money gate (realized-vs-ADP-dollars) "
                f"before anything installs. NOT a 2024 fluke by this test.")
    else:
        text = (f"NOT PERSISTENT / NULL — RB beat WR in only {len(rb_wins)}/{len(usable)} usable "
                f"seasons (pooled gap {pooled_gap}). The 2024 read does NOT generalize; the board "
                f"should not tilt RB on it. Per-season gaps: {gaps}.")
    return {"seasons": seasons, "per_season_gap": gaps, "usable_seasons": usable,
            "rb_win_seasons": rb_wins, "thin_seasons": thin_seasons,
            "pooled_rb": pooled_rb, "pooled_wr": pooled_wr, "pooled_gap": pooled_gap,
            "rb_tilt_supported": supported, "text": text}


def run() -> dict:
    picks, per_season = DZ.load_picks()
    early = early_band_by_season(picks)
    v = verdict(early)
    return {
        "experiment": "RB-vs-WR at the top — persistence (fluke vs signal) check",
        "question": "Does RB's realized-value edge over WR at Cory's early picks (31-70 overall) "
                    "persist across seasons, or is it a 2024 artifact?",
        "prereg_rule": (f"SUPPORTED iff RB>WR in >=2/3 usable seasons AND pooled early gap "
                        f">= {MATERIAL_GAP} pts at n>={MIN_CELL}/pos/season; else NULL/fluke. "
                        "Installs nothing without the money gate either way."),
        "early_band": {"lo": EARLY_LO, "hi": EARLY_HI, "by_season": early},
        "per_band_by_season": per_band_by_season(picks),
        "totals_per_season": per_season,
        "verdict": v,
        "caveat": ("~400 picks / 3 seasons; per-season early-band cells are ~10/pos. Realized is "
                   "roster_sim season points (the dollar-arm currency), NOT realized-vs-ADP — so a "
                   "SUPPORTED result is a tie-breaker candidate, never an install. Local data."),
        "source_tier": "league-primary",
    }


if __name__ == "__main__":
    out = run()
    (HERE / "exp_positional_persistence.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
