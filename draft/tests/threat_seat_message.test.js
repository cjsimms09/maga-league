/* THE THREAT PANEL'S THIRD STATE — and the borrowed identifier that nearly shipped.
 *
 * THE FALSE CLAIM. Every seat on the threat panel read "no draft history on
 * Sleeper — modelled as league average". There are 468 picks across three drafts,
 * profiled for all ten managers, in the same artifact, rendered in Know Your
 * League three inches up the same page. The history is not missing. What is
 * missing is the SEAT->MANAGER MAPPING, which exists only once Sleeper assigns
 * the draft order and importDraftOrder resolves it by uid.
 *
 * That distinction is the whole reason every seat shows the same position mix:
 * positionProbabilities reads `team.profile`, profileForSlot returns null until
 * the mapping lands, so every seat gets CFG defaults BY CONSTRUCTION. "No
 * history" invites the conclusion that the dossier is worthless. "Seat not
 * assigned yet" is what is true, and says when it changes.
 *
 * AND THE MESSAGE MUST NOT OVERCLAIM IN THE OTHER DIRECTION. The first draft of
 * it said the seat was "modelled as the room". That is true of the NAMES on this
 * panel (withinPositionProbability is room-aware) and false of the POSITION MIX
 * directly above them (positionProbabilities reads only `profile`). The text now
 * names the position mix specifically, which is the number Cory was looking at.
 *
 * THE BUG THIS FILE EXISTS FOR. The first version read `unassigned` — a const
 * declared in renderThreatStrip, a DIFFERENT function. That is a ReferenceError
 * at render time: it would have taken the entire threat panel down, on the clock,
 * to fix a wording problem. `node --check` passes it; every module test passes it;
 * only running the page catches it.
 *
 * SOURCE INSPECTION, AND ITS LIMIT (rule 11e). app.js is a browser IIFE with no
 * exports, so this checks that the identifiers the branch uses are DECLARED in
 * the function that uses them. It cannot prove the branch renders, or that the
 * text is reached. The browser rehearsal (draft/tests/rehearsal-mock3.js) is the
 * only thing that can, and it needs a dev server and credentials.
 *
 * Run: node draft/tests/threat_seat_message.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + d : ''))); };

const SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'app.js'), 'utf8');

/** The body of a top-level `function NAME() { ... }`, by brace matching.
 *  Regex cannot do this: the body contains braces, template literals and
 *  nested functions, and a lazy match stops at the first `}` in a comment. */
function bodyOf(name) {
  const at = SRC.indexOf('\n  function ' + name + '(');
  if (at === -1) return null;
  const open = SRC.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (!depth) return SRC.slice(open, i + 1); }
  }
  return null;
}

const threats = bodyOf('renderThreats');
const strip = bodyOf('renderThreatStrip');

ck('renderThreats and renderThreatStrip are both found', !!threats && !!strip,
  'brace matcher failed — the rest of this file proves nothing');

if (threats && strip) {
  // ── THE THIRD STATE IS ON THE PAGE ────────────────────────────────────────
  ck('the seat-not-assigned message exists', /seat not assigned by Sleeper yet/.test(threats));
  ck('  and it names the POSITION MIX, not the panel in general',
    /position mix above is[\s\S]{0,40}league-average/.test(threats),
    'the names on this panel ARE room-modelled; only the mix is league-average');
  ck('  and it says what changes it', /draft order names who sits here/.test(threats));

  // ── WITHOUT LOSING THE GENUINE NO-HISTORY CASE ────────────────────────────
  ck('a manager who really has no history still reads that way',
    /no draft history on Sleeper/.test(threats));
  ck('  the two are distinct branches, not one message',
    threats.indexOf('seat not assigned by Sleeper yet')
      !== threats.indexOf('no draft history on Sleeper'));
  ck('  and the new branch is gated on the dossier EXISTING',
    /haveDossier/.test(threats),
    'without this an empty artifact would claim a dossier it does not have');

  // ── THE BORROWED IDENTIFIER ───────────────────────────────────────────────
  /* COMMENTS STRIPPED FIRST, and the first version of this check did not.
   * The comment above the fix says "read that function's `unassigned` const",
   * so scanning the raw body found the word and failed on prose — rule 11e
   * catching this file rather than the file it guards. Line count is preserved
   * so any citation still points at the real line. */
  /* STRING LITERALS GO TOO, and that was the SECOND false positive. This panel
   * renders the words "· seats unassigned" to the screen, so scanning for the
   * identifier `unassigned` found the display text and failed on it. A guard
   * that cannot tell an identifier from the word inside a quoted string is not
   * checking scope, it is checking vocabulary. */
  const code = threats
    .replace(/\/\*[\s\S]*?\*\//g, m => '\n'.repeat((m.match(/\n/g) || []).length))
    .replace(/^(.*?)\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');

  // The exact bug: used here, declared only over there.
  ['seatsUnassigned', 'haveDossier'].forEach(id => {
    const used = new RegExp('\\b' + id + '\\b').test(code);
    const declared = new RegExp('(?:const|let|var)\\s+' + id + '\\b').test(code);
    ck('`' + id + '` is declared in the function that uses it', used && declared,
      'referenced in renderThreats but declared elsewhere — ReferenceError on the clock');
  });
  ck('renderThreats does not borrow renderThreatStrip\'s `unassigned`',
    !/\bunassigned\b/.test(code) || /(?:const|let|var)\s+unassigned\b/.test(code),
    'this is the bug verbatim: `unassigned` lives in renderThreatStrip');
  ck('  (and renderThreatStrip still has its own)',
    /(?:const|let|var)\s+unassigned\b/.test(strip));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
