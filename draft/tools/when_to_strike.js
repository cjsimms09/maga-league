/* WHEN TO STRIKE, AND WHY — max value, all positions, Cory picks the player.
 *
 * Cory, 2026-08-20, in three passes, each one narrowing it:
 *   "really all I was wanting out of the roster builder is for it to be running
 *    a deep study of when the best time to strike at certain positions is based
 *    on vona"
 *   "I will build the roster... I need max value and roster equation should be
 *    looking at ALL positions (maybe exclude K and def) and telling me when to
 *    strike and why"
 *
 * So: no roster construction, no player recommendation. Every position, at every
 * one of his picks, with the cost of waiting AND THE REASON IT IS WHAT IT IS.
 *
 * ── WHY A "WHY" IS THE WHOLE POINT ─────────────────────────────────────────
 *
 * `VONA 16.7` is not actionable at eight seconds a pick. VONA decomposes
 * exactly — it is `his projection minus what this position is expected to offer
 * at my next pick` — so the reason is always one of a short list, and which one
 * it is changes what he should do:
 *
 *   CLIFF    the man behind him is much worse. Waiting gets you a worse player
 *            even if nobody else takes this position.
 *   RUN      the field is deep but it will be picked over before you are back.
 *            Waiting costs you the same quality at a lower rank.
 *   THIN     there are barely any startable players left here at all.
 *   QUIET    none of the above. The position will keep.
 *
 * The tool names which, from measured quantities, and prints the number behind
 * the name so the reason can be checked rather than believed.
 *
 * ── THE HONESTY COLUMN ─────────────────────────────────────────────────────
 *
 * VONA GOES FLAT. Measured on this board: best-minus-tenth-best is 17.95 at
 * pick 33 and 1.9-6.6 from pick 68 on. Eight of his twelve picks sit in that
 * band, where the top of the board is a near-tie and a kicker can lead by 0.3
 * without meaning anything. Every row in the flat band is marked, because a
 * ranking with no spread behind it is decoration.
 *
 * K AND DEF ARE SET ASIDE, at Cory's instruction and for a reason worth
 * stating: they do not compete with anybody for a slot, their VONA is small and
 * flat all draft, and including them in the same table invites a comparison
 * that means nothing. They are reported separately at the bottom.
 *
 * ONE POOL, ONE INSTANT. Every position is scored against the SAME board at the
 * SAME pick, gone-set counted in SELECTIONS not board slots (`liveBefore`) —
 * the keeper-slot over-removal that cost three players per pick is this repo's
 * own defect and is not re-introduced here.
 *
 * Run: node draft/tools/when_to_strike.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const E = require(path.join(ROOT, 'public/js/draft/engine.js'));
const { realRoster } = require(path.join(ROOT, 'draft/tests/_empty_roster_fiction_precondition.js'));
const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/draft_data.json'), 'utf8'));
const L = D.league, MY_SLOT = L.my_draft_slot;
const MY = ((D.pick_order || {}).my_picks) || [];
const rows = ((D.pick_order || {}).picks) || [];
const adp = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const pool = D.players.filter(p => p.position && p.proj_mean != null);
const byAdp = pool.slice().sort((a, b) => adp(a) - adp(b));
const liveBefore = pk => rows.filter(r => r.overall < pk && !r.keeper_slot).length;

const MAIN = ['QB', 'RB', 'WR', 'TE'];
const ASIDE = ['K', 'DEF'];
const ROSTER = realRoster();          // his keepers, and it does NOT grow — see header
const FLAT_BAR = 7.0;                 // board spread below which nothing is urgent

/* ⚠️ TWO WRONG ANSWERS BEFORE THIS ONE, AND THE SECOND WAS THE INSTRUCTIVE ONE.
 *
 * V1 tagged every row "THIN: 2 startable left" — a flag firing on everything,
 * i.e. decoration, by the war-room brief's own rule 3 that I wrote. The depth
 * measure was junk: "within max(cliff, 5) points of the best" counts 2 for
 * nearly any position at nearly any pick.
 *
 * V2 replaced it with an exact split, VONA = CLIFF part + RUN part. The
 * arithmetic was right and the READING was wrong, and the board said so: at
 * pick 113 the QB row showed VONA 7.6 against a cliff of 18.6. A drop bigger
 * than the whole cost of waiting is not a contradiction — it means THE MAN
 * PROBABLY LASTS. A big cliff behind a player who survives is not urgent, and
 * V2 would have told Cory to strike.
 *
 * SO THE REASON IS THE TWO NUMBERS VONA IS ACTUALLY MADE OF, and neither is a
 * tag:
 *
 *     VONA  ~=  P(he is gone by your next pick)  x  how much worse the fallback is
 *
 * Both are printed. "68% gone, next man 15 worse" is readable at eight seconds
 * a pick and it is exactly true; "CLIFF" is neither. A big drop with a low
 * P(gone) reads as what it is — a player you can wait on. */
function reasonFor(cands, ctx, nxt, vona) {
  if (!cands.length) return { detail: 'nobody left at this position', pgone: 0, drop: 0 };
  const best = cands[0].p;
  const second = cands[1] ? cands[1].p : null;
  const cliff = second ? (best.proj_mean - second.proj_mean) : (best.proj_mean || 0);
  let s = E.survival(best, nxt, ctx);
  if (typeof s !== 'number' || !isFinite(s)) s = 1;
  const pgone = 1 - s;
  /* THE CONDITIONAL DROP, backed out of VONA rather than guessed: VONA is the
   * unconditional expected loss, so dividing by P(gone) gives the loss GIVEN he
   * is gone. Guarded — at tiny P(gone) the quotient is unstable and the honest
   * fallback is the raw cliff. */
  const drop = pgone > 0.05 ? (vona / pgone) : cliff;
  return { pgone: pgone, drop: drop, cliff: cliff,
    detail: (100 * pgone).toFixed(0) + '% gone by your next pick, '
      + 'fallback ' + drop.toFixed(0) + ' pts worse' };
}

const grid = {}; [].concat(MAIN, ASIDE).forEach(p => { grid[p] = []; });
const spreadAt = [];

MY.forEach((cur, i) => {
  const nxt = MY[i + 1] || cur + 15;
  const taken = new Set(byAdp.slice(0, liveBefore(cur)).map(p => String(p.player_id)));
  ROSTER.forEach(k => taken.add(String(k.player_id)));
  const board = byAdp.filter(p => !taken.has(String(p.player_id)));
  const ctx = { board: board, roster: ROSTER, league: L, currentPick: cur, nextPick: nxt,
    totalPicks: 150, myPicksLeft: MY.length - i, myPickIndex: i, totalMyPicks: MY.length,
    roundsLeft: MY.length - i, runMultipliers: {}, pickBoard: rows,
    intervening: rows.filter(r => r.overall >= cur && r.overall < nxt && r.slot !== MY_SLOT)
      .map(r => ({ team_slot: r.slot, pick_no: r.overall, roster: [], profile: null, room: [] })) };

  const all = [];
  [].concat(MAIN, ASIDE).forEach(pos => {
    const cands = board.filter(p => p.position === pos)
      .map(p => ({ p: p, v: E.vona(p, board, nxt, ctx) }))
      .filter(x => isFinite(x.v))
      .sort((a, b) => b.v - a.v);
    grid[pos].push(cands.length
      ? { v: cands[0].v, p: cands[0].p, why: reasonFor(cands, ctx, nxt, cands[0].v) } : null);
    if (MAIN.indexOf(pos) >= 0) all.push.apply(all, cands);
  });
  all.sort((a, b) => b.v - a.v);
  spreadAt.push(all.length > 10 ? all[0].v - all[9].v : NaN);
});

console.log('\n  WHEN TO STRIKE, AND WHY — QB/RB/WR/TE. You pick the player.');
console.log('  VONA = what waiting one more pick costs you at that position.\n');
console.log('  pick  ' + MAIN.map(p => p.padStart(8)).join('')
  + '   spread   the position to strike, and why');
MY.forEach((cur, i) => {
  const cells = MAIN.map(p => {
    const c = grid[p][i];
    return (c ? c.v.toFixed(1) : '—').padStart(8);
  }).join('');
  const sp = spreadAt[i];
  const flat = isFinite(sp) && sp < FLAT_BAR;
  let bp = null, bv = -Infinity;
  MAIN.forEach(p => { const c = grid[p][i]; if (c && c.v > bv) { bv = c.v; bp = p; } });
  const c = bp ? grid[bp][i] : null;
  const verdict = flat ? 'nothing urgent — board is flat (' + sp.toFixed(1) + ')'
    : bp + ' — ' + c.why.detail;
  console.log('  ' + String(cur).padEnd(6) + cells + '   '
    + (isFinite(sp) ? sp.toFixed(1) : '—').padStart(6) + '   ' + verdict);
});

console.log('\n  YOUR STRIKE WINDOWS\n');
console.log('  pos   strike at   VONA   why                                                   who / proj');
MAIN.forEach(pos => {
  let bi = -1, bv = -Infinity;
  grid[pos].forEach((c, i) => { if (c && c.v > bv) { bv = c.v; bi = i; } });
  if (bi < 0) return;
  const c = grid[pos][bi];
  console.log('  ' + pos.padEnd(6) + String('pick ' + MY[bi]).padEnd(12)
    + bv.toFixed(1).padEnd(7) + c.why.detail.padEnd(54)
    + c.p.name + ' / ' + (c.p.proj_mean || 0).toFixed(0));
});

console.log('\n  SET ASIDE — K and DEF, at your instruction. Their VONA is small and');
console.log('  flat all draft, and they compete with nobody for a slot:');
ASIDE.forEach(pos => {
  const vs = grid[pos].filter(Boolean).map(c => c.v);
  if (!vs.length) return;
  let bi = -1, bv = -Infinity;
  grid[pos].forEach((c, i) => { if (c && c.v > bv) { bv = c.v; bi = i; } });
  console.log('    ' + pos.padEnd(5) + 'peak ' + bv.toFixed(1) + ' at pick ' + MY[bi]
    + ', median across your picks '
    + vs.slice().sort((a, b) => a - b)[Math.floor(vs.length / 2)].toFixed(1));
});

console.log('\n  READ THE SPREAD COLUMN FIRST. Below ' + FLAT_BAR.toFixed(0) + ' the whole board is inside a');
console.log('  few points and no position is genuinely urgent, whatever the ordering');
console.log('  says. This picks nobody — it tells you WHEN and WHY. You pick WHO.\n');
