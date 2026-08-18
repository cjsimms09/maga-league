# E's seventh sweep — the ceiling is still a within-cell constant multiple of the projection

**Session E (red team), 2026-08-17.** Board: `origin/main`'s
`public/draft_data.json`, `2026-08-16T14:10:12Z`, 682 players — the published
board, run with the project's own instrument.

**This one bears on C1, the ceiling-weight decision waiting on Cory.** It is
filed as a question with numbers attached, not as a claim that a preregistered
result is wrong. `SESSION-E.md`'s hard limit applies: I raise the question, I do
not override the measurement.

---

## WHAT I MEASURED

The brief's §1 states the defect signature exactly: *"Spearman **1.0000** against
the projection inside a cell: exactly zero player-specific information."*

On today's published board, inside each `(position, band)` cell:

| | |
|---|---|
| **Spearman(`proj_ceiling`, `proj_mean`) within cell** | **exactly 1.000000 in 16 of 16 cells** with n ≥ 4 |
| within-cell cv of the `ceiling/mean` ratio | **worst 6.3e-04**, typical **~5e-06** |
| within-cell cv of `floor/mean` | median 3.0e-05 |
| within-cell cv of `proj_sd/mean` | median 3.8e-05 |

A cv of 5e-06 on a ratio stored to two decimal places is **rounding**, not
football. The RB|4-8 cell in full:

```
Jonathan Taylor   mean 292.4  floor 225.25  ratio 0.770243
James Cook        mean 282.1  floor 217.27  ratio 0.770215
Saquon Barkley    mean 262.4  floor 202.13  ratio 0.770224
Ashton Jeanty     mean 262.2  floor 201.92  ratio 0.770217
Derrick Henry     mean 274.2  floor 211.16  ratio 0.770207
```

Five players, five "distinct" ratios, all agreeing to four decimal places.

## THE PROJECT'S OWN INSTRUMENT AGREES, AND SAYS SO TODAY

`python3 draft/backtest/constant_multiple_sweep.py`, run on the published board.
**Its known-positive control fired first** — *"self-test OK — known-positive
caught in 10 cells"* — so this is a report from an instrument that has just
proven it can fail:

```
proj_ceiling = c x proj_mean   in 7/10 cells, c in [1.0922, 1.704],  worst cell cv 0.000634
proj_floor   = c x proj_mean   in 3/10 cells, c in [0.0076, 0.7439], worst cell cv 0.001395
proj_mean    = c x proj_sd     in 7/10 cells, c in [1.502, 2.6316],  worst cell cv 0.002322
proj_mean    = c x weekly_sd   in 7/10 cells, c in [5.6627, 10.8497],worst cell cv 0.008160
```

**All four dispersion fields are still within-cell constant multiples of the
projection.** `CV_FLOOR` is 0.02 and the worst of these is 0.000634 — thirty
times inside the threshold, not near it.

The sweep's own header states the consequence it was written to prevent:

> *"A field with cv ~ 0 against another field contributes NOTHING that field does
> not already contribute — it cannot be weighted independently, and any study
> that tries will return a null it did not earn."*

## THE QUESTION THIS RAISES ABOUT §7b

**§7b's justification for re-opening the ceiling weight was that the field had
become per-player:** *"Re-run on the first real-ceiling board (**505 distinct
ceiling/mean ratios where there was 1**)."*

Those 505 distinct ratios are, on my measurement, **~20 genuine cell constants
plus two-decimal rounding noise.** The field went from *one* global multiplier to
*one multiplier per (position, band) cell*. It did not become per-player. Within
the cell where a player actually sits, his ceiling still contains exactly the
information his projection already contained.

**What that does and does not imply — stated carefully, because the distinction
is the whole finding:**

- **It does NOT mean the +$35 result is a null that was mis-read.** The
  multiplier varies **across** cells (1.09 at TE|33+ to 1.70 at RB|1-3), so
  weighting `ceiling` is not weighting a copy of `value` — it is weighting
  `value` **re-tilted by position and projection band**. That is a real,
  non-degenerate transformation, and it is why the arm could produce a non-zero
  effect at all.
- **It does mean the mechanism is not the one being described to Cory.** The
  framing in §7b and in `CLAUDE.md` is *"the model is ignoring upside entirely"*.
  A field that is rank-identical to the projection inside every cell **cannot
  express player upside**. Whatever the +$35 is buying, it is a positional/band
  tilt — which may well be worth buying, and is a different thing to decide.

**This is Rule 3d's question, not an answer.** The three numbers:

1. **Did the input vary?** Across cells yes (1.09–1.70); **within cells, no** —
   rho exactly 1.000000, 16 of 16.
2. **Did it arrive?** Yes — `proj_ceiling` is on 530 rows with
   `proj_ceiling_source: measured-2023-25-p90`.
3. **Could the test have fired?** Yes, and it did — the sweep's known-positive
   control caught the synthetic pre-fix ceiling in 10 cells on this same run.

**What I am asking A and Cory to consider before C1 is decided:** whether the
result should be described as *"the model is ignoring upside"* or as *"a
position-and-band tilt on the projection is worth about $35"*. **The number does
not change either way. The reason for shipping it does.** And the brief itself
says the genuine per-player upside signal is `weekly_volatility.py` (§3), which
is measured, persistent at rho +0.482/+0.605 — and **explicitly not wired**
(§7 item 1). Those are two different things and the account currently reads as
though the ceiling fix delivered the second.

### ASK / EVIDENCE / REC / DEFAULT → **A**

```
ASK:      Before C1 goes to Cory: is the ceiling weight's benefit correctly
          described as upside, given proj_ceiling is rank-identical to
          proj_mean inside every cell?
EVIDENCE: Spearman exactly 1.000000 within cell, 16/16; within-cell cv of
          ceiling/mean 6.3e-04 worst, ~5e-06 typical; the project's own
          constant_multiple_sweep flags proj_ceiling = c x proj_mean in 7/10
          cells on today's published board, with its known-positive control
          firing on the same run.
REC:      Do not change the weight or the result -- I am not qualified to
          and it is not my lane. Change the SENTENCE Cory is given, so the
          decision is made on the mechanism that is actually there. If the
          tilt is worth $35, tell him it is a tilt.
DEFAULT:  Filed. C1 is already gated to after 08-22, so there is time to
          answer this before it is put to him. I take no action on the
          weight.
```

---

## AND IT NAMES THE FIELDS REGISTER 2 HAS BEEN WAITING FOR

Register row 2 — *"a new field joined the constant-multiple family… **NAME the
field**"* — has been open and blocked on building a fresh board. **It is
partially answerable right now without egress**, because the same sweep runs on
the published board:

```
adjusted_adp = c x pool_rank      in 10/10 cells, c in [0.989, 1.0039],  cv 0.012430
adjusted_adp = c x adp            in  4/10 cells, c in [1.0058, 1.0159], cv 0.015393
adjusted_adp = c x consensus_rank in  4/10 cells, c in [1.0058, 1.0159], cv 0.015393
adjusted_adp = c x raw_adp        in  4/10 cells, c in [1.0058, 1.0159], cv 0.015393
```

**`adjusted_adp` is the strongest candidate for the field that joined the
family** — it is constant against `pool_rank` in **10 of 10 cells**, and it does
not appear in the dispersion group at all, so it is a genuinely separate
instance. **Caveat, stated plainly: register 2 is about the FRESH 693-player
board and this is the published 682-row one, so this NAMES a candidate rather
than closing the row.** Whoever builds the fresh board should check
`adjusted_adp` first.

**Benign and already known, listed so they are not re-chased:**
`proj_sd = c × weekly_sd` in 10/10 is true by construction (`weekly_sd` is
`proj_sd` over a per-position `games_expected`, itself a constant — sweep 3);
`proj_baseline == proj_sleeper` at n=422 is register 21; and
`adp == consensus_rank == raw_adp` are declared aliases.

---

## CORRECTION TO SOMETHING I TOLD CORY EARLIER TODAY

Answering the Henry-vs-Olave question I said Henry's floor of 211.16 is
*"mean × a band constant"* and carries no age information. **That was right, and
this sweep is the rigorous version of it** — but the intermediate step I used to
get there was not. I first checked "how many distinct ceiling/mean ratios exist
within a cell", got 452 distinct across 530 players, and briefly took that as
evidence the fields *had* become per-player. They have not; the distinctness is
2-decimal rounding, which the cv measurement above shows and the raw-count
measurement cannot. **A distinct-value count is the wrong instrument for this
question and the project already knew that** — it is failure mode (1) in
`constant_multiple_sweep`'s own header: *"comparing 6-decimal ratios against
2-decimal stored values — rounding noise swamped the signal."* I walked into a
documented trap and the document was in the file I was about to run.
