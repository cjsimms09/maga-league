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
  `F4.fetch_failed` · `F5.missing_timestamps` ·
  `F4.scoring_untranslatable` · `F4.scoring_range_exceeded` · `F4.no_weekly_data` ·
  `F4.no_gsis_crosswalk`  *(the last four are F3/D5 — see D5 at the foot of this
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
