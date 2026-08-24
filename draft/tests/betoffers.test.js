/* THE OFFER SHEET (src/betoffers.js) — proactive +EV side-bet suggestions,
 * priced through betedge's own priceCondition. Pure-module test on a real
 * contextFromRows build (synthetic standings, no store, no network).
 *
 * Arms: a strong viewer gets offers against weak opponents (positive), a
 * bottom-of-table viewer gets an EMPTY sheet (the honest quiet week), the
 * inherited 0.55 threshold actually gates (boundary), and a null context
 * yields [] rather than a crash.
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BE = require(path.join(ROOT, 'src', 'betedge'));
const { suggestOffers } = require(path.join(ROOT, 'src', 'betoffers'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };

// Six weeks played; owner 1 is a juggernaut, 2-4 mid, 5 weak.
const rows = [
  { owner_id: 1, wins: 6, losses: 0, pf: 6 * 150 },
  { owner_id: 2, wins: 3, losses: 3, pf: 6 * 118 },
  { owner_id: 3, wins: 3, losses: 3, pf: 6 * 116 },
  { owner_id: 4, wins: 3, losses: 3, pf: 6 * 114 },
  { owner_id: 5, wins: 0, losses: 6, pf: 6 * 95 },
];
const owners = [
  { id: 1, name: 'Cory' }, { id: 2, name: 'Richard' }, { id: 3, name: 'David' },
  { id: 4, name: 'Michael' }, { id: 5, name: 'Bates' },
];
const ctx = BE.contextFromRows(rows, 8, { weekNow: 7 });

const sheet = suggestOffers(ctx, 1, owners);
ck('the juggernaut gets a non-empty sheet', sheet.length >= 1, sheet.length);
ck('every offer clears the inherited 0.55 bar (never re-declared lower)',
  sheet.every(o => o.p >= BE.CFG.ADVANTAGE_P), sheet.map(o => o.p));
// 3i note, learned writing this test: with a 32-PPG gap over a season EVERY
// opponent prices ~100% for the juggernaut, so "weakest first" is a tie — the
// honest assertions are that the sheet is sorted and the weakest is present.
ck('the sheet is sorted best-first', sheet.every((o, i) => i === 0 || sheet[i - 1].p >= o.p), sheet.map(o => o.p));
ck('the weakest opponent is on the sheet at the top price',
  sheet.some(o => o.opponent === 'Bates' && o.p === sheet[0].p), sheet);
ck('no offer against yourself', sheet.every(o => o.opponent_id !== 1), sheet);
ck('the terms are a settleable sentence naming both sides',
  sheet.some(o => /Cory out-points Bates on the season/.test(o.terms)), sheet.map(o => o.terms));
ck('EV per $10 is (2p−1)×10 to the cent',
  Math.abs(sheet[0].edge_per_10 - (2 * sheet[0].p - 1) * 10) < 0.02, sheet[0]);
ck('the derivation line rides along (show-your-working contract)',
  typeof sheet[0].line === 'string' && sheet[0].line.length > 10, sheet[0].line);

// The honest quiet week: the last-place team should have nothing ≥55%.
const weakSheet = suggestOffers(ctx, 5, owners);
ck('the bottom team gets an EMPTY sheet, not manufactured offers',
  weakSheet.length === 0, weakSheet);

// Boundary: two teams with IDENTICAL records and points price at exactly 0.5
// — inside the band, never flagged. (First draft of this arm used 2-PPG gaps
// and learned the 3i lesson: small weekly edges COMPOUND over a season into
// real 60-69% probabilities. The band gates noise, not small-but-real edges.)
const twinRows = rows.map(r => r.owner_id === 3 ? { ...r, pf: 6 * 114 } : r);
const twinCtx = BE.contextFromRows(twinRows, 8, { weekNow: 7 });
const twinSheet = suggestOffers(twinCtx, 3, owners);
ck('a true coin-flip twin is never flagged either way',
  !twinSheet.some(o => o.opponent_id === 4), twinSheet);

ck('a null context returns [] (preseason)', suggestOffers(null, 1, owners).length === 0);

console.log(`\n${pass}/${pass + fail} offer-sheet checks passed`);
process.exit(fail ? 1 : 0);
