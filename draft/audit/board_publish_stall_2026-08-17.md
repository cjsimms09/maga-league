<!-- TERRITORY: A -->
# THE BOARD `main` PUBLISHES HAS BEEN FROZEN SINCE 08-15. THE DRAFT IS 08-22.

**Found 2026-08-17**, by checking whether the nightly pipeline was healthy rather
than assuming it. Nothing prompted the check.

---

## THE FACTS

| | |
|---|---|
| last successful publish | **2026-08-15T17:49Z** (`workflow_dispatch`, `main`) |
| board live on `main` | built **2026-08-15T17:52:22Z**, 677 players |
| scheduled runs since | 08-16 08:37Z, 08-16 13:33Z, 08-17 08:52Z — **all failed** |
| where they failed | step 14, *"Acceptance gate on the FRESH board"* |
| what still worked | build (694 players), diagnosis, refused-board artifact, issue #8 |

**The gate is not the bug.** The board builds correctly every night; the gate
refuses it, the commit step is skipped, and the previously published board stays
live. That is the designed behaviour and it is right.

**The alerting is not the bug either.** `draft-data.yml` opens
*"🔴 Board rebuild refused to publish"* (issue #8) and comments on it every night
it refuses. It did. For two days nobody read it.

## THE TWO REFUSALS

```
assert 1.3813125 <= 1.35
FAILED test_core_needs_no_reviewer.py::test_NO_WORKFLOW_MAKES_A_MODEL_JOB_DEPEND_ON_THE_REVIEWER
assert not ['config-check.yml']
```

1. **The ADP-sd band ratchet.** The ratio is fitted over the day's *freshly
   fetched* FFC dispersion against a calibration from 08-14. The market
   tightened; the board is not wrong. It refuses the market for being NEW.
2. **`config-check.yml`** — a read-only, dispatch-only key probe that names every
   configured secret, read by a grep heuristic as a reviewer dependency.

## THE REPAIR IS A MERGE, NOT A CHANGE

**Both were already fixed on `claude/fantasy-football-research-926y6z`, and had
been for a day.** The band test is `repo_parity`-marked with its reasoning in
place; `config-check.yml` is exempted with its reasoning in place. What actually
separates the two branches is one line:

```
this branch   python -m pytest draft/tests -q -m "not repo_parity"
main          python -m pytest draft/tests -q
```

The `-m "not repo_parity"` deselection was added here on 08-16 and never merged.
`main` therefore runs the parity pins inside the publication gate, which is
exactly what they are not for.

**A merge to `main` unblocks the nightly rebuild. No new code is required.**
That merge was NOT performed by the session that found this — pushing to `main`
was outside its authorization, and a merge five days before a draft is a human's
call.

## WHAT THE FREEZE COSTS, MEASURED

Frozen board vs the next one built, inside the top 200: **2 of 201 players moved
10 or more ADP spots.** One day of drift is small — but both movers fell off a
cliff, which is the dangerous direction:

| player | frozen ADP | current ADP | move |
|---|---|---|---|
| **John Metchie** (WR) | 120.6 | 364.2 | **+243.6** |
| **Miami Dolphins** (DEF) | 187.8 | 338.2 | **+150.4** |

A stale board does not merely lag — it offers those two at a price the market has
withdrawn. The cost compounds daily until 08-22.

## THE GUARD ADDED, AND WHAT IT DOES NOT DO

`draft/tests/test_published_board_is_not_stale.py`. Every session runs pytest;
none reads the issue tracker. A staleness fact that lives only in GitHub is a
fact nobody encounters while working.

**It is `repo_parity`-marked, and that is the load-bearing decision.** The
publication gate deselects that marker, so this check can never block a rebuild —
which would guarantee the thing it warns about (*the board is stale, therefore we
may not replace it*). `draft-data.yml` learned that on 08-14 and says so in its
own comment. It runs in the nightly ADVISORY step (full suite,
`continue-on-error: true`) and in every ordinary local run.

**HONEST LIMIT: it would not have caught this today.** At a 3-day threshold,
`main`'s 08-15 board goes red on **08-19**, the fourth day of the stall. Tighter
would fire on ordinary timing and get widened, which is how a ratchet becomes a
rubber stamp. So this is a **backstop that guarantees discovery from inside the
normal workflow within three days** — not a replacement for the issue the
workflow already files, which fired correctly and immediately.

The check is proven to fire: a known-positive control runs it against the real
dates of this stall.
