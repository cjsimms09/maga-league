# The room model has no tail, and the measured replacement has too much

> ## 🔴 CORRECTED THE SAME DAY — READ `pairing_claim_result_2026-08-12.md` FIRST
>
> **Three claims in this file are wrong and are struck through below rather than
> quietly edited.**
>
> 1. **The 0/40 was not a measurement.** The ADP room picks from the eight
>    best-ADP players available, so a player cannot fall 40+ picks past his ADP in
>    it — measured, the deepest overrun across 30,000 picks is **22.8**. The
>    fall-through metric is defined against the same ADP the room orders by
>    (**rule 10d**). I applied rule 13g to the 100% and not to the 0%.
> 2. **"The traces are not retained" is false.** `draft/data/league_history.json`
>    holds **480 real picks in order across three completed drafts**. I checked
>    `manager_profiles.json` and generalised from one file to the repository.
>    Corrected by C.
> 3. **"The construction-order results stand" is false.** Measured: greedy beats
>    the composite by **+7.9 ± 1.5** in the ADP room and **loses by 11.0 ± 7.3**
>    in the profiled one. The margin changes sign, so pairing does not cancel the
>    blind spot for differences.
>
> **The mixture this file recommends should NOT be built.** Its motivating
> measurement was circular, and calibration against the real drafts shows both
> endpoints failing on the same position (WR) in the same direction.

**Review item 4, tested directly.** The claim was that ADP-plus-jitter opponents
systematically understate the tails, and that mixing historical draft traces with
the parametric model fixes it. **The first half is confirmed emphatically. The
second half has a data problem and an overshoot.**

---

## THE MEASUREMENT

An **elite fall-through** is defined before the run: a **top-3-at-position player
still available 40+ picks past his ADP**. That is the event the elite-fall-through
defect turned on — the one my 120-room validation passed clean through.

| room model | drafts containing one | deepest fall |
|---|---|---|
| **adp-with-jitter** (what every simulation has used) | **0 / 40 — 0%** | 0 picks |
| **profiled** (from the measured manager profiles) | **40 / 40 — 100%** | 130.8 picks |

> 🔴 **THE 0% ROW IS A TAUTOLOGY.** The ADP room draws each pick from the eight
> best-ADP players still available, so the threshold "40+ picks past ADP" is not
> rare in it — it is **unreachable**. Measured directly: over 200 drafts × 150
> picks, the deepest any player was taken past his own ADP is **22.8**. The
> non-circular replacement for this table is the positional-drought calibration
> against the three real drafts, in `pairing_claim_result_2026-08-12.md` §3.

**THE ADP ROOM COULD NEVER HAVE FOUND THAT DEFECT.** Not "did not" — *could not*,
in zero of forty drafts. Every simulation this project has run, including the
roster-construction validation and the construction-order arms, has been blind to
the entire class of event by construction.

That is the strongest possible confirmation of the limit I recorded this morning:
*a simulation validates behaviour inside its own room model and is silent about
everything outside it.* It is now a measured statement rather than a caution.

---

## BUT THE REPLACEMENT OVERSHOOTS, AND 100% IS THE TELL

**A room that produces an elite fall-through in every single draft, with the
deepest at 130 picks, is not a better model — it is a differently wrong one.**
Real rooms do not let a top-three quarterback fall 130 picks. Rule 13g applied to
my own instrument: 100% is as suspicious as 0%, and I am not reporting it as a
fix.

**The mechanism of the overshoot is visible.** The profiled arm draws each seat's
position from that manager's measured **by-round-bucket mix** — a marginal. A
marginal has no memory: nothing stops nine seats independently drawing "not QB"
for twenty consecutive picks, which is what leaves an elite quarterback on the
board at pick 130. Real rooms correct that because a human sees the position
still sitting there.

**So neither model is right, and the honest conclusion is the review's own —
MIX them — for a sharper reason than it gave:**

- **ADP-with-jitter has NO tail** (0%), so it cannot surface the defect class.
- **The measured marginal has an UNBOUNDED tail** (100%, 130 picks), so
  everything it surfaces is suspect.
- A mixture is not a compromise between two approximations; it is the only
  configuration where the tail exists and is bounded.

---

## AND THE DATA PROBLEM THE REVIEW ASSUMED AWAY

> 🔴 **THIS ENTIRE SECTION IS WRONG, AND C CAUGHT IT.**
> `draft/data/league_history.json` — a different file from the one I checked —
> retains **480 real picks in order** across the 2023, 2024 and 2025 drafts, each
> with `pick_no`, `round`, `roster_id`, `player_id`, `is_keeper`. I verified
> `manager_profiles.json` holds only derived profiles and generalised from one
> file to the repository. **The capture recommended below is unnecessary: the
> traces are on disk and 98% of their player ids resolve to positions today.**

**"The traces already exist" is not true of this repository.**
`draft/config/manager_profiles.json` holds **derived** profiles — positional mix
by round bucket, positional timing, reach delta, softmax dials — built from **450
picks across 3 drafts**. The picks themselves were consumed at build time and
**are not retained**. The three `draft_ids` are recorded, so Sleeper can serve
them again, but **nothing in this repo can replay a trace today.**

That is why the arm above is built from marginals rather than traces, and it is
exactly why it overshoots: **a trace preserves the sequence, and a marginal
destroys it.** The fall-through happens in the joint distribution — nine seats
skipping a position together — which a per-seat marginal cannot represent and a
trace records for free.

**THE CHEAP FIX IS A CAPTURE, NOT A MODEL.** Fetch the three drafts from Sleeper
once and commit the pick sequences. It is:

- **free** — three calls to an endpoint already authenticated;
- **small** — 450 picks;
- **not strictly unrecoverable** (Sleeper retains drafts), so it fails the
  capture-because-unrecoverable test and passes on a different one: **a replay
  that depends on a live API at replay time is a replay that breaks when the API
  moves**, and every simulation in this project would then depend on it.

**Recommended, post-draft, ~1h.** Not before the 22nd: it changes no live surface
and the room model is a simulation concern.

---

## ~~WHAT THIS DOES NOT CHANGE~~ — 🔴 THIS SECTION IS FALSIFIED

~~**The construction-order results stand.** Those arms are compared **paired on the
same seed within the same room model**, so a shared blind spot cancels between
arms — it biases the LEVELS, not the DIFFERENCES. `greedy_end_state` beats the
composite by the same margin in a room with no tail as it would in one with a
tail, because both arms face the identical board.~~

**MEASURED, AND IT DOES NOT.** `--room profiled` ran the identical five arms on
identical paired seeds. `greedy_end_state` scores **+7.9 ± 1.5** against the
composite in the ADP room and **−11.0 ± 7.3** in the profiled room — a sign
change, with non-overlapping intervals, reproduced at n = 25, 30 and 60. A
reproduction control re-derives **+7.9 ± 3.0** in the ADP room from the same
code, so the flip is the room and not the edit.

**The paragraph above was written to defend a result against a defect I had found
that same morning, which is the circumstance under which such an argument
deserves the least trust.** Full result and its consequences in
`pairing_claim_result_2026-08-12.md`; the read was preregistered in
`pairing_claim_prereg_2026-08-12.md` before the numbers existed.

**Where the blind spot bites is validation, not comparison** — which is precisely
where it bit: the roster-construction run declared the cap clean while the cap
was refusing the exact pick worth making.

**Silence rule (15) holds throughout.** This is a simulation room model. Nothing
here renders and nothing is visible during a live decision.
