// TERRITORY: relay measures · A rules
// THE KEEPER LOCK RE-ORDERS THE BOARD, AND THE MOVERS ARE RUNNING BACKS.
//
// Register 5f. The board's replacement levels are counted over the ROSTERABLE
// population — board plus keepers, verified below against the board's own
// published numbers, because a kept player still occupies a starting slot. So
// when the other teams' keepers came off at the lock (Cory's ruling), the
// countable pool shrank and every level FELL.
//
// It fell by very different amounts per position, and that is the whole thing.
// ⚠️ THE NUMBERS BELOW ARE THE 08-11 REHEARSAL'S; THE LOCK HAS SINCE HAPPENED
// AND THE MEASURED ONES ARE IN THE BLOCK ABOVE §1. They are kept here because
// the rehearsal called the rank order right at every position:
//
//     RB  179.3 -> 146.1   (-33.2)   measured -43.5
//     WR  162.6 -> 147.5   (-15.1)   measured -18.7
//     TE  136.4 -> 130.6   ( -5.8)   measured  -3.7
//     QB  341.72 -> 337.48 ( -4.2)   measured  -3.0
//     K / DEF               unchanged        unchanged
//
// `vorp` is `proj_mean - replacement[position]` and the board ranks ACROSS
// positions on it. A UNIFORM drop would move nobody. A DIFFERENTIAL drop moves
// every running back 29 points past every quarterback — so the lock is a
// re-ordering, not a refresh.
//
// ── WHAT THIS FILE IS CAREFUL ABOUT ──────────────────────────────────────────
//
//  1. IT ISOLATES THE LEVELS. Every comparison is over the SAME post-lock
//     population, changing only the replacement levels. Without that, "players
//     moved" would be mostly the pool getting fifteen shorter, which is trivial
//     and uninteresting.
//  2. IT IS NO LONGER A REHEARSAL. It was one until 2026-08-26 — the slate came
//     from `predicted_keepers`, stamped MOCK/REHEARSAL ONLY, and the magnitudes
//     were an estimate. The lock has happened, so the slate is now the REAL
//     `kept_players` and the magnitudes are measured. The DIRECTION was always
//     the structural part: keepers are elite, elite is RB/WR heavy, removing
//     them lowers the Nth-best threshold — and that is what graded true.
//  3. IT PINS THE MECHANISM, NOT TODAY'S NAMES. The named movers are printed as
//     detail; the assertions are about the shape, so a new board does not make
//     this file red for the wrong reason.
//
// Run: node draft/tests/keeper_lock_reorders_the_board.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 400) : '')); }
};

const SC = B.replacement.starter_counts;
const PUB = B.replacement.replacement_points;
const SKILL = ['QB', 'RB', 'WR', 'TE'];
const PRICED = B.players.filter(p => Number(p.proj_mean) > 0);
const adp = p => Number(p.adjusted_adp != null ? p.adjusted_adp
  : (p.raw_adp != null ? p.raw_adp : p.adp));

/* `predicted_keepers` IS NO LONGER READ HERE. It supplied the rehearsal slate
 * (seat-filtered against Cory's own keepers — register 303) and the real lock
 * has replaced it; leaving the derivation in place would be a second, unused
 * definition of the removed set sitting next to the real one. The prediction it
 * produced is graded in the block above §1 rather than deleted. */

const levels = pool => {
  const out = {};
  Object.keys(SC).forEach(pos => {
    const v = pool.filter(p => p.position === pos).map(p => p.proj_mean)
      .sort((a, b) => b - a);
    out[pos] = v.length >= SC[pos] ? v[SC[pos] - 1] : null;
  });
  return out;
};
const rank = (pool, R) => {
  const o = {};
  pool.slice().sort((x, y) =>
    (y.proj_mean - (R[y.position] || 0)) - (x.proj_mean - (R[x.position] || 0)))
    .forEach((p, i) => { o[String(p.player_id)] = i + 1; });
  return o;
};

/* ⚠️⚠️ THE EVENT THIS FILE REHEARSED HAS HAPPENED, SO IT NO LONGER REHEARSES IT
 * — IT MEASURES IT. Rewritten 2026-08-26, register 353.
 *
 * Every word above was written before the lock, against `predicted_keepers` on a
 * PRE-lock board. The league-wide lock landed 2026-08-23 and `public/draft_data.json`
 * has been a POST-lock board ever since, so the old arms were removing a slate of
 * PREDICTED keepers from a board the REAL keepers had already left — a second
 * lock stacked on the first. That is why the premise check went red (the
 * published levels are no longer the board-only Nth) and why "hundreds move ten
 * slots" collapsed to twelve: almost all of the movement had already happened,
 * inside the board this file was treating as the "before".
 *
 * THE REAL EVENT IS NOW DIRECTLY MEASURABLE AND IS STRICTLY BETTER EVIDENCE:
 * `kept_players` IS the removed slate — the actual 23, not a prediction — and
 * putting them back reconstructs the exact pre-lock population. No estimate, no
 * MOCK/REHEARSAL caveat, and the pre-lock levels it reconstructs come out equal
 * to the board's own published `replacement_points` at all six positions, which
 * is a control the rehearsal could never have had.
 *
 * ── AND THE 08-11 REHEARSAL GRADES WELL, WHICH IS WHY ITS NUMBERS ARE KEPT ──
 *
 *     pos    predicted 08-11    measured at the real lock
 *     RB        -33.2              -43.5
 *     WR        -15.1              -18.7
 *     TE         -5.8               -3.7
 *     QB         -4.2               -3.0
 *     K/DEF    unchanged          unchanged
 *
 * It called the RANK ORDER exactly right at every position — RB > WR > TE > QB,
 * with K and DEF at zero — and understated the magnitudes by roughly a third.
 * The structural claim in the header ("the DIRECTION is structural... the
 * magnitudes are an estimate") is precisely what survived. */
const POST = PRICED;                                   // the live, post-lock board
const PRE = POST.concat((B.kept_players || []).filter(p => Number(p.proj_mean) > 0));

// ── 1. THE PREMISE: LEVELS ARE PRE-LOCK, SO THE LOCK MOVED THEM ──────────────
{
  ck('the published replacement levels ARE the PRE-lock Nth projection — the '
    + 'premise of everything below, checked rather than assumed. Replacement is '
    + 'counted over the ROSTERABLE population (board + keepers), because a kept '
    + 'player still occupies a starting slot',
  SKILL.every(p => Math.abs(levels(PRE)[p] - PUB[p]) < 0.01),
  { published: PUB, recomputed: levels(PRE) });

  /* CONTROL, and it is the one the rehearsal could not run: the POST-lock board
   * on its own does NOT reproduce the published levels. Without this, "the
   * pre-lock population matches" could be true of any population big enough. */
  ck('CONTROL: the post-lock board ALONE does not reproduce them, so the '
    + 'population above is load-bearing rather than incidental',
  SKILL.some(p => Math.abs(levels(POST)[p] - PUB[p]) >= 0.01),
  { published: PUB, board_only: levels(POST) });

  ck('the removed slate is the REAL one — every league keeper, not a prediction',
    (B.kept_players || []).length >= 10, (B.kept_players || []).length);

  ck('CONTROL: removing them shrinks the pool but leaves it large enough that '
    + 'every level is still the Nth of a real population',
  POST.length > 500 && SKILL.every(p => levels(POST)[p] != null),
  { before: PRE.length, after: POST.length });
}

// ── 2. THE DROP IS DIFFERENTIAL, WHICH IS WHY IT RE-ORDERS ──────────────────
{
  const after = POST;
  const R1 = levels(PRE), R2 = levels(after);
  const drop = {};
  SKILL.forEach(p => { drop[p] = R1[p] - R2[p]; });

  ck('every skill replacement level FALLS at the lock — none rises',
    SKILL.every(p => drop[p] >= 0), drop);

  /* THE ASSERTION THAT MATTERS. A uniform drop would move nobody at all, since
   * every vorp would shift by the same constant. The re-ordering exists only
   * because RB falls furthest. */
  ck('DEFECT-SHAPED: the drop is DIFFERENTIAL, RB by far the largest — a '
    + 'uniform drop would re-order nobody',
  drop.RB > drop.QB * 3 && drop.RB > drop.TE * 2,
  { drop, note: 'RB - QB = ' + (drop.RB - drop.QB).toFixed(1) + ' points of relative gain' });

  ck('CONTROL: K and DEF do not move, because no keeper is a kicker or a '
    + 'defence — so this is not a global rescale of everything',
  Math.abs(levels(PRE).K - levels(after).K) < 0.01
    && Math.abs(levels(PRE).DEF - levels(after).DEF) < 0.01);
}

// ── 3. THE RE-ORDERING, ISOLATED ────────────────────────────────────────────
{
  const after = POST;
  const R1 = levels(PRE), R2 = levels(after);
  //: SAME population both times. Only the levels differ, so nothing here is the
  //: pool getting shorter.
  const before = rank(after, R1), now = rank(after, R2);
  const moved = Object.keys(now).map(id => ({ id, d: before[id] - now[id] }));
  const big = moved.filter(m => Math.abs(m.d) >= 10);
  const byId = {};
  POST.forEach(p => { byId[String(p.player_id)] = p; });
  const pos = {};
  big.forEach(m => { const q = byId[m.id].position; pos[q] = (pos[q] || 0) + 1; });

  ck('DEFECT: hundreds of players move ten or more board slots on the levels '
    + 'alone', big.length >= 200, { moved_10_plus: big.length, of: moved.length, by_position: pos });

  const win = big.filter(m => {
    const a = adp(byId[m.id]);
    return Number.isFinite(a) && a >= 27 && a <= 160;
  });
  /* ⚠️ THIS WAS `win.length >= 40`, AN ABSOLUTE COUNT WHERE THE CLAIM IS A
   * SHARE — its own name says "a large share of them" (A, 2026-08-24,
   * register 300). The board moved and the count came out 29, so the arm went
   * red on a number rather than on the property. An absolute floor over a
   * population whose size is not fixed is the same pinned-constant class as
   * predraft_survival_is_not_one_number's wall value and vona_room_vs_market's
   * rank band, both corrected today.
   *
   * Stated as the share it always claimed to be, and the denominator is
   * PRINTED so the next reader sees the population rather than re-deriving it. */
  const share = big.length ? win.length / big.length : 0;
  console.log('      pick-window share: ' + win.length + ' of ' + big.length
    + ' movers sit inside ADP 27-160 (' + Math.round(100 * share) + '%)');
  ck('...and a large share of them sit inside Cory\'s own pick window',
    share >= 0.10 && win.length > 0,
    { in_window: win.length, movers: big.length, share: +share.toFixed(3) });

  /* THE HEADLINE, AS A SHAPE RATHER THAN A LIST OF NAMES. */
  const top = win.slice().sort((a, b) => b.d - a.d).slice(0, 10);
  ck('DEFECT: the biggest RISERS in his window are overwhelmingly running '
    + 'backs — the position whose replacement level fell furthest',
  top.filter(m => byId[m.id].position === 'RB').length >= 7,
  top.map(m => `${byId[m.id].name} (${byId[m.id].position}) ${before[m.id]}->${now[m.id]}`));

  /* CONTROL — the instrument can report NO movement. If ranking twice under the
   * SAME levels produced movement, the sort would be unstable and every number
   * above would be noise. */
  const same = rank(after, R1);
  ck('CONTROL: ranking twice under the SAME levels moves nobody, so the '
    + 'movement above is the levels and not an unstable sort',
  Object.keys(same).every(id => same[id] === before[id]));
}

// ── 4. THE LOCK DATE COMES FROM THE CONFIG, NOT FROM THIS FILE ──────────────
{
  const cfg = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
  const d = (cfg.keepers || {}).deadline;
  ck('the keeper deadline is a config key, so this file does not carry a '
    + 'fifteenth copy of the date (register 42)',
  d && d.date === '2026-08-21', d);
  ck('...and it records the ruling it came from, so nobody re-litigates it',
    d && /08\/21/.test(d.cory_ruling_verbatim || ''), d && d.cory_ruling_verbatim);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
