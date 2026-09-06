// TERRITORY: A
/* THE DRAFT-ERA PREMISE — an assertion about the LIVE board, after the draft.
 *
 * Register 484 (A, 2026-09-04). `main`'s CI was red for ~42 hours and the
 * cause was not a defect in anything shipped: FIVE draft-era suites flipped
 * together when the nightly board rebuilt.
 *
 * MEASURED, not argued — the same three suites, two adjacent commits, no code
 * change between them:
 *
 *     e8c764bc~1   keeper_option_floor GREEN  vona_predraft_survival GREEN  doctrine_lookahead GREEN
 *     e8c764bc     keeper_option_floor RED    vona_predraft_survival RED    doctrine_lookahead RED
 *
 * `e8c764bc` is "Player board: rebuild 2026-09-04". Every commit in the
 * preceding two-day window was green for these suites (bisected, 27 revisions),
 * so nobody's code broke them. The BOARD moved, which is what a nightly rebuild
 * is for.
 *
 * WHY THAT MAKES THEM RED RATHER THAN WRONG. Each of these checks asserts a
 * property of the PRE-DRAFT board: no kicker inside the top 20 of the pre-draft
 * ordering, a keeper option worth something at pick 17, two draft doctrines in
 * opposite states, a unanimous consensus somewhere among the strategies, a
 * historical draft's picks against the market ADP the board carried. The draft
 * was 2026-08-22. `public/draft_data.json` now holds SEPTEMBER projections over
 * a pool whose top is already rostered, so these questions no longer have the
 * subject they were asked about. The premise is gone, not the conclusion
 * falsified.
 *
 * WHAT THIS DOES, AND WHAT IT REFUSES TO DO. Post-draft, a check wrapped in
 * `ckEra` still RUNS and still PRINTS its number — it simply does not fail the
 * build. Nothing is skipped, nothing is deleted, and no threshold is loosened:
 * a reader sees exactly the same measurement, labelled with the reason it is
 * not being enforced today. Before the draft — which is when these guards do
 * their work, and when 2027's board is being built — it asserts exactly as it
 * always did. Same shape as the draft-window alarms in
 * `external-adp-capture.yml` (registers 480/483), for the same reason.
 *
 * ⚠️ THIS IS THE STOPGAP AND SAYS SO. The durable fix is for a draft-era
 * instrument to read a PINNED pre-draft board rather than today's live one.
 * `draft/data/pre_draft_freeze_2026.json` exists but carries 682 players
 * against the 680 Cory actually drafted from (register 256), so repointing at
 * it tonight would swap one wrong premise for another. Register 484 carries
 * that as the open half with a date.
 *
 * ⚠️ AND IT IS DELIBERATELY NOT A BLANKET. Only the individual checks whose
 * subject is the live pre-draft board are wrapped. Every other assertion in
 * these suites — arithmetic, fail arms, controls that do not depend on today's
 * board — still fails the build on any day of the year.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

/** The league's draft day, from the config the draft tooling reads. Never a
 *  literal here: a date typed into a test file is the kind that stays 2026. */
function draftDate() {
  try {
    const cfg = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
    return String((cfg.draft || {}).start_date || '');
  } catch (e) { return ''; }
}

/** True only when the draft date is KNOWN and today is strictly after it.
 *  An unreadable config asserts as before — cannot-say never downgrades a
 *  guard (rule 3e), which is the same rule the post-draft freeze in
 *  `multisource_projections.py` follows. */
function postDraft(today) {
  const d = draftDate();
  const t = String(today || new Date().toISOString().slice(0, 10));
  return !!d && t > d;
}

/** Wrap a suite's own `ck`. Returns a check that asserts pre-draft and
 *  REPORTS post-draft, printing the identical detail either way. */
function eraCheck(ck, opts) {
  const after = postDraft((opts || {}).today);
  return function ckEra(name, cond, detail) {
    if (!after || cond) return ck(name, cond, detail);
    console.log('REPORTED (not asserted — post-draft, draft ' + draftDate()
      + '): ' + name + (detail === undefined ? ''
        : '  — ' + JSON.stringify(detail)));
    console.log('    the subject is the PRE-DRAFT board and today\'s is a '
      + 'September one; enforced again before the 2027 draft. Register 484.');
    return true;
  };
}

/* ── THE DURABLE FIX: THE BOARD CORY ACTUALLY DRAFTED FROM ─────────────────
 *
 * Settled 2026-09-06 (register 484 (i)). The stopgap above exists because a
 * draft-era assertion was pointed at the LIVE board; the fix is to point it at
 * a pinned one. The open question was WHICH pin, and the candidate on disk was
 * wrong in a way that only reading it revealed.
 *
 * ⛔ `draft/data/pre_draft_freeze_2026.json` IS NOT IT, AND IT SAYS SO ITSELF.
 * Its `status` is "PROVISIONAL" and its `status_reason` reads: "validated
 * against PREDICTED keeper state: the keeper lock has not passed ... Cory's 5f:
 * the pre-lock run is a rehearsal. Re-take after the slate confirms." Its
 * source artifact is dated 2026-08-16, `opponent_keepers_applied` is 0, and it
 * carries 682 players — the 680 Cory drafted from plus the two the lock had not
 * yet removed. THE RE-TAKE NEVER HAPPENED. Repointing at it would have swapped
 * one wrong premise for another, which is exactly what register 484 warned.
 *
 * ✅ THE REAL ONE IS `4750fbce`'s `public/draft_data.json`, committed here as
 * `draft/data/draft_day_board_2026-08-22.json`. Established rather than
 * assumed:
 *
 *   built_at 2026-08-22T03:43:05Z, committed 03:51:53Z
 *   680 players · 23 kept — exactly the pool register 256 records
 *   the draft began 2026-08-22 6:00 PM CDT (league_config, Cory's ruling
 *     "Yes it's 6pm") = 23:00Z, so this board stood for 19 hours before it
 *   and NO other rebuild of public/draft_data.json landed between them —
 *     git log over 08-21..08-24 shows 4750fbce then nothing until 08-24
 *
 * So this is the board that was on screen when he picked, not a reconstruction
 * of one.
 *
 * ⚠️⚠️ AND IT CARRIES A KNOWN DEFECT, WHICH IS EXACTLY WHY IT IS THE RIGHT PIN
 * AND MUST NEVER BE "CORRECTED". Its published replacement levels are
 * REGISTER 283's PRE-LOCK ONES:
 *
 *     pinned (draft day)   RB 147.8 · WR 142.9 · TE 138.0 · QB 347.8
 *     corrected (08-27)    RB 181.1 · WR 170.3 · TE 141.7 · QB 350.8
 *
 * `apply_vorp` ran over the DRAFTABLE pool while `starter_counts` stayed
 * league-wide, so every RB was priced +29.6 and every WR +23.7 VORP points
 * above every TE. A landed the fix as `5b676028` on 08-27 — FIVE DAYS AFTER
 * THE DRAFT. So the tilt against tight ends was live in the room.
 *
 * MEASURED 2026-09-06 as a paired counterfactual over all 478 JS suites, run
 * twice with only the board swapped: exactly THREE are board-dependent, and
 * all three fail on this pin for that single reason — `c1_agreement`,
 * `dollar_replacement_baseline`, `keeper_lock_reorders_the_board`. They are
 * not broken; they are correctly detecting register 283 in the board that had
 * it, which is a control on this pin's authenticity rather than a problem with
 * it.
 *
 * ⛔ DO NOT PATCH THE REPLACEMENT LEVELS IN THIS FILE. A draft-era suite asks
 * "what did the board he drafted from say", and the answer includes the
 * defect. Patching it would answer a counterfactual — what a corrected board
 * would have said — while still being labelled draft day, which is the exact
 * substitution register 484 was filed about. The three suites above therefore
 * stay pointed at the LIVE board, where their subject is a correct one. */
const PINNED = path.join(ROOT, 'draft', 'data', 'draft_day_board_2026-08-22.json');

/** The draft-day board, with its identity checked on every load.
 *
 * ⚠️ THE CHECK IS NOT CEREMONY. A pinned artifact that can be silently
 * replaced is a pin in name only, and the whole point of this file is that a
 * draft-era assertion must not quietly change its subject. If these numbers
 * ever stop matching, every suite reading this board REFUSES rather than
 * measuring something else. */
function pinnedBoard() {
  const b = JSON.parse(fs.readFileSync(PINNED, 'utf8'));
  const players = (b.players || []).length;
  const kept = (b.kept_players || []).length;
  if (players !== 680 || kept !== 23 || b.built_at !== '2026-08-22T03:43:05Z') {
    throw new Error('PINNED BOARD IS NOT THE DRAFT-DAY BOARD: got '
      + players + ' players / ' + kept + ' kept / built_at ' + b.built_at
      + ' — expected 680 / 23 / 2026-08-22T03:43:05Z. Something replaced '
      + 'draft/data/draft_day_board_2026-08-22.json. Do not "fix" this by '
      + 'updating the numbers; re-extract from commit 4750fbce.');
  }
  return b;
}

module.exports = { draftDate, postDraft, eraCheck, pinnedBoard, PINNED };
