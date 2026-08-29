#!/usr/bin/env node
/* TERRITORY: A. IS WHAT THE SITE SERVES WHAT ITS GENERATOR WOULD PRODUCE TODAY?
 *
 * ── THE GAP THIS FILLS ─────────────────────────────────────────────────────
 *
 * Every control in this repo runs INSIDE a tool and asks about that tool's
 * INPUTS. Nothing asks whether the file the tool WROTE was ever rebuilt after
 * those inputs moved. A rendered page is a fourth-generation artifact — board →
 * position_boards → strike.html — and it can be arbitrarily old with every
 * upstream control green.
 *
 * Register 412: `public/strike.html` was found TEN DAYS stale, differing from
 * its own generator by 1,260 lines (RB strike pick 113 → 33, WR 73 → 33, TE
 * 53 → 33). It was found by accident, while making an unrelated control compute.
 *
 * ── HOW IT CHECKS, AND WHY IT CANNOT DAMAGE THE SITE ───────────────────────
 *
 * ⛔ IT NEVER WRITES INTO `public/`. Each generator is run inside a THROWAWAY
 * GIT WORKTREE whose `public/` has been seeded with the live inputs, and the
 * output is compared there. Register 65 and register 109 are both incidents
 * where a probe mutated a tracked artifact and restored it afterwards — the
 * worktree removes the restore step entirely, which is the standing rule the
 * board-stability prereg set and which register 109 was filed for ignoring.
 *
 * ── WHAT A DIFFERENCE MEANS, AND WHAT IT DOES NOT ──────────────────────────
 *
 * A difference is NOT automatically a defect:
 *
 *   · the committed page may be honestly dated and deliberately frozen, which
 *     register 364 ruled is worth more than a silently refreshed one;
 *   · a generator that stamps `new Date()` into its output differs on every
 *     run by construction, so timestamp-only differences are reported
 *     SEPARATELY and never counted as staleness.
 *
 * So this reports, and says how big each difference is. It does not republish
 * and it has no `--strict`: the standing list was unmeasured when it was
 * written, and a red gate on an unknown backlog is the failure this repo keeps
 * paying for.
 *
 * Run: node draft/tools/published_page_freshness.js [--json PATH] [--keep]
 *      node draft/tools/published_page_freshness.js --self-test
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BUF = 64 * 1024 * 1024;                 // register 391

/* Discovered rather than listed: a tool that writes into `public/` declares
 * itself by doing so. A hand-kept list would go stale exactly the way the
 * pages do. */
function generators() {
  const dir = path.join(ROOT, 'draft', 'tools');
  const out = [];
  fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const outs = [...src.matchAll(/writeFileSync\(\s*path\.join\(\s*ROOT\s*,\s*'public'\s*,\s*'([^']+)'/g)]
      .map(m => m[1]);
    if (outs.length) out.push({ tool: 'draft/tools/' + f, outputs: [...new Set(outs)] });
  });
  return out.sort((a, b) => a.tool.localeCompare(b.tool));
}

/* A timestamp the generator stamps at run time. A page differing ONLY in these
 * is not stale, it is just re-rendered — counting it would make every page
 * look broken and bury the real signal. */
const TS = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g;
const stripTs = s => String(s).replace(TS, '<TS>');

function linesDiff(a, b) {
  const A = String(a).split('\n'), B = String(b).split('\n');
  const setB = new Set(B);
  const setA = new Set(A);
  let n = 0;
  A.forEach(l => { if (!setB.has(l)) n++; });
  B.forEach(l => { if (!setA.has(l)) n++; });
  return n;
}

function makeWorktree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pagefresh-'));
  const wt = path.join(dir, 'wt');
  execFileSync('git', ['worktree', 'add', '-q', '--detach', wt, 'HEAD'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
  /* Seed the worktree's public/ with the LIVE inputs, so the generators read
   * what the site reads rather than whatever HEAD happens to carry. */
  const src = path.join(ROOT, 'public'), dst = path.join(wt, 'public');
  fs.readdirSync(src).forEach(f => {
    const s = path.join(src, f);
    try { if (fs.statSync(s).isFile()) fs.copyFileSync(s, path.join(dst, f)); }
    catch (e) { /* a directory or an unreadable entry is not an input */ }
  });
  return { dir, wt };
}

function dropWorktree(w) {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', w.wt],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
  } catch (e) { /* best effort */ }
  try { fs.rmSync(w.dir, { recursive: true, force: true }); } catch (e) {}
  try {
    execFileSync('git', ['worktree', 'prune'], { cwd: ROOT, encoding: 'utf8', maxBuffer: BUF });
  } catch (e) {}
}

function selfTest() {
  let pass = 0, fail = 0;
  const ck = (n, ok, d) => { ok ? (pass++, console.log('PASS  ' + n))
    : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        ' + JSON.stringify(d).slice(0, 260) : ''))); };

  const gens = generators();
  ck('CONTROL — generators are DISCOVERED and at least one was found, so a clean '
    + 'result is not an empty scan', gens.length > 0, gens.map(g => g.tool));
  ck('  and strike_page is among them, which is the tool register 412 was found in',
    gens.some(g => /strike_page/.test(g.tool)), gens.map(g => g.tool));

  ck('KNOWN POSITIVE — a real content difference is counted',
    linesDiff('a\nb\nc', 'a\nX\nc') > 0);
  ck('KNOWN NEGATIVE — identical text is zero', linesDiff('a\nb', 'a\nb') === 0);
  ck('a timestamp-only difference is NOT content',
    linesDiff(stripTs('built 2026-08-29T00:01:25.106Z'),
              stripTs('built 2026-08-19T04:02:06Z')) === 0);
  ck('  but a difference BESIDE a timestamp still is',
    linesDiff(stripTs('built 2026-08-29T00:01:25.106Z pick 33'),
              stripTs('built 2026-08-19T04:02:06Z pick 113')) > 0);

  console.log('\n' + pass + '/' + (pass + fail) + ' self-tests passed');
  return fail ? 1 : 0;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const gens = generators();
  const w = makeWorktree();
  const rows = [];
  try {
    gens.forEach(g => {
      let ran = true, err = null;
      try {
        execFileSync('node', [path.join(w.wt, g.tool)],
          { cwd: w.wt, encoding: 'utf8', stdio: 'pipe', maxBuffer: BUF, timeout: 300000 });
      } catch (e) { ran = false; err = String(e.message).slice(0, 160); }
      g.outputs.forEach(o => {
        const live = path.join(ROOT, 'public', o);
        const fresh = path.join(w.wt, 'public', o);
        let a = null, b = null;
        try { a = fs.readFileSync(live, 'utf8'); } catch (e) {}
        try { b = fs.readFileSync(fresh, 'utf8'); } catch (e) {}
        rows.push({
          tool: g.tool, output: 'public/' + o, generator_ran: ran, generator_error: err,
          committed_bytes: a === null ? null : a.length,
          regenerated_bytes: b === null ? null : b.length,
          identical: a !== null && b !== null && a === b,
          content_lines_differing: (a === null || b === null) ? null
            : linesDiff(stripTs(a), stripTs(b)),
          timestamp_only: a !== null && b !== null && a !== b
            && stripTs(a) === stripTs(b),
        });
      });
    });
  } finally {
    if (!process.argv.includes('--keep')) dropWorktree(w);
  }

  const stale = rows.filter(r => r.content_lines_differing > 0);
  const tsOnly = rows.filter(r => r.timestamp_only);
  const broken = rows.filter(r => !r.generator_ran || r.regenerated_bytes === null);

  console.log('PUBLISHED PAGE FRESHNESS — is what the site serves what its generator '
    + 'would produce today?\n');
  console.log('  ⛔ nothing is written into public/. Every generator runs in a throwaway');
  console.log('     git worktree seeded with the live inputs (registers 65, 109).\n');
  console.log('  ' + rows.length + ' published output(s) from ' + gens.length + ' generator(s)\n');
  rows.forEach(r => {
    const verdict = !r.generator_ran ? '⚠️  GENERATOR FAILED'
      : r.identical ? '✅ identical'
      : r.timestamp_only ? '🕐 timestamp only — re-rendered, not stale'
      : r.content_lines_differing === null ? '⚠️  could not compare'
      : '🔴 ' + r.content_lines_differing + ' content line(s) differ';
    console.log('  ' + r.output.padEnd(30) + verdict);
    if (r.generator_error) console.log('        ' + r.generator_error);
  });
  console.log('\n  ' + stale.length + ' with a CONTENT difference · ' + tsOnly.length
    + ' timestamp-only · ' + broken.length + ' whose generator did not produce a file');
  console.log('\n  ⚠️  A DIFFERENCE IS NOT AUTOMATICALLY A DEFECT. A page may be honestly');
  console.log('      dated and deliberately frozen, which register 364 ruled is worth more');
  console.log('      than a silently refreshed one. Read the page before republishing —');
  console.log('      and republishing what the site serves is a DEPLOY, not a tool fix.');

  const rep = {
    _territory: 'TERRITORY: A — draft/tools/published_page_freshness.js',
    _answers: 'register 412',
    _generated_at: new Date().toISOString(),
    _note: 'REPORT ONLY. Never writes into public/; generators run in a throwaway worktree.',
    generators: gens, outputs: rows,
    content_differences: stale.length, timestamp_only: tsOnly.length,
    generators_that_failed: broken.length,
  };
  const i = process.argv.indexOf('--json');
  if (i >= 0) {
    fs.writeFileSync(process.argv[i + 1], JSON.stringify(rep, null, 1) + '\n');
    console.log('\n  wrote ' + process.argv[i + 1]);
  }
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { generators, linesDiff, stripTs };
