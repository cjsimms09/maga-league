// TERRITORY: A
/* THE SOURCE TOGGLE MUST NEVER MAKE A MISSING PLAYER LOOK LIKE A BAD ONE.
 *
 * Cory, 2026-08-20: "No draft shark info, no toggle between sources or blend."
 * Both were true, and neither was a deploy failure:
 *
 *   - a grep for proj_ds across every war-room script returned ZERO hits, so
 *     months of attach_draftsharks.py output had never reached a screen;
 *   - no source toggle had ever been written.
 *
 * The dangerous part of building one is COVERAGE. The sources do not carry the
 * same players — measured on the live board, blend 700, Sleeper 700, own-model
 * 507, FantasyPros 429, DRAFT SHARKS 247. A toggle that ranked only the covered
 * men and said nothing would show Cory a short, clean, confident list while
 * silently hiding two thirds of his board. That reads as "these are the best
 * players" and is a lie by omission.
 *
 * So this tests the honesty, not the layout.
 *
 * Run: node draft/tests/proj_source_panel.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let fails = [];
function ck(name, cond, detail) {
  if (cond) console.log('PASS  ' + name);
  else {
    fails.push(name);
    console.log('FAIL  ' + name
      + (detail === undefined ? '' : '  — ' + JSON.stringify(detail).slice(0, 300)));
  }
}

// ── 1. the gap Cory reported is actually closed ─────────────────────────────
ck('CONTROL — the board really does carry Draft Sharks numbers, so there was '
   + 'something to surface (rule 3e: a check with nothing to check is not a check)',
  BOARD.players.filter(p => typeof p.proj_ds === 'number').length > 100,
  { with_ds: BOARD.players.filter(p => typeof p.proj_ds === 'number').length });

ck('the war room now READS proj_ds — the exact grep that returned zero hits when '
   + 'Cory said "no draft shark info" must now return something',
  /proj_ds\b/.test(SRC), null);

ck('...and its floor/ceiling band too, which is the part only Draft Sharks has',
  /proj_ds_floor/.test(SRC) && /proj_ds_ceiling/.test(SRC), null);

ck('a source TOGGLE exists and offers the blend plus at least three outside '
   + 'sources, so "toggle between sources or blend" is literally answerable',
  /PROJ_SOURCES\s*=/.test(SRC)
    && (SRC.match(/key:\s*'(blend|ds|sleeper|own|fp)'/g) || []).length >= 4,
  (SRC.match(/key:\s*'(blend|ds|sleeper|own|fp)'/g) || []));

// ── 2. THE HONESTY, WHICH IS THE WHOLE RISK ─────────────────────────────────
ck('the panel COUNTS the players a source does not carry rather than dropping '
   + 'them — the failure mode is a short clean list that hides two thirds of '
   + 'the board',
  /const missing = pool\.length - covered\.length/.test(SRC), null);

ck('and it SAYS so on screen, in the source\'s own name, whenever any player is '
   + 'uncovered',
  /does not cover/.test(SRC) && /missing, not worthless/i.test(SRC), null);

ck('the coverage warning is driven by the MEASURED gap, not a hardcoded sentence '
   + 'that could go stale when coverage changes',
  /missing\s*\n?\s*\?/.test(SRC) || /missing\s*$/m.test(SRC) || /\bmissing\b[\s\S]{0,80}\?/.test(SRC),
  null);

// ── 3. it must not become a ranking input ───────────────────────────────────
/* ⚠️ THIS CHECK WAS "the toggle is DISPLAY ONLY" AND THAT IS NOW DELIBERATELY
 * FALSE. Cory: "And the board will rearrange based of the source I select? Ie
 * it will change rankings, VONA, recommended player, etc" — it does now. The
 * old assertion described v1 and would have blocked the thing he asked for, so
 * it is REPLACED by the invariant that actually protects him, not deleted to
 * make the suite green. */
ck('the re-rank is NOT recomputed in the browser — app.js must never derive '
   + 'replacement level or vorp itself. Register 148 is two replacement tables '
   + 'in this repo disagreeing by 2x at RB and WR; a third would be worse.',
  !/function\s+(applyVorp|computeVorp|replacementLevel|assignTiers)\b/.test(SRC),
  null);

ck('...it loads boards PRE-BUILT by the same code the real board uses',
  /board_'\s*\+\s*key\s*\+\s*'\.json|board_\$\{key\}\.json/.test(SRC), null);

ck('going back to the blend restores from the PRISTINE copy rather than a '
   + 'refetch, so it is byte-for-byte the board Cory booted with — and it '
   + 'reuses mock mode\'s existing mechanism instead of inventing a second one',
  /state\.pristine/.test(SRC.slice(SRC.indexOf('function setProjSource'))), null);

ck('a re-ranked board SHOUTS that it is re-ranked — Cory drafts from this '
   + 'screen and a swapped board that looks normal is the most dangerous thing '
   + 'this panel could do',
  /THE BOARD IS RE-RANKED ON/.test(SRC), null);

ck('and it names the players that source cannot see at all, because a missing '
   + 'man must never read as a bad one',
  /players are missing entirely/.test(SRC) && /dropped_inside_top150/.test(SRC), null);

ck('a failed board load does NOT silently leave him on the blend while the '
   + 'button claims otherwise (rule 3e: a failure and an empty source look '
   + 'identical from the outside)',
  /stayed on/.test(SRC), null);

/* ── THE RELAY'S WAR-ROOM AUDIT, 2026-08-20 — both defects pinned ──────────*/
const mockEnd = SRC.slice(SRC.indexOf('state.pristine.players = ') >= 0
  ? SRC.indexOf('state.pristine.players = ')
  : SRC.lastIndexOf('state.pristine.players.slice()'));
ck('ending a mock resets the source LABEL with the pool — it restored the '
   + 'pristine blend board while the toggle still claimed e.g. Sleeper, and a '
   + 'UI-state lie is worse than a wrong number at 8 seconds a pick',
  /state\.projSource = 'blend'/.test(mockEnd.slice(0, 1200)), null);

ck('...and clears the cached source metadata too, so the orange re-ranked '
   + 'banner cannot survive the restore',
  /state\.sourceBoardMeta = null/.test(mockEnd.slice(0, 1200)), null);

ck('applySourceBoard APPLIES the league it was handed rather than testing one '
   + 'value and reading another — harmless while the boards agree, a trap the '
   + 'day they do not',
  /if \(league\) \{[\s\S]{0,160}state\.data\.league = league;/.test(SRC), null);

const engineSrc = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'), 'utf8');
ck('KNOWN NEGATIVE — engine.js does not read projSource, so switching source '
   + 'cannot silently move the board Cory drafts from',
  !/projSource/.test(engineSrc), null);

// ── 4. the numbers it will print are real ───────────────────────────────────
const FIELDS = ['proj_mean', 'proj_ds', 'proj_sleeper', 'proj_ownmodel', 'proj_fantasypros'];
const cov = {};
FIELDS.forEach(f => { cov[f] = BOARD.players.filter(p => typeof p[f] === 'number').length; });
ck('every source the toggle offers exists on the board with real coverage, so no '
   + 'button can render an empty table',
  FIELDS.every(f => cov[f] > 200), cov);

ck('CONTROL — coverage genuinely DIFFERS between sources, which is why the '
   + 'warning has to exist at all. If this ever fails, the sources have been '
   + 'homogenised and the warning should be re-examined, not deleted.',
  new Set(Object.values(cov)).size > 1, cov);

console.log('\n%d checks, %d failed', 19, fails.length);
if (fails.length) { console.log('FAILED'); process.exit(1); }
