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
 * WHAT MISLED IT IS OURS. build.py assigns `proj_sleeper` only INSIDE the
 * FantasyPros attachment block, so the field named after one source is gated on
 * a second. "Does this player have a Sleeper projection" cannot be answered by
 * the field called proj_sleeper — which is why this file checks
 * `proj_fantasypros`, the field that actually means what it says.
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
  ck('  there are enough of them for that to mean something', kdef.length > 100, kdef.length);
}

// ── THE MARK IS PRECISE WHERE IT IS READ, WHICH IS WHY IT IS NOT NOISE ─────
{
  const ranked = uni.filter(p => p.overall_rank).sort((a, b) => a.overall_rank - b.overall_rank);
  const top200 = ranked.slice(0, 200);
  const single = top200.filter(p => !twoSource(p));
  ck('in the top 200 the mark fires only on K and DEF',
    single.every(p => p.position === 'K' || p.position === 'DEF'),
    single.filter(p => p.position !== 'K' && p.position !== 'DEF')
      .map(p => p.name + ' (' + p.position + ')'));
  ck('  and it fires on a real minority there, not most of the page',
    single.length > 0 && single.length < 100, single.length);
  // NON-VACUITY, the other direction: if EVERY player were two-source the first
  // check would pass while marking nothing, which is a green that means nothing.
  ck('  the two-source population is non-empty', top200.some(twoSource));
}

// ── proj_sleeper IS THE TRAP, PINNED SO IT IS NOT MISREAD AGAIN ────────────
{
  const withSleeper = uni.filter(p => p.proj_sleeper != null);
  ck('proj_sleeper is set ONLY where FantasyPros also covers the player',
    withSleeper.every(twoSource),
    'if this ever stops holding, the field has changed meaning and the comment '
    + 'in app.js projSourceMark needs revisiting');
  ck('  so proj_sleeper CANNOT answer "does Sleeper project this player"',
    uni.some(p => p.proj_sleeper == null && p.proj_baseline != null),
    'K and DEF are exactly this case: a real Sleeper projection, no proj_sleeper');
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
