/* A TRADE RECOMMENDATION PAST THE DEADLINE IS NOT A RECOMMENDATION.
 *
 * A DIFFERENT CLASS FROM A WRONG NUMBER. `trade_deadline` is 11 and it is
 * correct; no surface knew whether the current week was past it. So the
 * recommendation layer could produce a perfectly valid sell recommendation that
 * is OPERATIONALLY IMPOSSIBLE. A valid fact plus a missing temporal gate equals
 * an invalid recommendation.
 *
 * IT MUST SUPPRESS, NOT DISPLAY. Showing the deadline next to a sell
 * recommendation still made the recommendation — it moves the arithmetic onto
 * the reader at the moment they are least likely to do it. So `actionable`
 * is false and the caller is expected to withhold or transform, which is what
 * `verdict: 'suppress'` names.
 *
 * WHAT THIS DOES NOT CLAIM. Nothing calls the gate yet — there is no trade
 * surface. The rule exists before its consumer, exactly as claimStoppingRule
 * does, and the registry files `trade_deadline` as imported_unread rather than
 * imported for that reason. This suite pins the rule; it does not pretend the
 * rule is protecting anything today.
 *
 * Run: node draft/tests/trade_actionability.test.js
 */
'use strict';
const path = require('path');
const V = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'valuation.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── PAST THE DEADLINE: SUPPRESSED, NOT ANNOTATED ───────────────────────────
{
  const r = V.tradeActionability({ current_week: 12, deadline_week: 11 });
  ck('week 12 against a week-11 deadline is NOT actionable', r.actionable === false, r);
  ck('  and the verdict tells the caller to SUPPRESS, not to caption',
    r.verdict === 'suppress', r.verdict);
  ck('  the reason says why it is not an action anyone can take',
    /not an action anyone can take/.test(r.reason), r.reason);
}

// ── BEFORE THE DEADLINE: ALLOWED, PLAINLY ──────────────────────────────────
{
  const r = V.tradeActionability({ current_week: 5, deadline_week: 11, review_days: 2 });
  ck('week 5 is actionable', r.actionable === true && r.verdict === 'allow', r);
  ck('  with no boundary caveat, because week 5 is not the boundary',
    r.boundary_unverified === false, r);
}

// ── THE BOUNDARY WEEK IS THE ONE WE CANNOT RESOLVE, AND IT SAYS SO ─────────
{
  const r = V.tradeActionability({ current_week: 11, deadline_week: 11 });
  ck('the deadline week itself is flagged as unverified', r.boundary_unverified === true, r);
  ck('  it is permissive rather than silently strict', r.actionable === true, r);
  ck('  and it warns rather than passing quietly', r.verdict === 'allow_with_warning', r);
  ck('  naming the ambiguity instead of picking a convention',
    /not established/.test(r.reason), r.reason);
  // The waiver_day_of_week discipline applied to a second field: an unresolved
  // convention must not be turned into a value because it sounds right.
  const after = V.tradeActionability({ current_week: 12, deadline_week: 11 });
  ck('  and the week AFTER is unambiguous, so the caveat does not spread',
    after.boundary_unverified === false && after.actionable === false, after);
}

// ── REVIEW DAYS ARE PART OF THE DEADLINE, NOT AFTER IT ─────────────────────
{
  const tight = V.tradeActionability({ current_week: 11, deadline_week: 11, review_days: 2 });
  ck('a 2-day review with no runway left raises a warning',
    tight.verdict === 'allow_with_warning' && /review takes 2 day/.test(tight.reason), tight.reason);
  const roomy = V.tradeActionability({ current_week: 4, deadline_week: 11, review_days: 2 });
  ck('  and plenty of runway does not', roomy.verdict === 'allow', roomy);
  const unknown = V.tradeActionability({ current_week: 4, deadline_week: 11 });
  ck('  an unsupplied review period is null, never a silent zero',
    unknown.review_days === null, unknown);
}

// ── NO DEFAULTS: A GATE THAT GUESSES THE WEEK IS WORSE THAN NO GATE ───────
{
  const threw = f => { try { f(); return null; } catch (e) { return e.message; } };
  ck('missing current_week throws', !!threw(() => V.tradeActionability({ deadline_week: 11 })));
  ck('missing deadline_week throws', !!threw(() => V.tradeActionability({ current_week: 5 })));
  ck('no args at all throws', !!threw(() => V.tradeActionability()));
  ck('  and the message says why a default would be worse',
    /no defaults/i.test(threw(() => V.tradeActionability({})) || ''),
    threw(() => V.tradeActionability({})));
  ck('a non-numeric week throws rather than comparing NaN',
    !!threw(() => V.tradeActionability({ current_week: 'week five', deadline_week: 11 })));
}

// ── AGAINST THE LEAGUE'S OWN IMPORTED VALUES ───────────────────────────────
{
  const fs = require('fs');
  const cfgPath = path.join(__dirname, '..', 'config', 'league_config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const tw = cfg.trade_window;
    if (tw && tw.deadline_week != null) {
      const r = V.tradeActionability({ current_week: tw.deadline_week + 1,
        deadline_week: tw.deadline_week, review_days: tw.review_days });
      ck('the week after OUR imported deadline suppresses', r.actionable === false,
        { deadline: tw.deadline_week, verdict: r.verdict });
    } else {
      // NOT a silent skip: the config predates the trade_window import, and
      // saying so beats a green that checked nothing.
      console.log('SKIP  league_config carries no trade_window yet — re-run the import');
    }
  } else {
    console.log('SKIP  no league_config.json');
  }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
