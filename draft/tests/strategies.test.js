/* The strategy harness, and the two gates that decide whether a winner ships:
 * the pre-registered selection rule, and the perturbation sweep. Run:
 *   node draft/tests/strategies.test.js
 */
const S = require('../backtest/strategies.js');
let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

// A reproducible mid-size board and a two/three-season draft set.
function player(id, pos, proj, adp, ceil) {
  return { player_id: id, name: pos + id, position: pos, team: 'XX', bye: 7,
    proj_mean: proj, proj_sd: proj * 0.2, proj_ceiling: ceil == null ? proj * 1.25 : ceil,
    vorp: proj / 4, adjusted_adp: adp, raw_adp: adp, adp_sd: 5,
    adp_source: 'ffc', tier: 1 + Math.floor(adp / 10), tier_drop: 4,
    overall_rank: adp, score: proj };
}
function makeBundle(season, players) {
  const picks = []; let pn = 1;
  for (let rd = 1; rd <= 6; rd++) {
    const order = []; for (let s = 1; s <= 10; s++) order.push(s);
    if (rd % 2 === 0) order.reverse();
    order.forEach(slot => {
      picks.push({ pick_no: pn, round: rd, roster_id: slot,
        player_id: players[pn - 1].player_id, is_keeper: false });
      pn++;
    });
  }
  return { season, teams: 10, rounds: 6, my_roster_id: 4,
    roster_positions: ['QB','RB','RB','WR','WR','TE','FLEX','BN','BN'],
    players, picks };
}
function board() {
  const ps = [];
  ['RB','WR','QB','TE'].forEach((pos, pi) => {
    for (let i = 0; i < 20; i++) ps.push(player(pos + i + '_' + pi, pos, 300 - i * 8 - pi * 4, pi * 20 + i + 1));
  });
  return ps;
}
const B1 = makeBundle(2023, board());
const B2 = makeBundle(2024, board());
const B3 = makeBundle(2025, board());
// Actual points: reward higher projection, plus noise, deterministic.
function pointsFor(bundle) {
  const out = {};
  bundle.players.forEach((p, i) => { out[p.player_id] = Math.max(0, p.proj_mean * 0.8 + ((i * 37) % 25)); });
  return out;
}
const PTS3 = { '2023': pointsFor(B1), '2024': pointsFor(B2), '2025': pointsFor(B3) };

const table3 = S.runTable([B1, B2, B3], PTS3);
check('one row per profile', table3.length === S.PROFILES.length);
check('Default vs Default is exactly zero, per season and pooled',
  table3[0].vs_default.pooled.mean === 0
  && Object.values(table3[0].vs_default.per_season).every(s => s.mean === 0));
check('Slider-Defaults equals Default — the harness self-consistency check',
  table3.find(r => r.key === 'slider_defaults').vs_default.pooled.mean === 0);
check('every profile is graded on all three seasons',
  table3.every(r => r.vs_default.seasons_total === 3));

// --- the selection rule ----------------------------------------------------
{
  // Force a clean winner: a profile that beats Default in exactly 2 of 3.
  const fake = [
    { key: 'default', vs_default: { pooled: { mean: 0, beats: false }, seasons_won: 0, seasons_total: 3 } },
    { key: 'a', vs_default: { pooled: { mean: 5, beats: true }, seasons_won: 2, seasons_total: 3 } },
    { key: 'b', vs_default: { pooled: { mean: 8, beats: true }, seasons_won: 1, seasons_total: 3 } },
  ];
  const sel = S.selectWinner(fake);
  check('N=3: 2-of-3-plus-pooled installs A, and rejects B (won only 1 season)',
    sel.winner && sel.winner.key === 'a', sel.winner && sel.winner.key);
  check('and the rule names itself as the pre-registered one',
    /pre-registered/.test(sel.rule));
}
{
  // N=2: win-both is required. A won 2/2, B won 1/2 but higher pooled.
  const fake = [
    { key: 'default', vs_default: { pooled: { mean: 0, beats: false }, seasons_won: 0, seasons_total: 2 } },
    { key: 'a', vs_default: { pooled: { mean: 3, beats: true }, seasons_won: 2, seasons_total: 2 } },
    { key: 'b', vs_default: { pooled: { mean: 9, beats: true }, seasons_won: 1, seasons_total: 2 } },
  ];
  const sel = S.selectWinner(fake);
  check('N=2: win-both installs A and rejects B despite B’s higher pooled mean',
    sel.winner && sel.winner.key === 'a');
  check('and it flags the bar was tightened by data availability',
    /data availability/.test(sel.rule));
}
{
  // Nobody clears the bar → Default stands.
  const fake = [
    { key: 'default', vs_default: { pooled: { mean: 0, beats: false }, seasons_won: 0, seasons_total: 2 } },
    { key: 'a', vs_default: { pooled: { mean: 4, beats: true }, seasons_won: 1, seasons_total: 2 } },
  ];
  check('no profile clears the bar → Default stands (winner null)',
    S.selectWinner(fake).winner === null);
}

// --- the perturbation gate -------------------------------------------------
{
  // Default as its own "winner": jittering Default around Default produces
  // edges scattered near zero, so it must NOT survive — there is no real edge
  // to be robust. This is the honest negative case the gate exists to catch.
  const sweep = S.perturbationSweep([B1, B2, B3], PTS3, 'default');
  check('the sweep runs and reports the full edge distribution',
    sweep.ran && sweep.samples === S.CFG.JITTER_SAMPLES
    && sweep.edge_p25 != null && sweep.edge_median != null);
  check('a profile with no real edge does NOT survive its own perturbation',
    sweep.survives === false, JSON.stringify(sweep));
  check('the survives verdict is exactly the pre-registered criterion',
    sweep.survives === (sweep.fraction_beating_default >= S.CFG.SURVIVE_FRACTION));
  check('jitter is +/-25% and reproducible (same seed, same numbers)',
    sweep.jitter === 0.25
    && S.perturbationSweep([B1, B2, B3], PTS3, 'default').edge_median === sweep.edge_median);
}

console.log('\n' + pass + '/' + (pass + fail) + ' strategy checks passed');
process.exit(fail ? 1 : 0);
