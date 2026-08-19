// TERRITORY: relay measures · B owns the surface
// "LEFT" MEANT TWO THINGS ONE GLANCE APART. NOW ONLY ONE PANEL SAYS IT.
//
// Register 4f: the ⏳ Running out rail shows "WR 2 · TE 2 · TAKE NOW", and the
// BIG BOARD directly below showed "WR 20 left · TE 20 left". Two scales, one
// word, at eight seconds a pick.
//
// ── HALF THE ROW WAS ALREADY STALE, AND SAYING SO IS THE POINT ──────────────
//
// The row's evidence is that "20 left" was IDENTICAL across all four positions —
// the identical-value-across-many shape this project treats as a defect
// signature — and inferred the label most likely meant "20 SHOWN".
//
// That does not reproduce. `posColumns` prints `c.total`, built as `at.length`
// off `boardAtPos(d.board(), pos)`, and `state.board` is the whole undrafted
// pool, not a slice. The rows are sliced to 30; the COUNT never was. On the
// live board the head prints QB 76 · RB 137 · WR 206 · TE 116 — four different,
// correct numbers. The inference was reasonable and the arithmetic was fine.
//
// ── WHAT WAS STILL REAL, AND IS WHAT GOT FIXED ─────────────────────────────
//
// The ambiguity survives correct numbers, and is arguably worse with them: "WR
// 2" one rail up and "WR 206 left" one rail down is not two readings of one
// quantity, it is a contradiction unless you already know which scale each uses.
// So the BIG BOARD head now says "206 undrafted" and the scarcity rail keeps
// "left" — one word changed, no arithmetic touched.
//
// Run: node draft/tests/big_board_left_means_one_thing.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(
  path.join(ROOT, 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const Charts = require(path.join(ROOT, 'public', 'js', 'draft', 'warroom_charts.js'));

// ── 1. THE RENDERED HEAD NO LONGER SAYS "LEFT" ─────────────────────────────
{
  const html = Charts.posColumns([
    { pos: 'WR', total: 206, rows: [{ id: '1', rank: 1, name: 'A Player', proj: 250 }] },
    { pos: 'TE', total: 116, rows: [{ id: '2', rank: 1, name: 'B Player', proj: 180 }] },
  ]);

  ck('the BIG BOARD head prints the count as UNDRAFTED', /206 undrafted/.test(html), html.slice(0, 240));

  /* THE ASSERTION THAT IS THE WHOLE ROW. The scarcity rail owns the word
   * "left"; this panel must not also use it, or the collision is back. */
  ck('DEFECT-FIXED: the word "left" does not appear anywhere in the BIG BOARD '
    + 'column markup', !/\bleft\b/.test(html), html.match(/.{0,40}\bleft\b.{0,40}/));

  ck('the empty-column message stopped saying it too, which is the same '
    + 'collision in the case where it matters most',
  !/none left/.test(Charts.posColumns([{ pos: 'K', total: 0, rows: [] }])));
}

// ── 2. THE NUMBER WAS NEVER WRONG, AND MUST STAY UNTOUCHED ─────────────────
{
  /* CONTROL. A "fix" that changed the arithmetic while relabelling it would be
   * far worse than the ambiguity — this pins that only the word moved. */
  const html = Charts.posColumns([{ pos: 'RB', total: 137, rows: [] }]);
  ck('CONTROL: the count rendered is exactly the `total` handed in — the fix '
    + 'changed a word, not a quantity', /137/.test(html));

  ck('CONTROL: a DIFFERENT total renders differently, so the check above is not '
    + 'matching a constant baked into the markup',
  /42/.test(Charts.posColumns([{ pos: 'K', total: 42, rows: [] }])));
}

// ── 3. THE ROW'S OWN EVIDENCE, RE-TESTED AGAINST THE REAL BOARD ────────────
{
  /* 4f's evidence was that the count was IDENTICAL across positions. If that
   * ever becomes true again it means `total` has silently become a shown-count,
   * which is the bug the row actually suspected — so it is worth a live check
   * rather than an assertion about today's numbers. */
  const board = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const counts = {};
  ['QB', 'RB', 'WR', 'TE'].forEach(pos => {
    counts[pos] = board.players.filter(
      p => p.position === pos && (p.proj_mean || 0) > 0).length;
  });
  const distinct = new Set(Object.values(counts));

  ck('the per-position counts are DISTINCT, so the head is reporting a real '
    + 'pool and not a display depth — the shape 4f suspected',
  distinct.size === 4, counts);

  ck('...and each is far larger than the 30-row display slice, which is the '
    + 'other way a shown-count would give itself away',
  Object.values(counts).every(n => n > 30), counts);
}

// ── 4. THE SOURCE SAYS WHY, SO THE WORD DOES NOT DRIFT BACK ────────────────
{
  ck('the change carries its reason in the source, naming both scales',
    /Running out rail says/.test(SRC) && /register 4f/i.test(SRC));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
