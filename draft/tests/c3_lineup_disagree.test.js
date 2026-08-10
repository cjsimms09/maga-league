'use strict';
// C3 ON THE LINEUP PAGE — the disagreement moment. When the optimizer starts the
// LOWER-projection player, both projections must be on screen: that is exactly
// when the machinery is either finding something real (variance the mean can't
// see) or is broken, and one number can't tell you which. Silent when the
// recommendation also carries the higher projection (no noise).
const fs = require('fs'), path = require('path'), ejs = require('ejs');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const tplPath = path.join(ROOT, 'views', 'lineup.ejs');
// Strip the header/footer includes so this renders the page body in isolation.
const tpl = fs.readFileSync(tplPath, 'utf8').replace(/<%-\s*include\([^%]+%>/g, '');

const locals = call => ({
  me: { id: 1, name: 'Cory' }, owners: [], tab: 'live', season: { year: 2026 },
  band: { median: 140 }, projSource: 'sleeper', roster: [], matchup: null, weekNo: 3,
  alert: null, posture: null, proof: null, eff: null, myLeak: 0, drill: null,
  configured: true, logged: false,
  live: { calls: [call], lineup: [{ slot: 'WR', name: 'X', pos: 'WR', proj: 10, pid: 'z' }],
    naive: [], ev: { mean: 100, pHigh: 0.3, pWin: 0.5 }, edge: 10,
    projPending: false, oppKnown: true, confidence: 'ok' },
});
const render = call => ejs.render(tpl, locals(call), { filename: tplPath });

// The tool starts the LOWER-projection player (variance play).
const lower = { startId: 'a', startName: 'Boom Guy', startPos: 'WR', startProj: 9.1,
  sitName: 'Safe Guy', sitPos: 'WR', sitProj: 12.4, dollars: 6, dollarsHigh: 8, dollarsWin: -2 };
// The tool starts the HIGHER-projection player (no disagreement to surface).
const higher = { startId: 'b', startName: 'Better Guy', startPos: 'WR', startProj: 15.2,
  sitName: 'Worse Guy', sitPos: 'WR', sitProj: 11.0, dollars: 5, dollarsHigh: 3, dollarsWin: 2 };

const hLow = render(lower);
ck('lower-projection call surfaces the disagreement line', /lo-call-disagree/.test(hLow));
ck('both raw projections are on screen', /9\.1/.test(hLow) && /12\.4/.test(hLow));
ck('it names the gap in points', /3\.3 fewer pts/.test(hLow), (hLow.match(/[\d.]+ fewer pts/) || [])[0]);
ck('it says the dollars come from variance, not points', /variance, not points/.test(hLow));
ck('the projection is labelled RAW and not-our-valuation (honest labelling)',
  /not our valuation/i.test(hLow) && /Raw projection/i.test(hLow));

const hHigh = render(higher);
ck('higher-projection call stays SILENT (no false alarm)', !/lo-call-disagree/.test(hHigh));

// Null-safety: a call with missing projections must not throw or false-fire.
const noProj = { startId: 'c', startName: 'A', startPos: 'WR', startProj: null,
  sitName: 'B', sitPos: 'WR', sitProj: null, dollars: 1, dollarsHigh: 1, dollarsWin: 0 };
let threw = null, hNull = '';
try { hNull = render(noProj); } catch (e) { threw = e; }
ck('missing projections neither throw nor fire the line', threw === null && !/lo-call-disagree/.test(hNull),
  threw && threw.message);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
