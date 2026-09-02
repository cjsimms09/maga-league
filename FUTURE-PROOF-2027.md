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
