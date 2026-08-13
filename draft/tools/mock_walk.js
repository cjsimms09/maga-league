/* DRIVE A FULL MOCK END TO END AND AUDIT EVERYTHING THE ENGINE PRODUCES.
 *
 * Cory, 2026-08-13, after finding five defects in one casual mock:
 *   "Five in one casual pass means the density is high and nobody has looked at
 *    the draft path AS A WHOLE — you have each been auditing your own
 *    components, and every one of those components passed. SO THE COMPONENTS
 *    PASSING IS NOT EVIDENCE THE PATH WORKS."
 *
 * This is A's half: VALUES AND LOGIC. It walks every pick of a real 147-pick
 * draft against the real board, with Cory's real keepers and seat, opponents
 * drafting by ADP, and records every anomaly rather than a ranked shortlist —
 * "a defect you decided was minor is a defect I have not seen".
 *
 * IT CANNOT CHECK WHAT A PERSON SEES. Readability, hierarchy, contradiction
 * between rendered panels, whether the primary recommendation is findable in
 * three seconds — none of that is visible from here, and is B's pass.
 *
 * Run: node draft/tools/mock_walk.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
try { require(path.join(ROOT, 'public', 'js', 'draft', 'grabby.js')); } catch (e) {}
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));
const E = global.DraftEngine;

const board = LC.loadBoard();
const ALL = board.players;
const KEEPERS = board.kept_players;
const LEAGUE = board.league;
const ORDER = board.pick_order;
const MY_SLOT = LEAGUE.my_draft_slot;
const MY_PICKS = (ORDER.my_picks || []).slice();
const TOTAL = (ORDER.picks || []).length;

const findings = [];
const disagree = [];
const early = [];
function flag(kind, pick, msg, data) {
  findings.push({ kind, pick, msg, data });
}

/* Opponents draft best-available by ADP, which is the honest neutral room: it
 * is the baseline the profiled room was measured against and it does not bake
 * our own ranking into the depletion we then audit. */
function opponentPick(pool) {
  let best = null;
  for (const p of pool) {
    const adp = p.adp == null ? 9999 : Number(p.adp);
    if (!best || adp < best._adp) { best = p; best._adp = adp; }
  }
  return best;
}

const drafted = new Set();
KEEPERS.forEach(k => drafted.add(String(k.player_id)));
const myRoster = KEEPERS.map(k => Object.assign({}, k, { is_keeper: true }));
const mySeen = [];

const POS_MAX = { QB: 450, RB: 400, WR: 400, TE: 300, K: 200, DEF: 200 };

let prevTopName = null;
for (let i = 0; i < MY_PICKS.length; i++) {
  const pick = MY_PICKS[i];
  const next = MY_PICKS[i + 1] || null;

  // Deplete the board up to this pick with ADP-order opponent picks.
  let pool = ALL.filter(p => !drafted.has(String(p.player_id)));
  const before = i === 0 ? pick - 1 : pick - MY_PICKS[i - 1] - 1;
  for (let k = 0; k < before; k++) {
    const p = opponentPick(pool);
    if (!p) break;
    drafted.add(String(p.player_id));
    pool = pool.filter(x => String(x.player_id) !== String(p.player_id));
  }

  let recs;
  try {
    recs = E.recommend(LC.liveContext({
      currentPick: pick, nextPick: next == null ? pick : next,
      board: pool, roster: myRoster, myPicksLeft: MY_PICKS.length - i,
      myPickIndex: i,
    }));
  } catch (e) {
    flag('WRONG', pick, 'E.recommend THREW: ' + e.message);
    break;
  }
  if (!recs || !recs.length) { flag('WRONG', pick, 'no recommendations returned'); break; }

  const top = recs[0];
  const p = top.player;
  mySeen.push({ pick, name: p.name, pos: p.position, score: Number(top.score) });

  // ── 1. IS THE RECOMMENDED PLAYER A REAL 2026 PLAYER? ────────────────────
  if ((p.team || 'FA') === 'FA') {
    flag('WRONG', pick, 'top recommendation has NO 2026 TEAM: ' + p.name + ' (' + p.position + ')');
  }
  if (!p.proj_mean || Number(p.proj_mean) <= 0) {
    flag('WRONG', pick, 'top recommendation has NO PROJECTION: ' + p.name
      + ' proj_mean=' + p.proj_mean);
  }
  // ── 2. IS THE PROJECTION PLAUSIBLE? ─────────────────────────────────────
  const cap = POS_MAX[p.position];
  if (cap && Number(p.proj_mean) > cap) {
    flag('WRONG', pick, 'implausible projection: ' + p.name + ' ' + p.position
      + ' proj_mean=' + p.proj_mean + ' > ' + cap);
  }
  // ── 3. TOP-10 SANITY: unpriced or unplayable players in the shop window ──
  const top10 = recs.slice(0, 10);
  const ghosts = top10.filter(r => (r.player.team || 'FA') === 'FA'
    || !r.player.proj_mean || Number(r.player.proj_mean) <= 0);
  if (ghosts.length) {
    flag('WRONG', pick, ghosts.length + ' of the TOP 10 are unplayable (no team or no '
      + 'projection): ' + ghosts.map(r => r.player.name).join(', '));
  }
  // ── 4. K/DEF crowding the early board ───────────────────────────────────
  const kdef = top10.filter(r => r.player.position === 'K' || r.player.position === 'DEF');
  if (kdef.length && pick < 100) {
    flag('CONFUSING', pick, kdef.length + ' K/DEF in the top 10 at pick ' + pick
      + ': ' + kdef.map(r => r.player.name).join(', '));
  }
  // ── 5. DOES THE SCORE SCALE MEAN ANYTHING ACROSS CARDS? ────────────────
  const scores = top10.map(r => Number(r.score));
  if (scores.some(s => !isFinite(s))) {
    flag('WRONG', pick, 'non-finite score in the top 10');
  }
  if (scores[0] < 0) {
    flag('CONFUSING', pick, 'the TOP recommendation carries a NEGATIVE score ('
      + scores[0].toFixed(2) + ') — ' + p.name);
  }
  // ── 6. GRAB-BY: does the number agree with the name? ────────────────────
  if (global.DraftGrabBy) {
    try {
      const gb = global.DraftGrabBy.report(pool, myRoster, MY_PICKS.slice(i), LEAGUE);
      (gb.positions || []).forEach(r => {
        if (!r.need || r.evlw == null || r.evlw < 3 || !r.best_now || !r.best_next) return;
        if (String(r.best_now.player_id) === String(r.best_next.player_id)) {
          flag('WRONG', pick, 'grab-by says "' + r.best_now.name + ' now -> ' + r.best_next.name
            + ' by pick ' + r.grab_by_pick + ' (-' + r.evlw + ' pts if you wait)" — '
            + 'THE SAME PLAYER on both sides, with a non-zero cost of waiting');
        }
      });
    } catch (e) { flag('WRONG', pick, 'DraftGrabBy threw: ' + e.message); }
  }
  // ── 7. DOES THE RECOMMENDATION MOVE AT ALL? ────────────────────────────
  if (prevTopName && prevTopName === p.name) {
    flag('WRONG', pick, 'the top recommendation is the SAME PLAYER as my previous pick ('
      + p.name + ') — he should have been removed when I took him');
  }
  prevTopName = p.name;

  // ── 9. DOES THE BOARD AGREE WITH ITSELF ABOUT WHO TO TAKE? ─────────────
  // Cory: "One panel says take Travis Kelce. Another says the best value TE is
  // Mark Andrews." The rule and the composite are two derivations of "who now",
  // and the war room renders BOTH as headline cards.
  if (global.DraftNeedRule) {
    try {
      const rule = global.DraftNeedRule.recommend(pool, myRoster);
      const rp = rule && (rule.pick || rule.player);
      if (rp && rp.name && rp.name !== p.name) {
        disagree.push({ pick, rule: rp.name + ' (' + rp.position + ')',
          value: p.name + ' (' + p.position + ')' });
      }
    } catch (e) { flag('WRONG', pick, 'DraftNeedRule threw: ' + e.message); }
  }

  // ── 10. HOW FAR AHEAD OF THE MARKET IS THE TOP RECOMMENDATION? ─────────
  const adp = p.adp == null ? null : Number(p.adp);
  if (adp != null) {
    early.push({ pick, name: p.name, pos: p.position, adp, early: adp - pick });
  }

  // I take the top recommendation.
  drafted.add(String(p.player_id));
  myRoster.push(p);
}

// ── 8. BOUNDARY: does the pool actually last the draft? ───────────────────
const left = ALL.filter(x => !drafted.has(String(x.player_id)));
const playable = left.filter(x => (x.team || 'FA') !== 'FA' && Number(x.proj_mean) > 0);

console.log('MOCK WALK — ' + MY_PICKS.length + ' of my picks across a ' + TOTAL + '-pick draft');
console.log('  seat ' + MY_SLOT + ', keepers ' + KEEPERS.map(k => k.name).join('/') + '\n');
console.log('  MY BOARD, PICK BY PICK:');
mySeen.forEach(s => console.log('    ' + String(s.pick).padStart(3) + '  '
  + s.pos.padEnd(4) + ' ' + s.name.padEnd(24) + ' score ' + s.score.toFixed(2)));

const byPos = {};
mySeen.forEach(s => { byPos[s.pos] = (byPos[s.pos] || 0) + 1; });
console.log('\n  ROSTER SHAPE TAKEN: ' + JSON.stringify(byPos));
console.log('  starters required: ' + JSON.stringify(LEAGUE.starters));
console.log('  playable players still on the board at the end: ' + playable.length
  + ' of ' + left.length + ' left');

// ── POSITIONAL OVER-FILL: the QB/TE complaint, measured ──────────────────
const startersReq = LEAGUE.starters || {};
const held = {};
myRoster.forEach(r => { held[r.position] = (held[r.position] || 0) + 1; });
console.log('\n  POSITIONAL FILL vs STARTERS REQUIRED (incl. keepers):');
Object.keys(startersReq).filter(k => k !== 'FLEX').forEach(pos => {
  const h = held[pos] || 0, need = startersReq[pos];
  const over = h - need;
  console.log('    ' + pos.padEnd(4) + ' held ' + h + ', starters ' + need
    + (over > 0 ? '   <<< ' + over + ' MORE THAN STARTABLE' : ''));
});

console.log('\n  RULE vs VALUE ENGINE — two derivations of "who now":');
console.log('    disagreed on ' + disagree.length + ' of ' + mySeen.length + ' picks');
disagree.forEach(d => console.log('      pick ' + String(d.pick).padStart(3)
  + '  rule: ' + d.rule.padEnd(28) + ' value: ' + d.value));

console.log('\n  HOW EARLY vs MARKET (top recommendation):');
early.forEach(e => console.log('    pick ' + String(e.pick).padStart(3) + '  '
  + e.name.padEnd(24) + ' adp ' + String(e.adp).padStart(6)
  + '  ' + (e.early >= 0 ? e.early.toFixed(0) + ' picks EARLY' : (-e.early).toFixed(0) + ' picks late')));
const scoreRange = mySeen.map(s => s.score);
console.log('\n  SCORE SCALE across my 12 picks: '
  + Math.min.apply(null, scoreRange).toFixed(2) + ' to ' + Math.max.apply(null, scoreRange).toFixed(2));

const groups = {};
findings.forEach(f => { (groups[f.kind] = groups[f.kind] || []).push(f); });
console.log('\n  FINDINGS: ' + findings.length);
Object.keys(groups).sort().forEach(k => {
  console.log('\n  === ' + k + ' (' + groups[k].length + ') ===');
  const seen = new Set();
  groups[k].forEach(f => {
    const sig = f.msg.replace(/\d+/g, '#');
    if (seen.has(sig)) return;      // one line per distinct defect, with its pick range
    seen.add(sig);
    const picks = groups[k].filter(x => x.msg.replace(/\d+/g, '#') === sig).map(x => x.pick);
    console.log('    [pick ' + picks[0] + (picks.length > 1
      ? ', +' + (picks.length - 1) + ' more' : '') + '] ' + f.msg);
  });
});
