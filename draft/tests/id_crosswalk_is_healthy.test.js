// TERRITORY: A
/* THE BOARD MUST SAY WHICH CROSSWALK BUILT IT, AND IT MUST NOT BE THE FALLBACK.
 *
 * E, 2026-08-21 (register 233): *"`build.py` SWALLOWS THE EXACT FAILURE AND
 * KEEPS BUILDING."* Correct, and verified at the source rather than taken —
 * `_id_crosswalk()` catches every exception, prints one `!` line, and builds the
 * board on Sleeper's own `gsis_id` field, which covered **221 of 761 keys** the
 * last time it stood alone. The only thing between that and a published board is
 * `_assert_opportunity_coverage`'s 60% floor, measured on the top 200 by ADP —
 * exactly the players Sleeper is LEAST likely to be missing. So the floor may
 * well not fire, and a badly degraded board can publish.
 *
 * ⚠️ AND THE HALF E DID NOT HAVE, FOUND WHILE ACTING ON THE ROW: the docstring
 * of the very function doing the swallowing said, verbatim, *"The source that
 * answered is recorded in `ID_CROSSWALK_SOURCE` so a degraded run is legible in
 * the artifact instead of only in the log."* **It was recorded in a module
 * global and a print statement. Nothing wrote it to the artifact.** A degraded
 * run was legible only in the log of a scheduled job nobody reads, which is the
 * same as not legible — so nobody could have detected the swallow after the
 * fact, only while watching it happen. The field is written now; this reads it.
 *
 * ── WHY A GUARD AND NOT A RAISE, AND THIS IS A DELIBERATE CHOICE ────────────
 *
 * Making `build.py` refuse on a crosswalk failure trades a degraded board for
 * NO board. Tonight (2026-08-21, 23:00 UTC) is the post-keeper-lock rebuild and
 * it is the last board Cory drafts from; a transient network failure at that
 * moment would leave him with yesterday's board and no warning either way.
 * A test cannot block the rebuild. A raise can. So the swallow stays and this
 * goes red on the published artifact instead — which is strictly more
 * information than we had this morning, at zero risk to tonight.
 *
 * Revisit after 2026-08-22: with the draft behind us, the raise is the better
 * shape and this file becomes its regression test rather than its substitute.
 *
 * ── RULE 3e: THIS PROBE HAS RETURNED A POSITIVE, IN ALL THREE STATES ────────
 *
 * On the board shipped the day this was written the field did not exist yet, so
 * it SKIPPED — and a file that has only ever skipped is indistinguishable from
 * one that cannot fail. Driven against synthesised boards via `BOARD_JSON`:
 *
 *     provenance.id_crosswalk = "dynastyprocess"   ->  6 passed, 0 failed
 *     provenance.id_crosswalk = "UNAVAILABLE — …"  ->  5 passed, 1 FAILED
 *     provenance.id_crosswalk = "unset"            ->  5 passed, 1 FAILED
 *
 * and the two failures are the two different checks, not one check firing
 * twice — the degraded string trips the fallback detector, the sentinel trips
 * the never-ran detector. Re-run those three any time this file is edited.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

/* ⚠️ THE PATH IS OVERRIDABLE FOR ONE REASON: RULE 3e. On the board shipped when
 * this was written the field did not exist yet, so the file SKIPPED — and a
 * probe that has only ever skipped has not been tested, only run. `BOARD_JSON`
 * lets the checks be driven against a board that carries the field, in both the
 * healthy and the degraded state, which is the only way to know they fire at
 * all. Not a production knob; nothing sets it but the control below. */
const BOARD_PATH = process.env.BOARD_JSON || path.join(ROOT, 'public', 'draft_data.json');
const BOARD = JSON.parse(fs.readFileSync(BOARD_PATH, 'utf8'));
const prov = BOARD.provenance || {};

/* The board on disk may predate the field by one rebuild. That is a REAL state
 * and it is reported as a skip-with-a-reason rather than a pass or a fail — a
 * missing field must never read as a healthy crosswalk, and must not red the
 * build for a board built before the field existed. */
const src = prov.id_crosswalk;
if (src === undefined) {
  console.log('SKIP  the board predates provenance.id_crosswalk (built '
    + (BOARD.built_at || '?') + '). Not a pass: the next rebuild writes it, and '
    + 'this file starts checking then.');
  console.log('\n0 passed, 0 failed (skipped)');
  process.exit(0);
}

ck('the board records WHICH crosswalk answered — without this a degraded run is '
  + 'legible only in a scheduled job\'s log, which is the same as not legible',
  typeof src === 'string' && src.length > 0, { id_crosswalk: src });

ck('and it is not the "unset" sentinel — that would mean _id_crosswalk() never '
  + 'ran at all, a different and worse failure than falling back',
  src !== 'unset', { id_crosswalk: src });

/* THE ONE THAT MATTERS. `_id_crosswalk` writes "UNAVAILABLE — <Error>: <msg>"
 * into this field on the swallow path, so this is the exact string the fallback
 * produces — not a guess at what a failure might look like. */
ck('THE CROSSWALK WAS NOT UNAVAILABLE — on the fallback path the board is built '
  + 'on Sleeper\'s own gsis_id alone (221 of 761 keys the last time it stood '
  + 'there), and it publishes anyway because the 60% opportunity floor is '
  + 'measured on the top 200 by ADP, who are exactly the players Sleeper covers',
  !/^UNAVAILABLE/.test(src), { id_crosswalk: src });

/* ── CONTROL (rule 3f) ────────────────────────────────────────────────────── */
/* The check above passes on a healthy board, which is also what a check reading
 * the wrong field does. Assert the detector rejects the real degraded string
 * — taken from build.py's own format string, not invented. */
{
  const degraded = 'UNAVAILABLE — AttributeError: module \'nfl_data_py\' has no '
    + 'attribute \'import_ids\'';
  ck('CONTROL (rule 3f) — the detector REJECTS the exact string build.py writes '
    + 'on the swallow path. A guard that cannot recognise the failure it exists '
    + 'for is decoration',
    /^UNAVAILABLE/.test(degraded));
  ck('CONTROL (rule 3f) — and ACCEPTS a real source name, so it discriminates '
    + 'rather than rejecting everything',
    !/^UNAVAILABLE/.test('dynastyprocess'));
}

/* ── THE DOCSTRING MUST NOT RE-ACQUIRE THE FALSE CLAIM ────────────────────── */
const BUILD = fs.readFileSync(path.join(ROOT, 'draft', 'build.py'), 'utf8');
ck('build.py actually writes the field into provenance — the docstring claimed '
  + 'this for an unknown length of time while only a module global was set, and '
  + 'a comment is not a mechanism',
  /"id_crosswalk":\s*ID_CROSSWALK_SOURCE/.test(BUILD), {});

console.log('\ncrosswalk source on the shipped board: ' + src);
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
