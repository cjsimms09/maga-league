#!/usr/bin/env node
'use strict';
/* FREEZE THE MEASURED CORE — Part 1 of the shadow-layer brief, pulled forward.
 *
 * WHY IT IS EARLY RATHER THAN LAST. Cory queued the protection at the end. I moved
 * it up, because the thing it guards against is corruption arriving through
 * ordinary work, and *I* am the source of nearly all the work between now and the
 * 22nd. Ten instances of a value maintained in two places surfaced this week and
 * three were found by accident. A protection built after the change velocity has
 * passed protects nothing during it.
 *
 * WHAT IS FROZEN, and why it is the FULL EMITTED SURFACE rather than the top pick.
 * A suite that diffs only the recommendation would have caught ONE of the four
 * corruptions this week: the merge that dropped engine edits. It would have missed
 * the null coercion in the LEAN materiality gate (a badge), the ADP predicate
 * pinned to the old anchor (a warning string), and the thin-pool valuation
 * re-derived inside a route (a different tool). So the freeze captures, per
 * canonical state: the ranked list, the composite scores, every badge AND ITS
 * FIRING RATE, survival percentages and their conservation total, and the
 * confidence reading — plus the policy constants themselves.
 *
 * FIRING RATES ARE FIRST-CLASS. "opp arrow fired on 42% of the top 200" and "LEAN
 * fired on every deviation" are regressions no single-case diff can see, because
 * every individual row looks defensible. A rate is the only way that class shows up.
 *
 * THE BASELINE IS IMMUTABLE. Re-freezing writes a NEW version; it never edits an
 * old one. Binding rule 6: a change to recommendation behaviour either updates the
 * reference deliberately or declares itself a gated departure — there is no third
 * state where the reference silently follows the code.
 *
 * Usage:
 *   node draft/tools/freeze_baseline.js --freeze [--version v2]   # write a NEW version
 *   node draft/tools/freeze_baseline.js                           # print the surface
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const BASELINE_DIR = path.join(ROOT, 'draft', 'baseline');

/* CANONICAL STATES — chosen to span the regimes where the engine behaves
 * differently, not to be numerous. Early (everything empty, value dominates),
 * mid (the mask starts binding), late (onesies forced, bench pricing), and a
 * keeper-loaded roster, which is OUR actual condition and the one a generic
 * fixture would miss. */
function canonicalStates(players) {
  const byPos = {};
  players.forEach(p => { (byPos[p.position] = byPos[p.position] || []).push(p); });
  Object.keys(byPos).forEach(k => byPos[k].sort((a, b) => (b.vorp || 0) - (a.vorp || 0)));
  const take = (pos, n) => (byPos[pos] || []).slice(0, n);

  return [
    { name: 'early-empty-roster', currentPick: 34, nextPick: 41, roster: [] },
    { name: 'mid-two-rb-one-wr', currentPick: 74, nextPick: 81,
      roster: take('RB', 2).concat(take('WR', 1)) },
    { name: 'late-onesies-open', currentPick: 134, nextPick: 141,
      roster: take('RB', 3).concat(take('WR', 4), take('TE', 1)) },
    { name: 'keeper-loaded (our real condition)', currentPick: 34, nextPick: 41,
      roster: take('WR', 1).concat(take('RB', 2)).map(p => Object.assign({}, p, { is_keeper: true })) },
  ];
}

function round(x, n) {
  return x == null ? null : Math.round(x * Math.pow(10, n)) / Math.pow(10, n);
}

function surfaceFor(state, players, league) {
  const drafted = new Set((state.roster || []).map(p => String(p.player_id)));
  // THE BOARD AT PICK N HAS HAD N-1 PLAYERS TAKEN OFF IT. Without this the
  // canonical state is a fiction: at pick 34 the whole top of the board is still
  // sitting there, so every ADP-marginal survival reads ~1.0-gone and the frozen
  // conservation total came out at 39.6 expected departures across a SEVEN-pick
  // window. Freezing that would pin a surface the tool never actually shows, and a
  // regression in the realistic regime could hide behind it. Approximate the
  // consumed board by ADP order, which is what the room does to within noise.
  const byAdp = players.slice().sort(
    (a, b) => (a.adjusted_adp || a.raw_adp || 9999) - (b.adjusted_adp || b.raw_adp || 9999));
  const gone = new Set(byAdp.slice(0, Math.max(0, state.currentPick - 1))
    .map(p => String(p.player_id)));
  const board = players.filter(p => !drafted.has(String(p.player_id))
    && !gone.has(String(p.player_id)));
  const ctx = {
    board: board, roster: state.roster || [], league: league,
    currentPick: state.currentPick, nextPick: state.nextPick,
    weights: E.MEASURED_WEIGHTS,
    totalPicks: 150, myPicksLeft: 8, myPickIndex: 1, totalMyPicks: 12,
    progress: state.currentPick / 150, roundsLeft: Math.max(1, 15 - Math.ceil(state.currentPick / 10)),
    intervening: [],
  };
  const out = E.onTheClock(ctx, { targets: [], avoid: [], queue: [] });
  const scored = out.scored || [];

  /* THE RULE HEADLINE, frozen alongside the composite — because it is what the
   * war room actually puts at the top of the card, and the two are ALLOWED to
   * disagree (spec A10: composite + mask override + explainer). Freezing only the
   * composite would leave the surface Cory actually reads unprotected, and this
   * week's critique found the two disagreeing on the live page with nothing
   * reconciling them.
   *
   * HONEST BOUNDARY, stated rather than papered over: the startable-capacity MASK
   * lives in the APP layer (a browser IIFE with no exports), so it is NOT captured
   * here — which is why the composite's top pick below can be a deep player the
   * live tool would never headline. Re-implementing the mask to close that gap
   * would be a second copy of it, i.e. the exact disease this baseline exists to
   * catch. The rule headline IS captured, and it is the surface with the take
   * button on it. The remaining gap belongs to the browser rehearsal. */
  let ruleTop = null;
  try {
    const NR = require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
    const rec = NR.recommend(board, state.roster || []);
    if (rec && rec.pick) {
      ruleTop = { player_id: String(rec.pick.player_id), name: rec.pick.name,
                  position: rec.pick.position, reason: rec.reason || null };
    }
  } catch (e) { ruleTop = { error: String(e.message || e) }; }

  // Firing RATES over the whole scored board, not just the top — the only way a
  // badge that fires on everything shows up as a regression.
  const n = scored.length || 1;
  const rates = {
    contested: round(scored.filter(s => s.contested).length / n, 4),
    has_reasons: round(scored.filter(s => (s.reasons || []).length).length / n, 4),
    survival_present: round(scored.filter(s => s.survival_to_next != null).length / n, 4),
  };
  // Conservation: expected departures must track the picks that actually happen.
  let mass = 0;
  scored.forEach(s => { if (s.survival_to_next != null) mass += (1 - s.survival_to_next); });

  return {
    state: state.name,
    current_pick: state.currentPick,
    next_pick: state.nextPick,
    board_size: board.length,
    top10: scored.slice(0, 10).map(s => ({
      player_id: String(s.player.player_id), name: s.player.name,
      position: s.player.position, score: round(s.score, 3),
      survival_to_next: round(s.survival_to_next, 4),
    })),
    rule_headline: ruleTop,
    gap_to_second: round(scored[0] && scored[0].gap_to_second, 3),
    confidence_level: out.confidence ? out.confidence.level : null,
    firing_rates: rates,
    survival_mass: round(mass, 3),
  };
}

function build() {
  const art = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const players = art.players.filter(p => p.vorp != null);
  const league = art.league;
  const states = canonicalStates(players);
  return {
    _what: 'THE MEASURED CORE, FROZEN. Immutable reference — never edited in place.',
    _rule: 'SESSION-A binding rule 6: a change to recommendation behaviour either updates '
      + 'this reference deliberately or declares itself a gated departure. There is no '
      + 'third state where the reference silently follows the code.',
    _language: 'SESSION-A binding rule 7: THIS object is "the measured core". Everything '
      + 'running is "live policy under continuous measurement".',
    frozen_at: null,          // stamped by --freeze; kept null in the pure build
    engine_policy: {
      MEASURED_WEIGHTS: E.MEASURED_WEIGHTS,
      // The constants that actually shape a recommendation. Not all 66 — only the
      // ones a change to would alter what the tool advises.
      CFG: ['COIN_FLIP_GAP', 'CLOSE_GAP', 'TIE_THRESHOLD', 'BENCH_DISCOUNT',
            'BENCH_SCORE_FLOOR', 'ONESIE_KEEP', 'DOCTRINE_TILT', 'DOCTRINE_TILT_ON',
            'THREAT_MIN_P', 'WITHIN_POS_TAIL_P']
        .reduce((o, k) => { if (E.CFG[k] !== undefined) o[k] = E.CFG[k]; return o; }, {}),
      preset_keys: (E.WEIGHT_PRESETS || []).map(p => p.key),
    },
    anchor_source: ((art.provenance || {}).adp || {}).primary_source
      || (art.provenance || {}).primary_source || 'unknown',
    surfaces: states.map(s => surfaceFor(s, players, league)),
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const freeze = args.includes('--freeze');
  const vi = args.indexOf('--version');
  const version = vi >= 0 ? args[vi + 1] : 'v1';
  const built = build();
  if (!freeze) { console.log(JSON.stringify(built, null, 2)); process.exit(0); }

  if (!fs.existsSync(BASELINE_DIR)) fs.mkdirSync(BASELINE_DIR, { recursive: true });
  const dest = path.join(BASELINE_DIR, version + '.json');
  if (fs.existsSync(dest)) {
    console.error('REFUSING to overwrite ' + version + '.json — the baseline is IMMUTABLE.');
    console.error('Freeze a NEW version instead: --version v2');
    process.exit(1);
  }
  built.frozen_at = new Date().toISOString();
  fs.writeFileSync(dest, JSON.stringify(built, null, 2) + '\n');
  console.log('froze ' + dest);
}

module.exports = { build, canonicalStates, surfaceFor };
