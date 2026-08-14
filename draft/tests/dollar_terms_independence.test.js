// TERRITORY: A
// THE "WHY?" PANEL SHOWED ONE SIGNAL AS TWO.
//
// Cory, on the war room, twice: "make 100% sure what B is showing me matches
// what model actually says and explains what model is actually showing. This
// could ruin whole draft." This is the first finding out of that audit, and it
// is the same class as the +$353 doctrine banner: every number correct, every
// number correctly rendered, and the SENTENCE a reader takes away is false.
//
// ── THE ARITHMETIC ────────────────────────────────────────────────────────
//
//     high  = DG_HIGH_K  x (ceiling - mean)     <- ceiling shape
//     entry = DG_ENTRY_K x mean                 <- projection
//     rs    = DG_RS_K    x mean                 <- the same projection
//
// So `entry` and `rs` are the SAME QUANTITY twice, and their ratio is exactly
// DG_ENTRY_K / DG_RS_K = 1.6 for every player who has ever existed. Printing
// them as two terms of a three-way decomposition invites "entry favours him AND
// RS favours him" as two confirmations. It is one, counted twice. Only `high`
// carries information the other two do not.
//
// THE AMOUNTS ARE NOT WRONG — entry and RS are genuinely different pots of
// money (top-4 entry equity, regular-season equity), and both being proportional
// to season total is a defensible model. The defect is entirely in the reading,
// so the fix is entirely in the reading: one season line, with the split named
// as the fixed ratio it is.
//
// Run: node draft/tests/dollar_terms_independence.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

// ── 1. THE COLLINEARITY, MEASURED ON THE LIVE BOARD ─────────────────────
{
  const pool = B.players.filter(p => Number.isFinite(+p.proj_mean) && +p.proj_mean > 0)
    .slice(0, 300).map(p => E.playerDollars(p)).filter(d => d.rs > 0);
  ck('the board gives enough priced players to measure this', pool.length >= 100, pool.length);

  const ratios = pool.map(d => d.entry / d.rs);
  const spread = Math.max.apply(null, ratios) - Math.min.apply(null, ratios);
  ck('entry / RS is the SAME for every player — one signal shown as two',
    spread < 1e-9, { min: Math.min.apply(null, ratios), max: Math.max.apply(null, ratios) });
  ck('and that constant is exactly DG_ENTRY_K / DG_RS_K, so it is structural '
    + 'rather than a property of this board',
  Math.abs(ratios[0] - E.CFG.DG_ENTRY_K / E.CFG.DG_RS_K) < 1e-9,
  { observed: ratios[0], expected: E.CFG.DG_ENTRY_K / E.CFG.DG_RS_K });

  /* CONTROL — `high` genuinely varies against them, which is what makes it the
   * one term worth reading separately. If it were collinear too, the whole
   * decomposition would be a single number in three costumes. */
  const hr = pool.filter(d => d.high > 0).map(d => d.high / d.rs);
  const hSpread = Math.max.apply(null, hr) - Math.min.apply(null, hr);
  ck('CONTROL — `high` is NOT collinear with them: it prices ceiling-over-mean '
    + 'and its ratio to RS varies widely across players', hSpread > 0.5,
  { spread: hSpread, n: hr.length });
}

// ── 2. THE ARITHMETIC IS WHAT THE COMMENT SAYS ──────────────────────────
// Derived, so a later change to the pricing breaks this rather than the prose.
{
  const p = { proj_mean: 200, proj_ceiling: 260 };
  const d = E.playerDollars(p);
  ck('entry is a constant times the projection',
    Math.abs(d.entry - E.CFG.DG_ENTRY_K * 200) < 1e-9, d.entry);
  ck('rs is a constant times the SAME projection',
    Math.abs(d.rs - E.CFG.DG_RS_K * 200) < 1e-9, d.rs);
  ck('high is a constant times ceiling-over-mean — a different input',
    Math.abs(d.high - E.CFG.DG_HIGH_K * 60) < 1e-9, d.high);
  ck('and the total is their sum, so nothing else is hiding in it',
    Math.abs(d.total - (d.high + d.entry + d.rs)) < 1e-9, d.total);

  /* A PLAYER WITH NO CEILING EDGE HAS NO INDEPENDENT TERM AT ALL — his entire
   * dollar figure is one projection scaled. Worth pinning because it is the
   * case where the three-term display was most misleading. */
  const flat = E.playerDollars({ proj_mean: 200, proj_ceiling: 200 });
  ck('a player whose ceiling equals his mean has boom $0 — his whole valuation '
    + 'is one number, and the old display showed it as two terms agreeing',
  flat.high === 0 && flat.entry > 0 && flat.rs > 0, flat);
}

// ── 3. THE PANEL SAYS SO ────────────────────────────────────────────────
{
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('the two mean-driven pots are shown as ONE season figure',
    /season \$' \+ Math\.round\(\(g\.terms\.A\.dollars\.entry \+ g\.terms\.A\.dollars\.rs\)/.test(app));
  ck('the split is still visible — the amounts are real money and are not hidden',
    /entry \$' \+ g\.terms\.A\.dollars\.entry \+ ' \+ RS \$/.test(app));
  ck('and it is named as the FIXED ratio it is, so nobody reads movement into it',
    /fixed 1\.6:1/.test(app));
  ck('the panel states which term actually carries independent information',
    /boom is the only term with independent information/.test(app));

  /* FAIL ARM — the old form, reproduced, so the regression is recognisable. */
  ck('FAIL ARM — the old three-way "high · entry · RS" line is gone',
    !/high \$' \+ g\.terms\.A\.dollars\.high \+ ' · entry \$/.test(app));
}

// ── 3b. AND SO DOES THE CHART, WHICH IS THE HALF I MISSED ───────────────
/* SECTION 3 ABOVE GUARDS THE `<details>` BODY — the part a reader has to CLICK.
 * The breakdown bar directly above it, which is always visible, still plotted
 * `high-pool · top-4 entry · RS · next-pick echo` as four independent rows. I
 * fixed the explanation and left the chart, and the chart is the worse half.
 *
 * THE BARS CANNOT DISAGREE. `entry` and `rs` are each a constant times mean, so
 * their DIFFERENCE carries the same fixed ratio — measured below on real pairs —
 * and the two bars therefore always point the same way, in fixed 1.6:1 lengths.
 * A reader comparing Gibbs to Jefferson saw `+16.7 · +8.7 · +5.4` and counted
 * three reasons agreeing. There are two. */
{
  const app = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('the visible breakdown bar collapses the two mean-driven pots into one row',
    /\['season \(entry\+RS, fixed 1\.6:1\)', season\]/.test(app));
  ck('and the row is the SUM, so no money vanishes from the chart',
    /const season = Math\.round\(\(g\.entry \+ g\.rs\) \* 10\) \/ 10;/.test(app));
  /* SCOPED TO THE LIVE STATEMENT, NOT THE FILE. My first version asserted the old
   * form was absent from `app.js` — and it matched MY OWN QUOTATION of it inside
   * the comment that retracts it. That is the second time this exact trap has
   * caught me (see board_publish_gate.test.js), and the resolution is the same:
   * deleting the history to satisfy a regex makes the file worse, because the
   * next reader needs to know what the chart used to say and why it was false.
   * So what must be true is that the ASSIGNMENT is the new form. */
  const partsStmt = (function () {
    const i = app.indexOf('const parts = [');
    return i < 0 ? '' : app.slice(i, app.indexOf('\n', app.indexOf('echo', i)));
  })();
  ck('CONTROL — the parts assignment is locatable', partsStmt.length > 20, partsStmt.length);
  ck('FAIL ARM — the old four-row form is gone from the ASSIGNMENT (it survives '
    + 'only as the quoted, retracted comment above it)',
  !/\['top-4 entry', g\.entry\]/.test(partsStmt) && !/\['RS', g\.rs\]/.test(partsStmt),
  partsStmt.slice(0, 200));
  ck('and the retraction is recorded rather than the history being deleted',
    /I fixed the\s*\*? ?\n?\s*\* ?explanation and left the chart/.test(app)
      || /fixed the explanation and left the chart/.test(app.replace(/\s+/g, ' ')));
  ck('the independent terms are still charted separately — collapsing everything '
    + 'would destroy the decomposition rather than fix it',
  /'high-pool \(boom\)', g\.high/.test(app) && /'next-pick echo', g\.echo/.test(app));

  /* THE MEASUREMENT THE FIX RESTS ON, re-derived rather than quoted. */
  const pool = B.players.filter(p => p.proj_mean != null && p.adp != null)
    .sort((a, b) => a.adp - b.adp).slice(0, 60);
  let pairs = 0, sameDir = 0, worst = 0;
  for (let i = 0; i + 8 < pool.length && i < 40; i++) {
    const da = E.playerDollars(pool[i]), db = E.playerDollars(pool[i + 8]);
    const e = da.entry - db.entry, r = da.rs - db.rs;
    if (Math.abs(r) < 1e-12) continue;
    pairs++;
    if (Math.sign(e) === Math.sign(r)) sameDir++;
    worst = Math.max(worst, Math.abs(e / r - E.CFG.DG_ENTRY_K / E.CFG.DG_RS_K));
  }
  ck('CONTROL — enough real pairs to measure the bars against', pairs >= 20, pairs);
  ck('the two bars point the same direction in EVERY pair — they are arithmetically '
    + 'incapable of disagreeing, which is why showing them as two is a false reading',
  sameDir === pairs, { same: sameDir, of: pairs });
  ck('and their length ratio is the constant, not merely close to it — the [1.0, '
    + '2.0] spread visible in `dollarGap` output is one-decimal ROUNDING, not '
    + 'variation in the underlying quantity', worst < 1e-9, worst);
}

// ── 4. WHAT THIS DOES NOT CLAIM ─────────────────────────────────────────
// The amounts are not being called wrong, and this must not read as if they are.
{
  ck('the pricing itself is UNCHANGED — playerDollars still returns all three '
    + 'terms and the same total, because the money is real and only the reading '
    + 'was false',
  ['high', 'entry', 'rs', 'total'].every(k => E.playerDollars({ proj_mean: 100 })[k] != null));
  ck('and the constants are untouched — this is a display fix, not a re-pricing',
    E.CFG.DG_ENTRY_K === 0.08 && E.CFG.DG_RS_K === 0.05 && E.CFG.DG_HIGH_K === 0.22,
    { entry: E.CFG.DG_ENTRY_K, rs: E.CFG.DG_RS_K, high: E.CFG.DG_HIGH_K });
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: the collinearity is measured on the live board rather');
console.log('than argued from the source, the constant is shown to be structural, `high` is');
console.log('proved NOT collinear so the decomposition is not dismissed wholesale, and the');
console.log('panel now names the fixed ratio instead of implying two independent terms.');
console.log('WHAT IT DOES NOT: change a single dollar. The pricing, the constants and the');
console.log('total are identical — what changed is that a reader can no longer count one');
console.log('signal twice. Whether the constants are right at all is a separate question the');
console.log('code already flags as a rough v1 placeholder.');
