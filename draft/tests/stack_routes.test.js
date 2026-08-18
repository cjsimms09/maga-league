/* LIVE STACK ROUTES — enumeration, ranking, and the honesty invariant.
 *
 * The stack term is classed weak / LEAN / NOT INSTALLED (deviation.js). A line
 * that gives it standing visual prominence must carry that class, or decoration
 * reads as evidence — the deviation badge's failure mode in reverse. So the
 * load-bearing test here is NOT "does it find routes" but "does the class label
 * come from the evidence table rather than a hard-coded string" — flip the
 * table and the label must follow.
 *
 * Run: node draft/tests/stack_routes.test.js
 */
'use strict';
const E = require('../../public/js/draft/engine.js');
const D = require('../../public/js/draft/deviation.js');

let pass = 0, fail = 0;
const check = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d ? '  -> ' + d : '')); } };

// A scored board is a list of { player, survival_to_next }.
const s = (id, name, pos, team, adp, surv) => ({
  player: { player_id: id, name: name, position: pos, team: team, adjusted_adp: adp },
  survival_to_next: surv,
});

// Roster: Chase (WR, CIN) already held; Bowers (TE, LV) already held.
const roster = [
  { player_id: 'chase', name: 'Chase', position: 'WR', team: 'CIN' },
  { player_id: 'bowers', name: 'Bowers', position: 'TE', team: 'LV' },
];

// Board: Burrow (QB CIN — completes Chase, single), a 2nd CIN catcher (double),
// an unrelated player, and a QB for a team we hold no catcher on (no route).
const scored = [
  s('burrow', 'Burrow', 'QB', 'CIN', 26, 0.61),
  s('higgins', 'Higgins', 'WR', 'CIN', 40, 0.5),   // CIN, but no QB on roster yet -> only a route once Burrow is in
  s('nobody', 'Nobody', 'RB', 'SEA', 30, 0.9),
];

// --- it finds the QB->catcher completion ------------------------------------
{
  const r = E.liveStackRoutes(roster, scored);
  const burrow = r.routes.find(x => x.partner_id === 'burrow');
  check('finds Burrow as a route completing the Chase stack', !!burrow, JSON.stringify(r.routes.map(x=>x.partner)));
  check('the completion is a SINGLE-partner route (first pairing)', burrow && burrow.single === true);
  check('the label names partner and anchor', burrow && /Burrow completes Chase/.test(burrow.label), burrow && burrow.label);
  check('carries survival and adp from the SCORED board, not re-derived',
    burrow && burrow.survival === 0.61 && burrow.adp === 26);
  check('Higgins is NOT a route (no QB on roster, only same-team competition)',
    !r.routes.find(x => x.partner_id === 'higgins'));
  check('unrelated player yields no route', !r.routes.find(x => x.partner_id === 'nobody'));
  check('best is the single completion', r.best && r.best.partner_id === 'burrow');
  check('partnerIds maps the completing player for the rec-card badge', !!r.partnerIds.burrow);
}

// --- single-partner ranks above a double stack ------------------------------
{
  // Now Burrow is ALSO on the roster: a 2nd CIN catcher is a double-stack add-on.
  const roster2 = roster.concat([{ player_id: 'burrow', name: 'Burrow', position: 'QB', team: 'CIN' }]);
  // Board: a fresh single route (Bowers already held -> a LV QB completes it),
  // plus Higgins as a double-stack add-on to CIN.
  const board2 = [
    s('okc', 'Carr', 'QB', 'LV', 55, 0.7),   // completes the Bowers stack — SINGLE
    s('higgins', 'Higgins', 'WR', 'CIN', 40, 0.5),  // adds to CIN pair — DOUBLE
  ];
  const r = E.liveStackRoutes(roster2, board2);
  const single = r.routes.find(x => x.partner_id === 'okc');
  const dbl = r.routes.find(x => x.partner_id === 'higgins');
  check('the double-stack add-on is flagged single:false', dbl && dbl.single === false);
  check('single-partner route ranks ABOVE the double stack (exp 6)',
    r.routes.indexOf(single) < r.routes.indexOf(dbl),
    'single@' + r.routes.indexOf(single) + ' double@' + r.routes.indexOf(dbl));
  check('best is the single completion, not the marginal double', r.best.partner_id === 'okc');
}

// --- THE HONESTY INVARIANT: class is DERIVED from the evidence table ---------
{
  const r = E.liveStackRoutes(roster, scored);
  check('class label reflects the CURRENT evidence class (weak -> LEAN, not installed)',
    r.class_label === 'LEAN, not installed' && r.klass === D.EVIDENCE.stack.klass,
    r.class_label + ' / ' + r.klass);

  // Flip the table as exp 6/21 would, and the label must follow WITHOUT touching
  // engine.js — proving the prominence is earned in one place, not hard-coded.
  const saved = D.EVIDENCE.stack.klass;
  D.EVIDENCE.stack.klass = 'moderate';
  const promoted = E.liveStackRoutes(roster, scored);
  check('promoting stack to moderate flips the label to "installed" with no engine edit',
    promoted.class_label === 'installed' && promoted.klass === 'moderate',
    promoted.class_label);
  D.EVIDENCE.stack.klass = saved;  // restore — never leave global state dirty
  check('restored the evidence table after the mutation', D.EVIDENCE.stack.klass === 'weak');
}

// --- empty / degenerate inputs never throw ----------------------------------
{
  check('empty roster -> zero routes, no throw', E.liveStackRoutes([], scored).count === 0);
  check('empty board -> zero routes, no throw', E.liveStackRoutes(roster, []).count === 0);
  check('null args -> zero routes, no throw', E.liveStackRoutes(null, null).count === 0);
}

// --- THE BADGE AND THE SCORE ARE ONE NUMBER ---------------------------------
/* THIS SUITE TESTED TOPOLOGY AND NEVER THE VALUE, so it stayed green while the
 * badge and the composite disagreed about the same player (found 2026-08-14).
 *
 * `liveStackRoutes` scored routes off `CFG.STACK_QB_TE / STACK_QB_WR1` directly
 * and skipped the same-team competition penalty — reasoning that competition is
 * "a penalty, not a route to complete". True of whether a route EXISTS; false of
 * what it is WORTH. `correlationAdjustment`, which is what the COMPOSITE scores,
 * subtracts SAME_TEAM_COMPETITION per catcher already held. Measured before the
 * fix, with Chase (a real keeper) on the roster:
 *
 *     Chase + Burrow, considering a 2nd CIN receiver    badge yes   term  +2
 *     + Higgins,      considering a 3rd CIN catcher     badge yes   term  -4
 *     + Gesicki,      considering a 4th                 badge yes   term  -6
 *
 * So the card said "extends Burrow stack" on picks the model was docking. The
 * route value is now the composite's own number, and these checks make the two
 * inseparable rather than merely equal today. */
{
  const C = require('../../public/js/draft/composite.js');
  const LG = { teams: 10 };
  const mk = (pos, team, name) => ({ player_id: name, name: name, position: pos, team: team });
  const term = (rost, p) => C.correlationAdjustment(p, { roster: rost, league: LG, currentPick: 60 }).value;

  const base = [mk('WR', 'CIN', 'Chase'), mk('QB', 'CIN', 'Burrow')];
  const second = mk('WR', 'CIN', 'Higgins');
  const third = mk('TE', 'CIN', 'Gesicki');

  const r2 = E.liveStackRoutes(base, [{ player: second }], { league: LG, currentPick: 60 });
  check('a 2nd same-team catcher alongside the QB is still a route — the penalty '
    + 'nets against the bonus, it does not veto the pairing', !!r2.partnerIds.Higgins);
  check('and its value is the COMPOSITE value, not the gross bonus',
    r2.partnerIds.Higgins.value === term(base, second),
    r2.partnerIds.Higgins.value + ' vs ' + term(base, second));
  check('FAIL ARM — that value is NOT the gross pairing bonus, or this check '
    + 'would pass under the old behaviour too',
  r2.partnerIds.Higgins.value !== E.CFG.STACK_QB_WR1,
  r2.partnerIds.Higgins.value + ' / gross ' + E.CFG.STACK_QB_WR1);

  const stacked = base.concat([second]);
  check('CONTROL — a 3rd same-team catcher really does score NEGATIVE in the '
    + 'composite, or the case below is not the case I claim', term(stacked, third) < 0,
  String(term(stacked, third)));
  const r3 = E.liveStackRoutes(stacked, [{ player: third }], { league: LG, currentPick: 60 });
  check('so it is NOT offered as a route — the badge cannot recommend a pick the '
    + 'model is docking', !r3.partnerIds.Gesicki, JSON.stringify(r3.routes.map(x => x.partner)));

  /* THE INVARIANT, over every route the suite's own fixtures produce. */
  const all = E.liveStackRoutes(roster, scored, { league: LG, currentPick: 60 });
  check('CONTROL — the fixture board yields routes to check', all.count >= 1, String(all.count));
  check('EVERY route value equals the composite term for that player on that '
    + 'roster — one derivation, so they cannot drift apart',
  all.routes.every(rt => {
    const p = scored.find(x => x.player.player_id === rt.partner_id).player;
    return rt.value === term(roster, p);
  }), JSON.stringify(all.routes.map(rt => [rt.partner, rt.value])));
  check('and no route is ever offered with a non-positive value',
    all.routes.every(rt => rt.value > 0),
    JSON.stringify(all.routes.map(rt => [rt.partner, rt.value])));
}

// --- THE PLAYOFF-SCHEDULE BRANCH IS INERT, AND THAT IS WORTH KNOWING --------
/* `correlationAdjustment` carries a third effect nobody would guess from the
 * name `stack`: a playoff-schedule bump from round 6, worth up to +/-4 x sos.
 * It is correctly guarded ("never invented") and it has never fired — the field
 * is null on every row of the shipped board. Asserted so that the day C lands
 * `playoff_sos`, this goes red and somebody re-reads what `stack` now contains
 * rather than discovering it in a recommendation. */
{
  const B = require('../../public/draft_data.json');
  const withSos = B.players.filter(p => p.playoff_sos != null);
  check('playoff_sos is absent from the live board, so the schedule branch of '
    + 'the stack term has never contributed to a recommendation',
  withSos.length === 0, withSos.length + ' rows carry it');
  check('CONTROL — the branch exists and would fire if the field arrived, so '
    + 'this is a live dependency and not dead code',
  /round >= CFG\.CORRELATION_MIN_ROUND && player\.playoff_sos != null/.test(
    require('fs').readFileSync('public/js/draft/composite.js', 'utf8')));
}

console.log('');
console.log(pass + '/' + (pass + fail) + ' stack-route checks passed');
if (fail) process.exit(1);
