# FULL TASK AUDIT — 2026-08-08 (for chat-Claude review)

Point-in-time snapshot pulled from STATUS.md, DECISIONS-NEEDED.md, `docs/queued/`, and git state. Files are truth, not memory.

---

## 1. IN FLIGHT
- **Part 2 §2 — the zoned layout** (desktop three-zone + compare tray + density fixes). Part 2 **§1 (Paths panel)** is DONE (engine `computePaths` + render + chosen-path ledger, 221 engine / 69 robot green). §2 is the next build; it now absorbs two just-filed addenda: **B7 dollar-gap primitive** and the **visual-design directive** (money=gold, one-number-per-card, `frontend-design` skill, screenshot-before-robot-acceptance). Not yet started — several draft-critical interrupts (below) jumped ahead of it this session.

## 2. THE POWER-THROUGH QUEUE (exact order + status)
Draft-path items first; freeze at final mock.
1. DST fix — ✅ (32 DEF, R-DST green)
2. §D flow/safety (typed END-confirm, rehearsal watermark) — ✅
3. D3 flex-discount (installed + quantified at pick-34) — ✅
4. Two-analyst weekly-high cross-check — ✅ (zero disagreements)
5. A2 slot-verification machinery — ✅ (verified/site-claimed/manual, watermark, checklist, R-slot)
6. Part 2 §1 Paths panel — ✅ (computePaths + render + ledger, R-paths)
7. **Part 2 §2 layout (three-zone + compare tray + density + B7 + visual design)** — 🔄 IN FLIGHT (next)
8. Phase H shadow rosters — ⬜ (spec: `strategy-hunt-learning-seed.md`)
9. Opening-script machinery (regenerates on slot assignment) — ⬜
10. A-1 / A-2 / A-3 (prefs-sync, undo-everywhere, my-turn alert) — ⬜
11. **MOCKS-READY checkpoint — ping Cory** — ⬜ (the gate)
12. Part C draft-night (C-1..C-3) — ⬜
13. Part A (A-4..A-8) — ⬜
14. Part B draft-week ops — ⬜
15. Backtest R2 + Strategy Hunt S/N + **auto-adjuster tuning** (CI) — 🔒 (CI harvest completion)
16. In-season master (built now, activation-flagged) — 🔒 (awaiting season data)
17. D-1 recap → annual-button dry-run → 2c builds → E-behaviors — ⬜

**Draft-critical interrupts handled THIS session (jumped the queue, all ✅):**
- Slot-claim pipeline: site claim → config provenance ('site-claimed, Sleeper pending') + slot-value analysis (recommend highest open slot) — ✅
- Keeper-slate ID display bug → shared `PlayerRef` resolver (SSOT) — ✅
- Status Dashboard (`/admin/status`) — ✅

**Draft-critical, QUEUED next (spec filed):**
- **Keeper-placement verification** (heterogeneous keep 3/2/1/0, per-team round-1–3 classification, commissioner-placement reconciliation alarm, heterogeneous robot) — ⬜ `keeper-placement-verification.md`. Assumption-hunt already done: pipeline is per-team, no uniform rounds-1–3 bug.

## 3. CI / BACKGROUND (workflows on file)
Live run-state is on the Actions tab (linked from the Status Dashboard health strip). Workflows present:
- `draft-data.yml` — board rebuild + commit-back (the harvest/rebuild path)
- `analyse-drafts.yml` — draft analysis
- `backtest.yml` — backtest harness (Backtest R2 lives here)
- `data-inventory.yml` — nflverse/data reachability inventory
- `evidence-real.yml` — evidence bundle
- `self-audit.yml` — the Sunday self-audit (watchdog-for-watchdogs; E-1)
- `deploy-verify.yml` — deployed-vs-HEAD verification
- `site-check.yml` — site smoke
- `sleeper-check.yml` — Sleeper reachability (CI-only; egress-blocked from sandbox)
- `ci.yml` — test suite (JS + python)
**Outstanding CI harvest:** matchups×45, transactions, 2023 draft/bracket (item G, in flight); 2025 weeks 7–15 weekly-high winners (R2121/MarianSaar verification, pre-registered).

## 4. DECISIONS-NEEDED (awaiting Cory)
- **D1 — Backtest grading metric:** RESOLVED BY DATA; needs Cory's **acknowledgement** only.
- **D4 — Draft slot:** machinery BUILT (site-claimed provenance + Sleeper-verify auto-import); **blocked externally** on Sleeper draft-order assignment. Auto-resolves on placement.
- **D8 — IR config oddity:** low-priority; treat IR as 1 slot restrictive + a one-line in-season rejection check (that check not yet built — small).
- **3 open input placeholders** (needed for config, not blocking now): **2023 payout era** (did year-one use the current $400/$4,000 structure?), **pick timer** (untimed vs X-sec — `pick_timer=0` seen at source, confirm), **RS runner-up tiebreak** (set in `payouts.json`).
- (D2, D3, D6, D7 — RESOLVED.)

## 5. COMMITTED SPECS ON FILE (`docs/queued/`)
`annual-button.md` · `auto-adjuster-tuning.md` · `backtest-round-2.md` · `complete-backlog.md` · `in-season-master.md` · `in-season-rankings.md` · `keeper-placement-verification.md` · `league-history-page.md` · `money-function.md` · `part-12-watchdog.md` · `season-readiness-kit.md` · `strategy-hunt-learning-seed.md` · `war-room-final-pass.md` · `warroom-v2-B7-dollar-gap.md` · `warroom-v2-visual-design.md` · plus root `STATUS.md`, `DECISIONS-NEEDED.md`, `EVIDENCE-BUNDLE.md`, `TASK-AUDIT.md` (this file).

## 6. DEFERRED / GATED (with gates)
- **Part 12 watchdog build** (settings-hash with float-normalization) — `part-12-watchdog.md`; gated on build time.
- **Backtest R2 + Strategy Hunt S/N + auto-adjuster tournament** — CI-class; gated on the CI harvest completing + the shared replay harness.
- **In-season master** (waiver priority-economics, weekly brief, opponent capture) — built-now/activation-flagged; gate = **post-draft, ≥ Aug 23**, plus real season data.
- **League History page (Part F)** — post-draft idle-CI; gate = behind every in-season item; folds into the **Annual Button** (one January run, one PR set, hard ordering: corrections → then chapter).
- **September quantile-V** (exact E[$], BenchValue, dissolves the D3 flex approximation; all August dollar verdicts re-run and re-labeled) — gate = September + data.
- **2c advanced-data builds** (incl. FTN charting) — September.
- **Annual Button** (self-improve.md + workflow_dispatch + 4 season-end artifacts + rollover) — gate = January (dry-run buildable now).

## 7. RECENT COMPLETIONS (last 16, with commit refs)
- `db139fe` File 4 queued specs (B7, visual-design, keeper-placement, auto-adjuster)
- `a0929a4` Keeper-slate ID display bug → PlayerRef resolver (SSOT) + heterogeneous robot
- `b24d952` Slot-claim wiring (site-claimed provenance) + slot-value analysis
- `5a08a15` STATUS DASHBOARD (/admin/status)
- `c411e72` Sync audit CLOSED (2023 table, item-7 wk4 REJECTED, item 9 + settlement)
- `51b78d5` Strategy Hunt Phase $ money-grading refinements
- `8eaa1d4` Sync audit (on record vs missing)
- `464d144` League History banter voice + Annual-Button consolidation
- `a2f5538` Part 2 §1 Paths panel render + chosen-path ledger
- `68b5465` Part 2 §1 computePaths engine core
- `59bd6da` A2 slot-verification machinery
- `dfd1bdd` D3 pick-34 quantification + two-analyst cross-check
- `3b223cc` D3 flex-discount pricing
- `54504e4` League History Page spec (Part F)
- `6205b9d` Realized-dollars as top-level grading currency
- `127049a` Reconciliation pass: traceability matrix

## Flag — ordered but not in any file?
Nothing outstanding. Every directive this session has a commit or a filed spec: slot-claim (b24d952), keeper-ID (a0929a4), dashboard (5a08a15), Phase $ (51b78d5), League-History voice + Annual consolidation (464d144), B7 + visual-design + keeper-placement + auto-adjuster (db139fe). Two source-message **truncations** captured as best-effort and flagged for a resend: sync-audit **item 9** (captured = league-history spec ✅) and the **financial-settlement** description (captured into `annual-button.md` §1c(4)).

---

# CONSTITUTION AUDIT — SESSION B's READING (2026-08-11)

Requested by Cory, deliberately unmerged from A's. I did not write these rules and
several of them fired on my work rather than A's, which is the whole reason my
read is worth having separately.

**WHAT I COULD ACTUALLY READ: thirteen, not fourteen.** `origin/main:SESSION-A.md`
carries 1–8, 9, 10, 13, 11, 12. **Rule 14 does not exist on `origin/main` or on any
pushed branch** (I checked all nine). Cory quoted its content — *"a unit test of the
producer is the consumer the live path lacks"* — and a "silence rule", and neither
string appears anywhere I can reach. If they are in A's unpushed working tree, this
audit is missing them and the gap should be closed before anything is cut.

---

## QUESTION 1 — WHICH RULES ARE DOING WORK

### FIRED

**10 — break every new guard.** *By a wide margin the highest-yield rule in the
constitution, and it fires almost entirely on ME.* Nine instances in this session
alone, every one a check that looked fine:

| what broke | how it would have failed silently |
|---|---|
| `scope_agreement` #3 | matched a line, then returned a **hardcoded array** — would have passed whatever the source said |
| `week_walk` | a missing export threw a bare TypeError and printed **nothing**, hiding every later check |
| `sunday-alert.yml` | a Python heredoc inside an indented YAML block — the terminator can never match at column 0, so the check **would not have run at all** |
| the leak assertion | `/lineup/` matched the endpoint's own honest prose, not data |
| the staleness fixture | seeded `fetched_at`; the banner keys off `failed_at` — I concluded a working guard was broken |
| `no_member_email` | 3 breaks, all red by name |
| `lineup_vs_set` | 4 breaks, all red by name — and the first one *crashed* instead of failing by name until I fixed the file |
| `email_theme` | same crash-not-name shape, eighth instance of that pattern |

**The pattern rule 10 catches is not "the guard is wrong". It is "the guard cannot
fail."** Four of the nine were vacuous rather than incorrect. Nothing else in the
constitution finds those.

**9 — process must earn its keep.** Fired: cut rule 5 down to a trigger, killed
three pieces of machinery before they were built. Firing again right now.

**11 — correctness at every boundary.** Requirement 3 (compare ACROSS derivation
paths) fired three times in my lane: the FLEX scope-disagreement sweep; the waiver
tool's `net_value` differencing two marginals measured against **different
incumbents** ($59 to claim a kicker worse than the one I start); and the Sunday-alert
preview rendering `calls` while the email rendered `changes`. Requirement 4 (absent
is not zero) fired on `set === null` vs `set.matches === false` — "nobody checked
your lineup" and "your lineup is right" are different facts and were one sentence.

**13 — a failed request is evidence about my query.** Fired three times on me, and
**every one was internal, not external**: the `fetched_at`/`failed_at` fixture; my
member-state probe where `/waivers` 404'd and passed silently because the check fired
on neither branch; the QB1 scoring key where I used `int` (+2.0, defensive) instead
of `pass_int` (−2.0) and nearly reported a 40-point discrepancy in A's docstring that
did not exist. **The rule is written about providers and bites on fixtures.**

**4 — pre-registered ingest filters.** Fired, and well: `INGEST-PLAN.md` is dated
before contact, declares *what has already been seen* so the pre-registration is
honest, and `ingest_filters.py` carries
`FILTER_VERSION = "v2 (2026-08-10) — F1.scoring per-position; v1 retained"`. That is
the escape hatch used exactly as written — a new version, old retained, not a quiet
edit. **See the finding below for where it did not fire.**

**1, 3, 6, 7** — fired, all in A's lane before I arrived (the Sleeper retraction; the
tournament proxy kept as evidence; three reviewers misreading a ceiling weight from a
stale spec; four live "measured core" violations). I have no independent instance to
add for any of them. 6 and 7 are CI assertions, which is why they stay cheap.

### HAD THE OPPORTUNITY AND DID NOT FIRE

**4, on the market layer.** The rule says *all* inclusion/exclusion criteria for
external data are fixed before the data is examined. It was discharged rigorously for
the MFL league ingest — which has not fetched anything. It was **not** discharged for
the market layer, which is external, shipped, and capturing daily right now.
`market_capture.py` carries `horizon_days: int = 14`, and its own comment says the
boundary was chosen **after** observing that `usa-nfl` returns 134 events. There is no
`FILTER_VERSION`, no dated registration, and `MARKET-LAYER.md` has no filters section.
The signal being built is *line movement as a game approaches* — measured only on
games inside 14 days, a cut made post-contact and defended on cost. The reasoning may
well be right; it is unregistered, which is the thing rule 4 exists to prevent.

**6, on the in-season path.** Rule 6 binds any change to *recommendation behaviour*.
Its enforcement is `baseline_regression.test.js`, which covers the draft weights — and
I measured that **eight deliberate breaks to `app.js`'s live `context()` stayed 51/51
green**, including deleting `currentPick`, `nextPick` and the doctrine tilt.
`freeze_baseline.js` has zero references to `app.js`. The in-season optimizer now
emits dollar recommendations and has **no baseline at all**. I changed its behaviour
today (the actionability gate suppresses ~15 of 17 sends; the lineup comparison adds a
priced to-do list) and discharged rule 6 in neither direction — no baseline update, no
declared gated departure. **That is me failing the rule and the rule having no trigger
in my lane, and I would rather say both than pick one.**

**8, in one direction only.** It forbids highlights-only reporting and nothing forbids
failures-only. Cory had to install *"say plainly what is sound"* as a standing verbal
instruction because the constitution does not carry it — *"an audit that finds
something everywhere is an audit nobody believes."* A rule that had to be supplemented
out-of-band has a hole.

### HAS NOT HAD THE OPPORTUNITY

**2 — overrides as data.** Empty ledger. `POST /lineup/override` writes today and
nothing reads it. *What would give it the opportunity:* roughly six in-season weeks
with real overrides recorded, then the first grading pass comparing HUMAN+MODEL against
MODEL alone. Concretely gradeable by mid-October; before that there is nothing to audit
and its absence is not evidence about the rule.

**3 — proxy stays diagnostic, in my lane.** Nothing on the site is a promotion
criterion. *What would give it the opportunity:* the accuracy page's calibration
numbers being cited in a decision to change a weight. It fired in A's lane already.

**12 — the output must be sane.** The formal 10–15 value board sample has never run.
**But the rule fired in substance twice under another name:** I recomputed the market
converter's 387.0/203.0 from scratch through the shipped scoring engine (agreed), and
recomputed QB1 as 427.0 by hand (my arithmetic was wrong, A's number was right).
Independent arithmetic on sampled outputs is exactly rule 12; it just was not called
that. *What would give it the formal opportunity:* the board sample before Aug 22.
**Do not cut this one** — it is the only rule aimed at "every layer agrees and the
answer is wrong", which is the failure class that produced the phantom opponent.

---

## QUESTION 2 — THIRTEEN INTO EIGHT

Every merge below states what is preserved. Nothing is softened; where two rules
genuinely need different strictness I say so and leave them apart.

### M1 · rules 5 + 10 → **A GUARD IS BROKEN ONCE BEFORE IT IS TRUSTED**
Rule 5 was already cut down by rule 9 to *"when you build or change a guard, break it
once"*, which is rule 10's content at lower strictness. Two rules for one act.

**Preserved:** rule 10's stricter standard verbatim — observed going RED **by name**,
not merely failing. Rule 5's framing as the WHY (*a protection unreachable or ignorable
under real conditions is decorative*) and its four-guards-that-did-not-guard evidence.
Rule 5's *"anything automatable belongs in the suite that already runs"*.
**Not softened:** the merged rule takes rule 10's bar, not rule 5's.
**Moved out, not lost:** rule 5's phone-test-of-the-revert is a one-off task for Cory,
not a rule — that is rule 9 applied, and it belongs on a list, not in a constitution.

### M2 · rules 1 + 4 → **EVIDENCE PURITY, INCLUDING THE CRITERIA THAT SELECT IT**
Rule 4's own text already says these are one offence: *"Post-hoc filtering of an
external sample is the same offence as re-fitting the home league until it agrees."*
The constitution states the identity and then keeps two rules anyway.

**Preserved:** rule 1's three named contaminations (a/b/c) verbatim, and its *"this
outranks the gate"* clause. Rule 4's pre-registration-before-contact requirement, the
new-version-with-old-retained escape hatch, and *"every filter is a degree of freedom"*.
**Not softened:** both prohibitions keep full force; internal re-bucketing and external
filtering become two clauses of one rule rather than two rules.
**And it fixes the finding above.** One rule covering both makes "we registered the
MFL filters and not the market horizon" visibly the same omission twice, instead of
two rules where one was satisfied and nobody checked the other.

### M3 · rules 6 + 7 → **THE WRITTEN RULES, THE RUNNING SYSTEM AND THE NAMES MUST NOT DIVERGE**
Rule 7 is rule 6 expressed in labels: a war-room preset reading "Measured core" while
naming the LIVE weights is a doc/system divergence that happens to live in a string.

**Preserved:** rule 6's *"no third option where the docs are merely behind"* and its
sharp scope (only changes to what the tool recommends). Rule 7's absolute reservation
of "the measured core" for the frozen baseline, and its real insight — that this makes
drift detectable **in the language itself, not only in the code**. The recorded known
violation stays recorded.
**Not softened:** rule 7 remains an exclusive reservation, not a preference.
**Enforcement unchanged:** both are already CI assertions; the merge is textual.
**And it should carry the finding:** rule 6's enforcement covers the draft path only.

### M4 · rule 13 folded into rule 11 as **REQUIREMENT 5 — A NEGATIVE IS A CLAIM**
Rule 11 req 4 is *"absent is not zero, and unknown is not a value."* Rule 13 is that
same principle applied to a query instead of a record: a 404 is an absent that is not
a zero. Folding it in **widens** it, which is a gain — all three of its firings on my
work were at internal boundaries (a fixture, a probe, a lookup key), and as a rule
about external providers it did not formally cover any of them.

**Preserved:** the one-question discharge verbatim — *"what would this have returned
if the thing I am looking for were there?"* — the three mechanical forms (report the
scan's own composition, walk the pagination, try a bounded candidate set), and the
four market-probe instances that earned it.
**Not softened:** establishing that the query could have returned a positive stays a
precondition for writing any negative down, internal or external.

### M5 · rules 2 + 3 → **NOTHING DIAGNOSTIC MAY QUIETLY BECOME THE POLICY**
Both guard one failure: an instrument that is supposed to describe the system starts
steering it. Rule 2's parallel policy is Cory's click history; rule 3's is the
continuous proxy. **The current shape is one rule per diagnostic, which is the
accumulation pattern itself** — a third diagnostic needs a rule 15.

**Preserved:** rule 2's persistent-and-material bar (a single disagreement is data;
only a repeated pattern with measured value becomes a proposal), the requirement to
grade HUMAN+MODEL as a system, and the surface-as-proposal-or-name-it-as-a-leak
disjunction. Rule 3's bright line — a dollar-negative or dollar-flat result cannot be
promoted on proxy strength, and the proxy may **never** be a promotion criterion on
its own — plus its cultural-drift reasoning.
**Not softened:** rule 3's prohibition is absolute in the merged text and stays absolute.

### CONSIDERED AND REJECTED · rules 11 + 12
Rule 12's own opening invites it: *"rule 11 asks whether the pipe leaks; rule 12 asks
whether what came out is water."* I still say no. Rule 11 is a **standing obligation
on every piece of code that crosses a boundary**; rule 12 is an **episodic act — sample
10–15 values and redo the arithmetic independently**. Different kinds, different
strictness. Folded in, the sample becomes a bullet among eight and quietly stops
happening, and rule 12 is the only defence against every-layer-agrees-and-the-answer-
is-wrong. **Merging them would be losing protection to hit a number.**

### RESULT
**Thirteen → eight**, plus whatever rule 14 is. Unchanged and standing alone: **8**
(with the symmetry clause below), **9** (still outranks everything), **12**.

**One addition I would make to rule 8, as a clause not a rule:** *say plainly what is
sound, and name it as specifically as you name what is broken.* Cory has been giving
this instruction verbally all week; it is doing constitutional work and is not in the
constitution.

---

## IMPROVING THE PREMISE

The three-category framing is already right, and it caught the error my first read
would have made. Two things would sharpen it further.

**1. Ask "if this rule were deleted, how long until we noticed?"** Fired-vs-not
conflates two very different silences. Delete rule 10 and guards start passing
vacuously within a week — visible fast. Delete rule 7 and CI goes red immediately.
Delete rule 2 and **nothing happens for a season**, by construction, because the whole
failure it names is invisible from inside. That third category is the dangerous one and
the fired/not-fired test cannot see it. A rule that has not fired *and* whose absence
would be undetectable is not a candidate for cutting — it is the one to build a
detector for.

**2. The constitution's real length is not thirteen. It is the number of rules that
have to be REMEMBERED.** Rules 6 and 7 cost nothing to hold because a test holds them.
Rule 10 costs almost nothing because it triggers at the moment you are already writing
the guard. What actually competes for attention is the set with no mechanical trigger
and no test name beside it.

**The structural fix that would make this audit unnecessary: put the test name next to
every rule that has one, and for every rule that does not, record what its trigger is.**
Then the standing question stops being "which rules have fired" — a recollection
exercise that gets less reliable as the project grows — and becomes "which rules have
neither a test nor a trigger", which is answerable by reading one column. My guess is
that column is about four rules long, and saying so out loud takes most of the pressure
off the count.
