// TERRITORY: A (extends src/forecast_grade.js's in-season resolver)
/* THE STREAMED K/DEF vs THE ONE CORY ACTUALLY FIELDED — graded every week, no
 * button (register 466 ①, the stream twin). Arms: the positive by hand; he
 * started the streamed player (agreement, outcome 0); an EMPTY slot is 0;
 * a manual stream_call is not graded this way; no slot map => no row; the
 * pure slot mapper follows the league's slot order with BN/IR removed and
 * reads Sleeper's "0" as empty; the summary pools streams under their own key. */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const FG = require(path.join(ROOT, 'src', 'forecast_grade'));
const CC = require(path.join(ROOT, 'netlify', 'functions', 'claims-cron'));
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 400) : ''))); };

const autoStream = (week, pid, held, method = 'stream-auto-v1') => ({
  kind: 'stream_call', method, decision_at: 't',
  payload: { key: `stream_auto|2026|w${week}|7|${pid}`, owner_id: 7, week,
    chosen: { player_id: pid, position: 'K' },
    counterfactual: held ? { player_id: held, position: 'K' } : { note: 'no current K on roster' }, auto: true },
});
const pts = { '3': { K1: 9, K2: 4, K3: 12 } };
{
  const res = FG.buildInseasonResolutions([autoStream(3, 'K1', 'K2')], pts, { actualStartersBySlot: { '3': { K: 'K3', DEF: 'D1' } } });
  const primary = res.find(r => r.payload.forecast_key === 'stream_auto|2026|w3|7|K1');
  const va = res.find(r => r.payload.forecast_key === 'stream_auto|2026|w3|7|K1|vs_actual');
  ck('the existing chosen-vs-held resolution still lands (9 vs 4)', primary && primary.payload.outcome === 5, primary);
  ck('a SECOND row: the streamed K (9) vs the K he actually started (K3, 12) = -3, decision_kind stream_call',
    va && va.payload.realized_chosen === 9 && va.payload.realized_counterfactual === 12 && va.payload.outcome === -3
      && va.payload.decision_kind === 'stream_call' && va.payload.position === 'K', va && va.payload);
  ck('  disagreement NAMED: tool_only K1, human_only K3', va && va.payload.disagreement.n === 1
      && va.payload.disagreement.tool_only.join() === 'K1' && va.payload.disagreement.human_only.join() === 'K3');
}
{
  const res = FG.buildInseasonResolutions([autoStream(3, 'K1', 'K2')], pts, { actualStartersBySlot: { '3': { K: 'K1' } } });
  const va = res.find(r => /vs_actual/.test(r.payload.forecast_key));
  ck('he started the streamed K => outcome 0, disagreement 0', va && va.payload.outcome === 0 && va.payload.disagreement.n === 0, va && va.payload);
}
{
  const res = FG.buildInseasonResolutions([autoStream(3, 'K1', null)], pts, { actualStartersBySlot: { '3': { K: null } } });
  const va = res.find(r => /vs_actual/.test(r.payload.forecast_key));
  ck('an EMPTY K slot is a real answer: human 0, slot_empty true, outcome +9',
    va && va.payload.realized_counterfactual === 0 && va.payload.slot_empty === true && va.payload.outcome === 9, va && va.payload);
}
{
  const r1 = FG.buildInseasonResolutions([autoStream(3, 'K1', 'K2')], pts, {});
  const r2 = FG.buildInseasonResolutions([autoStream(3, 'K1', 'K2', 'stream-v1')], pts, { actualStartersBySlot: { '3': { K: 'K3' } } });
  const r3 = FG.buildInseasonResolutions([autoStream(3, 'K1', 'K2')], pts, { actualStartersBySlot: { '3': { DEF: 'D1' } } });
  ck('CONTROLS — no slot map, a MANUAL capture, or a map without this position => no vs_actual row; primary intact',
    [r1, r2, r3].every(r => r.length === 1 && !/vs_actual/.test(r[0].payload.forecast_key)), [r1, r2, r3].map(r => r.length));
}
{
  const rp = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'IR'];
  const st = ['q', 'r1', 'r2', 'w1', 'w2', 't', 'f', 'k9', 'DET'];
  const m = CC.startersBySlot(st, rp);
  ck('startersBySlot: K and DEF read off the slot order with BN/IR removed', m && m.K === 'k9' && m.DEF === 'DET', m);
  const e = CC.startersBySlot(['q', 'r1', 'r2', 'w1', 'w2', 't', 'f', '0', 'DET'], rp);
  ck('  Sleeper\'s "0" is an EMPTY slot (null), and a bad input is null not a crash',
    e && e.K === null && e.DEF === 'DET' && CC.startersBySlot(null, rp) === null && CC.startersBySlot(st, null) === null, e);
}
{
  const row = (w, outcome, empty) => ({ kind: 'forecast_resolution', method: 'inseason-resolution-vs-actual-v1',
    payload: { forecast_key: `stream_auto|2026|w${w}|7|P|vs_actual`, week: w, decision_kind: 'stream_call', outcome, slot_empty: empty, disagreement: { n: 1 } } });
  const sm = FG.toolVsActualSummary([row(2, 4, false), row(3, -2, true)]);
  ck('summary pools streams under `stream`: 2 weeks, +1/wk, 1 empty-slot week; lineup summary untouched (0 weeks)',
    sm.stream && sm.stream.weeks === 2 && sm.stream.tool_minus_human_per_week === 1 && sm.stream.weeks_slot_empty === 1 && sm.weeks === 0, sm);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
