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
function canonicalStates(players, art) {
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
    /* OUR REAL CONDITION MEANS OUR REAL KEEPERS. This used to be "the best WR and
     * the best two RBs on the board, flagged is_keeper" — a synthetic stand-in for
     * a fact the artifact already carries. Our actual keepers are Ja'Marr Chase,
     * Derrick Henry and Kenneth Walker on seat 4, so they are read from
     * kept_players rather than invented.
     *
     * AND IT CHANGES NOTHING, WHICH IS THE POINT WORTH RECORDING. Measured at pick
     * 34: empty roster, the old synthetic three, and the real three all emit a
     * byte-identical surface (mass 5.258, same top ten, same rule headline). The
     * cause is not a bug — MEASURED_WEIGHTS carries need: 0, so the roster cannot
     * reach the composite, and both keeper sets are 1 WR + 2 RB, which leaves
     * needrule the same openings. A four-QB roster moves it only by 0.013, and
     * only because two of those QBs were still on the board.
     *
     * So this state currently costs a slot and buys nothing, and the frozen file
     * will show it as a duplicate of early-empty. Recorded rather than papered
     * over: the honest coverage of this baseline is THREE distinct pick regimes,
     * not four states. */
    { name: 'keeper-loaded (our real condition)', currentPick: 34, nextPick: 41,
      roster: (((art || {}).kept_players) || [])
        .map(p => Object.assign({}, p, { is_keeper: true })) },
  ];
}

function round(x, n) {
  return x == null ? null : Math.round(x * Math.pow(10, n)) / Math.pow(10, n);
}

function surfaceFor(state, players, league, art) {
  art = art || {};
  // MY SEAT, from the artifact rather than a literal. The seat-collapse defect
  // came from a 4 that was typed somewhere instead of read from the league.
  const mySlot = (league || {}).my_draft_slot;
  // roomProfiles(): every profiled manager, minus me. my_manager_id is undefined
  // in this artifact so the app's filter is a no-op there too — mirrored, not
  // improved, because an improvement here would be a divergence.
  const mgrs = ((art.manager_profiles || {}).managers) || {};
  const me = (league || {}).my_manager_id || null;
  const roomProfiles = Object.keys(mgrs).map(k => mgrs[k]).filter(Boolean)
    .filter(m => !me || String(m.manager_id) !== String(me));
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
  /* THE CONTEXT MUST MIRROR THE APP'S, or the baseline freezes a world the tool
   * never runs in. Diffed against app.js's live ctx on 2026-08-11 and it was
   * short FIVE fields, one of them decisive:
   *
   *   intervening: []   -> LAYER 2 NEVER RAN. survival.js gates the roster-need
   *                        + room-mixture layer on `ctx.intervening.length`, so
   *                        every frozen surface was a LAYER-1-ONLY world while
   *                        the app runs Layer 2 whenever a draft is live. The
   *                        baseline could not have detected a Layer-2 regression
   *                        because it never executed that code.
   *   runMultipliers    -> run detection scales the survival hazard; unexercised.
   *   drift             -> the global ADP drift correction; unexercised.
   *   currentKeepers    -> the keeper-option bar reads it.
   *   ceilingAllStages  -> the app pins it false; absence was equivalent, but it
   *                        is stated so the equivalence is deliberate.
   *
   * This is why the baseline stayed 51/51 green through the currentPick fix: it
   * was not agreeing with the app, it was testing a different context. "No drift"
   * was silence.
   *
   * AND A POPULATED `intervening` IS STILL NOT ENOUGH. My first attempt pushed
   * bare pick numbers, the suite stayed 51/51 green, and Layer 2 was STILL dark:
   * precomputeLayer2 filters on `t.pick_no >= currentPick`, and `undefined >= 34`
   * is false, so every entry was silently discarded and the function returned
   * null exactly as it had with an empty array. A second silence wearing the same
   * face as the first. Layer 2 needs the app's element SHAPE —
   * {team_slot, pick_no, roster, profile, room} — not just a count of picks.
   *
   * So it is built the way interveningPicks() builds it: from the REAL
   * pick_order.picks in [currentPick, nextPick), with MY OWN SEAT REMOVED. My
   * seat is 4 and pick 34 is mine, so leaving it in would have the survival model
   * thin the board against a pick I am the one making.
   */
  const interveningPicks = (((art || {}).pick_order || {}).picks || [])
    .filter(p => p.overall >= state.currentPick && p.overall < state.nextPick
                 && p.slot !== mySlot)
    .map(p => ({
      team_slot: p.slot,
      pick_no: p.overall,
      // HONEST, AND NAMED AS A RESIDUAL GAP. The app reads state.rosters[slot],
      // which is EMPTY until picks are marked live — and the artifact carries
      // keepers for seat 4 only (3 of them, all mine), so opponent rosters are
      // genuinely unknown pre-draft rather than merely unfetched. `[]` is what
      // the app itself holds at load. It is not what it holds at live pick 34,
      // and that difference is the one thing this context still does not mirror.
      roster: [],
      // null, exactly as profileForSlot returns until importDraftOrder resolves
      // seats by uid — the manager profiles carry no draft_slot (0 of 10), so a
      // name here would be a hash ordering wearing a person's identity.
      profile: null,
      // ...which is precisely why `room` exists: the seat is unnamed but the ROOM
      // is known. survival.js mixes over the measured managers instead of falling
      // back to a league-average stranger.
      room: roomProfiles,
    }));

  const ctx = {
    board: board, roster: state.roster || [], league: league,
    currentPick: state.currentPick, nextPick: state.nextPick,
    weights: E.MEASURED_WEIGHTS,
    totalPicks: 150, myPicksLeft: 8, myPickIndex: 1, totalMyPicks: 12,
    progress: state.currentPick / 150, roundsLeft: Math.max(1, 15 - Math.ceil(state.currentPick / 10)),
    intervening: interveningPicks,
    runMultipliers: {},
    drift: null,
    currentKeepers: (state.roster || []).filter(p => p.is_keeper),
    ceilingAllStages: false,
  };
  /* THE GATE ON THE MIRROR ITSELF. Two attempts at this context both produced a
   * Layer-1-only world while reporting nothing wrong, so "did Layer 2 actually
   * run?" is now ASSERTED rather than assumed. A baseline that silently degrades
   * to one layer is the failure this whole re-freeze exists to correct, and it
   * has now happened twice — it does not get a third chance to be quiet. */
  const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
  const probe = board[0] && S.layer2Taken(board[0], state.nextPick, ctx);
  if (!probe) {
    throw new Error('freeze_baseline: Layer 2 did not run for state "' + state.name
      + '" (' + interveningPicks.length + ' intervening picks supplied). The frozen '
      + 'surface would be a LAYER-1-ONLY world and would silently pass while the '
      + 'app runs two layers. Refusing to freeze it.');
  }
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
    /* SIX DECIMALS, BECAUSE A GUARD CANNOT BE FINER THAN WHAT IT READS. At three
     * this was rounded to 0.001 of mass, which over 6 opponent picks is 1.7e-4 of
     * ratio — so a conservation ceiling written as `<= 1 + 1e-9` actually admitted
     * anything up to ~1.00017. Breaking the live ratio to 1.0000001 left it GREEN.
     * The check claimed a precision the number it reads does not carry, which is
     * rule 10b inside the fix for rule 10b. */
    survival_mass: round(mass, 6),
    /* HOW MANY PICKS THE MASS IS ANSWERABLE TO. Conservation is the identity
     * "expected departures = picks that actually happen", and the denominator is
     * OPPONENT picks — the window minus my own slot — because a player I take is
     * not a player who got away. Frozen alongside the mass so the ratio can be
     * read off the file instead of recomputed from memory. */
    opponent_picks_in_window: interveningPicks.length,
    conservation_ratio: interveningPicks.length
      ? round(mass / interveningPicks.length, 6) : null,
    /* THE LAYERS THAT ACTUALLY RAN. v1 froze a Layer-1-only world and reported
     * nothing wrong for it; two separate attempts to fix that also produced
     * Layer-1-only worlds in silence. The count is now part of the frozen
     * surface, so a degrade to one layer is a DIFF, not a quiet agreement. */
    survival_layers: probe ? ['adp', 'intervening'] : ['adp'],
  };
}

function build() {
  const art = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const players = art.players.filter(p => p.vorp != null);
  const league = art.league;
  const states = canonicalStates(players, art);
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
    surfaces: states.map(s => surfaceFor(s, players, league, art)),
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
  /* A NEW VERSION MUST SAY WHY IT EXISTS. Rule 6 allows a deliberate re-freeze
   * and forbids the reference quietly following the code — but a v2 with no
   * stated reason is indistinguishable from the forbidden case a month later,
   * when nobody remembers which it was. So the reason is required at freeze time
   * and stored IN the artifact, next to the numbers it explains. */
  const wi = args.indexOf('--why');
  const why = wi >= 0 ? args[wi + 1] : '';
  if (version !== 'v1' && !why) {
    console.error('REFUSING to freeze ' + version + ' without --why "<reason>".');
    console.error('A new baseline with no stated reason cannot later be told apart');
    console.error('from the reference silently following the code (binding rule 6).');
    process.exit(1);
  }
  built._why = why || null;
  built.frozen_at = new Date().toISOString();
  fs.writeFileSync(dest, JSON.stringify(built, null, 2) + '\n');
  console.log('froze ' + dest);
}

module.exports = { build, canonicalStates, surfaceFor };
