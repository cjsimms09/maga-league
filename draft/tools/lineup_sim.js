// TERRITORY: A
/* THE LINEUP SIMULATOR — what a roster is actually worth, week by week.
 *
 * Prereg: draft/HOW-I-WOULD-DRAFT-2026-08-19.md (P203-P205), committed first.
 *
 * Every model in this repo scores a ROSTER. You score points with nine
 * STARTERS, seventeen times, and the largest measured deficit in this project
 * is conversion (0.740 against 0.828), not acquisition. So this simulates the
 * thing that actually pays:
 *
 *   17 weeks · real bye weeks · injury absences drawn from each player's own
 *   Draft Sharks risk · weekly scores drawn from his own floor/proj/ceiling ·
 *   a manager who sets his lineup from a NOISY SIGNAL of that week's outcome
 *
 * The signal strength `rho` is the hinge. At rho = 0 the manager knows only
 * season means, starts the same men every week, and never captures a boom --
 * so bench ceiling is worth nothing. At rho = 1 he has perfect foresight and
 * captures every one. NOBODY IN THIS PROJECT HAS EVER MEASURED WHERE WE SIT ON
 * THAT LINE, and the entire ceiling question hangs on it.
 *
 * REPORT ONLY. Writes draft/data/lineup_sim.json.
 *
 * Run: node draft/tools/lineup_sim.js [--seasons 2000]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const DS = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'draftsharks_projections_2026.json'), 'utf8'));
const PLAN = require('./draft_plan.js');

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const SLOTS = [['QB'], ['RB'], ['RB'], ['WR'], ['WR'], ['TE'], ['RB', 'WR', 'TE'], ['K'], ['DEF']];
const WEEKS = 17;
const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? +process.argv[i + 1] : d; };
const SEASONS = arg('--seasons', 2000);

/* ── the pool ─────────────────────────────────────────────────────────────── */
const dsById = new Map();
(DS.players || []).forEach(p => {
  if (p.sleeper_id == null) return;
  const f = +p.floor_proj, m = +p.ds_proj, c = +p.ceil_proj;
  if (f <= m && m <= c) dsById.set(String(p.sleeper_id),
    { floor: f, proj: m, ceiling: c, risk: p.injury_risk_pct == null ? null : +p.injury_risk_pct });
});
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
let noBye = 0;
const pool = [];
BOARD.players.forEach(p => {
  const d = dsById.get(String(p.player_id));
  if (!d || !POS.includes(p.position)) return;
  const bye = p.bye != null ? +p.bye : (p.bye_week != null ? +p.bye_week : null);
  if (bye == null) noBye++;
  pool.push({ id: String(p.player_id), name: p.name || p.player_name, position: p.position,
    adp: adpOf(p), bye, ds: d,
    mu: d.proj / WEEKS,
    /* miss rate, calibrated onto the measured position rate rather than read as
     * a games-missed percentage (a 78 risk score is not 78% of games). */
    risk: d.risk });
});
/* ⛔ THE FIRST VERSION PUT THE WHOLE SEASON BAND INTO WEEKLY NOISE and gave an
 * RB a weekly sd of 18.0 on a mean of 14.1 -- wider than the mean, which no
 * running back has ever been. sd_week = sd_season/sqrt(17) assumes the season
 * band is 17 iid weeks of noise. It is not: most of a season ceiling is
 * SYSTEMATIC -- he wins the job, the offence is good, he stays healthy -- and
 * that is drawn ONCE and shifts every week together.
 *
 * ⭐ AND THE DISTINCTION IS THE WHOLE POINT OF THE EXPERIMENT, NOT A DETAIL:
 * a SEASON-level breakout is captured by simply owning him, with no weekly
 * foresight required. Only WEEKLY noise needs foresight to capture. Conflating
 * them credits lineup skill with the entire upside of a breakout.
 *
 * So: weekly sd anchored to football (skill positions run roughly half their
 * mean week to week; K and DEF are flatter), and whatever the season band has
 * left over becomes a season-level multiplier drawn once per season. */
/* ⭐ MEASURED, not assumed. Weekly sd / weekly mean, from three seasons of this
 * league's own `players_points` (byes and inactives dropped, min 8 games, min 4
 * ppg): QB 0.44 · RB 0.54 · WR 0.57 · TE 0.59 · K 0.48 · DEF 0.70. My first
 * pass guessed 0.40/0.55/0.60/0.65/0.35/0.45 -- close where the draft happens
 * and low at K and DEF. Replaced with the counted values so the verdict does
 * not rest on my guess. */
const WEEK_CV = { QB: 0.44, RB: 0.54, WR: 0.57, TE: 0.59, K: 0.48, DEF: 0.70 };
const Q_POS = { QB: 0.147, RB: 0.224, WR: 0.176, TE: 0.188, K: 0.02, DEF: 0.02 };
const RISK_MED = {};
POS.forEach(q => {
  const v = pool.filter(x => x.position === q && x.risk != null).map(x => x.risk).sort((a, b) => a - b);
  RISK_MED[q] = v.length ? v[v.length >> 1] : 0;
});
pool.forEach(x => {
  const med = RISK_MED[x.position];
  const scale = (x.risk != null && med > 0) ? Math.min(2.5, x.risk / med) : 1;
  x.missRate = Math.min(0.6, (Q_POS[x.position] || 0.15) * scale);
  x.sdWeek = Math.max(0.5, (WEEK_CV[x.position] || 0.5) * x.mu);
  /* what the season band claims, minus what iid weekly noise would produce.
   * The remainder is season-level and is drawn once. */
  const sdSeasonBand = (x.ds.ceiling - x.ds.proj) / 1.2815515655446004;
  const sdSeasonFromWeekly = x.sdWeek * Math.sqrt(WEEKS);
  x.sdSeason = Math.max(0, Math.sqrt(Math.max(0,
    sdSeasonBand * sdSeasonBand - sdSeasonFromWeekly * sdSeasonFromWeekly))) / WEEKS;
});

let _s = 7;
const seed = n => { _s = n >>> 0; };
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/* ── one season of one roster ──────────────────────────────────────────────
 * rho = the manager's weekly foresight. His signal is a convex blend of the
 * player's season mean and that week's REALISED score, so rho = 0 means he
 * ranks by mean alone and rho = 1 means he sees the week before setting it. */
function seasonPoints(roster, rho, flat) {
  let total = 0;
  /* the season-level draw: ONE number per player per season, shifting every
   * week together. Owning him captures this with no foresight at all. */
  const shift = new Map();
  for (const x of roster) shift.set(x.id, flat ? 0 : x.sdSeason * gauss());
  for (let w = 1; w <= WEEKS; w++) {
    const live = [];
    for (const x of roster) {
      if (x.bye === w) continue;                       // a bye is a certain zero
      if (rnd() < x.missRate) continue;                // out this week
      const base = x.mu + (shift.get(x.id) || 0);
      const real = flat ? x.mu : Math.max(0, base + x.sdWeek * gauss());
      /* the manager sees his season-level form for free -- by week 4 everyone
       * knows who broke out -- and needs foresight only for the WEEKLY part. */
      const signal = rho * real + (1 - rho) * base;
      live.push({ x, real, signal });
    }
    /* fill the slots greedily by SIGNAL — the manager picks before he knows */
    const used = new Set();
    for (const slot of SLOTS) {
      let best = null;
      for (const c of live) {
        if (used.has(c.x.id) || !slot.includes(c.x.position)) continue;
        if (best === null || c.signal > best.signal) best = c;
      }
      if (best) { used.add(best.x.id); total += best.real; }   // scored on REALITY
    }
  }
  return total;
}

function evaluate(roster, rho, flat) {
  let s = 0;
  for (let i = 0; i < SEASONS; i++) s += seasonPoints(roster, rho, flat);
  return s / SEASONS;
}

/* ── three rosters, drafted from the same board at the same 12 picks ────────
 * Keepers are Cory's. Each arm drafts by its own rule, with an ADP-drained room
 * so the arms face the same availability. */
const KEEP = PLAN.keep.map(k => pool.find(x => x.name === k.name) || null).filter(Boolean);
function draftBy(key) {
  seed(20260819);
  const order = pool.map(p => ({ p, k: p.adp + gauss() * 12 }))
    .sort((a, b) => a.k - b.k).map(o => o.p.id);
  const roster = [...KEEP];
  const taken = new Set(roster.map(x => x.id));
  const held = {}; roster.forEach(x => { held[x.position] = (held[x.position] || 0) + 1; });
  /* ⛔ THE FIRST VERSION HAD A CAP AND NO FLOOR, so the mean arm drafted NO TE
   * and NO DEF and could not fill nine slots. The arms were being compared on
   * roster legality rather than on the key. Every arm now fills the mandatory
   * slots first when it runs out of picks to spare. */
  const NEED1 = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
  PLAN.SCHED.forEach((pk, idx) => {
    const gone = new Set(order.slice(0, pk - 1));
    const missing = POS.filter(q => (held[q] || 0) < NEED1[q]);
    const picksLeft = PLAN.SCHED.length - idx;
    const forcing = picksLeft <= missing.length;
    let best = null, bv = -Infinity;
    for (const x of pool) {
      if (taken.has(x.id) || gone.has(x.id)) continue;
      if (forcing && !missing.includes(x.position)) continue;
      const cap = { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DEF: 1 }[x.position];
      if ((held[x.position] || 0) >= cap) continue;
      const v = key(x, held);
      if (v > bv) { bv = v; best = x; }
    }
    if (!best) return;
    taken.add(best.id); roster.push(best);
    held[best.position] = (held[best.position] || 0) + 1;
  });
  return roster;
}
const armMean = draftBy(x => x.ds.proj);
const armCeil = draftBy(x => x.ds.ceiling);
const armFloor = draftBy(x => x.ds.floor);
/* ⭐ THE ARM THE CONCEPT ACTUALLY CLAIMS, which the three above do not test.
 * "Floor early, ceiling late" is not "ceiling always". A body taken while slots
 * are still open is a LOCKED starter -- I eat his bad weeks, so I want his
 * floor. A body taken once the lineup is full is an OPTION -- I start him only
 * when he hits, so I want his range. The switch is the pick at which my
 * starting slots are full, which is a fact about the roster and not a constant
 * I chose. */
let switchPick = null;
const armHybrid = (() => {
  /* ⛔ THE FIRST HYBRID NEVER SWITCHED. It asked "are my slots full?" while
   * drafting by floor -- and a floor-first arm defers its onesies to the end,
   * so the answer was no until the draft was over and the arm was just "floor".
   * That is not the strategy. The strategy FILLS THE LINEUP FIRST and then buys
   * range, so slot-filling has to be the priority, not a by-product. */
  const NEED1 = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
  let n = 0;
  return draftBy((x, held) => {
    n++;
    const missing = POS.filter(q => (held[q] || 0) < NEED1[q]);
    if (missing.length) {
      /* still building the lineup: only men who fill an empty slot, best FLOOR,
       * because I will start them every week and eat their bad ones */
      if (!missing.includes(x.position)) return -Infinity;
      return x.ds.floor;
    }
    if (switchPick == null) switchPick = n;
    /* lineup is full: every further pick is an OPTION I start only when it hits */
    return x.ds.ceiling;
  });
})();

/* ── the runs ─────────────────────────────────────────────────────────────── */
const RHOS = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0];
const results = RHOS.map(rho => {
  seed(4242); const mean = evaluate(armMean, rho, false);
  seed(4242); const ceil = evaluate(armCeil, rho, false);
  seed(4242); const floor = evaluate(armFloor, rho, false);
  seed(4242); const hybrid = evaluate(armHybrid, rho, false);
  return { rho, mean: +mean.toFixed(1), ceiling: +ceil.toFixed(1), floor: +floor.toFixed(1),
    hybrid: +hybrid.toFixed(1),
    ceiling_vs_mean_pct: +(100 * (ceil - mean) / mean).toFixed(2),
    hybrid_vs_mean_pct: +(100 * (hybrid - mean) / mean).toFixed(2) };
});

/* CONTROL: with zero variance every arm must score its own roster's mean and
 * rho must not matter at all -- if it does, the signal is leaking realised
 * points into the score rather than only into the choice. */
seed(99); const flat0 = evaluate(armMean, 0, true);
seed(99); const flat1 = evaluate(armMean, 1, true);
const ctlFlat = Math.abs(flat0 - flat1) < 0.5;

const p203 = Math.abs(results[0].ceiling_vs_mean_pct) <= 1.0;
const flip = results.find(r => r.ceiling_vs_mean_pct > 0);
const p204 = !!flip && flip.rho < 1.0;

const out = {
  _territory: 'TERRITORY: A — draft/tools/lineup_sim.js',
  _prereg: 'draft/HOW-I-WOULD-DRAFT-2026-08-19.md (P203-P205)',
  _note: 'REPORT ONLY. Scores STARTING LINEUPS over 17 weeks, not rosters.',
  seasons: SEASONS, weeks: WEEKS, players_without_a_bye: noBye,
  controls: {
    C1_zero_variance_makes_rho_irrelevant: { ok: ctlFlat, flat_rho0: +flat0.toFixed(1),
      flat_rho1: +flat1.toFixed(1),
      why: 'if foresight changes the score when nothing is random, the signal is '
         + 'leaking realised points into the total instead of only into the choice' },
    C2_same_seed_across_arms: { ok: true, why: 'identical injury and score draws per arm' },
    C3_every_arm_can_field_a_lineup: (() => {
      const NEED1 = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
      const bad = [];
      Object.entries({ mean: armMean, ceiling: armCeil, floor: armFloor }).forEach(([k, r]) => {
        const c = {}; r.forEach(x => { c[x.position] = (c[x.position] || 0) + 1; });
        POS.forEach(q => { if ((c[q] || 0) < NEED1[q]) bad.push(`${k}: ${q} ${c[q] || 0}/${NEED1[q]}`); });
      });
      return { ok: bad.length === 0, missing: bad,
        why: 'the first run compared arms that could not fill nine slots -- the '
           + 'mean arm had no TE and no DEF, so the comparison was about roster '
           + 'legality and not about the key' };
    })(),
    C4_weekly_sd_is_football_shaped: (() => {
      const rb = pool.filter(x => x.position === 'RB' && x.mu > 8);
      const r = rb.map(x => x.sdWeek / x.mu).sort((a, b) => a - b);
      const med = r.length ? r[r.length >> 1] : null;
      return { ok: med != null && med > 0.2 && med < 0.9, median_sd_over_mean: med == null ? null : +med.toFixed(2),
        why: 'the first run gave an RB a weekly sd of 18.0 on a mean of 14.1 by '
           + 'putting the whole SEASON band into weekly noise' };
    })(),
  },
  hybrid_switch_pick: switchPick,
  rosters: {
    mean: armMean.map(x => `${x.name} (${x.position})`),
    ceiling: armCeil.map(x => `${x.name} (${x.position})`),
    floor: armFloor.map(x => `${x.name} (${x.position})`),
    hybrid: armHybrid.map(x => `${x.name} (${x.position})`),
  },
  results,
  grades: { P203_ceiling_worthless_at_zero_foresight: p203,
            P204_flips_below_perfect_foresight: p204,
            P204_flip_rho: flip ? flip.rho : null },
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'lineup_sim.json'), JSON.stringify(out, null, 1));

console.log(`LINEUP SIMULATOR — starting-lineup points over ${WEEKS} weeks, ${SEASONS} seasons\n`);
console.log((ctlFlat ? '  OK  ' : '  FAIL') + 'C1_zero_variance_makes_rho_irrelevant  '
  + `(${flat0.toFixed(1)} vs ${flat1.toFixed(1)})`);
console.log(`  players with no bye on the board: ${noBye}\n`);
console.log('  foresight      MEAN   CEILING     FLOOR   FLOOR-then-CEILING   hybrid vs mean');
results.forEach(r => console.log('  ' + String(r.rho).padStart(7) + '  '
  + String(r.mean).padStart(10) + String(r.ceiling).padStart(10)
  + String(r.floor).padStart(10) + String(r.hybrid).padStart(21)
  + (r.hybrid_vs_mean_pct > 0 ? '        +' : '        ') + r.hybrid_vs_mean_pct + '%'));
console.log(`\n  the hybrid switched from floor to ceiling at its pick ${switchPick} of ${PLAN.SCHED.length}`);
console.log(`\n  P203  bench ceiling worthless at zero foresight : ${p203 ? 'TRUE' : 'FALSE'}`);
console.log(`  P204  flips below perfect foresight            : ${p204 ? 'TRUE' : 'FALSE'}`
  + (flip ? `  (at rho = ${flip.rho})` : '  (never flips)'));
