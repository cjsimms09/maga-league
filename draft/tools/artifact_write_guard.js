#!/usr/bin/env node
/* TERRITORY: A.  A STUDY'S ARTIFACT CANNOT BE COMMITTED BY ACCIDENT.
 *
 * ── WHY THIS EXISTS, AND IT IS ABOUT MY OWN CONDUCT (register 388) ─────────
 *
 * On 2026-08-28 I committed six regenerated artifacts by accident — in the
 * commit about artifact provenance — and then did it a second time an hour
 * later. Running a study is a WRITE: every module in the registry rewrites its
 * own artifact as a side effect of being run, and `git add -A` after a
 * diagnostic run takes all of it.
 *
 * THE FIRST TIME IT REACHED HISTORY. The diff was not cosmetic:
 * `own_attribution_2026.json` flipped `"market_arm": false` -> `true`, so a
 * committed layer attribution silently began describing a different model
 * configuration, and `public/market_upside_2026.json` — a PUBLISHED file —
 * moved 705 lines with a ten-day jump in `captured_at`.
 *
 * My fix at the time was "run `git status` first". That is a resolution, not a
 * mechanism, and this project's own standard says which of those survives
 * (register 300: the mechanism is what survives; the human noticing is what
 * does not). The second occurrence, one hour later, is the proof.
 *
 * ── WHAT IT ENFORCES ───────────────────────────────────────────────────────
 *
 * A commit that changes a REGISTERED artifact must SAY SO, by naming that
 * artifact's id in the commit message. Deliberate regeneration is thereby
 * unaffected — you were going to describe it anyway — while debris from a
 * diagnostic run is refused, because nobody writes an artifact id into a
 * message about something else.
 *
 * The authoritative set is `draft/data/artifact_registry.json`'s own
 * `artifact_path` list, NOT a pattern over `*.json`. That matters: a pattern
 * would also catch `premises.json`, the registry itself and the id watermark,
 * and a guard that fires on ordinary work is a guard people delete.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 *
 * It does not judge whether a regeneration is WISE — register 387 is exactly a
 * case where the right answer was "cut a second dated artifact instead", and no
 * hook can make that call. It only insists the change was INTENDED and said out
 * loud, so the decision happens in daylight.
 *
 * Run:  node draft/tools/artifact_write_guard.js <commit-msg-file>
 *       node draft/tools/artifact_write_guard.js --staged-only   (report)
 *       node draft/tools/artifact_write_guard.js --self-test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const REGISTRY = path.join(ROOT, 'draft', 'data', 'artifact_registry.json');

/** Registered artifact path -> id. REFUSES rather than defaulting to empty: an
 *  unreadable registry that silently becomes {} would wave every artifact
 *  through, which is the failure this guard exists to prevent. */
function registered() {
  const doc = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
  const entries = doc.entries;
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error('artifact_registry.json has no entries array');
  }
  const map = new Map();
  for (const e of entries) if (e.artifact_path) map.set(e.artifact_path, e.id || e.artifact_path);
  if (!map.size) throw new Error('no entry declares an artifact_path');
  return map;
}

/** The decision, pure and testable: which staged artifacts are undeclared? */
function undeclared(stagedPaths, message, regMap) {
  const msg = String(message || '');
  const out = [];
  for (const p of stagedPaths) {
    const id = regMap.get(p);
    if (!id) continue;                       // not a registered artifact
    // Declared by naming EITHER the id or the path in the message.
    if (msg.includes(id) || msg.includes(p)) continue;
    out.push({ path: p, id: id });
  }
  return out;
}

function stagedFiles() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only'],
    { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

function selfTest() {
  const reg = new Map([
    ['draft/backtest/own_attribution_2026.json', 'own_attribution_2026'],
    ['public/market_upside_2026.json', 'market_upside_2026'],
  ]);
  const A = 'draft/backtest/own_attribution_2026.json';
  const cases = [
    ['KNOWN-POSITIVE — an artifact staged with an unrelated message is REFUSED '
      + '(the exact shape that reached history on 08-28)',
      [A, 'draft/tools/foo.js'], 'Register 386: fix the artifact contract', 1],
    ['KNOWN-NEGATIVE — naming the artifact id lets a DELIBERATE regeneration through',
      [A], 'Regenerate own_attribution_2026 post-draft with the market arm live', 0],
    ['the full PATH also counts as a declaration',
      [A], 'rebuilt draft/backtest/own_attribution_2026.json deliberately', 0],
    ['a commit touching NO artifact is untouched — the guard must not fire on '
      + 'ordinary work, or it gets deleted',
      ['draft/tools/premise_check.js', 'DEFECT-REGISTER.md'], 'anything at all', 0],
    ['TWO undeclared artifacts are both reported, not just the first',
      [A, 'public/market_upside_2026.json'], 'unrelated message', 2],
    ['declaring ONE does not smuggle the OTHER through',
      [A, 'public/market_upside_2026.json'], 'own_attribution_2026 only', 1],
    ['an unregistered json is NOT an artifact — premises.json, the registry and '
      + 'the watermark must stay freely committable',
      ['draft/config/premises.json', 'draft/data/register_id_watermark.json'], 'x', 0],
  ];
  let bad = 0;
  for (const [name, staged, msg, want] of cases) {
    const got = undeclared(staged, msg, reg).length;
    const ok = got === want;
    if (!ok) bad++;
    console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : `  — got ${got}, want ${want}`));
  }
  // The live registry must actually load, or this guard is decorative.
  let live = null;
  try { live = registered(); } catch (e) { /* below */ }
  const okLive = live && live.size >= 10;
  if (!okLive) bad++;
  console.log((okLive ? 'PASS  ' : 'FAIL  ')
    + 'CONTROL — the LIVE registry loads and declares artifacts ('
    + (live ? live.size : 0) + '), so the guard is not silently guarding nothing');

  console.log('\n' + (cases.length + 1 - bad) + '/' + (cases.length + 1) + ' self-tests passed');
  return bad ? 1 : 0;
}

function main(argv) {
  if (argv[0] === '--self-test') return selfTest();

  let regMap;
  try { regMap = registered(); } catch (e) {
    console.error('ARTIFACT GUARD: cannot read the registry (' + e.message
      + '). REFUSING the commit rather than waving every artifact through.');
    return 2;
  }

  const staged = stagedFiles();
  const msg = argv[0] && argv[0] !== '--staged-only'
    ? fs.readFileSync(argv[0], 'utf8') : '';
  const bad = undeclared(staged, msg, regMap);

  if (!bad.length) return 0;

  console.error('\n⛔ ARTIFACT WRITE GUARD — ' + bad.length
    + ' registered artifact(s) are staged but not named in the commit message:\n');
  bad.forEach(b => console.error('     ' + b.path + '   (id: ' + b.id + ')'));
  console.error('\n  RUNNING A STUDY IS A WRITE. Every registered module rewrites its own');
  console.error('  artifact as a side effect, so a diagnostic run plus `git add -A` puts');
  console.error('  it here without anyone deciding to. That reached history on 2026-08-28');
  console.error('  and changed a published file and a model configuration (register 388).\n');
  console.error('  If this is DEBRIS — the usual case:');
  bad.forEach(b => console.error('     git checkout -- ' + b.path));
  console.error('\n  If it is DELIBERATE, say so: name the id in the commit message, e.g.');
  console.error('     "Regenerate ' + bad[0].id + ': <why, and what changes meaning>"');
  console.error('\n  ⚠️ Before you declare it, read register 387: replacing an artifact in');
  console.error('  place silently changes what every existing citation of it MEANS. A');
  console.error('  second dated artifact is often the right answer instead.\n');
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { undeclared, registered };
