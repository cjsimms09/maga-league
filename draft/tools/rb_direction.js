/* THE RB DIRECTION — settled by the equation, not by inspecting recommendations.
 *
 * THE CONTRADICTION AS STATED. D6's comment says elite RB/WR/QB survival over an
 * eleven-pick window was OVERSTATED by 2.6-3.4 points, so correcting it should
 * make elite RBs MORE likely to be taken. The proposed withinFromPool fix
 * apparently makes them LESS likely. Both cannot describe the same quantity
 * under the same conditions.
 *
 * WHY INSPECTION CANNOT SETTLE IT. "Survival", "pool probability" and "mixture"
 * are labels over conditional quantities, and a conditioning reversal hides
 * perfectly behind agreeing words. So this traces the chain instead:
 *
 *   withinPrecision(team)  temp = clamp(0.15, 0.9, WITHIN_POS_TEMP - 0.02*reach_mean)
 *                          a manager who REACHES gets a LOWER temp
 *   poolSoftmax            share_i ∝ w_i * exp((v_i - max) * temp / 10)
 *                          lower temp => FLATTER => the elite share FALLS
 *   layer2Taken            survives = Π_i (1 - pPos_i * pWithin_i)
 *                          strictly decreasing in every pWithin
 *
 * So P(take) and survival are tied by an identity, not by a convention: raising
 * pWithin can only lower survival. Any claim that both moved the same way is a
 * claim about DIFFERENT BASELINES, and that is the hypothesis this tests.
 *
 * THE ANSWER, SO A READER DOES NOT HAVE TO INFER IT FROM THE OUTPUT.
 *
 * 1. A HYPOTHESIS WAS TESTED AND FAILED. D6's comment names a "mean-manager
 *    model" as its baseline, so the two statements might have been true of
 *    different reference points. They are not: `reach_delta.mean` is centred on
 *    the LEAGUE, the room's mean is 0.53, and the mean-manager temp (0.3394) is
 *    within a hair of the generic one (0.3500). The mixture sits below BOTH.
 *    That resolution is unavailable and is left in the output as a failed lead.
 *
 * 2. THE REAL ANSWER IS THAT I COMPARED A CONDITIONAL WITH A MARGINAL. The
 *    falling number — Gibbs 0.4397 -> 0.4278 — is P(this player | HIS POSITION
 *    IS TAKEN), a share that sums to a constant across the position. Mass moves
 *    from the elite to the rest of the position, so of course the elite share
 *    falls. It says nothing about survival, which compounds over ten picks and
 *    also depends on how often the position is taken at all. Setting that
 *    against D6's SURVIVAL claim compared two different quantities, and the
 *    "contradiction" was mine.
 *
 * 3. MEASURED AT THE SURVIVAL LEVEL, THE DIRECTION AGREES WITH D6. The top
 *    AVAILABLE RB at pick 30 moves 0.9917 -> 0.9857, i.e. 0.60 points DOWN,
 *    which is the direction "survival was overstated" requires.
 *
 * 4. THE MAGNITUDE DOES NOT. D6 claims 2.6-3.4 points; the largest move among
 *    players in play is 0.60, four to five times smaller. So D6's number still
 *    must not be quoted as describing this engine, even once the fix lands.
 *
 * 5. AND THE ELITE-RB WORRY IS OUT OF REACH ANYWAY. 13 RBs sit at survival
 *    <= 0.02 at pick 30 and cannot move in either direction.
 *
 * Four arms, one board, one window, one player at a time:
 *   generic       no profile, no room                    (today's SCORER)
 *   mean_manager  one synthetic profile, mean reach      (D6's baseline)
 *   mixture_panel withinPositionProbability with room    (today's PANEL)
 *   mixture_new   withinFromPool with room               (the proposed fix)
 *
 * Run: node draft/tools/rb_direction.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCRATCH = process.env.RBDIR_SCRATCH
  || '/tmp/claude-0/-home-user-maga-league/5e339fd1-b931-5642-94fe-5e2425c58024/scratchpad';
const OLD = require(path.join(SCRATCH, 'survival_old.js'));
const NEW = require(path.join(SCRATCH, 'survival_new.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const L = DATA.league;
const MGRS = ((DATA.manager_profiles || {}).managers) || {};
const ME = L.my_manager_id;
const ROOM = Object.keys(MGRS).map(k => MGRS[k])
  .filter(m => m && String(m.manager_id) !== String(ME));

const board = DATA.players.filter(p => p.position && p.proj_mean != null);
const POS = 'RB';
const pool = board.filter(p => p.position === POS)
  .sort((a, b) => (b.vorp || 0) - (a.vorp || 0)).slice(0, 6);
const avail = pool.map(() => 1);

// D6's own baseline, built from the room rather than asserted: ONE profile
// carrying the room's mean reach_delta. This is the "mean-manager model" its
// comment contrasts the mixture against.
const reachMeans = ROOM.map(m => (m.reach_delta || {}).mean).filter(x => x != null);
const meanReach = reachMeans.reduce((s, x) => s + x, 0) / reachMeans.length;
const MEAN_MANAGER = { reach_delta: { mean: meanReach } };

const arms = {
  generic: { profile: null, room: null },
  mean_manager: { profile: MEAN_MANAGER, room: null },
  room: { profile: null, room: ROOM },
};

const f = (x, n) => (x == null ? '  --  ' : x.toFixed(n == null ? 4 : n));

console.log('='.repeat(78));
console.log('THE RB DIRECTION — P(take | position taken), traced through the softmax');
console.log('='.repeat(78));
console.log(`room of ${ROOM.length} · reach_delta mean over the room = ${f(meanReach, 3)}`);
console.log(`temps: generic ${f(OLD.withinPrecision(arms.generic), 4)}`
  + ` · mean-manager ${f(OLD.withinPrecision(arms.mean_manager), 4)}`);
console.log('  (lower temp = flatter softmax = LESS mass on the elite player)');
console.log('');

const head = 'player'.padEnd(22) + 'generic   meanMgr   mixNEW    panel';
console.log(head);
console.log('-'.repeat(head.length));
const rows = [];
pool.forEach(p => {
  const gen = OLD.withinFromPool(p, pool, arms.generic, avail);
  const mm = OLD.withinFromPool(p, pool, arms.mean_manager, avail);
  const mixNew = NEW.withinFromPool(p, pool, arms.room, avail);
  const panel = OLD.withinPositionProbability(p, board, arms.room);
  rows.push({ p, gen, mm, mixNew, panel });
  console.log(p.name.padEnd(22) + f(gen) + '    ' + f(mm) + '    ' + f(mixNew)
    + '    ' + f(panel));
});

// The old path IGNORES the room, so mixture-old is generic by construction.
const oldRoom = OLD.withinFromPool(pool[0], pool, arms.room, avail);
console.log('');
console.log(`sanity: OLD withinFromPool WITH the room = ${f(oldRoom)} `
  + `(equals generic ${f(rows[0].gen)}: ${oldRoom === rows[0].gen ? 'YES — room-blind' : 'NO'})`);

console.log('');
console.log('── THE TWO BASELINES ' + '─'.repeat(57));
const top = rows[0];
console.log(`  elite ${POS} = ${top.p.name}`);
console.log(`    vs GENERIC       ${f(top.gen)} -> ${f(top.mixNew)}  `
  + `${top.mixNew > top.gen ? 'MORE' : 'LESS'} likely to be taken`);
console.log(`    vs MEAN-MANAGER  ${f(top.mm)} -> ${f(top.mixNew)}  `
  + `${top.mixNew > top.mm ? 'MORE' : 'LESS'} likely to be taken`);
console.log('');
if (top.mixNew < top.gen && top.mixNew > top.mm) {
  console.log('  BOTH STATEMENTS ARE TRUE AND NEITHER IS A SIGN ERROR.');
  console.log('  D6 measured the mixture against the MEAN-MANAGER model, which its own');
  console.log('  comment names. withinFromPool was measured against the GENERIC default.');
  console.log('  The mixture sits BETWEEN them, so it raises take probability relative to');
  console.log('  one baseline and lowers it relative to the other. Same number, two');
  console.log('  reference points, opposite-sounding sentences.');
} else if (top.mixNew < top.gen && top.mixNew < top.mm) {
  console.log('  THE HYPOTHESIS FAILS. The mixture is below BOTH baselines, so D6\'s');
  console.log('  direction cannot be recovered by a change of reference point. Either D6');
  console.log('  measured a different quantity or one of the two paths has a sign error.');
} else {
  console.log('  Unexpected ordering — read the table above before drawing any conclusion.');
}

// ── THE INVARIANT, AND THE CONDITIONING MISTAKE IT EXPOSES ──────────────────
/* THE TWO QUANTITIES ARE NOT THE SAME QUANTITY, AND I CONFLATED THEM.
 *
 * The table above is P(this player | HIS POSITION IS TAKEN) — a conditional
 * share that sums to a constant across the position. The mixture moves mass
 * from the elite to the rest of the position, so the elite share falls. That
 * says nothing on its own about whether the elite player SURVIVES, because
 * survival also depends on how often his position is taken at all, over ten
 * separate picks, compounded.
 *
 * I reported the falling share as "elite RBs are less likely to be taken, which
 * is the opposite of D6's direction". That set a conditional against a marginal.
 * The check below asks the survival question directly, which is what D6's claim
 * and Cory's graduation criterion are both about.
 *
 * THE INVARIANT ITSELF is an identity in layer 2, not a convention:
 *     survives = Π_i (1 - pPos_i · pWithin_i)      take = 1 - survives
 * so take and survival are tied. It is asserted numerically anyway, because an
 * identity in the source is not evidence about the code that ships.
 */
const TEAMS2 = L.teams || 10;
const MY2 = L.my_draft_slot;
const slotOf2 = o => {
  const r = Math.ceil(o / TEAMS2), i = o - (r - 1) * TEAMS2;
  return (r % 2 === 1) ? i : (TEAMS2 - i + 1);
};
function windowAt(cur, next, fill) {
  const w = [];
  for (let o = cur; o < next; o++) {
    const s = slotOf2(o);
    if (s === MY2) continue;
    w.push(Object.assign({ team_slot: s, pick_no: o, roster: [] }, fill));
  }
  return w;
}
function ctxAt(cur, next, fill) {
  return { board: board, league: L, currentPick: cur, nextPick: next,
    totalPicks: TEAMS2 * (L.rounds || 15), roundsLeft: 12,
    intervening: windowAt(cur, next, fill) };
}

console.log('');
console.log('── THE INVARIANT: take UP <=> survival DOWN, same state, same window ' + '─'.repeat(10));
console.log('  asserted over the WHOLE board, not a hand-picked six. The first version of');
console.log('  this file probed the six best RBs by VORP, every one of whom is taken with');
console.log('  probability 1.000000 at pick 30 — all rows read "ok" while nothing moved.');
console.log('');
const WINDOWS = [[30, 41], [41, 50], [50, 61]];
let totalViol = 0, totalMoved = 0;
WINDOWS.forEach(([cur, next]) => {
  const cg = ctxAt(cur, next, { profile: null, room: null });
  const cn = ctxAt(cur, next, { profile: null, room: ROOM });
  let viol = 0, moved = 0, interior = 0, n = 0;
  board.forEach(p => {
    const g = OLD.survivalProbability(p, next, cg);
    const nw = NEW.survivalProbability(p, next, cn);
    if (g == null || nw == null) return;
    n++;
    if (g > 0.02 && g < 0.98) interior++;
    const dS = nw - g, dT = (1 - nw) - (1 - g);
    if (Math.abs(dT) > 1e-12) { moved++; if (!((dT > 0) === (dS < 0))) viol++; }
  });
  totalViol += viol; totalMoved += moved;
  console.log(`  picks ${cur}..${next - 1}: ${n} players · ${moved} moved · ${interior} `
    + `with interior survival · ${viol} invariant violations`);
});
console.log('');
console.log('  INVARIANT   : ' + (totalViol === 0 ? 'HOLDS — 0 violations' : totalViol + ' VIOLATIONS'));
console.log('  SATISFIABLE : ' + (totalMoved > 0 ? 'YES — ' + totalMoved + ' player-windows moved'
  : 'NO — nothing moved, this proves nothing'));

// ── THE DIRECTION, AT CORY'S OWN FIRST PICK ────────────────────────────────
console.log('');
console.log('── THE DIRECTION AT PICK 30, WHICH IS THE QUESTION ' + '─'.repeat(27));
const cg30 = ctxAt(30, 41, { profile: null, room: null });
const cn30 = ctxAt(30, 41, { profile: null, room: ROOM });
const at30 = [];
board.forEach(p => {
  const g = OLD.survivalProbability(p, 41, cg30);
  const nw = NEW.survivalProbability(p, 41, cn30);
  if (g == null || nw == null) return;
  at30.push({ p: p, g: g, n: nw, d: nw - g });
});
const inPlay = at30.filter(r => r.g > 0.05).sort((a, b) => (b.p.vorp || 0) - (a.p.vorp || 0));
console.log('player'.padEnd(24) + 'pos  survOLD  survNEW  delta');
inPlay.slice(0, 8).forEach(r => {
  console.log(r.p.name.padEnd(24) + String(r.p.position).padEnd(5)
    + f(r.g) + '   ' + f(r.n) + '   ' + (r.d >= 0 ? '+' : '') + f(r.d));
});
const topRB = inPlay.filter(r => r.p.position === 'RB')[0];
const mags = inPlay.map(r => Math.abs(r.d)).sort((a, b) => b - a);
console.log('');
if (topRB) {
  console.log(`  top AVAILABLE RB (${topRB.p.name}): survival ${f(topRB.g)} -> ${f(topRB.n)}`
    + `  = ${(topRB.d * 100).toFixed(2)} points ${topRB.d < 0 ? 'DOWN' : 'UP'}`);
  console.log(`  D6 says elite survival was OVERSTATED, i.e. it should go DOWN. `
    + `Direction ${topRB.d < 0 ? 'AGREES' : 'DISAGREES'}.`);
}
console.log(`  largest move among players in play : ${(mags[0] * 100).toFixed(2)} points`);
console.log(`  median move among players in play  : ${(mags[Math.floor(mags.length / 2)] * 100).toFixed(3)} points`);
console.log('');
console.log('  D6 CLAIMED 2.6-3.4 POINTS. The measured maximum is ' + (mags[0] * 100).toFixed(2)
  + ', four to five times smaller.');
console.log('  So the direction is recovered and the MAGNITUDE is not. D6\'s number must not');
console.log('  be quoted as describing this engine even after the fix lands.');
const pinned = at30.filter(r => r.p.position === 'RB' && r.g <= 0.02).length;
console.log('');
console.log(`  ${pinned} RBs sit at survival <= 0.02 at pick 30 and cannot move either way.`);
console.log('  The elite-RB worry is structurally out of reach of this change.');
