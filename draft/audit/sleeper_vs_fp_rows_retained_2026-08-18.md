# THE DISPATCH EVERYONE IS WAITING ON WOULD HAVE THROWN THE ROWS AWAY A THIRD TIME

**Relay, 2026-08-18. Territory: A owns the study; the relay found this and wrote
the retention. A rules on whether to keep it.**

---

## 1 · WHAT I WENT LOOKING FOR

Register rows **20b** and **21** both came due today and both carry the same
unblock sentence: *"unblocked by the per-player fetch (row 24), owner C."*
Before moving their dates I wanted to know one thing — **if A dispatches
`sleeper-vs-fp-grade.yml` tomorrow, are 20b and 21 unblocked?**

The answer is **partly, and the missing part is recoverable only by another
dispatch.**

---

## 2 · THE FINDING

`draft/backtest/sleeper_vs_fp_grade.py` fetches per-player projections for three
arms — Sleeper, FantasyPros (re-fetched and crosswalked to Sleeper pids), and
own_v6 — holds them in memory as `{player_id: points}` dicts, grades them, and
writes **only aggregates**:

```
out = { "_territory", "_prereg", "_licensed_by", "_limitation",
        "result": { cells, error_correlation, weights, winners,
                    blend_vs_better_parent, population,
                    arms_present, arms_absent, fetch_diagnostics } }
OUT.write_text(json.dumps(out, indent=1))
```

**No per-player row survives.** The workflow then commits that one file.

This is the third time. `proj_mean_blend` §9.2 asked a future egress run to
**retain them**, in as many words. Two runs have been dispatched since —
`sleeper_hist_proj` (08-16) and `exp_fp_hist_proj` — and register row 24 already
records what a walk of both artifacts finds: per-player lists appear **only
inside the leak gates' own marker checks — 4, 2 and 2 players, and 1 per year.**
27 KB and 11 KB of verdict, populations gone.

**Why that is expensive rather than untidy:** the sandbox proxy answers
`www.fantasypros.com` **403** and `api.sleeper.app` **000**. A row not written in
CI cannot be recovered from here at all. It costs another CI dispatch — and the
whole reason this workflow is `workflow_dispatch`-only is that it is *"a
QUESTION, not a feed"*.

**So, precisely:**

| row | what it needs | delivered by the dispatch as it stood? |
|---|---|---|
| **24** | the three-way 2025 verdict | ✅ yes — aggregates are exactly what it asks for |
| **21** | a source-policy **ruling** — Sleeper vs FP vs blend | ✅ yes — the verdict is the evidence, Cory rules |
| **20b** | the rows, to **reconstruct the blend arm** `proj_mean_blend` refused for `no_control` | ❌ **no** — graded in-process, then discarded |

---

## 3 · THE FIX

`retained_rows()` — pure, and deliberately so: **it copies, it does not
compute.** Every value it writes already existed before `grade()` was called, so
retaining them cannot move a number in the verdict.

It writes a **second** artifact, `sleeper_vs_fp_rows_2025.json`. Separate on
purpose: `sleeper_vs_fp_grade.json` stays the verdict — small, readable, the
thing a human opens — and this is the evidence under it. Nothing in the grade
reads it back.

**One design decision worth naming.** It stores the shared population
**beside** the full per-arm row sets, not instead of them:

- store only the intersection → this run's arm list is baked into every future
  re-grade, and a later Sleeper-vs-FP question inherits own_v6's holes for no
  reason;
- store only the full sets → nobody can reconstruct which players *this* verdict
  was computed on.

Both, therefore, and named. `test_the_shared_population_is_stored_BESIDE_the_full_rows_not_instead`
pins it with an own_v6 arm covering 10 of 80 players.

The write is wrapped: **a failure retaining rows must not lose the verdict that
was just written and cannot be re-fetched.**

**Five new tests** (`test_sleeper_vs_fp_grade.py`, 16 → 21, all passing):

1. rows retained for every present arm, keyed by player, valued by points
2. **CONTROL — retention cannot move a graded number.** Grade, retain, grade
   again, demand byte-identical verdicts. This is the entire safety argument for
   touching a preregistered study four days before a draft: it is an extra
   output file, not a change to the study.
3. an absent arm is named absent, **not written as `{}`** — an empty dict reads
   as *"we asked and got nothing for everyone"*, which is a measurement, and it
   is not one
4. shared population stored beside the full rows
5. **the workflow actually `git add`s the file** — a retained row CI does not
   commit is a discarded row with extra steps, which is precisely how the
   previous two runs lost theirs

Workflow: `git add draft/backtest/sleeper_vs_fp_rows_2025.json` added beside the
verdict, inside the existing `GITHUB_REF_NAME == main` guard. **No change to any
metric, threshold, population rule or decision rule. The preregistration is
untouched** — it fixes the *rules*, and no rule moved.

---

## 4 · GATES RE-RUN, BECAUSE THE WORKFLOW REFUSES TO FETCH IF THEY FAIL

The job runs two pre-fetch gates before it asks anything of the network — and it
distinguishes *"the gate failed"* from *"the gate could not run"*, which is the
right distinction. Both re-run from the repo root at the paths the workflow uses:

```
python3 -m pytest draft/tests/test_sleeper_hist_proj.py \
                  draft/tests/test_sleeper_vs_fp_grade.py -q
54 passed in 0.42s
```

**The dispatch is ready. Nothing here blocks it, and the ask on A is unchanged
and unchanged in urgency: dispatch it FROM `main`.** From any other ref the
answer prints to the step summary and is deliberately not committed — the
workflow says so itself — so the fetch is spent and the verdict is lost.

---

## 5 · TWO THINGS I GOT WRONG, AND WHY THEY ARE IN THIS FILE

Mid-investigation I believed I had found two much larger defects, and **both
were false.** They are recorded because the *reason* they were false is the one
Rule 3e names, and it produced a textbook pair of false negatives:

1. *"The workflow's gate names `draft/tests/test_sleeper_hist_proj.py` and that
   file does not exist — the job dies before the fetch, every time."*
   **False. The file exists, 19,686 bytes, committed in `e1baf909`.**
2. *"`sleeper_hist_proj.py` is at the repo root, not on the script's `sys.path`,
   so the Sleeper arm raises inside its own `try/except` and the study named
   'Sleeper vs FantasyPros' runs without Sleeper."*
   **False. It is at `draft/backtest/sleeper_hist_proj.py` and all nine imports
   resolve.**

**Both came from the same cause: the persistent shell still held a `cd
draft/backtest` from an earlier command.** `find . -name '*sleeper_hist_proj*'`
searched the wrong tree; `git log -- draft/tests/…` resolved its pathspec
relative to the wrong directory and printed nothing; `pytest draft/tests/…`
reported *file or directory not found*.

**Three probes, three clean "no"s, all wrong.** This is exactly the shape Rule 3e
was written for — *"nothing found" and "asked wrong" are indistinguishable from
the outside* — and the thing that caught it was cheap and boring: re-running each
probe with `pwd` printed first, and an `ls` of the positive control. It cost
about two minutes and it stopped me filing two fabricated P0s against A's study
four days before the draft.

---

## 6 · RULE 3g — WHAT ELSE DOES THIS MEAN

**Does it imply another failure we have not looked for?** Yes, and it is the
general form: **this project has a habit of grading in-process and committing
only the verdict.** Three egress runs, three discarded populations, against a
standing written instruction to retain. Worth a sweep of every artifact produced
by a `workflow_dispatch` study — not before 08-22.

**Does it invalidate something we already trust?** No number. It does invalidate
the *plan*: rows 20b and 21 were both annotated *"unblocked by the per-player
fetch"*, and for 20b that would have been false the morning after the dispatch,
with the fetch already spent.

**Is it routed to the lane that can act?** Yes — A, who owns the study and is the
only one who can dispatch from `main`. The code is written and tested; A's action
is unchanged: **dispatch it.**

---

*Guarded by `draft/tests/test_sleeper_vs_fp_grade.py` (21 checks). Register rows
20b, 21, 24.*
