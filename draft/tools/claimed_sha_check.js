#!/usr/bin/env node
/* TERRITORY: A
 *
 * A DELIVERY CLAIM THAT NAMES A SHA SHOULD NAME A SHA SOMEBODY CAN CHECK.
 *
 * Register 254 asked for this in one line: *"an item whose text says PUSHED
 * must name a sha that is an ancestor of `main`."* That is the right instinct
 * and the wrong rule, and this project's own record says so THREE TIMES:
 *
 *   · register 249 — the fix arrived as a DIFFERENT commit, so the named sha
 *     was not an ancestor and the work was delivered anyway.
 *   · register 254 — same shape. `26bb07f0` is on no ref in this repository,
 *     and `views/history/_subnav.ejs` carries Cory's Money Board tab today.
 *   · register 204 — the reverse. The row said "awaiting A's merge" for six
 *     days; the FILES were restored by another route, and only the guard was
 *     genuinely missing. Neither "merged" nor "not merged" described it.
 *
 * So NOT-AN-ANCESTOR DOES NOT MEAN NOT-DELIVERED, and a check that blocks on
 * it would have fired on 249 and 254 while both were finished. This reports
 * instead, and its whole value is that it separates three states a single
 * boolean was flattening:
 *
 *   ON MAIN            the sha resolves and is an ancestor. Nothing to do.
 *   NOT ON MAIN        the sha resolves and is not. Says nothing about whether
 *                      the work landed — CHECK THE CONTENT. It does say the
 *                      named commit is not the reason it landed.
 *   UNRESOLVABLE       the sha is on no ref in this repository at all. This is
 *                      the weakest claim of the three and the one worth
 *                      surfacing: nobody can verify it, now or later, and no
 *                      amount of fetching will change that.
 *
 * MEASURED 2026-08-27 across DEFECT-REGISTER.md and ROUTES.md — 13 delivery
 * claims naming 9 DISTINCT shas: 4 on main, 1 resolving-but-not-on-main, and
 * FOUR that exist on no ref after fetching every branch. Nearly half the
 * evidence in these mailboxes points at commits nobody can look at.
 *
 * (Claims and shas are counted separately below because they differ — one sha
 * can be claimed in three places, and reporting 13 under a heading that reads
 * like a sha count is the kind of quiet unit slip this repo keeps correcting.)
 *
 * ⚠️ "UNRESOLVABLE" INCLUDED AN UNFETCHED-BRANCH CASE AND THAT WAS CHECKED, not
 * assumed: on the first pass FIVE shas failed to resolve, and `a8797d95` came
 * back after `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`. So this
 * tool fetches nothing and says so — a shallow or partial clone will over-report
 * UNRESOLVABLE, which is why that bucket is a prompt to fetch and re-run rather
 * than a verdict. Rule 3e.
 *
 * REPORT ONLY. Exit 0 unless its own controls fail.
 * Run: node draft/tools/claimed_sha_check.js
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const FILES = ['DEFECT-REGISTER.md', 'ROUTES.md', 'CORY-ASKS.md', 'OPEN-QUESTIONS.md'];

/* A claim of delivery, immediately followed by a sha. Deliberately narrow: it
 * must be a DELIVERY verb, not any mention of a commit, or every "see abc1234"
 * becomes a claim. */
const CLAIM = /(DONE AND PUSHED|PUSHED|merged in|merged as|fixed in|shipped in|landed in|delivered in)\s*(?:\()?[`'"]?([0-9a-f]{7,40})[`'"]?/gi;

/* `stdio` pipes stderr so a failed lookup does not print `fatal: ...` into the
 * report. The failure is the ANSWER here ("unresolvable"), not an error, and a
 * git diagnostic in the middle of a classified list reads as a broken tool. */
function sh(args) {
  return execFileSync('git', args,
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function resolves(sha) {
  try { sh(['cat-file', '-e', sha + '^{commit}']); return true; } catch (e) { return false; }
}
/* THE BASELINE REF, RESOLVED ONCE AND NAMED IN THE REPORT. `origin/main` is not
 * guaranteed to be a local ref — a fresh CI checkout, a clone with a different
 * remote name, or a detached run can all be missing it, and `rev-parse` throwing
 * inside the self-test would have failed the CONTROLS and made this tool print
 * "refusing to report" in an environment where nothing was wrong. Falls back to
 * HEAD, which on a push-to-main runner is the same commit. */
const BASE = (() => {
  for (const ref of ['origin/main', 'refs/remotes/origin/main', 'main', 'HEAD']) {
    try { sh(['rev-parse', '--verify', ref + '^{commit}']); return ref; } catch (e) { /* next */ }
  }
  return 'HEAD';
})();

function onMain(sha) {
  try { sh(['merge-base', '--is-ancestor', sha, BASE]); return true; }
  catch (e) { return false; }
}

/** One sha -> 'on_main' | 'not_on_main' | 'unresolvable'. */
function classify(sha) {
  if (!resolves(sha)) return 'unresolvable';
  return onMain(sha) ? 'on_main' : 'not_on_main';
}

function scan() {
  const out = [];
  for (const f of FILES) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf8');
    txt.split('\n').forEach((line, i) => {
      CLAIM.lastIndex = 0;
      let m;
      while ((m = CLAIM.exec(line)) !== null) {
        out.push({ file: f, line: i + 1, verb: m[1], sha: m[2] });
      }
    });
  }
  return out;
}

/* CONTROLS. This tool spends most of its life printing a list that looks the
 * same as the list a broken tool prints, so it proves it can tell the three
 * states apart before it reports anything (rule 3e). Every anchor is derived,
 * never a pinned sha: a pinned one goes stale and a control that passes once
 * and fails forever is register 3f's own example. */
function selfTest() {
  const fails = [];
  // KNOWN-NEGATIVE: main's own tip is on main by construction.
  const tip = sh(['rev-parse', BASE]);
  if (classify(tip) !== 'on_main') fails.push(BASE + ' tip did not classify as on_main');
  // KNOWN-POSITIVE (unresolvable): a well-formed sha that cannot exist.
  if (classify('0'.repeat(40)) !== 'unresolvable') fails.push('the all-zero sha did not classify as unresolvable');
  /* KNOWN-POSITIVE (not_on_main): the newest commit on any remote branch that
   * is NOT an ancestor of main. Derived, so it survives branches coming and
   * going; if the repo ever has no such commit the control SKIPS loudly rather
   * than passing quietly on an empty set. */
  let offMain = null;
  try {
    offMain = sh(['rev-list', '--max-count=1', '--all', '--not', BASE]);
  } catch (e) { /* no such commit */ }
  if (offMain) {
    if (classify(offMain) !== 'not_on_main') fails.push(`${offMain.slice(0, 8)} did not classify as not_on_main`);
  } else {
    console.log('  control SKIPPED: every commit in this clone is an ancestor of '
      + 'main, so the not_on_main state cannot be exercised here.');
  }
  return fails;
}

function main() {
  console.log('CLAIMED-SHA CHECK — a delivery claim should name a commit somebody can look at\n');
  const fails = selfTest();
  if (fails.length) {
    console.log('⛔ CONTROLS FAILED — refusing to report, because a classifier that '
      + 'cannot tell the three states apart prints the same list either way:');
    fails.forEach(f => console.log('   · ' + f));
    process.exit(2);
  }
  console.log(`  controls: pass   (baseline ref: ${BASE})\n`);

  const claims = scan();
  const by = { on_main: [], not_on_main: [], unresolvable: [] };
  const seen = new Map();
  for (const c of claims) {
    if (!seen.has(c.sha)) seen.set(c.sha, classify(c.sha));
    by[seen.get(c.sha)].push(c);
  }
  const shaCount = k => [...seen.values()].filter(v => v === k).length;
  console.log(`  ${claims.length} delivery claim(s) naming ${seen.size} distinct sha(s)`);
  console.log('  (counts below are SHAS, with claims in brackets — one sha is often claimed in several places)\n');
  console.log(`  ✅ ON MAIN        ${shaCount('on_main')}  [${by.on_main.length} claim(s)]`);
  console.log(`  ⚠️  NOT ON MAIN    ${shaCount('not_on_main')}  [${by.not_on_main.length} claim(s)]  — the named commit is not why it landed; CHECK THE CONTENT before concluding either way`);
  console.log(`  ⛔ UNRESOLVABLE   ${shaCount('unresolvable')}  [${by.unresolvable.length} claim(s)]  — on no ref in this clone; fetch all branches and re-run before believing it\n`);

  for (const k of ['unresolvable', 'not_on_main']) {
    if (!by[k].length) continue;
    console.log(`  ${k.toUpperCase()}:`);
    by[k].forEach(c => console.log(`     ${c.sha}  ${c.file}:${c.line}  "${c.verb}"`));
    console.log('');
  }
  console.log('  REPORT ONLY. Not-an-ancestor is not not-delivered — registers 249,\n'
    + '  254 and 204 are three cases where the two came apart, in both directions.');
}

if (require.main === module) main();
module.exports = { classify, scan, selfTest, CLAIM, BASE };
