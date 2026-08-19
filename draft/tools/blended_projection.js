// TERRITORY: A
/* THE BLEND — mean of every source, wearing Draft Sharks' band as a percentage.
 *
 * Cory, 2026-08-19: "lets use a mean projection from all, but using the same
 * proj % of draft shark"
 *
 *   proj  = mean of every source that has an opinion on him
 *   floor = proj * (DS floor / DS proj)
 *   ceil  = proj * (DS ceiling / DS proj)
 *
 * The LEVEL comes from the crowd, the SHAPE from Draft Sharks. That separation
 * is the point: averaging forecasts cuts error when the errors are independent,
 * while the band is player-specific information only Draft Sharks publishes
 * (register 119 -- ours is analyst disagreement, which for a receiver is nearly
 * the opposite of volatility).
 *
 * ⚠️ TWO THINGS I AM NOT HIDING BEHIND A CLEAN EQUATION:
 *
 * 1. FANTASYPROS IS A CONSENSUS OF THE OTHERS. Including it alongside CBS,
 *    ESPN and FFToday counts those three twice. `ffanalytics::default_weights`
 *    sets it to exactly 0.000 for this reason. Cory said "all", so ALL is the
 *    default and the excluded arm runs beside it -- his call, made visible
 *    rather than made for him.
 * 2. EVERY SOURCE IS WEIGHTED EQUALLY BECAUSE WE HAVE NO BASIS FOR ANYTHING
 *    ELSE. Nobody's past forecasts were ever stored, so no source has ever been
 *    graded here. projection_snapshot_2026.json is what fixes that in January.
 *
 * REPORT ONLY. Writes draft/data/blended_projection.json.
 * Run: node draft/tools/blended_projection.js [--exclude-fp]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SNAP = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'projection_snapshot_2026.json'), 'utf8'));
if (!SNAP.controls_all_passed) throw new Error('the snapshot failed its controls — REFUSING');

const EXCLUDE_FP = process.argv.includes('--exclude-fp');
/* board_proj_mean is a BLEND of the others and would count them a second time;
 * draftsharks_consensus is Draft Sharks' own blend of everyone, same problem. */
const SOURCES = ['sleeper', 'own_v6', 'cbs', 'espn', 'fftoday', 'draftsharks']
  .concat(EXCLUDE_FP ? [] : ['fantasypros']);

/* ── CENTRING, PER POSITION ───────────────────────────────────────────────────
 * A level offset is not an opinion, so it comes out before averaging. own_v6
 * runs a median 15.3 points below the board mean on 80% of players
 * (register 107); averaging it raw drags every blended number down.
 *
 * ⛔ AND THE OFFSET IS NOT ONE NUMBER, WHICH THE FIRST VERSION ASSUMED. Cory
 * asked whether the bands made sense and the check that answers it turned this
 * up instead. Measured medians against the board mean:
 *
 *     source         global     QB      RB      WR      TE    spread
 *     draftsharks      +8.1  -25.6    +6.7   +10.9    +4.0     36.5
 *     own_v6          -15.3  -15.3   -17.2   -22.4    -2.9     19.5
 *     cbs             +12.4   +0.4   +11.4   +12.1   +13.1     12.7
 *
 * Draft Sharks is 25.6 points LOW on quarterbacks and 10.9 HIGH on receivers.
 * A single global offset subtracted 8.1 from every one of them -- pushing QBs
 * the WRONG WAY by about 34 points and distorting the position balance of the
 * whole blend. Same cross-position mistake as the VONA value term (P196) and
 * the ceiling-steals list, which is three times in one day: a statistic pooled
 * across positions that had no business being pooled. */
const offsets = {};
SOURCES.forEach(s => {
  offsets[s] = {};
  const byPos = {};
  SNAP.players.forEach(p => {
    const a = p.proj[s], b = p.proj.board_proj_mean;
    if (a == null || b == null || b <= 0 || !p.position) return;
    (byPos[p.position] || (byPos[p.position] = [])).push(a - b);
  });
  const all = [];
  Object.values(byPos).forEach(v => all.push(...v));
  all.sort((x, y) => x - y);
  const globalMed = all.length >= 30 ? all[all.length >> 1] : 0;
  Object.entries(byPos).forEach(([pos, v]) => {
    v.sort((x, y) => x - y);
    /* fall back to the global median only where a position is too thin to
     * centre on its own, and that fallback is visible in the artifact */
    offsets[s][pos] = v.length >= 20 ? v[v.length >> 1] : globalMed;
  });
  offsets[s]._global = globalMed;
});
const offsetOf = (s, pos) => {
  const o = offsets[s];
  if (!o) return 0;
  return (o[pos] != null ? o[pos] : o._global) || 0;
};

const rows = [];
let noBand = 0, noSource = 0;
SNAP.players.forEach(p => {
  const vals = [], used = [];
  SOURCES.forEach(s => {
    const v = p.proj[s];
    if (v == null) return;
    vals.push(v - offsetOf(s, p.position));   // centred WITHIN his position
    used.push(s);
  });
  if (!vals.length) { noSource++; return; }
  const proj = vals.reduce((a, b) => a + b, 0) / vals.length;

  /* the band as a RATIO of Draft Sharks' own projection, applied to the blend */
  const dsP = p.proj.draftsharks, dsF = p.bands.draftsharks_floor, dsC = p.bands.draftsharks_ceiling;
  let floor = null, ceiling = null, bandFrom = 'none';
  if (dsP != null && dsP > 0 && dsF != null && dsC != null) {
    floor = proj * (dsF / dsP);
    ceiling = proj * (dsC / dsP);
    bandFrom = 'draftsharks_pct';
  } else { noBand++; }

  rows.push({ player_id: p.player_id, name: p.name, position: p.position,
    adp: p.adp, bye: p.bye,
    proj: +proj.toFixed(1), n_sources: vals.length, sources_used: used,
    floor: floor == null ? null : +floor.toFixed(1),
    ceiling: ceiling == null ? null : +ceiling.toFixed(1),
    /* unrounded, for the control -- C1 must test the ARITHMETIC and not the
     * display rounding. The first version compared r.ceiling/r.proj (both
     * rounded to 0.1) against an unrounded ratio and failed on 3e-4 of
     * formatting error, which is the control measuring the wrong thing. */
    _exact: { proj, floor, ceiling },
    band_from: bandFrom,
    injury_risk_pct: p.bands.draftsharks_injury_risk_pct,
    ds_proj: dsP, board_proj_mean: p.proj.board_proj_mean });
});

/* ── controls ─────────────────────────────────────────────────────────────── */
const withBand = rows.filter(r => r.band_from === 'draftsharks_pct');
const ctl = {
  C1_band_ratio_preserved: (() => {
    /* the whole point: the blend must wear DS's SHAPE exactly, whatever its level */
    let worst = 0;
    withBand.forEach(r => {
      const want = SNAP.players.find(p => p.player_id === r.player_id);
      const dsUp = (want.bands.draftsharks_ceiling / want.proj.draftsharks) - 1;
      const gotUp = (r._exact.ceiling / r._exact.proj) - 1;
      worst = Math.max(worst, Math.abs(dsUp - gotUp));
    });
    return { ok: worst < 1e-9, worst_ratio_error: worst,
      why: 'if the ceiling PERCENTAGE is not identical to Draft Sharks own, '
         + 'we have invented a band rather than carried one across' };
  })(),
  C2_ordering_by_the_blend_differs_from_any_single_source: (() => {
    const rank = key => [...rows].filter(r => r[key] != null)
      .sort((a, b) => b[key] - a[key]).slice(0, 100).map(r => r.player_id);
    const bl = rank('proj'), ds = rank('ds_proj'), bd = rank('board_proj_mean');
    const same = (a, b) => a.filter((x, i) => b[i] === x).length;
    return { ok: same(bl, ds) < 100 && same(bl, bd) < 100,
      top100_identical_to_draftsharks: same(bl, ds),
      top100_identical_to_board_mean: same(bl, bd),
      why: 'a blend that reproduces one source exactly is not a blend' };
  })(),
  C3_centering_is_per_position: {
    ok: Object.entries(offsets).every(([, o]) =>
      Object.keys(o).filter(k => k !== '_global').length >= 4),
    median_offsets_vs_board_mean_by_position: offsets,
    why: 'a single GLOBAL offset was wrong: Draft Sharks runs 25.6 points LOW '
       + 'on quarterbacks and 10.9 HIGH on receivers, a 36.5-point spread, so '
       + 'one number pushed QBs the wrong way by ~34 and distorted the position '
       + 'balance of the whole blend' },
  C4_coverage_reported: { ok: rows.length > 400,
    players_blended: rows.length, no_source_at_all: noSource,
    players_without_a_draftsharks_band: noBand,
    why: 'a player with no DS band gets NO floor/ceiling rather than an invented '
       + 'one -- the adjuster simply cannot move him, and that is visible' },
};
const allOk = Object.values(ctl).every(c => c.ok);

const out = {
  _territory: 'TERRITORY: A — draft/tools/blended_projection.js',
  _ruling: 'Cory 2026-08-19: "lets use a mean projection from all, but using the '
         + 'same proj % of draft shark"',
  _note: 'REPORT ONLY. Level from the crowd, shape from Draft Sharks.',
  _caveats: [
    'FantasyPros is a CONSENSUS of the other projectors; including it counts CBS, '
    + 'ESPN and FFToday twice. ffanalytics weights it 0.000. Cory said "all", so '
    + 'it is IN by default and --exclude-fp runs the other arm.',
    'Every source is weighted EQUALLY because no source has ever been graded here. '
    + 'projection_snapshot_2026.json is what makes January able to weight them.',
  ],
  fantasypros_included: !EXCLUDE_FP, sources: SOURCES,
  controls: ctl, controls_all_passed: allOk,
  n_players: rows.length, n_with_band: withBand.length,
  players: rows.map(r => { const { _exact, ...rest } = r; return rest; }),
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data',
  EXCLUDE_FP ? 'blended_projection_noFP.json' : 'blended_projection.json'),
  JSON.stringify(out, null, 1));

console.log(`BLENDED PROJECTION — mean of all sources, Draft Sharks' band as a %`);
console.log(`  FantasyPros ${EXCLUDE_FP ? 'EXCLUDED' : 'included'}   sources: ${SOURCES.join(', ')}\n`);
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK  ' : '  FAIL') + k));
console.log(`\n  centring offsets vs the board mean, PER POSITION (median points):`);
console.log('    ' + 'source'.padEnd(14) + ['QB', 'RB', 'WR', 'TE'].map(q => q.padStart(8)).join(''));
Object.entries(offsets).forEach(([s, o]) => console.log('    ' + s.padEnd(14)
  + ['QB', 'RB', 'WR', 'TE'].map(q => String(o[q] == null ? '—' : o[q].toFixed(1)).padStart(8)).join('')));
console.log(`\n  ${rows.length} players blended, ${withBand.length} carry a Draft Sharks band`);
console.log(`\n  ${'player'.padEnd(22)}${'blend'.padStart(7)}${'DS'.padStart(7)}${'board'.padStart(8)}`
  + `${'floor'.padStart(8)}${'ceiling'.padStart(9)}   n`);
[...rows].sort((a, b) => b.proj - a.proj).slice(0, 12).forEach(r => console.log(
  '  ' + r.name.slice(0, 21).padEnd(22) + String(r.proj).padStart(7)
  + String(r.ds_proj == null ? '—' : r.ds_proj).padStart(7)
  + String(r.board_proj_mean == null ? '—' : r.board_proj_mean.toFixed(0)).padStart(8)
  + String(r.floor == null ? '—' : r.floor).padStart(8)
  + String(r.ceiling == null ? '—' : r.ceiling).padStart(9)
  + String(r.n_sources).padStart(4)));
process.exit(allOk ? 0 : 1);
