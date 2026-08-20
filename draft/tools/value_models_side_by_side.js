/* WHAT DOES "HIGHEST VALUE" ACTUALLY PICK? THREE MODELS, ONE BOARD, HIS TWELVE PICKS.
 *
 * Cory, 2026-08-20: "what I want is the most solid vona strategy... I can build
 * the roster, I want a model to tell me highest value."
 *
 * That is a scope correction and it is worth taking literally. The shipped
 * composite is not a value model — measured over his twelve picks, roughly 57%
 * of what separates its top five is ROSTER-CONDITIONAL (`need` 53.5%, `stack`
 * 3.4%, `keeper` <0.05%) and roughly 43% is player value (`value`/VONA 32.5%,
 * `ceiling` 10.7%). He is asking for the second thing.
 *
 * ── THE THREE ARMS, AND WHY THESE THREE ────────────────────────────────────
 *
 *   VONA-ONLY   opportunity cost alone: what it costs to wait one pick.
 *               This is the literal reading of "VONA strategy".
 *
 *   VBD+VONA    the reference methodology Cory sent (Subvertadown, "Snake
 *               Value Based Drafting"): value over replacement PLUS opportunity
 *               cost, added, because VBD is cumulative future VONA and neither
 *               term substitutes for the other. NO ROSTER GATING — a player's
 *               VORP counts whether or not a slot is open. This is the model
 *               he is describing.
 *
 *   SHIPPED     what the war room serves today: VONA + slot-gated VORP +
 *               0.45 ceiling + keeper + stack. The gating is the roster
 *               construction he says he will do himself.
 *
 * ── THE ONE THING THAT MAKES THIS COMPARISON HONEST ────────────────────────
 *
 * All three read the SAME board at the SAME pick with the SAME drain, and the
 * roster grows by each arm's own picks. An arm handed a different pool is not a
 * comparison. VONA is roster-independent (measured: max delta 0 over 60 players
 * between an empty roster and his real keepers), so the first two arms are
 * genuinely roster-blind rather than accidentally so.
 *
 * REPORTS, DOES NOT RULE. No arm is graded here. Which of these is "most solid"
 * is a seat-replay question, and the answer to it is not in this file.
 *
 * Run: node draft/tools/value_models_side_by_side.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public/js/draft/engine.js'));
const { realRoster } = require(path.join(ROOT, 'draft/tests/_empty_roster_fiction_precondition.js'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/draft_data.json'), 'utf8'));
const L = D.league, MY_SLOT = L.my_draft_slot;
const MY = ((D.pick_order || {}).my_picks) || [];
const rows = ((D.pick_order || {}).picks) || [];
const adp = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const pool = D.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const byAdp = pool.slice().sort((a, b) => adp(a) - adp(b));

/* THE GONE-SET COUNTS SELECTIONS, NOT BOARD SLOTS. `byAdp.slice(0, pick - 1)`
 * over-removes by the keeper slots sitting inside the window — exactly three at
 * every one of his picks, thirty-six across the draft, and it is the defect
 * emit_seat_plan.js already fixed. Same derivation reused here rather than
 * re-invented, which is how it got made wrong the first time. */
const liveBefore = pk => rows.filter(r => r.overall < pk && !r.keeper_slot).length;

function ctxAt(cur, nxt, roster, board) {
  return { board: board, roster: roster, league: L, currentPick: cur, nextPick: nxt,
    totalPicks: 150, myPicksLeft: MY.length - MY.indexOf(cur),
    myPickIndex: MY.indexOf(cur), totalMyPicks: MY.length,
    roundsLeft: MY.length - MY.indexOf(cur), runMultipliers: {},
    pickBoard: rows,
    intervening: rows.filter(r => r.overall >= cur && r.overall < nxt && r.slot !== MY_SLOT)
      .map(r => ({ team_slot: r.slot, pick_no: r.overall, roster: [], profile: null, room: [] })) };
}

const ARMS = {
  'VONA-only': (p, ctx) => E.vona(p, ctx.board, ctx.nextPick, ctx),
  'VBD+VONA': (p, ctx) => (p.vorp || 0) + E.vona(p, ctx.board, ctx.nextPick, ctx),
  SHIPPED: null,   // driven through the real recommend()
};

function draft(armName) {
  let roster = realRoster();
  const out = [];
  MY.forEach((cur, i) => {
    const nxt = MY[i + 1] || cur + 15;
    const taken = new Set(byAdp.slice(0, liveBefore(cur)).map(p => String(p.player_id)));
    roster.forEach(k => taken.add(String(k.player_id)));
    const board = byAdp.filter(p => !taken.has(String(p.player_id)));
    const ctx = ctxAt(cur, nxt, roster, board);
    let best;
    if (armName === 'SHIPPED') {
      const r = E.recommend(Object.assign({}, ctx, { weights: E.MEASURED_WEIGHTS }));
      best = r && r.length ? r[0].player : null;
    } else {
      const f = ARMS[armName];
      let bs = -Infinity;
      board.forEach(p => {
        let s;
        try { s = f(p, ctx); } catch (e) { return; }
        if (typeof s === 'number' && isFinite(s) && s > bs) { bs = s; best = p; }
      });
    }
    if (!best) { out.push(null); return; }
    out.push(best);
    roster = roster.concat([best]);
  });
  return { picks: out, roster: roster };
}

const names = Object.keys(ARMS);
const runs = {};
names.forEach(n => { runs[n] = draft(n); });

console.log('\n  THREE MODELS OF "HIGHEST VALUE", ON YOUR TWELVE PICKS\n');
console.log('  pick   ' + names.map(n => n.padEnd(26)).join(''));
MY.forEach((cur, i) => {
  console.log('  ' + String(cur).padEnd(7)
    + names.map(n => { const p = runs[n].picks[i];
      return (p ? p.position + ' ' + p.name : '—').padEnd(26); }).join(''));
});

const shape = r => { const c = {}; r.forEach(p => { c[p.position] = (c[p.position] || 0) + 1; });
  return ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(k => c[k] ? k + c[k] : '').filter(Boolean).join(' '); };
const totVorp = r => r.reduce((s, p) => s + (p.vorp || 0), 0);
const totProj = r => r.reduce((s, p) => s + (p.proj_mean || 0), 0);

console.log('\n  ' + 'model'.padEnd(14) + 'roster shape'.padEnd(30)
  + 'total VORP'.padEnd(13) + 'total projected points');
names.forEach(n => {
  console.log('  ' + n.padEnd(14) + shape(runs[n].roster).padEnd(30)
    + totVorp(runs[n].roster).toFixed(0).padEnd(13) + totProj(runs[n].roster).toFixed(0));
});

/* AGREEMENT, because three models that pick the same man are one model. */
let agree3 = 0, agree2 = 0;
MY.forEach((cur, i) => {
  const s = new Set(names.map(n => (runs[n].picks[i] || {}).name));
  if (s.size === 1) agree3++; else if (s.size === 2) agree2++;
});
console.log('\n  all three agree on ' + agree3 + ' of ' + MY.length + ' picks · '
  + 'two of three on ' + agree2 + ' · full three-way disagreement on '
  + (MY.length - agree3 - agree2));
console.log('\n  NOT GRADED HERE. Which of these is most solid is a seat-replay');
console.log('  question and this file does not answer it.\n');
