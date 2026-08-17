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

const PINNED_ENGINE_KEYS = [
        // decided by measurement: BINDS or FRAGILE
        'COIN_FLIP_GAP', 'CLOSE_GAP', 'TIE_THRESHOLD', 'CONSERVE_SURVIVAL_ON',
        'DOCTRINE_TILT_ON', 'FLEX_DISCOUNT', 'ONESIE_DISCOUNT',
        'ONESIE_NEED_DISCOUNT', 'ONESIE_NEED_INSURANCE', 'CEILING_MAX_BONUS',
        'CEILING_TIEBREAK', 'RAIL_DEFAULT_POS_CAP', 'RAIL_RUNAWAY_RATIO',
        'STAGE2_CAP', 'VALUE_WEIGHT_FLOOR', 'VONA_SLOT_AWARE',
        'AUTO_ANCHOR_ROUNDS', 'AUTO_BUILD_ROUNDS',
        'SURVIVOR_CUTOFF', 'PATHS_CLIFF_URGENCY', 'RAIL_ADP_AHEAD',
        'CEILING_SPREAD_SHARE', 'CEILING_LATE_FROM', 'RAIL_COMPONENT_RATIO',
        'AUTO_FILL_ROUNDS',
        // inert on this board, policy by content — pinned deliberately
        'ONESIE_KEEP', 'ONESIE_ENDGAME_PICKS', 'ONESIE_EXTREME_ADP',
        'ONESIE_ELITE_RANK', 'BENCH_CEILING_FLOOR', 'BENCH_RISK_FLOOR',
        'BENCH_DISCOUNT', 'FLEX_ALT_WEIGHT', 'DOCTRINE_TILT',
        'ADP_SD_FLOOR', 'ADP_SD_RATE', 'ADP_SD_CAP',
        'RUN_WINDOW', 'RUN_DAMPING', 'RUN_MIN', 'RUN_MAX', 'RUN_BANNER_AT',
        'STAGE2_CAP_T', 'RAIL_LATE_ROUNDS', 'AUTO_TIGHT_PICKS', 'THREAT_MIN_P',
      ];


const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const BASELINE_DIR = path.join(ROOT, 'draft', 'baseline');

/* THE ACTIVE BASELINE VERSION IS DECLARED ONCE, HERE.
 *
 * It names two files that must agree: the frozen surface (vN.json) and the board
 * that surface was computed against (artifact_vN.json). Declaring the version in
 * two places is how they come apart — pin artifact_v6 while the regression test
 * still reads v6.json against the v5 board, and the suite goes green on a
 * comparison nobody intended. Both paths derive from this constant, and the
 * regression test imports it rather than repeating the literal. */
/* v20 -> v21, 2026-08-17, DOC-MIRROR KEYS ONLY: engine.js's CFG.ADP_SD_
 * {FLOOR,RATE} now read survival.js's CFG instead of hand-copying it, and the
 * live values moved 3.0/0.15 -> 2.0/0.11 — the pair Cory's adp_sd ruling had
 * already shipped in survival.js/keepers.py. v20 froze the STALE copy the same
 * day the ruling landed, so the reference was preserving exactly the drift the
 * delegation removes. No recommendation surface moved: SURVIVAL_CFG and every
 * frozen surface are identical to v20 (same pinned board, byte-identical). */
const ACTIVE_VERSION = 'v21';
const BASELINE_PATH = path.join(BASELINE_DIR, ACTIVE_VERSION + '.json');

/* CANONICAL STATES — THREE PICK REGIMES, and the count is deliberately three.
 *
 * Early (everything empty, value dominates), mid (the mask starts binding), late
 * (onesies forced, bench pricing). Chosen to span the regimes where the engine
 * behaves differently, not to be numerous.
 *
 * There WAS a fourth, "keeper-loaded (our real condition)". It was removed on
 * 2026-08-11 because it emitted a byte-identical surface to early-empty-roster —
 * see the note where it used to sit, and the condition under which it must come
 * back. Four states that cover three regimes is a count that flatters itself; the
 * honest number is what is written here. */
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
    /* THE FOURTH STATE IS GONE, AND THE COUNT IS THE HONEST ONE. Cory, 2026-08-11:
     * "say that in the freeze rather than keeping a fourth state that makes the
     * count look better."
     *
     * There used to be a `keeper-loaded (our real condition)` state here. It
     * emitted a BYTE-IDENTICAL surface to early-empty-roster — same mass, same top
     * ten, same rule headline — measured three ways at pick 34: an empty roster,
     * the old synthetic stand-in (top WR + top two RBs), and our REAL keepers
     * (Chase, Henry, Walker, read from kept_players). All three the same.
     *
     * The cause is not a bug. MEASURED_WEIGHTS carries `need: 0`, so the roster
     * cannot reach the composite at all, and every keeper set tried is 1 WR + 2 RB,
     * which leaves needrule the same openings. A deliberately lopsided four-QB
     * roster moved the mass by 0.013 — and only because two of those QBs were
     * still on the board to be removed from it.
     *
     * ══ THE CONDITION UNDER WHICH THIS BECOMES WRONG ══
     * Recorded as a live condition, not a closed question. WITH need AT ZERO THE
     * FROZEN BASELINE IS INSENSITIVE TO OUR ROSTER ENTIRELY. If `need` ever
     * becomes nonzero — through the graduation gate, or through a shadow-strategy
     * promotion — a keeper-loaded state starts buying real coverage immediately
     * and this baseline needs a fourth state again. The regression suite asserts
     * `MEASURED_WEIGHTS` including need, so that change cannot land quietly; what
     * it cannot do is remind anyone to revisit THIS decision, which is why the
     * condition is written down beside the thing it governs. */
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

/* ══ THE BASELINE READS A PINNED ARTIFACT, NOT THE LIVE BOARD ══
 *
 * THE PROBLEM THIS SOLVES, stated as the failure it was heading for. This tool
 * used to read the LIVE public/draft_data.json, so the frozen surface was a
 * function of the DATA as much as of the CODE — and it could not tell the two
 * apart. The scheduled rebuild on 2026-08-11 changed 1,718 adjusted_adp values,
 * the baseline went red, and the honest response was to re-freeze.
 *
 * That is fine ONCE. With a DAILY rebuild it is fatal: the suite goes red every
 * day, re-freezing becomes reflex, and the reference silently follows the data.
 * That is precisely the third state binding rule 6 forbids, arrived at by habit
 * rather than by any decision anyone would defend.
 *
 * SO THE BASELINE NOW ISOLATES CODE. `draft/baseline/artifact_vN.json` is the
 * board the surface was frozen against, pinned beside it and immutable for the
 * same reason the surface is. A red suite now means RECOMMENDATION BEHAVIOUR
 * CHANGED — which is what the file has claimed all along.
 *
 * DATA DRIFT DOES NOT GO UNWATCHED, it just stops being this suite's job:
 * `artifact_drift` below reports what moved between the pinned board and the
 * live one, so a refresh is visible without being a failure.
 *
 * Override with BASELINE_ARTIFACT=<path> to freeze against a different board on
 * purpose (a new version pins its own).
 */
function artifactPath() {
  if (process.env.BASELINE_ARTIFACT) return process.env.BASELINE_ARTIFACT;
  const pinned = path.join(BASELINE_DIR, 'artifact_' + ACTIVE_VERSION + '.json');
  if (fs.existsSync(pinned)) return pinned;
  // NO SILENT FALLBACK TO THE LIVE BOARD. Falling back would restore exactly the
  // conflation this change removes, and it would do it invisibly.
  throw new Error('freeze_baseline: no pinned artifact at ' + pinned
    + '. The baseline must not read the live board — that is how a data refresh '
    + 'becomes indistinguishable from a code change. Pin one, or set '
    + 'BASELINE_ARTIFACT deliberately.');
}

/* BOARD IDENTITY IS THE BYTES, NOT THE TIMESTAMP — fixed 2026-08-15 from C's
 * routed evidence (ROUTES.md TO:A, 2026-08-14). `same_board` used to be
 * `pinned.built_at === live.built_at`, and built_at does not track content:
 * the board is REBUILT once (which stamps built_at) and then EDITED IN PLACE
 * by later commits. C reproduced it from git — three commits (ce866a5,
 * e77f834, 57ce958), three different sha256s, 31KB apart with 136 of the
 * first 400 player rows differing, all carrying built_at =
 * 2026-08-13T23:13:18Z. So the identity check answered "were these built by
 * the same run" while every reader took it as "are these the same board" —
 * a silent failure on exactly the day it matters, freezing a baseline
 * against the wrong board before the 22nd.
 *
 * The remedy is C's own board_pin.py shape: content-address with sha256 over
 * the raw bytes. built_at stays REPORTED (it is honest provenance about the
 * build event) but no longer decides identity. Pure and exported so the
 * fail-arm — same built_at, different bytes — is a test, not a war story. */
function boardIdentity(pinnedRaw, liveRaw) {
  const crypto = require('crypto');
  const sha = s => crypto.createHash('sha256').update(s).digest('hex');
  const pinnedSha = sha(pinnedRaw), liveSha = sha(liveRaw);
  return { pinned_sha256: pinnedSha, live_sha256: liveSha, same_board: pinnedSha === liveSha };
}

/** What moved between the PINNED board and the live one. Reported, never failed on. */
function artifactDrift() {
  const livePath = path.join(ROOT, 'public', 'draft_data.json');
  if (!fs.existsSync(livePath)) return { live_present: false };
  const pinnedRaw = fs.readFileSync(artifactPath(), 'utf8');
  const liveRaw = fs.readFileSync(livePath, 'utf8');
  const identity = boardIdentity(pinnedRaw, liveRaw);
  const pinned = JSON.parse(pinnedRaw);
  const live = JSON.parse(liveRaw);
  const pi = {}, li = {};
  pinned.players.forEach(p => { pi[String(p.player_id)] = p; });
  live.players.forEach(p => { li[String(p.player_id)] = p; });
  const common = Object.keys(pi).filter(k => li[k]);
  let projMoved = 0, adpMoved = 0;
  common.forEach(k => {
    if (Math.abs((pi[k].proj_mean || 0) - (li[k].proj_mean || 0)) > 1) projMoved++;
    if ((pi[k].adjusted_adp || 0) !== (li[k].adjusted_adp || 0)) adpMoved++;
  });
  return {
    live_present: true,
    pinned_built_at: pinned.built_at, live_built_at: live.built_at,
    // Content-addressed — see boardIdentity above. built_at is provenance
    // about the build EVENT; the sha256s are identity of the board ITSELF.
    pinned_sha256: identity.pinned_sha256, live_sha256: identity.live_sha256,
    same_board: identity.same_board,
    players_pinned: pinned.players.length, players_live: live.players.length,
    projections_moved_gt1: projMoved, adp_changed: adpMoved, compared: common.length,
  };
}

function build() {
  const art = JSON.parse(fs.readFileSync(artifactPath(), 'utf8'));
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
      /* WHAT THIS PINS, AND WHAT IT USED TO PIN (reviewed 2026-08-14, Cory's ruling).
       *
       * THE OLD LIST NAMED TEN KEYS AND DELIVERED EIGHT LIVE ONES.
       *   · WITHIN_POS_TAIL_P is not in the ENGINE's CFG at all — it lives in
       *     survival.js's own CFG (0.01, read at survival.js:677). The
       *     `!== undefined` guard below dropped it SILENTLY, so the baseline
       *     believed it pinned that constant and never did.
       *   · BENCH_SCORE_FLOOR is READ BY NOTHING. Its only two mentions in
       *     engine.js are comments, one of which says "retained only as a
       *     documented knob". Removed from the pin: a baseline that records
       *     inert knobs beside live ones makes the live ones harder to trust,
       *     and there is no way to tell them apart by looking. IT IS NOT GONE
       *     BY ACCIDENT — that is what this paragraph is for.
       *
       * THE SPLIT IS POLICY vs IMPLEMENTATION DETAIL, not bind vs inert.
       * cfg_sensitivity classified the 70 engine constants as 22 BINDS, 7
       * FRAGILE, 27 INERT, 13 UNTESTED. Inert is NOT the same as "not policy":
       * ONESIE_KEEP measures inert on this board and is the 90% backup discount;
       * BENCH_CEILING_FLOOR measures inert and is the exact class of floor that
       * silently re-enabled a zeroed weight. So the measurement is EVIDENCE and
       * the criterion is decision content:
       *   PINNED  — a silent change would alter which player is advised, or
       *             mischaracterise the advice. Includes everything feeding
       *             survival, because survival feeds expectedBestAvailable which
       *             IS vona.
       *   NOT PINNED — display depth and presentation counts (SHEET_*, PATHS_*,
       *             WEIGHT_DIFF_DEPTH, DG_* dollar rendering) where a change is
       *             visible on its face and cannot alter the ranking, and the
       *             opponent-model TELL_ and THREAT_ family, which this harness
       *             could not exercise (UNTESTED is not a finding either way and
       *             pinning on no evidence is how a baseline becomes noise). */
      CFG: PINNED_ENGINE_KEYS.reduce((o, k) => {
        /* NO SILENT DROP. The old reduce skipped a missing key and the baseline
         * looked complete; that is how WITHIN_POS_TAIL_P went unpinned for its
         * whole life. A named key that does not resolve is recorded as absent. */
        o[k] = E.CFG[k] !== undefined ? E.CFG[k] : '__ABSENT_FROM_CFG__';
        return o;
      }, {}),
      /* SURVIVAL CARRIES ITS OWN CFG AND NOBODY WAS PINNING IT. 31 keys, 23 of
       * which exist nowhere in the engine's config, all feeding the survival
       * curve that expectedBestAvailable integrates. Pinned whole: every one of
       * them can move vona, and none is a display value. */
      SURVIVAL_CFG: (function () {
        try {
          const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
          return S && S.CFG ? JSON.parse(JSON.stringify(S.CFG)) : '__SURVIVAL_CFG_UNREADABLE__';
        } catch (e) { return '__SURVIVAL_CFG_UNREADABLE__: ' + e.message; }
      })(),
      preset_keys: (E.WEIGHT_PRESETS || []).map(p => p.key),
    },
    /* WHAT FRACTION OF THE CONFIGURATION THIS BASELINE ACTUALLY COVERS.
     *
     * STATED ON THE ARTIFACT so a green from it is never read as meaning more
     * than it does. Before 2026-08-14 the baseline pinned 8 live keys of 70 in
     * the engine and 0 of 31 in survival, and REPORTED GREEN IDENTICALLY
     * whether it covered eight or all of them — it could not detect a change to
     * roughly 92% of the configuration a recommendation depends on. That is not
     * a claim the unpinned values were wrong; it is a statement that the guard
     * was coverage of a small minority and was being read as coverage. */
    _coverage: (function () {
      const eng = Object.keys(E.CFG).length;
      let sur = 0;
      try {
        const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
        sur = S && S.CFG ? Object.keys(S.CFG).length : 0;
      } catch (e) { sur = 0; }
      return {
        engine_cfg_total: eng,
        engine_cfg_pinned: PINNED_ENGINE_KEYS.length,
        survival_cfg_total: sur,
        survival_cfg_pinned: sur,
        weights_total: Object.keys(E.MEASURED_WEIGHTS).length,
        weights_pinned: Object.keys(E.MEASURED_WEIGHTS).length,
        not_pinned_and_why: 'display depth and presentation counts (SHEET_*, '
          + 'PATHS_POOL/MAX, WEIGHT_DIFF_DEPTH, DG_*) where a change is visible '
          + 'on its face and cannot alter the ranking; and the opponent-model '
          + 'TELL_*/THREAT_* family, which cfg_sensitivity could not exercise. '
          + 'UNTESTED is not evidence either way, and pinning on no evidence is '
          + 'how a baseline becomes noise that gets re-frozen reflexively.',
        removed_2026_08_14: { BENCH_SCORE_FLOOR: 'read by nothing — its only two '
          + 'mentions in engine.js are comments. Removed deliberately, not dropped.' },
      };
    })(),
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
  /* A NEW VERSION PINS ITS OWN BOARD. Without this, freezing v6 while
   * ACTIVE_VERSION still says v5 silently computes the v6 surface against the v5
   * board — self-consistent, green, and not the comparison anyone asked for. */
  if (version !== ACTIVE_VERSION) {
    const ownArtifact = path.join(BASELINE_DIR, 'artifact_' + version + '.json');
    if (!fs.existsSync(ownArtifact)) {
      console.error('REFUSING to freeze ' + version + ': no pinned board at ' + ownArtifact + '.');
      console.error('cp public/draft_data.json ' + ownArtifact);
      console.error('then set ACTIVE_VERSION = \'' + version + '\' in this file, so the frozen');
      console.error('surface and the board it was computed against stay named by one constant.');
      process.exit(1);
    }
    console.error('NOTE: ACTIVE_VERSION is still \'' + ACTIVE_VERSION + '\'. This freeze read '
      + path.basename(artifactPath()) + '.');
    console.error('Set ACTIVE_VERSION = \'' + version + '\' to make ' + version + ' the reference.');
  }

  built._why = why || null;
  built.frozen_at = new Date().toISOString();
  fs.writeFileSync(dest, JSON.stringify(built, null, 2) + '\n');
  console.log('froze ' + dest);
}

module.exports = {
  build, canonicalStates, surfaceFor, artifactPath, artifactDrift, boardIdentity,
  ACTIVE_VERSION, BASELINE_PATH,
};
