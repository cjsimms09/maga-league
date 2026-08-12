/* NEEDRULE (feature A) — the measured draft-day rule, on constructed boards.
 * Run: node draft/tests/needrule.test.js
 */
'use strict';
const NR = require('../../public/js/draft/needrule.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}
const P = (pos, adp, extra) => Object.assign({ player_id: pos + adp, name: pos + adp,
  position: pos, adjusted_adp: adp }, extra || {});

// Cory's keepers: Chase (WR), Henry (RB), Walker (RB). RB starters full (2/2), RB cap 3.
const KEEPERS = [P('WR', 3, { name: 'Chase' }), P('RB', 1, { name: 'Henry' }), P('RB', 2, { name: 'Walker' })];

// --- never over-drafts a FILLED position: a 4th RB is blocked -----------------
{
  const roster = KEEPERS.concat([P('RB', 10)]);           // 3 RB now -> RB capped (cap 3)
  const board = [P('RB', 4), P('WR', 30), P('TE', 40)];   // best ADP is the 4th RB
  const rec = NR.recommend(board, roster);
  check('a 4th RB is NEVER recommended (RB capped at starters+flex)', rec.pick.position !== 'RB',
    JSON.stringify(rec.pick));
  check('...it takes the best-ADP position still under need instead', rec.pick.position === 'WR');
}

// --- value-depth: a great flex WR jumps ahead of an empty TE slot -------------
{
  const roster = KEEPERS.concat([P('WR', 8)]);            // 2 WR (cap 3, 1 open); TE still empty
  const board = [P('WR', 5), P('TE', 20)];                // WR far better ADP than the TE
  const rec = NR.recommend(board, roster);
  check('value-depth: best flex WR is taken ahead of filling a weak TE', rec.pick.position === 'WR',
    JSON.stringify(rec.pick));
  /* The rule ranks by ADP and computed no "value" of any kind; the composite
   * renders "Best TE value" on the same screen from a different quantity. Each
   * label now names what it actually is. */
  check('...and the reason states it in the rule\'s terms — MARKET PRICE, not "value"',
    /flex-eligible by MARKET PRICE/.test(rec.reason) && !/\bvalue\b/.test(rec.reason),
    rec.reason);
}

// --- QB deferral is stated when passing an empty QB for better value ----------
{
  const roster = KEEPERS.slice();                          // QB empty
  const board = [P('WR', 6), P('QB', 9)];                  // WR better ADP; QB is the deferred onesie
  const rec = NR.recommend(board, roster);
  check('QB deferral is surfaced in the reason', /QB.*deferred/.test(rec.reason), rec.reason);
}

// --- never leave a starter empty: onesies get taken by their own late ADP -----
{
  // everything filled except DEF; only players left are a capped-RB and the DEF
  const roster = KEEPERS.concat([P('QB', 5), P('WR', 6), P('WR', 7), P('TE', 8), P('K', 9), P('RB', 10)]);
  const board = [P('RB', 50), P('DEF', 120)];             // RB is capped -> DEF is the only need
  const rec = NR.recommend(board, roster);
  check('the last empty starter (DEF) is filled, not a capped RB', rec.pick.position === 'DEF',
    JSON.stringify(rec.pick));
}

// --- bye stack is VISIBLE (rule does not price it) ---------------------------
{
  const roster = [P('WR', 3, { bye: 7 }), P('RB', 1, { bye: 7 }), P('RB', 2, { bye: 9 })];
  const board = [P('WR', 4, { bye: 7 })];                 // a 3rd starter on bye 7
  const rec = NR.recommend(board, roster);
  check('recommending a 3rd starter on the same bye raises byeStack', rec.bye_stack && rec.bye_stack.week === 7,
    JSON.stringify(rec.bye_stack));
}
{
  const roster = [P('WR', 3, { bye: 7 }), P('RB', 1, { bye: 5 })];
  const rec = NR.recommend([P('TE', 4, { bye: 9 })], roster);
  check('no false bye alarm when byes are spread', rec.bye_stack === null);
}

// --- the FIELD when close: top within-need by ADP ----------------------------
{
  const roster = KEEPERS.slice();
  const field = NR.fieldWithinNeed([P('WR', 5), P('TE', 6), P('QB', 7), P('RB', 4)], roster, 4);
  check('field excludes nothing under cap and is ADP-sorted', field[0].adjusted_adp === 4,
    JSON.stringify(field.map(f => f.position + f.adjusted_adp)));
}

// --- the honest tier travels with every recommendation -----------------------
{
  const rec = NR.recommend([P('WR', 5)], KEEPERS);
  check('confidence carries the MC-harness tier caveat', /MC-harness tier/.test(rec.confidence));
}

// --- DOMAIN: only K/DEF open (skill starters+flex covered) -> the mask DEFERS ------
// Cory 2026-08-09: the mask was measured filling expensive skill starters, not cheap bench
// slots. Once only onesies remain, "never a 4th RB" is past its evidence — a high-upside
// bench skill player has value independent of my slots, so the rule opens up and says so.
{
  const roster = KEEPERS.concat([
    P('RB', 10), P('WR', 11), P('WR', 12), P('TE', 13), P('TE', 14), P('QB', 15),
  ]); // RB 3(cap), WR 3(cap), TE 2(cap), QB 1(cap) -> only K & DEF open
  const board = [P('RB', 50, { name: 'Upside RB' }), P('K', 60), P('DEF', 65)];
  const rec = NR.recommend(board, roster);
  check('out_of_domain fires when only K/DEF remain', rec.out_of_domain === true,
    JSON.stringify(rec.open_positions));
  check('...the mask DEFERS: bench upside is not excluded to force a onesie',
    rec.pick && rec.pick.position === 'RB', JSON.stringify(rec.pick));
  check('...the reason says we are past the measured region',
    /past the rule.s measured region/.test(rec.reason), rec.reason);
  check('...confidence flags it as the human\'s call, not a masked rec',
    /PAST THE MEASURED REGION/.test(rec.confidence));
}

/* ── A BYE WARNING THAT CANNOT FIRE MUST NOT LOOK LIKE ONE THAT FOUND NOTHING ─
 *
 * byeStack returned a bare `null` in two different situations: the starters
 * genuinely do not stack, and THE DATA CANNOT ANSWER. A null bye can never
 * contribute to the count, so a roster with unknown byes returned exactly what a
 * clean roster returns. 564 players carried a team and no bye — 37% of the
 * top-225 tight ends — so this was the common case, not a corner.
 */
{
  const mk = (id, pos, adp, bye) => ({ player_id: id, name: id, position: pos,
    adp: adp, proj_mean: 150, bye: bye });
  const roster = [mk('a', 'RB', 10, 7), mk('b', 'WR', 11, 7)];

  // A pick with NO bye: the tool cannot rule out a conflict and must say so.
  const blind = NR.recommend([mk('x', 'WR', 20, null)], roster);
  check('a pick with no bye reports BLINDNESS, not silence',
    blind.bye_stack && blind.bye_stack.blind > 0 && blind.bye_stack.week === null,
    JSON.stringify(blind.bye_stack));
  check('  and it says why, in words a person can act on',
    /not the same as/.test((blind.bye_stack || {}).why || ''),
    (blind.bye_stack || {}).why);

  // THE CONTROL: a fully-known roster with no stack must still be silent, or
  // the warning becomes noise on every pick and gets ignored.
  const clean = NR.recommend([mk('y', 'WR', 20, 11)], [mk('a', 'RB', 10, 7), mk('b', 'WR', 11, 9)]);
  check('a fully-known roster with no stack stays SILENT',
    clean.bye_stack === null, JSON.stringify(clean.bye_stack));

  // And a real stack still fires, with the count.
  const stack = NR.recommend([mk('z', 'WR', 20, 7)], roster);
  check('a real three-way stack still fires with its week and count',
    stack.bye_stack && stack.bye_stack.week === 7 && stack.bye_stack.count >= 3,
    JSON.stringify(stack.bye_stack));
}

console.log(`\n${pass}/${pass + fail} needrule checks passed`);
process.exit(fail ? 1 : 0);
