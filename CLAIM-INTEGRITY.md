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
