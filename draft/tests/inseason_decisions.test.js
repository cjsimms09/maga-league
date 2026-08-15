// TERRITORY: A
// THE PARKED HALF OF THE IN-SEASON LOOP — A's decision join, extended.
//
// `src/routes/accuracy.js` has carried the read side for these since it was
// written, with its labels deliberately inert and a PENDING_KINDS list so the
// table "cannot quietly look like it covers decisions it does not". Its own
// comment names the blocker: "that extension is A's, and is parked."
//
// ── WHY IN-SEASON DECISIONS JOIN DIFFERENTLY ──────────────────────────────
//
// A DRAFT decision is a PAIR: `recommendation` says one thing, `pick` records
// another, and the join discovers whether they differed. An IN-SEASON decision
// is a SINGLE entry containing both sides, because `predledger` REFUSES to
// store one without `payload.counterfactual` — "what I would plausibly have
// done without the tool". Pairing them would drop every one for lacking a
// partner that cannot exist.
//
// ── THE THING THIS FILE MOSTLY GUARDS ─────────────────────────────────────
//
// `override_rate` means "of the DRAFT decisions, how often did Cory go another
// way". Folding start/sit calls into that numerator would leave the NAME
// unchanged while the QUANTITY became something else — the defect this project
// keeps finding, and the easiest one to commit here. §1 pins that the draft
// numbers do not move when in-season rows arrive.
//
// Run: node draft/tests/inseason_decisions.test.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { gradeDecisions } = require(path.join(ROOT, 'src', 'forecast_grade.js'));
const PL = require(path.join(ROOT, 'src', 'predledger.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const DRAFT = [
  { kind: 'recommendation', payload: { key: 'd1', value: 'A' } },
  { kind: 'pick', payload: { key: 'd1', value: 'B' } },     // overridden
  { kind: 'recommendation', payload: { key: 'd2', value: 'C' } },
  { kind: 'pick', payload: { key: 'd2', value: 'C' } },     // followed
];
const INSEASON = [
  { kind: 'lineup_call', payload: { key: 'w1', chosen: 'Nabers', counterfactual: 'Olave' } },
  { kind: 'forecast_resolution',
    payload: { forecast_key: 'w1', realized_chosen: 21.4, realized_counterfactual: 12.0 } },
  { kind: 'waiver_claim', payload: { key: 'w2', chosen: 'Tucker', counterfactual: 'nobody' } },
];

// ── 1. THE DRAFT NUMBERS DO NOT MOVE ────────────────────────────────────
{
  const before = gradeDecisions(DRAFT);
  const after = gradeDecisions(DRAFT.concat(INSEASON));
  ['n_decisions', 'followed', 'overridden', 'override_rate', 'scored',
    'cory_beat_model', 'model_beat_cory'].forEach(f => {
    ck('adding in-season rows leaves `' + f + '` byte-identical — the draft '
      + 'override rate must not silently become a different quantity',
    JSON.stringify(before[f]) === JSON.stringify(after[f]),
    { before: before[f], after: after[f] });
  });
  ck('CONTROL — the draft numbers are non-trivial, so "unchanged" is a real '
    + 'claim and not two zeros agreeing',
  before.n_decisions === 2 && before.overridden === 1 && before.override_rate === 0.5,
  { n: before.n_decisions, overridden: before.overridden, rate: before.override_rate });
  ck('and the in-season block is populated, so they really were processed',
    after.inseason.n === 2, after.inseason);
}

// ── 2. AN IN-SEASON DECISION NEEDS NO PAIR ──────────────────────────────
{
  const r = gradeDecisions(INSEASON).inseason;
  ck('a single entry becomes a decision row — no `pick` partner required',
    r.n === 2, r.n);
  ck('both sides are read off the one entry',
    r.rows.find(x => x.key === 'w1').chosen === 'Nabers'
      && r.rows.find(x => x.key === 'w1').counterfactual === 'Olave',
    r.rows.find(x => x.key === 'w1'));
  ck('rows are counted by kind, so "how many start/sit calls" is answerable '
    + 'without re-scanning', r.by_kind.lineup_call === 1 && r.by_kind.waiver_claim === 1,
  r.by_kind);
  /* FAIL ARM — under the draft join these rows produce NOTHING, which is what
   * "parked" meant in practice: captured, and invisible to the grader. */
  ck('FAIL ARM — the draft join alone finds no decisions in them at all, which '
    + 'is exactly the state accuracy.js labelled PENDING',
  gradeDecisions(INSEASON).n_decisions === 0);
}

// ── 3. THE OUTCOME JOIN, AND WHAT COUNTS AS SCORED ──────────────────────
{
  const r = gradeDecisions(INSEASON).inseason;
  const w1 = r.rows.find(x => x.key === 'w1');
  ck('an outcome joined by key scores the row', w1.edge === 9.4,
    { chosen: w1.realized_chosen, cf: w1.realized_counterfactual, edge: w1.edge });
  ck('and the row with no outcome is present but UNSCORED — an unresolved '
    + 'decision is not a zero-edge decision',
  r.rows.find(x => x.key === 'w2').edge === undefined && r.scored === 1, r.scored);
  ck('the mean edge is taken over the SCORED subset only; averaging over all '
    + 'rows would treat "not yet resolved" as "no edge"', r.mean_edge === 9.4,
  r.mean_edge);
  ck('and it records which side won, so "did the tool beat what I would have '
    + 'done" is a count and not an impression',
  r.tool_won === 1 && r.counterfactual_won === 0, { tool: r.tool_won, cf: r.counterfactual_won });

  /* THE OTHER DIRECTION MUST ALSO REGISTER, or the metric only ever flatters. */
  const loss = gradeDecisions([
    { kind: 'stream_call', payload: { key: 'L', chosen: 'X', counterfactual: 'Y' } },
    { kind: 'forecast_resolution',
      payload: { forecast_key: 'L', realized_chosen: 3, realized_counterfactual: 18 } },
  ]).inseason;
  ck('CONTROL — when the counterfactual wins, it is recorded as such and the '
    + 'edge goes negative', loss.counterfactual_won === 1 && loss.mean_edge === -15,
  { cf_won: loss.counterfactual_won, edge: loss.mean_edge });
}

// ── 4. A MISSING COUNTERFACTUAL IS REPORTED, NOT DEFAULTED ──────────────
{
  const r = gradeDecisions([
    { kind: 'stream_call', payload: { key: 'w3', chosen: 'X' } },   // pre-guard row
  ]).inseason;
  ck('an entry without a counterfactual is FLAGGED rather than given one',
    r.missing_counterfactual === 1 && r.rows[0].counterfactual === null,
    r.rows[0]);
  ck('CONTROL — a proper row is not flagged, so the flag distinguishes',
    gradeDecisions(INSEASON).inseason.missing_counterfactual === 0);

  /* AND THE LEDGER REFUSES TO CREATE SUCH A ROW IN THE FIRST PLACE. The grader
   * handles it because entries can predate the guard, not because it is allowed. */
  let threw = '';
  try {
    PL.buildEntry({ kind: 'stream_call', payload: { chosen: 'X' } }, { nowIso: 't', seq: 1 });
  } catch (e) { threw = String(e.message); }
  ck('FAIL ARM — predledger REFUSES an in-season kind with no counterfactual, so '
    + 'the flagged case is a legacy row and not a supported shape',
  /requires payload\.counterfactual/.test(threw), threw.slice(0, 140));
}

// ── 5. THE KIND LIST CANNOT DRIFT FROM THE SERVER'S ─────────────────────
// Two lists that must agree is how every one of these defects starts.
{
  const grade = require(path.join(ROOT, 'src', 'forecast_grade.js'));
  const mine = grade.INSEASON_DECISION_KINDS
    || require('fs').readFileSync(path.join(ROOT, 'src', 'forecast_grade.js'), 'utf8')
      .match(/INSEASON_DECISION_KINDS = \[([\s\S]*?)\]/)[1]
      .match(/'([a-z_]+)'/g).map(s => s.replace(/'/g, ''));
  ck('the grader grades exactly the kinds the ledger requires a counterfactual '
    + 'for — one list drifting from the other is how a kind gets captured and '
    + 'never graded',
  JSON.stringify(mine.slice().sort()) === JSON.stringify(PL.COUNTERFACTUAL_KINDS.slice().sort()),
  { grader: mine, ledger: PL.COUNTERFACTUAL_KINDS });
  ck('CONTROL — the list is non-empty, so the comparison is not two empties',
    PL.COUNTERFACTUAL_KINDS.length >= 4, PL.COUNTERFACTUAL_KINDS.length);

  /* AND EVERY ONE OF THEM IS A DECLARED KIND, or it could never be stored. */
  ck('every kind the grader expects is declared on the ledger',
    mine.every(k => PL.KINDS.indexOf(k) >= 0),
    mine.filter(k => PL.KINDS.indexOf(k) < 0));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: in-season decisions are graded from the single entry');
console.log('that carries both sides, scored only where an outcome exists, counted');
console.log('SEPARATELY so the draft override rate keeps meaning what it has always meant,');
console.log('and the grader\'s kind list is pinned to the ledger\'s so the two cannot drift.');
console.log('CORRECTED 2026-08-15 (the claim below was accurate when written, stale now,');
console.log('kept visible rather than deleted): capture IS wired (src/routes/member.js\'s');
console.log('/lineup/log, /waivers/log, /stream/log) and, for lineup_call specifically, so');
console.log('is resolution (forecast_grade.js\'s buildInseasonResolutions — see');
console.log('inseason_resolution.test.js). What still blocks a real score: no 2026 in-');
console.log('season week has been played yet, and waiver_claim/stream_call/inseason_override');
console.log('remain unresolved for reasons specific to each, not a wiring gap.');
