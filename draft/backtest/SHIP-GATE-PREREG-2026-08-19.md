# PREREGISTRATION — the gate the new draft model must clear to SHIP

**A, 2026-08-19, written BEFORE the replay is built or run.** Draft is Saturday.

## CORY'S RULING

Asked whether a good replay means shipping into the war room or sitting beside
the current board as a second opinion, Cory chose **"Ship it — replace the
ranking."**

⚠️ **That overrides `no_fit_guard`'s "nothing ships before Saturday", and it is
his call to make** (`CLAUDE.md`: *Cory owns … any call he wants*). Recording it
as a **ruling**, not as a guard that quietly lapsed. **The condition still
binds: it ships only if it clears the bar below, and the bar is written here
before the number exists.**

## WHAT IS BEING COMPARED

The shipped `engine.js`/`survival.js` at `MEASURED_WEIGHTS` has already been
through this exact counterfactual — `draft/data/engine_seat_replay.json`, 30
seat-seasons (2023-25 × 10 seats), era-appropriate bundles, fixed opponents,
keepers as recorded, K/DEF mirrored, graded on committed actual weekly points.

**Its number on the preregistered primary (`optimal` arm):**

| | |
|---|---|
| beats *n* of 10 owners pooled | **0** |
| median owner mean delta | **−174.43** |
| Cory's seat | **−188.35** |

**The new model runs through the same harness, same bundles, same seats, same
opponents, same grading.** The comparison is therefore **PAIRED** — 30 matched
seat-seasons — which is far tighter than the ±117.7 sd that makes the unpaired
figures unquotable.

## ⛔ WHAT THIS REPLAY CANNOT GRADE — stated before running, not after

**The Draft Sharks bands do not exist for 2023-25.** Cory said this himself
(*"We don't have draft shark for 22-25 though?"*). So in a historical replay
every player necessarily enters with `floor = proj = ceiling`, which means:

- **`LEAN` does nothing.** The floor/ceiling rule — the value-early/upside-late
  mechanism — **is not tested by this replay at all.**
- **Durability does nothing.** `injury_risk_pct` is also Draft Sharks-only.

**Substituting our own band would be inventing one.** Register 119: ours is
`mean ± 1.28 × sd ACROSS SOURCES`, analyst disagreement, a *different quantity* —
and inventing a band is precisely what Cory has spent two days correcting.

**So this replay grades exactly one thing: the ROSTER-SHAPE machinery.**

```
value = max(0, proj − wire(pos)) × w(pos, bodies held)
w                                = Cory's transcribed curve
        × (1 − streamability)      for bench bodies only
```

That is `w`, the corrected wire, and the streaming tax. **It is the right thing
to grade,** because the conversion gap is the failure it is aimed at: the
shipped engine's rosters held **more** projected points than the owners' (+2.1%
in 2023, +5.1% in 2025) and still lost, converting **0.740 / 0.771** against
**0.828 / 0.834**. Value acquired that never reached a starting slot is a
*shape* failure, and shape is what this model changes.

**The band rule ships ungraded or it does not ship. That is a separate ruling
and §"IF IT SHIPS" below forces it to be made explicitly.**

## THE BAR — all three, on the `optimal` arm

**GOOD requires every one of these. Any miss and it does not ship.**

1. **It scores more.** Mean paired difference (new − shipped) across 30
   seat-seasons is **> 0**.
2. **It is not one lucky year.** New model wins in **≥ 20 of 30** seat-seasons.
   ⚠️ 2024 is the year the shipped engine is worst in (8 of 10 seats worse than
   −200); a mean driven by 2024 alone with 2023/2025 flat is **not** a pass.
3. **It beats somebody.** `beats_n_of_10_pooled` **≥ 3**, against today's **0**.

**And one guard against winning on shape while losing on points:**

4. **Conversion must not fall.** The new model's starting-lineup conversion rate
   must be **≥ the shipped engine's** in each of 2023 and 2025. A model that
   drafts a prettier roster and converts *worse* has disproved its own thesis.

**NOT GOOD → it does not ship, Cory drafts Saturday on the board he already
knows, and that outcome is reported as plainly as a pass.**

⚠️ **The bars do not move after the number is seen.** Three predictions today
(P210 1.37 vs 1.40, P212 0.8 vs 3.0, P214 wrong sign) were left FALSE at bars
they nearly cleared, and this one is worth more than all three.

## CONTROLS

1. **C1 — a KNOWN POSITIVE before any comparison is believed (rule 3e).** Run
   the harness with the new chooser replaced by *the shipped engine itself*. It
   must reproduce `engine_seat_replay.json`'s pooled numbers **to the decimal**.
   If the harness cannot reproduce the number it already published, every
   difference it reports afterwards is uninterpretable — and a null would be
   indistinguishable from a wiring error.
2. **C2 — the choice side never sees an outcome.** Choices are dumped first and
   graded afterwards by the existing `replay_seats_grade.py`, unmodified. No new
   grading code is written for this.
3. **C3 — the comparator is not a straw man.** The shipped engine runs at
   `MEASURED_WEIGHTS`, its real live configuration, including `ceiling 0.45`
   (Cory's ruling) and `stack 1`. It is not handicapped to lose.
4. **C4 — coverage is reported, not assumed.** How many of the 30 seat-seasons
   actually produced a full roster for both arms, and any seat dropped is named.

## IF IT SHIPS

Shipping means `public/js/draft/app.js` ranks on this model instead of
`MEASURED_WEIGHTS`. Then, and only then:

- **The band rule and durability go live UNGRADED**, because no replay can test
  them. **Cory must be told that in those words and rule on it separately** — a
  pass here is a pass for the shape machinery only.
- The `⏮ Restore the measured core` pin (`BASELINE_VERSION`) must be rolled so
  one tap cannot silently revert to a pre-ruling configuration — the exact
  defect of register 5g.
- It ships **Friday at the latest**, never on draft morning.
