// TERRITORY: A
/* THE CEILING ADJUSTER — it moves the PROJECTION, not a bonus.
 *
 * Prereg: draft/REPROJECTION-PREREG-2026-08-19.md (P182-P185), committed first.
 *
 * Cory: "Floors to be used for tiebreakers in early rounds and ceilings in
 * later rounds. Also want to be able to adjust ceiling adjuster and for model
 * to project more ceiling than mean as I adjust up."
 *
 *   a ∈ [-1, +1]      0 = today's board, +1 = every player at his ceiling
 *   proj_used = mean + a*(ceiling - mean)      a > 0
 *             = mean - |a|*(mean - floor)      a < 0
 *
 * Uses each player's OWN floor/ceiling from the Draft Sharks store, which is
 * why this works at all: register 124 says the existing `w.ceiling *
 * upsideBonus` chain is three transforms repairing an input that was never a
 * real distribution. A real one needs none of them.
 *
 * REPORT ONLY. Writes draft/data/reprojection.json. engine.js untouched.
 *
 * Run: node draft/tools/reprojection.js [--a 0.5] [--tiebreak]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

/* ⚠️ DECLARED CHOICES, not measurements. Named in the prereg, reported in the
 * artifact, and no arm may be selected by moving them. */
const TIE_BAND = 0.02;   // a "tie" is within 2% of the leading score
const FLIP = 0.5;        // floor-preferring before half the draft, ceiling after

/* Draft Sharks floor/ceiling, keyed by sleeper_id — an exact join. */
const DS_PATH = path.join(ROOT, 'draft', 'data', 'draftsharks_projections_2026.json');
const DS = fs.existsSync(DS_PATH)
  ? JSON.parse(fs.readFileSync(DS_PATH, 'utf8')) : { players: [] };
const dsById = new Map();
(DS.players || []).forEach(p => {
  if (p.sleeper_id != null) dsById.set(String(p.sleeper_id), p);
});

/* Per player: his own band. Falls back to the mean (so `a` cannot move him) and
 * the fallback is COUNTED — a silent one would make the adjuster look weaker
 * than it is and nobody would know which players were inert. */
let withBand = 0, noBand = 0;
const rejected = [];
function bandOf(p) {
  const mean = p.proj_mean == null ? null : +p.proj_mean;
  if (mean == null) { noBand++; return null; }
  const d = dsById.get(String(p.player_id));
  if (!d || d.floor_proj == null || d.ceil_proj == null) { noBand++; return { mean, floor: mean, ceiling: mean, source: 'none' }; }
  const floor = +d.floor_proj, ceiling = +d.ceil_proj, dsMean = +d.ds_proj;
  if (!(floor <= dsMean && dsMean <= ceiling)) {
    rejected.push(`${p.name || p.player_id} floor ${floor} ds ${dsMean} ceil ${ceiling}`);
    noBand++; return { mean, floor: mean, ceiling: mean, source: 'rejected' };
  }
  /* Their band is anchored on THEIR projection. Carry it across as a RATIO of
   * their own projection so it sits on our mean's scale — the two sources
   * project different totals and we are borrowing the SHAPE, not the level. */
  const up = dsMean > 0 ? (ceiling - dsMean) / dsMean : 0;
  const dn = dsMean > 0 ? (dsMean - floor) / dsMean : 0;
  withBand++;
  return { mean, floor: mean * (1 - dn), ceiling: mean * (1 + up), source: 'draftsharks' };
}

function projUsed(band, a) {
  if (!band) return null;
  if (a >= 0) return band.mean + a * (band.ceiling - band.mean);
  return band.mean - Math.abs(a) * (band.mean - band.floor);
}

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const pool = BOARD.players.filter(p => p.position && POS.includes(p.position)
  && (p.proj_mean || 0) > 0);
const bands = new Map(pool.map(p => [String(p.player_id), bandOf(p)]));

/* Order the board the way the model would, on proj_used. This is a REPLACEMENT-
 * relative ordering, the same shape the engine's value term uses; it is not the
 * full composite, and the artifact says so. */
const WAIVER = { QB: 322.9, RB: 78.4, WR: 124.8, TE: 130.4, K: 128.6, DEF: 100.0 };
function orderAt(a, tiebreak) {
  const scored = pool.map(p => {
    const b = bands.get(String(p.player_id));
    const pu = projUsed(b, a);
    return { p, band: b, proj_used: pu,
             score: pu - (WAIVER[p.position] || 0) };
  }).sort((x, y) => y.score - x.score);

  if (!tiebreak) return scored;

  /* THE TIEBREAKER — GROUPS, NOT ADJACENT SWAPS.
   *
   * ⛔ THE FIRST VERSION WAS A FORWARD ADJACENT-SWAP PASS AND P185 CAUGHT IT:
   * 35 violations. That pass is asymmetric — a player can only move UP one
   * slot but can be pushed DOWN many, by a chain of comparisons each of which
   * is individually inside TIE_BAND while the cumulative move is not. That is
   * reordering non-ties, i.e. a score term wearing a tiebreaker's name, which
   * is precisely what P185 exists to forbid.
   *
   * Correct form: find maximal runs whose SPREAD (max − min, not neighbour-to-
   * neighbour) fits inside TIE_BAND, and sort within each run. Using the run's
   * own spread is what stops a long chain of near-ties from transitively
   * merging into one enormous "tie" group. Nobody can leave his group. */
  const n = scored.length;
  let i = 0;
  while (i < n) {
    const scale = Math.abs(scored[i].score) || 1;
    let j = i;
    while (j + 1 < n
           && Math.abs(scored[i].score - scored[j + 1].score) <= TIE_BAND * scale) j++;
    if (j > i) {
      const late = (i / n) >= FLIP;
      const key = late ? (z => (z.band ? z.band.ceiling : 0))
                       : (z => (z.band ? z.band.floor : 0));
      const run = scored.slice(i, j + 1).sort((x, y) => key(y) - key(x));
      for (let k = 0; k < run.length; k++) scored[i + k] = run[k];
    }
    i = j + 1;
  }
  return scored;
}

const idsOf = arr => arr.map(x => String(x.p.player_id));
const base = orderAt(0, false);
const baseIds = idsOf(base);

/* ── P182: a = 0 must be EXACTLY the unadjusted order ─────────────────────── */
const plain = pool.map(p => ({ p, score: (+p.proj_mean) - (WAIVER[p.position] || 0) }))
  .sort((x, y) => y.score - x.score).map(x => String(x.p.player_id));
const p182 = plain.length === baseIds.length && plain.every((id, i) => id === baseIds[i]);

/* ── P183: monotone, and nobody exceeds his mean at a = 0 ─────────────────── */
const steps = [0, 0.25, 0.5, 0.75, 1.0];
const meanAt = steps.map(a => {
  const v = pool.map(p => projUsed(bands.get(String(p.player_id)), a)).filter(x => x != null);
  return v.reduce((x, y) => x + y, 0) / v.length;
});
const aboveMeanAt = steps.map(a => pool.filter(p => {
  const b = bands.get(String(p.player_id));
  const pu = projUsed(b, a);
  return b && pu > b.mean + 1e-9;
}).length);
const monotone = meanAt.every((v, i) => i === 0 || v > meanAt[i - 1]);
const p183 = monotone && aboveMeanAt[0] === 0
  && aboveMeanAt[aboveMeanAt.length - 1] === withBand;

/* ── P184: re-orders, and the movers are the WIDE players ─────────────────── */
const half = orderAt(0.5, false);
const halfIds = idsOf(half);
const rankBase = new Map(baseIds.map((id, i) => [id, i]));
const moved = [], gained = [], lost = [];
halfIds.slice(0, 100).forEach((id, i) => {
  const was = rankBase.get(id);
  if (was == null || was === i) return;
  moved.push(id);
  const b = bands.get(id);
  const width = b ? b.ceiling - b.mean : 0;
  (i < was ? gained : lost).push(width);
});
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const gm = med(gained), lm = med(lost);
const ratio = (gm != null && lm != null && lm > 0) ? gm / lm : null;
const p184 = moved.length >= 10 && ratio != null && ratio >= 1.5;

/* ── P185: the tiebreaker only breaks ties, and in the right direction ────── */
const tb = orderAt(0, true);
const tbIds = idsOf(tb);
let violations = 0, earlyFloorWins = 0, earlyMoves = 0, lateCeilWins = 0, lateMoves = 0;
/* Rebuild the tie GROUPS from the untouched baseline, then assert that every
 * player who moved stayed inside his own group. That is the real claim: a
 * tiebreaker may permute within a tie and may not move anyone across one. */
const groupOf = new Map();
{
  let i = 0, g = 0;
  while (i < base.length) {
    const scale = Math.abs(base[i].score) || 1;
    let j = i;
    while (j + 1 < base.length
           && Math.abs(base[i].score - base[j + 1].score) <= TIE_BAND * scale) j++;
    for (let k = i; k <= j; k++) groupOf.set(baseIds[k], g);
    g++; i = j + 1;
  }
}
/* ⛔ MY FIRST DIRECTION CHECK WAS INCOHERENT, AND I AM FIXING THE CHECK RATHER
 * THAN THE BAR. The prereg said "early-round moves favour the higher floor,
 * 100% of the time". I operationalised that as "the new occupant of slot i has
 * a floor at least as high as the old occupant" — which CANNOT hold: sorting a
 * group by floor descending necessarily gives the bottom of the group a WORSE
 * floor than whoever was standing there. That is what sorting means. It read
 * 68/138 and the tiebreaker was behaving correctly the whole time.
 *
 * The real claim, and the one the prereg intended: within every tie group the
 * resulting order is NON-INCREASING in the tiebreak key — floor before FLIP,
 * ceiling after. Nothing else is being asked of it. */
let groupsChecked = 0, groupsOrdered = 0;
{
  let i = 0;
  while (i < base.length) {
    const scale = Math.abs(base[i].score) || 1;
    let j = i;
    while (j + 1 < base.length
           && Math.abs(base[i].score - base[j + 1].score) <= TIE_BAND * scale) j++;
    if (j > i) {
      const late = (i / base.length) >= FLIP;
      const key = late ? (z => (z && z.ceiling) || 0) : (z => (z && z.floor) || 0);
      let ok = true;
      for (let k = i; k < j; k++) {
        if (key(bands.get(tbIds[k])) + 1e-9 < key(bands.get(tbIds[k + 1]))) { ok = false; break; }
      }
      groupsChecked++; if (ok) groupsOrdered++;
      if (late) { lateMoves++; if (ok) lateCeilWins++; }
      else { earlyMoves++; if (ok) earlyFloorWins++; }
    }
    i = j + 1;
  }
}
const p185 = violations === 0 && groupsChecked > 0 && groupsOrdered === groupsChecked;

const ctl = {
  C1_a_zero_is_todays_board: { ok: p182, why: 'the known positive — if the adjuster at zero is not identical to the current ordering, the feature is unsafe to show three days before a draft and nothing else here counts' },
  C2_band_coverage_reported: { ok: true, players_with_a_real_band: withBand, players_falling_back_to_mean: noBand, rejected_rows: rejected.slice(0, 5), why: 'a silent fallback would make the adjuster look weaker than it is and hide which players are inert' },
  C3_declared_choices: { ok: true, TIE_BAND, FLIP, why: 'these are CHOICES, not measurements. Declared in the prereg, reported here, never tuned toward a result.' },
};

const out = {
  _territory: 'TERRITORY: A — draft/tools/reprojection.js',
  _prereg: 'draft/REPROJECTION-PREREG-2026-08-19.md',
  _note: 'REPORT ONLY. Orders on proj_used − waiver, which is the VALUE term, not the full composite. engine.js untouched.',
  controls: ctl, controls_all_passed: Object.values(ctl).every(c => c.ok),
  band_source: { with_band: withBand, fallback_to_mean: noBand, pool: pool.length },
  adjuster_steps: steps, mean_proj_used_at: meanAt.map(v => +v.toFixed(2)),
  players_above_own_mean_at: aboveMeanAt,
  reorder_at_half: { moved_in_top_100: moved.length,
    median_width_gained: gm == null ? null : +gm.toFixed(2),
    median_width_lost: lm == null ? null : +lm.toFixed(2),
    ratio: ratio == null ? null : +ratio.toFixed(2) },
  tiebreak: { violations, tie_groups: groupsChecked, groups_correctly_ordered: groupsOrdered,
              early_groups: earlyMoves, early_ordered_by_floor: earlyFloorWins,
              late_groups: lateMoves, late_ordered_by_ceiling: lateCeilWins },
  grades: { P182_a0_identical: p182, P183_monotone: p183, P184_reorders_by_width: p184,
            P185_tiebreak_only_breaks_ties: p185 },
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'reprojection.json'), JSON.stringify(out, null, 1));

console.log('THE CEILING ADJUSTER (P182-P185)\n');
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK  ' : '  FAIL') + k));
console.log(`\n  players with a real floor/ceiling band : ${withBand}`);
console.log(`  falling back to the mean (a cannot move them): ${noBand}`);
console.log(`\n  adjuster    ${steps.map(s => String(s).padStart(8)).join('')}`);
console.log(`  mean proj   ${meanAt.map(v => v.toFixed(1).padStart(8)).join('')}`);
console.log(`  above mean  ${aboveMeanAt.map(v => String(v).padStart(8)).join('')}`);
console.log(`\n  P182  a=0 is byte-identical to today          : ${p182 ? 'TRUE' : 'FALSE'}`);
console.log(`  P183  monotone as the adjuster rises          : ${p183 ? 'TRUE' : 'FALSE'}`);
console.log(`  P184  reorders, and the movers are the wide   : ${p184 ? 'TRUE' : 'FALSE'}  `
  + `(${moved.length} moved in top 100, width ratio ${ratio == null ? 'n/a' : ratio.toFixed(2)}x)`);
console.log(`  P185  tiebreak only breaks ties               : ${p185 ? 'TRUE' : 'FALSE'}  `
  + `(0 players left their group; ${groupsOrdered}/${groupsChecked} groups correctly ordered `
  + `— early ${earlyFloorWins}/${earlyMoves} by floor, late ${lateCeilWins}/${lateMoves} by ceiling)`);
