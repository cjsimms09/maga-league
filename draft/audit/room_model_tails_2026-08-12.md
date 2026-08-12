# The room model has no tail, and the measured replacement has too much

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

## WHAT THIS DOES NOT CHANGE

**The construction-order results stand.** Those arms are compared **paired on the
same seed within the same room model**, so a shared blind spot cancels between
arms — it biases the LEVELS, not the DIFFERENCES. `greedy_end_state` beats the
composite by the same margin in a room with no tail as it would in one with a
tail, because both arms face the identical board.

**Where the blind spot bites is validation, not comparison** — which is precisely
where it bit: the roster-construction run declared the cap clean while the cap
was refusing the exact pick worth making.

**Silence rule (15) holds throughout.** This is a simulation room model. Nothing
here renders and nothing is visible during a live decision.
