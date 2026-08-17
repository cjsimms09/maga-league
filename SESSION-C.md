# SESSION C — the external-ingest lane (read this first, every time)

> **📣 READ `DRAFT-WEEK-BRIEF.md` BEFORE THIS FILE** (2026-08-17; draft is 08-22).
>
> **Your inbox is `ROUTES.md` → `## TO: C`.** As of 2026-08-17 it holds **7 open
> items and 3 closed** — closed ones are now ticked `- [x]`, so you can read the
> open ones without reading all ten. Three of the seven are questions only your
> egress machinery can answer.
>
> **One of them is already answered and you should NOT redo it:** the request for
> per-player season component stats (2022-25 QBs) was satisfied without your
> lane — the nflverse release host turned out to be reachable from the sandbox,
> so `component_stats_{2021..2025}.json` and `vegas_lines_2021_2026.json` are
> committed already. It is ticked. The `spread_line`/`total_line` column question
> is likewise closed for $0.
>
> **Still genuinely yours and still wanted:** a weekly-points store for **2022**
> (and 2021) — `nflverse_weekly_points_2022.json`. Its absence is the single
> reason the pace study could not build a second grading fold, and every
> own-model artifact grades exactly one season for the same reason. Not urgent
> before the 22nd; genuinely valuable after it.

_Resume ritual: **"You are session C, read SESSION-C.md and STATUS.md, then continue."**
Files are truth, not memory. A rule changes HERE, in the commit that changes the
behaviour — never only in chat._

---

## WHY THIS FILE EXISTS AT ALL (2026-08-17)

**Your territory has been declared since 2026-08-11 — it was just not where you
boot from.** A reads `SESSION-A.md`, B reads `SESSION-B.md`, and C read nothing,
because C's charter lives at `TERRITORY.md` § *"🅲 SESSION C — THE EXTERNAL
INGEST"* — 411 lines into an 87 KB file. A lane whose rules are only reachable by
knowing where to look is a lane that will be improvised.

**This file is a POINTER, not a copy.** `TERRITORY.md` stays the authority on
what you own; duplicating it here would create two descriptions that drift apart,
which is the single most common defect this repo finds in itself. If the two ever
disagree, `TERRITORY.md` wins and this file is the bug.

## THE SHORT VERSION OF YOUR LANE

Read `TERRITORY.md` §C for the binding text. In brief:

**You own** MFL league discovery, the ADP-snapshot fetch, the player crosswalk at
scale, the replay harness, attrition reporting, and nflverse ingest — **the
ingest modules, their tests, and the CI workflows that run them.** Enumerated by
file in `scripts/territory-check.sh` under `c_owns()`.

**Named by file, not by directory, deliberately.** `draft/backtest/` also holds
the market layer and every experiment, which are A's. A directory rule would hand
you two thirds of A's lane by accident.

**You do not own** the engine, the Lab, valuation, the ledger, config, the app,
any view — **and you do not deploy.** A owns integration and deploys.

**A owns the ingest's CONSUMERS.** Anything in the Lab that eats what you produce,
and the graduation gate an external finding passes through. **You produce the
data; A decides what it means.** That is why `graduation_gate.py` is A's even
though it is the first thing your output meets.

**If your work needs a change in A's or B's lane**, park a precise request in
`PARKED.md` — file, function, shape needed, and a test it should satisfy. Same
contract A and B use. `scripts/territory-check.sh` will refuse a trespass by name.

**You cannot merge yourself.** A runs
`bash scripts/integrate.sh <your-branch> C`, which verifies from YOUR perspective
that the branch touched nothing outside your lane, runs both suites, then merges.

## THE ONE HABIT THAT MATTERS MOST IN THIS LANE

**Absent is absent.** You are the lane that decides what a missing upstream row
means, and every defect this project has found in your kind of work came from
answering that question implicitly:

- a field written as `0` when the truth was "no data" reads as a measurement;
- a join that silently drops unmatched rows reports a clean number over a
  shrunken population;
- a refusal threshold set far below anything ever observed is decoration.

All three were found here on 2026-08-17 — see
`draft/audit/coverage_guard_sweep_2026-08-17.md` and
`draft/audit/routes_position_source_2026-08-17.md`. **The routes one is the
cautionary tale for your lane specifically: a whole season was recorded as
"nflverse has not published it" when the file was served and it was our position
lookup that 404'd. A gap of ours, filed as a gap of theirs, unexamined for days
because the explanation was already written down.**

When a fetch comes back short, write down the count, the reason, and the check
that would distinguish "they have not published" from "we asked wrong."
