# FUTURE-PROOF 2027 — how the model comes to know more than Cory about THIS league

**Cory, 2026-09-02, verbatim:** *"Keep making model more future proof, make it
understand football better. This years draft was a nightmare! How do we build
this so next year the model knows more than I do about the intricacies of
fantasy. How do we really future proof this model and make it learn."*

Relay, 2026-09-02. Everything here rests on files; the one-line version is at
the bottom. **Companion, not replacement:** `DRAFT-2026-LESSONS.md` (what
happened), `DRAFT-2027-PROGRAM.md` §7 (the eight readiness commitments with
owners and dates), `PROJECTION-PROGRAM-2027.md` (the projection bar),
`EDGE-DEFINITION.md` (what winning means in Cory's numbers).

---

## 0 · THE UNCOMFORTABLE MEASUREMENT THAT SETS THE STRATEGY

"Make it understand football better" sounds like *add football rules*. We tried
that — properly, preregistered, graded — and the rules mostly lost:

| the football intuition | ledger | verdict on OUR scoring, OUR league |
|---|---|---|
| RBs decline with age; price the cliff | P325 | **FALSE** |
| year-2 WRs leap; screen for them | P326 | **FALSE** |
| a 3-week snap/opportunity surge predicts the next weeks | P327 | **FALSE** |
| an expert's preseason projection (Mike Clay) beats the room's draft order | P241 | **FALSE** |
| pay up for a QB / take RBs early | draft-value study | **noise** — CIs include zero, signs flip by year |
| the keeper premium is large | P334 | **small; another season will not resolve it** |
| the room is dumb money | draft-value study | **the room captures 82–87% of perfect-hindsight value** |

**What DID hold, every time it was measured:** conversion beats acquisition
(15.9 bench points/week left on the table vs a 14.2-point total draft prize);
roster shape must be priced during the draft (`need` at 0 drafted seven QBs);
ceiling is a bench instrument; the market (props) beats every projection arm
we own at all four positions (register 463); and the things nobody wrote down —
WHY Cory overrode 11 of 12 picks, WHY he kept who he kept — were the highest-
stakes decisions with zero instruments.

**So "knows more than I do about the intricacies" means, concretely:** the
model holds (1) a per-league, per-owner, per-week evidence base no human keeps,
(2) a ledger of football claims with MEASURED effect sizes on this scoring —
including the ones that are zero, which is most of expertise, (3) a record of
Cory's own reasoning, graded, so it learns his edge and his blind spots, and
(4) a January synthesis that turns a season of grades into the 2027 board spec.
Not more rules. More graded rules.

---

## 1 · THE FOUR LAYERS, AND WHAT EACH ONE IS MISSING

**LAYER 1 — the evidence base (C).** Frozen weekly, before kickoff, all season:
every arm's projection (`proj_series`, keepers restored 08-31), props from two
free doors (`weekly_props_*`, live 09-02), snap counts (Wed), Vegas lines
(Thu/Sun), practice participation, roster state, the room's ADP. **Missing,
and cheap:** a `team_context` store — OC/HC, offensive pace, pass-rate-over-
expectation, O-line continuity — the situational facts a good drafter carries
in his head and nobody here has ever written to disk. Routed to C.

**LAYER 2 — the Football Knowledge Ledger (E proposes, D measures, relay
chases).** Football claims are filed as ledger rows with a 🏈 tag, each with
the data that decides it and a grade date; the existing checker already fails
the build on a row past its date or a grade that changed nothing. **The
program's product is the table of effect sizes, TRUE and FALSE alike.** Queue
(§2) — three enter per fortnight through the Monday explorer, backtested on
2021-2025 before anything touches a live number.

**LAYER 3 — Cory's judgment, captured and graded (B).** The draft lost eleven
WHYs. In-season the lineup and waiver pages capture every override already
(08-24 mandate) but not the reason. **One tap at write time, this season, not
next July** — because the season is where his judgment shows up 17 times, and
by January we can measure where his overrides beat the tool (his edge, to be
encoded) and where they cost him (his blind spots, to be alerted). This is the
only way the model ever learns what Cory knows.

**LAYER 4 — the synthesis (relay owns; P345, due 2027-01-15).** One document
that consumes every 2026 grade and emits THE 2027 BOARD SPEC: sources and
weights per position, roster-shape weights (from this season's bench leak),
keeper policy (from the grader), the wire-supply rule, the room model, and
Cory's measured tendencies. **The rule that makes it future-proof: nothing
enters the 2027 board without a graded prior behind it.** An idea with no
ledger row is not on the board.

---

## 2 · THE KNOWLEDGE QUEUE — twelve claims, each with the data that decides it

Priors are stated honestly from what already failed; a FALSE is a result.

| # | claim (🏈) | decided by | prior |
|---|---|---|---|
| K1 | Pass-rate-over-expectation + pace (team context) improve weekly WR/TE start/sit over the props arm | nflverse pbp 2021-25, `nflverse_pace.json` | low — P14 open since 08-18 |
| K2 | Coaching/OC change resets a team's target distribution — prior-year usage should be discounted for those teams | team_context store × 2021-25 usage | medium |
| K3 | Practice participation (LP/DNP Wed-Fri) predicts a Questionable player's realized points better than the injury tag alone | `practice_participation.json` | medium — store exists (P308) |
| K4 | Red-zone share is stickier week to week than TD rate — price RZ share, not last week's TDs | `test_red_zone_additive` lineage | medium |
| K5 | The 2027 keeper rule: keeper value = replacement gap at his 2027 price, not raw points | register 289 grader, all season | high |
| K6 | Handcuff value in THIS league: the wire supplies RB2s free, so handcuffs are bench dead weight | conditional_value + 2026 waiver log | medium (lesson 3) |
| K7 | Weather (wind ≥15 mph) moves K/DEF and deep-passing enough to change a start/sit | `game_weather.py` (unwired) × realized | low-medium |
| K8 | Cory's overrides beat the tool when they cite injury/news and lose when they cite "feel" | Layer 3 reasons × outcomes | unknown — the point |
| K9 | The room over-pays at positions it drafted early last year (recency) | 150-pick log + drafter histories, P259 | medium |
| K10 | Late-season schedule (weeks 15-17) is priced by nobody in this room | playoff-weighting study + 2026 realized | medium |
| K11 | Rookie WR/TE priors from draft capital + landing spot beat ADP at pricing them | P9 (rewritten), `nflverse_draft_picks` | low — P8 said rookie ceilings differ |
| K12 | Our own weekly arm, given usage + market, beats Sleeper at 3 of 4 positions | THE 2027 bar, 09-15 first grade | the program's own question |

Zero-effect answers are kept as knowledge: they are what stops the 2027 board
from carrying a rule because it sounds like football.

---

## 3 · HOW IT LEARNS, MECHANICALLY (all of this already runs)

Thursday emit → Sunday resolve → Tuesday grade → promotion after 3 of 4 →
kill switch (D4) · Monday explorer, ≤3 preregistered arms a week, backtested
first · Wednesday audit of burn and decision latency · every site
recommendation logged and graded whether or not Cory takes it · the ledger
checker fails CI on any row past its date · **Rule 3f/3i on every finding.**
**New this season:** the 🏈 tag, the WHY tap, the team-context store, and
the "no graded prior, no board entry" rule for 2027.

---

## 4 · THE ONE-LINE VERSION

The model gets ahead of Cory not by knowing more football than he does, but by
keeping a season of evidence he cannot keep, grading every football belief
against this league's scoring, learning what his overrides are worth, and
building the 2027 board only from what survived.

---

## 5 · "BUT IT DRAFTED FOUR TIGHT ENDS" — the value function, not a cap (Cory, 09-02)

**Cory:** *"just setting a hard constraint doesn't force it to learn.. if it knew
that you can only start 2 TE and really only 1 because only 1-3 TE in the whole
league are worth a flex spot then it wouldn't draft 4. Drafting 4 is a symptom
of a larger knowledge gap that putting a cap on still doesn't solve."* Correct.

**Measured 09-02 (`draft/audit/roster_grammar_audit_2026-09-02.json`, controls
green):** the tool's own draft-night recommendations, followed literally, break
the format in EVERY seat — 7.1 violations/seat, 0 clean, never a complete
roster (no TE in 9 seats, seat 10 = eleven RBs); humans 1.0/seat, 3 clean; the
2023-25 replay engine 3.8/seat, 0 clean, seven QBs in one seat.

**The gap is the VALUE FUNCTION.** The engine prices a player by value-over-
next-available AT HIS POSITION; it never asks what he adds to MY roster's
startable points. A model that asked that question would price a third TE at
~0 on its own: one TE slot, a FLEX that only the top few TEs ever earn (a
number we MEASURE weekly from realized points), and a wire that supplies TE
replacement free (DEF 100% of pool cycled, K 83% — `waiver_supply.js`). That
is marginal lineup value, and it already exists as a second voice
(`public/js/draft/mlv.js`, `mlv_recommend.json`, Cory's 08-19 ruling "let's
use mlv"). It is not the score the board ranks on.

**MEASURED THE SAME NIGHT (`mlv_grammar_probe_2026-09-02.json`): MLV plus draft_plan's bench equation, with NO cap anywhere, replayed all ten seats of the real draft night against the room's actual picks — 1.0 violations/seat excluding the kicker, the humans' exact rate, vs the engine's 7.1; every seat RB6/WR4/TE2/QB2/DEF1; 1,901 projected startable points/seat vs humans 1,880 and the engine's 1,526. The value function LEARNED the format from measured wire levels and slot counts. Its one disagreement with the humans was the kicker. **Cory ruled 09-02 — "you can't start anyone else in a kicker spot so not having one is not smart.. but it's probably right to wait til dead last pick as replacement value is null" — and the value function earned exactly that once an empty required slot at the end of the draft was priced at the wire body: all ten seats take the K with the last pick, every roster complete, 1.0 violations/seat, 1,921 startable vs humans 1,880. Derived, not capped.**

**So the grammar (`roster_grammar.py`) is the EXAM, not the answer:** the value
function has learned the format when, UNCONSTRAINED, its recommendations pass
the grammar at the humans' rate. P363 is that claim. Only if it fails does a
constraint go in — as a disclosed guardrail with the failing term named.

**And what makes it LEARN rather than be told:** every input to MLV is a
measured, per-season number from this league — wire replacement per position
per week, how many TEs out-score the flex-level RB/WR each week, injury/bye
need rates — refreshed every season by the archives in §1. The model's "only
1-3 TEs are flex-worthy" is a count it re-derives, not a sentence it was given.

---

## 6 · FUTURE-PROOF DATA — how it keeps getting draft, player and betting info, and keeps looking (Cory, 09-02)

**Cory:** *"How do we make sure it can continue to get draft info, player info,
betting info, etc.. and continually looks for free sources of info it could get
that might help."* Three mechanisms, two of which already run:

1. **Every source is a monitored capture with a control** — `go_status.py`
   reads each capture workflow's last run and reds it the day it fails; every
   capture refuses to write on a null (Rule 3e) so a dead source shows as red,
   never as silent zeros. This week's props sourcing is the template.
2. **A SOURCE REGISTRY (C builds, `draft/data/source_registry.json`):** one row
   per data class we depend on — projections, ADP, props/odds, game lines,
   injuries/practice, snaps/usage, depth charts, weather, schedule, rosters —
   with the primary source, its endpoint and cadence, its known-positive
   control, its FALLBACK, and cost (all free by the standing ruling). **A data
   class with no fallback is a register row**, and GO status reads the
   registry so "props source dying" is an agenda line before the arm goes dark.
   **SEEDED 09-02 (relay, C's default):** 14 classes, each with primary,
   workflow, cadence, control, fallback and cost; `test_source_registry.py`
   pins the no-fallback list (snaps_usage · weather · depth_charts_team_context
   · expert_ranks · player_bio_capital) so a new gap fails CI until it is
   written down, and `go_status.py` prints a SOURCE REGISTRY section (⚠ per
   single-door class, advisory). C owns the rows from here.
3. **A standing DISCOVERY census** — `free_props_census.py` generalised: each
   month the Monday explorer spends one slot probing new free candidates per
   data class (the way six props doors were tried in one night), with the
   same controls, and E/C add candidates as they learn of them. CADENCE: first
   Monday of the month. What it finds enters the registry as a fallback first
   and a primary only after it grades.
   **BUILT 09-02 (relay): `draft/tools/free_source_discovery.py` + `free-source-discovery.yml`
   (first Monday, 12:00Z, and on dispatch) — 33 candidate doors across all 14 registry
   classes (ESPN, nflverse releases, Sleeper, Kalshi, PrizePicks, Polymarket, FFC,
   open-meteo, NWS, FantasyPros), each with a SHAPE regex so a 200 login page is not a
   door; keyed doors listed and never fetched; the report is refused when the
   Sleeper-state control is dark. Writes `draft/backtest/free_source_discovery_<date>.json`
   (+ `_latest`). Lanes add candidates to the table as they learn of them; a door that
   answers enters the registry as a fallback.**
