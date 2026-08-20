# TERRITORY: A
"""HOW MANY PLAYERS ARE WE ACTUALLY TALKING ABOUT? -- ONE ANSWER, READ EVERYWHERE.

Cory, 2026-08-20: "We really just need to focus on top 200 players maybe 250"

That is a scoping ruling and it has to propagate, because before it landed every
tool picked its own cutoff and nothing checked they agreed:

    rerank_by_source.py    top 150 by ADP        (coverage_top150_pct)
    independence_screen.js ADP <= 150
    adp_drift_check.js     TOP_N = 150
    clay_blend_impact.js   ADP <= 200
    position_boards.js     ADP <= 200
    adp_upside.js          ADP <  250
    bench_branch_probe.js  REACH_ADP = 250

Some of those are probes that legitimately declare their own scope before they
run, and they stay as they are -- a stated scope is not a hardcode. What was
wrong is that the numbers Cory READS were scoped by whoever wrote that line.

-- WHY THE SCOPE CHANGES AN ANSWER, MEASURED -------------------------------

Coverage of the live board, 2026-08-19 build, by depth (percent of players in
that depth the source actually projects):

    source           all 700   top 150   top 200   top 250
    Draft Sharks         35%       99%       94%       88%
    Sleeper             100%      100%      100%      100%
    our model            72%       93%       90%       83%
    FantasyPros          61%       94%       91%       84%

The war room's source buttons were printing the ALL-700 count -- "Draft Sharks
247" next to "Sleeper 700". That reads as a source that knows a third of the
league. Inside the 200 players Cory drafts from, the real gap is 94% vs 100%.
The number was true and it was misleading, which is rule 3i exactly.

-- WHAT IS DERIVED AND WHAT IS RULED ---------------------------------------

`drafted` is DERIVED: teams * rounds. 10 * 15 = 150 players are on a roster when
the draft ends; Cory's last pick is 148. It is asserted against the config here,
so a league-size change cannot leave a stale 150 behind.

`focus` (200) and `outer` (250) are Cory's ruling, quoted verbatim in the config.
They are not tuned constants -- nothing swept them and nothing may move them
after seeing where a result fell (no_fit_guard).

The browser reads the same block off `board.league.draftable_scope`; build.py
puts it there. draft/tests/draftable_scope_is_one_definition.test.js asserts the
client's fallback numbers equal this config, so the two readers cannot drift.
"""
import json
import os

_CFG = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    "config", "league_config.json")


def load(cfg=None):
    """The scope block, with `drafted` re-derived and checked, never trusted.

    Pass an already-loaded league config to avoid a second read; omit it and
    this reads draft/config/league_config.json itself.
    """
    if cfg is None:
        with open(_CFG) as fh:
            cfg = json.load(fh)
    scope = cfg.get("draftable_scope")
    if not isinstance(scope, dict):
        raise KeyError(
            "league_config.json has no draftable_scope block. This is the one "
            "definition of how deep the board matters (Cory 2026-08-20: 'We "
            "really just need to focus on top 200 players maybe 250'). Refusing "
            "to invent a cutoff -- an invented one is exactly the drift this "
            "block exists to stop.")

    derived = int(cfg["teams"]) * int(cfg["rounds"])
    stated = int(scope["drafted"])
    if derived != stated:
        raise ValueError(
            "draftable_scope.drafted is %d but teams * rounds is %d. The stated "
            "value is stale -- fix the config, do not paper over it." %
            (stated, derived))

    out = dict(scope)
    out["drafted"] = derived
    out["focus"] = int(scope["focus"])
    out["outer"] = int(scope["outer"])
    if not (out["drafted"] <= out["focus"] <= out["outer"]):
        raise ValueError(
            "draftable_scope must widen: drafted <= focus <= outer, got "
            "%d/%d/%d" % (out["drafted"], out["focus"], out["outer"]))
    return out


def depths(cfg=None):
    """[(label, n), ...] narrow to wide -- the depths any report should show.

    Reporting at one depth alone is how "35%" got quoted at Cory as though it
    were the number that mattered. Showing the ladder makes the shape visible.
    """
    s = load(cfg)
    return [("top %d" % s["drafted"], s["drafted"]),
            ("top %d" % s["focus"], s["focus"]),
            ("top %d" % s["outer"], s["outer"])]


def adp_of(player):
    """The ADP a player is ranked by for scoping. Uncovered -> pushed to the end,
    never to the front: a player with no ADP is unknown, not early."""
    for k in ("adjusted_adp", "raw_adp", "adp"):
        v = player.get(k)
        if v is not None:
            return float(v)
    return 9999.0


def by_adp(players):
    """`players` sorted by ADP, shallow -- the ordering every depth cut uses."""
    return sorted(players, key=adp_of)


if __name__ == "__main__":
    s = load()
    print("\n  DRAFTABLE SCOPE -- one definition, read by build.py, "
          "rerank_by_source.py and the war room\n")
    print("    Cory: \"%s\"" % s["cory_ruling_verbatim"])
    print("    drafted %-4d (derived: teams * rounds)" % s["drafted"])
    print("    focus   %-4d (ruled)" % s["focus"])
    print("    outer   %-4d (ruled)\n" % s["outer"])
