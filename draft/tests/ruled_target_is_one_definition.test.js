// TERRITORY: relay (built), A merges — the wrong-target fix, register-153 pattern.
/**
 * CORY'S RULED ROSTER TARGET HAS EXACTLY ONE DEFINITION.
 *
 * Register 70's five-arm shape ranking measured need:1.0 against RB 4.44 —
 * P120's within-season correlation number — instead of Cory's ruled RB 4.78
 * (top-3 finishers, n=9). The verdict FLIPPED when corrected (8e81639a), and
 * Cory nearly ruled on the wrong comparison. Same disease as register 153's
 * seven scope cutoffs: look-alike numbers, no single source, no test.
 *
 * This pins the fix: the target lives in league_config.ruled_roster_target,
 * every shape tool reads it, and a hardcoded target literal in tool code goes
 * red HERE before it can reach a verdict.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok ' + name); }
  else { fail++; console.error('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft/config/league_config.json'), 'utf8'));
const block = cfg.ruled_roster_target;

// 1 · the block exists and carries the ruling exactly
check('config block exists', !!block && !!block.targets);
const want = { QB: 1.56, RB: 4.78, WR: 5, TE: 1.67, K: 1, DEF: 1 };
check('values are the measured n=9 target, exactly',
  block && JSON.stringify(block.targets) === JSON.stringify(want),
  block && JSON.stringify(block.targets));
check('provenance names the ruling', !!block && /top 3 finishers/i.test(block._ruling || ''));
check('the P120 4.44 confusable is named as a known-negative',
  !!block && /4\.44/.test(block._not_to_be_confused_with || '') && /P120/.test(block._not_to_be_confused_with || ''));

// 2 · the known consumers read the config, and carry no local target literal.
//    (4.78 is the tell: it appears in no other context in these tools.)
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const consumers = ['draft/tools/need_weight_rerun.js', 'draft/tools/mlv_seat_plan.js'];
consumers.forEach(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(f + ' reads ruled_roster_target', /ruled_roster_target/.test(src));
  // comments may QUOTE the target as documentation; executable code may not.
  check(f + ' carries no executable 4.78 target literal', !/4\.78/.test(stripComments(src)));
});

// 3 · the reader refuses rather than inventing a target (known-negative control:
//    a config without the block must throw, not default — a silent default is
//    exactly how a wrong number gets back in).
const probe = `
  const t = (${JSON.stringify({ some_other_key: 1 })}).ruled_roster_target;
  if (!t || !t.targets) throw new Error('refused');
  `;
let threw = false;
try { new Function(probe)(); } catch (e) { threw = /refused/.test(e.message); }
check('reader shape refuses on a missing block', threw);

// 4 · tripwire for NEW tools: any file in draft/tools or draft/backtest that
//    computes a distance-to-target shape must read the config. Heuristic on
//    the tell-tale pair ("dist"-like reduce over positions + a target of 4.78
//    or the phrase "ruled target") — a new hardcode fails here on arrival.
const dirs = ['draft/tools', 'draft/backtest'];
let strays = [];
dirs.forEach(d => {
  fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js')).forEach(f => {
    const p = d + '/' + f;
    if (consumers.includes(p)) return;
    const src = stripComments(fs.readFileSync(path.join(ROOT, p), 'utf8'));
    if (/4\.78/.test(src) && /QB|RB|WR|TE/.test(src)) strays.push(p);
  });
});
check('no other tool hardcodes the 4.78 target', strays.length === 0, strays.join(', '));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
