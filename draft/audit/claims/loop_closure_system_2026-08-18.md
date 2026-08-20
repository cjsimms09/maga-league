# CLAIM UNDER REVIEW — the loop-closing system (relay's design, A's verification)

**Author: A. Commissioned by the owner: "Make sure you see relay's note on
closing the loop! Verify it, make sure it's as good as it should be, no
holes." I verified it and fixed three holes before sending it to you — so
your job is to find what I MISSED, not to re-find what the commit message
already lists.**

## What the system is

The owner's complaint (2026-08-18, verbatim in the files): *"Still don't
think we are making predictions, grading and closing the loop. No one is in
charge of it."* The relay's answer is a three-part mechanism, all in CI:

1. **`PREDICTION-LEDGER.md`** — every prediction as a table row: id,
   prediction, made date, owner, grade-by date, status
   (OPEN/GRADED/ABANDONED), result, and a *what changed* cell.
2. **`draft/tools/prediction_ledger_check.js`** — fails the build on: an
   OPEN row past its grade-by date · a GRADED row with an empty *what
   changed* cell (`NOTHING — <reason>` passes, silence does not) · a row
   with no owner or no date · duplicate ids · the OPEN backlog dropping
   below 6 (a ledger satisfied by grading everything and filing nothing is
   the program quietly ending) · and, since today, unparseable
   prediction-looking rows and unknown statuses.
3. **`draft/tests/prediction_ledger_check.test.js`** — 30 checks, most of
   them fail arms that feed the checker synthetic ledgers and assert it
   REFUSES (the repo's "a gate nothing has watched fail is theatre" rule).

Adjacent, same discipline: `register_recheck_check.js` (defect rows),
`commitments_check.js` (dated commitments, its test wired into CI today),
`routes_response_check.js` (inbox closure rates).

## What I verified and fixed today (do not re-report these)

Each hole was demonstrated against a working control before fixing:

- A `|` in row prose split the row into ≠8 cells and `rows()` silently
  skipped it — an overdue prediction could vanish from the ledger with no
  trace (the zero-rows guard fires only when EVERYTHING vanishes). Fixed:
  escaped-pipe-aware split + `lostRows()` making any P-id line that fails
  to parse a named build failure.
- `YEAR` is pinned 2026, so a January grade-by (P19 grades fortnightly into
  January) read as eight months overdue on filing day. Fixed: a grade-by
  earlier than its own made date rolls to the next year.
- A status outside the vocabulary (e.g. `DEFERRED`) matched no rule — a
  past-due row produced zero problems and left the loop. Fixed: unknown
  status is a build failure.

## What the author asserts (verify with YOUR OWN runs)

- `node draft/tests/prediction_ledger_check.test.js` → 30/30.
- `node draft/tools/prediction_ledger_check.js` → OK on the live ledger
  (81 rows, none overdue, every grade carries a consequence).
- Both run in `.github/workflows/ci.yml`, so a violation reddens main.

## Where to press — the questions I could not settle myself

1. **Can a row still leave the loop without tripping anything?** I closed
   pipe-loss, unknown status, and missing dates. Is there another exit —
   HTML comments, a second table with a different width, id formats my
   `^\**P\d+\**$` matcher misses, whole-table deletion (git history keeps
   it, but nothing pins a minimum row count — is that a hole or hygiene)?
2. **The consequence check reads for NON-EMPTINESS only.** "Updated the
   doc" satisfies *what changed* without changing any behavior. Is there a
   mechanical improvement that does not collapse into judging prose, or is
   this correctly left as a human call?
3. **The MIN_OPEN=6 floor** can be satisfied by six junk hypotheses. Same
   question: mechanically improvable, or correctly human?
4. **The made-relative year rollover**: any date pairs where it produces
   the wrong year silently? (Rows are only ever filed with made = today.)
5. **Grade-by date moves are unaudited.** Editing a date backward needs a
   reason by convention, but nothing mechanical notices a date that
   silently moved. The register checker has a "recheck WAS" discipline;
   the ledger does not. Worth porting, or over-machinery?

## Scope

The SUBJECT is `draft/tools/prediction_ledger_check.js`, its test file, and
the `PREDICTION-LEDGER.md` contract (header + table). Everything else in
the diff is context. Findings triaged by A tonight; the draft is 08-22.

---

# RESPONSE TO REVIEW — run 32179350309, verdict ACCEPT_WITH_REQUIREMENT (gpt-5)

**The critical finding was real and is fixed in the commit that carries this
section.** The status vocabulary check was a substring regex, so
`ABANDONMENT`, `GRADED-LATER`, and `REOPENED` read as valid — exactly the
"word nobody agreed on, treated as an exit" defect I had claimed to close,
one layer down. The reviewer's proposed bare equality is wrong in the other
direction (8 live rows legitimately read "✅ GRADED 08-18" / "**GRADED —
TRUE**", measured by census before choosing the rule), so the shipped rule
is FIRST-LETTER-TOKEN equality: strip emphasis, take the first token
containing letters, require it to equal OPEN/GRADED/ABANDONED exactly. All
three of the reviewer's named costumes now fail; both live decorations pass.
Every status read in the checker (overdue, consequence, minOpen count,
successor rule) now goes through the same `statusWord()` — one semantics,
not two. Tests: the reviewer's three cases as fail arms + a decorated-status
control, suite 47/47.

On the NOT_PROVEN items: the prediction-ledger test and tool both run in
`.github/workflows/ci.yml` (the "Prediction ledger" step) — it predates this
diff, which is why the reviewer could not see it; and the "30/30" count in
the claim was the pre-merge suite, now 47 after the relay's concurrent
hardening (cadence rule, successor rule, parseDate year-guard) merged with
mine.
