// TERRITORY: A
/* THE OVERRIDE RECORD — the shape whose first real entry is the draft.
 *
 * Every refusal here is one that would produce an entry January cannot settle.
 * That matters more than usual for this kind: overrides are the ONLY ledger
 * entries whose counterfactual is observed rather than modelled, so a broken
 * one wastes the cleanest attribution evidence the system has.
 *
 * Run: node draft/tests/override_record.test.js
 */
'use strict';
const path = require('path');
const O = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'override_record.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const threw = f => { try { f(); return null; } catch (e) { return e.message; } };

const CHOSE = { player_id: '9', name: 'My Guy', position: 'WR', vorp: 41.2, proj_mean: 210.5, adjusted_adp: 38.4, tier: 3 };
const REC = { player_id: '4', name: 'The Board\'s Guy', position: 'RB', vorp: 55.8, proj_mean: 231.0, adjusted_adp: 31.1, tier: 2 };
const base = { season: '2026', build_at: '2026-08-22T23:00:00Z', pick: 34,
  chosen: CHOSE, recommended: REC, reason: 'gut', reconciled_from_sync: false,
  score_gap: 4.6, path: 'wr_anchor' };

// ── THE SHAPE B READS ──────────────────────────────────────────────────────
{
  const r = O.pickOverride(base);
  ck('a pick override is typed, not distinguished by a method string',
    r.type === 'pick_override', r.type);
  ck('  and carries the SAME decision join key the forecasts are stamped with',
    r.decision_key === '2026|2026-08-22T23:00:00Z|34', r.decision_key);
  ck('  with the tool\'s recommendation as the counterfactual',
    r.counterfactual.player_id === '4', r.counterfactual);
  ck('  labelled OBSERVED, because that is what makes it stronger than the rest',
    /observed/.test(r.counterfactual_is), r.counterfactual_is);
}

// ── THE UNRECOVERABLE HALF ─────────────────────────────────────────────────
{
  /* THE WHOLE REASON THIS SHIPS BEFORE THE 22nd. The board is rebuilt nightly.
   * A January join against today's board grades the override against numbers I
   * never saw, and nothing about that failure is visible — both sides produce a
   * plausible VORP. So the values are frozen INTO the record. */
  const r = O.pickOverride(base);
  ck('both players\' values are frozen at the moment, not looked up later',
    r.chosen.vorp === 41.2 && r.counterfactual.vorp === 55.8, r);
  ck('  including ADP and tier, which also move nightly',
    r.chosen.adp === 38.4 && r.counterfactual.tier === 2, r.chosen);
  const noVorp = O.pickOverride(Object.assign({}, base,
    { chosen: { player_id: '9', name: 'x' } }));
  ck('  a missing value is recorded as null, never dropped',
    noVorp.chosen.vorp === null && 'vorp' in noVorp.chosen, noVorp.chosen);
  ck('  (because "the board had no VORP" and "nobody wrote the field" differ)', true);
}

// ── AN OVERRIDE WITH NOTHING TO OVERRIDE IS A PICK ─────────────────────────
{
  const msg = threw(() => O.pickOverride(Object.assign({}, base, { recommended: undefined })));
  ck('no recommendation throws', !!msg, msg);
  ck('  and says an ungradeable entry is worse than none',
    /worse than none/.test(msg || ''), msg);
  const same = threw(() => O.pickOverride(Object.assign({}, base, { recommended: CHOSE })));
  ck('agreeing with the tool is NOT an override', !!same, same);
  ck('  and the message says why recording it would ruin the rate',
    /disagreement rate meaningless/.test(same || ''), same);
}

// ── THE REASON VOCABULARY IS CLOSED, AND SILENCE IS FIRST-CLASS ────────────
{
  const r = O.pickOverride(Object.assign({}, base, { reason: undefined }));
  ck('an override with no stated reason is still recorded',
    r.reason === 'no_reason_given', r.reason);
  ck('  (a required modal at draft speed poisons the ledger worse)', true);
  const msg = threw(() => O.pickOverride(Object.assign({}, base, { reason: 'because I felt like it' })));
  ck('free text is refused', !!msg, msg);
  ck('  because one bucket per entry grades nothing',
    /grades nothing/.test(msg || ''), msg);
}

// ── DELIBERATE AND RECOVERED ARE DIFFERENT EVIDENCE ────────────────────────
{
  const msg = threw(() => O.pickOverride(Object.assign({}, base, { reconciled_from_sync: undefined })));
  ck('the deliberate/recovered flag has no default', !!msg, msg);
  const rec = O.pickOverride(Object.assign({}, base, { reconciled_from_sync: true }));
  ck('  a pick recovered from Sleeper is marked as such',
    rec.reconciled_from_sync === true && O.summarize(rec).deliberate === false);
}

// ── VALUE OVERRIDE IS A DIFFERENT EVENT, NOT THE SAME ONE ──────────────────
{
  const v = O.valueOverride({ season: '2026', build_at: base.build_at, pick: 34,
    player: CHOSE, direction: 'up', pct: 25, reason: 'news' });
  ck('a value override is typed separately from a pick override',
    v.type === 'value_override' && O.TYPES.indexOf(v.type) >= 0, v.type);
  ck('  and its counterfactual is the board\'s OWN number, frozen',
    v.counterfactual.proj_mean === 210.5, v.counterfactual);
  ck('  (it resolves against one player\'s outcome, not two)', true);
  const msg = threw(() => O.valueOverride({ season: '2026', build_at: base.build_at,
    pick: 34, player: CHOSE, direction: 'sideways', pct: 25 }));
  ck('an unknown direction throws', !!msg, msg);
  const clear = O.valueOverride({ season: '2026', build_at: base.build_at, pick: 34,
    player: CHOSE, direction: 'clear', pct: 25 });
  ck('  clearing an override records a null pct rather than a stale one',
    clear.pct === null, clear);
}

// ── WHAT B'S SURFACE RENDERS ───────────────────────────────────────────────
{
  const s = O.summarize(O.pickOverride(base));
  ck('the summary says what I took and what I passed on',
    s.took === 'My Guy' && s.over === 'The Board\'s Guy', s);
  ck('  and the VORP I gave up, signed, in the board\'s own units',
    Math.abs(s.vorp_given_up - 14.6) < 1e-9, s.vorp_given_up);
  const noVal = O.summarize(O.pickOverride(Object.assign({}, base,
    { chosen: { player_id: '9', name: 'x' } })));
  ck('  and reports null rather than 0 when a value is missing',
    noVal.vorp_given_up === null, noVal);
  ck('  (0 would read as "I gave up nothing", which is a claim)', true);
}

// ── THE FOUR THINGS THE EXTERNAL REVIEW ASKED FOR ──────────────────────────
{
  /* VERIFIED RATHER THAN ASSERTED, 2026-08-12, and all four had a defect on the
   * item with the ten-day deadline. */

  // (a) coin_flip WAS BEING EMITTED AND WAS NOT IN THE VOCABULARY. pickOverride
  //     threw, the caller's catch returned silently, and the whole coin-flip
  //     class of override was dropped.
  const cf = O.pickOverride(Object.assign({}, base, { reason: 'coin_flip' }));
  ck('coin_flip is a recorded reason — app.js emits it and it used to THROW',
    cf.reason === 'coin_flip', cf.reason);
  ck('  (the catch that hid it dropped an entire class on the one unrepeatable night)',
    O.REASONS.indexOf('coin_flip') >= 0);

  // (b) the counterfactual is THE RECOMMENDATION, not "no override"
  ck('the counterfactual is the tool\'s recommendation, not a do-nothing arm',
    cf.counterfactual.player_id === '4' && /observed/.test(cf.counterfactual_is));

  // (c) the gap at the time, and whether the board itself was unsure
  const g = O.pickOverride(Object.assign({}, base, { score_gap: 4.6, contested: true }));
  ck('the record carries the SCORE GAP the tool reported at the moment',
    g.score_gap === 4.6, g.score_gap);
  ck('  and whether the pick was flagged CONTESTED',
    g.contested === true, g.contested);
  ck('  (overriding a confident call and overriding a coin flip must not aggregate)',
    O.pickOverride(base).contested === null);

  // (d) a resolution rule stated BEFORE the outcome
  ck('the record states its resolution rule before any outcome exists',
    typeof g.resolution_rule === 'string' && g.resolution_rule.length > 60,
    g.resolution_rule);
  ck('  naming the metric, the window, the zero case and the tie',
    /realized FANTASY POINTS/.test(g.resolution_rule)
    && /rest of the season/.test(g.resolution_rule)
    && /never plays scores zero/.test(g.resolution_rule)
    && /tie resolves as NOT a success/.test(g.resolution_rule), g.resolution_rule);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
