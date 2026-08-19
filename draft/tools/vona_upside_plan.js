// TERRITORY: A
/* VONA · NORMAL ROSTER · UPSIDE LATE — the model Cory asked for, in four rules.
 *
 * Cory, 2026-08-19: "PLEASE MAKE ME A MODEL THAT USES VONA, AND DRAFTS A NORMAL
 * ROSTER AND DRAFTS UPSIDE LATE (FIND A WAY TO CALC UPSIDE CORRECTLY!!!!!"
 *
 * Prereg: draft/VONA-UPSIDE-LATE-PREREG-2026-08-19.md (P137/P138/P139),
 * committed before this ran. REPORT ONLY — writes no board field, changes no
 * weight, ships nothing. no_fit_guard.
 *
 * ── THE MODEL ──────────────────────────────────────────────────────────────
 *
 *   SEATS    my picks -> starting slots by exact optimisation.  REUSED from
 *            draft_plan.js, not reimplemented (rule 11: one derivation).
 *   STARTER  VONA = proj(best avail at pos now) - E[proj(best at my NEXT pick)]
 *   BENCH    shortlist by value = P(need) x (proj - waiver level),
 *            then CHOOSE FROM THE SHORTLIST BY UPSIDE
 *   ONESIES  K/DEF last two seats only
 *
 * Nothing is summed. Three different rankings used in three different places,
 * which is what ffanalytics does (rank / floor_rank / ceiling_rank) and what
 * the textbook prescribes: starters low-uncertainty, bench high-uncertainty.
 *
 * ── UPSIDE, AND WHY THE OBVIOUS VERSIONS ARE WRONG ─────────────────────────
 *
 *   raw proj_ceiling          vs proj_mean:  +0.9951   it IS value
 *   spread (what we ship)     vs proj_mean:  +0.70     70% a copy of value
 *   RESIDUAL upside (this)    vs proj_mean:  +0.04     orthogonal
 *
 *     spread(p) = proj_ceiling - proj_mean         [cross-source players only]
 *     upside(p) = spread(p) - median spread among players at his own position
 *                 within +/-7 positional ranks of him
 *
 * "How much MORE uncertainty does he carry than players as good as he is."
 *
 * ABSENT, NOT ZERO. No cross-source spread -> no upside score -> that pick
 * falls back to value and the report names it. A fabricated zero would rank an
 * unknown player as "average upside", which is register 101's failure in a new
 * place.
 *
 * Run: node draft/tools/vona_upside_plan.js [--json <path>]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PLAN = require('./draft_plan.js');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

const SHORTLIST_N = 10;   // declared in the prereg, NOT tuned on the output
const RANK_WINDOW = 7;    // same

/* ── ARM 2: THE POSITIONAL CAP ─────────────────────────────────────────────
 * Derived from the league's own roster_slots in the prereg addendum, BEFORE
 * this arm ran, with the explicit condition that no number here may change
 * after seeing the roster it produces:
 *
 *   one-starter skill (QB, TE)  starters + 1        one backup against injury
 *   streamed onesies (K, DEF)   1                   measured wire churn in THIS
 *                                                   league: DEF 100% / K 83% of
 *                                                   the pool cycles (waiver_supply)
 *   multi-starter (RB, WR)      starters + FLEX + 3
 *
 * Capacity 18 >= 15, so it constrains without making the roster infeasible.
 * KEEPERS COUNT — they occupy roster spots.
 *
 * Arm 1 (no cap) is still the default; ARM=capped turns this on, so both arms
 * come out of one module and neither is a rewrite of the other. */
/* ⚖️ CORY'S RULING 2026-08-19: "NOT 2 qbS AND 2 TE THATS NOT NORMAL" — QB 1,
 * TE 1. He owns what "normal roster" means; my "starters + 1" was an inference,
 * not a league rule, and spending two of six bench slots on positions you start
 * one of was my choice. Prereg addendum 2. NOT a tuned constant: the requirement
 * holder ruled on a requirement he set. Cost recorded there too — bye weeks leave
 * the slot empty and must be streamed. */
const CAP = { QB: 1, RB: 6, WR: 6, TE: 1, K: 1, DEF: 1 };
const CAPPED = (process.env.ARM || '') === 'capped';

/* ── UPSIDE ───────────────────────────────────────────────────────────────── */
const pool = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const byPos = {};
pool.forEach(p => { (byPos[p.position] = byPos[p.position] || []).push(p); });
Object.values(byPos).forEach(a => a.sort((x, y) => (y.proj_mean || 0) - (x.proj_mean || 0)));

const median = a => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* spread exists ONLY where the band came from real cross-source disagreement.
 * Every other band on this board is a parametric fill, and treating one as the
 * other is how a fabricated number gets into a ranking. */
const spreadOf = p => (p.proj_ceiling_source === 'cross-source-p90'
  && p.proj_ceiling != null && p.proj_mean != null)
  ? (p.proj_ceiling - p.proj_mean) : null;

const UPSIDE = new Map();
Object.entries(byPos).forEach(([pos, arr]) => {
  arr.forEach((p, i) => {
    const s = spreadOf(p);
    if (s == null) return;
    const lo = Math.max(0, i - RANK_WINDOW), hi = Math.min(arr.length, i + RANK_WINDOW + 1);
    const peers = arr.slice(lo, hi).filter(q => q !== p).map(spreadOf).filter(x => x != null);
    if (peers.length < 3) return;              // too thin to define "typical"
    UPSIDE.set(String(p.player_id), s - median(peers));
  });
});

/* ── CONTROL 2 — orthogonality, RE-MEASURED HERE rather than quoted ───────── */
function spearman(xs, ys) {
  const rank = v => {
    const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(v.length);
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const a = rank(xs), b = rank(ys), n = xs.length;
  const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}
const upsRows = pool.filter(p => UPSIDE.has(String(p.player_id)));
const rho = upsRows.length > 20
  ? spearman(upsRows.map(p => UPSIDE.get(String(p.player_id))), upsRows.map(p => p.proj_mean))
  : null;

/* ── THE PLAN ─────────────────────────────────────────────────────────────── */
/* draft_plan.ranked carries, per pick, the eligible candidates already priced —
 * starters by seat projection, bench by P(need) x (proj - waiver). We take its
 * seats verbatim and change exactly one thing: at a BENCH seat, pick by upside
 * from within the top-N by value. */
const out = [];
let noUpside = 0;
const taken = new Set();
/* keepers occupy roster spots, so they count against the cap from pick one */
const held = {};
PLAN.keep.forEach(k => { held[k.position] = (held[k.position] || 0) + 1; });
const capBlocks = [];
PLAN.ranked.forEach((row, i) => {
  const list = (row.list || [])
    .filter(x => !taken.has(String((x.p || {}).player_id)))
    .filter(x => {
      if (!CAPPED) return true;
      const pos = (x.p || {}).position;
      const cap = CAP[pos];
      if (cap == null || (held[pos] || 0) < cap) return true;
      capBlocks.push({ pick: row.pick, pos, name: x.p.name });
      return false;
    });
  if (!list.length) { out.push({ pick: row.pick, role: row.role, p: null }); return; }
  const isBench = row.role === 'bench';
  let chosen, why;
  if (!isBench) {
    /* STARTER SEAT — VONA order is draft_plan's own ordering. Tie-break toward
     * the safer player, per the textbook: starters want LOW uncertainty. */
    const top = list.slice(0, 3);
    const best = top[0];
    const near = top.filter(x => (best.v - x.v) <= Math.abs(best.v) * 0.02);
    chosen = near.length > 1
      ? near.slice().sort((a, b) => (spreadOf(a.p) ?? 1e9) - (spreadOf(b.p) ?? 1e9))[0]
      : best;
    why = near.length > 1 ? 'VONA, tie broken to the lower-uncertainty player' : 'VONA';
  } else {
    const short = list.slice(0, SHORTLIST_N);
    const scored = short.map(x => ({ x, u: UPSIDE.get(String(x.p.player_id)) }))
      .filter(s => s.u != null);
    if (!scored.length) { chosen = short[0]; why = 'value (NO upside score available)'; noUpside++; }
    else { scored.sort((a, b) => b.u - a.u); chosen = scored[0].x; why = 'upside within the value shortlist'; }
  }
  const pid = String((chosen.p || {}).player_id);
  taken.add(pid);
  held[chosen.p.position] = (held[chosen.p.position] || 0) + 1;
  out.push({ pick: row.pick, role: row.role, name: chosen.p.name, pos: chosen.p.position,
             adp: chosen.p.adp, proj: chosen.p.proj_mean, value: chosen.v,
             upside: UPSIDE.has(pid) ? +UPSIDE.get(pid).toFixed(1) : null,
             why, shortlist_n: isBench ? Math.min(SHORTLIST_N, list.length) : null,
             value_pick: list[0] ? list[0].p.name : null });
});

/* ── CONTROLS ─────────────────────────────────────────────────────────────── */
const planSeats = PLAN.plan.map(x => x.slot).join(',');
const mySeats = out.map(x => x.role).join(',');
const ctl = {
  C1_seats_match_draft_plan: { ok: planSeats === mySeats,
    why: 'the seat assignment is REUSED; a mismatch means it was reimplemented' },
  C2_upside_is_orthogonal: { ok: rho != null && Math.abs(rho) < 0.25, rho: rho && +rho.toFixed(3),
    n: upsRows.length,
    why: 'measured on THIS board, not quoted. if upside is a second copy of value, refuse' },
  C3_bench_picks_come_from_the_value_shortlist: { ok: true,
    why: 'enforced by construction — the chooser only sees list.slice(0, N)' },
  C4_absence_reported: { ok: true, picks_with_no_upside_score: noUpside,
    why: 'absent, not zero (register 101)' },
  C5_fifteen_players: { ok: out.filter(x => x.name).length + PLAN.keep.length === 15,
    got: out.filter(x => x.name).length + PLAN.keep.length },
  C6_no_position_exceeds_its_cap: { ok: !CAPPED
      || Object.entries(held).every(([p, n]) => CAP[p] == null || n <= CAP[p]),
    arm: CAPPED ? 'capped' : 'uncapped (arm 1 — cap not applied)',
    cap: CAPPED ? CAP : null, held: Object.assign({}, held),
    why: 'enforced in code, so a violation means the enforcement is broken, '
       + 'not the policy' },
};
const allOk = Object.values(ctl).every(c => c.ok);

/* ── REPORT ───────────────────────────────────────────────────────────────── */
const counts = {};
PLAN.keep.forEach(k => { counts[k.position] = (counts[k.position] || 0) + 1; });
out.forEach(x => { if (x.pos) counts[x.pos] = (counts[x.pos] || 0) + 1; });

console.log('VONA · NORMAL ROSTER · UPSIDE LATE   arm=' + (CAPPED ? 'CAPPED (P140)' : 'uncapped (P137-P139)') + '\n');
Object.entries(ctl).forEach(([k, c]) => console.log('  ' + (c.ok ? 'OK ' : '!! ') + k
  + (c.rho !== undefined ? '   rho=' + c.rho + ' on n=' + c.n : '')));
if (!allOk) console.log('\n  !! A CONTROL FAILED. Nothing below is a recommendation.\n');
console.log('\n  keepers: ' + PLAN.keep.map(k => k.position + ' ' + k.name).join(', '));
console.log('\n  pick  seat     take                       proj   upside  why');
out.forEach(x => console.log('  ' + String(x.pick).padStart(4) + '  ' + String(x.role).padEnd(7)
  + ' ' + (x.name ? (x.pos + ' ' + x.name) : '—').padEnd(26)
  + (x.proj != null ? x.proj.toFixed(0).padStart(6) : '     —')
  + (x.upside != null ? (x.upside >= 0 ? '+' : '') + x.upside.toFixed(1) : '   —').padStart(9)
  + '  ' + x.why));
console.log('\n  full 15-man roster: '
  + ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(p => p + (counts[p] || 0)).join(' '));

const bench = out.filter(x => x.role === 'bench' && x.name);
const swapped = bench.filter(x => x.value_pick && x.value_pick !== x.name);
console.log('  bench picks where upside CHANGED the choice: ' + swapped.length + ' of ' + bench.length);
swapped.forEach(x => console.log('     pick ' + x.pick + ': ' + x.name
  + '  (value would have taken ' + x.value_pick + ')'));

const rep = { _territory: 'TERRITORY: A — draft/tools/vona_upside_plan.js',
  _prereg: 'draft/VONA-UPSIDE-LATE-PREREG-2026-08-19.md',
  _note: 'REPORT ONLY. Writes no board field. no_fit_guard.',
  board_built_at: DATA.built_at, controls: ctl, controls_all_passed: allOk,
  shortlist_n: SHORTLIST_N, rank_window: RANK_WINDOW,
  keepers: PLAN.keep.map(k => ({ name: k.name, pos: k.position })),
  picks: out, roster_counts: counts,
  bench_changed_by_upside: swapped.map(x => ({ pick: x.pick, took: x.name, value_would_take: x.value_pick })) };
const i = process.argv.indexOf('--json');
if (i >= 0) { fs.writeFileSync(process.argv[i + 1], JSON.stringify(rep, null, 1));
  console.log('\n  wrote ' + process.argv[i + 1]); }
process.exitCode = allOk ? 0 : 1;
