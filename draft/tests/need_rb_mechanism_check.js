// E, 2026-08-20: Cory asked WHY need:1.0 causes RB bloat -- is it an error
// or real value. Diagnostic-only (no shipped config touched): drives the
// REAL engine.js with Cory's REAL schedule (draft_plan.js's derived SCHED,
// not a hardcoded literal) under need:0 (shipped) and need:1.0 (P110's
// tested arm), and for every pick that differs, reports the exact
// `need_fills` (starter/flex/bench) and the raw `vorp` behind it -- so the
// mechanism is named, not guessed.
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

global.window = global;
global.document = { getElementById: () => null, querySelector: () => null, addEventListener: () => {} };

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const PLAN = require(path.join(ROOT, 'draft', 'tools', 'draft_plan.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));

const keep = KEEP.keepersFrom(DATA);
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const SCHED = PLAN.SCHED;

function driveWith(weightsOverride) {
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
  const picks = [];
  SCHED.forEach((pk, i) => {
    let n = (pk - 1) - (taken.size - keep.length);
    for (let j = 0; j < byAdp.length && n > 0; j++) {
      const p = byAdp[j];
      if (taken.has(String(p.player_id))) continue;
      taken.add(String(p.player_id)); n--;
    }
    const board = pool.filter(p => !taken.has(String(p.player_id)));
    const ctx = {
      board, roster, nextPick: SCHED[i + 1] || null, currentPick: pk, pick: pk,
      round: Math.ceil(pk / (DATA.league.teams || 10)),
      myPicksLeft: SCHED.length - i, myPickIndex: i, totalMyPicks: SCHED.length,
      totalPicks: 150, league: DATA.league,
      weights: Object.assign({}, E.MEASURED_WEIGHTS, weightsOverride || {}),
      currentKeepers: roster.filter(p => p.is_keeper),
      ceilingAllStages: false, doctrine: null, drift: null,
      intervening: (SCHED[i + 1] || pk) - pk,
    };
    let out;
    try { out = E.recommend(ctx); } catch (e) { picks.push({ pk, error: e.message }); return; }
    const list = Array.isArray(out) ? out : (out && out.scored) || [];
    const top = list[0];
    if (!top || !top.player) { picks.push({ pk, error: 'no recommendation' }); return; }
    taken.add(String(top.player.player_id));
    roster.push(Object.assign({}, top.player));
    picks.push({
      pk, name: top.player.name, position: top.player.position,
      vorp: top.player.vorp, score: top.score,
      need_fills: top.components ? top.components.need_fills : undefined,
      need_why: top.components ? top.components.need_why : undefined,
      need_value: top.components ? top.components.need : undefined,
      vona: top.components ? top.components.vona : undefined,
    });
  });
  return picks;
}

const shipped = driveWith({});          // need: 0 (live)
const need1 = driveWith({ need: 1.0 }); // P110's tested arm

console.log('=== SHIPPED (need:0) picks ===');
shipped.forEach(p => console.log(
  `  pk${p.pk}  ${(p.position||'?')} ${p.name||p.error}`
  + (p.vorp != null ? `  vorp=${p.vorp.toFixed(1)}` : '')
  + (p.need_fills ? `  fills=${p.need_fills}` : '')
));

console.log('\n=== need:1.0 picks ===');
need1.forEach(p => console.log(
  `  pk${p.pk}  ${(p.position||'?')} ${p.name||p.error}`
  + (p.vorp != null ? `  vorp=${p.vorp.toFixed(1)}` : '')
  + (p.need_fills ? `  fills=${p.need_fills}` : '')
  + (p.need_value != null ? `  need_term=${Number(p.need_value).toFixed(1)}` : '')
));

const cntShip = {}, cntNeed = {};
shipped.forEach(p => { if (p.position) cntShip[p.position] = (cntShip[p.position]||0)+1; });
need1.forEach(p => { if (p.position) cntNeed[p.position] = (cntNeed[p.position]||0)+1; });
console.log('\nROSTER SHAPE shipped:', JSON.stringify(cntShip));
console.log('ROSTER SHAPE need:1.0:', JSON.stringify(cntNeed));

console.log('\n=== WHERE THEY DIFFER, pick by pick ===');
for (let i = 0; i < SCHED.length; i++) {
  const a = shipped[i], b = need1[i];
  if (!a || !b) continue;
  if (a.name !== b.name) {
    console.log(`  pk${SCHED[i]}: shipped=${a.position} ${a.name} (vorp ${a.vorp!=null?a.vorp.toFixed(1):'?'})`
      + `  vs  need1=${b.position} ${b.name} (vorp ${b.vorp!=null?b.vorp.toFixed(1):'?'}, fills=${b.need_fills}, need_term=${b.need_value!=null?Number(b.need_value).toFixed(1):'?'})`);
  }
}
