# ROUTE → B — the projection toggle, and what changed under the board

**From A, 2026-08-19. Draft is Saturday 08-22.** Mailbox file, straight to `main`
(Rule 1b).

> Cory: *"can we actually program 2 models, one that uses proj from draft shark
> and 1 that uses mean proj. and I want to be able to toggle between them"*
> and *"deploy so I can play with it"*.

**ASK:** one control in the war room that switches which projection the board
ranks on. **The data is already on every row — nothing needs deriving at read
time.**

---

## 1. THE FIELDS ARE ALREADY THERE

`draft/tools/attach_draftsharks.py` has rewritten `public/draft_data.json`. Every
player now carries **both arms**:

| field | what it is | coverage |
|---|---|---|
| `proj_mean` | **the blend** — mean of every source, centred per position | 700 |
| `proj_ds` | **Draft Sharks' own** projection, uncentred | 247 |
| `proj_floor` / `proj_ceiling` | the blend wearing DS's band as a % | 247 real, 453 = proj |
| `proj_ds_floor` / `proj_ds_ceiling` | DS's raw floor/ceiling | 247 |
| `ds_band_from` | `"draftsharks_pct"` or `null` | — |
| `injury_risk_pct` | DS per-player injury risk | 247 |
| `proj_mean_pre_ds` etc. | the pre-attach originals, for reversibility | 700 |

**⚠️ THE DS ARM CAN ONLY RANK 247 OF 700 PLAYERS.** Coverage by ADP depth:
top-100 **100%**, top-150 **99.3%**, top-200 **94.5%**, top-250 **88.4%**. Cory's
last pick is **148**, by which point the live board is ~250 deep — so **the DS
arm thins exactly where his final picks come from.**

**When the toggle is on DS, a player with `proj_ds == null` must be shown as
UNRANKED, not dropped silently and not back-filled from the blend.** Mixing the
two inside one ranking is the defect the toggle exists to let him see. A count
on screen ("247 of 700 ranked") is enough.

## 2. WHAT `ds_band_from: null` MEANS ON SCREEN

453 players have **no Draft Sharks band**, so their `proj_floor` and
`proj_ceiling` are set **equal to `proj_mean`**. That is deliberate: the ceiling
adjuster must be **unable to move a man we have no band for**.

**Do not render that as a zero-width band as though we measured one.** Show a
dash, or grey it. Register 119: our old band was `mean ± 1.28 × sd ACROSS
SOURCES` — analyst *disagreement*, which for a mid-round receiver is nearly the
opposite of volatility. Cory spent two days correcting exactly this confusion;
an invented band is worse than a blank one.

## 3. THE CEILING ADJUSTER — its behaviour is now specified

`draft/tools/draft_model.js` implements what Cory asked for, three times, in the
same words. **His own test case is a permanent assertion in that file:**

```
adj  = clamp(A + RAMP × progress, 0, 1)
used = proj + adj × (ceiling − proj)
```

- **A = 0** → ranks on the projection.
- **A = 1** → ranks on **pure ceiling, for every player at every slot.**
- **A = 0.5** → exactly half the added ceiling.
- **RAMP** → the late-draft crank: *"it needs to be able to be tuned up to where
  players are judged closer to their ceiling late in the draft."*

**The previous version failed his test.** At full crank in a starter slot it
judged men at their **floor** — 500/550 → 450, 450/550 → 400. If the war room
implements an adjuster, it must satisfy: **two men with the same ceiling tie at
A = 1, whatever their means.**

## 4. WHAT I HAVE NOT DONE, SO YOU DO NOT ASSUME IT

- **The war room still ranks on `engine.js` at `MEASURED_WEIGHTS`.** The new
  model is REPORT-ONLY and nothing reads `draft/data/draft_model.json`.
- **`VONA_SLOT_AWARE` stays FALSE and should not be flipped.** Measured from the
  choices artifacts: in that arm **100% of picks after 75 score negative**
  (median −135.6) against 0% shipped. The onesie discount that buries an
  unstartable QB2 is `Math.min(score, score × 0.1)`, which does nothing to a
  negative number — so it silently disables the one mechanism built to stop the
  QB2, and seats taking 2+ QB go **43% → 63%**.
- **18 tests are RED on `main` and were red BEFORE this change** — verified by
  running them against the pristine board with the board state asserted each
  pass. Not mine, but you will see them.

## 5. DEFAULT IF I HEAR NOTHING

**Ship the toggle defaulting to `proj_mean` (the blend)**, with the DS arm
available and its 247/700 coverage stated on screen. That is the arm with full
board coverage, and it is what the model's committed artifact runs.

**Recheck 08-20.** If this is too much for Friday, say so and I will cut it to a
read-only second column instead of a live toggle — that still answers "let me
play with it" and touches no ranking code.
