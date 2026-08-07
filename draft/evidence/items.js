/* Evidence items 13, 15, 25 and 26, against a REAL artifact.
 *
 * 13 — top 15 with every composite component, full precision
 * 15 — survival to my next pick, top 30 available
 * 25 — end-to-end trace for one top-20 player
 * 26 — the same for a DEGRADED player, for contrast
 *
 * 25 and 26 are the two the review singled out, and 26 is the one that could
 * not exist at all on a fixture build: every player there is degraded in the
 * same way, so there was no healthy/degraded contrast to draw. On a real
 * artifact the contrast is the whole point — it shows what the pipeline does
 * when a join fails, which is the case that decides whether a number on the
 * card can be trusted at pick 4 with 40 seconds on the clock.
 */
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..', '..');
const E = require(path.join(R, 'public/js/draft/engine.js'));
const S = require(path.join(R, 'public/js/draft/survival.js'));
const ART = JSON.parse(fs.readFileSync(path.join(R, 'public/draft_data.json'), 'utf8'));
const L = ART.league, TEAMS = L.teams || 10;
const MY_SLOT = parseInt(process.env.SLOT || '4', 10);

const ALL = ART.players.filter(p => p.proj_mean > 0)
  .sort((a, b) => (a.overall_rank || 1e9) - (b.overall_rank || 1e9));

// Same reproducible mid-draft state the fixture bundle used, so the two are
// comparable line for line: picks taken straight off the board in snake order.
const sched = []; let pk = 1;
for (let r = 0; r < 15; r++) {
  const o = []; for (let s = 1; s <= TEAMS; s++) o.push(s);
  if (r % 2) o.reverse();
  o.forEach(s => sched.push({ team_slot: s, pick_no: pk++, round: r + 1 }));
}
// Pick 37 is genuinely slot 4's in a 10-team snake. Using a pick that belongs
// to another seat makes the MCTS root guard reject the state outright, which
// is the guard working — the advisor must never answer for somebody else.
const CURRENT = sched.find(t => t.team_slot === MY_SLOT && t.pick_no > 30).pick_no;
const rosters = {}; for (let s = 1; s <= TEAMS; s++) rosters[s] = [];
const taken = new Set();
for (let i = 0; i < CURRENT - 1; i++) {
  const p = ALL.find(x => !taken.has(x.player_id));
  taken.add(p.player_id); rosters[sched[i].team_slot].push(p);
}
const board = ALL.filter(p => !taken.has(p.player_id));
const myNext = sched.filter(t => t.team_slot === MY_SLOT && t.pick_no > CURRENT).map(t => t.pick_no);
const ctx = () => ({
  board, currentPick: CURRENT, nextPick: myNext[0], totalPicks: sched.length,
  myPicksLeft: myNext.length + 1, roster: rosters[MY_SLOT], league: L,
  weights: E.DEFAULT_WEIGHTS, runMultipliers: {},
  intervening: sched.filter(t => t.pick_no >= CURRENT && t.pick_no < myNext[0])
    .map(t => ({ team_slot: t.team_slot, pick_no: t.pick_no, roster: rosters[t.team_slot], profile: null })),
  roundsLeft: 15 - Math.ceil(CURRENT / TEAMS),
});
const hr = (n, t) => console.log('\n' + '='.repeat(78) + '\nITEM ' + n + ' — ' + t + '\n' + '='.repeat(78));

console.log('artifact built_at : ' + ART.built_at);
console.log('adp_source        : ' + ((ART.provenance || {}).adp || {}).adp_source);
console.log('current pick      : ' + CURRENT + '   my slot: ' + MY_SLOT);

hr(13, 'top 15 with every composite component, full precision');
const scored = E.recommend(ctx());
console.log(['rank','player','pos','score','vorp','tier','need','risk','ceiling',
             'keeper','bye','stack','survival','rails'].join('\t'));
scored.slice(0, 15).forEach((s, i) => {
  const c = s.components || {};
  console.log([i + 1, s.player.name, s.player.position, s.score, c.vorp, c.tier, c.need,
    c.risk, c.ceiling, c.keeper, c.bye, c.stack, s.survival_to_next,
    // The rails were fired and unreported in the first bundle. Dumping them is
    // the fix: a clamp that never shows its work looks identical to no clamp.
    JSON.stringify(s.rails || null)].map(x => x == null ? '' : x).join('\t'));
});

hr(15, 'survival to my next pick (' + myNext[0] + '), top 30 available');
console.log(['player','pos','adp_mean','adp_sd','sd_source','survival'].join('\t'));
board.slice(0, 30).forEach(p => {
  console.log([p.name, p.position, S.effectiveAdp(p, ctx()),
    S.effectiveSd(p, ctx()).toFixed(3), p.adp_sd_source || 'heuristic',
    S.survivalProbability(p, myNext[0], ctx()).toFixed(4)].join('\t'));
});

function trace(p, label) {
  console.log('\n--- ' + label + ': ' + p.name + ' (' + p.position + ' ' + p.team + ') ---');
  const steps = [
    ['1. Sleeper identity', ['player_id', 'gsis_id', 'team', 'position', 'bye']],
    ['2. projection',       ['proj_source', 'proj_mean', 'proj_sd']],
    ['3. opportunity adj',  ['opportunity_z', 'opportunity_adj']],
    ['4. ADP join',         ['adp_source', 'match_method', 'raw_adp', 'adp_sd', 'adp_sd_source']],
    ['5. keeper adjustment',['adjusted_adp', 'keeper_shift']],
    ['6. value',            ['vorp', 'tier', 'tier_drop', 'overall_rank']],
  ];
  steps.forEach(([title, keys]) => {
    console.log('  ' + title);
    keys.forEach(k => {
      if (p[k] === undefined) console.log('      %s: ABSENT — this step did not run or did not join', k);
      else console.log('      ' + k + ': ' + JSON.stringify(p[k]));
    });
  });
  const s = scored.find(x => x.player.player_id === p.player_id);
  console.log('  7. composite  : ' + (s ? s.score + '  (rank ' + (scored.indexOf(s) + 1) + ' on this board)'
                                        : 'not on this board — already taken in the reconstructed state'));
}

hr(25, 'end-to-end trace for one top-20 player');
trace(ALL[Math.min(9, ALL.length - 1)], 'healthy path');

hr(26, 'the same for a DEGRADED player');
// A degraded player is one where at least one join FAILED — no ADP source, no
// gsis id, or no opportunity adjustment. Picking the highest-ranked such player
// makes the contrast sharpest: this is the most valuable player the pipeline
// knows least about.
const degraded = ALL.find(p => !p.adp_source || p.adp_source === 'fallback'
  || !p.gsis_id || p.opportunity_adj == null);
if (!degraded) {
  console.log('CANNOT PRODUCE: no player in this artifact has a failed join. '
    + 'Every one carries an ADP source, a gsis id and an opportunity adjustment. '
    + 'That is a clean build, and there is no degraded path to contrast against.');
} else {
  trace(degraded, 'degraded path');
  console.log('\n  WHAT DEGRADED MEANS FOR THE CARD: the fields marked ABSENT above '
    + 'were filled by fallback, and the composite score does not distinguish a '
    + 'measured number from a substituted one. That is what the provenance '
    + 'block and the per-source counts (items 1 and 4) exist to expose.');
}
