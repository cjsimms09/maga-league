// TERRITORY: A
/* DOES THE SLOT-AWARE VONA STILL COLLAPSE THE BOARD?
 *
 * Register 60 (2). `VONA_SLOT_AWARE` is off because flooring the flex marginal
 * at 0 tied **1331 of 1686 players at exactly 0** and quarterbacks won the tie.
 * That was measured on a VONA computing the wrong quantity, before register 56 /
 * P107 fixed `VONA_INCLUDE_SELF`. This re-takes it.
 *
 * PREREGISTERED, and the threshold was written down before this file ran —
 * `draft/SLOT-AWARE-VONA-REPREG-2026-08-19.md` §3, P119:
 *
 *     PASS  modal share <= 5%      (historic failure: 1331/1686 = 78.9%)
 *     FAIL  modal share  > 5%      -> the flag stays off, full stop
 *
 * ── THE CONTROL, AND IT IS NOT OPTIONAL (rule 3e) ─────────────────────────
 * A probe that reports "no collapse" is indistinguishable from a probe that
 * never reached the slot-aware branch at all — `vona()` returns `straight` at
 * its first line when the flag is off, so a wiring mistake produces exactly the
 * shape of a clean pass. So this measures the SHIPPED arm too and asserts the
 * two arms DISAGREE. If s0 and s1 produce identical VONA vectors, the slot-aware
 * code did not run and the result is reported as UNRUN, never as a pass.
 *
 * REPORT ONLY. Ships no flag, writes no config.
 *
 * Run: node draft/tools/slot_aware_collapse_probe.js [--pick 48] [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null,
                    addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const ENGINE_PATH = path.join(ROOT, 'public', 'js', 'draft', 'engine.js');
const KEEP = require(path.join(__dirname, 'keepers_of.js'));

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const PICK = +arg('pick', 48);

const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
const keep = KEEP.keepersFrom(DATA);
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));

/* Fresh module instance per arm. The flags live on a frozen-at-load CFG object,
 * so mutating them after require() is not a reliable way to run two arms — the
 * cache is dropped and the module re-read instead. */
function loadEngine(flags) {
  delete require.cache[require.resolve(ENGINE_PATH)];
  const E = require(ENGINE_PATH);
  Object.keys(flags).forEach(k => {
    if (!(k in E.CFG)) throw new Error('unknown engine flag ' + k
      + ' — refusing to set a key the engine does not read');
    E.CFG[k] = flags[k];
  });
  return E;
}

function ctxAt(E, pick) {
  const taken = new Set(keep.map(k => String(k.player_id)));
  const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
  let need = (pick - 1) - 0;
  for (let j = 0; j < byAdp.length && need > 0; j++) {
    if (taken.has(String(byAdp[j].player_id))) continue;
    taken.add(String(byAdp[j].player_id)); need--;
  }
  const board = pool.filter(p => !taken.has(String(p.player_id)));
  const i = SCHED.indexOf(pick);
  return {
    board: board,
    roster: keep.map(k => Object.assign({}, k, { is_keeper: true })),
    nextPick: (i >= 0 ? SCHED[i + 1] : pick + 5) || null,
    currentPick: pick, pick: pick,
    round: Math.ceil(pick / (DATA.league.teams || 10)),
    myPicksLeft: i >= 0 ? SCHED.length - i : 10,
    myPickIndex: i >= 0 ? i : 0, totalMyPicks: SCHED.length, totalPicks: 150,
    league: DATA.league,
    currentKeepers: keep, ceilingAllStages: false, doctrine: null, drift: null,
    intervening: 5, weights: null,
  };
}

function vonaVector(E) {
  const ctx = ctxAt(E, PICK);
  ctx.weights = E.MEASURED_WEIGHTS;
  const out = [];
  ctx.board.forEach(p => {
    let v = null;
    try { v = E.vona(p, ctx.board, ctx.nextPick, ctx); } catch (e) { v = null; }
    if (typeof v === 'number' && isFinite(v)) out.push({ p: p, v: Math.round(v * 1e6) / 1e6 });
  });
  return out;
}

function modal(vec) {
  const counts = new Map();
  vec.forEach(r => counts.set(r.v, (counts.get(r.v) || 0) + 1));
  let best = null, n = 0;
  counts.forEach((c, v) => { if (c > n) { n = c; best = v; } });
  return { value: best, count: n, share: vec.length ? n / vec.length : 0,
           distinct: counts.size, total: vec.length };
}

const ARMS = {
  s0: { VONA_INCLUDE_SELF: true, VONA_SLOT_AWARE: false, VONA_WIRE_BENCH: false },
  s1: { VONA_INCLUDE_SELF: true, VONA_SLOT_AWARE: true,  VONA_WIRE_BENCH: false },
};

const res = {};
Object.keys(ARMS).forEach(a => {
  const E = loadEngine(ARMS[a]);
  const vec = vonaVector(E);
  const m = modal(vec);
  const top = vec.slice().sort((x, y) => y.v - x.v).slice(0, 40);
  const mix = {};
  top.forEach(r => { mix[r.p.position] = (mix[r.p.position] || 0) + 1; });
  res[a] = { modal: m, top40_mix: mix,
             top10: top.slice(0, 10).map(r => r.p.position + ' ' + r.p.name
                                              + ' ' + r.v.toFixed(1)),
             vec: vec };
});

/* THE CONTROL. */
const same = res.s0.vec.length === res.s1.vec.length
  && res.s0.vec.every((r, i) => r.v === res.s1.vec[i].v);

const PASS_AT = 0.05;
const HISTORIC = 1331 / 1686;

const report = {
  _territory: 'TERRITORY: A — draft/tools/slot_aware_collapse_probe.js',
  _prereg: 'draft/SLOT-AWARE-VONA-REPREG-2026-08-19.md §3, P119',
  _note: 'REPORT ONLY. Room drained in strict ADP order — this measures the '
       + 'VONA VECTOR\'s shape, which is what the collapse claim was about, '
       + 'not what happens on the 22nd.',
  board_built_at: DATA.built_at || null,
  pick: PICK,
  historic_modal_share: Math.round(HISTORIC * 1000) / 1000,
  threshold: PASS_AT,
  arms_identical: same,
  verdict: same ? 'UNRUN — s0 and s1 produced identical VONA vectors, so the '
                + 'slot-aware branch never executed. This is NOT a pass.'
         : (res.s1.modal.share <= PASS_AT ? 'PASS — no collapse'
                                          : 'FAIL — still collapses'),
  s0: { modal: res.s0.modal, top40_mix: res.s0.top40_mix, top10: res.s0.top10 },
  s1: { modal: res.s1.modal, top40_mix: res.s1.top40_mix, top10: res.s1.top10 },
};

console.log('SLOT-AWARE VONA — collapse re-take, board ' + report.board_built_at
            + ', pick ' + PICK);
console.log('  prereg: ' + report._prereg);
console.log('  historic failure: 1331/1686 = ' + (HISTORIC * 100).toFixed(1)
            + '%   threshold: modal share <= ' + (PASS_AT * 100) + '%\n');
['s0', 's1'].forEach(a => {
  const m = res[a].modal;
  console.log('  ' + a + (a === 's0' ? ' (SHIPPED, slot-aware off)' : ' (slot-aware ON)'));
  console.log('     n ' + m.total + '   distinct ' + m.distinct
              + '   modal value ' + m.value + ' x' + m.count
              + '  = ' + (m.share * 100).toFixed(1) + '%');
  console.log('     top-40 mix ' + JSON.stringify(res[a].top40_mix));
  res[a].top10.forEach(t => console.log('       ' + t));
  console.log('');
});
console.log('  CONTROL — arms produced identical vectors? ' + same
            + (same ? '  ⛔ the slot-aware code did not run' : '  ✅ the branch executed'));
console.log('\n  VERDICT: ' + report.verdict);

const outPath = arg('json', null);
if (outPath) {
  const slim = JSON.parse(JSON.stringify(report));
  fs.writeFileSync(outPath, JSON.stringify(slim, null, 1));
  console.log('  wrote ' + outPath);
}
module.exports = { report };
