'use strict';
/* THE INJURY VOCABULARY IS SLEEPER'S, NOT OURS.
 *
 * The onesie handcuff exception ("your starter is flagged X, so this is
 * insurance, not a duplicate") gates on a SERIOUS-status regex in engine.js. It
 * listed `suspended` — but Sleeper writes `Sus`, so a suspended starter never
 * qualified and his backup stayed priced as a plain duplicate (Cory, war-room
 * audit). Auditing the live board found two more the pattern never covered: `NA`
 * (not active / not with the team) and `DNR` (did not report), 11 players
 * between them.
 *
 * That is a whole CLASS of bug — our guess at another system's vocabulary drifting
 * from what it actually emits — so this suite checks the regex against the
 * statuses ON THE REAL BOARD rather than against a list we wrote from memory. If
 * Sleeper introduces a status we do not classify, this fails and names it.
 *
 * Run: node draft/tests/injury_vocab.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const ENGINE = path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js');
const src = fs.readFileSync(ENGINE, 'utf8');

// Pull the live pattern out of the source so the test can never drift from it.
const m = src.match(/const SERIOUS = (\/\^\([^)]*\)\$\/i);/);
ck('the SERIOUS pattern is findable in engine.js', !!m);
if (!m) { console.log('\n' + pass + '/' + (pass + fail) + ' checks'); process.exit(1); }
// eslint-disable-next-line no-eval
const SERIOUS = eval(m[1]);

// Statuses that must count as threatening availability.
const MUST_MATCH = ['Out', 'Doubtful', 'IR', 'Injured Reserve', 'PUP', 'NFI',
                    'Sus', 'Suspended', 'NA', 'DNR', 'COV'];
MUST_MATCH.forEach(v => ck('SERIOUS matches "' + v + '"', SERIOUS.test(v.trim())));

// Questionable is deliberately excluded: in August a large share of the league
// carries it, and an exception that fires for everybody is not an exception.
['Questionable', 'Healthy', 'Active', 'Probable'].forEach(v =>
  ck('SERIOUS does NOT match "' + v + '"', !SERIOUS.test(v.trim())));

// THE DRIFT GUARD: every status actually present on the live board must be
// consciously classified — either serious or explicitly known-benign. A value we
// have never seen fails here, named, instead of silently mispricing a handcuff.
const ART = path.join(__dirname, '..', '..', 'public', 'draft_data.json');
if (fs.existsSync(ART)) {
  const players = JSON.parse(fs.readFileSync(ART, 'utf8')).players || [];
  const seen = {};
  players.forEach(p => { if (p.injury_status) seen[String(p.injury_status).trim()] = 1; });
  const KNOWN_BENIGN = ['Questionable', 'Probable', 'Healthy', 'Active'];
  const unclassified = Object.keys(seen)
    .filter(s => !SERIOUS.test(s) && KNOWN_BENIGN.indexOf(s) === -1);
  ck('every injury_status on the live board is classified',
     unclassified.length === 0,
     'unclassified: ' + JSON.stringify(unclassified)
     + ' — decide whether each threatens availability, then add it to SERIOUS or to KNOWN_BENIGN');
  console.log('     (board vocabulary: ' + JSON.stringify(Object.keys(seen)) + ')');
}

console.log('\n' + pass + '/' + (pass + fail) + ' injury-vocabulary checks passed');
process.exit(fail ? 1 : 0);
