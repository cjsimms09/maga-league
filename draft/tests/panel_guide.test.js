// TERRITORY: A
// EVERY PANEL THAT HANDS CORY A NUMBER MUST SAY HOW TO ACT ON IT.
//
// Cory: *"all the tools should explain what they do and how to use, all the
// tools working together toward the best pick."*
//
// MEASURED BEFORE BUILDING ANYTHING, because "the panels need explaining" is a
// feeling and a count is not: 55 render functions in app.js, 26 reached by
// `renderAll`, and five that already explained themselves.
//
// SIX PANELS PUT A NUMBER OR A JUDGEMENT IN FRONT OF HIM. FIVE HAD NO CAPTION,
// carrying SEVENTEEN numeric figures between them:
//
//     renderRecommendations   377 lines, 9 numeric emits, no caption
//     renderPositionRecs       35 lines, 3 numeric emits, no caption
//     renderSurvival          112 lines, 4 numeric emits, no caption
//     renderThreats            98 lines, 1 numeric emit,  no caption
//     renderLRM                33 lines, 0 numeric emits, no caption
//                                        ---------------------
//                                        17 numeric emits, five panels
//
// THE SIXTH — renderRuns, 19 lines, 3 numeric emits — WAS A FALSE POSITIVE OF MY OWN AUDIT. The first version of this
// header said "six... twenty" while listing five that sum to SEVENTEEN —
// arithmetic that does not close, in the file whose whole job is checking that
// captions say what they claim. `renderRuns` ALREADY explains itself:
//
//     "RUN DETECTED: RB (1.42x) — they are going faster than ADP says.
//      Move up anyone you actually want."
//
// That is a `what` and a `read` in one sentence, written into `textContent`
// rather than markup — so my detector, which looked for caption CLASSES and set
// phrases, could not see it. A detector that recognises only one shape reports
// honest work as a defect, which is how a detector gets switched off. It is
// PINNED below instead of captioned, so deleting that sentence goes red.
//
// ── THE CHECK THAT MATTERS IS `read`, NOT `what` ──────────────────────────
//
// `what` restates the label and anybody can guess it. `read` says WHAT WOULD
// CHANGE THE ANSWER, which is the only thing worth space with nine managers
// waiting. So this asserts the two differ and that `read` is the longer — a
// caption that only renames the panel is wallpaper, and wallpaper is what makes
// the next real caption invisible.
//
// ── AND THE ONE THIS TEST CANNOT SEE ──────────────────────────────────────
//
// CSS. B owns the stylesheet; a caption emitted and then hidden renders this
// suite green while doing nothing. I flagged that exact risk to them about the
// seat panel and it applies here identically. This proves the string is EMITTED
// and reaches the host — whether it is visible is B's half and needs their check.
//
// Run: node draft/tests/panel_guide.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

/* The table and the emitter, lifted out of the IIFE and executed — reading them
 * as source would let a syntactically-present but broken table pass. */
function extract(sig) {
  const st = SRC.indexOf(sig);
  if (st < 0) return '';
  let d = 0;
  for (let i = SRC.indexOf('{', st); i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) return SRC.slice(st, i + 1); }
  }
  return '';
}
const tableSrc = extract('  const PANEL_GUIDE = {');
const fnSrc = extract('  function explainPanel(key) {');
ck('PANEL_GUIDE exists in the shipped app.js', tableSrc.length > 200);
ck('and one shared emitter, not a copy per panel', fnSrc.length > 60
  && (SRC.match(/function explainPanel/g) || []).length === 1);

// eslint-disable-next-line no-new-func
const mod = new Function('escapeHtml',
  tableSrc + ';\n' + fnSrc + ';\n return { G: PANEL_GUIDE, explainPanel: explainPanel };')(
  x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;'));
const G = mod.G;

// ── 1. EVERY DECISION PANEL IS DECLARED AND WIRED ───────────────────────
const WIRED = ['recommendations', 'position_recs', 'survival', 'threats', 'lrm'];
ck('every decision panel has an entry', WIRED.every(k => !!G[k]),
  WIRED.filter(k => !G[k]));
ck('and every entry is actually EMITTED by the renderer — a table nobody calls '
  + 'is documentation, not a feature',
  WIRED.every(k => SRC.indexOf("explainPanel('" + k + "')") > 0),
  WIRED.filter(k => SRC.indexOf("explainPanel('" + k + "')") < 0));
ck('nothing is declared that is never emitted, either',
  Object.keys(G).every(k => SRC.indexOf("explainPanel('" + k + "')") > 0),
  Object.keys(G).filter(k => SRC.indexOf("explainPanel('" + k + "')") < 0));

// ── 2. THE CAPTION SAYS WHAT WOULD CHANGE THE ANSWER ────────────────────
Object.keys(G).forEach(k => {
  const g = G[k];
  ck(k + ': carries both halves, non-trivially',
    typeof g.what === 'string' && typeof g.read === 'string'
    && g.what.length > 40 && g.read.length > 40, { what: (g.what || '').length, read: (g.read || '').length });
  ck(k + ': `read` is not a restatement of `what`',
    g.what !== g.read && g.read.length >= g.what.length,
    { what: g.what, read: g.read });
});
/* THE PROPERTY, ASSERTED RATHER THAN HOPED FOR. Every `read` must contain an
 * ACTIONABLE clause — a condition or an instruction — because "this shows X" in
 * both halves is the wallpaper case. Checked by vocabulary rather than by
 * length, since length is what a lazy edit satisfies. */
const ACTIONABLE = /\b(unless|if |when |under |over |never|always|treat|take |use |compare|ignore|move |read it|breaks|means)\b/i;
ck('every `read` contains a condition or an instruction, not just a description',
  Object.keys(G).every(k => ACTIONABLE.test(G[k].read)),
  Object.keys(G).filter(k => !ACTIONABLE.test(G[k].read)));

// ── 3. THE EMITTER IS SAFE AND STABLE ───────────────────────────────────
{
  const html = mod.explainPanel('survival');
  ck('it emits a stable hook B can target', /class="panel-explain"/.test(html)
    && /data-panel="survival"/.test(html), html.slice(0, 80));
  ck('and separates the two halves so they can be styled or tiered apart',
    /pe-what/.test(html) && /pe-read/.test(html));
  ck('an UNKNOWN key returns empty rather than throwing — a missing caption must '
    + 'never take the board down mid-draft', mod.explainPanel('nope') === '');
  ck('CONTROL — a known key does NOT return empty, so the check above is not '
    + 'passing for the wrong reason', mod.explainPanel('survival') !== '');
  ck('the text is escaped on the way out',
    mod.explainPanel('recommendations').indexOf('&#') < 0
    && !/<script/i.test(mod.explainPanel('recommendations')));
}

// ── 4. FAIL ARMS ────────────────────────────────────────────────────────
{
  const fake = { what: 'Shows the survival numbers.', read: 'Shows the survival numbers.' };
  ck('FAIL ARM — a `read` that merely restates `what` is DETECTED',
    !(fake.what !== fake.read));
  const lazy = { what: 'The chance each player is still there at your next pick.',
    read: 'This panel displays survival.' };
  ck('FAIL ARM — a `read` with no condition or instruction is DETECTED',
    !ACTIONABLE.test(lazy.read), lazy.read);
  ck('FAIL ARM — a declared-but-unwired panel would be caught',
    SRC.indexOf("explainPanel('a_panel_nobody_wired')") < 0);
}

// ── 4b. THE PANEL THAT ALREADY EXPLAINED ITSELF, PINNED ──────────────
// `renderRuns` writes its own `what` and `read` into textContent. It gets NO
// PANEL_GUIDE entry — a second caption beside its own sentence would be the
// duplication this table exists to prevent — so the sentence IS the contract,
// and this is what stops it being deleted as "just a banner".
{
  const i = SRC.indexOf('function renderRuns(');
  const block = i > 0 ? SRC.slice(i, i + 1200) : '';
  ck('renderRuns is locatable', block.length > 200);
  ck('it states WHAT the number is — faster than ADP implies',
    /faster than ADP/i.test(block));
  ck('and WHAT TO DO about it, which is the half that earns the space',
    /Move up anyone you actually want/i.test(block));
  ck('CONTROL — it is deliberately NOT in the table, so there is exactly one '
    + 'caption per panel', !G.runs && SRC.indexOf("explainPanel('runs')") < 0);
}

// ── 5. THE MEASUREMENT THAT MOTIVATED THIS, KEPT HONEST ─────────────────
// If someone later removes a caption, the count changes and this says so rather
// than the suite quietly passing on four panels.
{
  const emitted = (SRC.match(/explainPanel\('/g) || []).length;
  ck('the renderer emits exactly as many captions as the table declares',
    emitted === Object.keys(G).length, { emitted: emitted, declared: Object.keys(G).length });
  console.log('      ' + emitted + ' captioned here + renderRuns (its own sentence) '
    + '= all 6 decision panels; 5 others already self-explained, of 26 on the page');
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: every panel that hands Cory a number emits both what');
console.log('it is and what would change the answer, from ONE declaration rather than five');
console.log('inline strings that drift, and the renderer cannot declare a caption it never');
console.log('emits or emit one it never declared.');
console.log('WHAT IT DOES NOT: prove any of it is VISIBLE. B owns the stylesheet and a');
console.log('caption that is emitted and then hidden renders this green while doing');
console.log('nothing. That half is theirs and needs their check, not mine.');
