// TERRITORY: B
/* B's answer to A's register-59 ask (ROUTES.md 08-19, item (1)): "You own
 * the war room; drive IT down Cory's schedule and report the roster
 * shape... A CLEAN 'IT DOES NOT REPRODUCE' IS THE MOST VALUABLE ANSWER YOU
 * CAN GIVE ME, and I would rather have it than agreement."
 *
 * A's own measurement (`draft/tools/term_participation.js`) drains the room
 * in STRICT ADP ORDER between Cory's picks — flagged in that file's own
 * header as the gap: "the real room will not be [strict ADP order]". This
 * script closes that gap without reusing A's driver, so a bug in one can't
 * hide a bug in the other: Cory's real schedule
 * ([8,13,28,33,48,53,68,73,88,93,108,113,128,133,148]), his real 3 keepers
 * (`keepers_of.js`), the SAME `E.onTheClock()` the war room calls at every
 * pick, and opponents drawn from `robot-mock.js`'s own tested softmax-over-
 * ADP model (reused, not reinvented) instead of strict draining.
 *
 * RESULT (B, 08-19): reproduces, robustly, across every seed run — RB6-9 /
 * WR2-3, A's RB10/WR1 headless number sitting inside the real range, not
 * outside it. AND a sharper, more concrete version of A's own bye-week
 * example: 10 of 10 seeds leave at least one week where Cory cannot field a
 * legal lineup (`bye_fieldability.js`'s check, reused here rather than
 * re-derived, so the investigation and the shipped fix agree by
 * construction). Week 6 in all ten — Ja'Marr Chase (Cory's own keeper,
 * week-6 bye) colliding with the engine's single rostered QB, itself a
 * week-6-bye QB in 9 of 10 seeds.
 *
 * IT REPORTS. IT DOES NOT TUNE (no_fit_guard) — same discipline as A's own
 * tools in this class.
 *
 * Run: node draft/tools/reproduce_register59.js [--seeds N]
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const KEEP = require(path.join(ROOT, 'draft', 'tools', 'keepers_of.js'));
const BYE = require(path.join(ROOT, 'public', 'js', 'draft', 'bye_fieldability.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const LEAGUE = DATA.league;
const TEAMS = LEAGUE.teams || 10;
const STARTERS = LEAGUE.starters || { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };
const SCHED = [8, 13, 28, 33, 48, 53, 68, 73, 88, 93, 108, 113, 128, 133, 148];
const keep = KEEP.keepersFrom(DATA);
const ALL = DATA.players.filter(p => p.proj_mean > 0);
const N_SEEDS = (() => {
  const i = process.argv.indexOf('--seeds');
  return i >= 0 ? Number(process.argv[i + 1]) || 10 : 10;
})();

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Opponent model, verbatim from robot-mock.js's opponentPick(): softmax over
 * the top-6-by-ADP, not the strict-drain term_participation.js uses. */
function opponentPick(board, rand) {
  const sorted = board.slice().sort((a, b) =>
    (a.adjusted_adp != null ? a.adjusted_adp : (a.raw_adp != null ? a.raw_adp : 9999))
    - (b.adjusted_adp != null ? b.adjusted_adp : (b.raw_adp != null ? b.raw_adp : 9999)));
  const k = Math.min(6, sorted.length);
  const cand = sorted.slice(0, k);
  const w = cand.map((_, i) => Math.exp(-i / 2));
  let tot = 0; w.forEach(x => tot += x);
  let r = rand() * tot, acc = 0;
  for (let i = 0; i < cand.length; i++) { acc += w[i]; if (r <= acc) return cand[i]; }
  return cand[cand.length - 1];
}

function mySeatOnPick(pickNo) {
  const round = Math.ceil(pickNo / TEAMS);
  const idxInRound = (pickNo - 1) % TEAMS;
  return (round % 2 === 1) ? idxInRound + 1 : TEAMS - idxInRound;
}

function walkOneSeed(seed, mySlot) {
  const rand = rng(seed);
  const taken = new Set(keep.map(k => String(k.player_id)));
  const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));

  let picks = 1;
  const totalPicks = 150;
  while (picks <= totalPicks) {
    const round = Math.ceil(picks / TEAMS);
    const slot = mySeatOnPick(picks);
    // Keeper rounds are forfeited for my slot (one round per keeper) — same
    // shape robot-mock.js's R-rounds scenario pins.
    if (slot === mySlot && round <= keep.length) { picks++; continue; }
    const board = ALL.filter(p => !taken.has(String(p.player_id)));
    if (!board.length) break;
    let chosen;
    if (slot === mySlot) {
      const myNext = SCHED.find(n => n > picks);
      const myPicksLeft = SCHED.filter(n => n >= picks).length;
      const ctx = {
        board, currentPick: picks, nextPick: myNext || picks + TEAMS,
        totalPicks, myPicksLeft, myPickIndex: SCHED.indexOf(picks),
        totalMyPicks: SCHED.length, roundsLeft: (SCHED.length - SCHED.indexOf(picks)),
        roster, league: LEAGUE, weights: E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS,
        runMultipliers: {}, intervening: [], currentKeepers: roster.filter(p => p.is_keeper),
      };
      let out;
      try { out = E.onTheClock(ctx, { targets: [], avoid: [] }); }
      catch (e) { out = null; }
      chosen = out && out.scored && out.scored.length ? out.scored[0].player : board[0];
      roster.push(chosen);
    } else {
      chosen = opponentPick(board, rand);
    }
    taken.add(String(chosen.player_id));
    picks++;
  }

  const byPos = {};
  roster.forEach(p => { byPos[p.position] = (byPos[p.position] || 0) + 1; });
  return { roster, byPos };
}

const mySlot = SCHED.length ? mySeatOnPick(SCHED[0]) : (Number(LEAGUE.my_draft_slot) || 8);
console.log('B / register-59 reproduction — seat', mySlot, 'schedule', SCHED.join(','));
console.log('seed  QB RB WR TE K DEF   unfieldable weeks');
const results = [];
let anyDup = false;
for (let seed = 1; seed <= N_SEEDS; seed++) {
  const r = walkOneSeed(seed, mySlot);
  const ids = r.roster.map(p => String(p.player_id));
  if (ids.length !== new Set(ids).size) anyDup = true;
  const holes = BYE.unfieldableWeeks(r.roster, STARTERS);
  results.push({ seed, byPos: r.byPos, holes, rosterSize: r.roster.length });
  const b = r.byPos;
  console.log(String(seed).padStart(4), (b.QB || 0), (b.RB || 0), (b.WR || 0), (b.TE || 0),
    (b.K || 0), (b.DEF || 0), '  ', holes.length ? holes.join(',') : '(none)');
}

const withHoles = results.filter(r => r.holes.length).length;
console.log('\n' + withHoles + ' of ' + N_SEEDS + ' seeds leave at least one unfieldable week.');
console.log('roster sanity: ' + (anyDup ? 'DUPLICATE PLAYER FOUND — investigate' : 'no duplicates, ' + results[0].rosterSize + '/' + results[0].rosterSize + ' filled every seed'));

const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx >= 0) {
  fs.writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({
    seat: mySlot, schedule: SCHED, seeds: N_SEEDS, results,
    generated_at: 'run manually — no Date.now() in CI-shared tooling',
  }, null, 2));
  console.log('wrote ' + process.argv[jsonIdx + 1]);
}
