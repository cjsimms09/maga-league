# CLAIM — LEARNING-CONSTITUTION.md (proposed), for independent review

**What ran:** nothing executes — this diff is a single governance DOCUMENT
(`LEARNING-CONSTITUTION.md`, status PROPOSED) plus this claim file. It defines
the Tier-0/1/2 change-control taxonomy the Learning Engine spec (PARKED.md
item 10, 2026-08-08) references but never defined. `run_tests` was set false:
no code changes, so suite output would be evidence about nothing in this diff.

**What came back:** n/a (document only).

**What it proves:** only that a concrete, internally consistent taxonomy now
exists in writing, pending this audit. *(Scoped down 2026-08-25 at the
reviewer's required action ①: this line originally added "agreed by the league
owner in principle" — an approval claim this diff carries no artifact for. The
owner directed the audit process; his approval of the content is ratification
checklist item ③ and does not exist yet.)*

**What it does NOT prove:**
* that the tier boundaries are drawn in the right places — that is exactly the
  question for the reviewer;
* that Tier-1's safety argument holds (it rests on "no 2026 decision surface
  consumes the weekly arm" — a factual claim about the codebase the reviewer
  may challenge);
* that the QUICK-KILL precondition (register 199) will exist before Tier-1
  goes live — the document requires it but cannot enforce it;
* anything about the Learning Engine's implementation, which stays unbuilt
  until ratification.

**Uncertainty / where to push:** the seams between tiers. Specifically invited:
① loopholes — a change formally Tier-0/1 that in substance moves a
recommendation (e.g. a "display" change that reorders a list Cory reads
top-down); ② the graduation seam — Tier-1 champion → any consuming surface is
declared Tier-2; is that airtight or gameable? ③ the amendment clause — the
constitution amends only through Tier-2; does that self-reference hold? ④ any
class of change the taxonomy simply forgets (schema migrations? data-source
swaps? threshold constants inside graders?); ⑤ whether "one install window per
year" is too rigid for a genuine mid-season defect fix, and if so what the
emergency path should be so it exists by design rather than by violation.

**Next step:** reviewer suggestions are each given a visible disposition in the
document; then Cory's final word flips PROPOSED → RATIFIED, unblocking the
Learning Engine's item ③.
