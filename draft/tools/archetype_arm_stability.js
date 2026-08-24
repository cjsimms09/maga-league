/* TERRITORY: D — report-only instrument, writes nothing. Registers 280 / P329 / P330.
 * Run: node draft/tools/archetype_arm_stability.js
 *
 * DOES AN ARM'S RESULT SURVIVE THE CONFIGURATION IT WAS MEASURED IN?
 *
 * ⚠️ THIS TOOL SHIPPED WITH THE EXACT BUG IT EXISTS TO CATCH, AND IS FIXED HERE.
 * v1 compared every committed artifact against every other and printed
 * "UNSTABLE" wherever two disagreed. It never checked whether the two were
 * COMPARABLE. They are not: the committed artifacts differ on `rooms` (40 vs
 * 120), on `wire_floor` (null vs a real floor -- one is literally named
 * `_wirefloor`), and on `opp_keeper_teams` (0, 3, 4). Two artifacts running
 * different experiments are SUPPOSED to disagree; calling that instability is
 * the same error as reading a single-model result as robust. Register 295's
 * first headline was built on a v1 flag and is corrected there.
 *
 * v2 compares only artifacts whose declared configuration MATCHES on every
 * field below, and reports incomparable groups separately rather than silently
 * pooling them.
 *
 * CONTROLS (Rule 3e/3f):
 *   C1 at least 2 artifacts load, or the comparison is vacuous.
 *   C2 the DETECTOR works on synthetic input: a fabricated opposite-sign pair
 *      must flag, a same-sign pair must not. Asserting a real answer would be
 *      circular; this asserts the mechanism.
 *   C3 THE COMPARABILITY GATE ITSELF FIRES: the known-incomparable pair
 *      (archetype_rooms.json vs archetype_rooms_wirefloor.json, differing on
 *      rooms/wire_floor/opp_keeper_teams) must land in DIFFERENT groups. This
 *      is the control v1 did not have and the reason its headline was wrong.
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'draft', 'data');

const files = fs.readdirSync(DIR)
  .filter(f => /^archetype_rooms.*\.json$/.test(f))
  .sort();
const docs = [];
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { continue; }
  if (!d || !d.paired_vs_shipped || !Array.isArray(d.arms)) continue;
  docs.push({ f, d });
}
console.log('artifacts read:', docs.length);
for (const { f, d } of docs) {
  console.log(`  ${f.padEnd(42)} opponents=${String(d.opponents).padEnd(9)} keepers=${String(d.keepers).padEnd(11)}`
    + ` rooms=${d.rooms} seed_start=${d.seed_start} generated=${(d.generated_at || '?').slice(0, 10)}`);
}
const models = new Set(docs.map(x => String(x.d.opponents)));
if (docs.length < 2 || models.size < 2) {
  console.error('\nCONTROL C1 FAILED — need >=2 artifacts spanning >=2 opponent models; got '
    + docs.length + ' / ' + models.size);
  process.exit(2);
}
console.log('\nC1 ok —', docs.length, 'artifacts,', models.size, 'opponent models:', [...models].join(', '));

const CFG = ['opponents', 'keepers', 'rooms', 'seed_start', 'sims_per_room',
  'wire_floor', 'engine_flags', 'opp_keeper_teams'];
const keyOf = d => CFG.map(k => k + '=' + JSON.stringify(d[k])).join(' | ');
const groups = new Map();
for (const x of docs) {
  const k = keyOf(x.d);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(x);
}
console.log('\ncomparable groups (identical declared config):', groups.size);
let gi = 0;
const unstable = [];
for (const [k, gd] of groups) {
  gi++;
  console.log(`\n  group ${gi} (${gd.length} artifact${gd.length > 1 ? 's' : ''}): ${gd.map(x => x.f).join(', ')}`);
  if (gd.length < 2) { console.log('    only one artifact — nothing to compare'); continue; }
  const garms = [...new Set(gd.flatMap(x => x.d.arms))].filter(a => a !== 'shipped').sort();
  let compared = 0;
  for (const arm of garms) {
    const rows = gd.map(x => (x.d.paired_vs_shipped[arm] || {}).mean_weekly).filter(r => r && r.ci95);
    if (rows.length < 2) continue;
    compared++;
    let pos = 0, neg = 0;
    for (const r of rows) {
      if (!(r.ci95[0] > 0 || r.ci95[1] < 0)) continue;
      if (r.mean > 0) pos++; else if (r.mean < 0) neg++;
    }
    if (pos && neg) { unstable.push(arm + ' (group ' + gi + ')'); console.log(`    *** ${arm}: significant BOTH ways ***`); }
  }
  console.log(`    arms carried by >=2 artifacts in this group: ${compared}`);
}
console.log('\nUNSTABLE within a comparable group:', unstable.length ? unstable.join(', ') : 'none');

// ── C2: synthetic controls for the DETECTOR, not for the answer ────────────
function flags(a, b) {          // a, b: [mean, lo, hi]
  const sig = r => r[1] > 0 || r[2] < 0;
  let pos = 0, neg = 0;
  for (const r of [a, b]) { if (!sig(r)) continue; if (r[0] > 0) pos++; else neg++; }
  return pos > 0 && neg > 0;
}
const posCase = flags([+1.5, +0.8, +2.2], [-1.2, -1.9, -0.5]);   // must flag
const negCase = flags([-1.5, -2.2, -0.8], [-1.2, -1.9, -0.5]);   // must NOT flag
if (!posCase || negCase) {
  console.error('\nCONTROL C2 FAILED — detector: opposite-sign pair flagged=' + posCase
    + ' (want true), same-sign pair flagged=' + negCase + ' (want false)');
  process.exit(2);
}
console.log('C2 ok — detector flags an opposite-sign pair and not a same-sign pair.');

// ── C3: the comparability gate must actually separate a known-incomparable pair
{
  const a = docs.find(x => x.f === 'archetype_rooms.json');
  const b = docs.find(x => x.f === 'archetype_rooms_wirefloor.json');
  if (!a || !b) {
    console.error('\nCONTROL C3 FAILED — the known-incomparable pair is not present to test the gate');
    process.exit(2);
  }
  if (keyOf(a.d) === keyOf(b.d)) {
    console.error('\nCONTROL C3 FAILED — archetype_rooms.json and archetype_rooms_wirefloor.json '
      + 'landed in the SAME group. They differ on rooms (40 vs 120), wire_floor (null vs set) '
      + 'and opp_keeper_teams (4 vs 3). A gate that pools them is the v1 bug.');
    process.exit(2);
  }
  console.log('C3 ok — the known-incomparable pair is separated by the config gate.');
}

// ── the headline this tool exists to print ─────────────────────────────────
const ma = docs.map(x => ({ f: x.f, r: (x.d.paired_vs_shipped.market_adp || {}).mean_weekly }))
  .filter(x => x.r && x.r.ci95);
const maNeg = ma.filter(x => x.r.ci95[1] < 0).length;
console.log('\nmarket_adp across COMMITTED artifacts: ' + ma.length + ' carry it, '
  + maNeg + ' say it LOSES significantly, '
  + ma.filter(x => x.r.ci95[0] > 0).length + ' say it wins.');
ma.forEach(x => console.log(`  ${x.f.padEnd(42)} ${x.r.mean >= 0 ? '+' : ''}${x.r.mean.toFixed(4)}`
  + ` [${x.r.ci95[0].toFixed(2)}, ${x.r.ci95[1].toFixed(2)}]`));
console.log('P321 was published on an UNCOMMITTED +1.3712. None of the above was consulted.');

process.exitCode = unstable.length ? 1 : 0;
