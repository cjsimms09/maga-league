# KEEPER INTEL + SCENARIO MACHINERY

Filed 2026-08-08 (Cory). Cory believes **MarianSaar keeps Bowers.** Three builds.

## 1. PREDICTED KEEPER SLATES (all 9 opponents)
Generate predicted keepers NOW from each opponent's roster under **flat-cost math** — keep anyone whose value clears the round cost, ranked by **surplus** (the K0 optimizer / `keeper_optimize` pointed at everyone else, not just me). Each prediction carries a **confidence**.
- **Mock/rehearsal boards use the PREDICTED slates** (clearly marked as predicted) until real designations land, then replace them **one by one via the existing keeper-watch**. Rehearsing against a *probable* board beats rehearsing against a fictional full pool (the fixture-keepers lesson, generalized to opponents).
- **Cory's Bowers intel = a high-confidence OVERRIDE** on MarianSaar's prediction (source-tagged: Cory intel, not model).
- Data on hand: `league_history.json` 2025 `final_rosters` (opponent rosters) + the current board's VORP/cost model → the surplus computation the K0 optimizer already does for my seat, run for all 10 seats.
- **Build status: NOT YET BUILT** — the main piece. Needs `keeper_optimize` generalized from my-seat to all-seats + a predicted-slate store the board/keeper-watch reads + confidence scoring.

## 2. SCENARIO-CONDITIONAL PICK-34 DOSSIER — COMPUTED 2026-08-08
Run the elite-TE analysis BOTH ways. **Numbers below are from the real board** (survival model + v1 `dollarGap`; rough dollar rails until quantile-V):

**Branch A — BOWERS AVAILABLE.** Last-elite-TE = **Bowers** (VORP 82, +18 over McBride, +64 over the LaPorta tier).
- Survival: **83% to pick 34**, **60% to pick 41**.
- Take-at-34 vs wait-for-41: **+$1.4** to take now (small in the v1 dollar model — the fallback, McBride at VORP 64, is nearly as valuable in dollars; the VORP cliff is sharper than the rough dollar proxy yet prices it. Quantile-V will widen this).
- **Room-panic:** if Bowers' effective ADP jumps 10 on scarcity, **survival to 41 collapses 60% → 22%** — the take-at-34 premium grows steeply.

**Branch B — BOWERS KEPT (Marian keeps him).** **McBride inherits the last-elite-TE question** — his **46-point VORP gap to the LaPorta tier is comparable violence** (confirmed: exactly 46).
- Survival: **80% to pick 34**, **53% to pick 41**.
- Take-at-34 vs wait-for-41: **+$0.4** now (fallback Loveland VORP 38 is close in v1 dollars).
- **Room-panic:** McBride ADP −10 on scarcity → **survival to 41 collapses 53% → 16%** (even sharper than Branch A, because with Bowers gone the TE-needy room converges on McBride).

**The honest read:** under *normal* survival the take-now premium is small in v1 dollars (the rough model underprices the TE cliff that VORP sees clearly — flagged for quantile-V). **The decision is driven by room-panic risk:** the moment the board shows TE scarcity (especially once Bowers is off), survival to 41 falls off a cliff, and taking the last-elite-TE at 34 becomes strongly correct. So the live LRM/scarcity signal on TE is the thing to watch at pick 34.

## 3. OPENING SCRIPT — per keeper-scenario
The opening script generates **per keeper-scenario**; its Aug-20 regeneration on the real slate is already specced. Until then it carries the **predicted-slate variant with the Bowers branch explicitly forked** (Branch A / Branch B above).

## Ledger
Record the prediction: **"MarianSaar keeps Bowers — high confidence — source: Cory intel."** January grades our **keeper-prediction accuracy** too (did the predicted slates match reality?), alongside everything else. _(Written to the live prediction ledger at draft-prep time; captured here now so it isn't lost.)_
