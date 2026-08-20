#!/usr/bin/env node
/**
 * `origin/main` IS A LOCAL CACHE, AND EVERY TOOL THAT READS IT CAN BE WRONG BY
 * AN HOUR WITHOUT SAYING SO.
 *
 * ── THE INCIDENT, AND IT WAS INSIDE THE FIX ───────────────────────────────
 *
 * `routes_branch_reconcile.js` exists because the relay quoted `main`'s backlog
 * to Cory while four lanes were clearing on branches `main` could not see
 * (register 5p). On 2026-08-19, one day later, that same tool was run again —
 * and `origin/main` turned out to be **45 commits stale**. It had printed
 * confident per-lane numbers computed against an hour-old ref, with nothing on
 * screen to suggest it.
 *
 * `git show origin/main:FILE` never fails on a stale ref. It succeeds, quickly,
 * with the wrong content. That is the exact shape of every probe failure in this
 * project's rule 3e/3f history: **clean plausible output, aimed slightly off.**
 *
 * ── WHY A BANNER AND NOT AN AUTOMATIC FETCH ───────────────────────────────
 *
 * A report tool that silently reaches the network is a report tool that behaves
 * differently on a plane, in CI, and behind a proxy — and `draft-night-sync.yml`
 * already taught this repo what an unexercised network path costs. Fetching is
 * also a WRITE to the local repo, which a tool documented as "reports; never
 * merges" has no business doing.
 *
 * So it MEASURES and SHOUTS. The caller decides.
 *
 * ⚠️ AND THE THRESHOLD IS DELIBERATELY SHORT. 15 minutes looks aggressive until
 * you look at the merge cadence it is measuring: on the evening this was
 * written, `main` took 16 commits in 73 minutes. At that rate a ref half an hour
 * old is a different repository. A guard tuned to a quiet week would have said
 * nothing on the night it was needed.
 *
 * Run: node draft/tools/git_ref_freshness.js [ref]
 */
'use strict';

const { execSync } = require('child_process');

/** Past this, the ref is old enough that a quoted number may be wrong. */
const STALE_MINUTES = 15;

function refAgeMinutes(ref, nowMs, cwd) {
  const iso = execSync('git log -1 --format=%cI ' + ref, {
    cwd: cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 60000;
}

/**
 * The banner text, or `null` when the ref is fresh. Returned rather than printed
 * so the caller can place it ABOVE its numbers — a warning under a table is a
 * warning read after the number has already been believed.
 */
function stalenessBanner(ref, ageMinutes, staleMinutes) {
  const limit = staleMinutes == null ? STALE_MINUTES : staleMinutes;
  if (ageMinutes == null) {
    return '⚠️  COULD NOT DATE ' + ref + ' — treat every number below as unverified.';
  }
  if (ageMinutes <= limit) return null;
  const h = ageMinutes >= 60
    ? (ageMinutes / 60).toFixed(1) + 'h' : Math.round(ageMinutes) + 'm';
  return '⚠️  ' + ref + ' IS ' + h + ' OLD — RUN `git fetch origin main` FIRST.\n'
    + '     Every number below is computed against that cached ref, and `git show`\n'
    + '     succeeds on a stale one: it returns the wrong content, fast, silently.\n'
    + '     Measured 2026-08-19: this ref was 45 commits behind while a tool built\n'
    + '     to stop exactly this kind of wrong number was printing per-lane counts.';
}

/** Convenience: measure and print above the caller's own output. Returns the age. */
function warnIfStale(ref, cwd, staleMinutes) {
  let age = null;
  try { age = refAgeMinutes(ref, Date.now(), cwd); } catch (e) { age = null; }
  const banner = stalenessBanner(ref, age, staleMinutes);
  if (banner) console.log(banner + '\n');
  return age;
}

module.exports = { refAgeMinutes, stalenessBanner, warnIfStale, STALE_MINUTES };

if (require.main === module) {
  const ref = process.argv[2] || 'origin/main';
  const age = warnIfStale(ref, process.cwd());
  if (age != null && !stalenessBanner(ref, age)) {
    console.log('✅ ' + ref + ' is ' + Math.round(age) + 'm old — fresh enough to quote.');
  }
  process.exit(0);
}
