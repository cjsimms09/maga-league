/* THE LEGALITY LAYER — the guarantee that failed in mock #1.
 * Run: node draft/tests/legality.test.js
 */
'use strict';
const L = require('../../public/js/draft/legality.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };
const p = pos => ({ player_id: String(Math.random()).slice(2), position: pos });
const roster = (...positions) => positions.map(p);

// --- lineup resolution -------------------------------------------------------
{
  const full = roster('QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB', 'K', 'DEF');
  const st = L.lineupState(full, STARTERS);
  check('a complete roster fills all 9 starting slots', st.filled === 9 && st.required === 9,
    st.filled + '/' + st.required);
  check('the surplus RB fills FLEX', st.slots.find(s => s.slot === 'FLEX').have === 1);
  check('nothing is reported missing', st.missing.length === 0);
}
{
  // FLEX must draw from RB/WR/TE surplus, not from QB or a onesie.
  const st = L.lineupState(roster('QB', 'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'K', 'DEF'), STARTERS);
  check('a spare QB does NOT fill FLEX', st.slots.find(s => s.slot === 'FLEX').have === 0,
    JSON.stringify(st.slots.find(s => s.slot === 'FLEX')));
  const st2 = L.lineupState(roster('QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'TE', 'K', 'DEF'), STARTERS);
  check('a spare TE DOES fill FLEX', st2.slots.find(s => s.slot === 'FLEX').have === 1);
}

// --- the four states ---------------------------------------------------------
{
  const legal = L.assess(roster('QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB', 'K', 'DEF'), STARTERS, 3);
  check('a full lineup reads legal', legal.status === 'legal' && /legal ✓/.test(legal.line), legal.line);

  // CORY'S REVISION: no K, no DEF is a STRATEGY, not an error.
  const streamable = L.assess(roster('QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB'), STARTERS, 2);
  check('missing ONLY K/DEF reads streamable, never illegal',
    streamable.status === 'streamable', streamable.status);
  check('the streamable line is informational, not alarming',
    /streamable — by design\?/.test(streamable.line) && !/unfilled/.test(streamable.line),
    streamable.line);

  // A missing RB2 with picks to spare is at-risk, not yet illegal.
  const atRisk = L.assess(roster('QB', 'RB', 'WR', 'WR', 'TE', 'K', 'DEF'), STARTERS, 4);
  check('a missing mandatory slot with time left reads at-risk',
    atRisk.status === 'at-risk', atRisk.status);
  check('the at-risk line NAMES the slot and the picks left',
    /RB.*unfilled/.test(atRisk.line) && /4 picks left/.test(atRisk.line), atRisk.line);

  // The mock-#1 shape: mandatory slots outnumber the picks left.
  const illegal = L.assess(roster('QB', 'RB', 'WR', 'TE'), STARTERS, 1);
  check('mandatory slots exceeding picks left reads ILLEGAL',
    illegal.status === 'ILLEGAL', illegal.status + ' hard=' + illegal.hardCount + ' left=' + illegal.picksLeft);
  check('ILLEGAL is driven by mandatory slots ONLY — K/DEF never cause it',
    illegal.hardMissing.every(s => !s.streamable));
}
{
  // THE REGRESSION: an empty DEF at the endgame must never read ILLEGAL, no
  // matter how few picks remain. This is the whole revision.
  const endgame = L.assess(roster('QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB'), STARTERS, 0);
  check('empty K+DEF with ZERO picks left is still not illegal',
    endgame.status === 'streamable', endgame.status);
  check('...and the strip says so rather than staying silent',
    /K\/DEF empty/.test(endgame.line) || /DEF\/K empty/.test(endgame.line), endgame.line);
}

// --- path suppression --------------------------------------------------------
{
  // One pick left, RB2 open: taking a 4th WR strands a mandatory slot.
  const r = roster('QB', 'RB', 'WR', 'WR', 'TE', 'WR', 'K', 'DEF');
  const why = L.suppressReason(r, STARTERS, 1, p('WR'));
  check('a pick that would strand a mandatory slot is suppressed WITH a reason',
    typeof why === 'string' && /strand/.test(why) && /RB/.test(why), String(why));
  check('the pick that FILLS the mandatory slot is not suppressed',
    L.suppressReason(r, STARTERS, 1, p('RB')) === null);

  // Onesies must never trigger suppression — that would be forcing by the back door.
  const r2 = roster('QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB');
  check('skipping K/DEF never suppresses a flier — no forcing by the back door',
    L.suppressReason(r2, STARTERS, 1, p('WR')) === null);

  // An already-lost roster does not blame the next pick for it.
  const lost = roster('QB');
  check('an already-illegal roster does not blame the current pick',
    L.suppressReason(lost, STARTERS, 1, p('WR')) === null);
}

// --- pricing the onesie choice (no forcing) ---------------------------------
{
  const takeK = L.priceOnesie('K', 41.0, 22.5);
  check('pricing states both sides and a verdict',
    takeK.onesie === 41 && takeK.flier === 22.5 && takeK.delta === 18.5
    && /take the K/.test(takeK.verdict), JSON.stringify(takeK));
  const takeFlier = L.priceOnesie('DEF', 12.0, 33.0);
  check('when the flier prices higher, the pricing says so',
    /flier prices higher/.test(takeFlier.verdict) && takeFlier.delta === -21,
    JSON.stringify(takeFlier));
  check('the streaming rationale rides with the number, not in a doc',
    /waiver priority resets weekly/.test(takeK.note));
}

// --- draft-exit summary ------------------------------------------------------
{
  const ex = L.exitSummary(roster('QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'RB'), STARTERS, 0);
  check('exiting without K/DEF is DELIBERATE, with a streaming plan attached',
    ex.deliberate === true && ex.todo.length === 2
    && ex.todo.every(t => /stream/.test(t.plan)), JSON.stringify(ex.todo));

  const bad = L.exitSummary(roster('QB', 'RB', 'WR', 'TE'), STARTERS, 0);
  check('exiting with a MANDATORY hole is not deliberate and says it is a hole',
    bad.deliberate === false && bad.todo.some(t => /it is a hole/.test(t.plan)),
    JSON.stringify(bad.todo));
}

// --- the guarantee is visible from early, not just at the end ----------------
{
  // Pick 1 of 12: nothing is filled, but nothing is lost either.
  const start = L.assess([], STARTERS, 12);
  check('an empty roster with 12 picks is at-risk, not illegal',
    start.status === 'at-risk' && start.filled === 0, start.status);
  check('the strip shows 0/9 from pick one — the guarantee is visible early',
    /Starters: 0\/9/.test(start.line), start.line);
  // 7 mandatory slots, 7 picks: every pick is now spoken for.
  const tight = L.assess([], STARTERS, 7);
  check('mustDraftNow fires exactly when picks == mandatory slots',
    tight.mustDraftNow === true && L.assess([], STARTERS, 8).mustDraftNow === false);
}

// --- MISSED-MARK RECOVERY: end-of-draft reconciliation ----------------------
{
  const mk = (id, name) => ({ player_id: String(id), name: name || ('P' + id) });
  const clean = L.reconcileExit([mk(1), mk(2), mk(3)], [mk(1), mk(2), mk(3)]);
  check('exit: a matching roster reconciles clean',
    clean.ok === true && !clean.missing.length && !clean.extra.length);

  // THE FORGOT-TO-TAP CASE: Sleeper has him, I never recorded him.
  const forgot = L.reconcileExit([mk(1), mk(2)], [mk(1), mk(2), mk(3, 'Judkins')]);
  check('exit: a pick Sleeper has and I never marked is listed as MISSING',
    forgot.ok === false && forgot.missing.length === 1
    && forgot.missing[0].name === 'Judkins', JSON.stringify(forgot.missing));

  // THE MIS-TAP: I recorded someone Sleeper does not have.
  const mistap = L.reconcileExit([mk(1), mk(9, 'WrongGuy')], [mk(1)]);
  check('exit: a player I marked that Sleeper does not have is listed as EXTRA',
    mistap.extra.length === 1 && mistap.extra[0].name === 'WrongGuy',
    JSON.stringify(mistap.extra));

  const both = L.reconcileExit([mk(1), mk(9)], [mk(1), mk(3)]);
  check('exit: missing and extra are reported SEPARATELY, never netted to zero',
    both.missing.length === 1 && both.extra.length === 1 && both.ok === false);
  check('exit: a discrepancy names the correction as required before archiving',
    /correct before archiving/.test(both.note), both.note);

  // NEVER AUTO-APPLIED (spec item 3): the function reports, it does not mutate.
  const marked = [mk(1)];
  L.reconcileExit(marked, [mk(1), mk(2)]);
  check('exit: reconciliation REPORTS and never mutates the roster it was given',
    marked.length === 1, String(marked.length));
}

console.log(`\n${pass}/${pass + fail} legality checks passed`);
process.exit(fail ? 1 : 0);
