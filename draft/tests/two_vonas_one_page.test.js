// TERRITORY: A
/* THERE ARE TWO DIFFERENT VONA NUMBERS ON THE WAR ROOM AND ONLY ONE FOLLOWS
 * THE SOURCE TOGGLE. This file exists so nobody has to rediscover that.
 *
 * E's audit, 2026-08-21, verbatim: "all VONA is coming from draft shark and
 * doesn't change with changing source." That is TRUE of one of them and FALSE
 * of the other, which is exactly why it was worth a guard — I had measured the
 * engine's VONA moving across all eight sources hours earlier and guarded it
 * (source_toggle_moves_vona.test.js, 20/20), so on the face of it we
 * contradicted each other. We did not. We were looking at different numbers.
 *
 *   THE BIG BOARD / THE PICK VONA — engine.js `vona()`, computed live from
 *   `context()`, which passes `sourceAdjustedBoard()`. It FOLLOWS the toggle:
 *   median |shift| 3.0 to 19.0 across the top 200 depending on source, with
 *   2-17 sign flips each. Guarded by source_toggle_moves_vona.test.js.
 *
 *   THE BY-POSITION PANEL VONA — precomputed into public/position_boards.json
 *   by draft/tools/position_boards.js, from Draft Sharks' bestNow/bestNext.
 *   That tool's own comment states it: "Ranking, VONA, cliff and surplus above
 *   are unaffected: they stay computed from `ds`, only these three fields
 *   switch under the view's toggle." It does NOT follow the toggle and cannot,
 *   because it is a one-shot pre-draft simulation, not a live computation.
 *
 * BOTH ARE CORRECT NUMBERS. The defect was that the panel's own disclosure
 * said "only the projection NUMBER above changes" — and VONA is not the
 * projection number, so the sentence pointed the wrong way about the very
 * figure printed largest in the column header. Fixed by marking the chip `DS`
 * at the point of reading and naming VONA in the note.
 *
 * WHAT THIS PINS is the honesty, not the architecture: if the by-position VONA
 * is ever made live, delete this file in that commit. Until then, a frozen
 * number sitting under a toggle must say it is frozen.
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

const VIEW = fs.readFileSync(path.join(ROOT, 'public/js/draft/position_boards_view.js'), 'utf8');
const TOOL = fs.readFileSync(path.join(ROOT, 'draft/tools/position_boards.js'), 'utf8');
const PB = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/position_boards.json'), 'utf8'));

/* ── 1. THE PREMISE IS STILL TRUE: the panel's VONA really is DS-derived ──── */
ck('CONTROL: position_boards.json still declares Draft Sharks as what selects '
  + 'and ranks it — if this changes, the whole file needs re-reading',
/Draft Sharks/.test(String(PB._sources || '') + String(PB._blend_toggle_caveat || '')),
{ sources: PB._sources });

ck('the TOOL still computes VONA from the Draft Sharks fields, which is the '
  + 'fact the disclosure below has to match',
/VONA[\s\S]{0,400}?stay computed from `ds`/.test(TOOL)
  || /VONA:\s*vona/.test(TOOL),
'position_boards.js VONA assignment');

/* A VONA actually reaches the artifact — otherwise the panel prints nothing
 * and every check below is about an invisible number. */
const picks = PB.picks || [];
const withVona = picks.filter(r => r.positions
  && Object.keys(r.positions).some(q => r.positions[q] && r.positions[q].VONA != null));
ck('CONTROL: the artifact actually carries VONA figures, so this is guarding '
  + 'something a reader can see',
withVona.length >= 1, { picks_with_vona: withVona.length, of: picks.length });

/* ── 2. THE DISCLOSURE, AT THE POINT OF READING ──────────────────────────── */
ck('the VONA chip itself is marked as Draft Sharks — a note further down the '
  + 'panel is not where someone reading a number looks',
/pb-vona-src/.test(VIEW) && /VONA <b>[\s\S]{0,80}pb-vona-src/.test(VIEW),
'pb-vona-src marker on the VONA chip');

ck('and its hover says plainly that it does NOT follow the Ranking Source '
  + 'toggle, naming the Big Board VONA as the one that does',
/does NOT follow the Ranking Source toggle/i.test(VIEW)
  && /Big Board VONA does follow/i.test(VIEW),
'chip title text');

/* ── 3. THE NOTE MUST NAME VONA, NOT JUST "SELECTION AND ORDER" ──────────── */
const note = (VIEW.match(/function projSourceNote\(\)[\s\S]{0,1200}?\n  \}/) || [''])[0];
ck('CONTROL: the panel still HAS a source note to check — if it were deleted '
  + 'the assertion below would pass vacuously on an empty string',
note.length > 100, { note_len: note.length });

ck('THE FIX: the note names VONA explicitly. It used to say "only the '
  + 'projection NUMBER above changes", which is true of the projection and '
  + 'false of the VONA printed beside it — the exact sentence that made E\'s '
  + 'finding possible',
/VONA/.test(note),
{ mentions_vona: /VONA/.test(note),
  still_claims_only_projection: /only the[\s\S]{0,40}projection NUMBER above changes/.test(note) });

ck('and it does NOT still carry the old "only the projection NUMBER above '
  + 'changes" phrasing, which would contradict the line above it',
!/only the[\s\S]{0,40}projection NUMBER above changes/.test(note));

/* ── 4. THE OTHER VONA IS STILL LIVE — the half E's claim does not cover.
 *      Asserted by pointing at the suite that measures it, so the two files
 *      cannot drift into disagreeing about which number does what. ───────── */
const SIB = path.join(ROOT, 'draft/tests/source_toggle_moves_vona.test.js');
ck('the sibling guard that proves the BIG BOARD VONA does follow the toggle '
  + 'still exists — without it this file could be read as "VONA is frozen", '
  + 'which is the misreading it was written to prevent',
fs.existsSync(SIB), SIB);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
