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
