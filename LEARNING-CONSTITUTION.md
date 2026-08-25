# THE LEARNING CONSTITUTION — ⚠️ PROPOSED, NOT RATIFIED

**Status: PROPOSED 2026-08-24.** This taxonomy was proposed to Cory on
2026-08-24 and he directed the audit path: *"Agreed with your write up, but
let's send to open AI auditor first and act on their suggestions."* **That
sentence directs a process; it is not approval of this document's content —
nothing here evidences Cory's agreement until checklist item ③ below is
checked, in a commit he can be quoted on.** (Wording scoped down 2026-08-25 at
the independent reviewer's required action ①.) Ratification requires: ① the
independent reviewer's suggestions acted on, ② Cory's final word. Until both,
nothing cites this file as authority.

This is the missing document the Learning Engine spec (PARKED.md item 10, filed
2026-08-08) depends on: its item ③ says *"the Annual stays the ONLY path from
proposal to installed change for Tier-2 items; Tier-1 auto-installs through the
gates; Tier-0 flows freely"* — and no file ever defined the tiers. This one does.

**The question this answers:** which changes can the system adopt by itself,
which only after passing preregistered tests, and which require Cory in January?

---

## TIER 0 — FLOWS FREELY (no gate, no approval)

Anything that changes what is **shown or recorded** but never a recommendation.

* Confidence chips/tiers moving as evidence accumulates (louder when right,
  quieter when wrong) — the display of certainty, never the advice itself.
* New captures, new descriptive statistics, new ledger kinds.
* Copy, explainers, provenance labels.

**The test for membership:** fully reversible, no money or start/sit decision
rides on it, and removing it changes no recommendation anywhere.

**The effect-based rule (added 2026-08-25 at the independent reviewer's
required action ②):** membership is judged by EFFECT, not by label. **Any
change that can alter the ORDERING, FILTERING, DEFAULTS, or SALIENCE of
content on a decision surface — any page or tool a manager consults to make a
start/sit, waiver, trade, keeper, or money decision — is Tier-2, however
"display only" it is.** A re-sorted list Cory reads top-down IS a changed
recommendation; a default he has to opt out of IS advice; a chip made louder
steers the eye the same way a number would. This is the loophole the claim
file invited attack on (seam ①), and the reviewer confirmed it was open.
When in doubt about a UI change's tier, it is Tier-2.

This narrows the first bullet above, deliberately: the confidence-chip
MECHANISM (the evidence→loudness mapping, and where chips appear) is itself a
change to salience on a decision surface, so INSTALLING or ALTERING that
mechanism is Tier-2. What stays Tier-0 is chips **moving under an
already-ratified mapping** as evidence accumulates — the data flowing through
an approved pipe, not a new pipe.

## TIER 1 — AUTO-INSTALLS THROUGH THE GATES (machine-adoptable, bounded)

The weekly blend's **champion arm and its weights — only among PREREGISTERED
arms**, via the machinery Cory already ruled on:

* Promotion: 3-of-4-week wins **and** clears the best-of-K null
  (`ADAPTATION-POLICY.md` / `decide_promotion()`).
* Demotion: QUICK-KILL benches a decaying champion automatically (register
  199's gap — the policy calls it automatic; the implementation must exist
  before Tier-1 is live, not after).
* Bounds: no arm outside the preregistered set, no weight outside its declared
  range, ever. An unregistered arm winning a week is a reason to preregister
  it, never to install it.

**Why this is safe:** nothing Cory acts on in 2026 consumes the weekly arm —
it is the "search wide, ship narrow" sandbox by design. **The moment any
decision surface consumes the weekly arm, that consumption is itself a Tier-2
change.**

## TIER 2 — THE ANNUAL ONLY, CORY'S SIGNATURE ONLY

Anything that changes **a number Cory acts on**:

* Engine draft weights (`MEASURED_WEIGHTS`), the roster-shape terms and their
  weights (P344), board construction, replacement anchors.
* Keeper policy.
* Any signal ENTERING production — a Tier-1 champion graduating into anything
  a tool recommends from.
* Any change to THIS document's tier boundaries (the constitution amends only
  through its own strictest tier).

**The path:** the January synthesis (P345, due 2027-01-15) presents what was
learned, what is proposed, what was retired — **and the honest count of
hypotheses that DIED, because a learning system that only ever adds is
memorizing, not learning** (the spec's own words). Cory signs or it does not
ship. One install window per year.

## PROVENANCE RIDES EVERYTHING (spec §2b, unchanged)

Machine-generated hypotheses are tagged as such; the Annual reports machine vs
human hit rates **separately, as rate WITH n** (a scanner at 2/60 and a human
at 2/3 share a numerator and mean opposite things), and both streams face
IDENTICAL gates — else the comparison measures gate leniency, not hypothesis
quality.

---

## REVIEWER DISPOSITIONS (independent review, 2026-08-25)

Reviewed at commit `7da1ac08` against base `4313a3db` (workflow
`independent-review.yml`, run 32799001640, artifact `independent-review`).
**Verdict: ACCEPT_WITH_REQUIREMENT.** Every finding, with its disposition:

| # | finding | disposition |
|---|---|---|
| R1 | **REQUIRED:** the claim that Cory "agreed in principle" is not evidenced — a document quoting itself is not an approval artifact. Scope it down or add signed proof. | **ADOPTED.** Status header reworded 08-25: his sentence directs a process, it is not content approval; the only approval artifact will be the checklist-③ commit. Same scope-down applied to the claim file's "What it proves". |
| R2 | **REQUIRED:** Tier-0 has a loophole — a "display only" change that alters ordering, defaults, or salience on a decision surface moves recommendations in substance. Add an effect-based rule under the membership test. | **ADOPTED.** The effect-based rule now sits under Tier-0's membership test: ordering / filtering / defaults / salience on any decision surface = Tier-2, doubt resolves to Tier-2, and the confidence-chip bullet is explicitly narrowed (mechanism = Tier-2, movement under a ratified mapping = Tier-0). |
| R3 | NOT_PROVEN: Tier-1's predicate "no 2026 decision surface consumes the weekly arm" is a factual claim about the codebase, unverified. | **VERIFIED 08-25 rather than asserted:** `src/weekly_player_projection.js` is consumed only by `player-projection-cron` (emits), `grade-cron` (grades) and `claims-cron` — no route or view reads the arms; grep of `src/routes/`, `views/`, `server-app.js` returns zero consumers. Recording and grading are Tier-0 activity by this document's own test. **This check must be re-run at any point a surface starts consuming the arm — which is itself the Tier-2 event named in Tier-1's last sentence.** |
| R4 | NOT_PROVEN: QUICK-KILL's existence (register 199). | **CONFIRMED STILL MISSING, and that is what the document says:** register 199 is 🔴 OPEN — `weekly_own_grade.py` has 49 mentions of `promot` and zero of bench/demote. The constitution treats it as a hard precondition: Tier-1 is not live until it exists. No edit needed; the gap is load-bearing text, not an oversight. |
| R5 | NOT_PROVEN: paraphrase fidelity of ADAPTATION-POLICY / PARKED quotes (out of review scope). | **ACCEPTED AS RESIDUAL RISK, with the sources named:** the quoted rules live in `draft/ADAPTATION-POLICY.md` and PARKED.md's release manifest; readers verify there, and any drift found is a defect-register row against this file. |
| R6 | UNKNOWN: the preregistered arm list and declared weight ranges are not enumerated here. | **DECLINED to inline, with reason:** the arm registry belongs to `BLEND-SEARCH-DESIGN.md` / the preregs, and duplicating it here would create a second copy that rots (the entry-file lesson, DRAFT-2026-LESSONS.md §17). Tier-1's bound is "no arm outside the preregistered set" wherever that set is authoritatively kept. |

## RATIFICATION CHECKLIST

- [x] Independent review dispatched at this document's diff (claim file:
      `draft/audit/claims/learning_constitution_claim.md`) — run 32799001640,
      verdict ACCEPT_WITH_REQUIREMENT
- [x] Reviewer suggestions acted on, each with a visible disposition — the
      table above, 2026-08-25
- [ ] Cory's final word
- [ ] Status line above flips to RATIFIED; the Learning Engine's item ③
      becomes buildable and PARKED.md's flag closes
