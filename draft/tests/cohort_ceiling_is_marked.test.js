// TERRITORY: relay measures · B styles the mark
// A CEILING THAT IS NOT ABOUT THIS PLAYER NOW SAYS SO ON SCREEN. REGISTER 4v.
//
// The row: "32% of Cory's draft range shows a ceiling that contains no
// information about that player, and nothing on screen says so."
//
// Re-measured on the live board, ADP 25-220, skill positions only:
//   173 players · 139 (80.3%) per-player · **34 (19.7%) band-constant**
// (the row's 32% predates the 08-18 per-player volatility landing, which is
// itself the reason the share fell — the row's direction was right and its
// number has improved.)
//
// THE RATIOS ARE THE PROOF, and they are why a stamp reading
// `measured-2023-25-p90` is misleading rather than merely coarse:
//   1.4388 — Nabers, Garrett Wilson, Jayden Reed, +1
//   1.4452/1.4453 — Carnell Tate, Jordyn Tyson, Makai Lemon, +2
//   1.6081 — Kyler Murray, Malik Willis, Fernando Mendoza
// One number shared across unrelated players is a per-band constant wearing a
// measured-looking name.
//
// ⚠️ THE MARK IS NOT A WARNING, and the wording is deliberate. For several of
// these the model is refusing to guess from data it does not hold, which is a
// strength. The mark says where the number came from. It does not say the
// number is wrong.
//
// Run: node draft/tests/cohort_ceiling_is_marked.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const C = require(path.join(ROOT, 'public', 'js', 'draft', 'warroom_charts.js'));
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

/* ⚠️ THE PREDICATE IS EXTRACTED FROM THE SHIPPED CODE, NOT RE-IMPLEMENTED.
 * Added 2026-08-20. Until tonight this rule existed in FOUR places: app.js's
 * cohortCeiling(), warroom_charts.js's isCohortCeiling(), and TWICE more
 * inside this file as local copies. That is the drift trap this project keeps
 * paying for — a test that re-implements the thing it guards passes while the
 * shipped code is wrong, which is precisely what happened when Cory's Draft
 * Sharks ruling retired the `measured-*` family: the copies all agreed with
 * each other and none of them agreed with the board.
 *
 * So the test now reads app.js's own function body and runs it. If someone
 * edits the shipped predicate, this file tests the edit. The two module copies
 * remain (they are separate bundles) and `test_predicates_agree` below holds
 * them to each other. */
function shippedCohortPredicate() {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const head = 'function cohortCeiling(player) {';
  const i = src.indexOf(head);
  if (i < 0) throw new Error('app.js no longer declares cohortCeiling — this test cannot guard what it cannot find');
  const body = src.slice(i + head.length, src.indexOf('\n  }', i));
  // eslint-disable-next-line no-new-func
  const fn = new Function('player', body + '\n');
  return stamp => fn({ proj_ceiling_source: stamp });
}

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const OPTS = { min: 0, max: 400 };
const marked = C.rangeBar(100, 200, 300, Object.assign({ cohortCeiling: true }, OPTS));
const plain = C.rangeBar(100, 200, 300, Object.assign({ cohortCeiling: false }, OPTS));

// ── 1. THE MARK IS VISIBLE, NOT ONLY A TOOLTIP ─────────────────────────────
{
  /* The row's complaint is "nothing on screen says so". A title attribute does
   * not satisfy that at eight seconds a pick — nobody hovers. */
  ck('DEFECT-FIXED: a cohort ceiling renders a VISIBLE mark, not just a tooltip',
    /<sup class="wr-ceil-cohort"/.test(marked), marked.slice(-220));

  ck('...and the mark carries its own explanation for anyone who does stop',
    /band average, not a measurement of this player/.test(marked));

  ck('the title says it too, so the whole bar explains itself',
    /ceiling 300 \(cohort average, not this player\)/.test(marked));

  ck('and the screen-reader label says it, rather than reading a bare number '
    + 'as though it were measured',
  /cohort average, not this player/.test(marked)
    && /aria-label="outcome range 100 to 300 \(cohort average/.test(marked));

  ck('it is machine-readable too, so a later check can count marked bars '
    + 'without parsing prose', /data-cohort-ceiling="1"/.test(marked));
}

// ── 2. CONTROL — THE UNMARKED CASE IS GENUINELY UNMARKED ───────────────────
{
  /* Without this, a bar that marked EVERYTHING would pass every check above. */
  ck('CONTROL: a per-player ceiling gets NO mark, no class and no note',
    !/wr-ceil-cohort/.test(plain) && !/cohort-ceiling"/.test(plain)
    && !/cohort average/.test(plain), plain.slice(-200));

  ck('CONTROL: it still says data-cohort-ceiling="0" rather than omitting the '
    + 'field, so absent and false are distinguishable',
  /data-cohort-ceiling="0"/.test(plain));

  /* CONTROL: the mark is ADDITIVE — it must not move the drawing. Compared on
   * the geometry itself rather than by normalising the two strings, because a
   * normaliser complicated enough to make them match is a normaliser that can
   * hide the very difference it is meant to catch. */
  const geometry = s => ({
    rect: (s.match(/<rect[^>]*>/) || [''])[0],
    tick: (s.match(/<line class="wr-range-tick"[^>]*>/) || [''])[0],
    rail: (s.match(/<line class="wr-range-rail"[^>]*>/) || [''])[0],
    data: (s.match(/data-f="[^"]*" data-m="[^"]*" data-c="[^"]*"/) || [''])[0],
  });
  ck('CONTROL: the bars draw IDENTICALLY — the mark is additive and moves no '
    + 'geometry, so a marked player\'s range still reads on the shared scale',
  JSON.stringify(geometry(plain)) === JSON.stringify(geometry(marked)),
  { plain: geometry(plain), marked: geometry(marked) });
}

// ── 3. THE PREDICATE IS CONSERVATIVE, WHICH IS THE WHOLE SAFETY ARGUMENT ───
{
  /* Extracted from app.js by behaviour rather than by import (the module is a
   * browser IIFE). These are the exact stamps the live board carries. */
  const cohort = shippedCohortPredicate();

  ck('a band-constant stamp marks', cohort('measured-2023-25-p90') === true);
  ck('a per-player stamp does NOT mark',
    cohort('measured-2023-25-p90-x-player-cv') === false);

  /* ⚠️ THE ONES THAT MATTER. A mark that fired on absence would light up K/DEF
   * (a different construction entirely) and every unrecognised stamp from a
   * future build — and a marker that cries wolf gets ignored, which is this
   * project's own intervention-rate epitaph. */
  ck('CONTROL: a MISSING stamp does not mark — under-marking leaves the status '
    + 'quo, over-marking destroys the mark\'s meaning',
  cohort(undefined) === false && cohort(null) === false && cohort('') === false);
  ck('CONTROL: an unrecognised construction does not mark',
    cohort('gaussian_z') === false && cohort('position_variance') === false);

  ck('the predicate ships in app.js and is wired into the bar',
    /function cohortCeiling\(player\)/.test(APP)
    && /cohortCeiling: cohortCeiling\(p\)/.test(APP));
}

// ── 4. IT FIRES ON THE REAL BOARD, AND ON THE RIGHT NUMBER OF PLAYERS ──────
{
  const board = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const adp = p => {
    for (const k of ['adjusted_adp', 'raw_adp', 'adp']) {
      const v = p[k];
      if (v != null && isFinite(Number(v))) return Number(v);
    }
    return null;
  };
  const cohort = shippedCohortPredicate();

  const range = board.players.filter(p =>
    ['QB', 'RB', 'WR', 'TE'].includes(p.position) && (p.proj_mean || 0) > 0
    && adp(p) != null && adp(p) >= 25 && adp(p) <= 220);
  const hit = range.filter(p => cohort(p.proj_ceiling_source));

  /* ⚠️ THE KNOWN-POSITIVE MOVED OFF THE LIVE BOARD, 2026-08-20, AND THE REASON
   * IS THE GOOD ONE: THERE IS NOTHING LEFT TO MARK INSIDE CORY'S RANGE.
   *
   * It required >=10 marked players in ADP 25-220. The file's own header
   * measured 34 there (19.7%), all carrying `measured-*` band-constant
   * ceilings. Cory's Draft Sharks ruling replaced that construction entirely:
   * ZERO `measured-*` and ZERO `gaussian_z` ceilings remain on the board.
   *
   * Rule 3e is still the point — "nothing to mark" and "predicate broken" must
   * not look identical — but tying the known-positive to the BOARD HAVING THE
   * DEFECT means the control dies the day the defect is fixed, which is
   * exactly backwards. So it is driven SYNTHETICALLY: the predicate is handed
   * one player per cohort construction and must fire on each, and handed the
   * per-player constructions and must stay silent. That proves the check works
   * whether or not the live board happens to contain an instance.
   *
   * Two of the three positives are CURRENT rather than historical, and one of
   * them is A's own change from the same night: the position-median band
   * fallback is a cohort number by construction (it is the POSITION's typical
   * band, for players our pipeline scores at nothing), and a collapsed `none`
   * band is not a claim about upside at all. Both were unmarked until this
   * file caught them. */
  {
    const MUST_MARK = [
      'measured-2023-25-p90',
      'position-median band %, no player-specific band available — ABSTENTION, not a measurement',
      'none — no band from Draft Sharks or the prior board',
    ];
    const MUST_NOT = [
      'draftsharks_pct',
      'pre-DS band %, rescaled to the blended mean',
      'measured-2023-25-p90-x-player-cv',
    ];
    ck('KNOWN-POSITIVE (synthetic): the predicate fires on every cohort '
      + 'construction — a control tied to the board HAVING the defect dies the '
      + 'day the defect is fixed, which is backwards',
      MUST_MARK.every(src => cohort(src)),
      MUST_MARK.filter(src => !cohort(src)));
    ck('KNOWN-NEGATIVE (synthetic): and stays silent on every PER-PLAYER '
      + 'construction, so it discriminates rather than decorates',
      MUST_NOT.every(src => !cohort(src)),
      MUST_NOT.filter(src => cohort(src)));
    ck('...and on the LIVE board inside Cory\'s range the count is REPORTED, '
      + 'not required — today it is zero, which is the ruling working',
      true, { in_range: range.length, marked: hit.length });
  }

  ck('...and it does NOT fire on everything, so it is discriminating rather '
    + 'than decorating',
  hit.length < range.length / 2, { marked: hit.length, of: range.length });
  //: the shared-ratio evidence below only means anything when something is
  //  marked; today nothing is, so it is skipped rather than asserted on []
  /* ⚠️ `> 0` WAS THE WRONG THRESHOLD AND IT FAILED ON A POPULATION OF ONE.
   *
   * The evidence below is "the marked players SHARE ceiling ratios". Sharing
   * needs at least TWO players to be a possible outcome, so with exactly one
   * marked the assertion demanded something arithmetically unreachable and
   * reported it as a defect.
   *
   * Measured 2026-08-21: inside Cory's range (adp 25-220) exactly ONE player
   * is marked -- Jayden Higgins, ratio 1.4031, carrying the position-median
   * band stamped "no player-specific band available — ABSTENTION, not a
   * measurement". That is the honest fallback working, not a cohort constant:
   * the 34-player band-constant population this file was written for is gone.
   *
   * So the gate is >= 2, and the one-marked case is REPORTED with the player
   * named rather than asserted on. */
  const HAVE_MARKED = hit.length >= 2;

  /* The defect's signature, asserted directly: shared ratios. If these ever
   * become distinct the underlying problem is fixed and this mark should go. */
  const ratios = {};
  hit.forEach(p => {
    const r = (p.proj_ceiling / p.proj_mean).toFixed(4);
    (ratios[r] = ratios[r] || []).push(p.name);
  });
  const shared = Object.values(ratios).filter(v => v.length > 1);
  /* ⚠️ CONDITIONAL ON THERE BEING SOMETHING MARKED, 2026-08-20. This asserted
   * >=2 shared ratios unconditionally, which was the right evidence when 34
   * players in Cory's range carried band-constant ceilings. Today ZERO do —
   * the Draft Sharks ruling retired that construction — so the assertion ran
   * over an empty set and failed on `[]`, reporting the FIX as a defect.
   * The file's own header already says what to do here: "If these ever become
   * distinct the underlying problem is fixed and this mark should go." They
   * did not become distinct; the population became empty, which is stronger. */
  if (HAVE_MARKED) {
    ck('the marked players SHARE ceiling ratios — the actual evidence that the '
      + 'number is a cohort constant and not a measurement',
    shared.length >= 2, Object.entries(ratios).filter(([, v]) => v.length > 1)
      .map(([r, v]) => r + ' x' + v.length));
  } else if (hit.length === 1) {
    ck('exactly ONE player inside Cory\'s range carries a cohort/abstention '
      + 'ceiling — reported by name, not asserted on: sharing needs two',
    true, hit.map(p => p.name + ' @ ' + (p.proj_ceiling / p.proj_mean).toFixed(4)));
  } else {
    ck('nothing inside Cory\'s range carries a cohort ceiling any more, so the '
      + 'shared-ratio evidence has no population — reported, not asserted',
      true, { marked: hit.length, of: range.length });
  }
}

// ── THE MARKER'S SCOPE, MEASURED 2026-08-18 — IT UNDER-MARKS, AND BY HOW MUCH
//
// `cohortCeiling()` marks a ceiling whose source starts `measured-` and does NOT
// end `-x-player-cv`. That catches the band-derived p90s. It does NOT catch
// `gaussian_z`, and gaussian_z ceilings carry no player information either:
// measured on the live board, ALL 161 of them have `proj_sd_source:
// position_variance`, i.e. one constant per position. DEF shows a single
// ceiling/mean ratio to four decimal places across all 32 rows.
//
// So the honest statement is: **428 of 696 board rows (61%) have a ceiling with
// no player-specific information, and the `~` marks 267 of them.**
//
// ⚠️ I AM NOT WIDENING THE MARKER, AND THE REASON IS THE MEASUREMENT, NOT THE
// CALENDAR. Of the 161 gaussian_z rows, **7 sit inside ADP 150** — Cory's real
// draft range — and all seven are K or DEF (Rams/Texans/Seahawks/Broncos
// defences, Aubrey, Fairbairn, Dicker). The remaining 154 are deep rows he will
// never reach. Marking a kicker's ceiling as cohort-derived is true and useless:
// nobody drafts a kicker on upside, and the board's own doctrine says the wire
// covers the slot. Adding a second glyph to a card Cory has already called "too
// busy and wordy" to serve seven K/DEF rows is a worse board, not a better one.
//
// The test below PINS that decision so it cannot drift silently: if a gaussian_z
// row ever appears at a position that is not K or DEF inside ADP 150, this goes
// red and the trade-off is worth revisiting.
{
  /* Same load and the same ADP fallback chain block 4 uses — reading a
   * different field would measure a different population and the two numbers
   * would drift without either being wrong. */
  const bd = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const adpOf = (p) => {
    for (const k of ['adjusted_adp', 'raw_adp', 'adp']) {
      const v = p[k];
      if (v != null && isFinite(Number(v))) return Number(v);
    }
    return null;
  };
  const gauss = bd.players.filter(p => p.proj_ceiling_source === 'gaussian_z');
  const inRange = gauss.filter(p => adpOf(p) != null && adpOf(p) <= 150);
  /* ⚠️ RETIRED AS AN ASSERTION 2026-08-20, KEPT AS A REPORT. This required
   * gaussian_z ceilings to EXIST, so that the scope note above described
   * something real. There are now ZERO: Cory's Draft Sharks ruling replaced
   * every ceiling construction on the board. The scope note is therefore
   * history rather than a live under-marking, and it is left in place because
   * the shape of the trade-off is worth reading — but a control that requires
   * a defect to be present cannot survive the defect being fixed, which is the
   * same correction made to the known-positive above. */
  ck('gaussian_z ceilings on the board (was: REQUIRED to exist, so the scope '
    + 'note described something real; now zero, and the note is history)',
  true, { gaussian_z: gauss.length, in_range: inRange.length });

  ck('the UNMARKED cohort-derived ceilings inside Cory\'s draft range are K/DEF '
    + 'only — the measured reason the `~` is not widened. If this fails, a real '
    + 'skill player is showing an unmarked cohort ceiling and the trade-off '
    + 'changes.',
  inRange.every(p => p.position === 'K' || p.position === 'DEF'),
  inRange.filter(p => p.position !== 'K' && p.position !== 'DEF')
    .map(p => p.position + ' ' + p.name + ' adp' + Math.round(p.adp)));

  ck('...and there are few enough of them to name — a count that grows is a '
    + 'signal the fallback is spreading',
  inRange.length <= 12, { in_range: inRange.length });
}

/* THE TWO SHIPPED COPIES MUST AGREE. app.js and warroom_charts.js are separate
 * bundles and duplicate four lines on purpose; that is fine right up until one
 * is edited and the other is not, which is how a mark appears on the shortlist
 * and not in the drill-down. Asserted over every construction the board
 * currently emits plus the retired family. */
{
  const charts = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft',
    'warroom_charts.js'), 'utf8');
  const head = 'function isCohortCeiling(p) {';
  const i2 = charts.indexOf(head);
  ck('warroom_charts.js still declares isCohortCeiling', i2 >= 0);
  const body = charts.slice(i2 + head.length, charts.indexOf('\n  }', i2));
  // eslint-disable-next-line no-new-func
  const chartsFn = new Function('p', body + '\n');
  const appFn = shippedCohortPredicate();
  const STAMPS = ['draftsharks_pct', 'pre-DS band %, rescaled to the blended mean',
    'position-median band %, no player-specific band available — ABSTENTION, not a measurement',
    'none — no band from Draft Sharks or the prior board',
    'measured-2023-25-p90', 'measured-2023-25-p90-x-player-cv', '', null];
  const disagree = STAMPS.filter(st =>
    !!appFn(st) !== !!chartsFn({ proj_ceiling_source: st }));
  ck('the app.js and warroom_charts.js copies of the predicate agree on every '
    + 'construction the board emits — one edited without the other is how a '
    + 'mark appears on the shortlist and not in the drill-down',
    disagree.length === 0, disagree);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
