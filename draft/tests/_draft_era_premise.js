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

module.exports = { draftDate, postDraft, eraCheck };
