/* NOT EVERY PROJECTION ON THE BOARD HAS THE SAME BACKING.
 *
 * B REPORTED (2026-08-11) that 0 of 41 kickers and 0 of 32 defences carry a
 * source projection, and inferred their VORP is "derived from two synthesised
 * numbers" while rendering beside RB VORP with identical authority.
 *
 * THE FIELD IS EMPTY AND THE INFERENCE IS WRONG. Aubrey's proj_baseline of
 * 107.00 is Sleeper's own projected stat line — 9 FG 40-49 x 3, 8 FG 50+ x 5,
 * 42 XP x 1, 2 XP missed x -1 — run through this league's scoring table, and it
 * was reproduced by hand from the raw row in
 * draft/audit/rule12_statline_check_2026-08-11.md. The Rams' 114.00 likewise.
 * Nothing about K or DEF is synthesised.
 *
 * WHAT MISLED IT WAS OURS. build.py used to assign `proj_sleeper` only INSIDE
 * the FantasyPros attachment block, so the field named after one source was
 * gated on a second, and "does this player have a Sleeper projection" could
 * not be answered by the field called proj_sleeper. FIXED 2026-08-17
 * (build.py attach_sleeper_column, out of the blend study's 77-row
 * measurement): proj_sleeper is now stamped wherever Sleeper actually
 * projected the player, and the trap section below pins the fix instead of
 * the trap. `proj_fantasypros` remains the two-source discriminator.
 *
 * THE REAL DIFFERENCE IS STILL WORTH SHOWING: skill positions carry a two-source
 * consensus, K and DEF carry Sleeper alone. Single-source is not synthesised and
 * it is not consensus either.
 *
 * Run: node draft/tests/proj_source_authority.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const BOARD = path.join(ROOT, 'public', 'draft_data.json');
if (!fs.existsSync(BOARD)) { console.log('SKIP  no built board'); process.exit(0); }
const art = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
const uni = (art.players || []).concat(art.kept_players || [])
  .filter(p => p.proj_mean != null);
const twoSource = p => p.proj_fantasypros != null;

// ── THE CLAIM THE MARK MAKES ────────────────────────────────────────────────
{
  const kdef = uni.filter(p => p.position === 'K' || p.position === 'DEF');
  ck('every K and DEF is single-source', kdef.every(p => !twoSource(p)),
    kdef.filter(twoSource).map(p => p.name).slice(0, 5));
  ck('  and they all still HAVE a projection — single-source, not absent',
    kdef.every(p => p.proj_mean != null && p.proj_baseline != null));
    /* THRESHOLD RECALIBRATED, NOT RELAXED. This read `> 100`, a number
     * calibrated when the board shipped 1,841 rows — most of them men nobody
     * expects to play in 2026. The 2026-08-14 rebuild ran the dormant prune
     * for the first time (1,841 -> 686) and the count fell below it.
     *
     * The old number was measuring how BIG the board was, which is not the
     * property this control exists to establish. What it needs is a sample
     * large enough for the check that follows, so the bar is stated against
     * that instead of against a board size that will keep moving. */
  ck('  there are enough of them for that to mean something — every kicker and\n    defence the board carries, and both positions represented',
    kdef.length >= 40 && kdef.some(p => p.position === 'K')
      && kdef.some(p => p.position === 'DEF'), kdef.length);
}

// ── THE MARK IS PRECISE WHERE IT IS READ, WHICH IS WHY IT IS NOT NOISE ─────
/* RE-PINNED 2026-08-17. "In the top 200 the mark fires only on K and DEF" was
 * true of a board where (a) K/DEF interleaved into the top 200 by VORP and
 * (b) FantasyPros covered every top-200 skill player. Both halves moved on
 * the 08-17 rebuild: Cory's K/DEF demotion ruling (vorp.py — their
 * cross-position VORP was never purchasable) sorts every K and DEF after
 * every skill player, pushing them all past rank 600; and pulling ~70 deeper
 * skill rows INTO the top 200 surfaced a handful FantasyPros does not carry
 * (Tyreek Hill, Keenan Allen on the 08-17 feed). The mark is doing its job
 * on them — those numbers really are single-source — so the pin moves to the
 * properties that survive a re-sort: the mark stays a small minority of the
 * page, and the demotion itself is held here since it is what evacuated
 * K/DEF from the page the mark was calibrated on. (app.js's tooltip still
 * says "FantasyPros does not cover this POSITION" — true when written,
 * now narrower than the mark's real firing set; app.js is out of scope in
 * this pass, so the drift is recorded here.) */
{
  const ranked = uni.filter(p => p.overall_rank).sort((a, b) => a.overall_rank - b.overall_rank);
  const top200 = ranked.slice(0, 200);
  const single = top200.filter(p => !twoSource(p));
  ck('every K and DEF ranks BELOW the top 200 — the demotion ruling in force, '
    + 'which is why the mark\'s old "only K and DEF" reading went with them',
  uni.filter(p => p.position === 'K' || p.position === 'DEF')
    .every(p => (p.overall_rank || 0) > 200),
  uni.filter(p => (p.position === 'K' || p.position === 'DEF')
      && (p.overall_rank || 0) <= 200).map(p => p.name).slice(0, 5));
  ck('in the top 200 the mark fires on a HANDFUL of skill players FantasyPros '
    + 'really does not carry — not on a class, and not on nobody',
  single.length > 0 && single.length <= 10
      && single.every(p => p.proj_fantasypros == null && p.proj_sleeper != null),
  single.map(p => p.name + ' (' + p.position + ')'));
  ck('  and it fires on a real minority there, not most of the page',
    single.length > 0 && single.length < 100, single.length);
  // NON-VACUITY, the other direction: if EVERY player were two-source the first
  // check would pass while marking nothing, which is a green that means nothing.
  ck('  the two-source population is non-empty', top200.some(twoSource));
}

// ── proj_sleeper WAS THE TRAP; THE TRAP IS NOW CLOSED, AND THAT IS PINNED ──
/* HISTORY: build.py stamped `proj_sleeper` only inside the FantasyPros
 * attachment block, so the field named after one source was gated on a
 * second — 77 rows carried a real Sleeper projection with proj_sleeper
 * absent, and this suite pinned the trap so nobody misread the field. The
 * 2026-08-16 blend study measured the damage (Kenneth Walker rendered 54
 * points under his Sleeper number, labelled "Our model proj") and build.py's
 * attach_sleeper_column now stamps every row Sleeper actually projected,
 * independent of FP — and REFUSES rank-fallback rows, so absence still
 * means "Sleeper has no number", never "FP missed him". The old assertion
 * ("set ONLY where FantasyPros also covers") now pins the DEFECT, so it is
 * inverted: the field finally answers the question its name asks. */
{
  const withSleeper = uni.filter(p => p.proj_sleeper != null);
  ck('proj_sleeper is NO LONGER gated on FantasyPros — single-source rows carry '
    + 'it too, which is the build.py fix holding',
  withSleeper.some(p => !twoSource(p)),
  'if this fails, attach_sleeper_column has been lost and the 77-row trap is back');
  ck('  so proj_sleeper CAN now answer "does Sleeper project this player" — '
    + 'every K and DEF (real Sleeper projections, never FP-covered) carries it',
  uni.filter(p => p.position === 'K' || p.position === 'DEF')
    .every(p => p.proj_sleeper != null));
}

// ── THE RENDERER ACTUALLY CALLS IT ─────────────────────────────────────────
{
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^(.*?)\/\/.*$/gm, '$1');
  ck('projSourceMark is defined', /function\s+projSourceMark\s*\(/.test(code));
  ck('  and the board row calls it', /projSourceMark\(p\)/.test(code),
    'a function nobody calls is the produced-and-unread failure, again');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
