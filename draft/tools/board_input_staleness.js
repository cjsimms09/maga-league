#!/usr/bin/env node
// TERRITORY: relay (measurement) — the gate itself is A's call. See ROUTES.
/**
 * IS THE BOARD OLDER THAN THE THINGS IT IS BUILT FROM?
 *
 * On 2026-08-18 the board was caught stale against TWO different upstream inputs in a
 * single evening, and both were invisible until a test failed for an unrelated reason:
 *
 *   1. A's keeper-vorp fix landed `073aadfc` **03:20:28Z** against a board built
 *      **02:03:30Z**. It resolved only because an unrelated rebuild happened to fire at
 *      03:49 — luck, not process.
 *   2. `projection_error_calibration.json` was regenerated `f6acbe76` **03:59:04Z**
 *      against that 03:49:25Z board — **9m 39s stale** — by a commit whose own subject
 *      says it *"moves every proj_ceiling/proj_floor/proj_sd on the board."* It moved
 *      them in the table. Nothing rebuilt the board. **152 of 535 banded rows** then
 *      disagreed, and because `MEASURED_WEIGHTS.ceiling` ships at 0.45 it reached a
 *      weighted term in `recommend()`, four days before the draft.
 *
 * ── WHY THE EXISTING TOOL DOES NOT COVER THIS, CHECKED BEFORE BUILDING ────────
 *
 * `check_artifact_freshness.py` is the right tool for a different question. It walks
 * `draft/data/artifact_registry.json`, REGENERATES each artifact and reports FRESH or
 * STALE. Two reasons that cannot catch the above:
 *
 *   * **The board is not in the registry.** 25 research artifacts are; the one artifact
 *     Cory actually drafts from is not.
 *   * **Regeneration is the wrong instrument for it anyway** — rebuilding the board is
 *     slow and needs network, which is exactly why it is not registered.
 *
 * So this asks the cheap question instead: **is any declared INPUT committed more
 * recently than the board?** Pure git metadata, sub-second, no regeneration, no network.
 * It cannot tell you the board is WRONG — only that it cannot possibly be current,
 * which is the claim that matters and the one nothing was making.
 *
 * Run:  node draft/tools/board_input_staleness.js
 *       node draft/tools/board_input_staleness.js --at <commit>   (as of a past commit)
 */
'use strict';

const { execSync } = require('child_process');

const BOARD = 'public/draft_data.json';

/**
 * What the board is built FROM.
 *
 * Declared rather than derived, deliberately: deriving it by parsing `build.py`'s reads
 * would go quietly wrong the first time a path was built dynamically, and a
 * silently-shrinking input list is a check that stops firing without telling anyone.
 * A declared list is reviewable in a diff. `test_board_input_staleness` fails if any
 * entry stops existing, so a rename cannot empty this by accident.
 */
const INPUTS = [
  // The two that actually went stale on 08-18, first.
  'draft/backtest/projection_error_calibration.json',  // proj_sd, proj_ceiling, proj_floor
  'draft/vorp.py',                                     // vorp + replacement levels
  // The generator and the modules whose output it embeds.
  'draft/build.py',
  'draft/projections.py',
  'draft/scoring.py',
  'draft/adp.py',
  'draft/keepers.py',
  'draft/own_projections.py',
];

function git(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/** Unix seconds of the last commit touching `p`, or null if git knows nothing. */
function lastCommit(p, at) {
  const range = at ? at + ' -- ' : '-- ';
  const out = git('git log -1 --format=%ct ' + range + JSON.stringify(p));
  return out ? Number(out) : null;
}

/**
 * `{stale: [...], fresh: [...]}` — inputs newer than the board, and the rest.
 * Split out from the reporting so the classification can be tested without git.
 */
function classify(boardTime, inputs) {
  const stale = [], fresh = [];
  inputs.forEach(function (i) {
    if (i.time == null || boardTime == null) return;
    (i.time > boardTime ? stale : fresh).push(
      Object.assign({ behindSeconds: i.time - boardTime }, i));
  });
  stale.sort((a, b) => b.behindSeconds - a.behindSeconds);
  return { stale: stale, fresh: fresh };
}

function human(s) {
  if (s < 90) return s + 's';
  if (s < 5400) return Math.round(s / 60) + 'm';
  if (s < 172800) return (s / 3600).toFixed(1) + 'h';
  return (s / 86400).toFixed(1) + 'd';
}

function main(argv) {
  const at = (argv.indexOf('--at') >= 0) ? argv[argv.indexOf('--at') + 1] : '';
  let boardTime;
  try { boardTime = lastCommit(BOARD, at); } catch (e) {
    console.log('board_input_staleness: no git history available here — skipping.');
    return 0;
  }
  if (boardTime == null) {
    console.error('board_input_staleness: git knows nothing about ' + BOARD
      + '. Failing rather than reporting a clean board.');
    return 1;
  }
  const inputs = INPUTS.map(p => ({ path: p, time: lastCommit(p, at) }));
  const missing = inputs.filter(i => i.time == null);
  const { stale, fresh } = classify(boardTime, inputs);

  console.log('='.repeat(74));
  console.log('BOARD INPUT STALENESS — is the board older than what it is built from?');
  console.log('='.repeat(74));
  console.log('  board  ' + new Date(boardTime * 1000).toISOString() + '  ' + BOARD);
  if (missing.length) {
    console.error('\n  ❌ ' + missing.length + ' declared input(s) no longer exist in git: '
      + missing.map(m => m.path).join(', '));
    console.error('     A shrinking input list is a check that stops firing silently.');
    return 1;
  }
  if (!stale.length) {
    console.log('\n  ✅ every declared input predates the board. It can be current.');
    console.log('     (This does not prove the board is CORRECT — only that it is not'
      + ' provably stale.)');
    console.log('='.repeat(74));
    return 0;
  }
  console.log('\n  ⚠️  ' + stale.length + ' input(s) are NEWER than the board:');
  stale.forEach(function (s) {
    console.log('     +' + human(s.behindSeconds).padStart(6) + '  ' + s.path);
  });
  console.log('\n  The board cannot reflect these. Rebuild it, or say why it should not be.');
  console.log('  Both 08-18 incidents had exactly this shape and neither was visible'
    + ' until an\n  unrelated test failed. See DEFECT-REGISTER row 34.');
  console.log('='.repeat(74));
  return 1;
}

module.exports = { BOARD, INPUTS, classify, human, lastCommit, main };

if (require.main === module) process.exit(main(process.argv.slice(2)));
