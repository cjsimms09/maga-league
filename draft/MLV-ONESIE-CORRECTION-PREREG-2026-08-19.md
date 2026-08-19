# CORRECTION + PREREGISTRATION — the "exclude K/DEF entirely" arm never ran

**A, 2026-08-19, written BEFORE the fix and BEFORE the re-run.** Register 134.

## WHAT I TOLD CORY, AND WHY IT IS NOT SUPPORTED

Commit `913d7440`, answering his *"what happens to MLV method if you just put a
hard cap on Def and K or 1 / Or exclude def and k all together"*:

```
  hard cap at 1     actual +45.84  skill +29.33  K 1.00 DEF 1.00
  exclude entirely  actual +45.84  skill +29.33  K 1.00 DEF 1.00     ← NEVER RAN
  no cap at all     actual +19.16  skill +10.75  K 1.93 DEF 1.90
```

**The exclusion arm crashes on every invocation and always has.**

```
$ node draft/tools/roster_builder_replay.js --mlv --mlv-no-onesie
ReferenceError: forcing is not defined
    at roster_builder_replay.js:359:61
```

`if (MLV_NO_ONESIE && (q === 'K' || q === 'DEF') && !forcing) continue;` — the
first operand is `false` unless the flag is passed, so `&&` short-circuits and
the undefined reference is never evaluated. **The flag is the only thing that
reaches it, and reaching it is fatal.** The two rows are byte-identical because
**they are the same run printed twice**: the cap arm, once with a flag the
script could not honour.

**That is exactly the shape Rule 3f describes** — a probe written to answer a
question in the moment, printing clean plausible output, headed straight for a
sentence to Cory and a design document. And **the "byte-identical" result was
itself the tell**: two construction rules that differ agreeing to the last
decimal is the signature of a flag that does nothing, not of a deep truth. I
wrote the coincidence down as the finding.

## THE SECOND ERROR, WHICH IS LARGER

That commit and `ROSTER-BUILDER-PANEL-DESIGN.md` §5 both explain the (false)
identity with a mechanism: *"MLV never volunteers one, and only the legality
gate seats them."*

**There is no legality gate.** `buildSeat` has no fill rule, no forcing gate, no
`unfilled`, no `forcing`. Verified across **all ten commits** of
`draft/tools/roster_builder_replay.js` including the original — the count of
definitions is zero in every one, so this is not something an edit of mine
removed tonight. It never existed.

**And there is independent evidence it never existed:** dead end 1 left **8 of
30 rosters with no kicker**, which a fill rule makes impossible. That result is
the known positive for this claim (rule 3e) — the harness has demonstrated it
can produce an illegal roster, so "30/30 legal" is a real measurement rather
than a gate reporting on itself.

`C3_legality_reported_not_assumed` is therefore accurate as written: legality is
**reported**, never enforced. MLV's 30 of 30 is **emergent**. Good news, wrongly
explained.

**So the stated mechanism is self-refuting:** if a kicker's +16.9 really were
beaten by every skill player at every roster size, MLV would draft **zero**
kickers, not 1.00. It draws exactly one because filling an empty dedicated slot
is worth its full surplus over the wire and filling a *second* one is worth
nothing. **MLV volunteers the first K and DEF and declines the second on its
own.** That is a better answer than the one I gave, and it makes the cap
non-load-bearing for a different reason than I claimed.

⚠️ **This does NOT touch the shipped numbers.** `+45.84 / +29.33`, K 1.00, DEF
1.00, 30/30 legal are the **cap** arm, which runs. Register 132 stands. What
falls is the third row of the table and the sentence explaining it.

## THE FIX

Delete `&& !forcing`. With no gate in the harness, "exclude entirely" means
exactly that: K and DEF are never candidates.

## PREDICTIONS — filed before the re-run

**P237 — the exclusion arm is NOT identical to the cap arm; it is ILLEGAL.**
K count **0.00**, DEF count **0.00**, and **30 of 30** seats reported with an
unfillable slot. **FALSE if any seat fields a kicker** — that would mean a gate
exists somewhere I have not found, and the whole finding above is wrong.

**P238 — and it therefore scores WORSE, not identically.** Actual **< +45.84**
and skill **< +29.33**, because two starting slots score zero every week.

**P239 — the cap is not load-bearing against the FIRST onesie, only the second.**
In the cap arm the mean pick of the first K is **> 100** with no K term of any
kind in the objective — i.e. the timing is emergent from declining marginal
value, not imposed.

## CONTROLS

1. **C1 — KNOWN POSITIVE, and it is the control this whole file exists because I
   skipped.** The fixed flag must **change the output**. K count must move off
   1.00. **If the two arms print identical numbers again, the flag still does
   nothing and NOTHING is reported.**
2. **C2 — the cap arm must be bit-identical to what is already committed**
   (+45.84 / +29.33). If it moved, the fix touched more than the dead branch.
3. **C3 — legality reported**, per standing rules, and it is the payload here.

## FOLLOW-UP QUESTIONS (rule 3g)

- **Does this imply another failure we have not looked for?** Yes, and it is
  filed: the MLV-TIMING edit (register 133) failed its own assertion the same
  night and printed plain MLV twice. **Two "identical output" events in one
  session, both from an arm that did not exist.** Every arm flag in this harness
  now needs the C1 above before its number is quoted.
- **Does it invalidate something we already trust?** It invalidates one row of
  one table and one sentence of `ROSTER-BUILDER-PANEL-DESIGN.md` §5, both
  corrected here. It does **not** touch register 132 — that arm runs.
- **Is it routed to the lane that can act?** B is holding the panel design that
  carries the false sentence; §5 is corrected in the same commit as this file.
