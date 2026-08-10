'use strict';
// THE WEEKLY VERDICT — chase vs protect. The one non-obvious call a manager makes
// each week; the tool must state it plainly. This asserts the posture derived from
// the solver's edge + P(win)/P(high) lands in the right mode with an honest reason.
// Run: node draft/tests/weekly_posture.test.js
const LO = require('../../src/routes/lineup.js');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        ' + JSON.stringify(d) : ''))); };
const P = (edge, pWin, pHigh) => LO.weeklyPosture({ edge, ev: { pWin, pHigh } }, { median: 140 });

// edge ~0: the studs ARE optimal → protect, no chase.
{ const v = P(0, 0.55, 0.05);
  ck('edge~0 + coin-flip matchup → protect (coin flip framing)',
    v.mode === 'protect' && /coin flip/i.test(v.headline), v); }
{ const v = P(0.4, 0.90, 0.03);
  ck('edge~0 + already winning → protect / start your studs', v.mode === 'protect', v); }

// edge>0: the tool is trading floor for ceiling → chase, reason by matchup state.
{ const v = P(6, 0.88, 0.10);
  ck('edge>0 + matchup nearly won → chase ("nearly won")',
    v.mode === 'chase' && /nearly won/i.test(v.headline) && /\+\$6/.test(v.why), v); }
{ const v = P(9, 0.12, 0.20);
  ck('edge>0 + matchup long shot → chase ("long shot")',
    v.mode === 'chase' && /long shot/i.test(v.headline), v); }
{ const v = P(4, 0.50, 0.22);
  ck('edge>0 + close matchup but real $100 shot → chase (trade some floor)',
    v.mode === 'chase' && /trading some floor/i.test(v.headline), v); }

// opponent unknown (pWin null): nothing to protect → chase.
{ const v = P(5, null, 0.18);
  ck('opponent unset → chase, with the re-check caveat',
    v.mode === 'chase' && /opponent not set/i.test(v.why), v); }

// Every posture is a plain string pair, never NaN/undefined.
for (const args of [[0,0.5,0.05],[7,0.9,0.1],[7,0.1,0.2],[3,0.5,0.3],[5,null,0.2],[0,null,0]]) {
  const v = P(...args);
  ck('posture is well-formed for edge=' + args[0] + ' pWin=' + args[1],
    !!v.headline && !!v.why && /^(chase|protect)$/.test(v.mode)
      && !/NaN|undefined/.test(v.headline + v.why), v);
}

// A real optimize() run flows through it without throwing (integration).
{
  const roster = [
    { id: 'qb', name: 'QB1', pos: 'QB', proj: 22, sd: 6 }, { id: 'r1', name: 'RB1', pos: 'RB', proj: 18, sd: 6 },
    { id: 'r2', name: 'RB2', pos: 'RB', proj: 16, sd: 6 }, { id: 'w1', name: 'WR1', pos: 'WR', proj: 17, sd: 6 },
    { id: 'w2', name: 'WR2', pos: 'WR', proj: 15, sd: 6 }, { id: 'te', name: 'TE1', pos: 'TE', proj: 12, sd: 5 },
    { id: 'k', name: 'K1', pos: 'K', proj: 8, sd: 4 }, { id: 'def', name: 'DEF1', pos: 'DEF', proj: 7, sd: 5 },
    { id: 'safe', name: 'SafeFlex', pos: 'RB', proj: 15, sd: 3 }, { id: 'boom', name: 'BoomFlex', pos: 'WR', proj: 14, sd: 20 },
  ];
  const band = LO.weeklyHighBand();
  const res = LO.optimize(roster, { band, oppMean: 175, matchupValue: 25 });
  const v = LO.weeklyPosture(res, band);
  ck('optimize()→weeklyPosture is well-formed end to end',
    !!v && /^(chase|protect)$/.test(v.mode) && !!v.headline && !!v.why, v);
}

// NO PROJECTIONS YET. Post-draft, pre-week-1, every player projects 0 → the
// lineup mean is ~0 and pWin collapses to ~0%. The verdict must read as "pending",
// not "P(win) 0% — play the floor" (doom off an all-zero board).
{
  const zero = ['QB','RB','RB','WR','WR','TE','K','DEF']
    .map((p, i) => ({ id: 'z' + i, name: 'Z' + i, pos: p, proj: 0, sd: null }));
  const band = LO.weeklyHighBand();
  const res = LO.optimize(zero, { band, oppMean: band.median, matchupValue: 25 });
  const v = LO.weeklyPosture(res, band);
  ck('all-zero board → pending verdict, not a 0%% doom read',
    v.mode === 'pending' && /no projections/i.test(v.headline)
      && !/play the floor|0%/i.test(v.why), v);
}
// A guard this blunt must NOT fire on a real (even weak) lineup.
{
  const weak = ['QB','RB','RB','WR','WR','TE','K','DEF']
    .map((p, i) => ({ id: 'w' + i, name: 'W' + i, pos: p, proj: [14,9,8,9,8,6,5,4][i], sd: null }));
  const band = LO.weeklyHighBand();
  const res = LO.optimize(weak, { band, oppMean: band.median, matchupValue: 25 });
  const v = LO.weeklyPosture(res, band);
  ck('a real weak lineup stays a normal chase/protect verdict (not pending)',
    /^(chase|protect)$/.test(v.mode), v);
}

console.log(`\n${pass}/${pass + fail} weekly-posture checks passed`);
process.exit(fail ? 1 : 0);
