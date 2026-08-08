# KEEPER-PLACEMENT MECHANICS — end-to-end verification (draft-critical)

Filed 2026-08-08 (Cory). **Mechanics:** Cory (commissioner) manually places each team's keepers onto the Sleeper draft board the day before the draft. **keep-N consumes that team's rounds 1..N**; teams keeping fewer than 3 have **LIVE picks inside rounds 1–3**; **keep-0 is legal** (league precedent). Nothing anywhere may assume rounds 1–3 are uniformly keepers.

## Status of the assumption hunt (done 2026-08-08)
Grepped the pipeline the way we hunted the rounds conflation. **No uniform "rounds 1–3 = keepers" assumption found:** `keepers.py` forfeits **per-team cost rounds** (`top_picks_flat`: keep-N → rounds 1..N for THAT team via the collision-roll; keep-0 forfeits nothing). `survival.js round<=3` is a draft-PHASE bucket (early/mid/late), unrelated to keepers. So the cost-round math is already heterogeneous-correct. The remaining work below is verification + the commissioner cross-check + the robot scenario — NOT a known bug fix.

## To build / verify
1. **Sync ingests keeper placements per-team.** The sync layer reads keeper picks from the Sleeper pick stream (`is_keeper` flag / commissioner placements) and classifies **every slot in rounds 1–3 as keeper-consumed or LIVE, per team** — never a blanket assumption. Verify the classifier against the real placed board.
2. **Everything derives from the ACTUAL classified sequence.** Live-pick numbering, survival horizons, and the **opponent model** derive from the classified pick sequence. **Opponents with live early picks must be predicted at those picks** — their round-1–3 live picks are the earliest snipes on the board and must appear in the survival/threat model.
3. **CROSS-CHECK THE COMMISSIONER (new alarm).** When Cory places keepers on Sleeper, the tool reconciles **every placement against the confirmed keeper designations in config**: wrong player, wrong team, wrong round, or a designated keeper left unplaced → **loud red alarm on the checklist.** Cory's manual placement is itself an error surface; the tool catches the fat-finger. (Extends the existing `reconcileKeepers` beyond count-mismatch to placement-identity mismatch.)
4. **Timing.** After placement day (**Aug 21**), a rebuild re-derives everything from the now-real board; the **morning-of rebuild re-verifies.**
5. **Robot scenario — heterogeneous fixture.** Teams keeping **3, 2, 1, and 0**, asserting: correct per-team slot classification (keeper-consumed vs live in rounds 1–3), my live picks numbered right, survival math spanning the live early picks, and the **placement-mismatch alarm firing** on a deliberately wrong placement.

## Note on the slot-value analysis
The Aug-8 slot-value analysis assumed KEEPER_ROUNDS=3 — correct for **Cory** (keeps 3), used only for his own pick numbering. The pipeline's opponent/board numbering must use each team's real keep-count (per §2 above); do not generalize Cory's 3 to other seats.
