'use strict';
/* THE CONTEXT INTERFACE — the mechanism the frozen baseline structurally cannot be.
 *
 * B's audit, 2026-08-11, and it is the finding that outranks the re-freeze itself.
 * Eight deliberate breaks — deleting currentPick, nextPick, roster, myPickIndex or
 * the doctrine wiring from app.js's live context(), restoring the exact
 * `nextPick = upcoming[1]` bug the code comment blames for the conservation
 * violation, removing survival's currentPick guard, flipping a grabby threshold —
 * ALL LEFT THE BASELINE GREEN. A control (weights 1.0 -> 0.5) went red and
 * restored to green, so the harness genuinely re-reads what is perturbed. Those
 * greens were real silences.
 *
 * THE REASON, WHICH EXPLAINS ALL EIGHT AT ONCE RATHER THAN AS EIGHT OMISSIONS:
 * freeze_baseline.js has no reference to app.js. Its canonicalStates() HAND-BUILDS
 * the context and hands it to the scorer, so A FIELD THE APP FAILS TO SUPPLY IS
 * ALWAYS SUPPLIED BY THE FIXTURE. The baseline detects WEIGHT changes and cannot,
 * by construction, detect CONTEXT changes.
 *
 * MIRRORING THE APP BY HAND FIXES SIX FIELDS, NOT THE MECHANISM — the next
 * omission is invisible again. So this file does the durable thing: it asserts
 * that EVERY KEY THE ENGINE READS IS A KEY THE APP SUPPLIES. That is rule 11's
 * requirement 3 applied to an interface rather than to values, and it fails on any
 * future deletion without anyone remembering the field exists.
 *
 * IT ALSO GUARDS ITSELF. A source-scraping test that silently extracts nothing
 * passes everything — which is the same class of failure it exists to catch. So
 * the extraction is asserted before its results are used.
 *
 * Run: node draft/tests/context_interface.test.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'public', 'js', 'draft');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n))
  : (fail++, console.log('FAIL ' + n + (d ? '\n        -> ' + d : ''))); };

/* ONE EXTRACTOR, SHARED WITH app-wiring.test.js. This file originally carried
 * its own scraper; app-wiring carried a different one; the two disagreed on ES6
 * shorthand and produced a false gap. Dual maintenance of the guard is the same
 * disease as dual maintenance of the value, so the derivation moved to
 * draft/tools/ctx_interface.js and both suites read it. */
const CI = require(path.join(ROOT, 'draft', 'tools', 'ctx_interface.js'));
const strip = CI.strip;
const read = CI.readSrc;
const suppliedKeys = CI.suppliedKeys;

const app = read('app.js');
const supplied = suppliedKeys(app);

/* ── GUARD THE GUARD ────────────────────────────────────────────────────────
 * If the scraper returns [] or null, every downstream assertion passes
 * vacuously. Anchors chosen as keys whose absence would itself be a live bug. */
ck('the context() literal was located and parsed at all',
   Array.isArray(supplied) && supplied.length >= 12,
   'extracted ' + (supplied ? supplied.length : 'null') + ' keys — a scraper that '
   + 'silently extracts nothing passes everything');

const ANCHORS = ['board', 'league', 'weights', 'currentPick', 'nextPick', 'intervening',
                 'roster', 'myPickIndex', 'runMultipliers', 'drift'];
const missingAnchors = ANCHORS.filter(k => !(supplied || []).includes(k));
ck('every load-bearing key is present in the live context()',
   missingAnchors.length === 0,
   'app.js context() does not supply: ' + missingAnchors.join(', ')
   + ' — the frozen baseline supplies these from its own fixture and cannot see it');

/* ── NO DUPLICATE KEYS ──────────────────────────────────────────────────────
 * JavaScript keeps the last, so a repeated key makes the earlier one dead code
 * that reads as live. context() carried `totalPicks` twice AND `currentPick`
 * twice; the two totalPicks expressions even disagreed (`.length` gives 0 for an
 * empty board, `.length || null` gives null). Dual maintenance inside a single
 * object literal. */
const dupes = [...new Set((supplied || []).filter((k, i) => supplied.indexOf(k) !== i))];
ck('context() declares each key exactly once',
   dupes.length === 0,
   'duplicated: ' + dupes.join(', ') + ' — JS keeps the LAST, so the earlier '
   + 'expression is dead code that reads as live');

// ── what the scoring side READS ─────────────────────────────────────────────
const READERS = CI.CONSUMERS;
const reads = CI.ctxReads();

ck('the reader scrape found the scoring side',
   reads.size >= 15 && READERS.length >= 3,
   reads.size + ' distinct ctx reads across ' + READERS.join(', '));

/* THE EXEMPTIONS LIVE WITH THE EXTRACTOR, and each is asserted to be REAL —
 * a declared exemption that no internal literal actually supplies would be a
 * place to hide a genuine gap. */
const SELF_SUPPLIED = CI.INTERNAL;
Object.keys(SELF_SUPPLIED).forEach(k => {
  const src = READERS.map(read).join('\n');
  ck('the exemption for ctx.' + k + ' is real (it IS supplied internally)',
     new RegExp('\\b' + k + '\\s*:').test(src),
     'declared self-supplied but no internal literal supplies it');
});
const isInternal = CI.isInternalName;

/* ── THE ASSERTION ITSELF ───────────────────────────────────────────────────
 * Every key the scoring side reads must be a key the app supplies. This is what
 * would have caught all six context deletions at once, without anyone
 * remembering which fields exist. */
const gaps = [...reads.keys()]
  .filter(k => !(supplied || []).includes(k))
  .filter(k => !(k in SELF_SUPPLIED))
  .filter(k => !isInternal(k))
  .sort();
ck('EVERY key the engine reads is a key the live context() supplies',
   gaps.length === 0,
   gaps.map(k => 'ctx.' + k + ' read in ' + reads.get(k) + ', never supplied').join('\n           ')
   + '\n           (the frozen baseline hand-builds its fixture, so it supplies '
   + 'these itself and stays green)');


/* ═══ THE VALUES, NOT ONLY THE KEYS ═══
 *
 * Key parity catches a DELETED field. It cannot catch a field that is present
 * and WRONG — and one of B's eight breaks is exactly that: restoring
 * `nextPick = upcoming[1]`, the bug app.js's own comment blames for "the
 * conservation violation — P(gone) summed to far more than the picks that will
 * actually happen". So the pick-order functions are EXECUTED here rather than
 * described, against the real my_picks from the artifact.
 *
 * They are extracted rather than mirrored. Re-implementing myNextTurn in the
 * test would be the two-places disease, which is the family that produced the
 * bug in the first place.
 */
{
  const DATA = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const grab = name => {
    const at = app.indexOf('function ' + name + '(');
    if (at < 0) return null;
    // Brace-match the function body so a later edit cannot silently truncate it.
    let i = app.indexOf('{', at), depth = 0;
    for (; i < app.length; i++) {
      if (app[i] === '{') depth++;
      else if (app[i] === '}') { depth--; if (!depth) return app.slice(at, i + 1); }
    }
    return null;
  };
  const srcNextTurn = grab('myNextTurn');
  const srcNextPicks = grab('myNextPicks');

  ck('myNextTurn and myNextPicks were extracted from app.js (not mirrored here)',
     !!srcNextTurn && !!srcNextPicks && /my_picks/.test(srcNextTurn),
     'extraction failed — a test that silently extracts nothing passes everything');

  if (srcNextTurn && srcNextPicks) {
    const make = cur => new Function('state', 'currentPick',
      srcNextTurn + '\n' + srcNextPicks + '\nreturn { myNextTurn, myNextPicks };')(
      { data: { pick_order: DATA.pick_order } }, () => cur);

    const mine = (DATA.pick_order || {}).my_picks || [];
    ck('the artifact carries my pick list', mine.length >= 4, JSON.stringify(mine));

    /* ON THE CLOCK the two definitions agree, which is exactly why the bug
     * survived: every test written at a pick I own passes under either one. */
    const onClock = make(mine[0]);
    ck('ON the clock, myNextTurn and upcoming[1] agree (why the bug hid)',
       onClock.myNextTurn() === onClock.myNextPicks()[1],
       'next=' + onClock.myNextTurn() + ' upcoming[1]=' + onClock.myNextPicks()[1]);

    /* OFF THE CLOCK they diverge by a whole round. upcoming[0] IS my next pick,
     * so upcoming[1] points one turn too far — survival then models a ~17-pick
     * window while the seat strip counts 6, and P(gone) sums to far more than
     * the picks that happen. */
    const offClock = make(mine[0] + 2);
    const right = offClock.myNextTurn();
    const wrong = offClock.myNextPicks()[1];
    ck('OFF the clock the two definitions DIVERGE (so this guard is not vacuous)',
       right !== wrong, 'both gave ' + right + ' — the fixture cannot distinguish them');
    ck('and myNextTurn gives the NEARER pick (upcoming[1] overshoots by a round)',
       right < wrong && right === mine.filter(p => p > mine[0] + 2)[0],
       'myNextTurn=' + right + ' upcoming[1]=' + wrong);

    /* AND THE SOURCE MUST USE IT. The behavioural half proves the two definitions
     * differ; this proves context() binds the right one. Comments are already
     * stripped, so this cannot match the paragraph explaining the fix. */
    const ctxSrc = app.slice(app.indexOf('function context()'),
                             app.indexOf('function renderAll'));
    ck('context() binds nextPick from myNextTurn(), not from upcoming[N]',
       /const\s+next\s*=\s*myNextTurn\(\)/.test(ctxSrc)
       && !/nextPick\s*:\s*upcoming\s*\[/.test(ctxSrc),
       'context() is not using the single myNextTurn definition');

    /* THE WINDOW MUST MATCH THE PICKS THAT HAPPEN. interveningPicks() is what
     * Layer 2 and the conservation identity both count, so it has to be exactly
     * the opponent picks in [currentPick, myNextTurn) — my own seat excluded,
     * because a player I take is not a player who got away. */
    const ivSrc = grab('interveningPicks');
    ck('interveningPicks() excludes my own seat and closes at myNextTurn',
       !!ivSrc && /p\.slot\s*!==\s*mine/.test(ivSrc) && /p\.overall\s*<\s*turn/.test(ivSrc),
       'the survival window is not the picks that actually happen');
  }
}

/* ═══ THE DOCTRINE SCORER'S INPUTS — DERIVED, NOT LISTED ═══
 *
 * THE FIRST VERSION OF THIS CHECK WAS BACKWARDS, and breaking it is how that was
 * found. It asserted that the scoreBoard call supplied totalPicks, totalMyPicks,
 * myPickIndex and roster — a list copied from context(). Measured against
 * doctrine.js, scoreBoard reads `liveIndex`, `roster`, `dollarsOf` and an
 * optional `keys`, and NOTHING ELSE. So the guard was defending FOUR fields
 * nobody reads and saying nothing about the one that matters: deleting
 * `myPickIndex` went red, and deleting `liveIndex` was SILENT.
 *
 * `liveIndex` is the load-bearing one. Absent it defaults to 1
 * (`opts.liveIndex == null ? 1 : opts.liveIndex`), so every doctrine is scored as
 * if this were my first pick — at pick 34 a silently wrong plan.
 *
 * So the required set is now SCRAPED FROM THE CONSUMER instead of transcribed.
 * A hand-copied list is the same two-places disease as the code it audits, and it
 * failed the same way: it drifted to describe a different function. */
{
  const doc = read('doctrine.js');
  const sb = doc.slice(doc.indexOf('function scoreBoard('));
  const body = sb.slice(0, sb.indexOf('\n  function ', 1));
  // Fields read WITHOUT a default are required of the caller; ones with a
  // `|| x` / `== null ? x :` fallback are optional by construction.
  const readNames = [...new Set([...body.matchAll(/opts\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))];
  ck('scoreBoard\'s inputs were scraped from doctrine.js (non-vacuity)',
     readNames.length >= 3 && readNames.includes('liveIndex'),
     'scraped ' + JSON.stringify(readNames));

  const callAt = app.indexOf('DraftDoctrine.scoreBoard(scored, {');
  ck('the scoreBoard call site was located', callAt > 0);
  const lit = app.slice(callAt, app.indexOf('});', callAt));
  const supplies = n => new RegExp('\\b' + n + '\\s*:').test(lit);

  // REQUIRED: the ones whose absence changes behaviour silently.
  ['liveIndex', 'roster', 'dollarsOf'].forEach(n => {
    ck('the scoreBoard call supplies ctx.' + n + ' (read by doctrine.js)',
       supplies(n),
       n + ' is read by scoreBoard and not supplied — it will take its default '
       + 'silently, which for liveIndex means every doctrine scored at pick 1');
  });

  // AND NOTHING scoreBoard DOES NOT READ. A field here is produced-and-unread
  // (rule 14) and, worse, arrives with comments describing a different consumer.
  const suppliedHere = [...new Set([...lit.matchAll(/\n\s{6}([A-Za-z_$][\w$]*)\s*:/g)]
    .map(m => m[1]))];
  const unread = suppliedHere.filter(n => !readNames.includes(n));
  ck('the scoreBoard call supplies NOTHING scoreBoard does not read',
     unread.length === 0,
     'produced and never read: ' + unread.join(', ')
     + ' — scoreBoard reads only ' + readNames.join(', '));
}

console.log('');
console.log('context() supplies ' + (supplied || []).length + ' keys; the scoring side reads '
  + reads.size + ' distinct ctx fields across ' + READERS.length + ' modules.');
console.log('');
console.log(pass + '/' + (pass + fail) + ' context-interface checks passed');
process.exit(fail ? 1 : 0);
