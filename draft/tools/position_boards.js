// TERRITORY: A
/* POSITION BOARDS — top N at every position, with when-gone and when-to-strike.
 *
 * Cory, 2026-08-19: "you aren't making 1 recommended pick anymore. You're
 * giving me top 5-10 at each position (more on RB and WR) and showing me
 * projected vona drop offs by other team remaining needs and projections of
 * when gone. This helps me determine when to strike on certain positions.
 * Wouldn't mind little notes from model like maybe take QB here or wait on QB
 * here."
 *
 * So this emits ONE recommendation for nothing. Per position, per pick:
 *
 *   - the top N (10 for RB/WR, 6 for QB/TE, 4 for K/DEF)
 *   - P(still there at your NEXT pick), from 300 simulated rooms
 *   - the VONA drop-off, and WHERE the cliff is inside the list
 *   - a plain-English note: strike, or wait, and why
 *
 * ⚠️ THE SURVIVAL NUMBER HERE IS ADP-DRAIN ONLY. The live war room has a far
 * better one -- `survival.js` composes ADP with opponent-need Layer 2 from
 * `opponent_need_2026.json` -- but it needs live draft context (who has picked,
 * what they still need) that does not exist offline. THE WAR ROOM MUST OVERRIDE
 * THIS FIELD WITH THE LIVE ONE. It is here so the view has something to render
 * before the draft starts, and it is labelled in the artifact so nobody mistakes
 * it for the opponent-aware number.
 *
 * Projections/floor/ceiling: Draft Sharks. ADP/adp_sd: our board.
 * REPORT ONLY. Writes public/position_boards.json for the war room to read.
 *
 * Run: node draft/tools/position_boards.js [--rooms 300] [--a 0]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');
const DS = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'draftsharks_projections_2026.json'), 'utf8'));

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const TOPN = { RB: 10, WR: 10, QB: 6, TE: 6, K: 4, DEF: 4 };   // Cory: "more on RB and WR"
const WAIVER = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };
const SCHED = PLAN.SCHED;
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? +process.argv[i + 1] : d; };
const ROOMS = arg('--rooms', 300);
const A = Math.min(1, Math.max(0, arg('--a', 0)));

const dsById = new Map();
(DS.players || []).forEach(p => {
  if (p.sleeper_id == null) return;
  const f = +p.floor_proj, m = +p.ds_proj, c = +p.ceil_proj;
  if (f <= m && m <= c) dsById.set(String(p.sleeper_id), { floor: f, proj: m, ceiling: c,
    risk: p.injury_risk_pct == null ? null : +p.injury_risk_pct });
});
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const pool = [];
BOARD.players.forEach(p => {
  const d = dsById.get(String(p.player_id));
  if (!d || !POS.includes(p.position)) return;
  pool.push({ id: String(p.player_id), name: p.name || p.player_name, position: p.position,
              team: p.team || null, adp: adpOf(p), sd: p.adp_sd == null ? 12 : +p.adp_sd, ds: d });
});
const projUsed = x => x.ds.proj + A * (x.ds.ceiling - x.ds.proj);

let _s = 20260819;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* availableAt[i][id] = times he was still on the board at Cory's i-th pick */
const availAt = SCHED.map(() => new Map());
const bestNextByPos = SCHED.map(() => { const o = {}; POS.forEach(q => { o[q] = []; }); return o; });
for (let r = 0; r < ROOMS; r++) {
  const order = pool.map(p => ({ p, k: p.adp + gauss() * p.sd }))
    .sort((x, y) => x.k - y.k).map(x => x.p.id);
  SCHED.forEach((pk, i) => {
    const gone = new Set(order.slice(0, pk - 1));
    pool.forEach(x => { if (!gone.has(x.id)) availAt[i].set(x.id, (availAt[i].get(x.id) || 0) + 1); });
    const nxt = SCHED[i + 1];
    if (nxt == null) return;
    const goneNext = new Set(order.slice(0, nxt - 1));
    POS.forEach(q => {
      let b = null;
      for (const x of pool) if (x.position === q && !goneNext.has(x.id)) {
        const v = projUsed(x); if (b === null || v > b) b = v;
      }
      if (b != null) bestNextByPos[i][q].push(b);
    });
  });
}
const mean = z => (z.length ? z.reduce((x, y) => x + y, 0) / z.length : null);

const picks = SCHED.map((pk, i) => {
  const row = { pick: pk, round: Math.ceil(pk / 10), next_pick: SCHED[i + 1] || null, positions: {} };
  POS.forEach(q => {
    const here = pool.filter(x => x.position === q)
      .map(x => ({ x, availNow: (availAt[i].get(x.id) || 0) / ROOMS,
                   availNext: SCHED[i + 1] == null ? 0 : (availAt[i + 1].get(x.id) || 0) / ROOMS }))
      /* the men actually in play at this pick — not the ones already gone */
      .filter(o => o.availNow >= 0.05)
      .sort((a, b) => projUsed(b.x) - projUsed(a.x))
      .slice(0, TOPN[q]);

    const bestNow = here.length ? projUsed(here[0].x) : null;
    const bestNext = mean(bestNextByPos[i][q]);
    const vona = (bestNow != null && bestNext != null) ? Math.max(0, bestNow - bestNext) : null;
    const surplus = bestNow == null ? null : Math.max(0, bestNow - WAIVER[q]);

    /* the cliff INSIDE the list: the biggest one-step drop among the top N */
    let cliffAfter = null, cliffSize = 0;
    for (let k = 0; k + 1 < here.length; k++) {
      const d = projUsed(here[k].x) - projUsed(here[k + 1].x);
      if (d > cliffSize) { cliffSize = d; cliffAfter = k + 1; }
    }

    row.positions[q] = {
      best_now: bestNow == null ? null : +bestNow.toFixed(1),
      expected_best_at_next_pick: bestNext == null ? null : +bestNext.toFixed(1),
      VONA: vona == null ? null : +vona.toFixed(1),
      surplus_over_wire: surplus == null ? null : +surplus.toFixed(1),
      cliff_after_rank: cliffAfter, cliff_size: +cliffSize.toFixed(1),
      note: noteFor(q, vona, surplus, here),
      players: here.map(o => ({
        name: o.x.name, team: o.x.team,
        proj: +o.x.ds.proj.toFixed(1), floor: +o.x.ds.floor.toFixed(1),
        ceiling: +o.x.ds.ceiling.toFixed(1), injury_risk_pct: o.x.ds.risk,
        adp: +o.x.adp.toFixed(1),
        pct_available_now: +(o.availNow * 100).toFixed(0),
        pct_still_there_next_pick: +(o.availNext * 100).toFixed(0),
        surplus_over_wire: +Math.max(0, projUsed(o.x) - WAIVER[q]).toFixed(1),
      })),
    };
  });
  return row;
});

/* Cory: "wouldn't mind little notes from model like maybe take QB here or wait
 * on QB here." The note states the ARITHMETIC, never a pick. The two numbers it
 * weighs are the ones the model kept confusing: VONA is what waiting costs,
 * surplus is whether he is worth anything at all. */
function noteFor(q, vona, surplus, here) {
  if (vona == null || surplus == null) return null;
  const top = here[0];
  if (surplus < 5) return `skip — the best ${q} left is worth ${surplus.toFixed(0)} over a free one`;
  if (vona >= 12 && surplus >= 40) return `STRIKE — waiting costs ${vona.toFixed(0)} and he is +${surplus.toFixed(0)} over the wire`;
  if (vona <= 4 && surplus >= 25) return `wait — only ${vona.toFixed(0)} lost by waiting, the tier holds`;
  if (top && top.availNext >= 0.7) return `wait — ${top.x.name} is there next pick ${Math.round(top.availNext * 100)}% of the time`;
  if (vona >= 12) return `waiting costs ${vona.toFixed(0)}, but he is only +${surplus.toFixed(0)} over the wire — thin`;
  return `neutral — ${vona.toFixed(0)} to wait, +${surplus.toFixed(0)} over the wire`;
}


/* ── 1. OPPONENT NEEDS, SMALL ENOUGH TO READ AT 8 SECONDS A PICK ─────────────
 * Cory: "It should be very easy for me to view other team needs in a very small
 * window, find way to make it clear yet small."
 * One row per owner. Not tendencies, not probabilities -- the two facts that
 * change his pick: what they KEEP (so those slots are shut) and what is still
 * OPEN. Rendered as a compact string the view can print in one line. */
const ON = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'opponent_need_2026.json'), 'utf8')); }
  catch (e) { return null; }
})();
const opponents_compact = [];
if (ON && ON.opponents) {
  Object.entries(ON.opponents).forEach(([who, o]) => {
    const ns = o.need_state_at_draft_open || {};
    const open = POS.filter(q => ns[q] === 'open');
    const keeps = (o.keeper_slate || []).map(k => k.position);
    const kc = {}; keeps.forEach(q => { kc[q] = (kc[q] || 0) + 1; });
    opponents_compact.push({
      owner: who,
      keeps: POS.filter(q => kc[q]).map(q => (kc[q] > 1 ? kc[q] : '') + q).join(' '),
      needs: open.join(' '),
      /* the one number that changes YOUR pick: how likely they take each
       * position early, from their own history */
      /* ⛔ THE FIRST VERSION PRINTED "RB 50%" FOR ALL TEN OWNERS. That is the
       * LEAGUE bucket, not the owner -- tendency_by_bucket marks each cell with
       * source: 'league_bucket' when it has no owner history, and I was reading
       * the probability without the source. A column identical down every row is
       * not information, and it looked like information. Owner-specific cells
       * only; otherwise the column says so. */
      early_lean: (() => {
        const e = (o.tendency_by_bucket || {}).early || {};
        const cells = e.cells || {};
        const own = Object.entries(cells)
          .filter(([, c]) => c && c.source && c.source !== 'league_bucket' && c.rate > 0)
          .sort((a, b) => b[1].rate - a[1].rate)[0];
        return own ? `${own[0]} ${(own[1].rate * 100).toFixed(0)}%` : 'league avg only';
      })(),
    });
  });
}

/* ── 2. ROUND-TO-ROUND DROP-OFFS ─────────────────────────────────────────────
 * Cory: "what I need from you is info about when position drop offs are high or
 * low between rounds."
 * Not VONA within a pick -- the change in what is available BETWEEN his picks.
 * A big number means the position falls off a cliff between these two rounds;
 * a small one means the tier holds and he can wait. */
const round_dropoffs = [];
for (let i = 0; i + 1 < picks.length; i++) {
  const a = picks[i], b = picks[i + 1];
  const row = { from_pick: a.pick, to_pick: b.pick,
                from_round: a.round, to_round: b.round, pos: {} };
  POS.forEach(q => {
    const x = a.positions[q].best_now, y = b.positions[q].best_now;
    row.pos[q] = (x == null || y == null) ? null : +(x - y).toFixed(1);
  });
  const vals = POS.map(q => row.pos[q]).filter(v => v != null);
  row.steepest = POS.reduce((bq, q) => (row.pos[q] != null
    && (bq == null || row.pos[q] > row.pos[bq])) ? q : bq, null);
  row.flattest = POS.reduce((bq, q) => (row.pos[q] != null
    && (bq == null || row.pos[q] < row.pos[bq])) ? q : bq, null);
  round_dropoffs.push(row);
}

/* ── 3. CEILING STEALS ───────────────────────────────────────────────────────
 * Cory: "look for players who's ADP is a steal if they perform closer to their
 * ceilings."
 * A player the room prices by his MEAN, whose CEILING would make him a far
 * earlier pick. Measured as the gap between where ADP has him and where his
 * ceiling would rank him on the whole board. Positive = the room is late on him
 * IF he hits. This is an IF, and the artifact says so -- it is not a projection
 * that he will. */
/* ⛔ RANKED WITHIN POSITION, NOT ACROSS THE BOARD. The first version ranked
 * ceilings over the whole pool and returned TWELVE QUARTERBACKS out of twelve --
 * because QB ceilings sit on a 400-point scale while a receiver's top out near
 * 290. That is the same cross-position comparability bug that was in the value
 * term (P196), reappearing here. A steal is "early for HIS position". */
const ceilRank = new Map(), adpRank = new Map();
POS.forEach(q => {
  const grp = pool.filter(x => x.position === q);
  [...grp].sort((a, b) => b.ds.ceiling - a.ds.ceiling).forEach((x, i) => ceilRank.set(x.id, i + 1));
  [...grp].sort((a, b) => a.adp - b.adp).forEach((x, i) => adpRank.set(x.id, i + 1));
});
const ceiling_steals = pool
  .map(x => ({
    name: x.name, position: x.position, adp: +x.adp.toFixed(1),
    proj: +x.ds.proj.toFixed(1), ceiling: +x.ds.ceiling.toFixed(1),
    upside: +(x.ds.ceiling - x.ds.proj).toFixed(1),
    ceiling_rank: ceilRank.get(x.id), adp_rank: adpRank.get(x.id),
    steal_gap: adpRank.get(x.id) - ceilRank.get(x.id),
    injury_risk_pct: x.ds.risk,
  }))
  .filter(r => r.adp <= 200 && r.steal_gap >= 5)
  .sort((a, b) => b.steal_gap - a.steal_gap)
  .slice(0, 25);

const out = {
  _territory: 'TERRITORY: A — draft/tools/position_boards.js',
  _what: 'Top N per position with when-gone and when-to-strike. NO single '
       + 'recommendation — Cory chooses the position.',
  _sources: 'projections/floor/ceiling = Draft Sharks; ADP/adp_sd = our board (Sleeper/FantasyPros)',
  _survival_caveat: 'pct_still_there_next_pick is ADP-DRAIN ONLY over ' + ROOMS
    + ' simulated rooms. The war room MUST override it with survival.js, which '
    + 'composes ADP with opponent-need Layer 2 and needs live draft context.',
  built_at: BOARD.built_at || null,
  rooms: ROOMS, adjuster_a: A, top_n: TOPN, waiver: WAIVER, picks,
  opponents_compact, round_dropoffs, ceiling_steals,
  _steals_caveat: 'ceiling_steals is an IF, not a forecast: it ranks players by '
    + 'how much earlier their CEILING would have ranked them AT THEIR OWN POSITION than their ADP did. It says '
    + 'nothing about whether they reach it.',
};

/* CONTROLS — a board that silently lost a position is worse than no board. */
const ctl = {
  C1_every_pick_has_every_position: {
    ok: picks.every(r => POS.every(q => r.positions[q] && r.positions[q].players)),
    why: 'a missing column reads as "nothing available" at the table' },
  C2_lists_are_full_where_the_pool_allows: (() => {
    const short = [];
    picks.forEach(r => POS.forEach(q => {
      const n = r.positions[q].players.length;
      if (n < Math.min(TOPN[q], 3)) short.push(`pick ${r.pick} ${q}: ${n}`);
    }));
    return { ok: short.length === 0, short: short.slice(0, 8),
      why: 'Cory asked for 5-10 per position; a list that quietly comes back with '
         + 'one name is a filter bug, not a thin position' };
  })(),
  C3_survival_is_labelled_adp_only: { ok: true,
    why: 'the live war room has an opponent-aware number and MUST override this one' },
};
out.controls = ctl;
out.controls_all_passed = Object.values(ctl).every(c => c.ok);

fs.writeFileSync(path.join(ROOT, 'public', 'position_boards.json'), JSON.stringify(out, null, 1));

console.log(`POSITION BOARDS — top N per position, no single recommendation`);
console.log(`  ${ROOMS} rooms, adjuster a = ${A}\n`);
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK  ' : '  FAIL') + k));
const show = [SCHED[0], SCHED[4], SCHED[8]];
picks.filter(r => show.includes(r.pick)).forEach(r => {
  console.log(`\n  ── PICK ${r.pick} (round ${r.round}) → next at ${r.next_pick}`);
  POS.forEach(q => {
    const c = r.positions[q];
    if (!c.players.length) return;
    console.log(`    ${q.padEnd(4)} VONA ${String(c.VONA).padStart(5)}  surplus ${String(c.surplus_over_wire).padStart(5)}   ${c.note}`);
    c.players.slice(0, 3).forEach(pl => console.log(
      `         ${pl.name.slice(0, 20).padEnd(21)} proj ${String(pl.proj).padStart(5)}`
      + `  ceil ${String(pl.ceiling).padStart(5)}  there next pick ${String(pl.pct_still_there_next_pick).padStart(3)}%`));
  });
});
console.log('\n  ── OTHER TEAMS, SMALL ──');
console.log('    ' + 'owner'.padEnd(9) + 'keeps'.padEnd(12) + 'still needs'.padEnd(22) + 'leans early');
opponents_compact.forEach(o => console.log('    ' + String(o.owner).slice(0, 8).padEnd(9)
  + String(o.keeps || '—').padEnd(12) + String(o.needs || '—').padEnd(22) + (o.early_lean || '—')));

console.log('\n  ── DROP-OFF BETWEEN YOUR PICKS (points of best-available lost) ──');
console.log('    ' + 'from→to'.padEnd(10) + POS.map(q => q.padStart(6)).join('') + '   steepest  flattest');
round_dropoffs.forEach(r => console.log('    '
  + (r.from_pick + '→' + r.to_pick).padEnd(10)
  + POS.map(q => String(r.pos[q] == null ? '—' : r.pos[q].toFixed(0)).padStart(6)).join('')
  + '   ' + String(r.steepest).padEnd(9) + r.flattest));

console.log('\n  ── CEILING STEALS — the room prices the mean; how early would the CEILING have gone? ──');
console.log('    ' + 'player'.padEnd(22) + 'pos'.padEnd(5) + 'adp'.padStart(6)
  + 'proj'.padStart(7) + 'ceil'.padStart(7) + 'upside'.padStart(8) + '  pos-ranks earlier if he hits');
ceiling_steals.slice(0, 12).forEach(r => console.log('    ' + r.name.slice(0, 21).padEnd(22)
  + r.position.padEnd(5) + String(r.adp).padStart(6) + String(r.proj).padStart(7)
  + String(r.ceiling).padStart(7) + String(r.upside).padStart(8) + String(r.steal_gap).padStart(12)));

console.log(`\n  wrote public/position_boards.json`);
