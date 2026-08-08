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

## 2b. INTEL BATCH 2 (2026-08-08) — Richard2121 locked; THE TE FORK COLLAPSES

**Cory 100% confidence: Richard2121 keeps Bijan Robinson + Trey McBride + Nico Collins** (full slate). Encoded as `certain` intel overrides. **Corroboration (point 4):** the flat-cost K0 optimizer independently endorses *exactly* this slate — Bijan r1 (surplus +44), McBride r2 (+2), Nico r3 (+21). McBride's +2 was model-*uncertain* (barely clears the round-2 cost); Cory's intel resolves it to certain. Bijan/Nico the model already backed. Model + intel agree.

**⚡ THE ELITE-TE-ANCHOR CONTINUATION NO LONGER EXISTS.** With **both** Bowers (Marian) and McBride (Richard) predicted kept, the both-TEs-gone branch becomes the **PRIMARY** pick-34 scenario; the old Bowers-available branch (§2 above) **demotes to a contingency footnote**.

**Re-run on the PREDICTED BOARD** (all 14 opponent keepers + my 3 removed from the pool):
- **TE landscape — no cliff, no rush.** Best TE is now **Loveland (VORP 38)**, then Warren (24), LaPorta (18) — **all survive 100% to pick 34 AND 41.** TE goes from an anchor decision to a "take one whenever" slot; the LRM on TE relaxes completely.
- **The freed pick-34 decision (real survival-zone options on the predicted board):**
  - **WR-feast:** Tee Higgins (71% to 34), T. McMillan (46%), Nabers (34%), plus fallers Jameson Williams (87%) & Davante Adams (80%).
  - **Early-QB:** Lamar (98%), Maye (99%), Burrow (99%) — QB is **wide open at 34**, so grabbing a top-5 QB while the field is still on skill players is genuinely live.
  - **RB depth:** Etienne (63%), Swift (91%), Bucky Irving (87%).
- **Net:** with Cory's robust-RB keeper base (RB slots full) and TE de-anchored, **pick 34 = WR2 (Higgins/McMillan) or Early-QB (Lamar)** — the WR-feast and Early-QB continuations **gained the probability mass** the elite-TE branch lost. (The D3 flex-discount already tilts him toward the WR2 hole over redundant RB depth.)
- **Honest limitation:** the crude "remove kept players from the pool" doesn't re-shift the remaining players' ADP, so deep-board survival is approximate — proper **re-ranking on the predicted board** (survival recomputed against the compressed order) is the refinement to do in the A-9 board-wiring build; the qualitative shift (TE cliff gone, WR/QB open) is robust.

### Keeper-slate confidence tracker
**2 of 9 opponents on INTEL** (MarianSaar=Bowers high; Richard2121=full slate certain) · **7 on model-only.** Cory keeps feeding reads as he gets them; each replaces its model prediction and re-runs the board.

## 3. OPENING SCRIPT — per keeper-scenario
The opening script generates **per keeper-scenario**; its Aug-20 regeneration on the real slate is already specced. Until then it carries the **predicted-slate variant with the Bowers branch explicitly forked** (Branch A / Branch B above).

## Ledger
Record the prediction: **"MarianSaar keeps Bowers — high confidence — source: Cory intel."** January grades our **keeper-prediction accuracy** too (did the predicted slates match reality?), alongside everything else. _(Written to the live prediction ledger at draft-prep time; captured here now so it isn't lost.)_
