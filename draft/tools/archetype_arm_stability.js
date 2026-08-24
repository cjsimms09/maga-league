/* TERRITORY: D — report-only instrument, writes nothing. Registers 280 / P329 / P330.
 * Run: node draft/tools/archetype_arm_stability.js
 *
 * DOES AN ARM'S RESULT SURVIVE THE CONFIGURATION IT WAS MEASURED IN?
 *
 * P329 cost a day: I replicated `market_adp` across two disjoint seed blocks,
 * published three grades on it, and only then swapped the opponent model and
 * watched the sign reverse. The deeper failure was cheaper than that to avoid --
 * `draft/data/archetype_rooms_wirefloor.json` has carried the OPPOSITE SIGN for
 * that arm, at my exact opponents/keepers configuration, since 2026-08-16. The
 * contradicting evidence was committed in this repo and nothing read it.
 *
 * So this reads EVERY committed archetype_rooms artifact and reports, per arm,
 * whether the paired-vs-shipped sign agrees across all of them -- and prints the
 * configuration axes (opponents, keepers, board era) that vary between them, so
 * a disagreement is attributable rather than mysterious.
 *
 * EXIT CODE GATES: non-zero if any arm's sign flips while its CI excludes zero
 * on both sides. That is the state in which two artifacts in this repo make
 * contradictory significant claims about the same arm.
 *
 * CONTROLS (Rule 3e/3f) -- a clean "all agree" is exactly what a broken reader
 * prints, so two things are asserted before any verdict:
 *   C1 at least 2 artifacts loaded and at least 2 distinct `opponents` values,
 *      or the comparison is vacuous.
 *   C2 a SYNTHETIC contradiction is detected, and a SYNTHETIC agreement is not.
 *      Two fabricated records are pushed through the same detector: one pair
 *      significant in opposite directions (must flag), one pair significant the
 *      same way (must not). Asserting the real answer would be circular; this
 *      asserts the mechanism.
 *
 * ⚠️ C2 ORIGINALLY ASSERTED THE WRONG THING AND FAILED ON ITS FIRST RUN, WHICH
 * IS THE ONLY REASON THE HEADLINE BELOW IS RIGHT. It demanded that `market_adp`
 * be reported UNSTABLE. It is not: all FOUR committed artifacts carrying that
 * arm say it LOSES (-0.97 to -2.23, every CI excluding zero). The +1.37 that
 * P321 was built on lives in no committed artifact -- it was produced, reverted
 * (correctly, the store is A's), replicated only against itself on a second
 * seed block, and published. Four committed artifacts disagreed with it the
 * whole time and none was consulted.
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

const arms = [...new Set(docs.flatMap(x => x.d.arms))].filter(a => a !== 'shipped').sort();
const unstable = [];
console.log('\narm            n  sig+  sig-   verdict');
for (const arm of arms) {
  let pos = 0, neg = 0, n = 0;
  for (const { d } of docs) {
    const r = (d.paired_vs_shipped[arm] || {}).mean_weekly;
    if (!r || !r.ci95) continue;
    n++;
    const sig = r.ci95[0] > 0 || r.ci95[1] < 0;
    if (!sig) continue;
    if (r.mean > 0) pos++; else if (r.mean < 0) neg++;
  }
  let verdict = '';
  if (pos && neg) { verdict = '*** UNSTABLE — significant BOTH ways ***'; unstable.push(arm); }
  else if (pos || neg) verdict = 'consistent';
  else verdict = 'never significant';
  console.log(`${arm.padEnd(15)}${String(n).padStart(2)}${String(pos).padStart(6)}${String(neg).padStart(6)}   ${verdict}`);
}
console.log('\nUNSTABLE ARMS (an artifact in this repo contradicts another, both significant):',
  unstable.length ? unstable.join(', ') : 'none');

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
