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
  `F4.no_scoring_rules` · `F4.no_reception_rule` · `F4.unreadable_reception_points` ·
  `F4.no_team_count` ·
  `F4.unreadable_team_count` · `F4.no_roster_slots` · `F4.no_qb_slot_count` ·
  `F4.unreadable_qb_slot_count` · `F4.unreadable_starting_slots` ·
  `F4.unreadable_starter_limits` · `F4.no_draft_type` · `F4.draft_type_absent` ·
  `F4.draft_type_unrecognised` · `F4.no_draft` · `F4.no_draft_status` ·
  `F4.crosswalk_not_run` · `F4.no_weekly_outcomes` · `F4.no_pre_draft_adp` ·
  `F4.fetch_failed` · `F5.missing_timestamps` ·
  `F4.scoring_untranslatable` · `F4.scoring_range_exceeded` · `F4.no_weekly_data` ·
  `F4.stat_columns_absent` · `F4.no_season_type` · `F4.no_gsis_crosswalk` ·
  `F4.parse_failed` · `F4.draft_not_league_wide`  *(the last six are F3/D5 — see D5 at the foot of this
  document. All four are gaps in OUR vocabulary or OUR fetch, which is why they sit
  here and not above: a league whose scoring uses a term we cannot express is not a
  league that scores differently from ours, it is a league we cannot read.)*

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

### WHAT IT DOES NOT DECIDE — the FFC arm, and a correction to this document

The first write-up of this section said the FFC arm reached nothing because I had
**written its path from memory**. *That was wrong, and it is corrected here rather than
quietly edited.* The path matches the SHIPPED client in `draft/adp.py`
(`/api/v1/adp/{format}?teams=N&year=Y`), which is verified and in production.

The real defect was in the probe: `urlopen` **raises** `HTTPError` on 4xx/5xx, and `_get`
caught it under a bare `except Exception` and filed it as a transport error. So a plain
404 was indistinguishable from a blocked network path, and the run reported "nothing was
reached" — a statement about the network — when it had almost certainly reached FFC and
been answered. **Rule 13's own confusion, committed inside the probe built to enforce
rule 13.** Fixed: an HTTP error is now read as a response, its status and body retained,
and the verdict separates REACHED BUT REFUSED from NO CONCLUSION.

FFC therefore remains **UNRESOLVED** — but for a different and now-diagnosable reason.
**If FFC does serve ADP by date, D4's exclusion of 2023-2025 is too strong and must be
revisited as a new dated registration.** Nothing below assumes it either way.

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

### D1 v2 — THE POOL IS A REGISTERED TERM SET (2026-08-11). D1 v1 RETAINED ABOVE.

**Measured before registering, run 31496719895 (2025), and this is reachability and
SHAPE — counts and league ids, no league content, no outcomes.** Same category as the
schema probe, and the same reason the amendment is legitimate rather than post-hoc: a
count cannot produce a result.

| query | leagues returned |
|---|---|
| `"league"` | 11,056 |
| `"football"` | 5,029 |
| `"the"` | 3,328 |
| `""` (empty) | **0** |
| `"a"` | **0** |
| nonsense term | 0 |

**THERE IS NO ALL-LEAGUES QUERY.** An empty `SEARCH` returns nothing, so the endpoint
will not hand over the universe when asked for it. And `"a"` returning **zero** shows
`SEARCH` is **not a substring match** — a substring search on league names would match
nearly every league — so it is token-based with a minimum term length ("the", three
letters, matches 3,328).

**THE CONSEQUENCE D1 v1 DID NOT COVER.** v1 required the query be FORMAT-neutral, which
stops us selecting on team count or scoring. It does not address this: the pool is a
function of the WORD, no word is the universe, and a name search is *arbitrary*
selection rather than *neutral* selection. So the pool must be defined explicitly:

> **D1 v2.** The candidate pool is the UNION of `leagueSearch` results over a REGISTERED
> SET OF TERMS, fixed here before any crawl. Every returned league goes to `screen()`;
> no pre-screen filtering, exactly as v1.
>
> **The registered terms:** `league`, `football`, `the`, `fantasy`, `ffl`, `dynasty`,
> `redraft`, `keeper`, `friends`, `bowl`.
>
> *`dynasty`, `redraft` and `keeper` are included DELIBERATELY and are NOT a format
> selection.* F1 records keeper structure as a covariate and never filters on it, so
> these terms widen the pool across the keeper axis rather than narrowing it — omitting
> them would bias the pool toward whatever redraft leagues happen to be named.
>
> **Every league's NAME is recorded as a covariate**, alongside which term(s) found it
> and the provider's rank, so any name-correlated bias is measurable after the fact
> rather than invisible.
>
> **The run reports per-term counts and the overlap between terms**, so pool composition
> is a published number rather than an assumption.

**WHAT THIS DOES NOT CLAIM.** The union of ten terms is not the universe and this
registration does not pretend otherwise. It fixes the pool so it cannot be adjusted
after seeing results, and it makes the pool's shape reportable. If the matched count
falls short, F7 already binds: report the number and change nothing.

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

---

## D5 — HOW AN EXTERNAL LEAGUE'S OUTCOMES ARE SCORED (registered 2026-08-11)

**Registered BEFORE any external league had been scored.** No weekly-outcomes ingest
existed when this was written — `ingest_run.run()` pre-declared that every league would
report `F4.no_weekly_outcomes` — so nothing below is a rule chosen after seeing what it
would admit. It implements F3 and F4; it does not amend F1–F7 and does not change any
verdict already recorded.

**D5a — the shipped scorer, under the league's own rules.** Weekly points are computed by
`scoring.score_stat_line` (the engine the tool ships) from stat lines translated by
`grade.nflverse_weekly_to_scoring` (the translation the backtest ships), under a flat
scoring table built per position from the league's own `TYPE=rules` export. MFL event codes
are read from the committed 153-code dictionary in `mfl_schema_probe.json`, never inferred
from the letters. *A second scorer would be the multi-derivation failure rule 11 exists for,
and it would hide perfectly: two scorers agreeing on most players produce a plausible number
for the rest and never error.*

**D5b — the scoreable vocabulary is closed, and a term outside it fails the LEAGUE.** The
translator emits exactly thirteen keys. A rule on a **graded** position (QB/RB/WR/TE) whose
event is outside that set makes the league unscoreable: `F4.scoring_untranslatable`. Rules on
positions we never draft (Def, K, Coach, …) are recorded as **ignored**, not as failures.
*Dropping an untranslatable term is not a floor with a caveat. A league scoring −2 per
interception, scored without it, pays every QB too much; the direction of the error is the
sign of the term. There is no honest caveat to attach, so the league is refused instead.*

**D5c — a rule is a multiplier only if it is the sole rule for its (position, event) pair
and its range starts at 0.** Two rules for one pair is banded scoring; a range starting above
zero is a threshold bonus. Neither is a per-unit rate over a weekly total. *This is
deliberately stricter than `reception_points_by_position`, which flattens bands with `max()`.
That is correct in a FILTER, where the conservative read costs sample; it is not correct in a
SCORER, where it invents points nobody scored.*

**D5d — a range's upper bound is CHECKED AGAINST THE DATA, never assumed.** If any scored
player-week exceeds a rule's `hi`, the league is unscoreable (`F4.scoring_range_exceeded`) and
the exceeding value is named. *MFL's common `0-99` is unbounded for receptions and is not for
receiving yards, and nothing in the rule says which — only the season does. The check converts
an assumption into a measurement, and it fires at the top of the distribution, where the
expensive players are.*

**D5e — absent is dropped and counted; zero is kept.** A drafted player with no weekly rows is
dropped from F3 and counted. A player whose weeks sum to exactly 0.0 is **kept** — he played
and scored nothing, which is an outcome. *The two produce the same total and are one `if`
apart.*

**What this is expected to cost, stated before the first run.** MFL leagues commonly score
terms the shipped translator does not emit — pass attempts, completions, targets, first downs,
big-play bonuses. nflverse weekly carries those columns; `nflverse_weekly_to_scoring` does not
map them, and that file is not this lane's to edit. So a non-trivial share of otherwise
qualifying leagues is expected to fail D5b, and the run reports the failing EVENT CODES with
counts. That report is the evidence for a request to widen the translator — a request with a
number attached rather than a guess.

### D5f / D5g — ADDED 2026-08-11 FROM A MEASUREMENT, same sitting as D5a–e

Both come from running the translation against **real nflverse rows** and looking at
the leaderboard, which is the check D5 built `sanity_top` for. Neither changes an
admission rule; both add a refusal where the pipeline would otherwise have produced a
number quietly biased in a stated direction.

**D5f — a scoring key the DATA cannot serve fails the league** (`F4.stat_columns_absent`).

*Measured, not hypothesised.* `nfl_data_py.import_weekly_data` **404s for 2025**;
`nflreadpy.load_player_stats` serves it (19,421 rows) — with `interceptions` **renamed
to `passing_interceptions`**. `grade.nflverse_weekly_to_scoring` maps the old name, so
under the 2025 loader `pass_int` is never emitted and `score_stat_line` skips it, which
is correct behaviour for an absent optional bonus and exactly wrong for a term the
league scores. Cost, stated: a QB week of 300 yd / 2 TD / 1 INT scores **18.0**
correctly and **20.0** silently — about 2 points per interception, **on QBs only**, so a
systematic bias by position.

The check runs the SHIPPED translator over the fetched rows and takes the union of keys
it emits. That catches three failures with one measurement — a renamed column, an absent
one, and one present but never populated — and it cannot drift from the translator,
because it **is** the translator.

**D5g — a fantasy season is the REGULAR season** (`F4.no_season_type` when undecidable).

Both loaders pool REG and POST in one table (2024: 5,340 + 257; 2025: 18,539 + 882) and
weeks run to 22. Caught by the leaderboard's `weeks` column reading **19–21** for a
season with at most 18. Postseason rows are dropped and counted; a row with no
`season_type` is dropped and counted separately (absent is not REG); data carrying no
`season_type` at all refuses the league, because dropping every row would print empty
series that read as a season in which nobody played.

*Why this was not a rounding error.* Measured on 2024, half-PPR, REG-only vs pooled:
Lamar Jackson 471.54 → **430.38**; Saquon Barkley 432.70 → **338.80** (−22%); Ja'Marr
Chase 339.50 → **339.50** (unchanged). The inflation lands **only on players whose teams
went deep**, i.e. it is correlated with team quality — which is correlated with what a
draft policy is being graded on.

### D5h — A ZERO FROM THE CALENDAR AND A ZERO FROM A BROKEN FETCH (2026-08-11)

*Raised by session A against the F4 pre-declaration, and it named a second sufficient
cause I had not built against.* `screen()` rejects a league with no weekly outcomes, so a
run against a season that has not been played reports **zero matched** — and so does a
run whose fetch broke, and so does a run whose filters are wrong. Three states, one
number, and the target season's own result cannot separate them: measured 2026-08-11,
`fetch_weekly(2026)` returns HTTP 404 from **both** loaders, which is byte-for-byte what
an unreachable season returns.

> **Every ingest run fetches a CONTROL SEASON it does not otherwise need**, and reports
> `UNPLAYED` / `UNFETCHABLE` / `PARTIAL` / `COMPLETE` **ahead of the matched count**. If
> the control serves and the target does not, the fetch works and the season is unplayed.
> If neither serves, the fetch is the story. An `UNPLAYED` or `UNFETCHABLE` run states in
> its verdict that it **measured nothing about the leagues**, so its zero cannot be read
> as evidence about format prevalence or as grounds for tuning a filter.

The season's length is taken from the control's REG week count, not hardcoded: the NFL
went 17 REG weeks → 18 in 2021, and a constant would call a full season partial the year
it changes again.

**The crawl now defaults to 2025, a completed season** (`external-discovery.yml`), for
the same reason: it gives the ingest a real target and separates the causes. **2025
returning `no_weekly_outcomes` after the outcomes ingest lands is a DEFECT; 2026 doing so
is the CALENDAR.**

### F7 REACHABILITY — stated now rather than discovered in December (2026-08-11)

A's stopping-rule point, followed to its conclusion. It is not a filter change; it is what
the registration **already implies**, written down before anyone plans around a number
that cannot arrive.

A **matched league-season** must pass F5, which requires ADP observed **strictly before**
the draft. D4 established that for 2023–2025 the only retrievable ADP is a season
aggregate that accumulates post-draft drafts, so **no league from a completed season can
ever be a matched league-season.** Clean pre-draft ADP begins with D3's daily capture,
i.e. **2026**. And a 2026 league has no outcomes until the 2026 season completes.

Therefore:

- **F7's target of ≥200 matched league-seasons is UNREACHABLE in 2026.** The first
  gradeable matched league-seasons are 2026 drafts scored after the 2026 regular season —
  **January 2027 at the earliest**, and capped by how many 2026 leagues the D3 archive
  actually covered.
- **2024/2025 are not wasted, and are not evidence.** They can carry format prevalence,
  crosswalk coverage, draft-duration and lead-days distributions, and the D5 scoring-
  vocabulary census — everything that exercises the pipeline non-vacuously. Under F5's
  "simulation is labelled" clause a 2025 replay is **robustness testing, labelled, and
  never enters a calibration table.**
- Per F7 this **changes nothing else**. The bar is not lowered to make it reachable, and
  no filter is relaxed to convert a completed season into a matched one. The honest
  statement is that the pooled layer this ingest exists to unblock is a **2027** result,
  and everything before then is pipeline work plus a census.

### D6 — WHICH LEAGUES OF THE POOL GET FETCHED (registered 2026-08-11)

The 2025 crawl returned **21,323 unique leagues** across the ten D1 v2 terms, all ten
fetched, none failed (overlap factor 1.58; 9,152 found by more than one term). Three
exports per league is roughly **64,000 requests**, so every ingest run works from a
sample — and how that sample is chosen is a degree of freedom exactly like a filter.

> **Order the pool by `sha256("external-ingest-v1" + "|" + league_id)` and take the
> first `n`.**

Three properties, each ruling out a way the sample could flatter a result:

- **Reproducible.** Same pool and `n` give the same leagues. A random draw would let a
  disappointing attrition rate be re-rolled until it improved — optional stopping with
  extra steps.
- **Order-blind.** `leagueSearch` returns leagues in an order we did not choose and do
  not understand. Provider rank is already kept per league as a **covariate**
  (`found_by[].rank`) so order-correlation can be measured — which only works if the
  sample is not itself built from that order. "The first `n`" would destroy exactly that.
- **Nested.** The first 200 are the first 500's prefix. A larger `n` **adds** leagues
  rather than replacing them, so an earlier run's result stays a subset of a later one
  and the two are comparable. A fresh draw at each size is not.

The salt is fixed and **versioned**: changing it is a new sample and a new registration,
never a quiet reshuffle after seeing what the first one gave. Every run reports the pool
size, the sampled count and the share, and states that its counts are **over the sample**
and that scaling them to the pool assumes a representativeness this run does not test.

### D5f RESOLVED (2026-08-11) — and the correction is measurable, not asserted

A mapped `passing_interceptions` in `grade._WEEKLY_MAP` and split the accumulator: aliases
now use first-writer-wins (`put`), components still sum (`add`), so a row carrying **both**
column names scores one interception rather than two. Verified from this side against real
data rather than taken on trust:

| check | result |
|---|---|
| `{"interceptions": 1}` | `pass_int = 1` |
| `{"passing_interceptions": 1}` | `pass_int = 1` |
| **both names on one row** | `pass_int = 1` — not 2 |
| three fumble-lost columns | `fum_lost = 3` — components still sum |
| 2025 keys the translator cannot emit | **none** (was `pass_int`) |
| 2024 keys the translator cannot emit | none, unchanged |

**The size and shape of what was being lost, from the leaderboard rather than from a unit
test.** 2025 half-PPR season totals, before → after:

| player | before | after | delta |
|---|---|---|---|
| Trevor Lawrence (QB) | 362.18 | 338.18 | **−24.00** = 12 INT × 2 |
| Josh Allen (QB) | 384.62 | 364.62 | **−20.00** = 10 INT × 2 |
| Drake Maye (QB) | 367.46 | 351.46 | **−16.00** = 8 INT × 2 |
| Matthew Stafford (QB) | 366.38 | 350.38 | **−16.00** = 8 INT × 2 |
| Christian McCaffrey (RB) | 365.60 | 365.60 | **0.00** |
| Jonathan Taylor (RB) | 339.30 | 339.30 | **0.00** |

Every delta is exactly −2 × a whole number of interceptions, and exactly zero at RB. That
is the cross-path agreement rule 11 asks for: the correction's magnitude was predicted from
the scoring rule and confirmed by a source (the season leaderboard) independent of the
regression test that fixed it.

**And it changed the ordering.** McCaffrey was 4th in the 2025 half-PPR top six and is now
1st, ahead of three QBs. The bias was systematic *by position*, so it did not merely inflate
totals — it distorted **cross-positional** comparison, which is precisely the comparison a
draft policy makes. 2024 is byte-identical before and after, which is what a correct
alias-only change must be where the alias never appears.

### D5c v2 / D5d v2 — THE BAND MUST CONTAIN THE DATA (2026-08-11). v1 RETAINED ABOVE.

**Amended after the first real run, and the reason it is not post-hoc filtering is that
v1's mechanism did not implement v1's own stated purpose.** Recorded in full because a
rule changed after seeing data is exactly what rule 4 exists to police.

**What the run measured.** 57 of 57 sampled 2025 leagues came back unscoreable, with the
costliest codes `CY` (51), `PY` (50), `RY` (50) — receiving, passing and rushing yards,
all of which this module MAPS. The raw expressions, which the census now keeps:

| reason | measured expressions |
|---|---|
| `unreadable_range` | `-100-999`, `-50-999` on PY / RY / CY |
| `threshold` | `lo = 1.0` on IN, CC, CY, RY, #P, #R, #C, C2, P2, R2, FL, FLO |
| `banded` | 2–21 rules for one (position, event) on PY / CY / RY |

**Two defects, one amendment.**

1. **A BUG, not a rule change.** `_range` split on `-`, so a negative lower bound produced
   an empty field and read as unreadable. MFL writes `-100-999` for stats that can go
   negative. Rushing yards "untranslatable in 33 of 36 leagues" was never a fact about
   leagues; it was a fact about that function. Fixed by pattern-matching so a leading minus
   is a sign.

2. **THE AMENDMENT.** v1 rejected any band not starting at 0 as a threshold bonus. Real
   leagues write `1-999` for counts. On a **multiplicative** rule that is not a threshold:
   a player with 0 receptions scores 0 whether the rule fires or not, because *p* × 0 = 0.
   v1 rejected 11 leagues for bands **exactly equivalent** to unbounded ones.

> **v2:** a multiplicative rule over band `[lo, hi]` is accepted, and the property that
> matters is **checked against the data**: every scored player-week value must be inside
> the band **or be zero**. A non-zero value outside it means the rule did not cover that
> week, and the league is refused with the value named.

This **subsumes** v1's threshold clause and D5d's upper-bound check into one measurement,
and it is not a loosening toward an assumption: it still refuses `-100-999` if a week ever
went lower, and still refuses `1-999` on rushing yards the moment a −3 yard week appears.
*Direction of the change, stated: v2 admits strictly more leagues than v1. Every league it
admits has had its bands verified against its own season.*

3. **Also fixed, and it is a scorer/filter distinction v1 missed.** `_points_per_event`
   strips both `*` and `=` because the F1 **filter** only needs the number. A **scorer**
   cannot: `*0.5` is half a point per unit, `=3` is a flat three points. Using the second
   as a rate would pay 3 points per reception. `external_outcomes` now refuses anything
   that is not `*`.

**And a rule-12 correction to the report itself.** The census verdict named the costliest
codes and asserted each was "a term nflverse weekly carries and the translator does not
emit". For CY/PY/RY that was **false** — the run's own data contradicted its own summary
sentence. The cross-lane request is now made **only** for `event_untranslatable`; parse and
shape failures are reported as evidence about this pipeline, which is what they are.

**Position blocks, measured rather than assumed.** MFL writes combined blocks:
`QB|RB|WR|TE|PK` appears 30 times, second only to `Def` (43). So kicker events (`EP`, `FG`)
and return events (`#KT`, `#UT`) genuinely do land on graded positions. **Not yet decided,
and deliberately not decided from a guess** — whether a term a quarterback can never accrue
should be ignored for that position needs the same treatment everything else here got: a
measurement first.

---

# D7 — WITHIN-POOL ADP (registered 2026-08-11, BEFORE any measurement of what it yields)

**Registered before measuring, deliberately.** The whole legitimacy of this route depends on
the construction being fixed before anyone knows whether it produces a usable sample. If the
measurement below comes back thin, that is the answer, and no clause here moves to rescue it.

## The construction

For a decision at time **T** in league **L**, the board is the ADP computed from picks that
satisfy **all** of:

1. **The pick's OWN timestamp is strictly before T.** Not "the draft completed before T" —
   per-pick. *This is the sharp edge and the naive framing gets it wrong:* MFL drafts are
   email drafts spanning days, so a draft that STARTED before T can contain picks made after
   it. Using completed drafts would import future picks under a label that says otherwise.
2. **The league is not L.** Structural, not conventional. A league's own picks never enter the
   board it is graded against — the same leak already caught in the replay when the actual
   pick was popped off the decision context.
3. **The league passes F1.** Format match, because dynasty and superflex ADP are different
   quantities, not noisier versions of the same one — a dynasty board prices a 22-year-old
   rookie where a redraft board prices a 29-year-old producer. The crawl measured `dynasty`
   at 5,642 term hits, so this is not a tail concern.

ADP for a player is the **mean overall pick number** over qualifying picks, carried with its
support **n**. **A player below n = 10 has NO ADP** — he is ABSENT, not "went late". Absent is
not zero here either, and the sensitivity of every result to n ∈ {5, 10, 25, 50} is reported
beside the primary. **n = 10 is fixed now**, before seeing which value flatters anything.

Every board built this way is labelled `adp_source: "within_pool_v1"` and a league admitted
under D7 is **reported separately** from one admitted on a provider snapshot. The two never
pool silently.

## Is it admissible under F5 as registered? — THE ARGUMENT AGAINST, FIRST

1. **F5 says "the latest SNAPSHOT strictly before the draft date".** A snapshot is a third
   party's published observation. A within-pool board is **our own construction**, and
   constructions have knobs — population, support threshold, averaging rule — that a published
   board does not. That is exactly the degree of freedom F5 exists to remove, and admitting a
   construction reopens it.
2. **The board is derived from the population being graded.** "Beat the pool's ADP" may be
   nearer to "beat your opponents' average" than to "beat the market" — a *different claim*
   from the one this program set out to make.
3. **Early drafters may differ systematically.** Then the board is not "the market before T"
   but "the early drafters before T", and that difference is invisible in the number.
4. **It thins from the wrong end.** The earliest drafts have almost no prior picks, so the
   gradeable leagues are the LATE ones — the drafts closest to the season, which are the least
   like a July decision.

## THE ARGUMENT FOR

1. **F5's purpose is that no post-decision information enters, and this satisfies it more
   strictly than a provider snapshot does.** Measured, and this is the load-bearing point: the
   MFL and FFC year aggregates **accumulate** (2025 complete = 844 drafts vs 2026 in progress
   = 112), and we cannot decompose them — a provider "snapshot" is dated to a day and its
   internal composition is unobservable. A per-pick construction is verifiable pick by pick.
   **The provider route is the one with the unverifiable contamination.**
2. **Objection 1 is answered by this document.** A construction fixed and published before any
   measurement has no more freedom than a provider's board. That is what pre-registration is,
   and it is why this is being written now rather than after the numbers.
3. **Objection 2 is a labelling problem, not an admissibility one.** The quantity is
   "format-matched public-room ADP, observed before T". It is a defect only if someone calls
   it "the market", which the label exists to prevent.
4. **Objection 3 is a covariate, not a stopper** — draft date, board size and format mix are
   recorded per league, so early-vs-late is measurable rather than assumed.
5. **Objection 4 is real and is a REPORTED LIMIT**, not a defence: the gradeable slice is
   named, and if it is small or late-skewed, that is the finding.

**DECISION: D7 is an ADDITION to F5's admissible ADP sources, not an amendment to F5's rule.**
F5's requirement — the board must be observably frozen before the decision — is met exactly.
F5 v1 is retained unchanged; what changes is that "snapshot" is no longer read as "a provider
published one". A league admitted under D7 carries the label and is reported apart.

## What will be measured, declared before it runs

- **M1** the distribution of draft dates across the 2025 pool — are drafts spread at all?
- **M2** per league, how many qualifying picks exist strictly before its first pick.
- **M3** how many leagues get a board of ≥100 players at n ≥ 10.
- **M4** the early-vs-late covariate: does the format mix of early drafters differ from late?

**PRE-DECLARED EXPECTATION, so the result cannot be narrated afterwards.** I expect MFL public
drafts to cluster heavily in the last two weeks of August. I therefore expect the early slice
to be sparse, a minority of leagues to reach a usable board, and the usable ones to be
**late-August drafts** — the least representative of a genuine preseason decision. If that is
what comes back, D7 does not rescue the 2027 timeline and I will say so.

## D7'S CEILING IS ALREADY MEASURED — a bound, not an estimate (2026-08-11)

Stated **before** the format-matched measurement runs, because it does not need that run
and because a result declared afterwards is a narration.

Run 9's D7 numbers came in two flavours: a **format-matched** population (F1-passing
leagues only, the admissible construction) and a **whole-pool** population that was
computed and labelled INADMISSIBLE — every league regardless of format, dynasty and
superflex included, which is a different quantity from the one being priced.

The format-matched population's picks are a **subset** of the whole-pool population's
picks: F1-passing is a filter, and a filter removes picks or leaves them. So for every
league and every player, support under format-matching is **≤** support under the whole
pool; the board at `min_support=10` can only be smaller; and the count of leagues reaching
a 100-player board can only be lower. That is arithmetic on a subset relation, not a
forecast.

**Therefore the inadmissible measurement is an UPPER BOUND on the admissible one.** Run 9's
whole-pool result was **13 of 62 dated leagues reaching a 100-player board, every usable one
in the later half of the calendar**. So the admissible D7 tops out at 13 of 62 — 21% — and
lands below it, on the leagues that drafted latest.

That was the pre-declared failure shape above, arrived at from the bound rather than from
the number. **D7 does not rescue the 2027 timeline.** Run 11 measures the admissible figure
because a bound stated is not a bound checked, and because the bound predicts a *specific*
relationship the run can contradict: format-matched usable ≤ 13, and never a league that
whole-pool could not serve. If run 11 returns a format-matched league count ABOVE the
whole-pool one, the subset relation is false and D7's implementation is wrong, not its
ceiling.

### PRE-REGISTRATION FOR RUN 11 — three predictions, before the run reports (2026-08-11)

Run 10 was cancelled five minutes in and re-dispatched as run 11 with the conflict split
added, rather than spending two 25-minute cycles to answer three questions.

- **The `a/b` fix.** Every `unreadable_points` sample run 9 printed was a yardage rate —
  `1/25`, `1/10`, `.1/1`, `0.04/1` on PY/RY/CY. I expect leagues blocked on
  `unreadable_points` for those three terms to fall to **near zero**. If the count holds
  steady, either the fix did not fire or there is a second unregistered shape, and the
  samples will name it — the same way they named this one.
- **D7 format-matched.** Non-vacuous this time, bounded above as proved directly above. I
  expect **fewer than 13 of 62** usable leagues and expect them to be the late drafters.
- **The conflicts.** I expect the **majority to be team-only**: MFL's team field reflects
  their snapshot date and ours reflects ours, and every hand-check pair run 9 printed was
  position-perfect. I expect any large position pair to be a **vocabulary** mismatch of the
  `PK -> K` kind — our own comparison, not a wrong player. **If instead position
  disagreements dominate and their value pairs are SCATTERED, the crosswalk has a real
  wrong-match problem and the 85.5% pooled rate is overstated** — a bad match counts as a
  success in that figure. That is the outcome that would make me stop and fix matching
  before any of this is used.

### P5 — `draftUnit` IS SOMETIMES A LIST (found 2026-08-11, at 250-league scale)

The fifth "would have produced a confidently wrong parser", except this one did not
produce a wrong answer — it produced an exception, 18 minutes into a 250-league run, and
**took the other 249 leagues with it**. No report, no attrition table, nothing learned
from any of them.

`mfl_adapter`'s own docstring says MFL returns a bare dict for one element and a list for
many, and names players, `leagueSearch` and `positionRules[].rule`. **`draftUnit` belongs
on that list and was not on it** — `listify` was applied to `draftPick` *inside* the unit
and not to the unit itself. Sixty leagues never hit it; 250 did.

**What a multi-unit export means, and why the units are not merged.** A league with
several draft units ran divisional or per-conference drafts, **each with its own pick
numbering**. Concatenating them would manufacture an "overall pick number" that no drafter
ever saw, and every ADP and survival quantity in this program is a function of that number.
So the **LEAGUE** unit is taken when present; an export with several units and none
league-wide is refused by name (`F4.draft_not_league_wide`) rather than merged. The unit
count is kept as a covariate — it is a real fact about that league's setup.

### AND THE STRUCTURAL FIX, which matters more than the parse

> **A league we could not PARSE is that league's attrition reason, never the run's death.**

`build_record` now catches per-league conversion failures and returns
`F4.parse_failed:<ExceptionType>`, retaining the type and message so the defect stays
diagnosable instead of becoming an anonymous drop. This is the attrition seam at the
outermost layer — the same principle as `F4.fetch_failed`, one level further out. The
previous behaviour meant a single malformed league could delete an entire run's evidence,
which is the most expensive way for a sample to become invisible.

## F4 — DATED INTERPRETATION, NOT AN AMENDMENT (Cory, 2026-08-11)

**F4's text does not change.** It reads, and continues to read: *"A league missing any of
{complete draft, pre-draft ADP, weekly outcomes} is excluded whole. No partial-credit
leagues."* What follows is a RULING ON WHAT IT GATES, recorded with its reasoning so a
future reader who thinks the interpretation is wrong can see exactly what was decided and
why — rather than finding a filter that quietly says something different from what was
registered.

**THE RULING.** F4 excludes a league missing weekly outcomes *because there is nothing to
grade against*. The survival pass does not grade against outcomes: it resolves from the
draft's own later picks, which have already happened. A 2026 league can therefore produce
a survival forecast AND its resolution with no outcome data existing anywhere, and F4
blocking that is the filter blocking work it was not written to block.

> **Replay and forecast emission proceed on any league passing the other filters. Only the
> outcome-graded portion waits for January.**

**THE TWO CONDITIONS, and they are part of the ruling rather than commentary.**

1. **This is an interpretation, dated, with reasoning — not an amendment.** F4 v1 stands
   verbatim. Nothing about the outcome-graded path changes.
2. **A survival-only league is LABELLED and NEVER POOLED with an outcome-graded one.** A
   league contributing only a survival observation is a different kind of evidence, and
   summing them hides that. `survival_pass` carries `outcome_graded: false` on every
   observation from a league that has no weekly outcomes, and the report keeps the two
   populations apart with their own counts.

**Why this is not the rescoring that was ruled out in the same message.** Rescoring another
league's outcomes under our rules produces a room where the picks and the payoff table
disagree — the drafters were correct for THEIR scoring, and grading them against ours
measures a room nobody played in. Survival changes nothing about anyone's scoring. It asks
whether a player was still on the board, which is a fact about the draft that is true
regardless of what points anyone scores.

## POINTING THE MACHINERY AT 2026 — the one season that works (2026-08-11)

2026 is the only season for which F5 can be satisfied without an archive or a
construction: D3 is capturing ADP cleanly right now, one dated snapshot a day. Outcomes
arrive in January. So everything except the outcome join can be built and MEASURED now,
and three things are added for it.

**OUTCOME-READY** — every run reports how many leagues clear every check that can be
judged before the season is played. It is only a meaningful number because `screen()` now
checks weekly outcomes LAST: before, an unplayed season failed every league there and
nothing after it was ever evaluated, so a 2026 attrition table would have said "no weekly
outcomes" seven hundred times and nothing about format, draft validity or ADP cleanliness.
The verdict is unchanged wherever it fires — an ordering change, not a relaxation. For a
played season `outcome_ready` equals `matched`, and a test asserts it.

**FORMAT CENSUS** — what the pool IS, over readable leagues: team counts, reception
bands, superflex, draft type, keepers, with F1 printed beside it. F1 is unchanged and this
is not a filter. "0 matched" with no distribution beside it invites exactly the post-hoc
relaxation rule 4 exists to stop, because the only way to learn anything from it is to
start loosening clauses and watching the count. Split/TE-premium is its own bucket and is
never averaged into a league that does not exist.

**SURVIVAL, GRADED WITH NO OUTCOME DATA** — every matched league is now replayed and its
survival forecasts graded inside the run. Survival resolves from the draft's OWN LATER
PICKS, so it needs no weekly data, no nflverse and no January: the moment a 2026 league
drafts with clean dated ADP, the pipeline produces a real graded observation of the same
forecast type the home league emits.

That last one closed a **produced-and-unread gap two modules wide**. `replay_league`
emitted forecasts, `survival_grade.grade` scored them, both were tested — and nothing
called either. The spine fetched leagues, screened them, and stopped. Rule 14 usually
catches a field with no reader; this was two whole modules.

A league the SCREEN admits and the REPLAY refuses is reported as a **contradiction**
rather than a skip, because two components disagreeing about whether the same league
qualifies means one of them is wrong.

## A STANDARD LEAGUE IS A READING, NOT A FAILURE TO READ (found 2026-08-11)

**And it moves the denominator the F7 rule below is computed over**, which is why it is
recorded above that rule rather than after it.

`reception_points_by_position` returned `no_reception_rule` for two different worlds:

- **the rules parsed and award nothing per catch** — a STANDARD-scoring league. Readable.
  Fails F1 on the band. Evidence about the pool.
- **we could not read this league's scoring at all** — evidence about this pipeline.

`screen()` files the second as UNREADABLE, so both were leaving the readable population.
Run 11's `F4.no_reception_rule: 6` were being booked as our gaps when standard scoring is
the single most common competing format in public leagues — precisely the leagues an
honest F1-rarity measurement most needs to count.

**Absent is still not zero, and this does not break it.** The zero is returned only for
positions the league writes rules for. Rules present for RB and none of them scoring
receptions means receptions are worth 0 to an RB **here** — measured. A position the
league writes no rule for stays absent, because about that one we know nothing. The split
is now four-way, and each fact gets its own reason:

| what happened | reason | about |
|---|---|---|
| rules present, CC found | `ok` | the league |
| rules present for skill positions, no CC | `ok`, value **0.0** → `F1.scoring_not_half_ppr` | the league |
| CC present, points expression unreadable | `F4.unreadable_reception_points` | **us** |
| no rules for any skill position | `F4.no_reception_rule` | us |

A fifth case falls out for free and is sharper than what came before: a league writing
rules for **some** skill positions returns `F4.no_scoring_rules:RB,TE`, naming the
positions we lack instead of blaming the reception rule.

**Consequence for the F7 arithmetic.** Run 11's readable count of 113 was too low by up to
6. The rule below is stated over *readable leagues*, so it is unaffected in form — but the
next run's denominator will be larger for the same crawl, which brings the decision closer,
not further away. The bound was conservative in the wrong direction.

## WHAT F7's ANSWER LEAVES — the nflverse half is now the main route (2026-08-11)

F7 closes the MFL-league route to 200 matched league-seasons. It does not close the
external programme, and the distinction matters because the two halves were always
separable:

- **THE LEAGUE HALF** — other people's drafts, replayed and graded. Needs format-matched
  leagues. **F7 says the 2025 MFL pool cannot supply 200 of them.**
- **THE NFLVERSE HALF** — player-evaluation questions that are largely
  format-independent: age cliffs, regression, injury and availability base rates. **These
  need no MFL leagues at all**, and nothing measured today constrains them.

Rescoring another league's outcomes under our rules to widen the first half is **ruled
out** (Cory, 2026-08-11): the drafts happened under THEIR scoring, so their picks were
correct for their rules, and rescoring the outcomes while keeping the draft produces a
room where the picks and the payoff table disagree. A small sample is uncertain; a
rescored one is confidently measuring the wrong thing. Any specific question wanting the
wider pool is proposed individually with the format-independence argument stated.

### THE NFLVERSE SURFACE, MEASURED RATHER THAN ASSUMED (2026-08-11)

Probed directly, because "we can answer age questions from nflverse" is exactly the kind
of assumption this program has been punished for:

- `import_weekly_data` carries `position`, `season`, `week`, `player_id`,
  `player_display_name` — 5,597 rows and 612 distinct players for 2024.
- **IT DOES NOT CARRY `age`.** A consumer written against a weekly row expecting age gets
  nothing, silently, and every age-cliff finding computed from it would be about players
  whose age defaulted — the same defect class this lane has hit eight times.
- `import_seasonal_rosters` DOES: `age`, `birth_date`, `entry_year`, `years_exp`,
  `draft_number`, `position` — 3,215 rows for 2024.

**So an age question requires the weekly ⋈ seasonal-roster join on (player_id, season),
and that join is a boundary with a coverage figure, not a lookup.** Recorded here before
anyone builds on it.

## F7 ANSWERED — THE 200-LEAGUE TARGET IS NOT REACHABLE FROM MFL's 2025 POOL (2026-08-11)

**Run 12. The rule below was registered before this run and it fires.**

```
394 leagues attempted        (700 requested; 306 never reached inside the 5,400s budget)
  9 failed to fetch          all nine HTTP 429 — our request rate, not nine unobtainable leagues
 74 unreadable in total      parse or fetch
  0 MATCHED
```

| reading of "formats read" | n | 95% upper bound | vs F7's required 0.9380% |
|---|---|---|---|
| attempted − fetch failures (run 11's definition) | 385 | **0.7792%** | ruled out with room |
| attempted − all unreadable (stricter) | 320 | **0.9375%** | ruled out by 0.0005 pp |

**Both readings clear the pre-registered bar, and the stricter one clears it by the
narrowest margin arithmetic allows** — 320 readable was exactly the threshold registered,
and 3/320 = 0.9375% sits five ten-thousandths of a percentage point under the 0.9380% the
target needs. That is stated rather than rounded away: the conclusion is robust because
BOTH readings agree, not because the tight one is comfortable.

> **F7's target of 200 matched league-seasons is not reachable from MFL's 2025 public pool
> at 95% confidence. Per F7, this program reports the number and changes nothing.** No
> filter is relaxed, no clause widened, no pooling attempted. That commitment was made
> before the measurement existed and the measurement has now arrived.

**The binding constraint, from the same run.** `F1.scoring_not_half_ppr` rejects 150 and
`F1.teams` rejects 122 — and by `screen()`'s ordering those 150 had already passed the
team check. Half-PPR is the scarce property. TE-premium and split-PPR variants account for
a further 24 across sixteen distinct scoring shapes, which is its own finding: public MFL
scoring is not one alternative format but a long tail of them.

**What this does NOT say.** Nothing here is about 2026, whose pool has not been crawled;
nothing is about other platforms; and nothing is about whether a smaller matched sample is
useful — F7 sets 200 as the bar for *pooling and shadow-field expansion*, not as the
threshold below which external data is worthless.

## F7 DECISION RULE, REGISTERED BEFORE THE RUN THAT TESTS IT (2026-08-11)

Run 11 gave 0 matched of 113 readable leagues. Zero successes does not mean a zero rate,
so the question is what sample size would actually DECIDE it, and that is arithmetic
available now — before the run, which is the only time it can be stated honestly.

By the rule of three, k successes of 0 in n trials puts the 95% upper bound at 3/n. F7's
target of 200 matched league-seasons from a 21,323-league pool needs a rate of at least
200/21,323 = **0.938%**. So:

```
  0 of 113  ->  upper bound 2.65%   target still inside   (run 11, where we are)
  0 of 200  ->  upper bound 1.50%   target still inside
  0 of 300  ->  upper bound 1.00%   target still inside
  0 of 320  ->  upper bound 0.938%  TARGET RULED OUT at 95%
  0 of 400  ->  upper bound 0.750%  ruled out with room
```

**THE REGISTERED RULE.** If the next run reads **320 or more leagues' formats and none
passes F1**, F7's target is not reachable from MFL's 2025 public pool at 95% confidence,
and this program says so rather than lowering the bar — which is what F7 already commits
to. If **any** league passes, the run yields a rate estimate instead and the question
becomes how large a crawl the target needs, not whether it is possible.

Either outcome is informative, which is the point of choosing n before looking.

**What it costs.** Run 11 measured **12.6 s per league** with adaptive backoff already
absorbing MFL's 429s. 400 leagues is ~84 minutes of fetching, so the job timeout goes from
60 to 150 minutes and the fetch budget to 5,400s. That is ~1,200 requests over 90 minutes
— 0.24/s, gentler than the run that produced the 429s, because the pacing is adaptive and
the budget is what grew.

**What would make this run NOT decisive, declared now.** If it reads fewer than 320
formats — deadline, 429 storm, crawl shortfall — then the interval does not close and the
answer is "still inside", not "ruled out". `never_attempted` and the readable count are
already reported for exactly this reason, and the verdict must be read off them rather
than off the matched count.

## ROUTE 1 IS OPEN — AND IT PASSED THE KNOWN-ANSWER GATE (2026-08-11)

**This supersedes both entries below.** The first reported OPEN on a byte count and was
withdrawn; the second recorded the withdrawal. This one is the gate passing.

**FantasyPros overall ADP, Wayback capture `20240712092948`** — 12 July 2024, strictly
before the 20240801 cutoff and before any 2024 draft. The names extracted from it:

```
Christian McCaffrey · CeeDee Lamb · Tyreek Hill · Ja'Marr Chase · Breece Hall
Justin Jefferson · Bijan Robinson · Amon-Ra St. Brown · A.J. Brown · Puka Nacua
Jonathan Taylor · Saquon Barkley · Garrett Wilson · Jahmyr Gibbs · Davante Adams
```

**15 of 15 are players on our own board, and that is the 2024 consensus top fifteen in
roughly the order it actually went.** Not a shape count, not a byte count — the check the
verdict line has been demanding since the first run.

**WHY THE ARCHIVE WORKS WHERE THE LIVE PAGE DOES NOT, which is the whole point.**
FantasyPros' pages TODAY render their table client-side: the live fetch scores 5 of 21
names and carries no board, and the captures of those same URLs from late 2023 were
navigation menus. The July 2024 capture is **server-rendered**. The markup changed. So the
board that existed in 2024 is retrievable ONLY from the archive, which is exactly the
situation Route 1 was posed for — and exactly why "the live page has no board" was never
evidence that no board was ever published.

**WHAT IS ESTABLISHED, PRECISELY.** A dated preseason board of real NFL players exists for
a completed season, with its date stamped by a third party. F5 can be satisfied for 2024
without any provider supporting a date parameter.

**WHAT IS NOT.** This capture is FantasyPros' OVERALL board, not half-PPR — a different
quantity from the one F1 wants, and the half-PPR URL's captures remain unresolved. One
capture is not a series either: replaying a draft wants the latest snapshot before THAT
draft, so per-league coverage is a further question. And Route 1 opening does not touch
F7: clean dated ADP for leagues that do not match our format still grades nothing.

**A DEFECT IN THE REPORT, NOT THE FINDING.** The hand-check block printed
`MATCHED PLAYERS (None)` and an empty RAW SAMPLE beside the fifteen correct names —
`classify` builds its row from a fixed key list and `player_hits`/`sample_seen` were not on
it. The evidence was right and its own header said it was missing. Carried through now.

## CORRECTION — ROUTE 1 IS NOT OPEN. THE "BOARDS" WERE A NAVIGATION MENU (2026-08-11)

**This supersedes the entry below, which is retained unedited because a result reported
and then withdrawn is part of the record.** The entry below was written from a byte count
and a shape count. Both were wrong about the same thing.

`looks_like_a_board` counted capitalised pairs in table cells and anchors, and **a
content-heavy site's navigation menu clears any such threshold on its own.** Two
FantasyPros captures scored as boards at 422KB and 480KB. The hand-check sample — added
in the same sitting, and the only reason this was caught — read:

```
Draft Wizard, NFL Draft Contest, View Contest, Game Day, My Account, My Leagues,
Mobile Apps, FantasyPros Championship, Discord Chat, Sign Out, NFL Home,
Waiver Central, Waiver Assistant, Free Agent Finder, Trade Analyzer
```

**Zero of fifteen are players.** Checked against our own board: 0 of 15 names appear in
the 1,760 we hold. The pages were the site's chrome. Byte count was never evidence — 422KB
of menu is still menu — and the live FantasyPros pages scoring `not-a-board` at ~301KB was
the two halves AGREEING, not a discrepancy: FantasyPros renders its ADP table client-side,
so neither the live HTML nor the capture contains a player table.

**What is actually established as of now:**
- archive.org is reachable from CI (`status 200`); the sandbox 403 was the proxy.
- The CDX enumeration works, returns real dated captures, and the strictly-before test
  holds.
- **No archived board of NFL players has been found.** Route 1 is neither open nor closed:
  the sources probed so far either render client-side (FantasyPros), are query-string URLs
  the archive does not hold (FFC's API), or were unreached.

**The test is now a KNOWN-ANSWER test and shape-counting is gone from the gate.** A page
is a board only if the names on it are players we already hold, read from
`public/draft_data.json` — the same file the crosswalk reads, not a hand-written list that
would drift. Ten player hits out of forty names is a bar furniture cannot reach and a real
board clears easily. The capture walk takes the judge as an argument so it cannot be gated
on shape by accident: gated on shape, it stopped on the first menu it found and returned it.

**The lesson is the one this program keeps relearning, now at its own expense.** Rule 11
says verify the MATCHES, not the rate; rule 12 says the output must be sane. A count of
things-that-look-like-rows is a completeness figure, and completeness says nothing about
validity. The verdict line had been saying so all along — "a page that parses is not a
page that is right" — while the code decided on a count.

## ROUTE 1 IS OPEN — the archive holds dated preseason boards (measured 2026-08-11)

Probed from CI, where egress reaches archive.org (`status 200`); the sandbox's blanket
`Tunnel connection failed: 403` was the proxy, as claimed.

**The hit that matters.** FantasyPros' PPR overall page, capture **`20240731003145`** —
one day before the cutoff, squarely preseason 2024, 422KB serving a board. A Wayback
capture is a **third party recording when it saw the content**, so the date is evidence
rather than a label. That is what F5 asks for, and no provider had to support a date
parameter to supply it.

**Two of the three hits are the wrong dates, and the count must not be read as three:**

| target | capture | what it is |
|---|---|---|
| FFC half-PPR page | 2023-07-06 | preseason — of **2023** |
| FP half-PPR page | 2023-12-09 | **mid-season**; not a preseason board at all |
| FP PPR page | **2024-07-31** | the date this route needs |

So **the mechanism is proved and the coverage is not.** The one usable capture is PPR
where F1 wants half-PPR, and the half-PPR page's newest pre-cutoff capture being December
is currently unexplained — most likely our own `filter=statuscode:200` hiding a
redirected path, which the probe now re-asks without.

### WHAT AN OPEN ROUTE 1 DOES NOT DO — stated here so it is not overread later

Route 1 answers the **ADP** blocker. It does not answer the **sample** blocker, and a
matched league-season needs both.

- **Solved, if the boards verify:** a dated pre-draft board for a completed season, which
  is what `adp_series.json` starting 2026-08-09 could not give and what F5 forbids
  substituting a live board for.
- **Untouched:** run 11 measured **0 of 113 readable MFL leagues passing F1**, 95% upper
  bound **2.65%** on the match rate against F7's required **0.938%**. Clean ADP for a
  league that does not exist in our format grades nothing.

**The 2027 timeline therefore does not collapse on this result.** One of its two supports
is removed; the other was measured today and still stands. Saying otherwise would be
exactly the overread this document exists to prevent.

### AND IT IS NOT YET A USABLE BOARD

`looks_like_a_board` counts SHAPES. It cannot tell a board of 2024 NFL players from any
page with 200 capitalised pairs on it, and there is a specific reason to doubt: the LIVE
FantasyPros pages scored `not-a-board` at ~301KB while their ARCHIVED captures scored
`board` at ~422KB — same site, same path. Either the live site renders client-side now, or
the detector is counting furniture. Nothing may be graded against these captures until the
top of each board is read and checked against the players who actually went early.

### RUN 11 — ZERO OF 113 READABLE LEAGUES MATCH OUR FORMAT (measured 2026-08-11)

The single most consequential number this program has produced, and it is about **F7's
target**, not about any of the machinery. Stated with its arithmetic because it decides
whether the 200-league bar is reachable at all.

**The funnel, and it accounts for every league.** 119 attempted (the 1,500s deadline
stopped the run at 119 of 250 requested; the other 131 are `never_attempted`, so the
denominator below is 119 and not 250):

```
F1 failures                                       94
  F1.scoring_not_half_ppr        43
  F1.teams                       41
  F1.te_premium_or_split_ppr      6
  F1.qb_slots                     2
  F1.starting_skill_slots         2
format-UNREADABLE F4                              19
  no_scoring_rules 7 · no_reception_rule 6 · draft_type_unrecognised 4 ·
  draft_type_absent 1 · no_qb_slot_count 1
fetch failures (all HTTP 429)                      6
                                                 ---
                                                 119
```

**113 leagues whose format we could READ. Zero passed F1. Zero matched league-seasons.**

**What that does and does not establish.** Zero successes does not mean the rate is zero.
By the rule of three the 95% upper bound on the match rate is 3/113 = **2.65%**. F7's
target of 200 matched league-seasons out of a 21,323-league pool needs a rate of at least
200/21,323 = **0.938%** — and P(0 of 113 | p = 0.938%) = **0.345**. Seeing zero here is
what a target-reaching rate looks like a third of the time.

> So: **the target is not ruled out and it is not demonstrated.** The honest reading is
> that our format is RARE in the public MFL pool, the rate lies somewhere in [0, 2.65%],
> and the bar needs the upper two thirds of that interval. A larger sample is the only
> thing that narrows it. Nothing here licenses relaxing a filter to reach the bar — F7
> already says a short sample changes NOTHING, and this is that case, arriving as a
> measurement rather than as a worry.

**Which clause is binding, since it is not the one I would have guessed.** `F1.teams`
rejects 41 and `F1.scoring_not_half_ppr` rejects 43 — and by `screen()`'s ordering those
43 had already passed the team check. So **half-PPR is the scarcer property, not the
12-team roster**: public MFL leagues are mostly full-PPR or standard. The covariate table
from the same run agrees that team count is not the rare part — 32 of 61 dated leagues are
12-team.

**What this is NOT evidence about.** The 6 fetch failures all carry one signature (HTTP
429), which is our request rate and not six unobtainable leagues; they are excluded from
the 113 rather than counted as non-matching. And 131 leagues were never attempted, so this
is a rate over 113 reads, not over the pool.

### P6 — THE CONFLICT CHECK WAS COMPARING TWO VOCABULARIES (found 2026-08-11, by reading)

Not from a run. Found by reading the matcher while run 11 was fetching, which is the only
one of these six found before it produced a number.

The two sides of `crosswalk_picks`'s disagreement check do not arrive by the same path.
`theirs` comes out of `build_index`, which stores `_norm_pos(position)` and
`_norm_team(team)` — so a Sleeper kicker is already spelled `K` and a Jacksonville player
is already `JAX`. `meta` comes straight off MFL's players export, unnormalised — the same
kicker is `PK`, the same player `JAC`. Comparing them raw asks whether two **different
vocabularies** agree, and the answer is no for every kicker and for every player on the
nine teams `TEAM_ALIASES` exists to reconcile.

**Worked, on real board data.** Cam Little, K, JAX. MFL sends `PK` / `JAC`. The shipped
matcher resolves him to the board's own `player_id` — the right player, no ambiguity. The
check then reported `disagrees_on: ["position", "team"]`, which is the wrong-player
signature, on the severe kind. `POS_ALIASES["PK"] == "K"` and `TEAM_ALIASES["JAC"] ==
"JAX"`, and **both tables were consulted by the matcher that made the pair**. The report
was accusing itself.

Both sides now normalise through the matcher's own tables, imported rather than restated,
so a vocabulary the matcher learns tomorrow is one the check learns at the same moment.
`vocabulary_only_agreements` counts the pairs that agreed only after normalising, because
a conflict count that quietly got smaller with no account of why is not an improvement.

**This is rule 11 turned on the checker.** Every previous instance of this class was a
consumer written against a field its author pictured; this one is a *comparison* written
across two derivation paths without applying what one of them had already applied. The
check built to catch cross-source disagreement was itself a cross-source disagreement.

Run 11 measures with the pre-fix comparison, which makes its position value pairs the test:
`PK -> K` and `JAC -> JAX` dominating confirms the diagnosis by measurement rather than by
my reading of the code. The run-11 prediction above stands exactly as registered — this
supplies the mechanism for it, and does not amend it.

### D5 VERIFIED AGAINST REAL DATA WITH REAL RULE SHAPES (2026-08-11)

The scorer had only ever run on fixtures its author wrote. Run against **19,421 real 2025
weekly rows** (via `nflreadpy`, 6,160 gsis→sleeper pairs) under a rules export built from
the shapes the 250-league run actually measured — `-100-999` on yardage, `1-999` on counts,
and the combined `QB|RB|WR|TE|PK` block that appears in 32 of 60 leagues:

- **Zero untranslatable terms.** Four graded tables built; `Def` and `PK` correctly ignored.
- `has_weekly_outcomes: True`, reason `ok`, F3 coverage 1.0 over 200 drafted players.
- Leaderboard recognisable: McCaffrey 365.60, Josh Allen 362.62, Stafford 350.38.

**The cross-check that makes it more than a plausible list.** This league's table carries no
two-point-conversion terms, so against the shipped half-PPR reference every difference should
be exactly −2 per 2-pt conversion and zero for players with none. Measured: Allen **−2.00**
(one), Maye **−4.00** (two), McCaffrey and Stafford **0.00**. The deltas are precisely the
terms that differ, which is the agreement across derivation paths rule 11 asks for.

**What this settles and what it does not.** It settles that D5's scorer handles real rule
shapes and real weekly data — so the run's `unreadable_points` count is about *specific
expressions*, not about the path being broken. It does **not** settle which expressions those
are; that is what the run's `unparsed_samples` are for.

### PRE-DECLARATION — what I expect the DRAFTED-PLAYER crosswalk rate to be (2026-08-11)

Written while the 250-league run is in flight and before its crosswalk numbers exist, so the
reading cannot be fitted to them afterwards.

**What I have already seen, declared:** `mfl_live_probe.json` records **447 of 702 MFL rows
crosswalked, 72% pool coverage**. That is below F2's 90% bar, and if drafted players
crosswalked at the same rate **every league would fail F2** and the ingest would return zero
matched leagues for a reason that is about our board, not about their leagues.

**I do not expect that, and the reason is that they are different populations.** The probe's
denominator is an ADP BOARD of ~700 — which includes deep rookies, IDP and players nobody
drafts. The drafted set is the top ~180 picks of a real draft, which is concentrated on
players our board certainly carries. So:

> **Pre-declared: the drafted-player crosswalk rate will be materially HIGHER than 72%, and I
> expect most leagues to clear the 90% bar. If it comes back near 72%, F2 is the binding
> constraint and the cause is OUR BOARD's coverage, not the public pool's format.**

**And the failure mode to watch, which the report is already built to separate.** A low rate
splits two ways that support opposite actions: `unknown_mfl_id` (an id MFL gave us that is
absent from the players export **we** fetched) versus `no_sleeper_match` (a player who exists
in MFL and not on our board). The first is our fetch, the second is our board. Summed, they
would read as "their leagues contain players we cannot price", which is a conclusion about
the pool drawn from a limitation of ours.

*If this pre-declaration turns out wrong, it stays here with the result beside it.*

---

## THE COVERAGE PROBE MEASURED NOTHING ABOUT COVERAGE (run 31547459102, 2026-08-12)

**`SATISFIES F5: 0`, and a COVERAGE section that printed its header with nothing under
it. Neither is a finding about the archive.** Recorded here because a reader coming to
this file later would otherwise find a run that looks like a closure, and Route 1's
whole standing rests on the difference.

**The chain, all three links ours.**

The CDX query is day-collapsed (`collapse=timestamp:8`), so its rows are **days**, not
captures. The hand-check asked for `DEFAULT_LIMIT=8` of them and walked `tries=4` — the
newest **four days** before the cutoff. FantasyPros' overall page was walked across
28–31 July, none served, and the target was booked `NO BOARD AT THIS URL`.

The capture at **`20240712092948`** — same URL, nineteen days earlier, the one that
passes the known-answer gate **15 of 15 with the real 2024 top fifteen in order** — was
never fetched.

`classify` then compounded it. FantasyPros renders client-side *today*, which is exactly
why the archive is the instrument for this question, so its live state is `not-a-board`
— and a target whose archive walk was truncated **fell through to a verdict keyed on the
LIVE page.** "URL RETURNED NO BOARD" is a claim about a publisher drawn from our own
budget.

Then the coverage pass, which only runs on targets that satisfied F5, had no targets.
**The run that existed to ask "how many distinct preseason days serve a board" asked it
of nothing**, and its empty header read as an answer.

**This is the same defect `first_serving_capture` was written to fix, one level up.**
That fix stopped the walk taking `capture[0]`; it left it taking `[:4]`. "The days I
looked at were duds" and "this URL serves no board" are different findings, and
reporting the second from the first is how a route gets closed on its own walker — the
exact symmetric error to reporting ROUTE 1 IS OPEN on shape-counting, which happened
once already in this file and was withdrawn two entries above.

**What changed, and nothing relaxes the gate.** `budget_exhausted` travels with every
walk, true only when captures were left unexamined, with the counts examined and
available beside it. A truncated walk classifies **INCONCLUSIVE** ahead of every
live-keyed verdict and names its numbers. A walk that examined *everything* still
reports a real negative — marking every walk inconclusive would mean the route could
never be closed by evidence, only abandoned, and that mutation is tested. The hand-check
now queries the window already registered here, `preseason_window()`, June 1 to
August 31.

**THE KNOWN-ANSWER GATE IS UNCHANGED AND REMAINS THE ONLY INSTRUMENT.** This lets it see
the captures; it does not lower it.

**What the same run DID establish, and it stands.** The mirror enumeration found **three
frozen ADP boards** — `fantasypros/adp/{HALF_PPR,PPR,STANDARD}_ADP.csv`, 37–38 of 40
names known, sample reading *Christian McCaffrey, Saquon Barkley, Ezekiel Elliott,
Michael Thomas, Alvin Kamara, Derrick Henry…*, which is the real 2020 top eight in
order — last written 2020-09-03, before the cutoff. Eleven frozen **ECR** files were
binned separately, correctly: rankings are a different quantity and must never be summed
with ADP. **Two caveats, not glossed:** these are 2020–2021 vintage, not the seasons we
grade; and 2020-09-03 is late enough that whether it precedes a given draft needs
checking per-draft rather than assuming.

**Route 1 remains NEITHER OPEN NOR CLOSED on coverage.** One capture is proved; a series
is not. The corrected probe is the thing that answers it.

---

## THE MUTATION BATTERY WAS READING STALE BYTECODE (found 2026-08-11)

**This is a defect in how every measurement in this lane was verified, not in any one of
them.** Recording it here because the verification method is what all the other entries in
this file rest on, and because the failure is silent by construction.

**The mechanism.** Every battery I have run shells out to `pytest` in a subprocess after
rewriting the source file in place. CPython validates a cached `.pyc` against two things:
the source's size in bytes, and its mtime **in whole seconds**. Two mutations that leave the
file the same size, written within the same second, are indistinguishable to that check — so
the second one runs the *first one's* bytecode.

**Measured.** In the saturated-base-rate battery, M4 (`sum over discriminating` → `sum over
scored`) and M5 (`len(discriminating)` → `len(scored)`) both shrink the file by exactly 9
bytes and ran back to back. M5 was reported SURVIVED. Run alone with the cache cleared, it
fails immediately:

    assert '1 of 1 leagues that could discriminate' in v
    E   assert ... in "...; 1 of 2 leagues that could discriminate beat th..."

**Both directions are wrong, and one of them is dangerous.** A false SURVIVED costs an extra
test I did not need. A false KILLED is the one that matters: it records a test as strong when
it never ran against the mutation at all, and that is precisely the reading a battery exists
to prevent. The pattern requires a same-size mutation in the same second as the previous one,
so it is rare — but it is undetectable from the inside, and it always favours the comfortable
answer.

**The fix.** `PYTHONDONTWRITEBYTECODE=1` plus `-p no:cacheprovider` in the harness. No `.pyc`
is written, so none can be read. The harness lives in the scratchpad, not the repo, and now
carries the finding in its own docstring.

**What it cost, once re-run properly.** The full sweep over `ingest_filters.py` — every
comparison operator, boolean constant and `and`/`or`, one at a time, 82 mutations — found
**25 survivors**, and the largest class was serious:

> Ten separate `return False, "<reason>"` lines in `screen()` could each be flipped to
> `return True` with the entire suite green.

Every rejection assertion in `test_ingest_filters.py` reads `F.screen(...)[1]` — the reason
string. Not one read `[0]`, and `[0]` is the half that decides admission: `screen_all` builds
`matched` from it, and `ingest_run.run_screen` and `external_replay_run` both unpack it. A
league would have been **admitted to `matched` while the attrition table counted it under its
own rejection reason** — F7's numerator and denominator disagreeing about the same league,
with nothing anywhere to notice. F7's answer is the most consequential number this lane has
produced, and this is the hole it was measured through.

**That is the recurring defect class again** — a consumer reading the field its author
believed in rather than the one that decides — and this time it was in the tests rather than
in the code they were guarding. The tests were the last thing still checking.

The fix is one invariant rather than ten assertions, because `screen()` has a single accept
path returning `(True, "ok")` and every other return is `(False, <reason>)`:

    ok IFF why == "ok"

asserted over eighteen rejection fixtures and the accepting one. All ten mutations die on it,
and so does the reverse — a reason of `"ok"` returned with `False`.

**Three boundary survivors, all on pre-registered numbers**, each surviving because no fixture
sat *on* the bound: `PPR_RANGE`'s inclusive edges (0.4 and 0.6), `MAX_AUTOPICK_SHARE` at
exactly half (the check is `>`, so exactly half is not a majority), and **F7's target at
exactly 200** — `>=` narrowed to `>` would report INSUFFICIENT for a run that had met the bar.
Pre-registered numbers are decided at their edges; the interior was all that was tested.

**And the fixtures for those edges were themselves wrong twice before they were right**, which
is the same lesson at one more remove. The exactly-half autopick fixture first used
`autopick = i % 2 == 0` alongside `team = i % 10` — the two correlate, so the even teams got a
share of 1.0 and the test passed while measuring something else. The one-past-half fixture then
used `or i < 10`, which adds nothing, because round 0 was already autopicked. Neither error was
visible from the assertion; both were visible from the arithmetic.

**Nothing in this entry changes a filter, a threshold, or any league's verdict.** F7's answer
stands as reported. What changed is that it is now measured through tests that would notice.

---

## OPEN QUESTION FOR CORY — F6 MAY FORBID THE THING THIS INGEST WAS JUSTIFIED BY

**Not a decision I am making, and not one I can make: F6 is rule 1c, constitution, not this
lane's pre-registration.** Raised now because it bears on what the program can deliver, and
because the D7 work makes it live rather than hypothetical.

**The conflict, in the documents' own words.** This plan justifies the ingest with four
blocked items, of which #4 is *"a true survival calibration — blocked outright: it needs each
season's PRE-DRAFT ADP."* F6 then lists what external data may **never** touch, and the first
three entries are *"manager tendencies, **opponent survival conditioning**, room behaviour"*,
followed by: *"**FAIL-CLOSED DEFAULT: any parameter not explicitly classified above is
LOCAL.**"* The permitted list is *"positional replacement curves, age/pace effects,
market-efficiency-by-region, format-level value shapes"* — survival is not on it.

### The argument that there is NO conflict, first

"Opponent survival conditioning" plausibly means conditioning a survival estimate on **who
the opponents are** — a room-specific adjustment, obviously local. "A survival calibration"
means something else: does a stated p = 0.7 correspond to 70% observed survival? That is a
property of the **estimator**, format-wide, and arguably sits under "format-level value
shapes". On that reading the two clauses never meet.

### The argument that the conflict IS real

- The permitted entry says format-level **value** shapes. Survival is not value, and reading
  one as the other is exactly the kind of stretch the fail-closed clause exists to stop.
- **Fail-closed is explicit**: not listed means LOCAL. "Survival calibration" is not listed.
- And the mechanism is the point. A survival curve fitted on external drafts encodes **how
  those managers reached** — when they took a receiver early, how far they let a tier slide.
  Applying it in our room imports foreign room behaviour under a different name, which is
  precisely what the forbidden list protects.

### The reading I would apply if nobody rules otherwise, and where it stops

> **VALIDATION is not parameter-setting.** Measuring whether our shipped survival model is
> calibrated in format-matched external rooms produces a Brier score and a calibration curve —
> evidence *about the model*, not a value fitted *into* it. That is admissible under F6
> because no parameter is informed.
>
> **FITTING IS NOT**, under fail-closed, until F6 is amended to name it.

**And the loophole in my own reading, named rather than left for someone to find.** If we
validate externally and then *change the model because of what we saw*, we have laundered
parameter-setting through a human decision, and the fail-closed clause is defeated by a
sentence in a report. Whatever is decided, that path needs closing explicitly — either the
external calibration may move a parameter (F6 amended, with the clause naming which), or it
may not, and then it is a **monitor** whose findings are recorded and acted on only by
changing something local for local reasons.

**What I have done in the meantime:** nothing that touches a parameter. Every external
observation this lane emits is labelled `baseline:adp_logistic_v1` and
`is_shipped_policy()` returns False for it, so nothing external can be mistaken for a
measurement of the tool — let alone flow into one.

---

## SIGNAL B — COSTED, PICKED, AND SCHEDULED POST-DRAFT (Cory asked 2026-08-12)

**The question.** A's standing check reports signal_b as *"market half captured; model
half has no source (needs projected NFL TEAM points, not fantasy points). Not
computable."* Cory's proposal: the model half is reconstructable, because team points
are roughly `pass_td×6 + rush_td×6 + fg×3 + xp`, and those components sit inside player
projections since `score_stat_line` works from raw stat lines. Plus a simpler
alternative — the market's implied team total is information about a player's
environment **on its own**, with no model half to compare against. Cost each and pick.

### What I verified before costing anything

**`score_stat_line` is a dot product over raw stat keys.** `pass_td`, `rush_td`,
`rec_td` and the rest, scored against the league's own table. The mechanism is exactly
as described.

**But our projections do NOT carry components.** `draft/data/proj_series.json` holds
`{player_id: 415.88}` — one fantasy-point SCALAR per player, source FantasyPros, 400
players across 5 dated snapshots. So "your player projections already contain the
components" does not hold for what we store. Option A does not start from what we have;
it starts with a new ingest.

**Sleeper's shape is UNVERIFIED.** No egress to `api.sleeper.app` from this sandbox —
the same proxy block that stops MFL and archive.org. Settling it costs one CI run.

**The market half is richer than A's note suggests, and thinner than it looks.** Each
event carries **Totals AND Spread** from DraftKings and FanDuel, so an implied team
total is direct arithmetic: `total/2 ± spread/2`. A 37.5 total with a −7 spread gives
22.25 and 15.25. **But both captured snapshots are `usa-nfl-preseason`.** Preseason
implied totals say nothing about a player's season environment.

### Option A — reconstruct the model half

- **New component-level projection ingest** (my lane), preceded by one CI run to verify
  Sleeper's shape.
- **A unit mismatch that bites immediately.** Our projections are SEASON totals; an
  implied team total is PER GAME. This needs weekly projections, not what we archive.
- **The double-count trap, avoided in Cory's phrasing and not obvious.** A passing TD
  and its receiving TD are THE SAME six points. "Sum the scoring components across a
  team's players" double-counts every passing TD unless you take passing and rushing
  only — which the proposal does.
- **What the formula then omits, and why it is the expensive part.** Defensive and
  special-teams TDs, two-point conversions and safeties: roughly 3–5% of team points,
  omitted **in one direction**. The signal is `market − model`, so a systematic bias
  does not cancel — it makes every team look under-projected. Calibrating it out
  requires realized team points, so **Option A cannot be validated until the season
  produces them.**

### Option B — implied team total as environment, no model half

- Arithmetic on data already captured. No second source, no calibration.
- **Not free:** the capture must be repointed at regular-season events. That is a filter
  change on a working capture, not a new ingest.
- Gives a real statement about a player's scoring environment. Does **not** give an edge
  on its own — it is a covariate, and ADP already prices some of it.

### THE PICK — B, and not mainly because it is cheaper

**B is the cheap test of A's premise.** Option A's entire value rests on team-scoring
information mattering at the player level *after ADP*. Option B measures precisely
that, with data in hand. If implied team total has no residual predictive power once
ADP is controlled for, **A is dead too** — and we would have spent a new ingest, a
calibration and a full season to learn it.

So: **B as a measured covariate with a residual test against ADP; A only if that
residual is non-zero.** POST-DRAFT, per Cory — the draft is 2026-08-22.

**Split by lane.** The capture repoint and the feature attachment are A's. The residual
measurement is a backtest question and mine. The component-level projection ingest is
mine, and only if we reach A.

**The trap this must not fall into** is the one already registered for D7: do not
compare a model number against a market number and call the gap an edge. Here it has a
second face — the omitted def/ST points would manufacture exactly that gap, in a
consistent direction, out of nothing but an incomplete sum.

---

## ROUTE 1 SOLVES A CONSTRAINT THAT IS NOT BINDING (derived 2026-08-12)

**Arithmetic on numbers already in this file, not a new measurement.** Recorded because
it bounds how much Route 1 can be worth *before* its coverage question resolves, and the
answer changes where effort belongs.

**What Route 1 supplies is a dated pre-draft ADP board.** In `screen()`'s order that
serves **F4** (`no_pre_draft_adp`) and **F5** (`adp_not_strictly_pre_draft`). It does
nothing for F1, which screens teams, PPR band, TE-premium/split, QB slots, skill slots
and draft type.

**How many leagues actually die where Route 1 would help?**

```
RUN 12 (2025)
  394 attempted − 74 unreadable            = 320 readable
  F1.scoring_not_half_ppr   150
  F1.teams                  122
  F1.te_premium_or_split     24
                            ───
                            296
  UPPER BOUND past those three clauses      =  24
  ...and F1.qb_slots + F1.starting_skill_slots still fire inside that 24.
  At run 13's rate for those two (18 of 266 readable, 6.8%) that is ~22 of the 24.

RUN 13 (2026)
  293 attempted, 266 readable, F1 rejections 266
  EXACTLY ZERO leagues reached F2, F4 or F5.
```

**So the leagues Route 1 could rescue number AT MOST 24 in 2025 — a bound, not an
estimate, and most of it consumed by the two F1 clauses not itemised in run 12's
record — and EXACTLY ZERO in 2026.** Against F7's bar of 200.

**The conclusion, stated carefully.** Route 1 opening at full coverage **cannot change
F7's answer.** The binding constraint is F1, and no quantity of dated ADP creates
half-PPR leagues. This is not an argument that Route 1 is worthless — a dated board is
the only thing that makes an F5-clean external observation possible *at all*, and the
F4 ruling means such a league can be replayed for survival today rather than in
January. It is an argument about MAGNITUDE: the ceiling is tens, not hundreds.

**What this changes.** Route 1's coverage question stays bounded and stays answered by
the known-answer gate, exactly as registered — but it is no longer a candidate for
rescuing the sample size, and no further effort should be spent on it in that hope.
**If a larger external sample is wanted, the constraint to attack is F1's scarcity in
MFL's public pool — a different source, or a dated and registered change to F1 — not
the dating problem.** Both of those are Cory's calls, not this lane's.

**And it sharpens the note routed to A.** A's survival spec is sized on "a few hundred
external leagues". The measured figure is zero, and now the *ceiling* under the most
optimistic Route 1 outcome is also known: tens, in one season, not hundreds.

---

## F1 IS NOT MOVING — DATED RULING (Cory, 2026-08-12)

**Registered here because it closes the only remaining route to a larger external
sample, and a closed route must be closed on the record rather than by silence.**

> **THE RULING.** *"I am not changing F1 — widening the format filter means grading
> against rooms that played different rules, which is the same objection that killed
> rescoring."*

**Why it matters where it lands.** The entry above bounds Route 1's contribution at tens
in one season and zero in the other. The obvious next move, once dating is ruled out as
the lever, is to widen F1 and admit more of MFL's pool. That move is now closed.

**And the reasoning generalises beyond this decision, which is why it is quoted rather
than paraphrased.** It is the SAME objection that settled rescoring other formats: a
draft that happened under full-PPR scoring was a room making full-PPR decisions. Reading
it as evidence about half-PPR decisions — whether by rescoring the outcomes or by
widening the filter until the room is admitted — grades our rules against a game nobody
in that room was playing. The two proposals differ only in where the substitution
happens; the objection is identical.

**What this settles, together with the entries above.**

| lever | status |
|---|---|
| more leagues via a wider F1 | **CLOSED** — Cory, 2026-08-12, above |
| more leagues via dated ADP (Route 1) | ceiling of tens; cannot change F7's answer |
| rescoring other formats | **CLOSED** — Cory, 2026-08-11, narrow nflverse exception only |
| F7's 200-league target | **ANSWERED NEGATIVE** from MFL's public pool |

**So the external-sample question is finished, and it finished negative.** Not blocked,
not pending, not awaiting a better crawl — answered. What remains in this lane is what
the machinery already produces: the format census over a real pool, the attrition table
by cause, the crosswalk at scale, the survival replay under the F4 ruling, and the
nflverse half, which never depended on MFL's pool at all.

**Route 1's coverage question is being finished as registered — the known-answer gate,
the bounded pass — and then stopped.** Per Cory, 2026-08-12: *"Finish the coverage
question as registered and stop."*


---

## ROUTE 1 COVERAGE — ANSWERED, AND CLOSED ON THIS EVIDENCE (run 31551417577, 2026-08-12)

**The bounded pass registered for this question has run, with the known-answer gate as
its only instrument, and it answers. Per Cory 2026-08-12: finish as registered and stop.**

```
SATISFIES F5                       0
CONTENT-DATED LEAD (not evidence)  3
LIVE, NO PRE-CUTOFF CAPTURE        0
INCONCLUSIVE — WALK TRUNCATED      0
NO BOARD AT THIS URL              15
UNBINNED — REPORT IS INCOMPLETE    0
```

**The walk was NOT truncated this time, and that is why the zero can be read.** Every
target examined every day the index returned: 2 of 2, 3 of 3, 1 of 1, and `no index` for
the rest. `INCONCLUSIVE` is 0 and `UNBINNED` is 0, so the buckets account for all 18
targets. The capture counts are on the rows, which is what made the previous two zeros
uninterpretable and this one readable.

**The archive holds almost nothing for these URLs in the window.** Not 60 preseason days
per target — **0 to 3**. That is the coverage answer: there is no series here. One
capture was never going to be a replay input, and the index does not hold the rest.

**And every capture that did exist failed one of two ways:**

| target | capture | outcome |
|---|---|---|
| FP ppr live | 20240731003145 | 422,880 bytes, **0 player hits** |
| FP ppr live | 20240618215630 | 378,309 bytes, **0 player hits** |
| FP overall live | 20240731003217 | **0 bytes** |
| FP overall live | **20240712092948** | **0 bytes** |
| FFC page std | 20240723073039 | **0 bytes** |

The big-bytes-zero-hits rows are the known-answer gate doing exactly its job: those are
navigation menus, the same 422KB page that was once scored as a board by shape-counting
and reported as ROUTE 1 IS OPEN before being withdrawn.

### THE LIMITATION, STATED RATHER THAN BURIED

**`20240712092948` is the capture that passed the known-answer gate 15 of 15, with the
real 2024 top fifteen in order, in an earlier targeted check. Here it returned 0 bytes.**

The walk cannot tell a genuinely empty capture from a fetch that failed: the workflow's
`get()` yields `body or b""`, so a transport failure and a 0-byte snapshot arrive as the
same empty string. **That is this lane's recurring defect class one more time — "we could
not fetch it" rendered as "there is nothing there" — and it is present in this result.**

So the honest strength of the zero is: *no capture the archive served us contained a
recognisable board*, not *no such capture exists*. Some share of the five zero-byte rows
is likely archive.org throttling rather than empty snapshots.

### WHY IT IS STILL CLOSED, AND NOT REOPENED TO FIX THAT

Distinguishing empty-from-unfetched is a one-line change. **It is not worth making, and
the reason is the ceiling, not the effort.** Route 1 serves F4 and F5; the binding
constraint is F1; the leagues it could ever rescue number at most ~24 in 2025 and zero in
2026, against F7's bar of 200 — and F1 is not moving (Cory, 2026-08-12). A perfectly
instrumented Route 1 returning every board it could still cannot change F7's answer.

**ROUTE 1 IS CLOSED ON THIS EVIDENCE.** Stated precisely, and this is the sentence that
survives: across 18 registered targets, no capture strictly predating the cutoff served a
board containing recognisable NFL players; the archive holds 0–3 preseason days per URL,
which is not a series under any reading; and the strength of that negative is limited by
an empty-versus-unfetched conflation which is named above and was not repaired because
the route's ceiling makes the repair worthless rather than because it is hard.

It does not rule out a paid archive, a source not on the registered list, or a capture the
CDX index does not hold. It was never going to rule those out, and it is not the reason
the sample is small.

**STOPPING HERE, as instructed.**

---

## CAPTURE-POLICY AUDIT — SESSION C (Cory's standing distinction, 2026-08-12)

**CAPTURE, MODEL and SCAN are three decisions. A failed hypothesis is not a failed data
source.** Audited across this lane; no parked analysis restarted.

### 1. What C accumulates that nobody examines

| archive | state | examined by |
|---|---|---|
| `external_adp_series.json` | **1 row**, started 2026-08-11, daily 11:20 UTC | A's standing check, for STALENESS only — never for structure |
| the format census | **computed every run and DISCARDED** | nothing |
| the attrition table by cause | **computed every run and DISCARDED** | nothing |
| the crosswalk rate at scale | **computed every run and DISCARDED** | nothing |

**The finding: the ingest run committed NOTHING.** Every census went to a CI artifact
with a 90-day retention and was lost. Fixed this commit.

### 2. Parked for a MODELLING reason, still passes the CAPTURE test

| item | modelling verdict | capture verdict |
|---|---|---|
| **passing-TD prevalence** | negligible value effect — crossover moves 0–2 picks. **No value term.** | **CAPTURE.** Named by Cory. Lives inside the census; now archived |
| **the format census** | F7 negative — no pooling, no shadow-field expansion | **CAPTURE.** That verdict is about POOLING, not about whether the pool's composition is worth a row a year |
| **the attrition table** | the evidence *for* F7's negative | **CAPTURE.** It is the only record of why the answer was negative |
| **the crosswalk rate** | not a decision input | **CAPTURE.** Measures OUR matcher against a large external pool; the pool moves |

**Why all four are unrecoverable, which is the clause that decides it:** MFL's public pool
is a **moving population** — leagues change scoring, change size, are deleted and created.
A census of the 2026 pool cannot be reconstructed next year from any source. This program
spent a session establishing that historical league states are not retrievable; that is
what Route 1 closed on.

### 3. Neither modelled nor captured — fails the test, and this is the honest half

| item | why not |
|---|---|
| **Route 1 probe results as a series** | **Recoverable.** The Wayback CDX index is itself a durable archive; a future re-query returns the same or better. Fails "unrecoverable" |
| **raw per-league MFL exports** | **Recoverable and large.** MFL serves them on request. Fails "unrecoverable" and strains rule 9 |
| **D7 board-size distributions** | Derived from the census — capturing the census captures them. A second copy is how two numbers come to disagree |

### 4. The scan — my archives are too thin, said plainly as invited

**A scan of this lane today would examine ZERO relationships.** The ADP series holds one
row; the census series holds one after this commit. There is nothing to relate.

**So the cadence is set to natural boundaries, not monthly**, and the honest first output
is `N=0 relationships examinable — archive too thin` rather than silence. Earliest point
either series could support a bounded scan: the ADP series needs a preseason of daily
rows (~2027-08), the census needs runs across at least two seasons (~2027).

**AND I AM NOT BUILDING A SECOND CHECKER.** A's `standing_check.py` already runs daily,
already watches `external_adp_series`, and already reports BLIND rather than quiet when it
cannot look. **Rule 9 says the trigger belongs there, not in a parallel job of mine** — the
request to A is one row in its check list, not a new mechanism. Routed in PARKED.

---

## THE THIRD DIRECTED PASS CLOSES ON A CAPTURE GAP, NOT A FINDING (2026-08-12)

**I proposed three directed passes over rich unqueried history. Two produced findings.
The third cannot run, and the reason is worth more than the pass would have been.**

My discovery audit said: *"F1 is a PRODUCTION filter and I have let it bound DISCOVERY. The
120 leagues F1 rejects are still real drafting behaviour, and owner persistence, crosswalk
error structure and sequence effects are all answerable on them."*

**They are not answerable, because nothing about those leagues was retained.**

`run_screen` screens a league, records its rejection **reason**, and discards the record.
The census row carries `rejected_by_reason` — **counts by cause, not league ids and not
picks**. So for every one of the ~1,300 leagues this programme has screened across three
runs, what survives is a tally. The drafting behaviour is gone.

**That is the capture principle failing in the one place I audited FOR it.** I wrote the
capture audit, wired the census, and the census captures the *summary* of the thing rather
than the thing. Free at the time, unrecoverable now: MFL's pool is a moving population and
those leagues' 2025 states cannot be re-fetched as they were.

**What it would have cost to keep:** league ids alone — a few hundred bytes a run — would
have made the pass possible, because MFL still serves current state and the ids are the
handle. **Not the picks; just the ids.**

**Not proposing a change to the MFL path.** F7 closed it, the ingest programme is closed,
and re-opening a crawl to capture ids for a pass I can no longer justify would be the
research burden rule 9 forbids.

**But it changes what the Sleeper probe should retain.** Sleeper screens at **0.084s per
league** against MFL's 12.6 — 150× cheaper — so keeping the id of every screened league,
matched or not, costs nothing and makes exactly this pass possible there. **The F7 run
writes its rows with `league_id` and `why` for every league screened, matched or rejected,
for that reason.**

**Two of three passes produced findings. This one produced the reason the third could not,
and that is a better outcome than a thin analysis would have been.**

---

## A DATED 2023 BOARD EXISTS, IS PUBLIC, AND PREDATES THE REPOSITORY (found 2026-08-12)

**Cory asked whether any board artifact goes back further than the repo's first commit
(2026-08-08). It does, and we already had the URL.**

`draft/data/bbm/MANIFEST.json` names two Underdog Best Ball Mania IV files. Both are
reachable from this sandbox — HTTP 200, no proxy block, unlike MFL, Sleeper and
archive.org. **The full-field regular-season file carries, at 100% population:**

```
projection_adp        10.12, 10.28, ...          <- ADP as of the draft
draft_time            2023-05-17T06:39:42Z       <- PER-DRAFT timestamp
draft_created_time    2023-04-25T03:39:31Z
draft_completed_time  2023-05-17T07:36:50Z
```

**That is a dated 2023 ADP board with per-draft timestamps — F5's exact requirement —
three years older than the repository, publicly served, and free.**

### AND THE FILE WE DURABLY ARCHIVED IS THE ONE WITHOUT IT

We committed `best_ball_mania_iv_2023_r4_finals.subset.csv.gz` as the *"raw-forever
record so a re-run does not"* re-fetch. **In that file `projection_adp` and `draft_time`
are 0% populated** — round 4 is the finals slice and carries neither. The **round 1**
file, which has both at 100%, **was not archived.**

**So the durable record we kept is the one round where the dated board is absent**, and
anyone reading our archive would conclude Underdog does not publish ADP. I concluded
exactly that thirty minutes ago, from exactly that file.

**Capture finding, and the sharpest one yet: we archived the wrong round.**

### WHAT IT DOES AND DOES NOT UNLOCK

**It does NOT serve F7.** Best Ball Mania is **12-team, best-ball, no keepers** — it fails
F1 on three clauses at once. It cannot produce matched league-seasons for our format, and
nothing here reopens that.

**It DOES serve F6's pooled parameters**, which is what `exp24_bbm_shape.py` already uses it
for — positional replacement curves and format-level effects are explicitly permitted
external inputs, each naming its source at the point of use.

**And it settles a question that has been open all week:** a dated, per-draft-timestamped
ADP board for a past season **exists and is obtainable.** Route 1 concluded no such artifact
is retrievable *from the web archive, for the publishers on its registered target list*.
That conclusion stands as scoped and was too narrow as a belief — **the artifact was never
in the archive because it never needed to be. Underdog still serves it.**

### THE HONEST LIMIT

**Underdog's ADP is Underdog's market**, not ours and not MFL's. It prices best-ball drafts
under best-ball incentives. **It is a dated board, not our dated board**, and any use of it
must name that at the point of use — which F6 already requires.

---

## SUPERSEDED BY MEASUREMENT, NOT WRONG — the BBM registry entry (Cory's ruling, 2026-08-12)

**The two entries describe DIFFERENT ARTIFACTS, and Cory ruled that the record should say
so rather than have one quietly overwrite the other.**

| | what it described |
|---|---|
| **the earlier entry** | a draft file whose **ADP window could not be established** — "contaminated" was a statement about a file we could not date |
| **the measurement** | the **round-1 regular-season** file: an explicit dated window, `draft_time` at **100%** population, `projection_adp` at **100%**, hash-verifiable |

**A belief and a measurement, and the belief was formed before the artifact could be
measured.** The earlier entry is **retained, not deleted**, and it was **not wrong about
what it described**.

> **"This was superseded by measurement" is a different record from "this was wrong."**

**And I did not touch it myself.** Quietly reinterpreting one's own prior record is the
failure the amendment discipline exists to prevent, and the answer being obvious is not a
reason to skip asking.

---

## RANKINGS INSTEAD OF ADP — REFUSED, WITH A REVISIT CONDITION (Cory's ruling, 2026-08-12)

**Refused on the QUANTITY, not on the dating.**

> **ADP is what drafters DID. ECR is what experts SAID.** Survival asks *"will he last to my
> next pick"* — a question about **drafter behaviour**. Substituting an expert ordering
> measures a different quantity and calls it the same one, which is the objection that
> killed rescoring other formats: it produces a room nobody played in.

**And the dating was never the hard part.** F5 names ADP because ADP is the thing that
answers the question, not because ADP happens to be dated.

**REFUSED NOW, RE-OPENABLE IF THE ERROR IS QUANTIFIED AND SMALL.** Recorded in the
candidate ledger as `R-ECR-FOR-ADP` with that trigger attached, because *a retired
hypothesis without a revisit condition is a deleted one*.

**The trigger is cheap and specific, and both halves now exist:**

- a **dated ECR series** — six files across the 2019 preseason, in the FantasyPros mirror
- a **dated ADP board** — BBM IV 2023, **131 distinct draft dates**

**The error is measurable rather than assumed.** Nobody is measuring it now; the entry says
what would reopen it.

---

## READ WHAT WE ALREADY HAVE, BEFORE PROBING ANYTHING EXTERNAL (standing, 2026-08-12)

**Two for two, and that is enough to make it a habit rather than a coincidence.**

| archive | held | answered |
|---|---|---|
| `league_history.json` | three seasons of every owner's picks | **persistence**, in an afternoon — C-001 and C-003 |
| `draft/data/bbm/MANIFEST.json` | a URL to a dated 2023 ADP board with per-draft timestamps | **the question Route 1 spent a week on** |

**Route 1 searched the web archive for an artifact that was reachable, unblocked, free, and
named in a manifest already in this repository.**

**So: before probing anything external, read what we already have — not as a sweep, as the
first step of any question about whether an artifact exists.**

**And Route 1's standing, stated precisely:** the conclusion **holds as scoped** — no dated
board retrievable from the web archive, for its registered targets. It was **too narrow as
a belief** — the artifact was never in the archive because it never needed to be. *That is
the difference between a closed question and a closed search.*

**The BBM file does NOT unlock F7** — twelve-team, best-ball, no keepers, failing F1 on
three clauses at once. **It serves F6's pooled parameters and that is what it serves.**

---

## THE ROUND-1 BOARD IS BUILT AND VERIFIED — and PARKED FOR A, because I trespassed (2026-08-12)

**Cory's ruling:** *"Our durable record is currently the one round where the dated board is
absent, which is worse than having no durable record at all — it will be read as
authoritative by whoever comes next."*

**Built, verified, and NOT landed by me.** `draft/data/bbm/` is **A's territory** and I
committed into it. `integrate.sh` refused on both files, correctly, and **I reverted rather
than working around the guard.** The request is in PARKED.md with everything A needs; it is
a `git checkout` and a manifest paragraph.

    board  blob 48b427460ac8ca52fd8e23696b3ad479334f0e2d  in commit 759b9d6
    44,671 rows · 131 draft dates · 2023-04-30 .. 2023-09-07 · 579 players
    all five columns 100.0% populated
    sha256 abd5d6f6d317050b8208e94bfb62e218a6933e0e2146f1867335085f15ad99a5

**Until A lands it the harm Cory named is still live** — the manifest on `main` presents the
round with no dated board as the BBM record.

Streamed from the 4.8 GB dump in one pass, projected to `(draft_date, player_id,
player_name, position, projection_adp)`, **never landed on disk**.

### The defect, measured on both rounds instead of assumed

**Underdog emits the SAME 24 columns for every round.** Five of them are **0.0% populated
in round 4 and ~100% in round 1**: `draft_time`, `projection_adp`, `draft_filled_time`,
`draft_completed_time`, `pick_order`.

**The absence is Underdog's, not our exporter's.** I re-fetched the raw round-4 CSV rather
than infer it from our subset — the fields are empty in the file as published. Our subset
declined to carry `draft_time`, which was 0% anyway; it **did** carry `projection_adp`,
which is 7,938 empty cells.

**So a consumer inspecting column NAMES concludes both rounds carry dated ADP. One does.**
That is the ninth-plus instance of the same defect class in this project — *a consumer
trusting a field name rather than what the producer emits* — and this time it cost a week
of Route 1.

### Completeness was checked, because a truncated stream is the same failure again

A stream cut at 99% would produce a durable record that **looks authoritative**, which is
precisely what the round-4 file already did once.

| check | result |
|---|---|
| rows read | **12,192,768** |
| implied by pooled row length (4,053 rows sampled at head/25%/50%/75%) | 12,186,145 |
| **read ÷ implied** | **1.0005** |
| row-length spread across the file | 393.48 – 395.14 bytes (**0.4%**) |
| terminal row | fetched by byte range; **complete and well-formed** |

**And a hand-check against external fact.** 2023-04-30: Jefferson 1.32, McCaffrey 2.00,
Chase 3.00, Kelce 4.91, Hill 5.23. 2023-09-07: Jefferson 1.10, Chase 2.25, McCaffrey 3.28,
Hill 3.99, Ekeler 6.29. **The board moves across the preseason in the direction the 2023
market actually moved** — which a stale or duplicated series would not.

**The warning must travel with the file.** The manifest entry I wrote states in the archive
record itself that 131 dated boards are **a price series, not 131 gradeable
league-seasons**, so the next reader cannot make the F7 mistake from the file alone. **That
warning is the part of the parked request that matters most** — A may rewrite the wording,
but the file must not land without it.

---

## RECORD THE FIELD POPULATION BESIDE ANY DURABLE ARTIFACT (Cory's ruling, 2026-08-12)

> *"The positive control catches a bad query; it wouldn't have caught this, because the
> query was fine and the file was wrong. WHEN AN ARTIFACT IS COMMITTED AS A DURABLE
> RECORD, RECORD ITS FIELD POPULATION ALONGSIDE IT."*

**This is the fix for the instance, and it is the one the control could never have made.**
The positive control asks *did my query work* — and the BBM query worked perfectly. It
fetched the file it asked for, parsed every row, and wrote down a correct column list. The
file was the wrong file. **No control fires on that. A rate does.**

    draft/backtest/field_population.py        field-population/v1

### What it would have printed, on the record we actually committed

    population: 7938 rows | 8/9 fields full | EMPTY: projection_adp

**One line, and nobody reads that and concludes Underdog publishes no ADP.** They ask why
one column of a nine-column archive is empty — which is the question that was never asked,
and the answer was one round away, free, for a week.

### THE THREE-WAY PARTITION IS THE DESIGN, not a detail

Two different failures were hiding under one word:

    present   the key is there and carries a value
    null      the key is there and the value is empty   <- round 4's projection_adp
    missing   the key is not there at all               <- our subset's draft_time

**A column of empty cells is the producer claiming it HAS this field. An absent key is the
producer claiming it does not.** Collapsing them is the null-as-absence defect in its
purest form, and it is the tenth instance in this program.

**And zero rows reports UNCOUNTED, never 0% and never 100%.** A denominator of zero cannot
produce a rate, and a check that can only say *nothing yet* has not looked (rule 13f).

### Wired into every durable writer in this lane — one line each, at write time

| writer | what a dropped field now looks like |
|---|---|
| `census_archive.append()` | `keeper_type` — absent from the row for a week, and nothing said so |
| `board_pin.append()` | a pin whose `sha256` went empty proves nothing about the board it names |
| `external_adp_capture.save()` | `total_drafts` — this module already says a snapshot without it *"cannot be judged later"* |
| `external-ingest-run.yml` | prints `FP.line(...)` at write time, so the run surfaces it without anyone opening the JSON |

### THE MUTATION BATTERY FOUND ME OVERCLAIMING, INSIDE THE FIX ITSELF

**Nine mutations, eight killed on the first pass.** The survivor was `of_csv` dropping its
declared header — invisible with data rows present, because `DictReader` fills every
declared key on every row. **The header only matters when there are no rows at all**, which
is the empty-artifact case, and that assertion was missing. Written, and it dies now.

**Then a second, worse one.** The wiring first passed `fields=list(row)` — **derived from
the very dict being written.** If the writer stops emitting `keeper_type`, `list(row)` stops
containing it too, and the field vanishes from the population record exactly as silently as
it vanishes from the data. **I had written a comment claiming that line caught a dropped
field. It could not.** That is this module's own defect class, committed inside the fix for
it, and only a mutation test found it.

**And the honest residue: the replacement mutation ALSO survives.** `append()` always writes
every key, so the declared list is today redundant with the union of the rows. **Its teeth
are in `test_the_declared_field_list_cannot_drift_from_the_row`** — verified by mutation:
deleting `keeper_type` from the row literal fails three tests. *The constant is the schema;
the drift test is the enforcement.* Saying "declared, so a dropped field is caught" would
have been the same overclaim a second time, so it is not said.

### THE FIRST SWEEP, AND WHAT IT FOUND — including in this module itself

**17 durable artifacts on disk; 7 carried a record-list the sweep could measure.** Stated
that way deliberately: *"17 swept, 2 findings"* would claim a coverage the sweep did not
have. **The other 10 were not measured** — a key-name heuristic (`series`/`rows`/`records`/
`entries`/`pins`) missed them, which is the argument for the write-time call rather than a
discovery pass. **A sweep that guesses at structure will always under-cover.**

| artifact | population |
|---|---|
| `external_adp_series.json` | all 5 fields 100% |
| `oracle_capture_series.json` | all 8 fields 100% |
| `board_pins.json` | all 7 fields 100% |
| `adp_series.json`, `proj_series.json` | 100% |
| `bbm/..._r4_finals.subset.csv.gz` | **8/9 full — EMPTY: `projection_adp`** (known; parked) |
| `component_grades.json` | 9/14 full — empty: `bias`, `effect`, `implication`, `mae`, `mde` |

**The component-grades flag is NOT a finding, and I checked before routing it.** All six rows
read `verdict: "no_data"`, `n_obs: 0`, `graded: 0 of 6 declared`, with a prose `why` and an
`implication_why` naming the absence explicitly. **The emptiness is declared, not silent** —
the opposite of the BBM case.

**Which is the instrument's real boundary, and it is worth stating: `line()` cannot tell
"empty and unexplained" from "empty and accounted for".** Both print the same string. That
is acceptable *because the design is to make a reader ask why* — in one case the artifact
answers in one step and in the other it answers nothing. **The record prompts the question;
it does not answer it.** Building machinery to tell them apart would be the dashboard rule 9
forbids.

### AND THE ONE THAT MATTERS — measured on the archive C-001 and C-003 rest on

`league_history.json` was among the ten the heuristic missed, so it was measured by hand:

    DRAFT PICKS   480 rows | partial: is_keeper 15.2%   (73 present, 407 null, 0 missing)
    TRANSACTIONS 1091 rows | 6/7 fields full | EMPTY: waiver_bid
                             waiver_bid  0 present, 1091 null, 0 MISSING

**`waiver_bid` is present on every one of 1,091 transactions and empty on every one.** That
is the round-4 shape exactly: *a field the producer declares and never fills.* It confirms
the parked finding — *"this league has no bids may be a null read from the wrong path"* —
with a number, and the three-way partition is what makes it legible: **0 missing** means our
exporter IS emitting the key, so this is not a field we forgot to carry.

**It does not yet prove Sleeper serves bids at another path.** That is still the live check
in `sleeper_pool.bid_path()`. What it establishes is that the strongest persistent signal
this project has measured — `waiver_share`, ICC 0.754 — was computed from `type` and
`created` **beside a field that has been empty 1,091 times without anyone noticing.**

### THE MODULE'S OWN DEFECT, FOUND BY POINTING IT AT REAL DATA

Calling it on `league_history.json` raised `AttributeError: 'str' object has no attribute
'get'` from three frames inside the counting loop. **This runs at write time inside archive
writers, so an opaque crash here can take down the append that was supposed to save the
row — a measuring instrument must never be the reason the thing it measures is lost.** It
now refuses by name (`row 1 is str, not a record`), with the assertion written before the
fix and confirmed failing against the shipped code.

---

## THE SHORTFALL NOW HAS A SHAPE — the crosswalk's absent class, closed (2026-08-12)

**My own discovery audit named this and nothing acted on it:**

> *"I split conflicts by field but never asked whether unmatched players DIFFER
> SYSTEMATICALLY from matched ones (rookies? DSTs? suffixes?). If they do, every
> downstream number is biased in a direction nobody has characterised."*

**It was unanswerable from the record, not merely unanswered.** The crosswalk kept
`unmatched_sample = unmatched[:10]` and discarded the rest when the run ended, and the CI
artifact holding even that is on an egress-blocked host. **Ten rows cannot show structure,
and there were never more than ten.**

**The rate is the wrong instrument for it, permanently.** `pooled_rate = 0.94` says how many
missed. It cannot say *which kind*, and it never will — a rate is one number and this is a
shape.

### What is reported now, per league and pooled

    unmatched_composition   by_pos, by_why, with_name_suffix, n
    matched_composition     by_pos, with_name_suffix, n

**Both sides, because the question is a COMPARISON.** One distribution answers nothing: RB
being 30% of the misses means nothing until you know RB is 12% of the hits. Reported at the
pooled level too — one league's ten misses cannot show structure, and **the run-level dict
is the only crosswalk record anything downstream reads.**

**And it is PRINTED**, next to the rate, in the run's diagnostics. A record nobody reads is
the hole in a different place, and this lane has now hit that twice in one day — the field
population and the P8 skew both lived in artifacts nobody in the sandbox can fetch.

### The batteries

**Crosswalk-level: 5 mutations, 2 killed first pass.** The three survivors each named a
missing assertion, and all three were real:

- **an unmatched row with NO POSITION** folded away silently — the totals then disagree with
  the count beside them, and a whole class of miss becomes invisible in the one report meant
  to characterise it;
- **`Jr` versus `Jr.`** — the suffix hypothesis was one of the three this exists to answer,
  and *nothing tested it at all*;
- and `n` from `by_pos` rather than `len(recs)` — **an EQUIVALENT mutant**, since every
  record contributes exactly one `by_pos` entry. **Recorded as equivalent rather than
  contorting a test to kill it.**

**Pooling: 3 mutations, 3 killed.** Dropping either side, or failing to accumulate the
suffix totals across leagues, now fails.

### One thing this does NOT do

**It does not tell us whether the misses are structured.** It makes the question answerable
on the next scheduled run. **Reporting the instrument as though it were the finding is the
error this lane keeps writing audits about**, so: no claim about rookies, DSTs or suffixes
is made here, and none should be read into it.

---

## THE CENSUS ARCHIVE HAD NO TRIGGER, AND I FOUND IT BY WIRING TWO MORE THINGS INTO IT (2026-08-12)

**`external-ingest-run.yml` carried no schedule. Nothing else invoked it — no cron, no
`workflow_call`.** It ran when a human dispatched it and at no other time.

**Which makes `census_archive.py`'s own justification false in practice.** Its docstring:

> *"MFL's public pool is a MOVING POPULATION... A census of the 2026 pool taken today
> cannot be reconstructed next year from any source."*

**An archive whose entire argument is unrecoverability was saving nothing unattended.** That
is the intention-with-no-trigger failure this lane has documented repeatedly — committed in
the lane that documents it, by me.

**And I only found it because I had just wired two more measurements into the same
workflow** — the field-population line and the crosswalk composition — and stopped to ask
whether either would ever fire on its own. **Neither would.** Three instruments, all inert.

    schedule:
      - cron: '0 9 1 * *'      # monthly, an hour after data-inventory.yml's 0 8 1 * *

**Monthly, and the module's own words set the cadence** — it asks whether the pool's
composition is *"worth a row a year"*, so twelve answers that generously, and a full MFL
crawl is not a thing to run nightly. **Reversible in one line.**

**Checked before calling it done, because a cron that fires into a broken run is worse than
no cron:** all four dispatch inputs carry `|| default` fallbacks (`year` defaults to 2025, a
played season, which the input's own description requires), `permissions: contents: write`
is present, and the commit step pushes with `[skip deploy]` after a `pull --rebase`. **A
scheduled run is well-formed, not merely scheduled.**

### The generalisation, since this is now three for three

**Every instrument I built today reported into somewhere nobody reads unattended:**

| instrument | where it landed | reachable? |
|---|---|---|
| P8 selection skew | uploaded CI artifact | **no** — host egress-blocked |
| crosswalk composition | per-league report only | **no** — died before pooling |
| field population + census | a workflow with no cron | **no** — dispatch only |

**All three are fixed, and the pattern is the finding:** *building the measurement is the
easy half.* The question that catches these is not "does it compute the right number" —
each did — but **"who reads it, and what makes them read it?"** A number with no reader is
the same defect as a field with no value, one level up.

---

## THE VALIDATION RUN FOUND TWO THINGS, AND THAT IS WHY IT WAS RUN (2026-08-12)

**I had changed a workflow and shipped three code paths into it that had never executed
in CI, with the next scheduled fire twenty days out.** Run 31575310090, normal parameters
so the census row it wrote would be a real observation rather than a smoke test.

### 1. The census archive had NEVER SAVED A ROW, and the first one was unkeyable

    [main fbcc009] C: format census row [skip deploy]
     create mode 100644 draft/data/format_census_series.json

**`create mode`.** The file did not exist. The archive whose docstring argues from
unrecoverability had, up to this morning, saved nothing at all — and the first row it ever
wrote came out like this:

    population: 1 rows | 10/13 fields full | EMPTY: examined, observed_at, season

**`census_archive.append()` read `season`, `observed_at` and `examined` off the top level
of the ingest report. The report does not put them there.** A consumer trusting field
names the producer never emits — **the eleventh instance in this program, committed inside
the module whose docstring is about capture.**

**And it was not cosmetic.** The dedup key is `(season, observed_at)`, which became
`("None","None")`, so **the next run would have REPLACED the row rather than appending
one.** A time series permanently capped at one observation, failing silently and looking
exactly like a working archive.

**Seven green tests sat beside it.** Their fixture supplied `season` and `observed_at` at
the top level, so they asserted my belief about the producer rather than the producer's
output. `REAL_SHAPED` now exists in the test file, taken from the run that exposed this,
and a keyless row **raises** — a crash costs one run, a silent overwrite costs every run
before it.

### 2. The crosswalk composition answered its question on its first firing

    MISSED by pos    {"LB":181,"DE":134,"S":114,"TMQB":112,"TMPK":82,"WR":67,"DT":32,"ST":24}
    MATCHED by pos   {"RB":2239,"WR":2216,"TE":839,"QB":751,"Def":363,"PK":242}
    missed by reason {"team_unit_not_a_player": 218}

**YES, the misses are systematically different — and the structure is benign.** They are
overwhelmingly **IDP positions (LB, DE, S, DT) and team units (TMQB, TMPK, ST)** — things
our board does not carry by design. **`WR` at 67 is the only skill-position miss in the top
eight.**

**This changes how `pooled_rate = 0.8493` should be read.** The crosswalk is not failing on
players we would draft; it is failing on defensive players and team units in IDP leagues,
and **`leagues_clearing_F2_bar = 50/70` is measuring IDP prevalence as much as it is
measuring our matcher.** The rate alone could never have shown that — *a rate is one number
and this is a shape*, which is the argument the composition was built on, now demonstrated
rather than asserted.

**No filter is being relaxed on the strength of it.** F2's 0.90 bar stands as registered.
What changed is that the number beside it is now interpretable.
