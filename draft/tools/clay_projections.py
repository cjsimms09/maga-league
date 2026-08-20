# TERRITORY: C
"""Mike Clay's 2026 guide, scored under OUR table, from RAW STAT LINES.

Cory, 2026-08-19: "Let's have C start working on getting all this info in our
system and see how we can use it." Routed via ROUTES.md with the scouting
already done (A, 2026-08-20) — read before touching this file:

  - The guide's own points column is FULL PPR (league_config: "rec": 0.5,
    half). Ingesting his point totals would silently bias every pass-catcher.
    So his POINTS ARE NEVER READ. Only the raw passing/rushing/receiving stat
    lines are, then scored through `scoring.score_stat_line` under this
    league's own table -- exactly what multisource_projections.py already
    does for CBS/ESPN/FFToday (rule 11: this module imports that one's
    `norm_name` and `league_scoring` rather than re-deriving them).
  - The PDF positions individual characters. A naive text dump collapses a
    row into one digit run with no recoverable player name. `pdftotext
    -layout` (present in this container; A's lacked it) reconstructs the
    columns correctly -- verified against a KNOWN POSITIVE before trusting
    it anywhere else in this file: Jahmyr Gibbs' RB-table row here must equal
    his independently-printed row on the Detroit team page (a different
    table, same document, same underlying number) -- see
    `_verify_known_positive`, which runs before any output is written.
  - KICKERS: the guide gives total FGM/FGA with no distance split, and this
    league pays 3/3/3/3 by band up to 49 and 5 beyond it. Same situation as
    FFToday in multisource_projections.py, same resolution: EXCLUDED from
    scoring rather than approximated with an invented distance mix. Raw
    FGM/FGA/XPM/XPA are still stored for the record.
  - TEAM DEFENSE is not in this guide in an extractable form -- the
    "DEFENSE" heading on team pages is individual IDP players (Tkl/Sack/INT),
    which this league does not score. Zero DEF rows in this store; stated
    here rather than silently absent.

REPORT ONLY. Writes draft/data/clay_projections_2026.json. Touches no board
field, joins no crosswalk write, and is not part of any blend -- Cory's "see
how we can use it" is answered by landing a graded, comparable store, not by
putting a sixth, ungraded source into the board he drafts from in two days
(A's REC, ROUTES.md 2026-08-20).

Run: python3 draft/tools/clay_projections.py
"""
from __future__ import annotations

import json
import re
import statistics as st
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(HERE))

from multisource_projections import league_scoring, norm_name  # noqa: E402 (rule 11)
sys.path.insert(0, str(DRAFT))
import scoring as SC  # noqa: E402

PDF = DRAFT / "data" / "sources" / "clay_projections_2026.pdf"
BOARD = ROOT / "public" / "draft_data.json"
OUT = DRAFT / "data" / "clay_projections_2026.json"

SPLIT = re.compile(r"\s{2,}")

# adp.NICKNAMES (TERRITORY: A) doesn't cover these two -- confirmed by direct
# board search before adding, not guessed: Clay's "Ken Walker" is the board's
# "Kenneth Walker" (one of Cory's own three keepers) and Clay's "Cameron Ward"
# is the board's "Cam Ward". A small LOCAL fallback here rather than editing
# another lane's file (rule 1/territory) -- same "extend, don't touch" choice
# made for Draft Sharks' first-initial matching.
LOCAL_NAME_OVERRIDES = {
    "ken walker": "kenneth walker",
    "cameron ward": "cam ward",
}


def pdf_text() -> str:
    if not PDF.exists():
        raise SystemExit(f"missing {PDF}")
    proc = subprocess.run(
        ["pdftotext", "-layout", str(PDF), "-"],
        capture_output=True, text=True, check=True,
    )
    return proc.stdout


def section_lines(lines: list[str], start: str, end_markers: list[str]) -> list[str]:
    """Every line strictly between a start marker and the first of several end
    markers. Multi-page positions (e.g. "Wide Receiver Projections (2/5)")
    repeat the SAME start text on later pages -- those repeats are not in
    `end_markers`, so they pass through as ordinary (header) lines and get
    filtered by the caller, letting the section span its own page breaks."""
    out, started = [], False
    for l in lines:
        if not started and start in l:
            started = True
            continue
        if started:
            if any(m in l for m in end_markers):
                break
            out.append(l)
    return out


HEADER_WORDS = {
    "Team", "Pos", "Rk", "FF", "Pt", "G", "P", "Att", "Comp", "Yds", "TD",
    "INT", "Sk", "Carry", "Ru", "Targ", "Rec", "Re", "Car%", "Targ%",
    "Quarterback", "Running", "Back", "Wide", "Receiver", "Tight", "End",
    "Projections", "KICKER", "Tm", "FGM", "FGA", "FG%", "XPM", "XPA", "XP%",
}


def is_header(parts: list[str]) -> bool:
    # A real player row's first field is a name (has a lowercase letter); a
    # header/label row's fields are drawn from the column-label vocabulary.
    first = parts[0] if parts else ""
    return not any(c.islower() for c in first) or first in HEADER_WORDS


def parse_rows(lines: list[str], n_fields: int) -> list[list[str]]:
    rows = []
    for l in lines:
        if not l.strip():
            continue
        parts = SPLIT.split(l.strip())
        if len(parts) != n_fields:
            continue  # a stray page-furniture line, not a data row -- skip, don't guess
        if is_header(parts):
            continue
        rows.append(parts)
    return rows


def to_float(v: str):
    try:
        return float(v.rstrip("%"))
    except ValueError:
        return None


def lookup_board(raw_name: str, pos: str, by_name: dict) -> list:
    """adp.norm_name first; LOCAL_NAME_OVERRIDES only as a fallback when that
    misses, so a correct primary match is never second-guessed."""
    n = norm_name(raw_name)
    cands = by_name.get((n, pos))
    if cands:
        return cands
    override = LOCAL_NAME_OVERRIDES.get(n)
    if override:
        return by_name.get((norm_name(override), pos)) or []
    return []


# name, team, pos_rk, ff_pt, g, p_att, comp, p_yds, p_td, int_, sk, carry, ru_yds, ru_td
QB_FIELDS = ["name", "team", "pos_rk", "ff_pt_full_ppr", "g", "p_att", "comp",
             "p_yds", "p_td", "int", "sk", "carry", "ru_yds", "ru_td"]
# name, team, pos_rk, ff_pt, g, carry, ru_yds, ru_td, targ, rec, re_yd, re_td, car_pct, targ_pct
SKILL_FIELDS = ["name", "team", "pos_rk", "ff_pt_full_ppr", "g", "carry", "ru_yds",
                 "ru_td", "targ", "rec", "re_yd", "re_td", "car_pct", "targ_pct"]
K_FIELDS = ["name", "team", "ff_pt_full_ppr", "fgm", "fga", "fg_pct", "xpm", "xpa", "xp_pct"]


TEXT_FIELDS = {"name", "team"}


def row_to_dict(parts: list[str], fields: list[str]) -> dict:
    d = {"name": parts[0]}
    for key, raw in zip(fields[1:], parts[1:]):
        d[key] = raw if key in TEXT_FIELDS else to_float(raw)
    return d


def build_stat_line(pos: str, row: dict) -> dict:
    """Raw stats -> our scoring vocabulary. Only categories this league prices
    are mapped; the rest (Sk, Car%, Targ%, pos_rk, ff_pt_full_ppr) are
    descriptive and deliberately left unscored."""
    stats = {}
    if pos == "QB":
        if row.get("p_yds") is not None:
            stats["pass_yd"] = row["p_yds"]
        if row.get("p_td") is not None:
            stats["pass_td"] = row["p_td"]
        if row.get("int") is not None:
            stats["pass_int"] = row["int"]
    if row.get("ru_yds") is not None:
        stats["rush_yd"] = row["ru_yds"]
    if row.get("ru_td") is not None:
        stats["rush_td"] = row["ru_td"]
    if pos != "QB":
        if row.get("rec") is not None:
            stats["rec"] = row["rec"]
        if row.get("re_yd") is not None:
            stats["rec_yd"] = row["re_yd"]
        if row.get("re_td") is not None:
            stats["rec_td"] = row["re_td"]
    return stats


def _verify_known_positive(lines: list[str]) -> None:
    """Rule 3f: the control is for THIS parse, not a fixture I authored. Gibbs'
    RB-table row must match his independently-printed row on the Detroit team
    page -- two different tables in the same document, same real number.

    The team page packs THREE tables (offense/defense/weekly) side by side, so
    its columns are tighter than the positional-projections tables and some
    are single-space-separated -- plain whitespace tokenization (not the
    2+-space SPLIT used elsewhere) is the right tool here, verified against
    the raw line by hand before being trusted in code."""
    team_page = None
    for l in lines:
        if "Jahmyr Gibbs" in l and " DI " in l:  # the team-page row (has an IDP column too)
            team_page = l.split()
            break
    if team_page is None:
        raise SystemExit("KNOWN-POSITIVE CONTROL FAILED: Gibbs' team-page row not found "
                          "at all -- the PDF text extraction changed shape, stop and look "
                          "before trusting anything else in this file.")
    # tokens: Pos First Last Gm PAtt Comp PYds PTD INT Sk RuAtt RuYds RuTD Tgt Rec RecYd RecTD Pts Rk ...
    tp_carry, tp_ruyd, tp_rutd = team_page[10], team_page[11], team_page[12]
    tp_targ, tp_rec, tp_reyd, tp_retd = team_page[13], team_page[14], team_page[15], team_page[16]
    expect = ("283", "1373", "14", "86", "68", "546", "3")
    got = (tp_carry, tp_ruyd, tp_rutd, tp_targ, tp_rec, tp_reyd, tp_retd)
    if got != expect:
        raise SystemExit(f"KNOWN-POSITIVE CONTROL FAILED: team-page column layout assumed "
                          f"{expect}, extracted {got} -- the team-page table shape changed, "
                          f"stop and look.")


def main() -> None:
    text = pdf_text()
    lines = text.split("\n")
    _verify_known_positive(lines)

    qb = parse_rows(section_lines(lines, "Quarterback Projections",
                                   ["Running Back Projections (1"]), 14)
    rb = parse_rows(section_lines(lines, "Running Back Projections (1/3)",
                                   ["Wide Receiver Projections (1"]), 14)
    wr = parse_rows(section_lines(lines, "Wide Receiver Projections (1/5)",
                                   ["Tight End Projections (1"]), 14)
    te = parse_rows(section_lines(lines, "Tight End Projections (1/2)",
                                   ["Interior Defensive Line Projections"]), 14)
    k = parse_rows(section_lines(lines, "Kicker Projections",
                                  ["Category Leaderboard"]), 9)

    scoring = league_scoring()
    board = json.loads(BOARD.read_text())
    by_name = defaultdict(list)
    for p in list(board["players"]) + list(board.get("kept_players") or []):
        if p.get("position"):
            by_name[(norm_name(p.get("name")), p["position"])].append(p)
    sleeper_proj = {str(p["player_id"]): p.get("proj_mean")
                    for p in list(board["players"]) + list(board.get("kept_players") or [])}

    players = {}
    unmatched = []
    positional_violations = []
    for pos, rows, fields in (("QB", qb, QB_FIELDS), ("RB", rb, SKILL_FIELDS),
                               ("WR", wr, SKILL_FIELDS), ("TE", te, SKILL_FIELDS)):
        for parts in rows:
            row = row_to_dict(parts, fields)
            stats = build_stat_line(pos, row)
            pts = SC.score_stat_line(stats, scoring)
            # positional plausibility (rule 3e's strengthened form, register 111):
            # a QB row must carry pass yards; a skill row must not.
            if pos == "QB" and not stats.get("pass_yd"):
                positional_violations.append((row["name"], pos, stats))
            if pos != "QB" and "pass_yd" in stats:
                positional_violations.append((row["name"], pos, stats))
            cands = lookup_board(row["name"], pos, by_name)
            if not cands:
                unmatched.append(f"{row['name']} ({pos})")
                pid = f"clay:{norm_name(row['name'])}:{pos}"
                board_name = None
            else:
                pid = str(cands[0]["player_id"])
                board_name = cands[0].get("name")
            players[pid] = {
                "name": board_name or row["name"],
                "clay_name": row["name"],
                "position": pos,
                "team_clay": row.get("team"),
                "clay_pos_rank": row.get("pos_rk"),
                "raw_stats": {k2: v for k2, v in row.items()
                              if k2 not in ("name", "team", "pos_rk", "ff_pt_full_ppr")},
                "proj_clay_scored": pts,
                "matched_board": bool(cands),
            }

    # kickers: raw counts only, never scored (no distance split -- see module docstring)
    k_players = {}
    for parts in k:
        row = row_to_dict(parts, K_FIELDS)
        cands = lookup_board(row["name"], "K", by_name)
        pid = str(cands[0]["player_id"]) if cands else f"clay:{norm_name(row['name'])}:K"
        k_players[pid] = {
            "name": cands[0].get("name") if cands else row["name"],
            "clay_name": row["name"], "position": "K", "team_clay": row.get("team"),
            "raw_stats": {"fgm": row.get("fgm"), "fga": row.get("fga"),
                          "xpm": row.get("xpm"), "xpa": row.get("xpa")},
            "proj_clay_scored": None,
            "not_scored_reason": "no field-goal distance split in the source; this league "
                                  "pays by distance band and a bare FGM total cannot be "
                                  "priced without inventing a distance mix (same treatment "
                                  "as FFToday in multisource_projections.py)",
            "matched_board": bool(cands),
        }

    def spearman(pairs):
        if len(pairs) < 10:
            return None
        def ranks(v):
            order = sorted(range(len(v)), key=lambda i: v[i])
            out = [0.0] * len(v)
            for r, i in enumerate(order):
                out[i] = r + 1
            return out
        a, b = ranks([x for x, _ in pairs]), ranks([y for _, y in pairs])
        ma, mb = st.mean(a), st.mean(b)
        na = sum((x - ma) * (y - mb) for x, y in zip(a, b))
        da = (sum((x - ma) ** 2 for x in a) ** 0.5) * (sum((y - mb) ** 2 for y in b) ** 0.5)
        return None if da == 0 else round(na / da, 4)

    pairs = [(p["proj_clay_scored"], sleeper_proj[pid]) for pid, p in players.items()
             if p["matched_board"] and sleeper_proj.get(pid) is not None]
    agree_vs_sleeper = {"n": len(pairs), "spearman": spearman(pairs)}

    doc = {
        "_territory": "TERRITORY: C — written by draft/tools/clay_projections.py",
        "_note": "Mike Clay's 2026 guide (draft/data/sources/clay_projections_2026.pdf), "
                 "scored under THIS LEAGUE'S table from RAW STAT LINES. His own points "
                 "column is full-PPR and is never read. Writes NO board field, not part "
                 "of any blend. Kickers: raw counts only, not scored (no FG distance "
                 "split). Team DEFENSE: not present in this guide in extractable form, "
                 "zero DEF rows.",
        "scoring_source": "draft/backtest/nflverse_weekly_points_2024.json fingerprint "
                           "(via multisource_projections.league_scoring, rule 11)",
        "source_pdf": "draft/data/sources/clay_projections_2026.pdf",
        "known_positive_control": "Jahmyr Gibbs RB-table row verified against his "
                                   "independently-printed Detroit team-page row before "
                                   "any output was trusted — see _verify_known_positive",
        "players": players,
        "kickers": k_players,
        "coverage": {
            "by_position": {pos: sum(1 for p in players.values() if p["position"] == pos)
                            for pos in ("QB", "RB", "WR", "TE")},
            "kickers": len(k_players),
            "matched_to_board": sum(1 for p in players.values() if p["matched_board"]),
            "unmatched_total": len(unmatched),
            "unmatched": unmatched[:25],
        },
        "positional_plausibility_violations": [
            {"name": n, "position": p, "stats": s} for n, p, s in positional_violations],
        "agreement_vs_sleeper_spearman": agree_vs_sleeper,
    }
    OUT.write_text(json.dumps(doc, indent=1))

    print("CLAY 2026 PROJECTIONS — scored under OUR table\n")
    print(f"  by position: {doc['coverage']['by_position']}  kickers: {len(k_players)}")
    print(f"  matched to board: {doc['coverage']['matched_to_board']} / {len(players)}  "
          f"unmatched: {len(unmatched)}")
    print(f"  positional plausibility violations: {len(positional_violations)}")
    print(f"  agreement vs Sleeper (Spearman): n={agree_vs_sleeper['n']} "
          f"rho={agree_vs_sleeper['spearman']}")
    print(f"\n  wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
