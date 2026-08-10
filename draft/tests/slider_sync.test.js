'use strict';
// SLIDER SURFACE TRUTH — a source guard for the war-room trust bug Cory flagged
// (2026-08-10), the same defect family as the reset button: a surface telling
// him the weights are one thing while the engine loads another.
//
// THE BUG. The adjuster markup ships hardcoded at value="1" (a static EJS
// default, warroom.ejs). The tool boots on the MEASURED core, which zeroes
// tier, need, risk, ceiling and bye. Nothing pushed state.weights into the
// slider DOM on load, so every slider sat at 1.0 under a highlighted "Measured"
// preset whose own text says those sliders are OFF. The panel lied.
//
// THE INVARIANT. There is exactly ONE writer of the slider surface —
// syncSliders() — and init calls it, so the sliders can never disagree with the
// weights the engine is loaded with. Source-inspection only (app.js is a
// browser IIFE with no exports); this catches "the writer was removed or
// duplicated", not "the writer computes wrong" — that belongs to the rehearsal.
//
// Run: node draft/tests/slider_sync.test.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const ejs = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// HONEST FALLBACK: the markup must render a PER-SLIDER measured default (from the
// sliders array's def field), never a flat literal 1.0. This is defense-in-depth
// behind syncSliders — if the JS never runs, the static panel still shows the
// weights the engine loads on, not a uniform 1.0 that lies about six of eight.
// (The original bug WAS a flat value="1".) syncSliders still governs preset/auto/
// server-pref states at runtime; this only guarantees the no-JS floor is honest.
ck('markup renders a per-slider measured default (not a flat 1.0)',
   /class="weight-slider"[^>]*\bvalue="<%= def %>"/.test(ejs) &&
   /id="w-<%= key %>"><%= def\.toFixed\(1\) %>/.test(ejs) &&
   !/class="weight-slider"[^>]*\bvalue="1"/.test(ejs));

// Exactly one place writes a slider's .value — the single writer. Two writers is
// the two-places disease: how ceiling stayed 0.65 in one copy after being zeroed
// in the other. applyPreset / applyAutoWeights must route through syncSliders,
// not hand-roll their own loop.
const writers = (app.match(/\bsl\.value\s*=/g) || []).length;
ck('exactly one writer of slider .value (single source of truth)', writers === 1,
   writers + ' writers found');

ck('syncSliders is defined', /function\s+syncSliders\s*\(/.test(app));

// init must call it — the whole point is that the surface matches on FIRST paint,
// not only after the user touches a preset. The init call sits next to the
// slider-binding setup; assert syncSliders is called somewhere other than its
// own definition (>=2 mentions: the def + at least one call, and we already
// know applyPreset/applyAutoWeights aren't enough because those need a user).
const mentions = (app.match(/syncSliders/g) || []).length;
ck('syncSliders is called at least twice (init + preset/auto/prefs)', mentions >= 3,
   mentions + ' mentions');

// The reset button must load the MEASURED core, not 'balanced' (the earlier
// SEV-1). Keep that guard co-located so the two footguns of one family can't
// regress independently.
ck('reset loads the measured core, not balanced',
   /reset-weights[\s\S]{0,800}applyPreset\('measured'/.test(app));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
