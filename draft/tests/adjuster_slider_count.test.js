'use strict';
// Register 229 (owner B): the Adjusters tab said "a weighted sum of SEVEN
// things" and shipped EIGHT sliders -- `stack` had no slider at all when this
// was filed. The slider itself was since added (warroom.ejs's `sliders`
// array carries all eight MEASURED_WEIGHTS keys), but the two copy strings
// describing the panel still said "seven" -- the register's own REC named
// this exact failure mode: "the next term added cannot go invisible", and a
// slider that WAS added with stale copy left BESIDE it is the same class of
// lie the slider itself exists to prevent (see slider_sync.test.js).
//
// THE GUARD register 229 asked for: assert the rendered slider count equals
// Object.keys(MEASURED_WEIGHTS).length, source-inspection only (app.js is a
// browser IIFE with no exports, same constraint slider_sync.test.js works
// under), so a ninth term added to the engine without a ninth slider -- or a
// slider added without updating the "how many things" copy -- fails the build
// instead of drifting silently.
//
// Run: node draft/tests/adjuster_slider_count.test.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const engine = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const ejs = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

// MEASURED_WEIGHTS itself -- the ground truth for how many terms the engine's
// composite score actually sums.
const weightsBlockMatch = engine.match(/const MEASURED_WEIGHTS = \{([\s\S]*?)\};/);
ck('MEASURED_WEIGHTS block found in engine.js', !!weightsBlockMatch);
const weightKeys = weightsBlockMatch
  ? [...weightsBlockMatch[1].matchAll(/(\w+):\s*[\d.]+/g)].map(m => m[1])
  : [];
ck('MEASURED_WEIGHTS carries a plausible number of terms (sanity, not vacuous)',
  weightKeys.length >= 5, weightKeys.length);

// The sliders array in warroom.ejs -- what actually renders.
const slidersBlockMatch = ejs.match(/const sliders = \[([\s\S]*?)\];/);
ck('sliders array found in warroom.ejs', !!slidersBlockMatch);
const sliderKeys = slidersBlockMatch
  ? [...slidersBlockMatch[1].matchAll(/\[\s*'(\w+)'/g)].map(m => m[1])
  : [];

// THE GUARD register 229 asked for by name.
ck('every rendered slider count equals Object.keys(MEASURED_WEIGHTS).length',
  sliderKeys.length === weightKeys.length,
  `sliders: ${sliderKeys.length} (${sliderKeys.join(',')}) vs weights: ${weightKeys.length} (${weightKeys.join(',')})`);
ck('and it is the SAME SET of keys, not just the same count',
  weightKeys.every(k => sliderKeys.includes(k)) && sliderKeys.every(k => weightKeys.includes(k)),
  `missing sliders: ${weightKeys.filter(k => !sliderKeys.includes(k)).join(',') || 'none'}; `
  + `extra sliders: ${sliderKeys.filter(k => !weightKeys.includes(k)).join(',') || 'none'}`);

// The two copy strings that state the count in words -- this is what actually
// went stale (the slider was added; the sentence describing it was not).
const NUMBER_WORDS = { five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function wordCountIn(text, label) {
  const m = text.match(/weighted sum of (?:the )?(\w+) (?:adjuster )?(?:terms|things)/);
  ck(label + ': states a recognized number word', !!m && NUMBER_WORDS[m[1]] !== undefined, m && m[1]);
  return m ? NUMBER_WORDS[m[1]] : null;
}
const ejsCount = wordCountIn(ejs, 'warroom.ejs Adjusters card copy');
const appCount = wordCountIn(app, 'app.js recommendations explainer copy');
ck('warroom.ejs copy names the ACTUAL slider count, not a stale one',
  ejsCount === sliderKeys.length, `copy says ${ejsCount}, panel renders ${sliderKeys.length}`);
ck('app.js copy names the ACTUAL slider count, not a stale one',
  appCount === sliderKeys.length, `copy says ${appCount}, panel renders ${sliderKeys.length}`);

// FAIL ARM: prove this actually catches the register-229 shape of bug --
// eight sliders, copy still claiming seven -- rather than trivially passing
// because both sides happen to agree today.
{
  const staleEjs = ejs.replace('weighted sum of eight things', 'weighted sum of seven things');
  const staleCount = wordCountInSilent(staleEjs);
  ck('FAIL ARM: a copy string reverted to "seven" while eight sliders render is CAUGHT',
    staleCount !== sliderKeys.length, `would have compared ${staleCount} against ${sliderKeys.length}`);
}
function wordCountInSilent(text) {
  const m = text.match(/weighted sum of (?:the )?(\w+) (?:adjuster )?(?:terms|things)/);
  return m ? NUMBER_WORDS[m[1]] : null;
}

console.log(`\n${pass}/${pass + fail} adjuster-slider-count checks passed`);
process.exit(fail ? 1 : 0);
