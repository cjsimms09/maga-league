# THE COMPLETE BACKLOG — Everything Else, Gated and Sequenced

Append to the task list. **The deadline order (polish → paths → shadows → opening script → mocks) is untouchable — nothing here jumps it.** Part A slots in around it (small, draft-relevant); Part B is draft-week ops; Part C is draft night itself; Part D is post-draft; Part E is standing behaviors that start now and never stop. Triage rule: if any Part A/B item threatens a deadline item, it drops to Part D automatically — note it and move on.

---

# PART A — PRE-DRAFT ADDITIONS (small, high-value, build around the deadline items)

## A-1. Personal prefs must survive the phone/laptop divide (REAL draft-night risk)
Targets, Never list, queue, slider settings, and path choices live in localStorage — per device. I will prep on desktop and draft on phone; my Tuesday-night homework must not evaporate. Migrate personal prefs to server-side storage keyed to my login (Blobs, same durability as the ledger), with localStorage as offline cache. Sync on load, last-write-wins with a visible "synced" stamp. Robot scenario: set a target on simulated device A, assert it renders on device B.

## A-2. Undo everywhere a fat thumb can lie
"I TOOK HIM," star, never, path-confirm — every one-tap state change gets a 5-second undo toast. The Loveland class of error should be recoverable in one tap, not via reconciliation archaeology. Undo events log to the ledger as corrections (never deletions).

## A-3. My-turn alerting that survives a pocket
When my turn arrives: audio ping + vibration (where supported) + title-bar flash + push via ntfy topic if configured. Configurable, defaulting ON for audio. The 30-second scenario this kills: talking trash, phone dark, clock running.

## A-4. Post-pick instant read (the banter-and-intel line)
After every league pick, one generated line in the feed: "Sadbru takes Nacua — 3 early vs ADP; pushes Tier-2 WR value toward your pick 11" / "ds7mmet reaches for QB (r5, on-pattern) — your QB window just extended." Derived entirely from existing deltas (pick vs ADP, opponent model match, survival shifts). This is the tool narrating the draft as it happens — glanceable intel, and honestly, fun.

## A-5. Biggest-fallers ticker
A one-line strip above the board: the 3 largest live ADP-vs-board fallers right now with their clean/suspicious badge. The "someone is sliding" radar without scanning 200 rows.

## A-6. Any-pick board explorer
Extend the branch forecast into a tappable timeline: tap ANY of my future picks (26, 29, 46...) and see the projected best-available-by-position at that pick from the survival model, with confidence widening at distance (label it: "pick 46 projection is weather, not forecast"). This is the pro's "when do I take my QB" question answerable by touch.

## A-7. Player card depth
Tapping any player anywhere opens one consistent card: composite breakdown, survival, tier context, ADP history (FFC trend arrow if the API serves it), depth-chart note, injury badge with Sleeper's status + report date, my flags, and the Why line. One card, everywhere, same data — no hunting.

## A-8. Draft board export
One button: full board + my roster + all picks + shadow rosters → CSV and a printable recap. For the archive, for league banter, for the paper trail.

# PART B — DRAFT-WEEK OPS (Aug 15–21)

## B-1. The Game-Day Runbook (generated, not written)
A one-page generated doc, refreshed daily draft week: T-48h — confirm keeper slate all-10, slot verified vs Sleeper, rebuild + checklist screenshot; T-24h — final mock (15 min), print paper sheet, charge devices; T-2h — rebuild, verify /api/health commit matches, checklist all-green screenshot; T-30m — warm-up pings begin, connect to draft room, confirm sync latency; T-0 — paths up, ledger armed, phone DND-except-league. Each line checkable, each check logged. Pros don't wing game day.

## B-2. Function warm-up scheduler
Netlify cold starts are the enemy of a 30-second clock. A scheduled ping (every 5 min, starting 60 min before draft time, configurable) hits every draft-critical function (board, sync, ledger, health) keeping them warm. Auto-disarms after 6 hours. One config line: draft datetime.

## B-3. Safari/iOS is THE browser — dedicated pass
The robot tests Chromium. Draft night is an iPhone. Manual + automated pass on iOS Safari specifically: audio-alert autoplay restrictions (A-3 needs a user-gesture arm step — build it), localStorage/Blobs sync behavior, backgrounded-tab polling throttle (measure it; if Safari throttles the poll when backgrounded, the my-turn alert must fire from a re-foreground catch-up sweep), viewport quirks, and the PWA/add-to-homescreen path (test whether standalone mode helps or breaks polling).

## B-4. Client error beacon
Any uncaught client error or failed fetch during a live/rehearsal session posts a one-line beacon (error, build hash, session id) to a log endpoint — my own tiny Sentry. The debug-log button covers "I saw something weird"; the beacon covers "something broke and I didn't notice." Draft-night triage reads one list.

## B-5. Performance budget pass
Lighthouse-style audit on the war room at phone viewport: interaction latency under the standing budgets (150ms pick→board, 100ms tap feedback), no long tasks >200ms during pick processing, bundle audit (anything heavy loading that draft night doesn't need gets deferred/split). Numbers recorded in STATUS.md as the baseline; regressions fail CI.

## B-6. The full failure drill, scheduled and scripted
Already specced — now calendared into the runbook (T-24h): stale-artifact banner acknowledged, manual entry of 5 picks under a timer, live keeper edit, wifi kill + recovery, Sleeper-outage simulation (block the API locally, confirm degraded mode + paper sheet workflow). 30 minutes, checklist output, ledger-logged.

# PART C — DRAFT NIGHT ADDITIONS (armed by the runbook, exercised in mocks first)

## C-1. Live shadow standings strip
During the draft, a small strip: each shadow strategy's roster value so far vs mine ("You 412 · Tier-Hunter 405 · Default 398"). Zero decision weight — pure visibility into the experiment I'm running, and it seeds the season-long habit of watching the race.

## C-2. Round-transition posture cards
At each phase transition (FOUNDATION→STRUCTURE etc., already computed), one dismissible card: "Entering LEVERAGE: ceiling weighting up, risk penalty down 40%, LRM says DEF safe until 132. Your plan: [shape status]." The auto-adjuster already does this silently; saying it out loud at transitions keeps me and the model in the same movie.

## C-3. The closing checklist
When my last pick lands: auto-render the immediate post-draft card — final roster with bye grid, legality confirmation, shadow rosters frozen + stamped confirmation, ledger entry count vs expected (2/pick — any gap flagged NOW while memory is fresh), and the one-tap "draft complete, archive everything" action that snapshots the whole night to L2.

# PART D — POST-DRAFT (Aug 23+, ahead of the in-season master)

## D-1. The Draft Recap (analysis + league banter in one artifact)
Generated within an hour of draft end: every pick graded vs board (steals/reaches by composite delta), my draft vs the shadows' drafts side by side, the room's biggest reaches and values, projected standings with intervals, and a shareable graded-card image per team (the banter payload — sized for the group chat). Honest-grading rules apply: grades are model opinion, labeled as such, intervals shown.

## D-2. Mock-frown ledger UI
The screenshot-and-frown workflow gets a button: "Log a frown" — captures current board state hash + a one-line note + optional screenshot reference into the ledger. Every frown becomes a triage item; every triaged frown becomes a robot scenario or a documented non-issue. This is the human-QA channel formalized before the season's weekly usage starts generating them.

## D-3. Prediction-confidence display (once data exists)
When calibration history accumulates: survival percentages render with their earned trust ("78% — model's 70-80% bucket has hit 76% historically"). The tool showing its own report card next to its claims. September-gated by data, specced now.

## D-4. Everything already queued
The in-season master, backtest R2 completion, strategy hunt S/N, exploitation intel, annual button dry-run — unchanged, this document adds nothing above them, only behind them.

# PART E — STANDING BEHAVIORS (start now, never stop)

## E-1. The weekly self-audit cron
Sunday nights: automated sweep — all crons ran on schedule this week (watchdog for watchdogs), ledger writes match expected cadence, calibration drift check, error-beacon review, deployed-vs-HEAD match, storage backend declaration, test suite green. One-line summary to STATUS.md; anything amber pings me. The system checking its own pulse weekly, forever.

## E-2. Every frown → scenario pipeline (formalized)
Standing rule, now with teeth: no bug fix merges without its robot scenario in the same commit; no frown closes without either a scenario or a written non-issue verdict. CI can enforce half of this (commit-message convention linking fix→scenario).

## E-3. Quarterly design review prompt (self-triggered)
A scheduled reminder (Oct 1, Jan 2, Apr 1): generate a UX self-review — usage friction observed in ledger patterns (features never touched, panels never opened, overrides clustering), and propose (never auto-apply) interface changes with evidence. The layout evolving from observed use, through the same gates as everything else.

## E-4. The honesty paragraph, everywhere, forever
Every generated report, recap, and analysis ends with its limitations stated — sample sizes, what it can't know, the three most-likely-noise findings. This is already house style; this line makes it a checked requirement of every new surface this document creates.

---

# PART F — LEAGUE HISTORY PAGE (post-draft delight, back of the queue)

## F-1. The MFGA Archive — full spec in `league-history-page.md`
A public HISTORY-tab feature: season chapters (2023→present), the All-Time Records Book, franchise pages, the Money Board, Bad Beats Hall of Fame, and self-updating machinery that appends a chapter per year via the January Annual cron. Consumes the L2 archives + harvest outputs already in hand (matchups, brackets, drafts, transactions, money ledgers); one deterministic, provenance-stamped build script; no runtime LLM calls (recaps generated at build time, committed as content).

**Queue position (per Cory, 2026-08-08):** post-draft idle-CI work, buildable in gaps from Aug 23. **Never preempts a draft-critical or in-season calendar gate** — it drops behind all of Part D's in-season work and every deadline item. Slots into CI idle time only.

**GUARDRAIL (Section 5, firm):** results and records are league property; **dossier analysis, war-room intelligence, opponent models, and strategy tooling NEVER leak to this page.** The page shows what happened, never what the machine thinks about anyone's tendencies. Roast lovingly at outcomes, not people (Cory's 1.06 miss is fair game — it's already legend). Every recap ends with the season's money table. This guardrail is a build-time invariant: the history build reads ONLY the public results/records surfaces, never the dossier/war-room stores.

---

## Sequencing summary for the task list
- Deadline order proceeds untouched: polish → paths → shadows → opening script → mocks
- Part A items slot into natural gaps (A-1/A-2/A-3 before first mock — they change what the mock rehearses; A-4 through A-8 as capacity allows, else they slide to draft week)
- Part B is calendar-locked to draft week; B-1's runbook generates from Aug 15
- Part C ships behind mocks (exercised in rehearsal before the night)
- Part D triggers Aug 23; Part E's E-1 cron starts this Sunday
- Part F (League History Page) is the tail: post-draft idle-CI delight, behind every Part D in-season item and every gate; never preempts draft-critical or in-season work
- STATUS.md gains a BACKLOG section tracking every item here with its gate; the triage rule (deadline-threat → auto-defer) is written at the top of it
