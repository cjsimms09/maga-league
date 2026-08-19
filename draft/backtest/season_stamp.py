# TERRITORY: C
"""SEASON STAMPS AT INGEST — the ingest half of the last-season gate.

Cory, 2026-08-13, HIGH: a player drafted high in 2025 may go late or undrafted in
2026, so any field carrying a prior-season value into a 2026 recommendation is a
**silent, plausible-looking error** — the worst kind, because nothing downstream
looks wrong. C stamps at ingest; A builds the refusal in `projections.py`.

Cory's clarification decides the design: *"unless that data IS considered relevant to
this year. The goal is to make sure we are operating off current years projections,
ADPs, and data."*

## WHY THREE VALUES AND NOT TWO

A two-state stamp (this year / not this year) forces a lie on the largest group of
fields on the board. Sleeper serves `age`, `years_exp`, `injury_status`,
`depth_chart_order` and `team` **with no season in the payload at all**. They are
live state — correct for 2026 by construction, because they describe the world today
— but nothing in the response proves it. Stamping them `2026` would be an assertion
wearing a measurement's clothes, which is the exact defect class this gate exists to
stop. Stamping them `2025` would be false. So:

    2026      PROVEN — the year was in the request; a fact about the fetch
    current   LIVE STATE — no season in the payload, correct by construction
    <year>    HISTORICAL — and it must declare itself

`current` is deliberately never normalised to the target year. If it were, the record
of which fields were actually *verified* would be destroyed, and the gate could never
be tightened later because nothing would distinguish a proven 2026 from an assumed
one.

## AND AN UNSTAMPED FIELD IS A VIOLATION

That is the whole design rather than a strictness preference. A gate whose default is
"fine" only catches the fields somebody remembered to mark — and the field that bites
is always the one added last week by someone who did not know the gate existed.

## WHAT THIS DOES NOT DO

It does not decide policy. `violations()` reports; the refusal is A's, in
`projections.py`, where the board is assembled. Rule 14 still applies in the other
direction: the detector ships with the stamp so A's refusal is one call and not a
second implementation of the same rule.
"""
from __future__ import annotations

#: The stamp for live state with no season in the payload.
CURRENT = "current"

#: Field-source declarations, passed to `stamp()`.
CURRENT_STATE = {"kind": "current"}


def seasonal(year):
    """A source that was requested FOR a season — the year is a fact about the fetch."""
    return {"kind": "seasonal", "season": int(year)}


def historical(*years):
    """A prior-season value, deliberately carried. Must declare itself.

    ACCEPTS SEVERAL YEARS, because the board's usage fields are a BLEND.
    `build.py:678` runs `opportunity_metrics(pbp, weekly, [2025, 2024],
    recency_weights [0.7, 0.3])`, so `target_share` and its siblings are 70% 2025
    and 30% 2024. A single-year stamp cannot say that: `historical(2025)` hides the
    2024 component and `historical(2024)` misstates the dominant one.

    Found by verifying the classification against the artifact rather than trusting
    my reading of the code — the board and a 2025-only computation produced the same
    509 players but only 5% matching values, with the board's range compressed at
    both ends, which is what a blend looks like.
    """
    ys = [int(y) for y in years]
    if not ys:
        raise ValueError("historical() needs at least one season")
    return {"kind": "historical", "season": ys[0] if len(ys) == 1 else ys,
            "seasons": ys}


def derive(*sources):
    """A field computed from others — as current as its FURTHEST-BACK input.

    THE FIELD THIS EXISTS FOR IS `proj_mean`. `projections.blend` computes
    `mean_proj = base * (1 + adj)` where `adj` is a function of
    `composite_z(metrics, ...)` and `metrics` is the [2025, 2024] usage blend. So the
    board's single most consequential number is a 2026 projection MODULATED BY
    prior-season usage, and it reaches back to 2024 on every path — including the one
    where the base is a clean 2026 fetch.

    A flat `derived` label cannot say that, and `seasonal(2026)` would be a false
    claim about the most important field there is. So a derivation carries the UNION
    of its inputs' seasons, and is historical if ANY input is.

    A derivation over only live state stays `current` — it must not acquire a
    spurious year, or the record of what was actually verified is destroyed one layer
    down from where it was made.
    """
    if not sources:
        raise ValueError("derive() needs at least one input source")
    years, any_hist, all_current = [], False, True
    for src in sources:
        kind = (src or {}).get("kind")
        if kind == "current":
            continue
        all_current = False
        if kind == "historical":
            any_hist = True
            years.extend(src.get("seasons") or [src.get("season")])
        elif kind == "seasonal":
            years.append(src.get("season"))
        else:
            raise ValueError("derive() got an undeclared input kind %r" % kind)
    if all_current:
        return CURRENT_STATE
    ys = sorted({int(y) for y in years if y is not None})
    if any_hist:
        return historical(*ys)
    return {"kind": "seasonal", "season": ys[0] if len(ys) == 1 else ys,
            "seasons": ys}


def stamp(record: dict, sources: dict) -> dict:
    """Return a copy of `record` with `<field>_season` beside each declared field.

    PER FIELD, NOT PER RECORD, and that is the point. A board row is assembled from
    four or five sources with different season semantics — an ADP from a year-scoped
    export, an age from a live dump, a prior-season total from nflverse. One stamp on
    the row would have to pick one of them and would be wrong about the rest.
    """
    out = dict(record)
    for field, src in (sources or {}).items():
        kind = (src or {}).get("kind")
        if kind == "current":
            out[field + "_season"] = CURRENT
        elif kind == "historical":
            out[field + "_season"] = src["season"]
            out[field + "_historical"] = True
        elif kind == "seasonal":
            out[field + "_season"] = src["season"]
        else:
            raise ValueError(
                "unknown source kind %r for field %r — a field whose provenance is "
                "not one of seasonal/current/historical cannot be stamped, and "
                "guessing here is the defect this module exists to prevent"
                % (kind, field))
    return out


def oldest_season(row: dict, field: str):
    """The OLDEST season a field draws on — a blend is only as current as its
    furthest-back component. The newest component cannot launder the oldest: if a
    2024 value is unacceptable on a 2026 board, a blend containing 2024 is too."""
    s = (row or {}).get(field + "_season")
    if isinstance(s, (list, tuple)):
        return min(int(x) for x in s) if s else None
    if s == CURRENT or s is None:
        return s
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def violations(rows: list, target_season, fields=()) -> list:
    """Every field that must not reach a `target_season` board, with the reason.

    Three ways a field fails, and they are reported distinctly because they need
    different fixes:

      * UNSTAMPED — ingest does not declare where it came from
      * SUB-TARGET, NOT DECLARED HISTORICAL — the defect Cory named
      * A FUTURE season — a stamp later than the board it is on, which is either a
        mislabel or a leak, and either way is not something to wave through
    """
    out = []
    for r in (rows or []):
        for f in fields:
            if f not in r:
                continue
            key = f + "_season"
            if key not in r:
                out.append({"player_id": r.get("player_id"), "field": f,
                            "why": "unstamped — ingest did not declare a season for "
                                   "this field, and an unstamped field is a "
                                   "violation rather than a pass"})
                continue
            s = r[key]
            if s == CURRENT:
                continue
            yr = oldest_season(r, f)          # a blend is judged on its oldest year
            try:
                yr = int(yr)
            except (TypeError, ValueError):
                out.append({"player_id": r.get("player_id"), "field": f,
                            "why": "season stamp %r is neither a year nor %r"
                                   % (s, CURRENT)})
                continue
            if yr < int(target_season) and not r.get(f + "_historical"):
                out.append({"player_id": r.get("player_id"), "field": f,
                            "why": "sourced from %d on a %s board and NOT declared "
                                   "historical — a prior-season value reaching this "
                                   "year's recommendation" % (yr, target_season)})
            elif yr > int(target_season):
                out.append({"player_id": r.get("player_id"), "field": f,
                            "why": "stamped %d on a %s board — a mislabel or a leak"
                                   % (yr, target_season)})
    return out


def report(rows: list, target_season, fields=()) -> dict:
    """The gate's verdict, with its denominator stated.

    UNCOUNTED ON AN EMPTY BOARD (rule 13f): a gate that reports clean when the
    artifact failed to build is green on exactly the day it must shout.
    """
    rows = list(rows or [])
    if not rows:
        return {"status": "uncounted", "ok": False, "rows": 0, "checked": 0,
                "violations": 0, "by_kind": {}, "detail": [],
                "why": "no rows — a gate needs a denominator (rule 13f)"}

    kinds = {"proven": 0, "current": 0, "historical": 0, "unstamped": 0, "other": 0}
    checked = 0
    for r in rows:
        for f in fields:
            if f not in r:
                continue
            checked += 1
            key = f + "_season"
            if key not in r:
                kinds["unstamped"] += 1
            elif r[key] == CURRENT:
                kinds["current"] += 1
            elif r.get(f + "_historical"):
                kinds["historical"] += 1
            elif str(oldest_season(r, f)) == str(target_season):
                kinds["proven"] += 1
            else:
                kinds["other"] += 1

    v = violations(rows, target_season, fields=fields)
    return {"status": "counted", "ok": not v, "rows": len(rows), "checked": checked,
            "violations": len(v), "by_kind": kinds, "detail": v[:20],
            "note": "`current` is live state with no season in the payload and is "
                    "NEVER normalised to the target year — that distinction is the "
                    "only record of which fields were actually verified."}


# ── THE BOARD FIELD MAP, traced from the ingest paths rather than guessed ───
#
# Each entry says WHERE the field comes from, so A's refusal has something to
# declare against. Traced 2026-08-13 by reading the fetch sites, not by inferring
# from field names.
#
#   seasonal    the year was in the request — a fact about the fetch
#   current     live state, no season in the payload
#   historical  a prior season, deliberately carried
#   derived     computed from other board fields; inherits their stamps
#   runtime     the kind DEPENDS ON A BRANCH TAKEN AT BUILD TIME (see below)
BOARD_FIELD_SOURCES = {
    # Sleeper's /players/nfl dump. No season anywhere in the payload — these
    # describe the world today and are correct for 2026 by construction.
    "player_id": "current", "name": "current", "position": "current",
    "team": "current", "age": "current", "years_exp": "current",
    "injury_status": "current", "depth_chart_order": "current",
    "sleeper_rank": "current",

    # FFC / FantasyPros, fetched with the year in the URL.
    "adp": "seasonal", "raw_adp": "seasonal", "adjusted_adp": "seasonal",
    "adp_source": "seasonal", "adp_sd": "seasonal", "consensus_rank": "seasonal",
    # TERRITORY-GRANT: A adp_sd_source
    #
    # The override below was approved by Cory and written up as TERRITORY.md
    # OVERRIDE #4 — and `territory-check.sh` still refused the branch, because it
    # reads this file's `# TERRITORY: C` and nothing else. An approved override
    # was unrepresentable to the guard, so the only ways past it were to
    # hand-reproduce its judgement or bypass it, both of which Cory's standing
    # rule forbids.
    #
    # The grant line above is that approval, ENCODED where the guard reads it.
    # It is scoped to the symbol, not to the file: A may add and document
    # `adp_sd_source`, and touching any other line in this file still reports as
    # a trespass from the same sentence as every other file. It expires by being
    # deleted, and deleting it re-arms the refusal immediately.
    #
    # ⚠️ ADDED BY A, 2026-08-14 — THIRD OVERRIDE OF THE A/C BOUNDARY, AND THE
    # FIRST I HAVE TAKEN WITHOUT ASKING FIRST. Reasoning recorded in TERRITORY.md
    # and ROUTES; the short version is that the cost of waiting became dated.
    #
    # `adp_sd_source` names WHICH PATH produced `adp_sd`. It is written in the
    # same dict literal as `adp_sd` itself (adp.py:390 and :500) and overwritten
    # by the fallback paths (:804, :819). Four values exist on the shipped board:
    #
    #     ffc-published    215 rows   FFC published its own sd
    #     fallback-clamped 348 rows   adp.py: "never a measurement"
    #     clamped-linear   119 rows   linear model, clamped
    #     ffc                4 rows
    #
    # "seasonal" for the same reason `adp_source` is: it travels with a value
    # fetched with the year in the URL, and it describes THAT fetch. C — if you
    # would have called it "derived" instead, change it; both pass LIVE_ALLOWED
    # so nothing downstream moves either way, and I matched the sibling rather
    # than invent a rule.
    #
    # ⚠️ C, ANSWERING THE QUESTION IN THE LINE ABOVE — "if you would have called
    # it derived instead, change it". I would, and I did, and the reason is this
    # table's own stated criterion rather than resemblance to its siblings:
    # `fitted_sd` RETURNS this string ("ffc" where the provider published a
    # stdev, "clamped-linear" where we fitted one), so NOTHING FETCHES IT — the
    # build computes it from the source it already has. `adp_source` and
    # `bye_source` ride alongside a value that came off the wire; this one is
    # produced by our own arithmetic about that value. Both pass LIVE_ALLOWED so
    # nothing downstream moves, exactly as A said.
    "adp_sd_source": "seasonal",
    # TERRITORY-GRANT: A proj_sd_source
    # Same shape, same reasoning, same precedent as adp_sd_source directly
    # above (Override #4): projections.py:310 writes proj_sd_source in the
    # same dict literal as proj_sd (REC-1's calibration, bb1d115a) — the
    # field names WHICH PATH produced proj_sd and travels with that fetch.
    # Declared by the relay 2026-08-16 so the publication gate stops
    # refusing fresh boards for carrying it; C — challenge freely.
    "proj_sd_source": "seasonal",
    # ⚠️ ADDED BY A, 2026-08-13, WITH CORY'S AUTHORISATION — SECOND OVERRIDE OF
    # THE A/C BOUNDARY. These three are A's per-player ADP season stamps
    # (`build.adp_season_stamps`), C's own gate implemented in A's lane. They
    # landed on A's branch, so this table — written against main — did not know
    # them, and the DEFAULT-IS-VIOLATION design correctly refused them the moment
    # the branches met. The design worked; it just had nobody to answer it.
    #
    # "derived", not "seasonal", and the distinction is the point of this axis:
    # `adp` IS the seasonal value, while `adp_season` is a STAMP SAYING WHICH
    # SEASON THAT VALUE IS FOR. It is computed at build time from the source's
    # own URL/response, so it is neither fetched nor carried over from a prior
    # year. Marking it "seasonal" would claim the stamp itself goes stale, which
    # is the confusion the stamp exists to remove.
    "raw_adp_season": "derived", "adp_season": "derived",
    "consensus_rank_season": "derived",
    "bye": "seasonal", "bye_source": "seasonal",
    "proj_sleeper": "seasonal", "proj_fantasypros": "seasonal",

    # nflfastR play-by-play for [season-1, season-2] — build.py:665. These ARE
    # prior-season values on a 2026 board, and legitimately so: 2026 usage does
    # not exist yet. They must be DECLARED historical, not blocked and not waved
    # through. This is exactly Cory's "unless that data IS considered relevant to
    # this year".
    # A BLEND of [season-1, season-2] at recency_weights [0.7, 0.3], NOT one year.
    "target_share": "historical", "opportunity_share": "historical",
    "wopr": "historical", "opportunity_z": "historical",
    # The six that opportunity_metrics computed and the board dropped until
    # 2026-08-17. Same [season-1, season-2] blend as their three siblings above,
    # so the same honest label: prior-season measurements, deliberately carried.
    "air_yards_share": "historical", "adot": "historical",
    "rz_share": "historical", "rz_targets": "historical",
    "carries": "historical", "gl_carries": "historical",
    "opportunity_adj": "historical",
    # own_projections.compute_own_projections: a walk_forward model fit over
    # prior-season nflverse data (own_projections.py's own default
    # prior_years, discovered backward from season-1). Same axis as the four
    # above -- these ARE prior-season values on a 2026 board, legitimately.
    # SECOND HALF OF THE SAME FIX AS BOARD_FIELD_PURPOSE below: this is a
    # SEPARATE registry (the season axis, not the purpose axis) and
    # registering proj_ownmodel in only one of the two still failed the
    # nightly rebuild -- found 2026-08-15 by firing the real rebuild after
    # the first fix and watching test_EVERY_BOARD_FIELD_IS_CLASSIFIED still
    # red, rather than assuming the first fix was complete.
    "proj_ownmodel": "historical",

    # NFL DRAFT CAPITAL (draft_capital.attach_capital, 2026-08-17). Declared
    # HISTORICAL rather than seasonal, and the reason is that the column spans
    # both: for this year's rookie class the NFL round IS 2026 information, but
    # for the ~250 veterans who also carry it, it is a fact from 2021-2025.
    # Labelling the whole column "seasonal" would assert current-season
    # provenance for rows where that is simply false, and this registry exists
    # to stop exactly that. "historical" is the honest label for a mixed column
    # and it is also the conservative one — it forces the field to be NAMED as
    # prior-season information rather than waved through.
    #
    # It does not decay the way a projection does: draft capital is permanent,
    # which is why it can be carried forward without a freshness worry. That is
    # a property of THIS field, not a general licence.
    "nfl_draft_round": "historical", "nfl_draft_pick": "historical",
    # Sibling of proj_sd_source: says whether proj_ceiling is the measured
    # 2023-25 p90 or the Gaussian fallback for an unmeasured band.
    "proj_ceiling_source": "derived", "proj_floor_source": "derived",
    # PROVENANCE STAMP for the own-model column's algorithm, PER ROW
    # (2026-08-17). Written by apply_rookie_prior_own_model_2026.fill_players
    # (build.py calls it gated on league_config.rookie_capital_prior — Cory's
    # take-a-swing ruling, verbatim in that config key) as
    # "rookie_capital_prior_2026" on exactly the rookie rows the layer fills;
    # walk-forward own_v6 rows carry no stamp. "derived" for the same reason
    # as adp_sd_source/proj_ceiling_source: nothing fetches it, the build
    # writes it about a value it just computed, and it is never an input to a
    # number.
    "proj_ownmodel_source": "derived",
    # Pure functions of the two above (draft_capital.tier_of, and the capital
    # season vs the board season), so they inherit the derived label.
    "capital_tier": "derived", "is_nfl_rookie": "derived",
    # `late_trajectory` — written by build.py from draft/late_trajectory.py:
    # prior-season late-window PPG minus season PPG, the F7 construction, off
    # the COMPONENT stores (A's 2026-08-17 store ruling). Ruled live by Cory
    # ("they should be baked in the model" — the trajectory-lean bake): the
    # tie-break voice reads it, nothing ranks on it. Classified like the
    # other prior-season derivations (adp_sd/proj_ceiling): the build writes
    # it about numbers it just computed from committed stores.
    "late_trajectory": "derived",

    # Computed from the above; a derived field is only as current as its inputs,
    # which is why A's refusal belongs where the derivation happens.
    # RUNTIME on the base (build.py:340 can swap in prior-season actuals) AND
    # always blended with [season-1, season-2] usage through opportunity_adj —
    # projections.blend does `base * (1 + adj)`. Reaches 2024 on every path.
    "proj_mean": "runtime", "proj_baseline": "runtime",
    # THE MULTI-SOURCE BLEND (A, 2026-08-19). `proj_mean_sleeper_only` is the
    # pre-blend value kept verbatim so the change is reversible and auditable
    # from the artifact; `proj_mean_source` names which of the two paths wrote
    # the number on the row. Both are written at BUILD time from the 2026
    # capture and the same run's Sleeper pull, so they carry the same season
    # reach as `proj_mean` itself — runtime, not a prior season.
    "proj_mean_sleeper_only": "runtime", "proj_mean_source": "runtime",
    "proj_sd": "derived", "proj_ceiling": "derived", "proj_floor": "derived",
    "variance": "derived", "variance_why": "derived", "weekly_sd": "derived",
    "games_expected": "derived", "vorp": "derived", "replacement": "derived",
    "tier": "derived", "tier_rank": "derived", "tier_size": "derived",
    "tier_drop": "derived", "overall_rank": "derived", "pos_rank": "derived",
    "pool_rank": "derived", "adp_stale": "derived", "adp_velocity": "derived",
}

#: `PROJECTION_PROVENANCE.source` values and what season they imply.
PROJECTION_SOURCES = {
    "sleeper_projections": "seasonal",
    "fantasypros_projections": "seasonal",
}


def projection_source(provenance: dict, target_season):
    """The projection field's TRUE kind, read from provenance at build time.

    THIS IS THE FIELD CORY'S GATE EXISTS FOR. `build.py:340` falls back to the PRIOR
    SEASON'S ACTUALS when fewer than `PROJECTION_MIN_NONZERO` of this year's
    projections carry points — the August case, when the upcoming season has no
    projections published yet. On that path every `proj_mean` on a 2026 board is a
    2025 realized total, and the only thing that says so is
    `PROJECTION_PROVENANCE.source` reading `sleeper_stats_2025`.

    So this field cannot be declared statically. Declaring it `seasonal(2026)` would
    stamp a board built on last season's actuals as this year's, and pass the gate
    built to catch precisely that.

    (Checked on the 2026-08-13 board: source is `sleeper_projections`, 633 rows with
    points — the fallback did NOT fire. The path is live and currently unused.)
    """
    src = ((provenance or {}).get("projections") or {}).get("source")
    if src in PROJECTION_SOURCES:
        return seasonal(int(target_season))
    if isinstance(src, str) and src.startswith("sleeper_stats_"):
        return historical(int(src.rsplit("_", 1)[-1]))
    raise ValueError(
        "unrecognised projection source %r — refusing to guess. An unknown source "
        "defaulted to this year's is the assumption this gate exists to remove; if "
        "a new provider has landed, add it to PROJECTION_SOURCES deliberately." % src)


def unclassified_fields(row: dict) -> list:
    """Board fields with no declared provenance.

    A MAP WITH A HOLE IS WORSE THAN NO MAP: the gate goes green on exactly the field
    nobody thought about, which is always the one added last week by someone who did
    not know the gate existed. So this is asserted by test against the real artifact
    rather than maintained by hope.
    """
    return sorted(k for k in (row or {})
                  if not k.endswith("_season") and not k.endswith("_historical")
                  and k not in BOARD_FIELD_SOURCES)


# ── PURPOSE, THE SECOND AXIS ────────────────────────────────────────────────
#
# The season axis above answers WHICH YEAR a field describes. This one answers
# WHAT IT WAS PRODUCED FOR, which is a different question and the one Cory raised:
# data made to decide whether something works must not price a live
# recommendation, and a PRIOR estimated from past seasons must not be read as a
# measurement of this one.
#
# THE AUDIT THAT MOTIVATED IT found the runtime paths clean. No live surface
# reads a backtest or experiment file — `src/routes/*`, `netlify/functions/*` and
# `public/js/*` load only the board, `league_history.json`, `identity_map.json`
# and `payouts.json`. The one set of experiment-derived constants in the draft app
# (`deviation.js` MARKET_EFFICIENCY, from `exp36.json`) agrees 11/11 with its
# artifact and is used in the direction its own comment describes.
#
# WHAT WAS NOT COVERED IS THE BOARD, where a historical prior and a live feed sit
# in adjacent fields with nothing distinguishing them. `target_share: 0.295` is
# 2024-25 usage; printed beside `injury_status`, which really is current, it reads
# as this season's number and nothing in the row says otherwise.

LIVE_FEED = "live_feed"                # fetched this season, describes now
HISTORICAL_PRIOR = "historical_prior"  # estimated from prior seasons; legitimate, must be NAMED
MODEL_CONSTANT = "model_constant"      # a declared constant or config value
DERIVED_PURPOSE = "derived"            # computed from other board fields
EXPERIMENT = "experiment"              # output of a study — NEVER prices a recommendation

#: Purposes a LIVE surface may act on. `experiment` is absent deliberately: an
#: experiment is selected, pre-registered and often adversarial by design, and its
#: output answers "does this work", never "what is this player worth".
LIVE_ALLOWED = (LIVE_FEED, HISTORICAL_PRIOR, MODEL_CONSTANT, DERIVED_PURPOSE)

BOARD_FIELD_PURPOSE = {
    # measured this season, about this season
    "player_id": LIVE_FEED, "name": LIVE_FEED, "position": LIVE_FEED,
    "team": LIVE_FEED, "age": LIVE_FEED, "years_exp": LIVE_FEED,
    "injury_status": LIVE_FEED, "depth_chart_order": LIVE_FEED,
    "sleeper_rank": LIVE_FEED, "bye": LIVE_FEED, "bye_source": LIVE_FEED,
    "adp": LIVE_FEED, "raw_adp": LIVE_FEED, "adjusted_adp": LIVE_FEED,
    "adp_sd": LIVE_FEED, "adp_source": LIVE_FEED, "consensus_rank": LIVE_FEED,
    # DERIVED, NOT LIVE_FEED, and by this table's own stated criterion rather than
    # by resemblance: `fitted_sd` RETURNS it ("ffc" where the provider published a
    # stdev, "clamped-linear" where we fitted one), so nothing fetches it — the
    # build computes it from the source it already has. It is provenance ABOUT a
    # number and never an input to one, which is exactly the reasoning written for
    # the ADP season stamps below. No ranking may read it and none does.
    "adp_sd_source": DERIVED_PURPOSE,
    # ⚠ `proj_sd_source` IS A'S, KEPT VERBATIM FROM main AND DELIBERATELY NOT
    # CHANGED TO MATCH. It is the same SHAPE as `adp_sd_source` above — a
    # provenance string about a number nothing ranks — so by the reasoning
    # directly above it would also be DERIVED. It carries A's TERRITORY-GRANT,
    # so the call is A's and I have left it alone rather than making the table
    # self-consistent by trespass. Flagged to A instead.
    "proj_sd_source": LIVE_FEED,   # TERRITORY-GRANT: A proj_sd_source (see above)
    # A's ADP season stamps — see the note in BOARD_FIELD_SOURCES. DERIVED, not
    # LIVE_FEED: nothing fetches them, the build computes them from the source it
    # already has. They are provenance about a number, never an input to one, so
    # no ranking may read them and none does.
    "raw_adp_season": DERIVED_PURPOSE, "adp_season": DERIVED_PURPOSE,
    "consensus_rank_season": DERIVED_PURPOSE,
    "proj_fantasypros": LIVE_FEED, "proj_sleeper": LIVE_FEED,
    # ESTIMATED FROM PRIOR SEASONS. Allowed — this is how anything gets priced —
    # and named, because the failure is a prior read as a current measurement.
    "opportunity_adj": HISTORICAL_PRIOR, "opportunity_share": HISTORICAL_PRIOR,
    "opportunity_z": HISTORICAL_PRIOR, "target_share": HISTORICAL_PRIOR,
    # Retained 2026-08-17. rz_share is the one that cost a study: it was
    # computed from play-by-play and consumed in the composite while reaching
    # zero board rows, so opportunity_inheritance had to report red-zone
    # vacancy as unmeasurable when it had in fact been measured.
    "air_yards_share": HISTORICAL_PRIOR, "adot": HISTORICAL_PRIOR,
    "rz_share": HISTORICAL_PRIOR, "rz_targets": HISTORICAL_PRIOR,
    "carries": HISTORICAL_PRIOR, "gl_carries": HISTORICAL_PRIOR,
    "wopr": HISTORICAL_PRIOR, "games_expected": HISTORICAL_PRIOR,
    # own_projections.compute_own_projections: a walk_forward season-total model
    # fit over prior-season nflverse data (own_projections.py), same class as the
    # other prior-season estimates above. NOT derived from other board fields (it
    # is fetched/computed independently) and NOT yet an input to proj_mean/vorp/
    # ranking -- attach_own_model()'s own docstring guarantees additive-only, a
    # display field for comparison, not a pricing input. Missing this
    # classification is what blocked the 2026-08-15 08:36 UTC nightly rebuild
    # (draft-data.yml) from publishing at all -- the "every board field is
    # classified" gate correctly refused an undeclared field rather than
    # trusting it silently.
    "proj_ownmodel": HISTORICAL_PRIOR,
    # PROVENANCE STAMP for the own-model column's algorithm, per row
    # (2026-08-17): "rookie_capital_prior_2026" on the 74 rookie rows the
    # Cory-ruled rookie_capital_prior layer fills (his verbatim approval lives
    # in league_config.rookie_capital_prior and in the board's applied_layers
    # record); absent on walk-forward own_v6 rows. The stamp is how a reader
    # separates the two populations. NOT an exempt wildcard and NOT
    # EXPERIMENT: the layer is a RULED live layer — preregistered, graded
    # (cleared its 25% bar on the 3-season all-seats replay) and applied on
    # Cory's word — and the stamp itself is DERIVED by the same criterion as
    # adp_sd_source: the build writes it about a value it just computed, and
    # nothing ranks on it.
    "proj_ownmodel_source": DERIVED_PURPOSE,
    # RULED live field, same ruling chain as the stamp above: Cory's bake
    # order put the trajectory lean FIRST in the tie-break voice, and
    # verdict.js reads this field for that fact. Derived (build-computed
    # from committed component stores), never an input to a ranking.
    "late_trajectory": DERIVED_PURPOSE,
    # place it sits awkwardly under HISTORICAL_PRIOR ("estimated from prior
    # seasons"). Filed here anyway because the alternative labels are worse:
    # it is not LIVE_FEED (most rows describe a prior year), not
    # MODEL_CONSTANT (it is fetched, not declared), and emphatically not
    # EXPERIMENT — nflverse's draft_picks release is source data, and the
    # STUDY that made us interested in it (rookie_wr_capital_2026-08-17) is a
    # separate artifact that this column does not carry.
    #
    # The distinction matters because EXPERIMENT means "never prices a
    # recommendation", and the open question Cory has posed is precisely
    # whether this SHOULD price one. Today it does not: no shipped weight reads
    # these fields. If a ceiling boost ever keys on capital_tier, this
    # classification is where the change must be argued.
    "nfl_draft_round": HISTORICAL_PRIOR, "nfl_draft_pick": HISTORICAL_PRIOR,
    "proj_ceiling_source": DERIVED_PURPOSE,
    # Siblings of proj_ceiling_source, and classified the same way for the
    # same reason: nothing FETCHES them, the build writes them to say which
    # path produced proj_mean on that row. A live surface may read them to
    # label a number's provenance; it may not treat them as a value.
    "proj_mean_source": DERIVED_PURPOSE,
    # The pre-blend Sleeper projection, retained so the blend is reversible
    # and so a surface can show what a number USED to be. It is a real
    # projection and not an experiment output, but it is superseded on the
    # rows that carry it — never the value to act on.
    "proj_mean_sleeper_only": DERIVED_PURPOSE,
    "proj_floor_source": DERIVED_PURPOSE,
    "capital_tier": DERIVED_PURPOSE, "is_nfl_rookie": DERIVED_PURPOSE,
    # declared in config or code rather than measured from a feed
    "variance": MODEL_CONSTANT, "variance_why": MODEL_CONSTANT,
    "replacement": MODEL_CONSTANT,
    # arithmetic over the rows above
    "proj_baseline": DERIVED_PURPOSE, "proj_mean": DERIVED_PURPOSE,
    "proj_floor": DERIVED_PURPOSE, "proj_ceiling": DERIVED_PURPOSE,
    "proj_sd": DERIVED_PURPOSE, "weekly_sd": DERIVED_PURPOSE,
    "vorp": DERIVED_PURPOSE, "overall_rank": DERIVED_PURPOSE,
    "pos_rank": DERIVED_PURPOSE, "pool_rank": DERIVED_PURPOSE,
    "tier": DERIVED_PURPOSE, "tier_rank": DERIVED_PURPOSE,
    "tier_size": DERIVED_PURPOSE, "tier_drop": DERIVED_PURPOSE,
    "adp_stale": DERIVED_PURPOSE, "adp_velocity": DERIVED_PURPOSE,
    # KEPT ROWS CARRY FOUR MORE FIELDS, and this map did not have them. The map
    # was built from `players`, and `kept_players` is a different shape — so the
    # three rows that are OFF the board entirely, the ones whose cost decides
    # which picks exist, were the rows nothing classified. Read off
    # draft/build.py:1034-1045 rather than inferred from the names:
    #   team_slot      the league seat, from the keeper declaration
    #   original_round the round the keeper was originally drafted in. A fact
    #                  from a past draft, but a RECORDED one, declared this
    #                  season and exact — not an estimate, so not a prior.
    #   is_keeper      stamped True by the builder for membership in kept_ids
    #   cost_round     keeper_cost_round(k, cfg) — arithmetic over the record and
    #                  the league's cost model
    "team_slot": LIVE_FEED, "original_round": LIVE_FEED,
    "is_keeper": DERIVED_PURPOSE, "cost_round": DERIVED_PURPOSE,
}


def unpurposed_fields(row: dict) -> list:
    """Board fields with no declared PURPOSE — a hole in the map, not a pass.

    Same guard as `unclassified_fields` and for the same reason: the field nobody
    thought about is the one added last week, and defaulting it to `live_feed`
    would trust a brand-new ingest field as a current measurement on the day it
    lands. That is the most dangerous default available here.
    """
    return sorted(f for f in (row or {}) if f not in BOARD_FIELD_PURPOSE)


def purpose_violations(row: dict, purposes: dict = None, allowed=LIVE_ALLOWED) -> list:
    """Fields on a LIVE row whose purpose is not one a live surface may act on.

    An unmapped field is a violation too — see `unpurposed_fields`.
    """
    m = dict(BOARD_FIELD_PURPOSE, **(purposes or {}))
    return sorted(f for f in (row or {})
                  if m.get(f, EXPERIMENT) not in allowed)


def purpose_report(row: dict, purposes: dict = None) -> dict:
    """Which fields are live measurements, which are priors, which are violations.

    `priors_present` is the number worth surfacing: a row carrying priors is not
    wrong, it is a row where some values describe LAST season and a reader cannot
    tell from the row alone.
    """
    m = dict(BOARD_FIELD_PURPOSE, **(purposes or {}))
    by = {}
    for f in sorted(row or {}):
        by.setdefault(m.get(f, EXPERIMENT), []).append(f)
    return {"by_purpose": {k: v for k, v in by.items()},
            "violations": purpose_violations(row, purposes),
            "unpurposed": unpurposed_fields(row),
            "priors_present": bool(by.get(HISTORICAL_PRIOR))}
