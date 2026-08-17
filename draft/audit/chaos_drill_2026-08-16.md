# DRAFT-NIGHT CHAOS DRILL — 2026-08-16 (Cory's ruling: "Do 1")

**The bar, verbatim:** every failure must be LOUD AND NAMED — a specific
on-screen or logged diagnostic. Never a silent wrong number; never a crash
without a message pointing at the cause.

**Scope drilled:** the war room's live sync (`public/js/draft/sync.js` +
`app.js`'s freshness surfaces), the pick logger (`draft/log_draft_picks.py` +
`draft/sleeper_import.py`), and the bash inside
`.github/workflows/draft-night-sync.yml` (executed locally under `bash -e`
with stubbed `python3`/`git`/`sleep` — workflows cannot be dispatched from
here, and the YAML itself is read-only to this drill per the territory rule).

**Suites added (all deterministic, all in the default runs):**
- `draft/tests/chaos_drill_pick_log_test.py` — 15 tests
- `draft/tests/chaos_drill_workflow_bash_test.py` — 7 tests
- `draft/tests/chaos_drill_warroom.test.js` — 37 checks

Every "before" below was REPRODUCED at the pre-fix baseline (probe scripts run
against the unmodified tree, this session) — none of it is speculation.

---

## 1. THE PICK LOGGER (`draft/log_draft_picks.py`, `draft/sleeper_import.py`)

| # | Injection | BEFORE (observed at baseline) | AFTER (pinned by) |
|---|-----------|-------------------------------|--------------------|
| P1 | Sleeper error body — `{"error": "..."}`, which parses as JSON | `AttributeError: 'str' object has no attribute 'get'` — a traceback three calls from the cause, naming neither Sleeper nor the payload | `REFUSING: Sleeper's picks payload is dict, not a list of picks … Payload head: "{'error': 'not found'}". The next poll retries.` — `test_A` |
| P2 | List with non-dict garbage entries | same AttributeError class | named refusal quoting the first bad entry — `test_A2` |
| P3 | `pick_no: "abc"` | `ValueError: invalid literal for int() with base 10: 'abc'` | refusal naming `pick_no='abc'` and the `player_id` it rode in on — `test_B` (string digits `"7"` still accepted — `test_B2`) |
| P4 | One pick number, TWO different players, one payload | reported a **phantom gap** ("pick 2 arrived while 3 is still missing" — 3 was in the payload) AND returned **`skipped: -1`**, a negative count from the tool whose job is refusing wrong numbers | holds BEFORE the ambiguous pick, names the duplicate and both players, withdraws the contradicted pick from the pass, `skipped ≥ 0`; clean payload next poll resumes — `test_C`, `test_C3` |
| P5 | Same event twice in one payload (reconnect-normal) | quiet skip | unchanged, pinned as deliberately quiet — `test_C2` |
| P6 | Sleeper re-serves an **already-logged** pick with a DIFFERENT player (undo/redo) | swallowed by a `continue` — the log stayed out of step with Sleeper's record forever, in total silence | `pick_conflicts` in the sync return names pick, both players, and the operator action (append-only: correction row with `supersedes`); the log itself untouched — `test_D`; five identical repolls stay conflict-free so the warning cannot become noise — `test_D2` |
| P7 | Freeze replaced mid-draft | **silent at append time** — `record()` wrote mixed-sha rows; only `--status` (exit code enforced by nothing on the draft-night path) would mention it later | `record()` REFUSES at the moment of append, naming BOTH shas and the fix ("restore the original freeze, or move this log aside and re-freeze") — `test_E`; `--status` on a pre-existing mixed log still prints ⚠ and exits 1 — `test_E2` |
| P8 | **THE HOUR-STALE POLL LOOP** — `sleeper_import._get`'s 1-hour on-disk cache vs the 20s draft-night loop | poll 1 cached the pick list; **every poll for the next hour re-read that first snapshot from disk**, reporting `added: 0`. The pick log would trail the live draft by up to an hour. The 2026-08-15 dry-run rehearsal could not see this: a completed draft's pick list never changes between polls | `fetch_draft_picks(draft_id, live=True)` bypasses the cache; `sync_live` passes it (plumbing pinned, not just capability) — `test_F`, `test_F2`. Historical callers (build.py, history_export) keep the cache on purpose |
| P9 | Pick for a player absent from the frozen board | logs with `availability_at_my_next_pick: null` (already correct — rehearsal test_4) | pinned again against the synthetic freeze so it runs even where the real freeze is absent |
| P10 | Empty pick list | already refused ("an empty read is not an empty draft") | unchanged; pre-existing test |
| P11 | Mid-draft 403 / timeout at the logger | `_get` retries 3× with backoff, then serves stale cache **with a printed line**, else raises `RuntimeError("Sleeper unreachable for /draft/…/picks: <cause>")` | unchanged — loud and named; the workflow loop echoes and retries (workflow scenario 1) |

## 2. THE WAR ROOM (`public/js/draft/sync.js`, `app.js`)

| # | Injection | BEFORE (observed at baseline) | AFTER (pinned by chaos_drill_warroom.test.js) |
|---|-----------|-------------------------------|-----------------------------------------------|
| W1 | 200 OK, body is a JSON **object** (`{"error": …}`) | **NOTHING.** No status message — and `lastOkAt` was refreshed and `failures` reset first, so the sync-age readout said FRESH and the system strip's "SYNC STALE" red channel could never fire while Sleeper served garbage | error status naming the shape and quoting Sleeper's error text; `lastOkAt` untouched; failure counted; backoff engages; poll re-arms; one good response returns to live — checks F |
| W2 | 200 OK, body **not JSON** (outage/block page) | `"Sleeper unreachable (Unexpected token <…)"` — Sleeper WAS reached; the message blamed the wrong failure | `"<end> answered HTTP 200 with a body that is not JSON — an outage or block page, not pick data."` — checks G |
| W3 | **Empty array mid-draft** (3 picks on the board) | accepted as truth: picks wiped 3→0, clock rewound 4→1, status `"Synced — 0 picks in"`, state `'live'`, `newPicks: -3`. Every survival window and recommendation recomputed as if nobody had drafted | picks KEPT, clock kept, error status: `"EMPTY pick list while 3 picks are on the board — a broken read, not an undrafted room. KEEPING the 3 picks"`; `lastOkAt` untouched. Pre-draft 0→0 stays a quiet live sync — checks H |
| W4 | Shrinking list 3→2 (commissioner undo is real) | silent — indistinguishable from losing picks | accepted (Sleeper is the record) but named: `"Pick list SHRANK from 3 to 2 (a pick undone on Sleeper?)"`, honest negative `newPicks` — checks H2 |
| W5 | 403 **after hours of working sync** (rate limit / block) | `"Check the draft ID — that will not fix itself by retrying"` — misdirecting Cory to re-check an id that had already proven itself | `lastOkAt` is the witness: mid-draft 4xx says `"AFTER the sync had been working — a rate limit or block, not a bad draft ID. Retrying…"`; a 4xx with no successful sync ever still says check the id — checks I + fail-arm |
| W6 | Timeout / network down | already loud (`"Sleeper unreachable (…) Retrying in Ns"`), backoff doubles, caps at 30s | unchanged, pinned — checks "outage" |
| W7 | Clock pressure — 9 picks land in one poll | handled (full-list model) | pinned: all land, clock jumps correctly, `newPicks: 9`, ingest reports clean. Degraded variant: id-less pick counted, pick_no collision counted, room still renders |
| W8 | `droppedNoId` inflation (found by this drill's own first run) | the counter ACCUMULATED across renders — one id-less pick read as "2 dropped" after two `allPicks()` calls, 47 after 47 renders | recomputed per pass, matching `pickNoCollisions` semantics — pinned |
| W9 | Board with **no readable `built_at`** under live use | provenance banner: NOTHING (the `!== 'unknown'` guard fell through); movers dot: 🟢; system strip: neither red nor amber → green — while the checklist called the same board "never built" on the same screen | banner pushes a `bad` note ("This board has NO readable built_at — its age cannot be verified. Treat it as stale"); movers dot 🔴; system strip red `"board age UNKNOWN — built_at missing or unreadable"`. Stale ≥18h still blocks (control pinned) — checks J |
| W10 | Stale board (`built_at` old) under live use | already loud: one policy (`boardFreshness`), aging amber, ≥18h blocking banner requiring acknowledgement, checklist tick only for `fresh` | unchanged; control-pinned in checks J; existing suites (`draft_sheet_staleness`, checklist pins) still green |

## 3. THE SYNC WORKFLOW'S BASH (`draft-night-sync.yml`, executed locally)

The `run:` block is EXTRACTED from the YAML at test time (cannot drift) and run
under `bash -e` with stub `python3`/`git`/`sleep`. `chaos_drill_workflow_bash_test.py`:

| # | Scenario | Result |
|---|----------|--------|
| B1 | `--sync` exits 1 with a refusal message | the error text is echoed (not swallowed by `bash -e`), `"sync call failed (exit 1) — will retry"` printed, the night continues, later completion exits 0 — the 2026-08-15 retry fix stays alive |
| B2 | dry_run with a dirty tree | zero `git commit`, zero `git push` in the call log; polling/exit mechanics still proven |
| B3 | push rejected once | `"push rejected (attempt 1) — rebasing onto the remote and retrying"`, retry lands, `"logged and pushed"`, completion green |
| B4 | second writer (every push rejected, rebase conflicts) | `"REBASE CONFLICT on the pick log itself — a second writer exists"`; at completion the durability gate fires `"::error::… NOT pushed — pick log not durable"`, final push fails → **exit 1**, `"DO NOT trust the remote log"` |
| B5 | drift pin | the YAML's completion grep (`^picks\s*: ([0-9]+) of \1 logged$`) is tested against the REAL `status()` output — matches complete, refuses incomplete. Nothing else ties those two files together |

## 4. RESIDUALS — honest list, nothing hidden

1. **Timeout exits GREEN.** `max_minutes` elapsing ends the job with exit 0
   and a `::warning::` only — the Actions UI shows the same green check for
   "captured all 150" and "gave up". Fixing it means editing the YAML, which
   is outside this drill's write scope. **Pinned as a residual**
   (`test_6a_RESIDUAL…` — if someone fixes the YAML the test fails and this
   entry gets deleted). Operator mitigation added to the runbook: read the
   final log line, not the check.
2. **The completion gate ignores `--status`'s exit code.** A freeze-sha
   mismatch is echoed (⚠ line, loud) but the run still ends "draft complete",
   exit 0. `record()`'s new append-time refusal makes a mixed log nearly
   unreachable in a single run; the residual covers a workflow re-run after a
   freeze swap. Pinned (`test_6b_RESIDUAL…`), same YAML constraint.
3. **Stale-cache fallback during a mid-draft outage** (`sleeper_import._get`)
   serves an up-to-1h-old pick list with a one-line printed notice, and sync
   reports `added: 0`. Deliberate: picks are Sleeper's record, the next good
   poll backfills, and the runbook already treats a Sleeper outage as
   "keep drafting in the app". Named here so nobody mistakes it for silence.
4. **A frozen-but-answering Sleeper is invisible to the sync layer.** If
   Sleeper 200-serves the SAME full list while the room advances (their bug,
   not an HTTP failure), sync-age reads fresh — the age is "last good read",
   not "last new pick". The war room's clock disagreeing with the Sleeper app
   is the only detector; no code change can distinguish "slow room" from
   "stuck feed" at this layer.
5. **`pick_conflicts` / `skipped` reach the workflow log only** — no member
   surface renders them (the war room has its own reconcile path). Loud where
   the operator of the LOGGER looks, which is the workflow log per runbook
   step 8.
6. Cosmetic: a pick for a player unknown to the freeze logs `player_name`
   from Sleeper's `metadata.first_name` only.

## 5. FILES TOUCHED

Fixes: `draft/log_draft_picks.py`, `draft/sleeper_import.py`,
`public/js/draft/sync.js`, `public/js/draft/app.js` (three freshness
surfaces). Test-side: the three `chaos_drill_*` suites;
`test_pick_log_rehearsal.py`'s fake gained `**kw` (the real
`fetch_draft_picks` signature grew `live=`); `sync_never_wedges.test.js`'s
catch-to-rearm span widened 900→2200 chars (the honest 4xx/non-JSON messages
made the catch branch longer; the pinned property is unchanged).
Not touched, per the ruling's stay-out list: `draft/build.py`, the four
gate-classification test files, `draft/tools/draft_replay*`, `src/`, `views/`,
all workflow YAML (read-only).
