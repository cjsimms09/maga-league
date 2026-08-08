# CLAIM INTEGRITY — the doctrine of enforced epistemics

Filed 2026-08-08 (Cory), generalised from the attribution-wording guard.

> **Epistemics rules that live only in prose drift by the time they matter.**
>
> **A rule nobody can violate silently is worth more than a rule everybody
> agrees with.**

## The rule

Where a claim-integrity rule **can** be expressed as a test over generated
artifacts, it **MUST** be. Three components, all required — a guard with only
the first is a liability, not a rail:

| | component | why it is not optional |
|---|---|---|
| **(a)** | **the guard catches the overclaim** | the obvious half |
| **(b)** | **anti-overreach: honest phrasings of the same facts pass untouched** | a guard that flags legitimate sentences gets switched off within a week, and the real rule leaves with it |
| **(c)** | **spec-conformance: the reasoning is findable from the failure** | a future author who meets a red build must find *why the sentence is wrong*, not just a regex saying no. A rule whose justification is unreachable is re-litigated or deleted |

## Why (b) and (c) carry the weight

(a) is the part everyone writes. (b) and (c) are the parts that determine
whether the rule survives contact with a deadline.

A guard that produces false positives is disabled by the first person under
time pressure — and disabling it removes the true positives too. A guard whose
reasoning is unreachable gets "fixed" by rewording the sentence to slip past the
regex, which is worse than no guard at all: the claim ships and the rail reports
green.

## Enforced rules (each with all three components)

| rule | test | what it prevents |
|---|---|---|
| **Attribution wording** — 37's numbers are associational, not causal | `test_attribution_wording.py` | "the tool earned $X" when the design supports only "$X was realised on decisions where the tool recommended Y" |
| **Confidence tiers** — a surfaced edge states its tier | `test_claim_integrity.py` | a dollar edge rendered as settled fact with no LEAN / CANDIDATE / WINNER / parked / REFUTED qualifier |
| **Provenance labels** — site data is declaration until Sleeper speaks | `test_claim_integrity.py` | invented or drifted labels (`Sleeper-confirmed` vs `Sleeper-verified`) that erode the doctrine one synonym at a time |
| **Honesty line** — a generated report names its own limits | `test_claim_integrity.py` | a report of results with no caveat, limitation, sample size or CI anywhere in it |

## The first thing this pattern caught

Writing the provenance guard found **label drift that had already happened**:
`AUTHORITY-DOCTRINE.md` said `Sleeper-confirmed ✓` while the implementation had
converged on `Sleeper-verified` (6 uses, matching the `slotVerified` state name)
plus prose variants. Nobody disagreed with the doctrine; the vocabulary simply
moved and the prose did not.

Canonical set, now enforced: **`site-declared`** · **`site-claimed`** ·
**`Sleeper-verified`**. The doctrine was normalised to the implementation's term
rather than the reverse, because the state variable is the thing six call sites
already agree on.

That is the whole argument for this doctrine in one example: **the rule was
never violated on purpose, and it drifted anyway.**

## The second thing this pattern caught — its own over-reach

The provenance guard, as first written, policed every `Sleeper-<word>` token. It
flagged `SLEEPER-SETTLED` — which is a **taxonomy KIND** in
`AUTHORITY-DOCTRINE.md` (Sleeper-settled / site-native / derived), not a
render-time authority label. I followed the guard and "normalised" it, which
broke `authority.test.js`.

**A guard that cannot tell a category from a label is exactly the over-reach
component (b) exists to prevent — and it happened on the first run, to the
person writing the doctrine.** The guard now polices only status-shaped labels
(`confirmed` / `verified` / `validated` / `approved` / `declared` / `claimed` /
`authoritative`); `settled` is deliberately absent and the reason is a comment
in the test.

Which is the argument for (b) stated better than the doctrine could state it:
the false positive arrived immediately, it was persuasive, and following it
corrupted a correct file.

## Scope limit, stated honestly

This applies to rules expressible as tests **over generated artifacts**. Some
claim-integrity rules are not — "don't overstate a finding in conversation"
cannot be linted. Those stay prose, and stay weaker, and everyone should know
which category a given rule is in. Pretending a prose rule is enforced is its
own overclaim.

---

# RULE: A FIXTURE'S QUANTITATIVE PREMISE MUST BE MEASURED, NOT ASSUMED

_Added 2026-08-08 after the third instance. Promoted from habit to rule._

**If a fixture encodes a quantitative premise — "wide gap", "depleted board",
"close call", "underpowered sample" — the test must COMPUTE that premise and
FAIL if the fixture does not satisfy it.**

## Why this is a rule and not a nicety

**A fixture built to be strict that measures permissive fails in the direction
that looks like success.** The test goes green, the guard appears to hold, and
the thing it was written to catch walks straight through. There is no error
message, no red, nothing to notice — the failure is indistinguishable from
working.

That asymmetry is what makes it worth a rule. A fixture that is accidentally too
strict fails loudly and gets fixed in minutes. A fixture that is accidentally
too permissive is a guard you believe in that isn't there.

## The three instances

1. **The sanity sweep's board was never depleted.** Built to test round-9
   decisions; Jahmyr Gibbs was still available in round 13, so the engine was
   never asked to choose between a QB2 and a replacement-level flex — the exact
   situation the harness existed for. It was green while the bug it was built
   for sat in the live tool. Fixed by draining ~10 players per round and
   asserting it; the QB2 bug appeared immediately, 265 times.

2. **The "wide gap" fixture measured a gap of 4.0.** Built with a 25-vorp lead
   to prove a doctrine tilt could not override a strong composite preference.
   The composite compresses vorp through VONA, tier urgency and need, so the
   upper bound would have passed **trivially** on the day the tilt landed —
   against a wide board that was not wide. Caught by a gap check added for
   exactly this reason, on its first run.

3. **The onesie injury exception fired on "Questionable".** The premise was
   "a starter whose availability is genuinely threatened". Unmeasured, it waved
   through 291 duplicates, because in August most of the league carries that
   tag. An exception that fires for everybody is the rule with extra words.

## What this requires in practice

- Compute the premise **in the test**, from the fixture, at run time.
- Assert it **before** the assertions that depend on it.
- Where the dependent assertion is behind a flag or a pending feature, run the
  premise check **anyway, in both states** — otherwise the fixture rots
  unexercised and is wrong on the day it is finally needed. (Instance 2 was
  caught precisely because the premise check ran while the feature was off.)
- State the measured value in the failure message, so the fix is obvious rather
  than a hunt.

## EXTENSION: identifier existence is a premise too

_Added after the fourth instance._

**Any fixture referencing a named entity — doctrine key, strategy id, player id,
experiment number, evidence-state key — must assert that the entity RESOLVES
before asserting anything about its behaviour.**

The fourth instance: the doctrine band fixture compared `'wr_feast'` against
`'rb_anchor'`, which are DISPLAY NAMES, not keys (`wr_anchor`, `robust_rb`).
Both resolved to nothing, every tilt returned 0, and the test failed accusing
the ENGINE of not being wired.

**That direction was luck.** A test comparing two nonexistent entities finds no
difference between them, and whether that reads as a correct failure or a false
pass depends entirely on which way the assertion points. The same typo in an
"assert these are equal" test passes silently and forever.

So the four instances share one root — **a fixture's premise is assumed rather
than verified** — and they differ only in what kind of premise:

| # | fixture | assumed premise | measured reality |
|---|---|---|---|
| 1 | sanity sweep | the board is depleted | Gibbs available in round 13 |
| 2 | legality/engine fixtures | the path is reachable | the assertion was vacuous |
| 3 | doctrine band | the gap is wide | composite gap was 4.0 |
| 4 | doctrine band | the keys exist | they were display names |

## Scope

This is the **enforceable** kind of rule, per the scope limit above: a premise
that can be computed must be computed — and an identifier's existence can always
be computed. Where a premise genuinely cannot be
measured — "this fixture is representative of real drafts" — say so in the file
and treat the test as weaker evidence, rather than asserting a construction
nobody checked.
