/* The replay must replay HISTORY, not its own advice, and must not be gradeable
 * into a flattering number by accident. Run: node draft/tests/backtest.test.js
 */
const R = require('../backtest/replay.js');
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

function player(id, pos, proj, adp, vorp) {
  return { player_id: id, name: pos + id, position: pos, team: 'XX', bye: 7,
           proj_mean: proj, proj_sd: proj * 0.2, proj_ceiling: proj * 1.3,
           vorp: vorp == null ? proj / 10 : vorp, raw_adp: adp, adjusted_adp: adp,
           adp_sd: 5, adp_source: 'ffc', tier: 1 + Math.floor(adp / 12), tier_drop: 4,
           overall_rank: adp, score: proj };
}
const PLAYERS = [];
['RB', 'WR', 'QB', 'TE'].forEach((pos, pi) => {
  for (let i = 0; i < 20; i++) PLAYERS.push(player(pos + i, pos, 300 - i * 8 - pi * 5, pi * 20 + i + 1));
});
const PICKS = [];
let pn = 1;
for (let rd = 1; rd <= 6; rd++) {
  const order = []; for (let s = 1; s <= 10; s++) order.push(s);
  if (rd % 2 === 0) order.reverse();
  order.forEach(slot => {
    PICKS.push({ pick_no: pn, round: rd, roster_id: slot,
                 player_id: PLAYERS[pn - 1].player_id, is_keeper: pn <= 3 });
    pn++;
  });
}
const BUNDLE = { season: 2024, teams: 10, rounds: 6,
                 roster_positions: ['QB','RB','RB','WR','WR','TE','FLEX','BN','BN'],
                 players: PLAYERS, picks: PICKS, projection_method: 'walk_forward' };

const out = R.replaySeason(BUNDLE);

check('every non-keeper pick becomes a decision record',
  out.records.length === PICKS.filter(p => !p.is_keeper).length,
  out.records.length + ' vs ' + PICKS.filter(p => !p.is_keeper).length);

check('keepers are off the board before pick 1, not drafted again',
  out.records.every(r => Object.keys(r.choices).every(k => {
    const id = r.choices[k];
    return !PICKS.filter(p => p.is_keeper).some(p => p.player_id === id);
  })));

check('the board shrinks monotonically — history advances, not our advice',
  out.records.every((r, i) => i === 0 || r.board_size < out.records[i - 1].board_size));

check('the replay follows what was ACTUALLY taken',
  out.records.every(r => {
    const real = PICKS.find(p => p.pick_no === r.pick_no);
    return real && r.actual === String(real.player_id);
  }));

check('all four policies answer at every pick',
  out.records.every(r => ['B0','B1','B2','B3'].every(k => r.choices[k])));

check('B0 takes the best available by ADP, by construction',
  (function () {
    const r = out.records[0];
    const taken = new Set(PICKS.filter(p => p.is_keeper).map(p => String(p.player_id)));
    const avail = PLAYERS.filter(p => !taken.has(String(p.player_id)));
    const bestAdp = avail.reduce((a, b) => (b.adjusted_adp < a.adjusted_adp ? b : a));
    return r.choices.B0 === String(bestAdp.player_id);
  })());

check('B3 is the production composite, not a local copy',
  /engine\.js/.test(require('fs').readFileSync(__dirname + '/../backtest/replay.js', 'utf8'))
  && /E\.recommend\(/.test(require('fs').readFileSync(__dirname + '/../backtest/replay.js', 'utf8')));

// --- grading ---------------------------------------------------------------
const POINTS = {}; PLAYERS.forEach((p, i) => { POINTS[p.player_id] = 250 - i * 2; });
const g = R.grade([out], POINTS);
check('grading reports a confidence interval, because N is small',
  g.headline.ci95_per_pick > 0 && g.headline.ci95_per_draft >= 0);
check('the disagreement subset is the honest denominator',
  g.disagreement.n <= g.graded_picks
  && (g.disagreement.n === 0 || g.disagreement.win_rate != null));

check('a pick with no actual points is dropped, never scored as zero',
  (function () {
    const partial = Object.assign({}, POINTS);
    delete partial[out.records[0].choices.B3];
    const g2 = R.grade([out], partial);
    return g2.graded_picks < g.graded_picks;
  })(), 'missing grading data must shrink N, not depress the mean');

check('per-round breakdown covers every graded round',
  g.per_round.length > 0 && g.per_round.every(r => r.n > 0 && r.ci95 >= 0));

// --- calibration -----------------------------------------------------------
const cal = R.calibration([out], sp => sp.predicted > 0.5);
check('calibration buckets span 0-100% and report their own n',
  cal.length === 10 && cal[0].bucket === '0-10%' && cal[9].bucket === '90-100%');
check('an empty bucket reports null rather than a fabricated 0%',
  cal.every(b => b.n > 0 ? b.actual_rate != null : b.actual_rate === null));

// --- the report's pre-registration must fire on its own alarm --------------
const REP = require('../backtest/report.js');
{
  const fake = {
    graded_picks: 100,
    headline: { b0_mean: 100, b1_mean: 101, b2_mean: 150, b3_mean: 120,
                mean_gain_per_pick: 2, ci95_per_pick: 0.5,
                mean_gain_per_draft: 30, ci95_per_draft: 4, drafts_counted: 3 },
    disagreement: { n: 40, share_of_picks: 0.4, win_rate: 0.6, mean_gain: 5, ci95: 2 },
    per_round: [{ round: 1, n: 30, mean_gain: 25, ci95: 3 },
                { round: 5, n: 30, mean_gain: 4, ci95: 2 }],
    vs_human: { n: 50, win_rate: 0.5, mean_gain: 1, ci95: 3 },
    rows: [],
  };
  const txt = REP.render(fake, [], { seasons: [2024], git_head: 'abc', caveats: [], methods: [] });
  check('a large round-1 edge is reported as a BUG ALARM, not a triumph',
    /BUG ALARM/.test(txt) && /more likely a leak than an insight/.test(txt));
  check('and B3 failing to beat plain VORP is called out explicitly',
    /does not beat plain VORP/.test(txt));

  const weak = JSON.parse(JSON.stringify(fake));
  weak.headline.mean_gain_per_draft = 3; weak.headline.ci95_per_draft = 1;
  weak.per_round = [{ round: 1, n: 30, mean_gain: 0.4, ci95: 3 }];
  const t2 = REP.render(weak, [], { seasons: [2024], caveats: [], methods: [] });
  check('under the bar it says so plainly rather than hedging',
    /BELOW THE BAR/.test(t2) && /not paying for itself/.test(t2));

  const noisy = JSON.parse(JSON.stringify(weak));
  noisy.headline.mean_gain_per_draft = 2; noisy.headline.ci95_per_draft = 9;
  const t3 = REP.render(noisy, [], { seasons: [2024], caveats: [], methods: [] });
  check('a CI crossing zero is INCONCLUSIVE, not a small win',
    /INCONCLUSIVE/.test(t3) && /statement about N/.test(t3));
}

console.log('\n' + pass + '/' + (pass + fail) + ' backtest checks passed');
process.exit(fail ? 1 : 0);
