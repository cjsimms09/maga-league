/* THE CONTEXT THE APP ACTUALLY USES — for Lab probes, so they stop measuring
 * a system that does not exist.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * B's context_interface audit found the engine reading keys the app never
 * supplied, and named the mechanism: `freeze_baseline.js` HAND-BUILDS a context,
 * so A FIELD THE APP FAILS TO SUPPLY IS ALWAYS SUPPLIED BY THE FIXTURE.
 *
 * THIS IS THAT DEFECT IN THE MIRROR, AND IT IS THE ONE I KEEP COMMITTING. A Lab
 * probe hand-builds a context too, and a field the APP DOES supply is silently
 * ABSENT from it — so the probe measures a configuration production never runs.
 * That is already an entry in the ledger ("the baseline built on a context the
 * app does not use"), and on 2026-08-13 I produced it four more times in one
 * session while investigating that very class:
 *
 *   - a keeper roster looked up in `players` (kept players live in
 *     `kept_players`, removed from the pool) -> empty roster -> every stack term
 *     zero -> "doubling the weight changes nothing", reported with confidence;
 *   - a term-movement probe run with no `weights`, so it scored on
 *     DEFAULT_WEIGHTS while production runs MEASURED_WEIGHTS — the exact
 *     divergence B had just caught in its own scratch tool;
 *   - the same probe with no `league`, `totalPicks`, `myPicksLeft`,
 *     `myPickIndex`, `totalMyPicks`, `currentKeepers`, `intervening`,
 *     `roundsLeft`, `doctrine`, `drift` or `runMultipliers`;
 *   - and INVENTED keys (`available`, `players`, `drafted`, `teams`, `round`)
 *     that production never sends and nothing reads, which read as diligence.
 *
 * Being careful did not fix it. Four times in one session, by someone actively
 * looking for this failure class, is the argument for rule 17 being mechanical.
 *
 * ── HOW IT REFUSES ──────────────────────────────────────────────────────────
 *
 * The key list is NOT written here. It is scraped from app.js's live `context()`
 * at require time via the shared extractor, so it cannot drift from production
 * the way a copied list would. Then:
 *
 *   - a key production supplies and the caller has not set  -> THROW
 *   - a key production does NOT supply                      -> THROW
 *
 * Both directions, because both were live defects: the first is the silent
 * degradation, the second is the invented field that makes a probe look more
 * faithful than it is. A probe that cannot build a full context should FAIL,
 * never quietly score on a partial one — the whole lesson of this class is that
 * a partial context produces a plausible number rather than an error.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CI = require(path.join(ROOT, 'draft', 'tools', 'ctx_interface.js'));

/** Every key app.js's context() supplies, scraped from the live source. */
function productionKeys() {
  const keys = CI.suppliedKeys(CI.readSrc('app.js'));
  // GUARD THE GUARD. A scraper that silently returns [] would make every check
  // below vacuous — the same failure this file exists to prevent, one level up.
  if (!Array.isArray(keys) || keys.length < 12) {
    throw new Error('live_context: scraped ' + (keys ? keys.length : 'null')
      + ' keys from app.js context() — refusing to build a context from a '
      + 'scrape that plainly failed');
  }
  return keys;
}

function loadBoard() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
}

/* The intervening picks, built the way app.js builds them: real pick objects
 * carrying `pick_no`, not bare numbers. `precomputeLayer2` filters on
 * `t.pick_no >= currentPick`, and `undefined >= 34` is false — so a list of
 * bare numbers leaves Layer 2 dark in EXACTLY the way an empty array does,
 * silently. A POPULATED ARRAY IS NOT A POPULATED CONTEXT. */
function interveningFor(data, currentPick, nextPick, mySlot) {
  const picks = ((data.pick_order || {}).picks) || [];
  if (nextPick == null) return [];
  return picks
    .filter(p => p.overall >= currentPick && p.overall < nextPick && p.slot !== mySlot)
    .map(p => ({ team_slot: p.slot, pick_no: p.overall, roster: [], profile: null }));
}

/**
 * Build a context with EXACTLY production's key set.
 * @param opts.currentPick  required
 * @param opts.nextPick     required
 * @param opts.weights      defaults to the engine's MEASURED core (what ships)
 * @param opts.roster       defaults to Cory's real keepers from kept_players
 */
function liveContext(opts) {
  const o = opts || {};
  if (o.currentPick == null || o.nextPick == null) {
    throw new Error('live_context: currentPick and nextPick are required');
  }
  const data = o.data || loadBoard();
  const engine = o.engine || global.DraftEngine;
  if (!engine) throw new Error('live_context: engine not loaded (require engine.js first)');

  const league = data.league || {};
  const teams = league.teams || 10;
  const order = data.pick_order || {};
  const totalPicks = (order.picks || []).length || null;
  const totalMyPicks = (order.my_picks || []).length || null;
  const mySlot = league.my_draft_slot || null;
  // KEEPERS COME FROM `kept_players`, NOT `players`. They are removed from the
  // draftable pool, so looking them up by name in `players` finds nothing and
  // hands the engine an empty roster — which is the defect this file's header
  // describes, and the one that produced two wrong answers about the stack term.
  const keepers = data.kept_players || [];
  const myPicks = (order.my_picks || []).map(p => p.overall != null ? p.overall : p)
    .filter(n => typeof n === 'number');
  const picksLeft = myPicks.filter(n => n >= o.currentPick).length || null;

  const ctx = {
    board: o.board || data.players || [],
    nextPick: o.nextPick,
    totalPicks,
    myPicksLeft: o.myPicksLeft != null ? o.myPicksLeft : picksLeft,
    roster: o.roster || keepers,
    doctrine: o.doctrine != null ? o.doctrine : null,
    myPickIndex: o.myPickIndex != null ? o.myPickIndex
      : Math.max(0, myPicks.filter(n => n < o.currentPick).length),
    totalMyPicks,
    currentKeepers: o.currentKeepers || keepers,
    league,
    weights: o.weights || engine.MEASURED_WEIGHTS,
    runMultipliers: o.runMultipliers != null ? o.runMultipliers : null,
    ceilingAllStages: o.ceilingAllStages != null ? o.ceilingAllStages : false,
    drift: o.drift != null ? o.drift : null,
    // BOARD SLOTS -> SELECTIONS. survival.js converts pick numbers onto the
    // live-selection scale that `adjusted_adp` lives on, and it can only do
    // that with the pick board. A probe without it measures the pre-fix
    // system: 3 slots of error today, 18 once the slate locks.
    pickBoard: o.pickBoard !== undefined ? o.pickBoard
      : ((data.pick_order || {}).picks || null),
    // Mirrors app.js's context() exactly: read from the board if present,
    // else the caller's override, else null -- same as pickBoard above.
    // app.js's own comment explains why the board rarely carries it yet
    // (draft/build.py does not embed wire_level -- separate, undone work).
    wireWeekly: o.wireWeekly !== undefined ? o.wireWeekly : (data.wire_level || null),
    currentPick: o.currentPick,
    intervening: o.intervening
      || interveningFor(data, o.currentPick, o.nextPick, mySlot),
    roundsLeft: totalPicks == null ? 0
      : Math.max(0, Math.ceil((totalPicks - o.currentPick) / teams)),
    // DEFAULTS FALSE, DELIBERATELY, FOR EVERY CALLER OF THIS BUILDER. app.js
    // sets this true ONLY in the narrow pre-draft-prep window (zero picks —
    // real or mock — recorded), where `board` is not yet ground truth about
    // who is realistically still available. Every tool that calls
    // `liveContext` is already simulating an in-progress or historical draft
    // — a mock walk, a room replay, a backtest — where `o.board` (or the
    // loaded artifact) IS ground truth for that simulation. Filtering it
    // again by survival-to-currentPick would be double-counting a discount
    // the simulation already applied by actually removing players.
    preDraftPrep: o.preDraftPrep != null ? o.preDraftPrep : false,
  };

  // ── BOTH DIRECTIONS, BECAUSE BOTH WERE LIVE DEFECTS ─────────────────────
  const prod = productionKeys();
  const missing = prod.filter(k => !(k in ctx));
  if (missing.length) {
    throw new Error('live_context: app.js context() supplies ' + missing.join(', ')
      + ' and this builder does not. A probe run on a partial context does not '
      + 'error, it produces a plausible number — update this file rather than '
      + 'measuring a system that does not exist.');
  }
  const invented = Object.keys(ctx).filter(k => !prod.includes(k));
  if (invented.length) {
    throw new Error('live_context: ' + invented.join(', ') + ' is not supplied by '
      + 'app.js context(). An invented key reads as diligence and is scored by '
      + 'nothing.');
  }
  return ctx;
}

module.exports = { liveContext, productionKeys, loadBoard, interveningFor };
