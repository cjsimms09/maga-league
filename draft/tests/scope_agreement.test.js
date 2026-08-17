'use strict';
// SCOPE DISAGREEMENT — a set that AGREES on every member it shares, and is
// missing members the other one has.
//
// This is not the dual-maintenance disease. The FLEX finding looked like it and
// was not: three definitions carried FLEX + SUPER_FLEX + REC_FLEX, three carried
// FLEX alone. They agreed EXACTLY on the value they shared. A comparator asking
// "do these match?" answers yes, correctly, while a slot vanishes from a lineup
// and six starters get priced as seven.
//
// So the question a comparator has to ask is not "do they match" but
// "DOES EITHER ONE HAVE MEMBERS THE OTHER LACKS."
//
// This file asks that of the sets where a scope gap would actually change what
// the site does. It is deliberately not an inventory of every constant in the
// repo — the sets below are the ones where one definition drives behaviour and
// another drives what the reader is told about that behaviour.
const path = require('path');
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));
const MU = require(path.join(__dirname, '..', '..', 'src', 'matchup.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };

// A MISSING EXPORT MUST FAIL BY NAME, NOT CRASH. The first run of this file
// against the pre-fix code threw a bare TypeError on `MU.injuryFlag` and died,
// printing nothing — so a regression that REMOVED the derivation would have
// produced a stack trace instead of "the card no longer badges these six". A
// guard that dies is a guard that tells you nothing about what broke.
const need = (obj, name, what) => {
  if (obj && typeof obj[name] === 'function') return obj[name];
  ck(`${what} is exported (${name})`, false, 'missing — the derivation it guards is gone');
  return () => ({ level: '(absent)', text: '' });
};
const injuryFlag = need(MU, 'injuryFlag', 'the shared availability badge');

/** The assertion this whole file exists for: neither side may have a member the
 *  other lacks. Reports BOTH directions, because "which way is it missing" is
 *  the thing that tells you which surface is lying. */
function sameMembers(label, aName, a, bName, b) {
  const A = [...a].map(String), B = [...b].map(String);
  const onlyA = A.filter(x => !B.includes(x)), onlyB = B.filter(x => !A.includes(x));
  ck(label, onlyA.length === 0 && onlyB.length === 0,
    { [`only_in_${aName}`]: onlyA, [`only_in_${bName}`]: onlyB });
}

// ── 1) "NOT PLAYING": the optimizer benches nine statuses; the matchup card
// used to badge three of them as OUT and send the other six to the amber
// "might play" badge. Same player, two surfaces, contradictory verdicts,
// mid-game — and the two sets agreed perfectly on OUT, IR and SUS.
{
  const benched = [...LO.INACTIVE_INJURY];
  const badgedOut = benched.filter(s => injuryFlag({ inj: s }).level === 'out');
  sameMembers('every status the optimizer benches is badged OUT on the starters card',
    'optimizer', benched, 'card', badgedOut);

  // And the reverse direction: the card must not call something OUT that the
  // optimizer still projects. That would be the same defect pointing the other
  // way — a player written off on the page and started by the tool.
  const maybes = Object.keys(MU.MAYBE_INJURY || {});
  const wronglyOut = maybes.filter(s => injuryFlag({ inj: s }).level === 'out');
  ck('  and nothing the optimizer still projects is badged OUT', wronglyOut.length === 0, wronglyOut);

  // A status neither set knows is shown verbatim — not silently upgraded to
  // "questionable", which is a guess, and not dropped, which is worse.
  const unknown = injuryFlag({ inj: 'ZZZ' });
  ck('  an unrecognised status is surfaced as itself, not guessed',
    unknown.level === 'unknown' && unknown.text === 'ZZZ', unknown);

  // Bye outranks any tag: a bye player scores zero regardless.
  ck('  a bye outranks an injury tag', injuryFlag({ onBye: true, inj: 'OUT' }).level === 'bye');
}

// ── 2) FLEX-TYPE SLOTS: the optimizer's map vs the rules page's slot order.
// `src/rules-derived.js` enumerates slot types for display; `lineup.js`
// enumerates them for eligibility. A slot the rules page can name and the
// optimizer cannot fill is the FLEX defect again, one surface over.
{
  const fs = require('fs');
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'rules-derived.js'), 'utf8');
  const m = src.match(/const SLOT_ORDER = (\[[\s\S]*?\]);/);
  ck('rules-derived still declares SLOT_ORDER', !!m);
  if (m) {
    const order = new Function('return ' + m[1])().filter(s => /FLEX/.test(String(s)));
    sameMembers('every flex-type slot the rules page can name, the optimizer can fill',
      'rules_page', order, 'optimizer', Object.keys(LO.FLEX_SLOTS));
  }
}

// ── 3) NON-STARTING SLOTS: matchup.js skips bench slots when pairing starters;
// lineup.js skips them when reading a roster template. A slot one treats as
// bench and the other counts as a starter would silently change lineup size.
{
  const fs = require('fs');
  const grab = (file, re) => {
    const mm = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8').match(re);
    return mm ? new Function('return ' + mm[1])() : null;
  };
  const a = grab('src/matchup.js', /const BENCH = (new Set\(\[[^\]]*\]\))/);
  // Read the ACTUAL literals out of the skip condition. An earlier draft of this
  // matched the line and then returned a hardcoded array — which would have
  // passed no matter what the source said, i.e. the exact tautology this file
  // exists to catch, one level up.
  const cond = require('fs')
    .readFileSync(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'), 'utf8')
    .match(/if \(([^)]*slot === '[^)]*)\) continue;/);
  const b = cond ? (cond[1].match(/'([A-Z]+)'/g) || []).map(x => x.replace(/'/g, '')) : null;
  ck('both non-starting-slot lists were found', !!a && !!b, { a: a && [...a], b });
  if (a && b) {
    sameMembers('the two "this slot does not start" lists cover the same slots',
      'matchup', a, 'lineup', b);
  }
}

// ── 4) THE ACCURACY PAGE'S KIND LABELS mix two vocabularies.
// `KIND_LABELS` carries forecast KEY PREFIXES (survival, room_seat) and ledger
// KINDS (lineup_call, waiver_claim, stream_call, trade_eval) in one list.
// Key prefixes reach the table through `kindOf` over graded forecast records;
// since 2026-08-15 the in-season decision kinds reach it through the
// calibration doc's `by_kind` map, which grade-cron writes by merging
// deriveByKind(graded) with forecast_grade.js's decisionByKind — resolvers
// exist for lineup_call/waiver_claim/stream_call and claims-cron runs them
// weekly (proven end-to-end in loop_closure_live.test.js). The one label that
// still cannot fire is trade_eval: no capture surface, no resolver, nothing
// writes one. PENDING_KINDS must name exactly that set — no more (a live label
// declared pending hides real coverage) and no less (a dead label undeclared
// dresses the table up as covering what it does not).
{
  const ACC = require(path.join(__dirname, '..', '..', 'src', 'routes', 'accuracy.js'));
  const labels = ACC.KIND_LABELS.map(k => k[0]);
  const reachable = ['survival', 'room_seat', 'forecast',
    'lineup_call', 'waiver_claim', 'stream_call'];
  const dead = labels.filter(l => !reachable.includes(l));
  ck('KIND_LABELS declares which of its entries are not yet reachable',
    typeof ACC.PENDING_KINDS !== 'undefined', 'no PENDING_KINDS export');
  if (typeof ACC.PENDING_KINDS !== 'undefined') {
    sameMembers('the labels that cannot fire yet are exactly the ones declared pending',
      'unreachable', dead, 'declared_pending', ACC.PENDING_KINDS);
  }
  // The reachability claim above is itself checkable: every in-season kind we
  // call reachable must have a resolver branch in buildInseasonResolutions,
  // read straight off the source so this list cannot outlive the code.
  const fgSrc = require('fs').readFileSync(
    path.join(__dirname, '..', '..', 'src', 'forecast_grade.js'), 'utf8');
  const resolverBody = (fgSrc.match(/function buildInseasonResolutions[\s\S]*?\n}\n/) || [''])[0];
  for (const k of ['lineup_call', 'waiver_claim', 'stream_call']) {
    ck(`"${k}" declared reachable actually has a resolver branch`,
      resolverBody.includes(`'${k}'`), k);
  }
  ck('CONTROL — trade_eval has NO resolver branch, which is why it stays pending',
    !resolverBody.includes(`'trade_eval'`));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
