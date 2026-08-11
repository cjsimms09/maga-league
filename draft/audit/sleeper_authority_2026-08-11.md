# Where Sleeper is the source — and where it cannot be

## 1. The waiver answer: `waiver_type = 1`

Your memory said rolling. Sleeper says `1`. On the standard encoding
(0 rolling / 1 reverse standings / 2 FAAB) that is **reverse standings —
priority resets weekly off record, nothing depletes** — so there is no stopping
problem and the rule is "claim anything with net > 0".

**Not FAAB** is certain and independently corroborated: `is_faab: false` in our
config, with `waiver_budget: 100`, `waiver_bid_min: 0` and `faab_suggestions: 0`
sitting inert. The only residual is the 0↔1 mapping, which is my legend rather
than something I can cite — and it flips the conclusion, so it wants ten seconds
in the Sleeper UI where the setting is shown in words.

## 2. THE BOUNDARY NOBODY HAD LOOKED FOR: Sleeper only goes back to 2023

Walking `previous_league_id`: **2026(pre_draft) → 2025 → 2024 → 2023.** Then it
ends. Three completed seasons, 45 games per owner.

The seeded career records cover **85–86 games** per owner — about seven seasons.
**Sleeper holds roughly half of our history and none of the rest.** The standing
rule still holds, but its scope is narrower than "Sleeper is authoritative for
the league": for anything spanning seasons before 2023, Sleeper is *not* a
source at all, and a reconciliation that assumed otherwise would have silently
replaced seven seasons with three.

## 3. That localises B's off-by-one to a cell Sleeper cannot fix

| | W-L-T | slots | closes? |
|---|---|---|---|
| Seeded career | 425-424-2 | 851 | **odd** |
| Sleeper 2023–25 | 225-225-0 | 450 | even, and W == L |
| implied pre-2023 | 200-199-2 | 401 | **odd — the defect is here** |

All ten owners play 45 on Sleeper. Nine seed at 85; **Cory seeds at 86.** So
Cory carries **41** pre-2023 games where every other owner carries 40.

**The surplus win is in Cory's pre-2023 record** — the exact portion Sleeper
does not hold. It cannot be auto-corrected; it needs the master sheet or a
season-by-season recollection. What the reconciliation bought is that the search
went from "one of ten rows across 851 slots" to "one cell", and that the
2023–25 half is now *verified* rather than assumed.

## 4. Sleeper does NOT hold a standings tiebreaker

Searched every settings key for tie/seed/rank/sort/standings. The only match is
`playoff_seed_type: 0`. **There is no tiebreaker field.** Breaking ties on
points-for is therefore a genuine house rule, not something the import is
failing to read — it belongs on the hand-held list, not in the import. This
corrects the expectation that tiebreakers were the clearest import case.

## 5. THE HAND-HELD LIST — facts Sleeper does not know

1. **Payout split** (reg-season and playoff percentages) — in `SEASONS`.
2. **Buy-in** ($100) — in `SEASONS`.
3. **Weekly-high prize** — house rule.
4. **Keeper COST structure** (`top_picks_flat`: keeping N forfeits rounds 1..N).
   Sleeper holds `max_keepers: 3`; it does not hold what a keeper costs.
5. **Standings tiebreaker** (points-for) — per §4.
6. **Pre-2023 career records** — per §2, structurally unavailable.
7. **My draft position** — claimed by hand by design; the war room verifies it
   against the draft object once the order is assigned.

Everything else in the settings object is Sleeper's and should be read.

## 6. Currently ignored, worth importing

`pick_trading: 1` — **draft-pick trading is ENABLED** and nothing models it; it
can move pick order before the 22nd. `trade_deadline: 11`, `trade_review_days: 2`,
`veto_votes_needed: 5`, `veto_auto_poll: 1`. `reserve_slots: 1` with every
`reserve_allow_*` at 0 — an IR slot that admits no designation, which either is a
quirk or does not mean what it looks like, and roster capacity feeds
startable-slot math. `bench_lock: 1`.

## 7. One open question

`settings.draft_rounds = 3` against our `rounds: 15`. Almost certainly not the
draft length — 15 matches `roster_size`, and the draft object is authoritative —
but 3 also equals `max_keepers`, and a coincidence is worth explaining rather
than assuming.
