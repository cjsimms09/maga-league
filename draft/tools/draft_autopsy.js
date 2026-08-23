#!/usr/bin/env node
/* DRAFT AUTOPSY — every one of Cory's picks, against every arm, with hindsight.
 *
 * Cory, 2026-08-23: *"We need a complete autopsy of everything from the draft
 * from our recommendations, our roster builder, to what we kept and graded,
 * everything! And we need to be better next year! Goal is to draft me best
 * possible roster."*
 *
 * ── WHY THIS IS EXACT AND NOT A SIMULATION ──────────────────────────────────
 *
 * Every pre-draft tool estimates "who will still be there at my next pick" by
 * simulating ADP drain over 300 rooms. AFTER the draft we do not have to
 * estimate: `draft_pick_log_2026.jsonl` records who was actually taken, in
 * order. So the counterfactual here is EXACT —
 *
 *     cost_of_waiting(pos) = best available at THIS pick
 *                          − best available at MY NEXT pick
 *
 * computed from what the room really did. That is a strictly better instrument
 * than the one that made the recommendation, which is the point: the autopsy
 * grades the recommendation against what actually happened, not against
 * another model's guess.
 *
 * ⚠️ AND WHAT IT STILL CANNOT DO. No football has been played. Nothing here
 * grades whether a player was GOOD — only whether the pick captured the value
 * that was actually on the table at that moment, priced on the projections we
 * held on draft day. A pick can be optimal here and bust in September. That
 * limit is the reason the outcome grade has its own date and is not faked now.
 *
 * ── THE ARMS ────────────────────────────────────────────────────────────────
 *
 *   TOOK      what Cory actually did
 *   VORP      the shipped board's static ranking — what the log recorded, and
 *             what `why_the_shadow_log_recommends_defences_2026-08-23.md`
 *             showed goes to defences from ~pick 60 because its baseline never
 *             moves as the pool drains
 *   VONA*     cost-of-waiting computed with HINDSIGHT (the exact figure above)
 *   MLV       the roster builder — marginal starting-lineup value, roster-aware
 *
 * Run: node draft/tools/draft_autopsy.js [--json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const MLV = require(path.join(ROOT, 'public', 'js', 'draft', 'mlv.js'));

const LOG = path.join(ROOT, 'draft', 'data', 'draft_pick_log_2026.jsonl');
const FREEZE = path.join(ROOT, 'draft', 'data', 'pre_draft_freeze_2026.json');
const OUT = path.join(ROOT, 'draft', 'data', 'draft_autopsy_2026.json');

const rows = fs.readFileSync(LOG, 'utf8').trim().split('\n').map(JSON.parse);
const fz = JSON.parse(fs.readFileSync(FREEZE, 'utf8'));
const byId = new Map(fz.players.map(p => [String(p.player_id), p]));
const MY_SLOT = String((fz.league && fz.league.my_draft_slot) || 8);
const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];

/* CHRONOLOGICAL, and keepers count. `log_draft_picks.py:209` builds its gone
 * set from ALL rows for exactly this reason — a kept player is off the board
 * as surely as a drafted one. Getting this wrong is what made an earlier probe
 * of mine report the top RB still available after 120 picks. */
const order = rows.slice().sort((a, b) => a.pick - b.pick);
const goneBefore = pick => new Set(order.filter(r => r.pick < pick).map(r => String(r.player_id)));
const availAt = pick => {
  const g = goneBefore(pick);
  return fz.players.filter(p => !g.has(String(p.player_id)));
};

const mine = order.filter(r => String(r.team_slot) === MY_SLOT);
const myPicks = mine.filter(r => !r.is_keeper).map(r => r.pick).sort((a, b) => a - b);
const myKeepers = mine.filter(r => r.is_keeper);

const best = (pool, pos, field) => pool
  .filter(p => p.position === pos && p[field] != null)
  .reduce((b, p) => (b === null || p[field] > b[field] ? p : b), null);

/* ── THE PER-PICK AUTOPSY ─────────────────────────────────────────────────── */

const picks = myPicks.map((pk, i) => {
  const nxt = myPicks[i + 1] || null;
  const pool = availAt(pk);
  const poolNext = nxt ? availAt(nxt) : [];
  const took = order.find(r => r.pick === pk);
  const tookP = byId.get(String(took.player_id)) || null;

  /* EXACT cost of waiting, per position, from what the room really did. */
  const waitCost = {};
  POS.forEach(q => {
    const a = best(pool, q, 'proj_mean');
    const b = nxt ? best(poolNext, q, 'proj_mean') : null;
    waitCost[q] = (a && b) ? +(a.proj_mean - b.proj_mean).toFixed(1)
      : (a && !nxt ? null : null);
  });

  /* what each arm would have taken */
  const vorpTop = pool.filter(p => p.vorp != null)
    .sort((a, b) => b.vorp - a.vorp)[0] || null;

  /* VONA* — the position whose wait cost most, then its best man. */
  const vonaPos = POS.filter(q => waitCost[q] != null)
    .sort((a, b) => waitCost[b] - waitCost[a])[0] || null;
  const vonaTop = vonaPos ? best(pool, vonaPos, 'proj_mean') : null;

  /* MLV — roster-aware, using the roster he actually held at that moment. */
  const held = mine.filter(r => r.is_keeper || r.pick < pk)
    .map(r => byId.get(String(r.player_id))).filter(Boolean);
  let mlvTop = null;
  try {
    const rec = MLV.recommend(pool, held, { league: fz.league, topN: 1 });
    mlvTop = rec && rec[0] ? rec[0].player : null;
  } catch (e) { /* arm optional; recorded as null */ }

  /* Did the man he took survive to his next pick? (would waiting have been free) */
  const survived = nxt ? poolNext.some(p => String(p.player_id) === String(took.player_id)) : null;

  return {
    pick: pk, next_pick: nxt,
    took: tookP ? { name: tookP.name, position: tookP.position,
      proj_mean: tookP.proj_mean, vorp: tookP.vorp } : null,
    pool_size: pool.length,
    cost_of_waiting_by_position: waitCost,
    highest_wait_cost_position: vonaPos,
    arms: {
      vorp: vorpTop ? vorpTop.position + ' ' + vorpTop.name : null,
      vona_hindsight: vonaTop ? vonaTop.position + ' ' + vonaTop.name : null,
      mlv: mlvTop ? mlvTop.position + ' ' + mlvTop.name : null,
    },
    took_was_still_there_next_pick: survived,
    /* what the pick gave up, in the projection currency, against the best man
     * at the position that was most expensive to wait on */
    points_vs_best_wait_position: (tookP && vonaTop)
      ? +(tookP.proj_mean - vonaTop.proj_mean).toFixed(1) : null,
  };
});

/* ── KEEPERS ──────────────────────────────────────────────────────────────── */
/* ⚠️ TWO REASONS THE OBVIOUS LOOKUP RETURNS NOTHING, and only one is a bug.
 *
 * (1) NOT A BUG: Cory's three keepers are absent from the freeze's player list
 *     by design — `keepers_on_board_at_freeze: 3` and
 *     `keepers_actually_applied_count: 3` mean they were removed from the
 *     draftable pool, which is correct. So `byId` cannot resolve them and the
 *     board's own `kept_players` is the right source.
 * (2) A BUG, filed: the LOG truncates keeper `player_name` to the FIRST NAME —
 *     "Ja'Marr", "Derrick", "Kenneth" — while selections carry the full name
 *     ("Rashee Rice"). Joining on that string would silently match nothing.
 *     So this joins on player_id and never on name. */
const BOARD = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const keptById = new Map((BOARD.kept_players || []).map(p => [String(p.player_id), p]));
const keepers = myKeepers.map(r => {
  const p = byId.get(String(r.player_id)) || keptById.get(String(r.player_id));
  return p ? { name: p.name, position: p.position, proj_mean: p.proj_mean,
    vorp: p.vorp == null ? null : p.vorp, cost_round: r.cost_round || p.cost_round || null,
    source: byId.has(String(r.player_id)) ? 'freeze' : 'board.kept_players' }
    : { name: r.player_name, position: null, unresolved: true };
});
const unresolvedKeepers = keepers.filter(k => k.unresolved);

/* ── ROSTER SHAPE vs THE RULED TARGET ─────────────────────────────────────── */
const roster = mine.map(r => byId.get(String(r.player_id))).filter(Boolean);
const shape = {}; POS.forEach(q => { shape[q] = roster.filter(p => p.position === q).length; });
/* Cory's ruling, 2026-08-19: match the top-3 finishers. */
const TARGET = { QB: 1.56, RB: 4.78, WR: 5.00, TE: 1.67, K: 1.00, DEF: 1.00 };
const shapeGap = {}; POS.forEach(q => { shapeGap[q] = +(shape[q] - TARGET[q]).toFixed(2); });

const starters = (fz.league && (fz.league.roster_slots || fz.league.starters)) || {};
const shortAt = POS.filter(q => (shape[q] || 0) < (starters[q] || 0));

const doc = {
  _what: 'Post-draft autopsy: every pick against every arm, with the cost of '
    + 'waiting computed from what the room ACTUALLY did rather than simulated.',
  _limit: 'No football has been played. Nothing here grades whether a player is '
    + 'GOOD — only whether the pick captured value that was on the table, priced '
    + 'on draft-day projections.',
  generated_from: { log: 'draft_pick_log_2026.jsonl', freeze_sha256: fz._sha256_of_payload },
  my_slot: MY_SLOT, my_picks: myPicks,
  keepers, keepers_unresolved: unresolvedKeepers.length, picks,
  roster_shape: shape, ruled_target: TARGET, shape_gap: shapeGap,
  starting_slots: starters, short_at_start: shortAt,
};

if (process.argv.includes('--json')) { console.log(JSON.stringify(doc, null, 1)); process.exit(0); }

console.log('DRAFT AUTOPSY 2026 — cost of waiting is EXACT (from the real pick order)\n');
if (unresolvedKeepers.length) console.log('*** ' + unresolvedKeepers.length
  + ' keeper(s) unresolved by id — autopsy incomplete');
console.log('KEEPERS: ' + keepers.map(k => k.position + ' ' + k.name
  + (k.cost_round ? ' (rd ' + k.cost_round + ')' : '')).join(' · '));
console.log('');
console.log('pick | took                   | most expensive wait | VORP said          | MLV said');
picks.forEach(r => {
  const wc = r.highest_wait_cost_position;
  const cost = wc ? r.cost_of_waiting_by_position[wc] : null;
  console.log(String(r.pick).padStart(4) + ' | '
    + ((r.took ? r.took.position + ' ' + r.took.name : '—')).slice(0, 22).padEnd(22) + ' | '
    + ((wc ? wc + ' (' + cost + ' pts)' : '—')).padEnd(19) + ' | '
    + (r.arms.vorp || '—').slice(0, 18).padEnd(18) + ' | '
    + (r.arms.mlv || '—').slice(0, 20));
});
console.log('');
console.log('roster shape : ' + POS.map(q => q + ' ' + shape[q]).join(' · '));
console.log('ruled target : ' + POS.map(q => q + ' ' + TARGET[q]).join(' · '));
console.log('gap          : ' + POS.map(q => q + ' ' + (shapeGap[q] > 0 ? '+' : '') + shapeGap[q]).join(' · '));
if (shortAt.length) console.log('\n*** SHORT OF A STARTER AT: ' + shortAt.join(', '));
const freeWaits = picks.filter(r => r.took_was_still_there_next_pick === true);
console.log('\npicks where the man you took would STILL have been there next pick: '
  + freeWaits.length + '/' + picks.filter(r => r.next_pick).length
  + (freeWaits.length ? '  (' + freeWaits.map(r => r.pick).join(', ') + ')' : ''));

fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));
console.log('\nwrote ' + path.relative(ROOT, OUT));
