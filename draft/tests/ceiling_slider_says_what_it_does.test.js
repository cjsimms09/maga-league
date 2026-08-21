// TERRITORY: A
/* CORY, 2026-08-21: "is ceiling adjust wired? can I adjust (0-100) and if at
 * 100 players should be ranked fully by their ceiling?"
 *
 * The measured answer is NO to both halves, and the war room was telling him
 * neither. This file pins the three facts he asked about so the copy cannot
 * drift away from the code again — which it already had, twice over:
 *
 *   1. The slider's range is 0-3, not 0-100. Nothing on the page said so.
 *   2. The term is arithmetically ZERO until CEILING_LATE_FROM (0.6) of the
 *      board is gone — pick 90 of 150 — so it does nothing at SEVEN of his
 *      TWELVE picks. Nothing on the page said so either.
 *   3. The "when to move it" copy read "this is Cory's call after the 22nd"
 *      while Cory had ALREADY RULED IT TWICE (0 -> 0.45 on 08-17, back to 0 on
 *      08-20, "switch it off, its so arbitrary"). CLAUDE.md names this exact
 *      failure: a live document sending the next reader to ask Cory for a
 *      decision he has already made.
 *
 * ── WHY A CONTROL THAT LOOKS LIVE AND ISN'T IS WORTH ITS OWN FILE ───────────
 *
 * `slider_sync` proves the sliders WRITE. `weight_effect_honesty` proves the
 * DEFAULTS match the engine. Neither can see a slider whose default and wiring
 * are both correct and whose EFFECT is zero over most of the draft — that is a
 * property of CEILING_LATE_FROM, which no copy test reads. Measured to be sure
 * rather than assumed: with the 08-21 tree, deleting the gate sentence from the
 * ejs leaves both of those suites green and only this one red.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 260) : '')); }
};

const EJS = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
const ENGINE = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');

/* ── the two numbers this copy is allowed to state, read from the code ────── */

const lateFrom = (() => {
  const m = ENGINE.match(/CEILING_LATE_FROM:\s*([\d.]+)/);
  return m ? +m[1] : null;
})();
ck('CONTROL: CEILING_LATE_FROM was actually found in engine.js — a null here '
  + 'would make every gate check below vacuous',
  lateFrom != null && lateFrom > 0 && lateFrom < 1, { lateFrom });

const sliderTag = (() => {
  const m = EJS.match(/<input class="weight-slider"[^>]*>/);
  return m ? m[0] : '';
})();
ck('CONTROL: the weight slider input tag was found in the ejs',
  /min="[\d.]+"/.test(sliderTag) && /max="[\d.]+"/.test(sliderTag), { sliderTag });

const sMin = +(sliderTag.match(/min="([\d.]+)"/) || [])[1];
const sMax = +(sliderTag.match(/max="([\d.]+)"/) || [])[1];

/* the ceiling row's own copy — everything between 'ceiling', and the next entry */
const row = (() => {
  const i = EJS.indexOf("['ceiling', 'Upside bonus'");
  if (i < 0) return '';
  const j = EJS.indexOf("['keeper'", i);
  return EJS.slice(i, j > 0 ? j : i + 4000);
})();
ck('CONTROL: the ceiling slider row was found — if this regex ever stops '
  + 'matching, every claim check below silently passes on an empty string',
  row.length > 200, { len: row.length });

/* ── 1. THE RANGE HE ASKED ABOUT ──────────────────────────────────────────── */

ck('the copy states the ACTUAL range, and it matches the input\'s own min/max — '
  + 'Cory asked "can I adjust (0-100)"; it is 0-3',
  row.indexOf(sMin + '–' + sMax) >= 0 || row.indexOf(sMin + '-' + sMax) >= 0,
  { min: sMin, max: sMax, saysEnDash: row.indexOf(sMin + '–' + sMax) >= 0 });

ck('and it does not promise a 0-100 scale it does not have',
  !/0\s*[-–]\s*100/.test(row.replace(/NOT 0[-–]100/g, '')), {});

/* ── 2. THE GATE — the reason it looked inert ─────────────────────────────── */

ck('the copy names CEILING_LATE_FROM by value, so a reader can check it against '
  + 'the engine instead of trusting the sentence',
  row.indexOf(String(lateFrom)) >= 0, { lateFrom });

ck('and says the term is ZERO before that point, in plain words rather than by '
  + 'naming a constant — this is the half Cory would actually notice',
  /EXACTLY ZERO|does nothing before/i.test(row), {});

const pctFromGate = Math.round(lateFrom * 100);
ck('the percentage it quotes is derived from the constant, not typed '
  + 'independently of it',
  row.indexOf(pctFromGate + '%') >= 0, { expect: pctFromGate + '%' });

/* ── 3. THE RULING THAT WAS ALREADY MADE ──────────────────────────────────── */

ck('the copy no longer tells Cory the ceiling weight is his call AFTER the '
  + 'draft — he ruled it on 08-17 and again on 08-20, and this sentence would '
  + 'have sent him to make a decision he had already made twice',
  !/call after the 22nd/i.test(row), {});

ck('it records BOTH rulings instead, with his own words for the second — a '
  + 'weight that changed twice needs its history visible or the next reader '
  + 'reverses it by accident',
  /08-17/.test(row) && /08-20/.test(row) && /switch it off/i.test(row), {});

/* ── 4. WHAT "FULLY BY CEILING" WOULD ACTUALLY DO ─────────────────────────── */

ck('the copy answers the second half of his question — at max it still does '
  + 'NOT rank by ceiling — and says why, rather than leaving him to find out '
  + 'by dragging the slider and seeing nothing move',
  /does not rank by ceiling|STILL DOES NOT RANK BY CEILING/i.test(row), {});

ck('and it names the real reason: proj_ceiling is raw season points, never '
  + 'replacement-adjusted, so ranking on it returns quarterbacks. This is '
  + 'register 207\'s defect in a second place, and the copy must not describe '
  + 'the symptom without the cause',
  /replacement/i.test(row) && /QUARTERBACK|QB/.test(row), {});

ck('it points him at the tools that DO answer "show me the board by upside" '
  + 'instead of leaving the answer as a flat no',
  /Upside-Only/.test(row) && /Fl–Ce|Fl-Ce/.test(row), {});

/* ── 5. THE DEFAULT STILL MATCHES THE ENGINE ──────────────────────────────── */

const shipped = (() => {
  const m = ENGINE.match(/const MEASURED_WEIGHTS = \{[^}]*\}/);
  if (!m) return null;
  const c = m[0].match(/ceiling:\s*([\d.]+)/);
  return c ? +c[1] : null;
})();
ck('CONTROL: MEASURED_WEIGHTS.ceiling was read off engine.js rather than '
  + 'assumed — CLAUDE.md register 5h: when a weight is quoted anywhere in this '
  + 'repo, read the constant',
  shipped != null, { shipped });
const declared = (row.match(/'Upside bonus',\s*([\d.]+)/) || [])[1];
ck('the slider default equals the shipped weight — the drift that put 0.45 in '
  + 'four documents while the engine carried 0',
  declared != null && Math.abs(+declared - shipped) < 1e-9,
  { declared: declared, shipped: shipped });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
