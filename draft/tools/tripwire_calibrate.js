/* BUILD THE EMPIRICAL DEVIATION DISTRIBUTION, AND RUN THE FOUR TRIPWIRES.
 *
 * Cory: "DO NOT CHOOSE THE THRESHOLD BY HAND. Derive it from the empirical
 * distribution and STORE A PERCENTILE RATHER THAN A RAW GAP." A hand-picked N
 * becomes another tolerance band chosen to make today pass.
 *
 * SO WHAT IS THE POPULATION? That question is the whole meaning of the number,
 * and it is written into the artifact rather than left to a reader. The
 * distribution here is EVERY PICK THE MODEL MAKES ACROSS ALL TEN SEATS — 120
 * picks, seat 1 through seat 10, same keepers, same board. A percentile against
 * it answers: "how unusual is this pick FOR THIS TOOL, across every seat it
 * could have drafted from."
 *
 * IT IS DELIBERATELY NOT A DISTRIBUTION OF HUMAN DRAFTS. We do not have one
 * locally, and substituting the ADP reference's deviations would be circular in
 * the other direction — the reference takes argmin(adp) at every pick, so its
 * reach is pinned near zero BY CONSTRUCTION and every model pick would sit at
 * the 100th percentile. That is the tautology the Stage 1 report already had to
 * be corrected for, and it is recorded here so it is not re-derived by someone
 * reaching for the obvious comparison.
 *
 * The consequence is a real limit, stated: a 99th-percentile pick is unusual
 * RELATIVE TO THE MODEL'S OWN BEHAVIOUR. If the model is uniformly aggressive,
 * this cannot see it — that is what the reference-comparison tripwires (3 and 4)
 * are for, and it is why they compare against the reference and this one does
 * not.
 *
 * Writes draft/data/tripwire_distribution.json with its own field population.
 * Run: node draft/tools/tripwire_calibrate.js [--seat N] [--mode mock|post]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const T = require(path.join(__dirname, 'tripwires.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const TEAMS = L.teams;
const ROUNDS = 15;
const OUT = path.join(ROOT, 'draft', 'data', 'tripwire_distribution.json');

const adpOf = p => (p.adjusted_adp != null ? Number(p.adjusted_adp)
  : (p.raw_adp != null ? Number(p.raw_adp) : null));
const ALL = DATA.players.filter(p => p.position && p.proj_mean != null && p.vorp != null);
const KEEPERS = require(path.join(__dirname, 'keepers_of.js')).keepersFrom(DATA);

/* Snake order for a seat: which overall picks belong to it. */
function picksForSeat(seat) {
  const out = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const idx = (r % 2 === 1) ? seat : (TEAMS - seat + 1);
    out.push((r - 1) * TEAMS + idx);
  }
  return out;
}

const MANDATORY = ['QB', 'RB', 'WR', 'TE', 'DEF', 'K'];
function unfilled(roster) {
  const held = {};
  roster.forEach(p => { held[p.position] = (held[p.position] || 0) + 1; });
  const gaps = [];
  MANDATORY.forEach(pos => {
    const need = (L.starters[pos] || 0) - (held[pos] || 0);
    for (let i = 0; i < need; i++) gaps.push(pos);
  });
  return gaps;
}

function bestByAdp(pool, allow) {
  let best = null;
  for (const p of pool) {
    if (allow && !allow(p)) continue;
    const a = adpOf(p);
    if (a == null) continue;
    if (!best || a < adpOf(best)) best = p;
  }
  return best;
}

/* One draft from one seat. `chooser` picks; opponents follow the market. Keepers
 * are removed from the pool for every seat so the boards are comparable. */
function simulate(seat, chooser) {
  const mine = picksForSeat(seat);
  const drafted = new Set(KEEPERS.map(k => String(k.player_id)));
  const roster = KEEPERS.slice();
  const out = [];
  let cursor = 1;
  for (let i = 0; i < mine.length; i++) {
    const pick = mine[i];
    let pool = ALL.filter(p => !drafted.has(String(p.player_id)));
    for (; cursor < pick; cursor++) {
      const o = bestByAdp(pool);
      if (!o) break;
      drafted.add(String(o.player_id));
      pool = pool.filter(x => x !== o);
    }
    /* THE REFERENCE MUST FIELD A LEGAL TEAM — same rule the engine applies, and
     * the correction adp_sanity.js already had to make: a pure-ADP drafter
     * finishes with no kicker and no defence, so it spends twelve picks on skill
     * positions while the model spends ten and every positional count below is
     * compared across different denominators. */
    const gaps = unfilled(roster);
    const left = mine.length - i;
    const forced = left <= gaps.length ? new Set(gaps) : null;
    const chosen = chooser(pool, roster, pick, mine[i + 1] || pick, i, forced);
    if (!chosen) break;
    drafted.add(String(chosen.player_id));
    cursor = pick + 1;
    roster.push(chosen);
    out.push({ pick: pick, name: chosen.name, position: chosen.position,
      adp: adpOf(chosen), player_id: String(chosen.player_id) });
  }
  return out;
}

const modelChooser = (pool, roster, pick, next, i, forced) => {
  const board = forced ? pool.filter(p => forced.has(p.position)) : pool;
  const r = E.recommend({
    board: board.length ? board : pool, roster: roster, league: L,
    currentPick: pick, nextPick: next, totalPicks: TEAMS * ROUNDS,
    myPicksLeft: ROUNDS - i, roundsLeft: ROUNDS - i,
    runMultipliers: {}, intervening: [], weights: E.MEASURED_WEIGHTS,
  });
  return r && r.length && E.scoreable(r[0]) ? r[0].player : null;
};

const refChooser = (pool, roster, pick, next, i, forced) =>
  bestByAdp(pool, forced ? (p => forced.has(p.position)) : null);

/* ── BUILD THE DISTRIBUTION ────────────────────────────────────────────────*/
const SEAT = (function () {
  const a = process.argv.find(x => /^--seat=/.test(x));
  return a ? Number(a.split('=')[1]) : Number(L.my_draft_slot) || 8;
})();
const MODE = (function () {
  const a = process.argv.find(x => /^--mode=/.test(x));
  return a ? a.split('=')[1] : 'mock';
})();

console.log('TRIPWIRE CALIBRATION\n');
console.log('  building the empirical deviation distribution over all '
  + TEAMS + ' seats...');
const perSeat = {};
for (let s = 1; s <= TEAMS; s++) perSeat[s] = simulate(s, modelChooser);

/* LEAVE-ONE-OUT. The first version pooled all ten seats INCLUDING the seat under
 * test, so seat 8's twelve picks were 8% of the distribution its own picks were
 * scored against — a pick helps set the threshold it is then compared to, which
 * drags every percentile toward the middle and is the same circularity as the
 * Stage 1 tautology in miniature. The distribution used for a seat now excludes
 * that seat. */
function deviationsExcluding(seat) {
  const out = [];
  Object.keys(perSeat).forEach(s => {
    if (Number(s) === Number(seat)) return;
    perSeat[s].forEach(p => { if (p.adp != null) out.push(p.adp - p.pick); });
  });
  return out.sort((a, b) => a - b);
}
const allDeviations = deviationsExcluding(null);

const q = f => allDeviations[Math.min(allDeviations.length - 1,
  Math.max(0, Math.floor(f * allDeviations.length)))];
const artifact = {
  version: 'tripwire-deviation/v1',
  population: 'every pick the model makes across all ' + TEAMS + ' seats, '
    + ROUNDS + ' rounds, keepers ' + KEEPERS.map(k => k.name).join('/')
    + ', opponents following ADP',
  not_a_distribution_of: 'human drafts. The ADP reference takes argmin(adp) at '
    + 'every pick, so its reach is pinned near zero by construction and every '
    + 'model pick would sit at the 100th percentile — the Stage 1 tautology.',
  n: allDeviations.length,
  values: allDeviations,
  quantiles: { p50: q(0.5), p75: q(0.75), p90: q(0.90), p95: q(0.95), p99: q(0.99) },
  field_population: {
    picks_total: Object.keys(perSeat).reduce((n, s) => n + perSeat[s].length, 0),
    picks_with_adp: allDeviations.length,
    picks_without_adp: Object.keys(perSeat).reduce((n, s) => n + perSeat[s].length, 0)
      - allDeviations.length,
  },
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
console.log('  n = ' + artifact.n + ' picks with an ADP ('
  + artifact.field_population.picks_without_adp + ' without)');
console.log('  deviation quantiles (adp - pick; positive = a reach):');
Object.keys(artifact.quantiles).forEach(k =>
  console.log('    ' + k + '  ' + artifact.quantiles[k].toFixed(1)));
console.log('  written to ' + path.relative(ROOT, OUT));

/* ── RUN THE TRIPWIRES ON THE SEAT CORY ACTUALLY HOLDS ─────────────────────*/
console.log('\n  seat ' + SEAT + ', mode "' + MODE + '"');
const mine = perSeat[SEAT] || simulate(SEAT, modelChooser);
const ref = simulate(SEAT, refChooser);

const looValues = deviationsExcluding(SEAT);
const looDist = Object.assign({}, artifact, {
  values: looValues, n: looValues.length,
  population: artifact.population + ' — LEAVE-ONE-OUT: seat ' + SEAT
    + ' excluded from the distribution its own picks are scored against',
});
console.log('  distribution for this seat: n = ' + looDist.n
  + ' (seat ' + SEAT + '\'s own ' + (artifact.n - looDist.n) + ' picks excluded)');

const result = T.observe({
  mode: MODE, myPicks: mine, referencePicks: ref, starters: L.starters,
  deviationDistribution: looDist, opts: { withinFirst: 10, firstN: 12 },
});

console.log('\n  ' + (result.visible ? result.observations.length + ' observation(s)'
  : 'SUPPRESSED'));
console.log('  ' + result.why + '\n');
result.observations.forEach(o => {
  console.log('  · ' + o.text);
});
if (result.visible && !result.observations.length) {
  console.log('  (none — and that is a real null only because the distribution above');
  console.log('   has n = ' + artifact.n + '. A tripwire with no distribution reports');
  console.log('   UNCALIBRATED rather than silence.)');
}

console.log('\n  MODEL   ' + mine.map(p => p.position).join(' '));
console.log('  MARKET  ' + ref.map(p => p.position).join(' '));
