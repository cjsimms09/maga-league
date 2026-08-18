# E's third sweep — mostly flags that died, recorded so nobody re-runs them

**Session E (red team), 2026-08-17.** Board: `origin/main`'s
`public/draft_data.json`, `2026-08-16T14:10:12Z`, 682 players.

`SESSION-E.md`: *"Half the flags die here, and that is a good outcome, not a
wasted one."* This pass was mostly that. It is written down because an
uninvestigated hunch costs the next session the same hour it cost me.

---

## DIED — the draft-slot arithmetic is right

`keeper_slate.arithmetic_check` claims `my_first_pick: 33`. Rebuilt
independently from `league` (10 teams, snake, slot 8, 15 rounds) without reading
the board's answer:

```
snake picks for slot 8:  8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148
keep 0 -> 8    keep 1 -> 13    keep 2 -> 28    keep 3 -> 33
```

Matches the board's `first_pick_by_my_keeper_count` exactly, and
`pick_order.my_picks` starts at 33 with the first three entries forfeited to
Chase / Henry / Walker. `board_picks 150 = 10 × 15`, `live_picks 147 = 150 − 3`.
**This is the most actionable number on the board and it reproduces from
scratch.** Nothing to do.

## DIED — bye weeks are complete and coherent

32 distinct NFL teams, **every one carrying exactly one bye week**, spread over
weeks 5–14 (2/4/4/4/2/4/6/4/2 teams per week, summing to 32). Exactly one player
in the top 200 has no bye (Daniel Carlson, K). No team carries two.

## DIED — tier construction (re-confirming sweep 2)

0 cases of `tier` decreasing as `pos_rank` rises; 0 cases of `tier_size`
disagreeing with the real population of that tier.

## DIED — `games_expected` is a per-position constant, and the repo says so first

`games_expected` has **exactly one value per position** — QB 15.5, RB 14.2,
WR 15.0, TE 14.8, K 16.5, DEF 17.0. Zero player-specific information, on a field
whose name promises per-player availability. That is the §1 defect shape by
name.

**It is not a finding, because it is already documented in four places**, most
fully in `bench_mv.js`'s input ledger:

> *"6. AVAILABILITY. POSITION-LEVEL ONLY, and this is the weakest input in the
> file… so every running back on the board carries the same injury prior. It
> contains no information about THIS back's history. A handcuff is therefore
> worth nothing extra here, which is wrong, and the size of that wrongness is
> unknown."*

Also named in `independence_screen.js:100`, `draft_plan.js:574` and
`emit_seat_plan.js:471`. **This is the repo at its best** — the weakest input in
a file, labelled as the weakest input in that file, with the direction of the
error stated. I record it only so the next person who notices the constant finds
this note instead of re-deriving it.

## DIED — `injury_status` is consumed, not merely displayed

I flagged this as a possible "source column shown but not used". It is used, in
three places: `engine.js:1088` (a −12 `risk` clause), `engine.js:1388` (the
"your starter is flagged" backup prompt), and `app.js:5694` (a badge). The −12
is flat across every non-healthy status, so Questionable and IR are priced
identically — **but `MEASURED_WEIGHTS.risk = 0.0`, so none of it reaches a
composite recommendation**, and `WEIGHT_PROVENANCE` says why in the artifact
itself (*"UNMEASURED — term is PARTIAL on the backtest board"*). That is
register row 7, already open and already A's. Nothing new here.

---

## ONE SURVIVOR, AND IT IS SMALL — live PUP/IR status reaches no availability number

The `bench_mv.js` note above says `games_expected` carries no information about
*this back's history*. **It is also true, and not written anywhere, that it
carries no information about his status TODAY** — including designations that
are on the board right now.

```
George Kittle       TE  injury_status PUP  games_expected 14.8  ovr  82  adp  96.67
Alec Pierce         WR  injury_status PUP  games_expected 15.0  ovr 100  adp  89.00
Zach Charbonnet     RB  injury_status PUP  games_expected 14.2  ovr 313  adp 136.00
Zane Gonzalez        K  injury_status IR   games_expected 16.5  ovr 193  adp 348.00
```

Every one is modelled as playing the same number of games as a fully healthy
player at his position. `bench_mv.js` then derives
`injuryWeeks = NFL_WEEKS − 1 − games_expected`, so **that constant propagates
into the bench simulation as a per-position constant too** — every RB is
simulated as missing exactly 1.8 weeks, every TE 1.2, healthy or on PUP.

**The one that could touch a pick: George Kittle.** The board ranks him overall
82 against an ADP of 96.67 — about fifteen picks *ahead* of the market — while
he sits on PUP and every availability number in the system treats him as a
healthy tight end.

**Deliberately not overclaimed.** The composite does not use this: `risk` is
weighted 0.0 and `bye` is weighted 0.0, and those are the only composite paths
`injury_status` and `games_expected` touch. So this is not a live mis-ranking —
it is an input that is blank where the board already holds the data to fill it.
Note also that *some* injury handling exists and is inconsistent rather than
absent: Pearsall, Brazzell, Rechsteiner and Moss are all zeroed to
`proj_mean 0.0` on IR, while Kittle and Charbonnet on PUP are untouched.

**Filed to A with a default and no urgency.** It is weeks-old behaviour, it
reaches no composite recommendation, and five days before a draft is the wrong
moment to wire an availability model. Recorded so the decision is made rather
than inherited — and so that `bench_mv.js`'s honest ledger can be extended from
"no history" to "no history and no current status", which is the fuller claim.

---

## STILL NOT COVERED BY ANY OF MY THREE SWEEPS

- **Register rows 2 and 3** — both concern the *fresh* 693-player board. I have
  swept the *published* 682-row board throughout, because that is what Cory
  drafts from. Building a fresh one needs Sleeper/FFC egress this session does
  not have. Untouched and still open.
- **The war room as a surface** — held per sequencing until B ships the
  redesign. Truth defects only until then, and the live one (registers 21/21b)
  is already routed.
- **K and DEF beyond structure** — 73 rows still on `gaussian_z`, which is
  register 8b and already owned.
