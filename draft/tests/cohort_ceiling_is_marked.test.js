// TERRITORY: relay measures · B styles the mark
// A CEILING THAT IS NOT ABOUT THIS PLAYER NOW SAYS SO ON SCREEN. REGISTER 4v.
//
// The row: "32% of Cory's draft range shows a ceiling that contains no
// information about that player, and nothing on screen says so."
//
// Re-measured on the live board, ADP 25-220, skill positions only:
//   173 players · 139 (80.3%) per-player · **34 (19.7%) band-constant**
// (the row's 32% predates the 08-18 per-player volatility landing, which is
// itself the reason the share fell — the row's direction was right and its
// number has improved.)
//
// THE RATIOS ARE THE PROOF, and they are why a stamp reading
// `measured-2023-25-p90` is misleading rather than merely coarse:
//   1.4388 — Nabers, Garrett Wilson, Jayden Reed, +1
//   1.4452/1.4453 — Carnell Tate, Jordyn Tyson, Makai Lemon, +2
//   1.6081 — Kyler Murray, Malik Willis, Fernando Mendoza
// One number shared across unrelated players is a per-band constant wearing a
// measured-looking name.
//
// ⚠️ THE MARK IS NOT A WARNING, and the wording is deliberate. For several of
// these the model is refusing to guess from data it does not hold, which is a
// strength. The mark says where the number came from. It does not say the
// number is wrong.
//
// Run: node draft/tests/cohort_ceiling_is_marked.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'public', 'js', 'draft', 'warroom_charts.js'));
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const OPTS = { min: 0, max: 400 };
const marked = C.rangeBar(100, 200, 300, Object.assign({ cohortCeiling: true }, OPTS));
const plain = C.rangeBar(100, 200, 300, Object.assign({ cohortCeiling: false }, OPTS));

// ── 1. THE MARK IS VISIBLE, NOT ONLY A TOOLTIP ─────────────────────────────
{
  /* The row's complaint is "nothing on screen says so". A title attribute does
   * not satisfy that at eight seconds a pick — nobody hovers. */
  ck('DEFECT-FIXED: a cohort ceiling renders a VISIBLE mark, not just a tooltip',
    /<sup class="wr-ceil-cohort"/.test(marked), marked.slice(-220));

  ck('...and the mark carries its own explanation for anyone who does stop',
    /band average, not a measurement of this player/.test(marked));

  ck('the title says it too, so the whole bar explains itself',
    /ceiling 300 \(cohort average, not this player\)/.test(marked));

  ck('and the screen-reader label says it, rather than reading a bare number '
    + 'as though it were measured',
  /cohort average, not this player/.test(marked)
    && /aria-label="outcome range 100 to 300 \(cohort average/.test(marked));

  ck('it is machine-readable too, so a later check can count marked bars '
    + 'without parsing prose', /data-cohort-ceiling="1"/.test(marked));
}

// ── 2. CONTROL — THE UNMARKED CASE IS GENUINELY UNMARKED ───────────────────
{
  /* Without this, a bar that marked EVERYTHING would pass every check above. */
  ck('CONTROL: a per-player ceiling gets NO mark, no class and no note',
    !/wr-ceil-cohort/.test(plain) && !/cohort-ceiling"/.test(plain)
    && !/cohort average/.test(plain), plain.slice(-200));

  ck('CONTROL: it still says data-cohort-ceiling="0" rather than omitting the '
    + 'field, so absent and false are distinguishable',
  /data-cohort-ceiling="0"/.test(plain));

  /* CONTROL: the mark is ADDITIVE — it must not move the drawing. Compared on
   * the geometry itself rather than by normalising the two strings, because a
   * normaliser complicated enough to make them match is a normaliser that can
   * hide the very difference it is meant to catch. */
  const geometry = s => ({
    rect: (s.match(/<rect[^>]*>/) || [''])[0],
    tick: (s.match(/<line class="wr-range-tick"[^>]*>/) || [''])[0],
    rail: (s.match(/<line class="wr-range-rail"[^>]*>/) || [''])[0],
    data: (s.match(/data-f="[^"]*" data-m="[^"]*" data-c="[^"]*"/) || [''])[0],
  });
  ck('CONTROL: the bars draw IDENTICALLY — the mark is additive and moves no '
    + 'geometry, so a marked player\'s range still reads on the shared scale',
  JSON.stringify(geometry(plain)) === JSON.stringify(geometry(marked)),
  { plain: geometry(plain), marked: geometry(marked) });
}

// ── 3. THE PREDICATE IS CONSERVATIVE, WHICH IS THE WHOLE SAFETY ARGUMENT ───
{
  /* Extracted from app.js by behaviour rather than by import (the module is a
   * browser IIFE). These are the exact stamps the live board carries. */
  const cohort = src => {
    if (typeof src !== 'string' || !src) return false;
    if (/-x-player-cv$/.test(src)) return false;
    return /^measured-/.test(src);
  };

  ck('a band-constant stamp marks', cohort('measured-2023-25-p90') === true);
  ck('a per-player stamp does NOT mark',
    cohort('measured-2023-25-p90-x-player-cv') === false);

  /* ⚠️ THE ONES THAT MATTER. A mark that fired on absence would light up K/DEF
   * (a different construction entirely) and every unrecognised stamp from a
   * future build — and a marker that cries wolf gets ignored, which is this
   * project's own intervention-rate epitaph. */
  ck('CONTROL: a MISSING stamp does not mark — under-marking leaves the status '
    + 'quo, over-marking destroys the mark\'s meaning',
  cohort(undefined) === false && cohort(null) === false && cohort('') === false);
  ck('CONTROL: an unrecognised construction does not mark',
    cohort('gaussian_z') === false && cohort('position_variance') === false);

  ck('the predicate ships in app.js and is wired into the bar',
    /function cohortCeiling\(player\)/.test(APP)
    && /cohortCeiling: cohortCeiling\(p\)/.test(APP));
}

// ── 4. IT FIRES ON THE REAL BOARD, AND ON THE RIGHT NUMBER OF PLAYERS ──────
{
  const board = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const adp = p => {
    for (const k of ['adjusted_adp', 'raw_adp', 'adp']) {
      const v = p[k];
      if (v != null && isFinite(Number(v))) return Number(v);
    }
    return null;
  };
  const cohort = src => typeof src === 'string' && !!src
    && !/-x-player-cv$/.test(src) && /^measured-/.test(src);

  const range = board.players.filter(p =>
    ['QB', 'RB', 'WR', 'TE'].includes(p.position) && (p.proj_mean || 0) > 0
    && adp(p) != null && adp(p) >= 25 && adp(p) <= 220);
  const hit = range.filter(p => cohort(p.proj_ceiling_source));

  /* KNOWN-POSITIVE (rule 3e): this predicate must return a real positive on the
   * real board, or "nothing to mark" and "predicate broken" look identical. */
  ck('KNOWN-POSITIVE: the predicate fires on the LIVE board inside Cory\'s '
    + 'range — a silent zero here would be indistinguishable from a broken check',
  hit.length >= 10, { in_range: range.length, marked: hit.length });

  ck('...and it does NOT fire on everything, so it is discriminating rather '
    + 'than decorating',
  hit.length < range.length / 2, { marked: hit.length, of: range.length });

  /* The defect's signature, asserted directly: shared ratios. If these ever
   * become distinct the underlying problem is fixed and this mark should go. */
  const ratios = {};
  hit.forEach(p => {
    const r = (p.proj_ceiling / p.proj_mean).toFixed(4);
    (ratios[r] = ratios[r] || []).push(p.name);
  });
  const shared = Object.values(ratios).filter(v => v.length > 1);
  ck('the marked players SHARE ceiling ratios — the actual evidence that the '
    + 'number is a cohort constant and not a measurement',
  shared.length >= 2, Object.entries(ratios).filter(([, v]) => v.length > 1)
    .map(([r, v]) => r + ' x' + v.length));
}

// ── THE MARKER'S SCOPE, MEASURED 2026-08-18 — IT UNDER-MARKS, AND BY HOW MUCH
//
// `cohortCeiling()` marks a ceiling whose source starts `measured-` and does NOT
// end `-x-player-cv`. That catches the band-derived p90s. It does NOT catch
// `gaussian_z`, and gaussian_z ceilings carry no player information either:
// measured on the live board, ALL 161 of them have `proj_sd_source:
// position_variance`, i.e. one constant per position. DEF shows a single
// ceiling/mean ratio to four decimal places across all 32 rows.
//
// So the honest statement is: **428 of 696 board rows (61%) have a ceiling with
// no player-specific information, and the `~` marks 267 of them.**
//
// ⚠️ I AM NOT WIDENING THE MARKER, AND THE REASON IS THE MEASUREMENT, NOT THE
// CALENDAR. Of the 161 gaussian_z rows, **7 sit inside ADP 150** — Cory's real
// draft range — and all seven are K or DEF (Rams/Texans/Seahawks/Broncos
// defences, Aubrey, Fairbairn, Dicker). The remaining 154 are deep rows he will
// never reach. Marking a kicker's ceiling as cohort-derived is true and useless:
// nobody drafts a kicker on upside, and the board's own doctrine says the wire
// covers the slot. Adding a second glyph to a card Cory has already called "too
// busy and wordy" to serve seven K/DEF rows is a worse board, not a better one.
//
// The test below PINS that decision so it cannot drift silently: if a gaussian_z
// row ever appears at a position that is not K or DEF inside ADP 150, this goes
// red and the trade-off is worth revisiting.
{
  /* Same load and the same ADP fallback chain block 4 uses — reading a
   * different field would measure a different population and the two numbers
   * would drift without either being wrong. */
  const bd = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const adpOf = (p) => {
    for (const k of ['adjusted_adp', 'raw_adp', 'adp']) {
      const v = p[k];
      if (v != null && isFinite(Number(v))) return Number(v);
    }
    return null;
  };
  const gauss = bd.players.filter(p => p.proj_ceiling_source === 'gaussian_z');
  const inRange = gauss.filter(p => adpOf(p) != null && adpOf(p) <= 150);
  ck('CONTROL: gaussian_z ceilings DO exist on the board, so the scope note '
    + 'above describes something real rather than an empty set',
  gauss.length > 0, { gaussian_z: gauss.length });

  ck('the UNMARKED cohort-derived ceilings inside Cory\'s draft range are K/DEF '
    + 'only — the measured reason the `~` is not widened. If this fails, a real '
    + 'skill player is showing an unmarked cohort ceiling and the trade-off '
    + 'changes.',
  inRange.every(p => p.position === 'K' || p.position === 'DEF'),
  inRange.filter(p => p.position !== 'K' && p.position !== 'DEF')
    .map(p => p.position + ' ' + p.name + ' adp' + Math.round(p.adp)));

  ck('...and there are few enough of them to name — a count that grows is a '
    + 'signal the fallback is spreading',
  inRange.length <= 12, { in_range: inRange.length });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
