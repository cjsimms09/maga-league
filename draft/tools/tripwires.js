// TERRITORY: A
/* FOUR TRIPWIRES — DIAGNOSTIC ASSERTIONS, NEVER BEHAVIOUR.
 *
 * Cory's specification, 2026-08-14, and the architectural rule is absolute:
 *
 *   A TRIPWIRE CAN SAY "INVESTIGATE THIS RECOMMENDATION."
 *   IT CANNOT SAY "CHANGE THIS RECOMMENDATION."
 *
 * Not a scoring term, not a penalty, not a weight. Nothing in this file returns
 * a number the engine could multiply by. `observe()` returns strings and
 * evidence; there is no code path from here into scorePlayer, and
 * tripwires.test.js asserts that engine.js does not reference this module.
 *
 * WHY THE RULE IS ABSOLUTE HERE SPECIFICALLY. The temptation is to encode
 * "never take a QB before round 8". That is folklore, it is format-dependent,
 * and this model has correctly avoided it. Worse, adding it now would MAKE THE
 * SYMPTOM DISAPPEAR WHILE LEAVING THE DEFECT INTACT — and a symptom hidden by a
 * correction is worse than a visible one, because it removes the only signal
 * saying something is wrong, and Cory would then draft on it believing it fixed.
 *
 * RULE 15 IN FULL. A tripwire is an UNVALIDATED signal. Invisible during a live
 * draft; visible in mocks and after the draft concludes. `observe()` returns an
 * empty list for mode 'live' and says why. These are instruments for finding
 * model failure before the 22nd, not nudges for overriding the model during it.
 *
 * THE THRESHOLD IS A STORED PERCENTILE, NOT A HAND-PICKED GAP. "ADP deviation:
 * 99.2nd percentile" is a statement about a distribution. "39 picks early" is an
 * intuition with a number attached, and a hand-picked N is how a tolerance band
 * gets chosen to make today pass. The distribution is built by
 * tripwire_calibrate.js and passed in; a missing distribution makes that
 * tripwire report UNCALIBRATED rather than silently falling back to a guess.
 *
 * Pure. No I/O, no engine import, no board. Runner: tripwire_calibrate.js.
 */
'use strict';

/* Positions with exactly one starting slot. Derived from the league's starters
 * map rather than hardcoded, because "one-start position" is a fact about the
 * format and QB/TE/K/DEF are only one-start in ours. */
function oneStartPositions(starters) {
  return Object.keys(starters || {})
    .filter(pos => pos !== 'FLEX' && Number(starters[pos]) === 1);
}

/* ── 1. CONCENTRATION ──────────────────────────────────────────────────────
 * Two or more players at a one-start position inside the first N picks. */
/* "INSIDE THE FIRST TEN PICKS" IS AMBIGUOUS AND THE TEST CAUGHT IT.
 *
 * It can mean my first ten SELECTIONS, or overall picks 1-10 of the draft. In a
 * ten-team league those differ by a factor of ten, and the first version sliced
 * the array — my first ten selections — without saying so. A reader checking
 * "2 TE inside first 10" against a board would look at overall picks 1-10, find
 * one tight end, and conclude the tripwire was broken.
 *
 * SELECTIONS is the right unit for a concentration signal: it asks how much of
 * MY early capital went to a one-start position, and that is a fact about my
 * draft, not about where my seat happens to sit. It is now named as such, and
 * `withinOverallPick` is available for the other reading. */
function concentration(myPicks, starters, opts) {
  const o = opts || {};
  const withinFirst = o.withinFirstSelections || o.withinFirst || 10;
  const single = oneStartPositions(starters);
  const scope = o.withinOverallPick
    ? myPicks.filter(p => Number(p.pick) <= o.withinOverallPick)
    : myPicks.slice(0, withinFirst);
  const out = [];
  single.forEach(pos => {
    const hits = scope.filter(p => p.position === pos);
    if (hits.length >= 2) {
      out.push({
        kind: 'concentration',
        text: 'CONCENTRATION: ' + hits.length + ' ' + pos + ' selections inside '
          + (o.withinOverallPick ? 'overall pick ' + o.withinOverallPick
            : 'my first ' + withinFirst + ' selections') + '.',
        evidence: { position: pos, count: hits.length, starting_slots: 1,
          picks: hits.map(h => ({ pick: h.pick, name: h.name })) },
      });
    }
  });
  return out;
}

/* ── 2. DEVIATION FROM THE REFERENCE, AS A PERCENTILE ──────────────────────
 * `distribution` is a sorted array of deviations (adp - pick; positive = the
 * pick was a reach). Built empirically by tripwire_calibrate.js. */
function percentileOf(sortedAsc, value) {
  if (!sortedAsc || !sortedAsc.length) return null;
  let lo = 0, hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= value) lo = mid + 1; else hi = mid;
  }
  return (100 * lo) / sortedAsc.length;
}

function deviation(myPicks, distribution, opts) {
  const at = (opts && opts.flagAtPercentile) != null ? opts.flagAtPercentile : 99;
  if (!distribution || !distribution.values || !distribution.values.length) {
    /* UNCALIBRATED IS NOT ZERO AND IS NOT FINE. Emitting no observation here
     * would read as "checked, nothing unusual". Same reasoning as
     * field_population's uncounted rule: a rate needs a denominator. */
    return [{
      kind: 'deviation',
      text: 'UNCALIBRATED: no empirical deviation distribution supplied, so no '
        + 'percentile can be computed. This tripwire did not run.',
      evidence: { calibrated: false },
    }];
  }
  const vals = distribution.values;
  const out = [];
  myPicks.forEach(p => {
    if (p.adp == null || !isFinite(Number(p.adp))) return;
    const dev = Number(p.adp) - Number(p.pick);      // positive = reach
    const pct = percentileOf(vals, dev);
    if (pct != null && pct >= at) {
      out.push({
        kind: 'deviation',
        text: 'ADP deviation: ' + pct.toFixed(1) + 'th percentile — ' + p.name
          + ' at ' + p.pick + ' (market ' + Math.round(Number(p.adp)) + ').',
        evidence: { pick: p.pick, name: p.name, adp: Number(p.adp),
          deviation: dev, percentile: pct,
          population: distribution.population, n: vals.length },
      });
    }
  });
  return out;
}

/* ── 3. POSITIONAL DISTRIBUTION vs THE REFERENCE'S ─────────────────────────
 * Against the reference's distribution, never against a count. "Model QB 3 RB 2
 * WR 6 TE 1 against reference QB 1 RB 4 WR 5 TE 2" says something entirely
 * different from "three QBs is a lot". */
function counts(picks) {
  const c = {};
  picks.forEach(p => { c[p.position] = (c[p.position] || 0) + 1; });
  return c;
}

function distribution(myPicks, refPicks, opts) {
  const firstN = (opts && opts.firstN) || 12;
  const minGap = (opts && opts.minGap) != null ? opts.minGap : 2;
  const mine = counts(myPicks.slice(0, firstN));
  const ref = counts(refPicks.slice(0, firstN));
  const positions = Array.from(new Set(Object.keys(mine).concat(Object.keys(ref)))).sort();
  const diffs = positions.map(pos => ({ pos, mine: mine[pos] || 0, ref: ref[pos] || 0 }))
    .filter(d => Math.abs(d.mine - d.ref) >= minGap);
  if (!diffs.length) return [];
  return [{
    kind: 'positional_distribution',
    text: 'DISTRIBUTION over first ' + firstN + ': model '
      + positions.map(p => p + ' ' + (mine[p] || 0)).join(' ')
      + '  |  reference ' + positions.map(p => p + ' ' + (ref[p] || 0)).join(' ')
      + '.  Differs by ' + minGap + '+ at: ' + diffs.map(d => d.pos).join(', ') + '.',
    evidence: { firstN: firstN, model: mine, reference: ref, divergent: diffs },
  }];
}

/* ── 4. POSITION TAKEN BEFORE THE REFERENCE'S FIRST AT THAT POSITION ───────
 * Secondary to the other three on its own, and much more interesting when it
 * COINCIDES with concentration — so it says when it does. */
function firstAt(picks, pos) {
  for (const p of picks) if (p.position === pos) return p.pick;
  return null;
}

function timing(myPicks, refPicks, starters, opts) {
  const minPicksEarly = (opts && opts.minPicksEarly) != null ? opts.minPicksEarly : 1;
  const positions = Array.from(new Set(myPicks.map(p => p.position))).sort();
  const concentrated = new Set(concentration(myPicks, starters, opts)
    .map(o => o.evidence.position));
  const out = [];
  positions.forEach(pos => {
    const mineAt = firstAt(myPicks, pos);
    const refAt = firstAt(refPicks, pos);
    if (mineAt == null || refAt == null) return;
    if (refAt - mineAt < minPicksEarly) return;
    out.push({
      kind: 'timing',
      text: 'TIMING: first ' + pos + ' at ' + mineAt + ', reference\'s first at '
        + refAt + ' (' + (refAt - mineAt) + ' picks earlier)'
        + (concentrated.has(pos) ? ' — AND concentrated at this position.' : '.'),
      evidence: { position: pos, model_first: mineAt, reference_first: refAt,
        picks_earlier: refAt - mineAt, coincides_with_concentration: concentrated.has(pos) },
    });
  });
  /* Ordered so a timing signal that coincides with concentration reads first —
   * Cory's point that TE1 at 12 alone is one signal, TE1 at 12 with TE2 at 19 is
   * two. */
  return out.sort((a, b) => (b.evidence.coincides_with_concentration ? 1 : 0)
    - (a.evidence.coincides_with_concentration ? 1 : 0));
}

/* ── THE VISIBILITY GATE (rule 15) ─────────────────────────────────────────*/
const MODES = { live: false, mock: true, post: true };

function observe(input) {
  const mode = input && input.mode;
  if (!Object.prototype.hasOwnProperty.call(MODES, mode)) {
    throw new Error('tripwires.observe: mode must be one of '
      + Object.keys(MODES).join('/') + ' — an unspecified mode would default to '
      + 'visible, and rule 15 requires the live case to be the explicit one.');
  }
  if (!MODES[mode]) {
    return { mode: mode, visible: false, observations: [],
      why: 'RULE 15 — a tripwire is an unvalidated signal and is invisible during '
        + 'a live draft. Run it on the mock, or after the draft concludes.' };
  }
  const my = input.myPicks || [];
  const ref = input.referencePicks || [];
  const starters = input.starters || {};
  const opts = input.opts || {};
  const obs = []
    .concat(concentration(my, starters, opts))
    .concat(deviation(my, input.deviationDistribution, opts))
    .concat(distribution(my, ref, opts))
    .concat(timing(my, ref, starters, opts));
  return { mode: mode, visible: true, observations: obs,
    why: 'Diagnostic only. Every line above is an assertion that something is '
      + 'UNUSUAL, not that it is wrong, and nothing here changes a recommendation.' };
}

const API = { observe, concentration, deviation, distribution, timing,
  percentileOf, oneStartPositions, MODES };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.DraftTripwires = API;
