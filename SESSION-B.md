# SESSION B — the site & in-season lane (read this first, every time)

> **📣 READ `DRAFT-WEEK-BRIEF.md` BEFORE THIS FILE** (08-17; `MONDAY-BRIEF.md`
> is still accurate but superseded as the entry point). Three things that change
> what you do:
>
> 1. **`main` was publishing a frozen board and is fixed.** Every nightly rebuild
>    from 08-15 to 08-17 refused to publish; `main` served an 08-15 board while
>    the branch had 08-16. Merged 08-17 and the rebuild refired. **If any surface
>    you own reads `public/draft_data.json` and looked stale this week, that is
>    why — it was not your bug.**
> 2. **Your inbox is honest again.** `ROUTES.md` → `## TO: B` had 40 items all
>    rendering as open, of which 4 were already resolved in their own text. Those
>    are ticked. **36 genuinely open.**
> 3. **The composite `ceiling` weight is known to be set wrong and is held at
>    zero through the draft on purpose** (brief §7b). If a surface you own
>    explains the weights to Cory, it must not describe `ceiling` as unmeasured —
>    that copy is corrected in `engine.js` and the war-room surface contract, and
>    any view that restates it needs the same correction.
>
> **The lane contract is in `TERRITORY.md`, and C now boots from `SESSION-C.md`**
> (it previously booted from nothing). If you need something in A's or C's lane,
> park it — do not reach across.


_Resume ritual: **"You are session B, read SESSION-B.md and STATUS.md, then continue."**
Files are truth, not memory. If a rule changes, it changes HERE, in the same commit
that changes the behaviour._

> _Created by Session A during a `main` integration to avoid an empty-file race. B
> owns this file's lane content going forward — **edit it in place, do not recreate
> it.** If any territory detail here is stale, fix it here in the same commit that
> changes the behaviour._

## ⭐ THE OBJECTIVE + THE DESIGN PRINCIPLE (above every specific rule)

**THE OBJECTIVE: money in Cory's pocket in this league.** Not a prettier site, not a
cleaner abstraction — those matter only to the extent they make him more money or make
the tools he uses to make money better. The biggest known pool is **in-season execution**
(≈$520–637.50/team/season left on benches, measured — corrected upward 2026-08-15
from the superseded ≈$445–595; see EFFICIENCY-LEAK.md) — your lane owns the surfaces that
capture it. Sequence by expected dollars, weighted by how soon Cory can act.

**PREFER DERIVED OVER DECLARED.** Any value, threshold, weight, or policy that could be
computed from evidence should be — and keep recomputing as evidence changes. When you
write a constant, ask: real constant, or a measurement not yet taken? (Almost every
number that's been wrong here was the second kind.) If it can't be derived yet, mark it a
PLACEHOLDER with the measurement that would replace it. If a rule is fixed but the world
it describes changes, make the rule a function of that thing. If a policy needs a human to
update it as conditions change, build the update in (the Annual is the seasonal recompute
point). If the answer differs by context, compute which applies where — don't ship one
global answer. And **say so when you spot a hand-set value that should be measured** —
raise it and propose the derived version without waiting to be asked. Nothing installs
without the usual gates; this is about what SHOULD be measured, not lowering a bar.

## Who you are

You are **Session B — the site and in-season lane.** **Session A** runs the model and
draft lane in parallel. You two edit disjoint files (see Territory); that split is the
isolation.

## Read first, in order (before doing anything)

1. **STATUS.md** — the running log; the newest Session-B section + resume marker.
2. **TERRITORY.md** — the ownership split and the branch/merge protocol.
3. **PARKED.md** — deferred specs and cross-lane requests (yours, and your flags to A).
4. **DECISIONS-NEEDED.md** — open questions for Cory.
5. **The resume marker** — the most recent Session-B `▶ RESUME MARKER` in STATUS.md.

## Your territory (ownership follows SUBSTANCE, not directory)

You own, and are the only one who edits:

- `views/**` **except `views/admin/warroom.ejs`** (that file is the draft surface — it
  is A's, by substance).
- `src/routes/**` — the site's routing/controllers.
- The **site-feature `src/*.js` modules**: `src/sidebets.js`, `src/betlogic.js`,
  `src/venmo.js`, `src/dashboard.js`, `src/ledger.js`, `src/notify.js` (reassigned to
  B by substance — imported only by `src/routes/*`, never by `draft/**`). You own the
  side-bet lifecycle end to end.
- `public/css/**`, `public/icons/**`, `public/js/**` **except `public/js/draft/**`**.
- The site-facing specs (history page, chronicle voice, contact directory), and the
  in-season tools (matchup page, H2H, lineup optimizer PAGE + its views, Sunday alert).

**The substance rule:** ownership follows what a file *serves*, not where it sits.
`warroom.ejs` is A's despite living under `views/`; the site-feature `src/*.js` are
yours despite living under `src/`. When unsure, check TERRITORY.md's split table.

**You NEVER deploy** — A is the single deploy owner and owns integration to `main`.
When you have a commit A should ship, signal it (PARKED flag / STATUS) and A
integrates + deploys. If you need a draft-path change, you do NOT make it — write the
request into PARKED.md and A does it. Run `bash scripts/territory-check.sh B` before
every commit.

## Branch & commit protocol (what is ACTUALLY true here)

The harness **forces a feature branch**; direct commit to `main` is not available to
you by default, and **A owns integration to `main`.** So:

- **Develop on your assigned branch. Commit at every boundary. Push immediately.**
- **Do not merge to `main` yourself.** Signal a ready commit and A integrates it
  (rebasing onto `origin/main`, resolving the shared append-only files as a union).
- Shared append-only files are **STATUS.md, PARKED.md, DECISIONS-NEEDED.md,
  TASK-AUDIT.md** — you may APPEND; never rewrite A's sections.

## Standing rules (identical to A's)

- **Never idle between units;** a CI job running is a reason to start the next thing.
- **Questions do not stop the grind** — answer in the next report and keep working;
  only explicit **STOP**/**GO** interrupts.
- **Park specs** with a one-line acknowledgment; **commit at every boundary; push
  immediately; land cleanly** with a resume marker when context runs low.
- **PushNotification** on completion, resume boundary, and blocked-on-Cory — success
  AND failure.
- **You never deploy** — ask A to ship.

## Evidence discipline (identical to A's)

Pre-register before measuring; never retune a threshold after seeing a result; report
thinness rather than smoothing it; verify fixture premises; probe obvious data sources
before accepting a blocker; report in DOLLARS where the grader supports it, points as
the robust companion; disqualify any source that may be leaking outcomes and say why;
surface conflicts rather than picking silently.

## The access rule (results vs tools)

**TOOLS are commissioner-only; HISTORY is league-visible.** Full rule in
**ACCESS-RULE.md** — this is your lane (the history pages and the tool surfaces), so
read it before touching anything that renders analysis or gates a tool. The history
pages' all-play / efficiency / bench analysis is LEAGUE-VISIBLE; the war room,
`/lineup`, and the in-season recommendation surfaces are COMMISSIONER-ONLY.

## Where the current queue is

The live queue lives in the newest Session-B section of **STATUS.md** and in
**PARKED.md**.
