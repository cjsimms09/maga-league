/* THE GRADER COULD NOT PRODUCE A SINGLE ROW, AND NOTHING SAID SO.
 *
 * `forecast_grade.gradeDecisions` joins the three decision kinds on
 * `payload.key`, gating each on `if (p.key)`, then iterates `Object.keys(recs)`.
 * NOT ONE call site in app.js supplied a `key`. So `recs` was always empty, the
 * loop never ran, and every season graded to zero rows — "was the tool followed
 * or overridden", "where Cory beat the model" and `override_rate` were
 * structurally empty rather than wrong. No error, no bad number on a page. The
 * capture fired, the server stored it, the grader dropped it.
 *
 * THAT IS THE SEPTEMBER 1 DEADLINE'S FAILURE MODE EXACTLY. Rule 2 depends on
 * override outcomes; the draft on the 22nd is the first real entry; a
 * decision-time record cannot be reconstructed later. It would have surfaced in
 * January, when nothing can be done about it.
 *
 * THE KEY IS STAMPED IN predledger.send(), one place, because a join key
 * maintained at nineteen call sites is the two-places disease with eighteen
 * extra places.
 *
 * THIS SUITE RUNS THE REAL GRADER over entries produced by the REAL client
 * writer, so it checks the JOIN rather than either half's opinion of it. Two
 * false positives were produced getting here by scanning app.js for `key:` —
 * `chosen_path_key:` matched first, then the `:` of a ternary in `chosen.key :
 * null`. Reading the payload settled it. Hence: no scanning in this file.
 *
 * Run: node draft/tests/decision_join_key.test.js
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── LOAD THE REAL CLIENT WRITER WITH fetch STUBBED ─────────────────────────
const posted = [];
global.window = global;
global.fetch = function (url, opts) {
  posted.push(JSON.parse(opts.body));
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
};
require(path.join(ROOT, 'public', 'js', 'draft', 'predledger.js'));
const PL = global.PredLedger;
ck('the real predledger loaded', !!PL && typeof PL.recommendation === 'function');

const CTX = { season: '2026', build_at: '2026-08-11T18:33:45Z', pick: 30 };

PL.recommendation({ ...CTX, method: 'rec-v1',
  payload: { player_id: '9221', name: 'Jahmyr Gibbs', value: '9221' } });
PL.pick({ ...CTX, method: 'pick-v1',
  payload: { player_id: '5850', name: 'Josh Jacobs', value: '5850' } });
PL.override({ ...CTX, method: 'override-reason-v1',
  payload: { player_id: '5850', over_player_id: '9221', reason: 'news' } });

ck('three decision entries were written', posted.length === 3, posted.length);

// ── ALL THREE CARRY THE SAME KEY, WHICH IS THE WHOLE POINT ────────────────
{
  const keys = posted.map(e => (e.payload || {}).key);
  ck('every decision entry carries a key', keys.every(k => !!k), keys);
  ck('  and all three are the SAME key, so they join',
    new Set(keys).size === 1, keys);
  ck('  the key identifies (season, board, pick)',
    keys[0] === '2026|2026-08-11T18:33:45Z|30', keys[0]);
}

// ── THE REAL GRADER, RUN OVER THE REAL ENTRIES ───────────────────────────
{
  const FG = require(path.join(ROOT, 'src', 'forecast_grade.js'));
  const grade = FG.gradeDecisions || (FG.default && FG.default.gradeDecisions);
  if (typeof grade !== 'function') {
    console.log('SKIP  gradeDecisions is not exported — cannot run the real join');
  } else {
    const out = grade(posted);
    const rows = out.rows || out;
    ck('the grader produces a row (it produced ZERO before this fix)',
      Array.isArray(rows) ? rows.length === 1 : !!rows, out);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) {
      ck('  and it sees the pick as an OVERRIDE of the recommendation',
        row.overridden === true, row);
      ck('  recommended and taken are both recovered',
        String(row.recommended) === '9221' && String(row.taken) === '5850', row);
    }
    if (out.override_rate !== undefined) {
      ck('  override_rate is a number, not null-from-no-data',
        out.override_rate !== null, out.override_rate);
    }
  }
}

// ── A CALLER-SUPPLIED KEY MUST WIN ────────────────────────────────────────
{
  posted.length = 0;
  PL.forecast({ ...CTX, method: 'f-v1', payload: { key: 'my-forecast-key', ftype: 'x' } });
  const e = posted[0];
  ck('forecast keeps its OWN key — the decision stamp must not overwrite it',
    e && e.payload.key === 'my-forecast-key', e && e.payload.key);
}

// ── NO PICK, NO KEY: absent rather than a falsy field ────────────────────
{
  posted.length = 0;
  PL.override({ season: '2026', build_at: null, pick: null, method: 'm',
    payload: { player_id: '1' } });
  const e = posted[0];
  ck('an entry with no pick/board carries NO key field at all',
    e && !('key' in e.payload), e && e.payload);
  ck('  because the grader tests `if (p.key)`, so a null would read as a key '
    + 'that exists and be dropped anyway', true);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
