#!/usr/bin/env node
/**
 * WHICH LANES HAVE WORK THAT NOBODY ON `main` CAN SEE?
 *
 * Cory, 2026-08-18: *"it seems like A isn't picking up D and E request. Can you
 * gather them and present to A so it sees it from here on out."*
 *
 * The gathering was the easy half and it is already done. **The half that matters is
 * "from here on out"**, because the reason D's work was invisible is not that anyone
 * ignored it — it is that NOTHING IN THIS REPO REPORTS UNMERGED WORK. ROUTES.md is a
 * mailbox: it shows what a lane chose to write down. A branch with nineteen commits on
 * it and no ROUTES entry is, to every tool we own, indistinguishable from an idle lane.
 *
 * Measured the day this was written: **D's lane carried 19 commits dated 08-17 that
 * `main` had never seen** — preregs committed before their arms existed, a public
 * self-retraction ("Amendment 2 kills the week-1 props result, and I withdraw what I
 * reported"), and two graded nulls. The most disciplined loop-closing in the project,
 * completely invisible from `main`.
 *
 * ── WHAT IT DOES ──────────────────────────────────────────────────────────────
 *
 * One line per branch: how many commits `main` is missing, how old the newest one is,
 * and a flag when both numbers are large enough that the work is probably stranded
 * rather than in progress. Reports; never merges, never deletes, never fails the build.
 *
 * IT DELIBERATELY DOES NOT JUDGE WHICH WORK MATTERS — same reason `prior_art.py`
 * doesn't: a filter that silently drops the thing you needed is the failure being
 * prevented, not a feature. It prints; a human reads.
 *
 * Run:  node draft/tools/lane_status.js
 */
'use strict';

const { execSync } = require('child_process');

/** Branches this far ahead, and this stale, are stranded rather than in flight. */
const STRANDED_COMMITS = 3;
const STRANDED_HOURS = 12;

/**
 * A branch whose newest commit predates this many days is old DIVERGENCE, not
 * stranded work — typically a lane that never rebased across a history rewrite.
 * Measured: five such branches sat 386-850 commits "ahead" with nothing newer than
 * 08-10. Counting those as stranded work would bury the one real row in noise.
 */
const ABANDONED_DAYS = 5;

function git(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** `[{branch, ahead, lastIso}]` — separated from the reporting so it can be tested. */
function collect(refs, aheadOf) {
  return refs.map(function (r) {
    return { branch: r.branch, lastIso: r.lastIso, ahead: aheadOf(r.branch) };
  });
}

function classify(rows, nowMs) {
  return rows.map(function (r) {
    const ageH = (nowMs - Date.parse(r.lastIso)) / 3.6e6;
    const abandoned = ageH > ABANDONED_DAYS * 24;
    return Object.assign({}, r, {
      ageHours: Math.round(ageH),
      abandoned: abandoned,
      stranded: !abandoned && r.ahead >= STRANDED_COMMITS && ageH >= STRANDED_HOURS,
    });
  }).sort(function (a, b) { return b.ahead - a.ahead; });
}

function readRefs() {
  const out = git("git for-each-ref --format='%(refname:short)|%(committerdate:iso-strict)' refs/remotes/origin");
  return out.split('\n').map(function (l) { return l.replace(/'/g, '').trim(); })
    .filter(Boolean)
    .map(function (l) {
      const parts = l.split('|');
      return { branch: parts[0].replace(/^origin\//, ''), lastIso: parts[1] };
    })
    .filter(function (r) { return r.branch && r.branch !== 'main' && r.branch !== 'HEAD'; });
}

function main() {
  let refs;
  try { refs = readRefs(); } catch (e) {
    console.log('lane_status: no git remote data available here — skipping.');
    return 0;
  }
  const rows = classify(collect(refs, function (b) {
    try { return parseInt(git('git rev-list --count origin/main..origin/' + b).trim(), 10) || 0; }
    catch (e) { return 0; }
  }), Date.now());

  const live = rows.filter(function (r) { return r.ahead > 0 && !r.abandoned; });
  const stranded = live.filter(function (r) { return r.stranded; });

  console.log('='.repeat(76));
  console.log('LANE STATUS — work that exists but `main` cannot see');
  console.log('='.repeat(76));
  if (!live.length) {
    console.log('\n  Every active branch is merged. Nothing is stranded.');
  }
  live.forEach(function (r) {
    console.log('  ' + (r.stranded ? '⚠️ ' : '   ')
      + String(r.ahead).padStart(4) + ' commits  '
      + String(r.ageHours + 'h old').padStart(9) + '  ' + r.branch);
  });
  if (stranded.length) {
    console.log('\n  ⚠️  ' + stranded.length + ' branch(es) look STRANDED — '
      + STRANDED_COMMITS + '+ commits, ' + STRANDED_HOURS + 'h+ old, unmerged.');
    console.log('     ROUTES.md cannot show you these: it lists what a lane WROTE DOWN,');
    console.log('     and an unrouted branch is indistinguishable from an idle lane.');
  }
  const old = rows.filter(function (r) { return r.abandoned && r.ahead > 0; });
  if (old.length) {
    console.log('\n  (' + old.length + ' branch(es) older than ' + ABANDONED_DAYS
      + 'd not shown — old divergence, not stranded work.)');
  }
  console.log('='.repeat(76));
  return 0;
}

module.exports = { collect: collect, classify: classify,
                   STRANDED_COMMITS: STRANDED_COMMITS, STRANDED_HOURS: STRANDED_HOURS,
                   ABANDONED_DAYS: ABANDONED_DAYS };

if (require.main === module) process.exit(main());
