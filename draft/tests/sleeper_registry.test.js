/* EVERY SLEEPER SETTING IS CLASSIFIED — a new one cannot be silently ignored.
 *
 * THE FAILURE THIS PREVENTS. `waiver_type` sat in the response, unread, while the
 * waiver system was held by memory — and the memory was wrong. The import takes
 * what it was written to take, so a field the producer emits and nobody named is
 * invisible by construction. That is the same class as code written against a
 * field name its author believed in, pointed the other way.
 *
 * So the registry is exhaustive over what Sleeper actually emits, and this fails
 * when the two diverge in EITHER direction:
 *   · Sleeper emits a key the registry does not classify  -> classify it
 *   · the registry classifies a key Sleeper no longer emits -> it is stale
 *
 * `ignored` REQUIRES A REASON, because "ignored" with no reason is
 * indistinguishable from "nobody looked".
 *
 * Run: node draft/tests/sleeper_registry.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const REG = path.join(ROOT, 'draft', 'config', 'sleeper_settings_registry.json');
const DUMP = path.join(ROOT, 'draft', 'data', 'sleeper_league_settings.json');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const reg = JSON.parse(fs.readFileSync(REG, 'utf8'));
ck('the registry exists and declares dispositions', !!reg.settings && !!reg._dispositions);

if (!fs.existsSync(DUMP)) {
  // NOT a silent skip. The dump is produced by the sleeper-league-probe workflow;
  // without it this suite cannot check the registry against reality and says so.
  console.log('FAIL  no settings dump at ' + DUMP + ' — run the sleeper-league-probe workflow');
  console.log('\n' + pass + ' passed, ' + (fail + 1) + ' failed');
  process.exit(1);
}
const live = JSON.parse(fs.readFileSync(DUMP, 'utf8')).settings || {};

const liveKeys = Object.keys(live).sort();
const regKeys = Object.keys(reg.settings).sort();
const unclassified = liveKeys.filter(k => !reg.settings[k]);
const stale = regKeys.filter(k => !(k in live));

ck('every setting Sleeper emits is classified', unclassified.length === 0, unclassified);
ck('the registry carries no key Sleeper has stopped emitting', stale.length === 0, stale);

const VALID = Object.keys(reg._dispositions);
const badDisp = regKeys.filter(k => VALID.indexOf(reg.settings[k].disposition) < 0);
ck('every disposition is one of the declared values', badDisp.length === 0, badDisp);

const noReason = regKeys.filter(k => !String(reg.settings[k].why || '').trim()
  || reg.settings[k].why === 'UNREVIEWED');
ck('no setting is dismissed without a reason', noReason.length === 0, noReason);

/* THE HAND-HELD LIST IS PART OF THE SAME CLAIM. Saying "Sleeper is the source"
 * is only honest alongside an explicit list of what it is NOT the source for. */
const hh = reg._hand_held || {};
const hhKeys = Object.keys(hh).filter(k => k !== '_what');
ck('the hand-held list is present and non-empty', hhKeys.length > 0);
ck('  every hand-held entry carries a reason',
  hhKeys.every(k => String(hh[k]).trim().length > 20), hhKeys.filter(k => String(hh[k]).trim().length <= 20));
ck('  the draft position is on it — the one deliberate exception',
  Object.prototype.hasOwnProperty.call(hh, 'my_draft_position'));
ck('  and the pre-2023 gap is recorded, since Sleeper stops at 2023',
  Object.prototype.hasOwnProperty.call(hh, 'pre_2023_career_records'));

const should = regKeys.filter(k => reg.settings[k].disposition === 'should_import');
console.log('\n  should_import (' + should.length + '): ' + should.join(', '));
console.log('  ignored: ' + regKeys.filter(k => reg.settings[k].disposition === 'ignored').length
  + '   imported: ' + regKeys.filter(k => reg.settings[k].disposition === 'imported').length);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
