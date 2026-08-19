// TERRITORY: A
/* RE-RUN EVERY ENGINE-DRIVEN STUDY UNDER BOTH VONA ARMS AND REPORT WHAT MOVED.
 *
 * P109 / `VONA-RERUN-SWEEP-PREREG.md`. Cory, 2026-08-19: *"we need to run more
 * tests using correct vona calc. Test our roster building, our adjusters etc."*
 *
 * A fix to the primary decision metric is RETROACTIVE. Thirty-three harnesses
 * drive `recommend()`, and every conclusion any of them produced was measured
 * on a `vona()` that priced the cost of waiting on a player over a pool that
 * excluded him. This runs each of them twice — a0 (pre-fix) and a1 (shipped) —
 * through `vona_arm_preload.js`, so THE STUDY IS BYTE-IDENTICAL BETWEEN ARMS
 * and exactly one thing differs.
 *
 * ── IT REPORTS. IT DOES NOT SELECT. ───────────────────────────────────────
 * No weight, flag or configuration is changed by anything here (no_fit_guard).
 * A study whose conclusion moves earns a REGISTER ROW naming what we no longer
 * know, not a new configuration shipped on a re-run.
 *
 * ── THE THREE OUTCOMES, AND WHY THE THIRD ONE MATTERS MOST ────────────────
 *   SAME       — byte-identical output. The conclusion cannot have moved.
 *   DIFFERS    — output differs; a human reads the diff and rules HOLDS/MOVED.
 *   UNREADABLE — the study fails or times out under either arm. **A study too
 *                slow or too broken to re-run is not a study that holds**, and
 *                calling that out is half the value of the sweep: a harness
 *                nobody can re-run is a conclusion nobody can check.
 *
 * A study that prints a timestamp or a random seed will DIFFER for reasons that
 * have nothing to do with VONA. That is why this reports a diff for a human to
 * read rather than auto-classifying: an automatic HOLDS/MOVED verdict here
 * would be a probe with no known positive, which is the failure this project
 * has written three rules about.
 *
 * Run: node draft/tools/vona_rerun_sweep.js [--timeout 300] [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const TIMEOUT = parseInt(arg('timeout', '300'), 10) * 1000;
const ONLY = arg('only', null);

/* THE POPULATION IS DISCOVERED, NOT LISTED. A hand-kept list of studies is a
 * list that silently stops covering the new ones — and "which studies rest on
 * vona()" is exactly the question a stale list answers wrongly. A file counts
 * if it requires the engine AND drives it. */
function studies() {
  const dirs = [path.join(ROOT, 'draft', 'tools'), path.join(ROOT, 'draft', 'backtest')];
  const out = [];
  dirs.forEach(d => fs.readdirSync(d).filter(f => f.endsWith('.js')).forEach(f => {
    const p = path.join(d, f);
    const src = fs.readFileSync(p, 'utf8');
    if (!/draft['"\s,)\]]*[,)]?\s*['"]engine\.js|draft\/engine\.js/.test(src)) return;
    if (!/\.recommend\s*\(|scorePlayer\s*\(|\.vona\s*\(/.test(src)) return;
    // The sweep must not sweep itself, nor the arm machinery it runs through.
    if (/vona_rerun_sweep|vona_arm_preload/.test(f)) return;
    out.push(path.relative(ROOT, p));
  }));
  return out.sort();
}

function run(rel, arm) {
  const started = Date.now();
  try {
    const stdout = cp.execSync(
      'node -r ./draft/tools/vona_arm_preload.js ' + rel,
      { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT,
        maxBuffer: 64 * 1024 * 1024,
        env: Object.assign({}, process.env, { VONA_ARM: arm }) });
    return { ok: true, out: stdout, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, ms: Date.now() - started,
             why: e.killed ? 'TIMEOUT after ' + (TIMEOUT / 1000) + 's'
                           : String((e.message || '').split('\n')[0]).slice(0, 200),
             out: String(e.stdout || '') };
  }
}

/* The preload's own banner line differs between arms BY DESIGN, so it is
 * stripped before comparison — otherwise every study would "differ" and the
 * sweep would report a 100% movement rate that means nothing. */
const strip = s => String(s || '').split('\n').filter(l => !/^# VONA_ARM=/.test(l)).join('\n');

function firstDiff(a, b) {
  const la = strip(a).split('\n'), lb = strip(b).split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return { line: i + 1, a0: (la[i] || '(end)').slice(0, 160),
                                  a1: (lb[i] || '(end)').slice(0, 160) };
  }
  return null;
}

/* ── THE CONTROL, AND IT IS NOT OPTIONAL FOR BELIEVING ANY "DIFFERS" ──────
 * `--control` runs a1 against a1. Every study MUST then come back SAME. Any
 * that does not is NONDETERMINISTIC — a simulator reseeding, a timestamp, a
 * Set iteration order — and its "DIFFERS" in the real sweep carries no
 * information about VONA at all. Rule 3e: this sweep's positive is
 * stack_effect (hand-verified: 60 board movers under a0, 59 under a1); this is
 * its negative, and it is the one that decides which positives are readable. */
const CONTROL = process.argv.indexOf('--control') >= 0;
const ARM_B = CONTROL ? 'a1' : 'a1';
const ARM_A = CONTROL ? 'a1' : 'a0';

const list = ONLY ? studies().filter(s => s.indexOf(ONLY) >= 0) : studies();
console.log('VONA RE-RUN SWEEP — ' + list.length + ' engine-driven studies, '
  + ARM_A + ' vs ' + ARM_B + (CONTROL ? '  ⚠️ CONTROL: every study must come back SAME'
                                      : '  (pre-fix vs shipped)')
  + ', timeout ' + (TIMEOUT / 1000) + 's each\n');

const rows = [];
list.forEach((rel, i) => {
  const r0 = run(rel, ARM_A);
  const r1 = run(rel, ARM_B);
  let status, detail = null;
  if (!r0.ok || !r1.ok) {
    status = 'UNREADABLE';
    detail = { a0: r0.ok ? 'ok' : r0.why, a1: r1.ok ? 'ok' : r1.why };
  } else if (strip(r0.out).trim().length === 0) {
    /* ⚠️ EMPTY OUTPUT IS **UNREADABLE**, NOT "SAME" — AND THE CONTROL RUN IS
     * WHAT CAUGHT THIS, BEFORE ANY RESULT WAS WRITTEN DOWN.
     *
     * `draft/backtest/replay.js` came back "SAME 0s". It is a MODULE with no
     * CLI entry point: running it directly executes nothing and prints nothing,
     * two empty strings compare equal, and the sweep cheerfully reported that
     * one of the two most important harnesses in the project was unaffected by
     * the fix. That is a null from a probe that has never returned a positive —
     * "nothing found" and "asked wrong" are indistinguishable from the outside,
     * and only one of them is a finding (Rule 3e). A sweep that launders
     * "I could not run this" into "this holds" is worse than no sweep, because
     * it retires the question. */
    status = 'UNREADABLE';
    detail = { why: 'NO OUTPUT when run directly — a library or a harness with '
                  + 'no CLI entry point, not a study that holds. Re-run it '
                  + 'through its own runner under both arms.' };
  } else if (strip(r0.out) === strip(r1.out)) {
    status = 'SAME';
  } else {
    status = 'DIFFERS';
    detail = firstDiff(r0.out, r1.out);
  }
  const secs = Math.round((r0.ms + r1.ms) / 1000);
  rows.push({ study: rel, status: status, seconds: secs, detail: detail,
              a0_lines: strip(r0.out).split('\n').length });
  console.log('  [' + String(i + 1).padStart(2) + '/' + list.length + '] '
    + status.padEnd(11) + rel.replace('draft/', '').padEnd(38) + secs + 's'
    + (status === 'DIFFERS' && detail ? '   first diff at line ' + detail.line : '')
    + (status === 'UNREADABLE' ? '   ' + JSON.stringify(detail) : ''));
});

const by = s => rows.filter(r => r.status === s);
if (CONTROL && by('DIFFERS').length) {
  console.log('\n  ⚠️ NONDETERMINISTIC UNDER A FIXED ARM — these studies\' diffs in the '
    + 'real sweep mean nothing about VONA:');
  by('DIFFERS').forEach(r => console.log('     ' + r.study));
}
console.log('\n  SAME ' + by('SAME').length
  + '   DIFFERS ' + by('DIFFERS').length
  + '   UNREADABLE ' + by('UNREADABLE').length + '  of ' + rows.length);

const doc = {
  _territory: 'TERRITORY: A — draft/tools/vona_rerun_sweep.js',
  _note: 'REPORT ONLY. Compares each engine-driven study\'s output under the '
       + 'pre-fix and shipped VONA. DIFFERS means the output moved, NOT that '
       + 'the conclusion moved — a human reads the diff and rules HOLDS/MOVED, '
       + 'because an automatic verdict here would be a probe with no known '
       + 'positive.',
  prereg: 'draft/backtest/VONA-RERUN-SWEEP-PREREG.md',
  arms: { a: ARM_A, b: ARM_B },
  control_run: CONTROL,
  timeout_seconds: TIMEOUT / 1000,
  counts: { SAME: by('SAME').length, DIFFERS: by('DIFFERS').length,
            UNREADABLE: by('UNREADABLE').length, total: rows.length },
  studies: rows,
};
const outPath = arg('json', null);
if (outPath) { fs.writeFileSync(outPath, JSON.stringify(doc, null, 1)); console.log('\nwrote ' + outPath); }
module.exports = { studies, doc };
