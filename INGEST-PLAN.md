# EXTERNAL INGEST — design + PRE-REGISTERED FILTERS

**Status: pre-registration only. No league data has been examined.**
Written 2026-08-10, before any fetch, because binding rule 4 requires the inclusion and
exclusion criteria to be fixed before the data is looked at. Post-hoc filtering of an external
sample is the same offence as re-fitting the home league until it agrees — every filter is a
degree of freedom, and choosing them after seeing the data turns a clean sample into a
confirmation machine.

## WHAT I HAVE ALREADY SEEN, declared so this pre-registration is honest

Not nothing, and pretending otherwise would defeat the point:
- `mfl_live_probe.json` (2026): MFL ADP is retrievable at our format — 702 rows, 447
  crosswalked to our board, **72% pool coverage**.
- `exp_stack_correlation` has pulled nflverse weekly data for 2023-26.

Both are about **reachability and player-level coverage**. Neither tells me anything about
which leagues qualify, how their drafts turned out, or whether any policy wins in them — so
the filters below are not chosen to produce a result. If that ever stops being true the
honest move is a new dated pre-registration, not a quiet edit.

## WHY THIS IS THE BINDING CONSTRAINT

Four separate things are currently gated on sample size, and this is the item that unblocks
all of them at once:
1. **The stack conversion test** — measured, and it came back CANNOT-RESOLVE: CI half-widths
   ±5.4 pts against a hunted effect of 2.34 pts/week, only 14 contributing roster-seasons.
2. **The shadow field** — noise-dominated at 3 seasons of one seat (the tournament's whole
   7-strategy spread was ~$725 against a $100 resolvable increment, and the winner flips with
   treatment).
3. **Hierarchical priors** — blocked by design until the pooled/local split exists, and
   pointless without a pool.
4. **A true survival calibration** — blocked outright: it needs each season's PRE-DRAFT ADP,
   and `adp_series.json` starts 2026-08-09.

## THE DESIGN — forward-style grades, not a pile of backtest material

This is the shape from the outset, not a later enhancement. For every matched league:
freeze the pre-draft board and ADP **as they existed at the time**; replay the draft under the
measured policy; emit **the same forecast types we emit at home** (survival, room_seat, the
composite's pick); grade them against actual outcomes with the same grader. That converts
public leagues from backtest material into **decision-time-clean observations**, and means one
set of graders serves both the home league and the external sample.

---

# THE PRE-REGISTERED FILTERS (v1, 2026-08-10)

Each states the rule and, where it matters, why the boundary sits there. A filter changed
later becomes **v2 with v1 retained below it** — never an edit in place.

### F1 — Format match (which leagues qualify)
- **Teams:** 10 or 12. *(Our league is 10. Replacement level and scarcity are functions of
  team count, so a 14-team league is a different game, not a bigger sample of ours.)*
- **Scoring:** half-PPR (reception value in [0.4, 0.6]). *(FantasyPros beat FFC as our anchor
  specifically because it matched our format; format is not a nuisance parameter here.)*
- **Starters:** exactly one QB (no superflex), and 6-8 starting skill slots. *(Superflex
  changes QB scarcity so completely that it would swamp every positional finding.)*
- **Draft type:** snake. No auction.
- **Keepers:** both kept and redraft leagues are IN, and the keeper count is **recorded as a
  covariate, never used as a filter**. *(Our own keeper structure is local; excluding redraft
  leagues would shrink the sample to chase a similarity we can control for instead.)*

### F2 — Draft validity
- The draft is **complete** (status complete, all rounds present).
- **≥90% of picks crosswalk** to a player we can price. Below that the replay is guessing.
- No draft with evidence of autopick for a majority of one team's picks. *(An abandoned team
  is not an opponent; it is noise wearing a seat.)*

### F3 — Player-season usability
- The player has a **realized weekly outcome series** for that season.
- A player who never appears in weekly data is **DROPPED and counted**, never scored as zero.
  *(Zero is a real outcome; absent is not. Defaulting absent to zero drags every effect toward
  the null — the same error the override grader refuses to make.)*

### F4 — Partial data
- A league missing **any** of {complete draft, pre-draft ADP, weekly outcomes} is excluded
  whole. No partial-credit leagues.
- Exclusions are **counted and reported by reason**. A sample whose attrition is invisible is
  a sample nobody can judge.

### F5 — Contamination (rule 1, and non-negotiable)
- **No in-season-updating projection source may grade historical performance.** The Sleeper
  retraction is a standing prohibition.
- **Earliest timestamp wins.** ADP is taken as of the latest snapshot STRICTLY BEFORE the
  draft date. A league whose ADP we can only observe after its draft is excluded — this is
  expected to be the largest single source of attrition, and loosening it to gain sample is
  forbidden.
- **The resolution rule is written before the outcome is fetched.** Same discipline as the
  home forward loop.
- **Simulation is labelled.** Multi-room replays are robustness testing, never forward
  evidence, and never enter a calibration table.

### F6 — Pooled vs local (rule 1c)
External data may inform **only** these, and each names its source at the point of use:
- positional replacement curves, age/pace effects, market-efficiency-by-region, format-level
  value shapes.

External data may **never** touch:
- manager tendencies, opponent survival conditioning, room behaviour, our keeper structure,
  seat-specific parameters.

**FAIL-CLOSED DEFAULT: any parameter not explicitly classified above is LOCAL.** Foreign data
cannot leak into an unclassified parameter. And if a parameter resists clean classification,
it stays local — if the split as a whole ever feels unclear or burdensome to state, we do not
build the pooling layer at all.

### F7 — Stopping rule
- Target: **≥200 matched league-seasons** before any shadow-field expansion or hierarchical
  pooling is attempted.
- If the matched count lands below that, the ingest reports the number and **changes nothing**
  — it does not lower the bar to justify the build.

---

## WHAT THIS DOES NOT COMMIT TO

Rule 9 applies here too. This pre-registers the filters; it does not promise the ingest gets
built before the draft. It is CI-only work (the sandbox has no egress), it does not help draft
night, and the honest sequence is: ship draft-night correctness first, build this after the
22nd when it can be done properly rather than squeezed.

---

# FINDINGS FROM THE SCHEMA PROBE (2026-08-10)

**What has been seen: SCHEMA ONLY. No league outcomes, no draft results content, no
grades.** That distinction is what makes the amendment below legitimate rather than
post-hoc filtering — the pre-registration exists to stop filters being chosen to
produce a result, and a shape cannot produce a result. Three 2025 leagues were
probed (`10466`, `11039`, `11306`), discovered via `leagueSearch`.

The probe ran before the adapter was written, which turned out to matter: **four of
these would each have produced a confidently-wrong parser**, and a league that fails
to PARSE is indistinguishable from a league that fails the FILTERS, so the attrition
report — the thing that makes the sample judgeable — would have lied about why
leagues were dropped.

### P1 — `draftType` is `SFIRSTRANDOM`, not `snake`
F1 checks `draft_type.lower() in ("snake",)`. MFL emits codes. A direct comparison
would have rejected **every league in the sample** and reported it as `F1.draft_type`
— a total-attrition result that looks exactly like "no public league matches our
format." Needs a code map, and any unrecognised code must be counted separately
rather than silently failing the snake test.

### P2 — starter slots are RANGE STRINGS, and superflex has no slot name
`starters.position[].limit` is `"1-2"`, not an integer. F1 does
`int(slots.get("QB")) != 1` and separately looks for a `SUPER_FLEX` key. Against MFL
that `int()` raises, and **the superflex check can never fire, because MFL expresses
superflex as a QB limit of `1-2` rather than a distinct slot.** Superflex is the one
exclusion F1 calls out as able to "swamp every positional finding," so this is the
most dangerous of the four: the filter would have been silently inoperative.

### P3 — `TYPE=league` carries no scoring at all, and `TYPE=rules` is often absent
No `rec`, no PPR field, nothing. Scoring lives in `TYPE=rules` (now probed), and that
export returned `{"error": "Error - No League Scoring Rules"}` for part of the
sample — `$.rules` is NOT always present. **Leagues with no retrievable scoring must
be their own attrition reason**, never folded into "not half-PPR", or the report
conflates "we could not tell" with "we checked and it did not match."

### P4 — MFL scoring is PER-POSITION, so "half-PPR" is not one number
Rules arrive as `positionRules[].positions` (e.g. `"TE"`) with `rule[].event.$t`
(event code, e.g. `CC`), `points.$t` (an expression like `*1`), and `range.$t`. A
league can score 0.5/reception for WR and 1.0 for TE — TE premium, which our league
is not. **F1 v1's `scoring.rec in [0.4, 0.6]` presumes a single scalar that MFL does
not have.**

### F1 AMENDMENT — v2 (2026-08-10), v1 RETAINED ABOVE, UNCHANGED
Only the **scoring** clause changes, and only because v1 is inexpressible against
the source — not to widen or narrow the sample:

> **F1.scoring (v2):** the reception value must be in [0.4, 0.6] **for every skill
> position independently** (RB, WR, TE). A league with per-position reception scoring
> outside that band at ANY skill position is excluded as `F1.te_premium_or_split_ppr`.
> A league whose scoring cannot be retrieved is excluded as `F4.no_scoring_rules` —
> a distinct reason from failing the check.

This is *stricter* than v1, not looser: v1 would have admitted TE-premium leagues by
reading a single number that does not exist. Every other v1 filter stands as written.

### STILL UNKNOWN, and not to be guessed
- **Draft completeness.** `draftResults` carries no `status`; F2 checks
  `status == "complete"`. Must be inferred (picks == franchises x rounds) and the
  inference stated, or a separate export found.
- **Autopick.** F2 excludes teams autopicking a majority. No autopick flag exists in
  `draftResults` — only a `comments` string. Until a source is found, **F2's autopick
  clause is unenforceable and must be reported as unenforced** rather than quietly
  passing every league.

Useful and confirmed: every pick carries a unix `timestamp`, which gives F5 a real
per-pick draft time rather than a league-level guess; `franchises.count` gives F1's
team count; `round1DraftOrder` gives the seat order; `keeperType` (when present) is
the keeper covariate F1 records rather than filters on.

---

# THE ATTRITION SEAM — 2026-08-11

**This is a REPORTING fix, NOT a filter change, so it is not a new pre-registration
version.** Every filter boundary above stands exactly as written. What changed is the
sentence the report gives for a rejection that was already happening — and that is
verifiable rather than asserted: the pre-fix and post-fix `screen()` were run over a
36-case corpus and **no league's accept/reject verdict moves**. Twelve rejection
sentences change, and two cases that used to raise `ValueError` now reject with a
reason. If a filter ever does need to move, that is a v3 section with v2 retained,
never an edit in place.

### What was wrong (found by session B's cross-session audit)

`screen()` reported a confident, specific falsehood whenever a field failed to parse:

| field absent / unparseable | it used to say | which claims |
|---|---|---|
| `roster_slots` | `F1.qb_slots` | "doesn't start exactly one QB" |
| `teams` | `F1.teams` | "wrong league size" |
| `draft_type` | `F1.draft_type` | "not a snake draft" |
| `draft` | `F2.draft_incomplete` | "their draft wasn't finished" |

Each asserts a check that never ran. F4 exists so that **exclusions are counted and
reported by reason** — "a sample whose attrition is invisible is a sample nobody can
judge" — and a league that fails to PARSE being indistinguishable from one that fails
the FILTERS defeats that guarantee entirely. The two fields likeliest to break are
`roster_slots` and `draft_type`, the two that needed the schema probe above to pin
down, so a mass parse failure would have read as **"no public league matches our
format"** — a conclusion someone might act on.

The sharpest part was the SEAM, not the screen. The adapter already computed the
right answer everywhere (P1's `draft_type()` returns `draft_type_unrecognised:XYZ`
precisely so an unknown code is its own reason) and those reasons reached nothing:
the function joining the adapter to the filters did not exist.

### The attrition vocabulary, and the split that makes it judgeable

Two families, and the report leads with the split because they support opposite
actions. Every reason is a TRUE statement about the league.

- **FILTERED — we read it and it does not qualify.** Evidence about the public pool.
  `F1.teams` · `F1.scoring_not_half_ppr` · `F1.te_premium_or_split_ppr` ·
  `F1.qb_slots` · `F1.starting_skill_slots` · `F1.draft_type` ·
  `F2.draft_incomplete` · `F2.no_picks` · `F2.crosswalk_below_90pct` ·
  `F2.autopick_majority` · `F5.adp_not_strictly_pre_draft`
- **UNREADABLE — we could not read or could not obtain it.** Evidence about THIS
  PIPELINE, and never a statement about format rarity.
  `F4.no_scoring_rules` · `F4.no_reception_rule` · `F4.no_team_count` ·
  `F4.unreadable_team_count` · `F4.no_roster_slots` · `F4.no_qb_slot_count` ·
  `F4.unreadable_qb_slot_count` · `F4.unreadable_starting_slots` ·
  `F4.unreadable_starter_limits` · `F4.no_draft_type` · `F4.draft_type_absent` ·
  `F4.draft_type_unrecognised` · `F4.no_draft` · `F4.no_draft_status` ·
  `F4.crosswalk_not_run` · `F4.no_weekly_outcomes` · `F4.no_pre_draft_adp` ·
  `F5.missing_timestamps`

A reason code that is in neither list is **binned nowhere and reported loudly**,
rather than defaulting into "filtered" — which would recreate the same defect one
level up, inside the summariser.

### Three things this seam states rather than assumes

- **The draft's date is its FIRST pick.** MFL drafts are `draft_kind: email` on a
  `draftLimitHours` clock and routinely span days. Dating one by its last pick would
  widen F5's window by the length of the draft, and an ADP snapshot taken while the
  room was already picking would pass "strictly before".
- **Completeness is inferred from round fullness, and its blind spot is named.** No
  MFL export carries a round count and `rosterSize` counts the bench (so it is wrong
  for every keeper league). What is observable is that every round received is full;
  a draft abandoned mid-round is caught, **a draft abandoned exactly on a round
  boundary is not** and that limit is asserted in the tests rather than left in a
  comment. The shortfall travels with the reason, because `149/150` (a league that
  quit) and `2/150` (a fetch that failed) are not the same fact.
- **F2's autopick clause is still UNENFORCED, and the report says so.** There is no
  autopick flag anywhere in `draftResults`, so the check passes every league. As
  required above, that is now declared by the adapter and printed on the report's
  verdict line — a clause passing every league must never look like every league
  satisfying it.

---

# THE AS-OF PROBE ANSWERED — and it puts the 2026 curve on a clock (2026-08-11)

Run `31458991195` on `04df27a`. Result is an artifact, not re-typed here; the three
findings below are what it establishes.

### 1. MFL SILENTLY ACCEPTS UNKNOWN PARAMETERS — so no status code in this run means anything

`CONTROL_bogus_param` (`ZZZNOTAPARAM=1`) returned **200 with the baseline's exact
composition**. That control is why the rest of the run is readable: a naive probe would
have sent `DAYS=7`, seen 200, and recorded "date-bounded ADP works". Every candidate had
to be judged on whether the COMPOSITION moved, never on whether the request succeeded.

### 2. NO CANDIDATE BOUNDS THE WINDOW TO A DATE

Ignored (200, composition unchanged): `DAYS=7`, `DAYS=30`, `START_DATE/END_DATE` in both
formats, `AS_OF`. Moved the composition: `PERIOD=ALL` and `PERIOD=RECENT` — so `PERIOD`
is real and has more values than `DRAFT`, but **`RECENT` is a rolling window, not a date
we can specify**, and it cannot reconstruct "as of 2026-08-14" after the fact.

Stated per rule 13: this is a statement about the **recorded candidate set**, which ships
inside the result and is extendable. It is not a finding that MFL cannot do this.

### 3. THE YEAR FIGURE ACCUMULATES — measured, not assumed

> **2025 (complete): 844 drafts. 2026 (in progress, mid-August): 112.**

So a finished season's ADP is an aggregate over that whole season, and **necessarily
contains drafts later than any league that drafted in August.** "Historical ADP is
retrievable" — already established — is therefore NOT the same claim as "pre-draft ADP is
retrievable", and the second is the one F5 requires.

### WHAT THIS DECIDES

**The 2026 pre-draft curve is observable only while it is happening.** Snapshot cadence is
on a clock the other three unregistered criteria are not, exactly as suspected — so the
capture-side pre-registration below is dated today and precedes the first crawl.

### WHAT IT DOES NOT DECIDE — the FFC arm reached nothing

`ffc: NO CONCLUSION — nothing was reached`. The path in that arm (`/api/v1/adp/half-ppr`)
was **written from memory, not from a probe**, so this is a fact about my query and not
about FantasyFootballCalculator (rule 13, the exact failure it names). FFC is recorded as
UNRESOLVED, not as negative, and the arm needs a correct path before anything is concluded
from it. If FFC does serve ADP by date, D3 below becomes cheaper insurance rather than the
only route — but that is not yet known and nothing here assumes it.

---

# CAPTURE-SIDE PRE-REGISTRATION (D1-D4, 2026-08-11) — before any crawl

Binding rule 4 covers **all** inclusion/exclusion criteria for external data, not only which
leagues qualify. The F-filters above register which leagues QUALIFY; nothing registered
which leagues get FETCHED, in what order, how often ADP is captured, or which seasons are
eligible. Those are four degrees of freedom and they were open. Fixed here, before the
first crawl, with no league data examined.

### D1 — DISCOVERY: which leagues enter the candidate pool
- The pool is whatever MFL `leagueSearch` returns for the registered query, **in full**.
- **The query must be format-NEUTRAL.** No search term that selects for our format
  (team count, scoring, "half PPR", "redraft"). Selecting on format at discovery makes
  format-match prevalence unmeasurable and turns the attrition report into a tautology.
- **No pre-screen filtering on anything visible in the search result.** Every returned
  league goes to `screen()`, which is the only place a league may be excluded.

### D2 — CRAWL ORDER AND STOPPING
- **Walk the entire result set. Every page.** A single page of a paginated list is not the
  list (rule 13's second mechanical form).
- **Stop only on exhaustion, never on reaching a matched-count target.** F7's 200 is a
  floor for downstream work, not a stopping rule; stopping when it is hit would make the
  sample a function of the provider's result ORDERING, which is optional stopping wearing
  a target's clothes.
- Provider ordering is **recorded** (the rank at which each league was returned) so any
  order-dependence is measurable after the fact rather than invisible.

### D3 — ADP SNAPSHOT CADENCE
- **Daily**, from 2026-08-11, for every season in progress, **the full board** — no
  top-N truncation and no retention window. *(`draft/data/adp_series.json` is A's HOME
  staleness instrument at `TOP_N=300` / `MAX_DAYS=60`; it is not this and must not be
  substituted for it.)*
- Append-only, deduped by date; a same-day re-run replaces rather than doubles.
- **Why daily does not offend rule 4:** capturing a superset is the opposite of selection.
  The degree of freedom rule 4 governs is WHICH snapshot each league uses, and F5 already
  registers that (latest strictly before the draft). Daily is the maximal-information
  cadence, which is the one choice that cannot be tuned toward a result.

### D4 — SEASONS ELIGIBLE FOR THE FORWARD-CLEAN DESIGN
- **2026 and later: eligible**, on live snapshots taken under D3.
- **2023-2025: NOT eligible** for F5-clean replay. Not a new exclusion — it is **F5 applied
  to a measured fact**: F5 already says a league whose ADP we can only observe after its
  draft is excluded, and finding 3 above establishes that the only retrievable historical
  ADP is a season aggregate containing post-draft drafts.
- Those seasons remain usable for work F5 does not govern — crosswalk coverage, format
  prevalence, draft-duration distributions — **labelled, and never entering a calibration
  table.**
- **This is the largest single source of attrition, as F5 predicted.** It shrinks the
  near-term sample to one season. Per F7 that changes nothing else: the ingest reports the
  number and does not relax a filter to reach a bar.

### REPORTING ADDITION — draft duration and staleness spread (2026-08-11)

**A reporting requirement, NOT a filter.** It admits and excludes nothing; it is recorded
here because F4 requires attrition to be judgeable and this is the number that makes one
of the judgements possible. No new registration version.

> **Every ingest run reports the DRAFT-DURATION DISTRIBUTION** across matched leagues
> (from `first_pick_at` / `last_pick_at`, both already carried in `draft_picks` meta),
> **and the per-league LEAD-DAYS SPREAD** — min, median, max staleness of the frozen
> board across that league's picks, with undated picks counted separately and never
> dated from the league.

*Why it earns its line.* MFL drafts are `draft_kind: email` on a `draftLimitHours` clock
and routinely span days. `draft_at` is the FIRST pick — correct for F5 admission, which
needs a scalar lower bound clean for every pick — but staleness is a per-decision
quantity, and a day-five pick dated from day one understates the board's age by the
whole length of the draft, on exactly the picks where it is oldest. One scalar is right
for one pick and wrong for the rest.

*And it costs nothing.* Both inputs are already parsed. Without it, "how much of the pool
even crosses a date boundary" stays an assumption — and that fraction is a function of
`leagueSearch` ordering, so if slow drafts are over-represented in whatever the provider
returns first, this is not a tail case. Reporting it converts the assumption into a number
at zero marginal cost, which is the only reason it belongs in the pre-registration rather
than in someone's judgement at analysis time.
