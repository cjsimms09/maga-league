#!/usr/bin/env python3
# TERRITORY: relay
"""THIS-WEEK.md — the one fact sheet every session cites for Cory's week.

Cory, 2026-08-31, verbatim: "every session seems to be mistating the players
on my roster... each week, each session should be aware of my roster, who i
am playing, their speicfic games, weather, home/away, everything they
possibly can — all sessions should be working together to find me edge and
present it to me in a clear way!!"

The misstatements were the vintage-drift class hitting the worst possible
target: sessions reasoning from frozen artifacts (a draft-week seat plan, an
old tournament file) instead of the live roster. This generator is the cure:
it builds THIS-WEEK.md + draft/data/this_week.json from LIVE Sleeper plus
the committed schedule store, on a cron, and THE ROSTER RULE in CLAUDE.md's
era banner makes it the only citable source. Weather/stadium enrichment is a
NAMED GAP in v1 (open-meteo + nflverse stadium join exists in
game_weather.py and wires in at game week), never a silent one.

SELF-CHECKS (a wrong fact sheet is worse than none — refuse, loudly; these
are the sanity gates the unverified-workflow ratchet requires — a scheduled
job that commits data must run something that can say NO first):
  • roster must carry >= 10 players and week must be 1..18 in-season
  • every non-DEF player id must resolve in Sleeper's player map
  • every player's team must either have a game this week or be marked BYE
On any failure: exit nonzero, write NOTHING — a stale brief that says its
own generated_at beats a fresh brief that lies.

CI-only (Sleeper is proxy-blocked from dev sandboxes):
    python3 draft/tools/build_week_brief.py
"""
from pathlib import Path
import json, os, sys, urllib.request
from datetime import datetime, timezone

CORY_USER_ID = os.environ.get("CORY_USER_ID", "434915673219526656")
SCHEDULE = "draft/data/nfl_schedule_2026.json"
OUT_JSON = "draft/data/this_week.json"
OUT_MD = "THIS-WEEK.md"
API = "https://api.sleeper.app/v1"


def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


SECOND_OPINION = "draft/data/weekly_own/second_opinion_{season}_w{week}.json"


def second_opinion_section(season, week, root="."):
    """## Second opinion (props vs champion) — READ from the file A's
    props_second_opinion.py writes after each Thursday snapshot (ROUTES A →
    relay, 09-02); never recomputed here. The table is the roster table above
    with three more columns; `swaps` names where the two opinions disagree on
    who starts. Returns the markdown section, or a one-line placeholder when
    the week's file is not written yet (the brief runs Tue before the Wed/Thu
    snapshot writes it)."""
    path = Path(root) / SECOND_OPINION.format(season=season, week=week)
    head = "## Second opinion (props vs champion)\n\n"
    if not path.exists():
        return head + (f"_not written yet for week {week} — `props_second_opinion.py` runs after "
                       "the Wed/Thu snapshot (own-weekly-proj.yml)._\n")
    so = json.load(open(path))
    rows = so.get("table") or []
    fmt = lambda v: "—" if v is None else f"{v:.1f}"  # noqa: E731
    lines = ["| st | player | pos | champion | props | props − champion |",
             "|---|---|---|---|---|---|"]
    for r in rows:
        lines.append(f"| {'S' if r.get('st') else ' '} | {r.get('name')} | {r.get('pos')} | "
                     f"{fmt(r.get('champion'))} | {fmt(r.get('props'))} | {fmt(r.get('props_minus_champion'))} |")
    swaps = so.get("swaps") or []
    swap_txt = ("; ".join(f"props starts **{s.get('props_starts')}** where the champion starts "
                          f"{s.get('champion_starts')}" for s in swaps)
                if swaps else "none — both opinions start the same nine")
    m = so.get("matchup") or {}
    bc, bp = m.get("by_champion") or {}, m.get("by_props_blend") or {}
    match_txt = ""
    if bc and bp:
        match_txt = (f"\n\n**Matchup vs {m.get('opponent')}:** by the champion "
                     f"{fmt(bc.get('mine'))} – {fmt(bc.get('theirs'))} (gap {fmt(bc.get('gap'))}); "
                     f"by the props blend {fmt(bp.get('mine'))} – {fmt(bp.get('theirs'))} "
                     f"(gap {fmt(bp.get('gap'))}). {m.get('note') or ''}")
    return (head + f"_Read from `{path.as_posix()}` (generated {so.get('generated')}; champion arm "
            f"`{so.get('champion_arm')}`; {so.get('skill_players_with_a_props_line')} of "
            f"{so.get('skill_players_rostered')} rostered skill players carry a line). REPORT ONLY — "
            f"the props arm is P354's challenger, not the grader's input yet._\n\n"
            + "\n".join(lines) + f"\n\n**Lineup swaps:** {swap_txt}." + match_txt + "\n")


def league_id():
    cfg = os.environ.get("SLEEPER_LEAGUE_ID")
    if cfg:
        return cfg
    hist = json.load(open("draft/data/league_history.json"))
    return hist["root_league_id"]


def main():
    state = get(f"{API}/state/nfl")
    week = int(state.get("week") or 0)
    season = str(state.get("season"))
    if state.get("season_type") == "pre" or not (1 <= week <= 18):
        print(f"not a regular-season week (type={state.get('season_type')}, week={week}) — "
              "clean skip, nothing written")
        return 0

    lid = league_id()
    users = {u["user_id"]: u for u in get(f"{API}/league/{lid}/users")}
    rosters = get(f"{API}/league/{lid}/rosters")
    matchups = get(f"{API}/league/{lid}/matchups/{week}")
    players = get(f"{API}/players/nfl")

    mine = next((r for r in rosters if r.get("owner_id") == CORY_USER_ID), None)
    if not mine or len(mine.get("players") or []) < 10:
        print(f"🔴 CONTROL: Cory's roster not found or <10 players — refusing to write")
        return 1

    my_matchup = next((m for m in matchups if m["roster_id"] == mine["roster_id"]), None)
    opp_roster = opp_user = None
    if my_matchup:
        opp_m = next((m for m in matchups
                      if m["matchup_id"] == my_matchup["matchup_id"]
                      and m["roster_id"] != mine["roster_id"]), None)
        if opp_m:
            opp_roster = next(r for r in rosters if r["roster_id"] == opp_m["roster_id"])
            opp_user = users.get(opp_roster.get("owner_id"), {})

    sched = json.load(open(SCHEDULE))
    games = [g for g in sched["rows"] if g["week"] == week]
    # TEAM-CODE ALIASES: the schedule store (Ball Don't Lie) says WSH where
    # Sleeper says WAS. The first live brief printed Rachaad White as "BYE" in
    # a 16-game week 1 because of exactly this — a join failure wearing a
    # fact's clothes (the crosswalk class adp.TEAM_ALIASES exists for).
    ALIAS = {"WAS": "WSH"}
    by_team = {}
    for g in games:
        by_team[g["home"]] = dict(opp=g["away"], home=True, date=g["date"])
        by_team[g["away"]] = dict(opp=g["home"], home=False, date=g["date"])
    all_playing = len({g["home"] for g in games} | {g["away"] for g in games}) == 32

    def describe(pid, starters):
        if pid.isalpha():  # DEF
            p = {"full_name": f"{pid} D/ST", "position": "DEF", "team": pid,
                 "injury_status": None}
        else:
            p = players.get(pid)
            if not p:
                raise KeyError(pid)
        team = p.get("team")
        g = by_team.get(team) or by_team.get(ALIAS.get(team, ""))
        if g is None and team and all_playing:
            # sanity check: every team plays this week, so "no game" can
            # only be a broken join — refuse rather than print a fake BYE
            raise KeyError(f"team code {team!r} joins no game in a 32-team week")
        day = ""
        if g:
            # kickoff DAY in US/Eastern — the first brief rendered UTC, which
            # shifted every night game a day late (SNF printed Mon, MNF Tue)
            from zoneinfo import ZoneInfo
            day = datetime.fromisoformat(g["date"].replace("Z", "+00:00")) \
                .astimezone(ZoneInfo("America/New_York")).strftime("%a")
        return {
            "id": pid,
            "name": p.get("full_name") or f'{p.get("first_name","")} {p.get("last_name","")}'.strip(),
            "pos": p.get("position"),
            "team": team,
            "starter": pid in starters,
            "injury": p.get("injury_status") or None,
            "game": (f'{"vs" if g["home"] else "at"} {g["opp"]} ({day})' if g else "BYE"),
            "home": (g["home"] if g else None),
            "kickoff_utc": (g["date"] if g else None),
        }

    starters = set(my_matchup.get("starters") or mine.get("starters") or []) if my_matchup else set(mine.get("starters") or [])
    try:
        my_players = [describe(pid, starters) for pid in mine["players"]]
    except KeyError as e:
        print(f"🔴 CONTROL: player id {e} not in Sleeper's map — refusing to write")
        return 1

    opp_players = []
    if opp_roster:
        ostart = set(opp_roster.get("starters") or [])
        try:
            opp_players = [describe(pid, ostart) for pid in opp_roster["players"]]
        except KeyError:
            opp_players = []  # opponent gaps are noted, never fatal to MY sheet

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    doc = {
        "_rule": ("THE ROSTER RULE: any statement about Cory's roster or matchup cites "
                  "THIS file (fresh within 3 days) or live Sleeper — never an older artifact."),
        "generated_at": now, "season": season, "week": week,
        "cory": {"user_id": CORY_USER_ID,
                 "display": users.get(CORY_USER_ID, {}).get("display_name", "coryjsimms")},
        "opponent": ({"display": opp_user.get("display_name"),
                      "roster_id": opp_roster["roster_id"]} if opp_roster else None),
        "my_roster": my_players,
        "opponent_roster": opp_players,
        "named_gaps": ["weather/stadium/roof enrichment joins at game week via game_weather.py "
                       "(open-meteo forecast is only meaningful days out)"],
    }
    json.dump(doc, open(OUT_JSON, "w"), indent=1)

    def table(rows):
        out = [f"| {'S' if r['starter'] else ' '} | {r['name']} | {r['pos']} | "
               f"{r['team'] or '—'} | {r['game']} | {r['injury'] or ''} |" for r in rows]
        return ("| st | player | pos | team | game | injury |\n|---|---|---|---|---|---|\n"
                + "\n".join(out))

    md = (f"# THIS WEEK — {doc['cory']['display']}, week {week} ({season})\n\n"
          f"**Generated {now} from LIVE Sleeper. THE ROSTER RULE: any statement about\n"
          f"Cory's roster or matchup cites this file (fresh within 3 days) or live\n"
          f"Sleeper — a frozen seat plan or tournament artifact is never a source for\n"
          f"who he rosters TODAY.** (Cory, 08-31: sessions kept misstating his players.)\n\n"
          # Cory, 09-02: "every loop closed, the ones that stick, I need to know."
          f"**What stuck so far: `WHAT-STUCK.md`** — every closed loop in plain English, and what is still running.\n\n"
          f"## Opponent: {doc['opponent']['display'] if doc['opponent'] else 'BYE / not scheduled'}\n\n"
          f"## My roster\n\n{table(my_players)}\n\n"
          f"## Opponent's roster\n\n{table(opp_players) if opp_players else '_not available_'}\n\n"
          f"{second_opinion_section(season, week)}\n"
          f"**Named gaps:** {doc['named_gaps'][0]}\n")
    open(OUT_MD, "w").write(md)
    print(f"wrote {OUT_MD} + {OUT_JSON}: week {week}, {len(my_players)} players, "
          f"opponent {doc['opponent'] and doc['opponent']['display']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
