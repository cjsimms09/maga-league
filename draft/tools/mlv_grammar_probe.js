// TERRITORY: relay probe — P363's 2026 half (the route's default clause).
/* DOES A ROSTER-CONDITIONAL VALUE FUNCTION KNOW WHAT A ROSTER IS, UNCONSTRAINED?
 *
 * Cory, 09-02: "just setting a hard constraint doesn't force it to learn.. if
 * it knew you can only start 2 TE and really only 1... it wouldn't draft 4."
 *
 * Replays the real 2026 draft night (draft_shadow_2026.jsonl, 150 picks, the
 * freeze board) ten times per arm — once in each seat — with the ARM making
 * every one of that seat's non-keeper picks against the room's ACTUAL picks,
 * and no cap anywhere. The sequences are then graded by roster_grammar.py
 * (the exam) beside the shipped engine's recorded recommendations and the
 * humans.
 *
 * ARMS
 *   mlv          marginal lineup value alone (mlv.js lineupValue with surplus
 *                over the derived blend wire), K/DEF cap REMOVED; when every
 *                gain is zero (lineup full) it falls through to best surplus —
 *                mlv.js's own documented behaviour ("6 of 15 spots score zero
 *                and fall through to best-available").
 *   mlv_bench    the same lineup gain while a slot is open; once the gain is
 *                zero, draft_plan.js's bench equation prices the pick:
 *                P(need the n-th backup at that position) x E[max(0, X - wire)]
 *                — the call option struck at the wire, rented positions (K/DEF)
 *                worth zero on a bench. This is the full roster-conditional
 *                value the FUTURE-PROOF doc names; nothing is capped.
 *
 * Writes draft/audit/mlv_grammar_probe_<date>.json: per arm, per seat, the
 * pick-position sequence + the projected startable points of the finished
 * roster, for roster_grammar.py to score.
 *
 * Run: node draft/tools/mlv_grammar_probe.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const M = require(path.join(ROOT, 'public', 'js', 'draft', 'mlv.js'));
const PLAN = require('./draft_plan.js');           // optionValue (one derivation)

const FREEZE = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'pre_draft_freeze_2026.json'), 'utf8'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const LEAGUE = FREEZE.league || BOARD.league;
const ST = M.startersOf(LEAGUE);
const WIRE = ((JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'position_boards.json'), 'utf8')).waiver_by_source || {}).blend) || M.WAIVER;
const ROUNDS = 15;

/* draft_plan.js's P(need n-th backup) — replicated with its own constants
 * because it does not export pNeedNth; the flex owner is RB there. */
const INJURY = { QB: 0.14, RB: 0.28, WR: 0.20, TE: 0.22, K: 0.04, DEF: 0.02 };
const FLEX_OWNER = 'RB';
const RENTED = { K: true, DEF: true };
function pNeedNth(pos, n) {
  const S = (ST[pos] || 0) + (FLEX_OWNER === pos ? (ST.FLEX || 0) : 0);
  const r = INJURY[pos] || 0.15;
  if (S <= 0) return 0;
  let p = 0;
  for (let k = n; k <= S; k++) {
    let c = 1;
    for (let i = 0; i < k; i++) c = c * (S - i) / (i + 1);
    p += c * Math.pow(r, k) * Math.pow(1 - r, S - k);
  }
  return p;
}

const rows = fs.readFileSync(path.join(ROOT, 'draft', 'data', 'draft_shadow_2026.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(l => JSON.parse(l)).sort((a, b) => a.pick_no - b.pick_no);
const byId = {};
(FREEZE.players || []).forEach(p => { byId[String(p.player_id)] = p; });
(BOARD.players || []).concat(BOARD.kept_players || []).forEach(p => { if (!byId[String(p.player_id)]) byId[String(p.player_id)] = p; });
const pool = Object.values(byId).filter(p => p && p.position && Number(p.proj_mean) > 0);

const surplus = p => Math.max(0, (Number(p.proj_mean) || 0) - (WIRE[p.position] || 0));
function bagOf(roster) {
  const bag = {};
  roster.forEach(p => { (bag[p.position] || (bag[p.position] = [])).push(surplus(p)); });
  Object.keys(bag).forEach(k => bag[k].sort((a, b) => b - a));
  return bag;
}
function lineupGain(roster, cand) {
  const base = bagOf(roster);
  const baseVal = M.lineupValue(base, ST);
  const bag = {};
  Object.keys(base).forEach(k => { bag[k] = base[k].slice(); });
  (bag[cand.position] || (bag[cand.position] = [])).push(surplus(cand));
  return M.lineupValue(bag, ST) - baseVal;
}
function benchValue(roster, cand) {
  if (RENTED[cand.position]) return 0;
  const held = roster.filter(p => p.position === cand.position).length;
  const starters = (ST[cand.position] || 0) + (FLEX_OWNER === cand.position ? (ST.FLEX || 0) : 0);
  const backups = Math.max(0, held - starters);
  const gap = PLAN.optionValue(Number(cand.proj_mean) || 0, Number(cand.proj_sd) || 0, WIRE[cand.position] || 0);
  return pNeedNth(cand.position, backups + 1) * gap;
}
function projectedStartable(roster) {
  // best legal lineup on RAW projections (what the roster would field), not surplus
  const bag = {};
  roster.forEach(p => { (bag[p.position] || (bag[p.position] = [])).push(Number(p.proj_mean) || 0); });
  Object.keys(bag).forEach(k => bag[k].sort((a, b) => b - a));
  return Math.round(M.lineupValue(bag, ST) * 10) / 10;
}

/* THE COMPLETENESS TERM (Cory, 09-02: "you can't start anyone else in a
 * kicker spot so not having one is not smart.. but it's probably right to wait
 * til dead last pick as replacement value is null"). Ending the draft with a
 * REQUIRED slot empty is not free: the wire body still has to be fetched, and
 * until he is, the slot scores zero. So when the picks left equal the required
 * slots still empty, filling one is worth the slot itself — the wire value —
 * not the surplus over it. Earlier, a bench option beats a ~0 surplus and the
 * K waits. This is a value the model derives from the slot count and the
 * wire, not a cap. */
function requiredOpen(roster) {
  return Object.keys(ST).filter(p => p !== 'FLEX' && (ST[p] || 0) > roster.filter(x => x.position === p).length);
}
function completeness(roster, cand, picksLeftAfter) {
  const open = requiredOpen(roster);
  if (!open.includes(cand.position)) return 0;
  // must this pick fill a required slot? (picks left including this one <= open slots)
  return (picksLeftAfter + 1 <= open.length) ? (WIRE[cand.position] || 0) : 0;
}

const ARMS = {
  mlv: (roster, cands) => {
    let best = null, bestV = -Infinity;
    cands.forEach(c => { const v = lineupGain(roster, c); if (v > bestV) { bestV = v; best = c; } });
    if (bestV > 0) return { pick: best, basis: 'lineup_gain', v: bestV };
    // lineup full: fall through to best surplus (mlv.js's documented behaviour)
    cands.forEach(c => { const v = surplus(c); if (v > bestV) { bestV = v; best = c; } });
    return { pick: best, basis: 'best_surplus', v: bestV };
  },
  mlv_bench_complete: (roster, cands, picksLeftAfter) => {
    let best = null, bestV = -Infinity, basis = null;
    cands.forEach(c => {
      const g = lineupGain(roster, c);
      const comp = completeness(roster, c, picksLeftAfter);
      let v, b;
      if (comp > 0) { v = comp + g; b = 'required_slot_endgame'; }
      else if (g > 0) { v = g; b = 'lineup_gain'; }
      else { v = benchValue(roster, c); b = 'bench_option'; }
      if (v > bestV) { bestV = v; best = c; basis = b; }
    });
    if (!best || bestV <= 0) {
      cands.forEach(c => { const v = surplus(c); if (v > bestV) { bestV = v; best = c; basis = 'best_surplus'; } });
    }
    return { pick: best, basis, v: bestV };
  },
  mlv_bench: (roster, cands) => {
    let best = null, bestV = -Infinity, basis = null;
    cands.forEach(c => {
      const g = lineupGain(roster, c);
      const v = g > 0 ? g : benchValue(roster, c);
      const b = g > 0 ? 'lineup_gain' : 'bench_option';
      if (v > bestV) { bestV = v; best = c; basis = b; }
    });
    if (!best || bestV <= 0) {          // nothing prices: best surplus, like mlv
      cands.forEach(c => { const v = surplus(c); if (v > bestV) { bestV = v; best = c; basis = 'best_surplus'; } });
    }
    return { pick: best, basis, v: bestV };
  },
};

const seats = [...new Set(rows.map(r => r.seat))].sort((a, b) => a - b);
const out = { _territory: 'relay probe — draft/tools/mlv_grammar_probe.js', _what: 'P363 2026 half: three value functions draft every seat of the real 2026 night against the room\'s actual picks, no caps; graded by roster_grammar.py',
  generated_at: new Date().toISOString(), wire: WIRE, arms: {} };
Object.keys(ARMS).forEach(arm => {
  out.arms[arm] = {};
  seats.forEach(seat => {
    const keepers = rows.filter(r => r.seat === seat && r.is_keeper).map(r => byId[String(r.actual_player && r.actual_player.player_id)] || r.actual_player).filter(Boolean);
    let roster = keepers.slice();
    const taken = new Set();
    const seq = keepers.map(k => k.position);
    const picks = [];
    for (const r of rows) {
      const isMine = r.seat === seat;
      if (r.is_keeper) { taken.add(String(r.actual_player.player_id)); continue; }
      if (!isMine) { taken.add(String(r.actual_player.player_id)); continue; }
      const cands = pool.filter(p => !taken.has(String(p.player_id)) && !roster.some(x => String(x.player_id) === String(p.player_id)));
      const myLeftAfter = rows.filter(x => x.seat === seat && !x.is_keeper && x.pick_no > r.pick_no).length;
      const ch = ARMS[arm](roster, cands, myLeftAfter);
      if (!ch.pick) break;
      roster.push(ch.pick); taken.add(String(ch.pick.player_id)); seq.push(ch.pick.position);
      picks.push({ pick_no: r.pick_no, pos: ch.pick.position, name: ch.pick.name, basis: ch.basis, v: Math.round(ch.v * 10) / 10 });
    }
    out.arms[arm][seat] = { sequence: seq, keepers: keepers.length, total_picks: seq.length,
      shape: seq.reduce((a, p) => (a[p] = (a[p] || 0) + 1, a), {}),
      projected_startable: projectedStartable(roster), picks };
  });
});
// the humans' rosters and the engine's recorded recs, for the same points metric
out.reference = {};
seats.forEach(seat => {
  const human = rows.filter(r => r.seat === seat).map(r => byId[String(r.actual_player && r.actual_player.player_id)]).filter(Boolean);
  const engine = rows.filter(r => r.seat === seat).map(r => r.is_keeper ? byId[String(r.actual_player.player_id)] : (r.tool_recommendation && byId[String(r.tool_recommendation.player_id)])).filter(Boolean);
  out.reference[seat] = { human_projected_startable: projectedStartable(human), engine_recs_projected_startable: projectedStartable(engine) };
});
const outPath = path.join(ROOT, 'draft', 'audit', `mlv_grammar_probe_${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
Object.keys(out.arms).forEach(arm => {
  console.log(`\n${arm}:`);
  seats.forEach(s => { const x = out.arms[arm][s]; console.log(`  seat ${String(s).padStart(2)} ${JSON.stringify(x.shape)} startable=${x.projected_startable}`); });
});
console.log('\nreference (human / engine recs) projected startable:');
seats.forEach(s => console.log(`  seat ${String(s).padStart(2)} human=${out.reference[s].human_projected_startable} engine=${out.reference[s].engine_recs_projected_startable}`));
console.log(`\nwrote ${path.relative(ROOT, outPath)}`);
