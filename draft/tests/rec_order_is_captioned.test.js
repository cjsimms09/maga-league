// TERRITORY: A owns the engine · B owns the surface
// REGISTER 4e — THE SHORTLIST'S ORDER WAS NEVER EXPLAINED WHERE A READER COULD
// SEE IT WITHOUT HOVERING, AND THAT IS ALL THIS ROW EVER ASKED FOR.
//
// The shortlist IS sorted by the engine's composite score — `.rec-rank` is
// exactly that order and nothing else — and each card already prints the
// number that drives it (`.rec-score`, title="Composite score"). But a title
// attribute does not exist on a phone and does not exist at 8 seconds a pick
// either, so a reader scanning bare numbers on a dollar-heavy tool had no way
// to know "17.3" was a composite score rather than a price.
//
// TWO FIXES WERE ON THE TABLE AND BOTH WERE REJECTED, ON THE RECORD (register
// 4e's own resolution text): sorting BY the printed number changes which
// player the engine recommends first, four days before the draft — a
// behaviour change and A's engine, not a surface tweak; printing the composite
// instead of the score-that's-already-there trades a confusing order for a
// meaningless column. THE ONE CHEAP FIX LEFT IS A CAPTION, and this is it —
// no number moved, no sort touched.
//
// Run: node draft/tests/rec_order_is_captioned.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const APP = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'app.js'), 'utf8');
const CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'css', 'style.css'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

ck('an always-visible order-note is built for the recommendations panel',
  /const orderNote = '<div class="rec-order-note">/.test(APP));

ck('...and it says the number is a composite score, in plain text (not only a title=)',
  /composite score.*<\/b>.*the number beside each name/i.test(
    APP.slice(APP.indexOf('const orderNote'), APP.indexOf('const orderNote') + 500)
      .replace(/\n\s*/g, ' ')));

ck('...and it explicitly rules out the thing a dollar-heavy tool would suggest',
  /not a dollar value/.test(APP));

ck('the note is actually WIRED into the panel render (not built and dropped)',
  /host\.innerHTML = explainPanel\('recommendations'\) \+ head \+ orderNote \+ decisiveLine/.test(APP));

// ── CONTROLS: THE TWO REJECTED FIXES DID NOT SNEAK IN INSTEAD ───────────────
{
  const rankLine = APP.match(/<div class="rec-rank">'[^;]+;/);
  ck('CONTROL: .rec-rank still reads straight off array position (i + 1) / demoted — '
    + 'nobody re-sorted the list by the displayed score',
    !!rankLine && /\(s\.demoted \? '↓' : \(i \+ 1\)\)/.test(rankLine[0]), rankLine && rankLine[0]);

  ck('CONTROL: .rec-score still prints the real composite score — the caption did not '
    + 'get shipped by hiding or replacing the number instead of labelling it',
    /'<div class="rec-score" title="Composite score">' \+ s\.score\.toFixed\(1\) \+ '<\/div>'/.test(APP));
}

ck('CSS: .rec-order-note exists and reads as a caption (muted), not a second headline',
  /\.rec-order-note\s*\{[^}]*color:\s*var\(--muted\)/.test(CSS));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
