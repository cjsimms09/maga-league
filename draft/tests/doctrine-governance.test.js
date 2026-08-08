/* THE DOCTRINE MUST NOT CLAIM TO GOVERN WHAT IT DOES NOT TOUCH.
 *
 * Audited 2026-08-08: the enrolled doctrine never reached the engine. Its only
 * consumer added a badge to an already-generated path, and recommendations were
 * byte-identical whether enrolled or not.
 *
 * A plan line reading "plan intact" while nothing executes the plan is the same
 * failure as an uninstalled term wearing a badge — a truthful-looking label on
 * a computation it did not touch. This suite ties the LABEL to the FACT so they
 * cannot drift apart in either direction:
 *
 *   - if GOVERNS is false, the surface must SAY display-only;
 *   - if someone flips GOVERNS to true, the engine must ACTUALLY be wired,
 *     which the last check verifies by source inspection rather than by trust.
 *
 * Run: node draft/tests/doctrine-governance.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DOC = require('../../public/js/draft/doctrine.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

const engineSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'), 'utf8');
const engineKnowsDoctrine = /doctrine/i.test(engineSrc);

// --- the label matches the fact, both directions ----------------------------
{
  const before = DOC.governs();

  DOC.setGoverns(false);
  check('while display-only, the enrolled line SAYS display-only',
    /DISPLAY-ONLY/.test(DOC.governanceLine(true)), DOC.governanceLine(true));
  check('...and says it is not driving recommendations',
    /not driving/i.test(DOC.governanceLine(true)));

  DOC.setGoverns(true);
  check('once governing, the line claims the tilt instead',
    /tilting/i.test(DOC.governanceLine(true))
    && !/DISPLAY-ONLY/.test(DOC.governanceLine(true)), DOC.governanceLine(true));

  DOC.setGoverns(before);
  check('an unenrolled seat is described as the control, either way',
    /control/i.test(DOC.governanceLine(false)));
}

// --- THE ANTI-DRIFT CHECK ---------------------------------------------------
// The dangerous edit is flipping GOVERNS to true as a display change, without
// wiring anything — which would restore exactly the state the audit found while
// LOOKING like it had been fixed.
{
  check('GOVERNS is only true if the engine actually references the doctrine',
    !DOC.governs() || engineKnowsDoctrine,
    'GOVERNS=true but engine.js contains no doctrine reference — the flag was '
      + 'flipped without wiring, which is the audited bug wearing a fix\'s clothes');

  // And the mirror: if the engine IS wired, leaving GOVERNS false understates
  // the tool and makes the banner lie in the other direction.
  check('if the engine references the doctrine, GOVERNS must not still say no',
    !engineKnowsDoctrine || DOC.governs(),
    'engine.js references the doctrine but GOVERNS is false — the surface is '
      + 'now understating what the model does');
}

// --- the current, audited state, asserted explicitly ------------------------
{
  check('CURRENT STATE (2026-08-08): the doctrine is display-only',
    DOC.governs() === false && engineKnowsDoctrine === false,
    'governs=' + DOC.governs() + ' engineKnowsDoctrine=' + engineKnowsDoctrine
      + ' — if Stage 3 has landed, update this check WITH the wiring, not before');
}

console.log(`\n${pass}/${pass + fail} doctrine-governance checks passed`);
process.exit(fail ? 1 : 0);
