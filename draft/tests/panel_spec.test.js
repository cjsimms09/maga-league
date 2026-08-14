// TERRITORY: A
// A SPEC THAT DRIFTS FROM THE SCREEN IS WORSE THAN NO SPEC.
//
// Cory: *"the design and way it's giving info is terrible. Super busy screen yet
// very little info and info I do have I don't know what it's telling me. B may
// need a better explanation from you about what each thing does."*
//
// He is right and it is A's failure, not B's. B owns the pixels; A owns what
// every number MEANS, and it had never been written down in one place. Nobody
// can build a hierarchy out of panels whose meaning is undocumented — so B laid
// out what they could see, which is how a screen becomes a stack of equals.
//
// `panel_spec.js` is the missing half. THIS FILE IS WHAT STOPS IT ROTTING.
//
// ── THE FAILURE MODE OF A DOCUMENT LIKE THIS ──────────────────────────────
//
// It is written once, it is accurate for a week, a panel is added or renamed,
// and thereafter it describes a screen that no longer exists — while reading
// exactly as authoritative as it did on day one. This repo has shipped that
// exact shape more than once today alone: a comment promising a pre-draft
// anchor the code had stopped honouring, a header claiming one scoring rule
// differed when two did, a caveat about thin samples that no longer applied.
//
// So the spec is checked BOTH WAYS against `renderAll`: every panel that paints
// must be described, and nothing described may have stopped painting.
//
// Run: node draft/tests/panel_spec.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const SPEC = require(path.join(ROOT, 'draft', 'tools', 'panel_spec.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

/* WHAT ACTUALLY PAINTS, read from the source rather than from a list somebody
 * maintains. A hand-kept list of panels is the thing this test exists to
 * prevent, so it must not depend on one.
 *
 * ── THE FIRST VERSION OF THIS EXTRACTION HID 29 PANELS (2026-08-14) ────────
 *
 * It read `renderAll`'s body for `/render[A-Za-z]+\(\)/` — zero-argument calls,
 * in one function. Every panel drawn as a SUB-PANEL (renderPaths, renderTiming,
 * renderBestAvailStrip and the rest are called from renderRecommendations) or
 * taking any argument at all was invisible to it. The spec described 25 panels
 * while 54 painted, and BOTH DIRECTIONS of the check below passed the whole
 * time, because the missing ones were missing from the comparison too.
 *
 * SO THE DOCUMENT WRITTEN TO CLOSE THIS EXACT GAP SHIPPED WITH THE GAP IN IT,
 * and the guard could not see it — a test whose input is narrower than its
 * claim. `renderPaths` was in the hidden set: the strategy cards Cory was
 * describing when he asked for the spec.
 *
 * Now: every `render*` function DEFINED in app.js that is also CALLED somewhere
 * in it. Definition and call are both required — a defined-but-uncalled
 * function is dead code and describing it would send B to lay out nothing. */
const painted = (function () {
  const defined = Array.from(SRC.matchAll(/^  function (render[A-Za-z]+)\(/gm)).map(m => m[1]);
  const called = new Set(Array.from(SRC.matchAll(/\b(render[A-Za-z]+)\(/g)).map(m => m[1]));
  return defined.filter(n => n !== 'renderAll' && called.has(n));
})();

ck('the panel inventory is locatable and finds a real number of panels',
  painted.length >= 40, painted.length);
ck('CONTROL — the extraction sees panels the OLD one could not, or this file is '
  + 'still asking the narrow question it asked before',
  painted.indexOf('renderPaths') >= 0 && painted.indexOf('renderTiming') >= 0
    && painted.indexOf('renderBestAvailStrip') >= 0);
ck('and it does not describe dead code — every panel found is really called',
  painted.every(n => new RegExp('[^a-zA-Z]' + n + '\\(').test(SRC)));

// ── 1. BOTH DIRECTIONS, WHICH IS THE WHOLE POINT ────────────────────────
{
  const described = SPEC.PANELS.map(p => p.fn);
  const missing = painted.filter(n => described.indexOf(n) < 0);
  ck('EVERY panel that paints is described — a panel Cory can see and B cannot '
    + 'read about is exactly the gap he reported', missing.length === 0, missing);
  const stale = described.filter(n => painted.indexOf(n) < 0);
  ck('and nothing described has stopped painting — a spec entry for a dead panel '
    + 'sends B to lay out something that is not there', stale.length === 0, stale);
  ck('no panel is described twice', described.length === new Set(described).size);
}

// ── 2. EVERY ENTRY EARNS ITS PLACE ──────────────────────────────────────
{
  const thin = SPEC.PANELS.filter(p => !p.question || !p.means
    || p.question.length < 12 || p.means.length < 25);
  ck('every panel says what QUESTION it answers and what the number MEANS, '
    + 'non-trivially', thin.length === 0, thin.map(p => p.fn));
  const noChange = SPEC.PANELS.filter(p => !p.changes_it || p.changes_it.length < 8);
  ck('and what would CHANGE it — the half that tells a reader whether to look '
    + 'again', noChange.length === 0, noChange.map(p => p.fn));
  ck('every panel carries a weight from the declared vocabulary',
    SPEC.PANELS.every(p => SPEC.ORDER.indexOf(p.weight) >= 0),
    SPEC.PANELS.filter(p => SPEC.ORDER.indexOf(p.weight) < 0).map(p => p.fn));
  ck('the question is written as a QUESTION, not a label — "Who should I take" '
    + 'orders a screen and "Recommendations" does not',
    SPEC.PANELS.filter(p => p.weight === 'DECIDES' || p.weight === 'TIMES')
      .every(p => /\?$/.test(p.question)),
    SPEC.PANELS.filter(p => (p.weight === 'DECIDES' || p.weight === 'TIMES')
      && !/\?$/.test(p.question)).map(p => p.fn));
}

// ── 3. THE WEIGHTS ARE A HIERARCHY, NOT DECORATION ──────────────────────
// If everything DECIDES then nothing does, and B is back to laying out a stack
// of equals — which is the state Cory is complaining about.
{
  const by = w => SPEC.PANELS.filter(p => p.weight === w).length;
  ck('the DECIDES tier is small enough to be a fold', by('DECIDES') <= 6, by('DECIDES'));
  ck('and it is not empty, or the page has no top', by('DECIDES') >= 2, by('DECIDES'));
  ck('most panels do NOT decide, which is the finding B should lay out from',
    by('DECIDES') < SPEC.PANELS.length / 3,
    { decides: by('DECIDES'), total: SPEC.PANELS.length });
  ck('every tier is populated, or the vocabulary is finer than the screen',
    SPEC.ORDER.every(w => by(w) > 0), SPEC.ORDER.map(w => w + ':' + by(w)));
}

// ── 4. THE CLAIMS THAT ARE CHECKABLE, CHECKED ───────────────────────────
// The spec makes factual assertions about the code. Those must be true now,
// not true when they were typed.
{
  const rec = SPEC.PANELS.find(p => p.fn === 'renderRecommendations');
  const actual = (function () {
    const i = SRC.indexOf('  function renderRecommendations(');
    if (i < 0) return 0;
    return SRC.slice(i, SRC.indexOf('\n  }', i)).split('\n').length;
  })();
  ck('the "377 lines" claim about renderRecommendations is still true',
    rec && Math.abs(rec.lines - actual) <= 25, { claimed: rec && rec.lines, actual: actual });
  ck('and it really is the biggest panel, which is what makes it A\'s problem '
    + 'rather than a layout one',
    SPEC.PANELS.filter(p => p.lines).every(p => p.lines <= rec.lines));

  const seat = SPEC.PANELS.find(p => p.fn === 'renderSeatPlan');
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));
  ck('the seat plan really does hold the whole-draft look-ahead Cory asked for',
    (plan.seats || []).length >= 6, (plan.seats || []).length);
  ck('and the spec says so, since he does not know he already has it',
    /look ahead|look-ahead/i.test(seat.note || ''), seat.note);

  const byes = SPEC.PANELS.find(p => p.fn === 'renderByes');
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const withBye = (D.players || []).filter(p => p.bye).length;
  ck('the bye panel has real data behind it now — it computed over nulls for '
    + 'weeks', withBye > 500, withBye);
  ck('and the spec records that, so nobody re-derives the history',
    /null/i.test(byes.note || ''), byes.note);
}

// ── 5. IT NAMES ITS OWN DUPLICATES ──────────────────────────────────────
// "Super busy screen yet very little info" is what duplication feels like from
// the outside. A spec that hides its own redundancy is not doing its job.
{
  const flagged = SPEC.PANELS.filter(p => /duplicat/i.test(p.note || ''));
  ck('the spec flags at least one panel as duplicating another, rather than '
    + 'presenting 26 as all load-bearing', flagged.length >= 1,
    flagged.map(p => p.fn));
  ck('and it names A\'s own biggest contribution to the mess rather than only '
    + 'B\'s', /A\'s|not layout|not B/i.test(
    SPEC.PANELS.find(p => p.fn === 'renderRecommendations').note || ''));
}

// ── 6. IT IS MACHINE-READABLE, or B has to retype it ────────────────────
{
  const { execFileSync } = require('child_process');
  const out = execFileSync('node',
    [path.join(ROOT, 'draft', 'tools', 'panel_spec.js'), '--json'],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  let parsed = null;
  try { parsed = JSON.parse(out); } catch (e) { parsed = null; }
  ck('--json emits valid JSON, so B builds from data rather than from prose',
    !!parsed && Array.isArray(parsed.panels), out.slice(0, 80));
  ck('and it carries the weight ordering, which is the field the layout hangs on',
    parsed && Array.isArray(parsed.weight_order) && parsed.weight_order[0] === 'DECIDES',
    parsed && parsed.weight_order);
}


// -- 6. THE SURVIVAL DESCRIPTION MATCHES THE PANEL, NOT THE OPPOSITE OF IT --
/* THIS ENTRY SAID "86% means he is GONE 86% of the time" AND THE PANEL SHOWS THE
 * PROBABILITY HE LASTS. Backwards, in the one sentence written to disambiguate —
 * the kind a reader trusts precisely because it looks like the clarification. B
 * builds the layout from this file, so an inverted description inverts every
 * emphasis and colour decision taken from it.
 *
 * THE CONFUSION IS REAL AND ON THE SCREEN, which is why prose alone cannot be
 * trusted here: the SAME number renders as "chance they last" in the survival
 * panel and as "~X% gone by next" on the rec card. Both are correctly labelled.
 * So this asserts the description against the SHIPPED HEADER, not against itself. */
{
  const surv = SPEC.PANELS.find(p => p.fn === 'renderSurvival');
  ck('CONTROL — the survival entry exists', !!surv, surv && surv.fn);
  ck('the panel header renders the LASTS direction',
    /Chance they last to your pick/.test(SRC));
  ck('and the bar width is the survival probability itself, not its complement',
    /surv-bar[\s\S]{0,80}Math\.round\(x\.s \* 100\)/.test(SRC));
  ck('green marks a HIGH chance of lasting, which only makes sense in that '
    + 'direction', /x\.s > 0\.6 \? 'pos'/.test(SRC));

  ck('the description now says LASTS / STILL THERE, agreeing with the header',
    /LASTS until my next turn/.test(surv.means) && /STILL THERE/.test(surv.means),
    surv.means);
  ck('FAIL ARM — the inverted sentence is gone from the DESCRIPTION',
    !/means he is GONE/.test(surv.means), surv.means);
  ck('and the inversion is recorded as a retraction rather than quietly '
    + 'rewritten, since it is the reason to distrust the next such sentence',
  /exactly backwards/.test(surv.note));
  ck('the note names the live source of the confusion — the same number shown '
    + 'both ways on one screen', /SAME\s+NUMBER/.test(surv.note.replace(/\s+/g, ' ')));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: every panel that paints on the war room has a written');
console.log('answer to "what is this telling me", nothing described has stopped painting,');
console.log('the weights form a real hierarchy rather than 26 equals, and the factual');
console.log('claims the spec makes about the code are re-checked rather than remembered.');
console.log('WHAT IT DOES NOT: make the screen good. This is the input B was missing, not');
console.log('the layout — and splitting the 377-line recommendations function is still');
console.log('A\'s to do before any arrangement of it will help.');
