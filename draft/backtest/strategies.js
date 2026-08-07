/* Step 3: which weight profile would have won our drafts — and is that a
 * strategy or a lucky point in weight-space?
 *
 * Eight named profiles run as B3 variants through the same replay harness, on
 * identical board and roster state, graded per draft. The comparison to Default
 * is PAIRED — profile minus Default on the same (season, seat) draft — because
 * with two or three drafts the paired difference is the only comparison whose
 * confidence interval means anything.
 *
 * THE SELECTION RULE IS PRE-REGISTERED HERE, BEFORE ANY NUMBER EXISTS, exactly
 * as report.js pre-registers its alarms — so it cannot soften after seeing the
 * table:
 *
 *   N >= 3 : the winner must beat Default in at least 2 of N seasons AND on the
 *            pooled mean. (The original pre-registration, verbatim.)
 *   N == 2 : win-both — beat Default in BOTH seasons AND pooled. Recorded as a
 *            bar tightened by DATA AVAILABILITY, not by choice.
 *   else   : Default stands.
 *
 * AND THE PERTURBATION GATE, added before results: a profile that clears the
 * rule is not installed until its edge survives jitter. Each weight is
 * multiplied by uniform(1 - JITTER, 1 + JITTER) and the whole sweep re-run. If
 * the edge over Default is a property of the STRATEGY it survives small
 * perturbation; if it lived at one exact point in weight-space it collapses,
 * and that is noise wearing a crown. Concretely: at least SURVIVE_FRACTION of
 * jittered variants must still beat Default on the pooled mean. Otherwise
 * Default stands and the report says the edge did not survive.
 *
 * With N this small we are CHOOSING AMONG PROFILES, not tuning eight dials. The
 * report says so; the perturbation gate is what enforces it.
 */
'use strict';
const R = require('./replay.js');

const CFG = {
  JITTER: 0.25,             // +/-25% on every weight
  JITTER_SAMPLES: 40,       // perturbed profiles drawn around the winner
  SURVIVE_FRACTION: 0.75,   // this share of them must still beat Default pooled
  SEED: 20260822,           // draft day, so the sweep is reproducible
};

// Seeded RNG (mulberry32) — Math.random cannot be reproduced, and a sweep that
// changes its verdict on re-run is not a gate.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const E = require('../../public/js/draft/engine.js');
const BASE = E.DEFAULT_WEIGHTS;
const scale = (over) => Object.assign({}, BASE, over);

/* The eight. Each `weights(round)` returns the weight object for that round, so
 * a static profile ignores the round and a ramping one uses it. */
const PROFILES = [
  { key: 'default', name: 'Default',
    note: 'the shipped weighting; the baseline every other profile is measured against',
    weights: () => scale({}) },
  { key: 'value_anchor', name: 'Value-Anchor',
    note: 'every modifier halved — trust the value gap, ignore roster shaping',
    weights: () => ({ value: BASE.value, tier: BASE.tier / 2, need: BASE.need / 2,
      risk: BASE.risk / 2, ceiling: BASE.ceiling / 2, keeper: BASE.keeper / 2,
      bye: BASE.bye / 2, stack: BASE.stack / 2 }) },
  { key: 'tier_hunter', name: 'Tier-Hunter',
    note: 'tier cliff urgency doubled — chase the last of a tier',
    weights: () => scale({ tier: BASE.tier * 2 }) },
  { key: 'need_filler', name: 'Need-Filler',
    note: 'starting-lineup need doubled — fill the roster before chasing value',
    weights: () => scale({ need: BASE.need * 2 }) },
  { key: 'upside_late', name: 'Upside-Late',
    note: 'ceiling ramps with the round — safe early, lottery tickets late',
    weights: (round) => scale({ ceiling: BASE.ceiling * (1 + Math.max(0, round - 4) * 0.5) }) },
  { key: 'scarcity', name: 'Scarcity',
    note: 'tier and need up, risk down — positional runs matter more than floor',
    weights: () => scale({ tier: BASE.tier * 1.5, need: BASE.need * 1.5, risk: BASE.risk * 0.5 }) },
  { key: 'keeper_builder', name: 'Keeper-Builder',
    note: 'KOV doubled in rounds 8+ — draft next year’s keepers late',
    weights: (round) => scale({ keeper: BASE.keeper * (round >= 8 ? 2 : 1) }) },
  { key: 'slider_defaults', name: 'Slider-Defaults',
    note: 'the panel’s out-of-the-box slider positions; equals Default now that '
      + 'value is a slider — a self-consistency check on the harness',
    weights: () => scale({}) },
];

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
}
function ci95(xs) { return xs.length < 2 ? 0 : 1.96 * sd(xs) / Math.sqrt(xs.length); }

/* Graded B3 points per (season, seat) draft for one weight function. Keepers
 * are excluded by the replay; ungradeable picks are dropped, never zeroed. */
function gradedByDraft(bundles, points, weightFn, mySeatOnly) {
  const out = {};
  bundles.forEach(b => {
    const rep = R.replaySeason(b, { weightFn });
    const seasonPts = points[String(b.season)] || {};
    rep.records.forEach(rec => {
      if (mySeatOnly && b.my_roster_id != null
          && String(rec.roster_id) !== String(b.my_roster_id)) return;
      const v = seasonPts[String(rec.choices.B3)];
      if (v == null || !isFinite(v)) return;
      const key = b.season + ':' + rec.roster_id;
      (out[key] = out[key] || { season: b.season, sum: 0, n: 0 });
      out[key].sum += v; out[key].n += 1;
    });
  });
  return out;
}

/* Paired profile-minus-Default, per season and pooled. The pairing is on the
 * (season, seat) draft, which is what makes a two-draft confidence interval
 * worth printing at all. */
function compareToDefault(bundles, points, weightFn, defaultByDraft, mySeatOnly) {
  const mine = gradedByDraft(bundles, points, weightFn, mySeatOnly);
  const bySeason = {};
  const pooled = [];
  Object.keys(mine).forEach(k => {
    const d = defaultByDraft[k];
    if (!d) return;
    const diff = mine[k].sum - d.sum;      // total graded points over the draft
    (bySeason[mine[k].season] = bySeason[mine[k].season] || []).push(diff);
    pooled.push(diff);
  });
  const perSeason = {};
  Object.keys(bySeason).map(Number).sort().forEach(s => {
    perSeason[s] = { mean: +mean(bySeason[s]).toFixed(2), n: bySeason[s].length,
                     ci95: +ci95(bySeason[s]).toFixed(2), beats: mean(bySeason[s]) > 0 };
  });
  return {
    per_season: perSeason,
    pooled: { mean: +mean(pooled).toFixed(2), n: pooled.length,
              ci95: +ci95(pooled).toFixed(2), beats: mean(pooled) > 0 },
    seasons_won: Object.values(perSeason).filter(x => x.beats).length,
    seasons_total: Object.keys(perSeason).length,
  };
}

function runTable(bundles, points, opts) {
  opts = opts || {};
  const defaultByDraft = gradedByDraft(bundles, points,
    PROFILES[0].weights, opts.mySeatOnly);
  return PROFILES.map(p => ({
    key: p.key, name: p.name, note: p.note,
    vs_default: compareToDefault(bundles, points, p.weights, defaultByDraft, opts.mySeatOnly),
  }));
}

/* Apply the pre-registered rule. Returns the winner or null (Default stands). */
function selectWinner(table) {
  const N = Math.max.apply(null, table.map(r => r.vs_default.seasons_total).concat([0]));
  const winBoth = N < 3;
  const eligible = table.filter(r => r.key !== 'default' && r.key !== 'slider_defaults')
    .filter(r => {
      const v = r.vs_default;
      if (!v.pooled.beats) return false;
      return winBoth ? (v.seasons_won === v.seasons_total && v.seasons_total >= 1)
                     : (v.seasons_won >= 2);
    })
    .sort((a, b) => b.vs_default.pooled.mean - a.vs_default.pooled.mean);
  return {
    n_seasons: N,
    rule: winBoth ? 'win-both (N<3, bar tightened by data availability)'
                  : '2-of-N seasons AND pooled (pre-registered)',
    winner: eligible[0] || null,
  };
}

/* THE PERTURBATION GATE. Jitter the winner's weights and re-run; the edge must
 * survive to install. */
function perturbationSweep(bundles, points, winnerProfileKey, opts) {
  opts = opts || {};
  const prof = PROFILES.find(p => p.key === winnerProfileKey);
  if (!prof) return { ran: false, reason: 'no such profile' };
  const rand = rng(CFG.SEED);
  const defaultByDraft = gradedByDraft(bundles, points, PROFILES[0].weights, opts.mySeatOnly);

  const edges = [];
  for (let i = 0; i < CFG.JITTER_SAMPLES; i++) {
    // One multiplier per weight key, drawn once and applied at every round so
    // the ramp shape is preserved while its level is perturbed.
    const mult = {};
    Object.keys(BASE).forEach(k => { mult[k] = 1 + (rand() * 2 - 1) * CFG.JITTER; });
    const jittered = (round) => {
      const w = prof.weights(round), out = {};
      Object.keys(w).forEach(k => { out[k] = w[k] * (mult[k] == null ? 1 : mult[k]); });
      return out;
    };
    const cmp = compareToDefault(bundles, points, jittered, defaultByDraft, opts.mySeatOnly);
    edges.push(cmp.pooled.mean);
  }
  edges.sort((a, b) => a - b);
  const survived = edges.filter(e => e > 0).length;
  const frac = survived / edges.length;
  const q = p => edges[Math.min(edges.length - 1, Math.floor(p * edges.length))];
  return {
    ran: true,
    samples: edges.length,
    jitter: CFG.JITTER,
    fraction_beating_default: +frac.toFixed(3),
    survive_threshold: CFG.SURVIVE_FRACTION,
    edge_p25: +q(0.25).toFixed(2),
    edge_median: +q(0.5).toFixed(2),
    edge_p75: +q(0.75).toFixed(2),
    edge_min: +edges[0].toFixed(2),
    // The verdict, by the pre-registered criterion.
    survives: frac >= CFG.SURVIVE_FRACTION,
  };
}

module.exports = { CFG, PROFILES, runTable, selectWinner, perturbationSweep,
                   gradedByDraft, compareToDefault, mean, ci95 };
