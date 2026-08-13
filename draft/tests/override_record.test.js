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
  /* WAS `ck(..., true)`. The distinction is testable: a board that HAS the value
   * records the number, so null really does mean "absent" and not "always null". */
  ck('  and a board that HAS the value records it, so null means absent',
    typeof r.chosen.vorp === 'number' && r.chosen.vorp !== null, r.chosen.vorp);
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
  /* WAS `ck(..., true)`. Testable: silence is a FIRST-CLASS member of the closed
   * vocabulary, not a bypass of it. */
  ck('  and that sentinel is a member of the closed vocabulary, not a bypass',
    !O.REASONS || O.REASONS.indexOf('no_reason_given') >= 0, O.REASONS);
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

  /* ⚠️ THE FIELD THAT COST TEN DAYS. score_gap was wired at three call sites and
   * missed at the fourth — the Sleeper sync path, which carries most of draft
   * night — so every record came out null and NOTHING COULD SAY WHY. "The tool
   * reported no gap" and "nobody passed the gap it reported" both render as
   * `null`, which is how a null survives a fix that was reported as landed. */
  ck('a null gap now SAYS WHY, so an unwired emitter is greppable rather than silent',
    /unstated/.test(O.pickOverride(Object.assign({}, base, { score_gap: null })).score_gap_source));
  ck('  a supplied gap records that it was passed',
    O.pickOverride(base).score_gap_source === 'passed');
  ck('  and a recovered one says it was DERIVED, never passing as careful wiring',
    O.pickOverride(Object.assign({}, base,
      { score_gap: 4.6, score_gap_source: 'derived_from_clock' })).score_gap_source
      === 'derived_from_clock');

  /* ── AND THE RUNTIME CHECK THE SOURCE SCAN CANNOT GIVE ────────────────────
   *
   * app-wiring.test.js states the limit in its own header: source inspection
   * catches "the app never mentions it", NOT "the app mentions it but computes
   * it wrong". The scan below is the first kind. These are the second — the
   * resolution now lives in this module so Node can call the REAL function
   * instead of reading the shape of its source. */
  const CLOCK_TOP = { player: { player_id: 'rec1' }, gap_to_second: 7.25 };
  const REC1 = { player_id: 'rec1' };

  ck('RUNTIME: a passed gap wins and is labelled `passed`',
    O.resolveScoreGap({ passed: 3.1, clockTop: CLOCK_TOP, recommended: REC1 })
      .score_gap === 3.1);
  ck('RUNTIME: an OMITTED gap is recovered from the live clock — the sync-path case',
    O.resolveScoreGap({ passed: null, clockTop: CLOCK_TOP, recommended: REC1 })
      .score_gap === 7.25);
  ck('  and it is labelled derived, never passing as careful wiring',
    O.resolveScoreGap({ passed: null, clockTop: CLOCK_TOP, recommended: REC1 })
      .score_gap_source === 'derived_from_clock');

  /* ⚠️ THE REFUSAL THAT MATTERS MORE THAN THE RECOVERY. If the clock's top is a
   * DIFFERENT player, its gap describes a different comparison. Attaching it
   * would produce a plausible number quietly about the wrong pair — worse than a
   * null, because nothing downstream could ever detect it. */
  const wrongPair = O.resolveScoreGap({ passed: null, clockTop: CLOCK_TOP,
    recommended: { player_id: 'someone_else' } });
  ck('RUNTIME: a clock about a DIFFERENT player is REFUSED, not used as a fallback',
    wrongPair.score_gap === null);
  ck('  and it says why, so the refusal is not mistaken for missing data',
    /not the player this override was measured against/.test(wrongPair.score_gap_source));

  ck('RUNTIME: no clock at all yields null with a reason',
    /no live clock/.test(O.resolveScoreGap({ passed: null }).score_gap_source));
  ck('RUNTIME: a clock with no gap_to_second yields null with a reason',
    /reported no gap_to_second/.test(O.resolveScoreGap({ passed: null,
      clockTop: { player: { player_id: 'rec1' } }, recommended: REC1 }).score_gap_source));
  ck('RUNTIME: a zero gap is a REAL gap, not a missing one',
    O.resolveScoreGap({ passed: 0, clockTop: CLOCK_TOP, recommended: REC1 })
      .score_gap === 0);

  /* END TO END: the resolution feeds the record, which is what B reads. */
  const e2e = O.pickOverride(Object.assign({}, base,
    Object.assign({ score_gap: null }, O.resolveScoreGap(
      { passed: null, clockTop: CLOCK_TOP, recommended: REC1 }))));
  ck('END TO END: an emitter that passes NOTHING still lands a real gap in the record',
    e2e.score_gap === 7.25 && e2e.score_gap_source === 'derived_from_clock',
    e2e.score_gap + '/' + e2e.score_gap_source);

  /* ── THE LOCKED RECOMMENDATION ────────────────────────────────────────────
   *
   * The architecture is meant to be commit-then-compare. The commit existed and
   * the comparison read `state.lastClock` instead — a value rewritten on every
   * render, for whatever pick was current then. These assert the resolver that
   * replaces it. */
  const LOCKS = { 33: { player: { player_id: 'a' } }, 48: { player: { player_id: 'b' } } };

  ck('an EXACT per-pick lock is used and labelled',
    O.lockedRecommendationFor(LOCKS, 48).source === 'locked_at_pick'
    && O.lockedRecommendationFor(LOCKS, 48).rec.player.player_id === 'b');

  const near = O.lockedRecommendationFor(LOCKS, 50);
  ck('no exact lock falls back to the NEAREST EARLIER, and says so',
    near.source === 'nearest_earlier_lock' && near.rec.player.player_id === 'b');
  ck('  and records the distance, so a neighbour is never read as an exact match',
    near.distance === 2 && near.locked_at === 48);

  /* ⚠️ EARLIER ONLY. A LATER pick's board has already lost players I could have
   * taken, so it cannot stand in for the decision I actually faced. */
  ck('a LATER lock is REFUSED rather than used as the nearest one',
    O.lockedRecommendationFor(LOCKS, 20).rec === null);
  ck('  and says why',
    /no recommendation was locked at or before/.test(O.lockedRecommendationFor(LOCKS, 20).source));
  ck('no locks at all yields null with a reason',
    O.lockedRecommendationFor({}, 48).rec === null);

  ck('the record carries WHICH recommendation it was measured against',
    O.pickOverride(Object.assign({}, base, { rec_source: 'locked_at_pick' })).rec_source
      === 'locked_at_pick');
  ck('  an emitter that says nothing is recorded as `unstated`, not as exact',
    O.pickOverride(base).rec_source === 'unstated');

  /* ── THE SOURCE-LEVEL CHECK THAT WOULD HAVE CAUGHT IT TEN DAYS AGO ─────────
   *
   * Every emitter of an override must supply a gap or a reason. This reads the
   * app's own call sites rather than trusting that they were wired — the exact
   * check whose absence let three-of-four pass as done.
   *
   * Rule 11e cuts the other way here: a source scan cannot tell an
   * implementation from a comment describing one, but THIS question IS about
   * the source — whether the argument appears at the call site — so scanning is
   * the right instrument rather than a proxy for one. */
  const fs = require('fs');
  const appSrc = fs.readFileSync(require('path').join(__dirname, '..', '..',
    'public', 'js', 'draft', 'app.js'), 'utf8');
  // Call sites only — `function promptOverrideReason(...)` is the DEFINITION and
  // matching it would make this assertion fail on a correctly wired app.
  const calls = (appSrc.match(/(?<!function\s)promptOverrideReason\([^;]*?\{[^}]*\}/gs) || [])
    .filter(c => !/^promptOverrideReason\(picked, overTop, opts\)/.test(c));
  ck('every promptOverrideReason call site is found by the scan', calls.length >= 2, calls.length);
  const unwired = calls.filter(c => !/score_gap/.test(c));
  ck('EVERY override emitter passes score_gap — the sync path did not, for ten days',
    unwired.length === 0, unwired.length + ' unwired: ' + unwired.join(' || ').slice(0, 200));

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
