#!/usr/bin/env node
// TERRITORY: A
/* THE ENGINE ABLATION LADDER — decompose the shipped recommendation policy's
 * advantage over a bare value baseline into per-layer marginal contributions,
 * one controlled ablation at a time.
 *
 * Cory, 2026-08-16, verbatim: "Take the current complete engine and decompose
 * its advantage against a simple baseline using controlled ablations. Should
 * we try this? And anything that doesn't hurt model could be removed?"
 *
 * WHAT IS REUSED, UNMODIFIED (the roster-construction machinery wholesale):
 *   - the engine itself: real E.recommend() through the real live_context.js
 *     under production MEASURED_WEIGHTS and shipped CFG flags;
 *   - room mechanics: the EXACT room of archetype_rooms.js — Cory's real seat
 *     (slot 8), his real keepers (rounds 1-3 forfeit, first live pick 33),
 *     the real designated opponent keeper slate, measured opponents sampling
 *     positions from survival.js positionProbabilities and players from
 *     positionSoftmax's room mixture, hard caps + a legality rail. A parity
 *     test (engine_ablation.test.js) pins this driver's `full` arm to
 *     archetype_rooms.js's `shipped` arm pick-for-pick on shared seeds, so
 *     the copy of the room mechanics cannot drift silently;
 *   - the overlay module (archetype_policy.js) for the bpa_vorp baseline and
 *     the seat_plan arm — never a second draft brain;
 *   - season scoring: archetype_season.js weekly bye-aware optimal lineups +
 *     standings MC, and src/routes/champodds.js simulate() — with the SAME
 *     per-seed MC seeds archetype_rooms.js uses, so season outcomes are
 *     directly comparable to the committed roster-construction artifacts.
 *
 * THE LADDER. Baseline = bpa_vorp (BPA by raw VORP among engine-endorsed
 * candidates, legality rails only — the roster-construction pass's baseline
 * arm). Full = the shipped policy (engine recs[0], shipped flags/weights).
 * Between them every CFG-gated layer of public/js/draft/ is ablated ONE AT A
 * TIME in both directions where defined:
 *   remove-one-from-full : full engine with exactly one layer switched off;
 *   add-one-to-stripped  : the stripped engine (every ablatable layer off —
 *                          bare VONA value core + legality rails) with exactly
 *                          one layer switched back on;
 *   add-one-to-full      : layers that SHIP OFF (VONA_SLOT_AWARE, STAGE2_CAP)
 *                          or sit outside recs[0] (seat-plan headline
 *                          ownership), switched on over the full engine.
 *
 * SCOPING, the load-bearing design point: an ablation changes MY policy ONLY.
 * Flags are flipped around my E.recommend() call and restored before any
 * opponent samples (survival.js's ROOM_MIX_PRIOR feeds the opponent generator
 * too — an unscoped flip would change the room, not the policy, and the delta
 * would be attributable to nothing). Board-level ablations (the opportunity
 * adjustment, depth-chart fields) are applied to a CLONED view handed to my
 * context; opponents and the season ruler always see the shipped board.
 *
 * SEASON RULER: both replacement models, every room — the zero-replacement
 * model (empty/bye slot = 0) AND the wire-floor model (each slot floored at
 * the measured waiver level). The roster-construction pass proved effects
 * that live in bench/backup coverage can flip sign between the two (§5,
 * bpa_vorp's +0.64 evaporating); a layer verdict here must survive both ends
 * of that bracket or say which end it lives at.
 *
 * ALL MODEL OUTCOMES, not measurements — conditioned on proj_mean, on the
 * measured opponent model (which IS our own model: a layer built to exploit
 * real-room behavior can measure zero here BY CONSTRUCTION — named per layer
 * in the artifact), and on a constant measured weekly sd.
 *
 * Run:    node draft/tools/engine_ablation.js [--rooms 120] [--seed 1]
 *           [--arms full,baseline_bpa,...] [--opponents measured|adp]
 *           [--sims 2000] [--batch 40]
 * Writes: draft/data/engine_ablation_2026.json (ENGINE_ABLATION_OUT overrides
 *         — tests write to a scratch path, never the committed artifact).
 */
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
const C = require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));
const AP = require(path.join(ROOT, 'draft', 'tools', 'archetype_policy.js'));
const AS = require(path.join(ROOT, 'draft', 'tools', 'archetype_season.js'));
const CH = require(path.join(ROOT, 'src', 'routes', 'champodds.js'));

const QUESTION_VERBATIM = 'Take the current complete engine and decompose its '
  + 'advantage against a simple baseline using controlled ablations. Should we '
  + 'try this? And anything that doesn’t hurt model could be removed?';

/* ── THE LAYER REGISTRY — every CFG-gated layer of public/js/draft/, with its
 * gate, its shipped state, and how (or whether) it can be ablated here.
 * `dark` layers are enumerated but carry NO arm: the frame provably cannot
 * exercise them, and a measurement of an unexercised layer would be a number
 * about nothing (the reason is recorded instead). */
const LAYERS = {
  wire_bench: {
    gate: 'engine.js CFG.VONA_WIRE_BENCH', shipped: true,
    ruled: 'Cory 2026-08-16 "Yes" — flipped TRUE',
    what: 'bench-branch VONA priced against the measured waiver wire instead of rate×vorp',
    cfg: [['E', 'VONA_WIRE_BENCH']],
    caveat: 'STRUCTURALLY UNREACHABLE IN THE SHIPPED CONFIG: the wire branch lives inside '
      + 'vona()’s slot-aware bench branch, and vona() returns `straight` before reaching it '
      + 'whenever VONA_SLOT_AWARE is false (engine.js:806) — which is the shipped, ruled state. '
      + 'bench_wire_room_sim.js’s own arm table says the same (its "on" arm sets BOTH flags). '
      + 'So the ruled-ON layer is dead code on the recommend() scoring path today; an exact-zero '
      + 'ablation delta here is the PROOF, not a null. The plus_slot_aware_wire / '
      + 'plus_slot_aware_no_wire pair measures it in the one config where it is reachable.',
  },
  kov_ramp: {
    gate: 'composite.js CFG.KOV_MEASURED_RAMP', shipped: true,
    ruled: 'Cory 2026-08-16 "Yes" — flipped TRUE',
    what: 'keeper-option value ramped by the MEASURED keep-by-round shape (4-6 peak) instead of the old reasoned late-round ramp',
    cfg: [['C', 'KOV_MEASURED_RAMP']],
    caveat: 'removal restores the OLD reasoned ramp, not "no KOV" — kov_term is the full-removal arm. KOV pays next SEASON (keeper option); this season’s scoring cannot price its real payoff, only its distortion of this year’s picks',
  },
  kov_term: {
    gate: 'engine.js MEASURED_WEIGHTS.keeper (1.0)', shipped: true,
    ruled: 'unmeasured, left on 2026-08-09 (drives the KEEPER-TARGET badge)',
    what: 'the whole keeper-option composite term (w.keeper 1.0 → 0)',
    weights: { keeper: 0 },
    caveat: 'KOV’s payoff is next-season option value; a single-season scorer structurally cannot credit it — an in-sim zero here is expected and is NOT evidence the option is worthless',
  },
  stack_term: {
    gate: 'engine.js MEASURED_WEIGHTS.stack (1.0)', shipped: true,
    ruled: 'D10 (Cory 2026-08-08): stays 1.0; governance-corrected 2026-08-13',
    what: 'the QB-stack / same-team-competition correlation term (w.stack 1.0 → 0)',
    weights: { stack: 0 },
    caveat: 'stack’s measured earn (exp6, +$196) is a CEILING/correlation mechanism; this season model is mean-only with constant sd, so stack’s real payoff is invisible here BY CONSTRUCTION — an in-sim zero does not contradict exp6',
  },
  room_mix: {
    gate: 'survival.js CFG.ROOM_MIX_PRIOR', shipped: true,
    ruled: 'Cory 2026-08-16 "YES on room mix prior, turn it on"',
    what: 'the league’s measured 2023-25 bucket mix blended (0.25) into unprofiled-seat position probabilities — feeds my survival’s Layer 2 and therefore VONA',
    cfg: [['S', 'ROOM_MIX_PRIOR']],
    caveat: 'SELF-REFERENTIAL IN THIS FRAME: the opponent generator uses the same measured model (prior ON), so ablating my side measures internal consistency, not real-room accuracy — the forward test on 2025 picks is the real evidence for this layer',
  },
  conserve: {
    gate: 'engine.js CFG.CONSERVE_SURVIVAL_ON', shipped: true,
    ruled: 'gated departure, DECISIONS-NEEDED #7 (executed)',
    what: 'the conservation tilt: survival mass over the board forced to equal opponent picks in the window',
    cfg: [['E', 'CONSERVE_SURVIVAL_ON']],
    caveat: 'the identity is exact bookkeeping; its value shows up as better-calibrated VONA — in a room drafted by the same model, miscalibration is partly shared and the measured delta is a lower bound on live value',
  },
  onesie_discount: {
    gate: 'engine.js CFG.ONESIE_DISCOUNT', shipped: true,
    what: 'the onesie duplication discount — a second QB/TE/K/DEF priced at backup value (×0.10, never score-raising)',
    cfg: [['E', 'ONESIE_DISCOUNT']],
  },
  onesie_hard_cap: {
    gate: 'engine.js CFG.ONESIE_HARD_CAP', shipped: true,
    what: 'the structural cap: QB≤2/TE≤2/K≤1/DEF≤1 spare bodies — a roster-legality rule, capped candidates sunk',
    cfg: [['E', 'ONESIE_HARD_CAP']],
    caveat: 'insurance against the QB3/TE3 tail-tie pathology — its value concentrates in rooms the discount alone fails, so a small mean can hide a fat tail; read rooms_diverged and the shape distributions, not just the mean',
  },
  onesie_need_discount: {
    gate: 'engine.js CFG.ONESIE_NEED_DISCOUNT', shipped: true,
    what: 'empty-onesie-slot need credited as insurance residual instead of full VORP',
    cfg: [['E', 'ONESIE_NEED_DISCOUNT']],
    caveat: 'VACUOUS-BY-WEIGHTS in the shipped config: it only rewrites need.value and MEASURED_WEIGHTS.need is 0 — the flag is proven live under DEFAULT_WEIGHTS in the test, and proven inert here; that inertness IS the finding',
  },
  flex_discount: {
    gate: 'engine.js CFG.FLEX_DISCOUNT', shipped: true,
    ruled: 'D3, approved 2026-08-08',
    what: 'a flex-only starter priced at his marginal over the best flex alternative',
    cfg: [['E', 'FLEX_DISCOUNT']],
    caveat: 'VACUOUS-BY-WEIGHTS in the shipped config (rewrites need.value; w.need = 0) — same standing as onesie_need_discount',
  },
  ceiling_tiebreak: {
    gate: 'engine.js CFG.CEILING_TIEBREAK', shipped: true,
    what: 'same-tier same-position near-ties (<2.0 pts) lean to the higher ceiling — the surviving home of the ceiling lean after MEASURED_WEIGHTS.ceiling went to 0',
    cfg: [['E', 'CEILING_TIEBREAK']],
  },
  opportunity: {
    gate: 'draft/build.py → projections.blend (board layer; provenance opportunity_adjustment)', shipped: true,
    what: 'the capped (±15%) nflfastR opportunity adjustment on proj_mean, plus the opportunity_z field (risk nudge ±6 — weight-zeroed — and the KOV breakout term)',
    board: 'strip_opportunity',
    caveat: 'measured against the SHIPPED proj_mean ruler — the season scorer keeps the opportunity-adjusted board, so this cell partly grades the layer with its own ruler; direction named, and the replay frame (which has no opportunity layer at all) is the independent check the sim cannot be',
  },
  depth_chart: {
    gate: 'engine.js riskAdjustment (−6/order) + composite.js keepProbability (−0.45 z/order)', shipped: true,
    what: 'depth-chart dampening: below-the-starter players penalized in risk and keeper models',
    board: 'strip_depth_chart',
    caveat: 'MOSTLY VACUOUS-BY-WEIGHTS: the risk term is weight-zeroed in MEASURED_WEIGHTS, so only the KOV keep-probability path remains live in the shipped policy',
  },
  // ── ship-OFF layers: add-one-to-full only ─────────────────────────────────
  vona_slot_aware: {
    gate: 'engine.js CFG.VONA_SLOT_AWARE', shipped: false,
    ruled: 'shipped OFF 2026-08-14: measured TE3/RB0/QB4 tie-collapse',
    what: 'VONA priced against the slot a player would actually fill',
    cfg: [['E', 'VONA_SLOT_AWARE']],
  },
  stage2_cap: {
    gate: 'engine.js CFG.STAGE2_CAP', shipped: false,
    ruled: 'pre-registered, OFF until measured (STAGE2-CAP-PREREG.md)',
    what: 'deviation-boosted scores reverted to consensus unless earned evidence ≥ threshold',
    cfg: [['E', 'STAGE2_CAP']],
  },
  seat_plan: {
    gate: 'verdict.js headline ownership (policy layer over recs[0])', shipped: true,
    ruled: 'Cory 2026-08-16 "Yes? If you think so" — the seat plan owns the headline',
    what: 'the war-room headline follows the DP seat plan’s scheduled position where it speaks; recs[0] is the priced second line',
    overlay: 'seat_plan',
    caveat: 'recs[0] itself does not consume the plan, so this is add-one only; the roster-construction pass already measured this arm FREE (−0.08 wk [−0.33,+0.17])',
  },
};

/* Layers the frame provably cannot exercise — enumerated, not measured. */
const DARK_LAYERS = {
  doctrine_tilt: {
    gate: 'engine.js CFG.DOCTRINE_TILT_ON', shipped: true,
    why_dark: 'ctx.doctrine is null in the production sim context (a doctrine is an on-the-day enrollment); doctrineTilt() returns 0 for every player in every room, so an ablation flag-flip cannot change one pick — proven, not assumed, by the vacuity control in engine_ablation.test.js',
  },
  run_detection: {
    gate: 'survival.js Layer 3 (RUN_* CFG)', shipped: true,
    why_dark: 'ctx.runMultipliers is null in the sim context (no live pick stream); Layer 3 is a live-room insurance layer this frame never visits',
  },
  adp_drift: {
    gate: 'survival.js adpDrift (DRIFT_* CFG)', shipped: true,
    why_dark: 'ctx.drift is null in the sim context; drift correction is chaos/edge-state insurance against a room that departs the ADP source — the sim’s room IS the model, so the state never occurs',
  },
  owner_tendencies: {
    gate: 'survival.js tendency/opening/affinity tilts', shipped: true,
    why_dark: 'intervening seats carry profile:null in the production sim context (per live_context.js); these layers exist to exploit real-room behavior and measure zero against a model room by construction',
  },
};

/* ── board-view transforms (my policy's eyes only) ─────────────────────────── */
function stripOpportunity(row) {
  const p = Object.assign({}, row);
  if (p.proj_baseline != null && p.proj_mean != null) {
    const delta = Number(p.proj_baseline) - Number(p.proj_mean);
    p.proj_mean = Number(p.proj_baseline);
    if (p.vorp != null) p.vorp = Number(p.vorp) + delta;
    if (p.proj_floor != null) p.proj_floor = Number(p.proj_floor) + delta;
    if (p.proj_ceiling != null) p.proj_ceiling = Number(p.proj_ceiling) + delta;
  }
  // The z is the layer's other limb (risk nudge — weight-zeroed — and the KOV
  // breakout term). Removed, not nulled-in-place: engine guards are `!= null`.
  delete p.opportunity_z;
  delete p.opportunity_adj;
  return p;
}
function stripDepthChart(row) {
  const p = Object.assign({}, row);
  delete p.depth_chart_order;
  return p;
}
const BOARD_TRANSFORMS = { strip_opportunity: stripOpportunity,
  strip_depth_chart: stripDepthChart };

/* ── scoped flag flips ──────────────────────────────────────────────────────
 * Set module CFG flags for the duration of fn(), restore in finally. The ONLY
 * caller wraps my own recommend() — opponents always sample under shipped
 * flags (ROOM_MIX_PRIOR is shared with the opponent generator; an unscoped
 * flip would change the room, not the policy). */
const CFG_OF = { E: () => E.CFG, C: () => C.CFG, S: () => S.CFG };
function withFlags(cfgSet, fn) {
  const saved = [];
  try {
    (cfgSet || []).forEach(([mod, key, value]) => {
      const cfg = CFG_OF[mod]();
      saved.push([cfg, key, cfg[key]]);
      cfg[key] = value;
    });
    return fn();
  } finally {
    saved.reverse().forEach(([cfg, key, value]) => { cfg[key] = value; });
  }
}

/* ── the arm table ──────────────────────────────────────────────────────────
 * Each arm: { policy, cfgSet, weights, transforms, control }.
 *   policy    'engine' (recs[0]) | 'bpa_vorp' | 'seat_plan' (overlay names)
 *   cfgSet    [[mod, key, valueDuringMyPick]] — scoped to my recommend()
 *   weights   overrides merged over MEASURED_WEIGHTS
 *   transforms board-view transform names applied to MY context only
 *   control   which arm the paired delta is taken against
 */
function buildArms() {
  const arms = {};
  arms.full = { policy: 'engine', cfgSet: [], weights: null, transforms: [], control: null,
    doc: 'the shipped recommendation policy: engine recs[0], shipped flags, MEASURED_WEIGHTS' };
  arms.baseline_bpa = { policy: 'bpa_vorp', cfgSet: [], weights: null, transforms: [], control: 'full',
    doc: 'THE BASELINE: BPA by raw VORP among engine-endorsed candidates, legality rails only (roster-construction bpa_vorp arm)' };

  // The stripped engine: every ablatable layer off at once.
  const strippedCfg = [
    ['E', 'VONA_WIRE_BENCH', false], ['S', 'ROOM_MIX_PRIOR', false],
    ['E', 'CONSERVE_SURVIVAL_ON', false], ['E', 'ONESIE_DISCOUNT', false],
    ['E', 'ONESIE_HARD_CAP', false], ['E', 'ONESIE_NEED_DISCOUNT', false],
    ['E', 'FLEX_DISCOUNT', false], ['E', 'CEILING_TIEBREAK', false],
  ];
  const strippedTransforms = ['strip_opportunity', 'strip_depth_chart'];
  const strippedWeights = { keeper: 0, stack: 0 };
  arms.stripped = { policy: 'engine', cfgSet: strippedCfg,
    weights: strippedWeights, transforms: strippedTransforms, control: 'full',
    doc: 'the VONA value core: engine recs[0] with every ablatable layer off — the ladder’s bottom rung above raw VORP' };

  // remove-one-from-full.
  const removable = ['wire_bench', 'kov_ramp', 'kov_term', 'stack_term',
    'room_mix', 'conserve', 'onesie_discount', 'onesie_hard_cap',
    'onesie_need_discount', 'flex_discount', 'ceiling_tiebreak',
    'opportunity', 'depth_chart'];
  removable.forEach(name => {
    const L = LAYERS[name];
    arms['minus_' + name] = {
      policy: 'engine',
      cfgSet: (L.cfg || []).map(([mod, key]) => [mod, key, false]),
      weights: L.weights || null,
      transforms: L.board ? [L.board] : [],
      control: 'full', layer: name, direction: 'remove_from_full',
      doc: 'full engine minus ' + name + ' (' + L.what + ')',
    };
  });

  // add-one-to-stripped (kov_ramp has no meaning with the term off; the
  // add-one arm for KOV is the whole term, measured ramp as shipped).
  const addable = removable.filter(n => n !== 'kov_ramp');
  addable.forEach(name => {
    const L = LAYERS[name];
    const cfgSet = strippedCfg
      .filter(([mod, key]) => !(L.cfg || []).some(([m2, k2]) => m2 === mod && k2 === key));
    const weights = Object.assign({}, strippedWeights);
    Object.keys(L.weights || {}).forEach(k => { delete weights[k]; });
    const transforms = strippedTransforms.filter(t => t !== L.board);
    arms['plus_' + name] = {
      policy: 'engine', cfgSet, weights, transforms,
      control: 'stripped', layer: name, direction: 'add_to_stripped',
      doc: 'stripped engine plus ' + name + ' (' + L.what + ')',
    };
  });

  // add-one-to-full (ship-off layers + the seat-plan headline).
  arms.plus_vona_slot_aware = { policy: 'engine',
    cfgSet: [['E', 'VONA_SLOT_AWARE', true]], weights: null, transforms: [],
    control: 'full', layer: 'vona_slot_aware', direction: 'add_to_full',
    doc: 'full engine plus VONA_SLOT_AWARE (ships off) — with the shipped VONA_WIRE_BENCH=true this is bench_wire_room_sim’s "on" arm' };
  // The wire-bench layer is only REACHABLE under slot-aware VONA (see
  // LAYERS.wire_bench.caveat), so its live measurement is this pair:
  // plus_vona_slot_aware (slot ON, wire ON) minus this arm (slot ON, wire OFF).
  arms.plus_slot_aware_no_wire = { policy: 'engine',
    cfgSet: [['E', 'VONA_SLOT_AWARE', true], ['E', 'VONA_WIRE_BENCH', false]],
    weights: null, transforms: [],
    control: 'plus_vona_slot_aware', layer: 'wire_bench', direction: 'remove_from_slot_aware',
    doc: 'slot-aware VONA with the wire branch off (bench_wire_room_sim’s "off" arm) — the wire layer’s delta in the one config where it is reachable' };
  arms.plus_stage2_cap = { policy: 'engine',
    cfgSet: [['E', 'STAGE2_CAP', true]], weights: null, transforms: [],
    control: 'full', layer: 'stage2_cap', direction: 'add_to_full',
    doc: 'full engine plus STAGE2_CAP (ships off, pre-registered)' };
  arms.plus_seat_plan = { policy: 'seat_plan', cfgSet: [], weights: null,
    transforms: [], control: 'full', layer: 'seat_plan', direction: 'add_to_full',
    doc: 'full engine with the seat plan owning the headline (the ruled war-room surface)' };

  return arms;
}

/* ── shared board / room state (mirrors archetype_rooms.js; parity-pinned) ── */
function loadRoom() {
  const board = LC.loadBoard();
  const ALL = board.players;
  const LEAGUE = board.league;
  const PICKS = (board.pick_order || {}).picks || [];
  const MY_SLOT = LEAGUE.my_draft_slot;
  const MY_PICKS = ((board.pick_order || {}).my_picks || [])
    .map(p => (p.overall != null ? p.overall : p));
  const WIRE = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'data', 'wire_level.json'), 'utf8')).per_week;

  Object.keys(AS.STARTERS).forEach(pos => {
    if ((LEAGUE.starters || {})[pos] !== AS.STARTERS[pos]) {
      throw new Error('starter map drift at ' + pos);
    }
  });
  if ((LEAGUE.starters || {}).FLEX !== 1) throw new Error('starter map drift: FLEX');

  const KEEPER_FILE = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'config', 'keepers.json'), 'utf8'));
  const myEntry = (KEEPER_FILE.teams || []).find(t => t.draft_slot === MY_SLOT);
  {
    const a = new Set((myEntry ? myEntry.keepers : []).map(k => String(k.player_id)));
    const b = new Set(board.kept_players.map(k => String(k.player_id)));
    if (a.size !== b.size || [...a].some(id => !b.has(id))) {
      throw new Error('keeper sources disagree: config/keepers.json vs board kept_players');
    }
  }
  const byId = new Map(ALL.map(p => [String(p.player_id), p]));
  const OPP_KEEPERS = new Map();
  (KEEPER_FILE.teams || []).forEach(t => {
    if (t.draft_slot === MY_SLOT) return;
    const rows = [];
    (t.keepers || []).forEach(k => {
      const row = byId.get(String(k.player_id));
      if (!row) throw new Error('designated keeper not on board: ' + k.name);
      rows.push(row);
    });
    const forfeit = new Set();
    for (let r = 1; r <= rows.length; r++) forfeit.add(r);
    OPP_KEEPERS.set(t.draft_slot, { keeperRows: rows, forfeitRounds: forfeit });
  });

  const ROOM_PROFILES = (() => {
    const mgrs = (board.manager_profiles || {}).managers || {};
    const me = String(LEAGUE.my_manager_id || '');
    return Object.keys(mgrs).map(k => mgrs[k])
      .filter(m => m && String(m.manager_id) !== me);
  })();
  if (ROOM_PROFILES.length < 5) {
    throw new Error('measured opponent model needs the profiled room; got '
      + ROOM_PROFILES.length);
  }

  const PLAN_SLOT = (() => {
    const out = {};
    try {
      const sp = JSON.parse(fs.readFileSync(
        path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));
      (sp.seats || []).forEach(s => { out[s.pick] = s.slot; });
    } catch (e) { /* seat_plan arm degrades to recs[0]; recorded below */ }
    return out;
  })();

  return { board, ALL, LEAGUE, PICKS, MY_SLOT, MY_PICKS, WIRE, byId,
    OPP_KEEPERS, ROOM_PROFILES, PLAN_SLOT,
    TEAMS: LEAGUE.teams || 10, TOTAL_ROUNDS: LEAGUE.rounds || 15 };
}

const mulberry32 = AS.mulberry32;
function gaussian(rng) {
  const u1 = Math.max(rng(), 1e-9), u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
const CAPS = { QB: 3, TE: 3, K: 1, DEF: 1, RB: 7, WR: 7 };

function missingStarters(roster) {
  const have = {};
  roster.forEach(p => { have[p.position] = (have[p.position] || 0) + 1; });
  const out = [];
  Object.keys(AS.STARTERS).forEach(pos => {
    for (let i = (have[pos] || 0); i < AS.STARTERS[pos]; i++) out.push(pos);
  });
  return out;
}

function opponentPickAdp(pool, rng) {
  let best = null, bestScore = Infinity;
  for (const p of pool) {
    const adp = p.adp == null ? 9999 : Number(p.adp);
    const sd = p.adp_sd == null ? 6 : Number(p.adp_sd);
    const score = adp + gaussian(rng) * sd;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
}

function opponentPickMeasured(R, pool, teamState, overall, round, picksLeftForTeam, rng) {
  const team = { roster: teamState.roster, profile: null, room: R.ROOM_PROFILES,
    pick_no: overall };
  const ctx2 = {
    league: R.LEAGUE,
    progress: Math.min(1, Math.max(0, (overall - 1) / (R.TEAMS * R.TOTAL_ROUNDS))),
    roundsLeft: Math.max(0, R.TOTAL_ROUNDS - round),
  };
  let probs = S.positionProbabilities(team, pool, ctx2) || {};
  const counts = {};
  teamState.roster.forEach(p => { counts[p.position] = (counts[p.position] || 0) + 1; });
  const capped = {};
  Object.keys(probs).forEach(pos => {
    capped[pos] = (CAPS[pos] != null && (counts[pos] || 0) >= CAPS[pos]) ? 0 : probs[pos];
  });
  const gaps = missingStarters(teamState.roster);
  if (gaps.length >= picksLeftForTeam) {
    const need = new Set(gaps);
    Object.keys(capped).forEach(pos => { if (!need.has(pos)) capped[pos] = 0; });
  }
  let total = Object.values(capped).reduce((s, x) => s + x, 0);
  let dist = capped;
  if (!(total > 0)) { dist = probs; total = Object.values(probs).reduce((s, x) => s + x, 0); }
  if (!(total > 0)) return opponentPickAdp(pool, rng);

  let u = rng() * total, pos = null;
  for (const k of Object.keys(dist)) { u -= dist[k]; if (u <= 0) { pos = k; break; } }
  if (!pos) pos = Object.keys(dist).sort((a, b) => dist[b] - dist[a])[0];

  const sm = S.positionSoftmax(pool, pos, team);
  if (!sm || !sm.pool || !sm.pool.length || !sm.exps || !(sm.sum > 0)) {
    const posPool = pool.filter(p => p.position === pos);
    return posPool.length ? opponentPickAdp(posPool, rng) : opponentPickAdp(pool, rng);
  }
  let v = rng() * sm.sum;
  for (let i = 0; i < sm.pool.length; i++) {
    v -= sm.exps[i];
    if (v <= 0) return sm.pool[i];
  }
  return sm.pool[sm.pool.length - 1];
}

/* ── one room's DRAFT under an arm (season scoring separate, memoizable) ──── */
function draftRoom(R, seed, arm, oppModel) {
  const rng = mulberry32(seed);
  const drafted = new Set();
  const teams = {};
  for (let s = 1; s <= R.TEAMS; s++) teams[s] = { roster: [], picksLeft: 0 };

  R.board.kept_players.forEach(k => {
    drafted.add(String(k.player_id));
    teams[R.MY_SLOT].roster.push(Object.assign({}, k, { is_keeper: true }));
  });
  R.OPP_KEEPERS.forEach((v, slot) => {
    v.keeperRows.forEach(row => {
      drafted.add(String(row.player_id));
      teams[slot].roster.push(Object.assign({}, row, { is_keeper: true }));
    });
  });
  const slotForfeits = slot => {
    if (slot === R.MY_SLOT) return new Set([1, 2, 3]);
    const v = R.OPP_KEEPERS.get(slot);
    return v ? v.forfeitRounds : new Set();
  };
  R.PICKS.forEach(p => { if (!slotForfeits(p.slot).has(p.round)) teams[p.slot].picksLeft++; });

  const transforms = (arm.transforms || []).map(t => BOARD_TRANSFORMS[t]);
  const viewOf = rows => (transforms.length
    ? rows.map(r => transforms.reduce((acc, fn) => fn(acc), r))
    : rows);

  const picksLog = [];
  let overlayDiverged = 0;
  let myPickIndex = 0;
  let pool = R.ALL.filter(p => !drafted.has(String(p.player_id)));

  for (const pk of R.PICKS) {
    const { overall, round, slot } = pk;
    if (slotForfeits(slot).has(round)) continue;
    const t = teams[slot];

    if (slot === R.MY_SLOT) {
      const next = R.MY_PICKS[myPickIndex + 1] || null;
      const myView = viewOf(pool);
      const rosterView = viewOf(t.roster);
      const ctx = LC.liveContext({
        currentPick: overall, nextPick: next == null ? overall : next,
        board: myView, roster: rosterView,
        myPicksLeft: R.MY_PICKS.length - myPickIndex, myPickIndex,
        weights: arm.weights
          ? Object.assign({}, E.MEASURED_WEIGHTS, arm.weights) : undefined,
      });
      ctx.wireWeekly = R.WIRE;
      let recs;
      try {
        recs = withFlags(arm.cfgSet, () => E.recommend(ctx));
      } catch (e) {
        return { seed, crashed: String((e && e.message) || e) };
      }
      if (!recs || !recs.length) return { seed, crashed: 'empty recs' };
      let chosen;
      if (arm.policy === 'engine') {
        chosen = recs[0];
      } else {
        const posCounts = {};
        t.roster.forEach(p => { posCounts[p.position] = (posCounts[p.position] || 0) + 1; });
        chosen = AP.choosePick(arm.policy, recs,
          { round, picksLeft: R.MY_PICKS.length - myPickIndex, posCounts,
            planSlot: R.PLAN_SLOT[overall] || null });
        if (chosen !== recs[0]) overlayDiverged++;
      }
      // Map the (possibly cloned) chosen row back to the canonical board row —
      // rosters, the drafted set, and the season ruler live on the shipped board.
      const canon = R.byId.get(String(chosen.player.player_id));
      if (!canon) return { seed, crashed: 'chosen player not on canonical board' };
      picksLog.push({ pick: overall, round, name: canon.name, pos: canon.position,
        pid: String(canon.player_id), engine_top: recs[0].player.name });
      drafted.add(String(canon.player_id));
      t.roster.push(canon);
      myPickIndex++;
    } else {
      const p = oppModel === 'adp'
        ? opponentPickAdp(pool, rng)
        : opponentPickMeasured(R, pool, t, overall, round, t.picksLeft, rng);
      if (!p) return { seed, crashed: 'pool exhausted at ' + overall };
      drafted.add(String(p.player_id));
      t.roster.push(p);
    }
    t.picksLeft--;
    pool = pool.filter(x => !drafted.has(String(x.player_id)));
  }
  return { seed, crashed: null, teams, picksLog, overlayDiverged };
}

/* Season outcomes under BOTH replacement models. Same MC seeds as
 * archetype_rooms.js, so shipped-arm outcomes are directly comparable to the
 * committed roster-construction artifacts. */
function seasonScore(R, seed, teams, sims) {
  const out = {};
  [['zero', undefined], ['wire', { wireFloor: R.WIRE }]].forEach(([label, opts]) => {
    const series = {}, flat = {};
    for (let s = 1; s <= R.TEAMS; s++) {
      const wm = AS.weeklyTeamMeans(teams[s].roster, AS.REGULAR_SEASON_WEEKS, opts);
      series[s] = wm.series;
      flat[s] = { mean: wm.mean_weekly, sd: CH.CFG.WEEKLY_SD };
    }
    const mc = AS.standingsMC(series, { sd: CH.CFG.WEEKLY_SD, sims,
      seed: (seed * 7919 + 17) >>> 0 });
    const ch = CH.simulate({ strengths: flat, baseRec: null,
      futureWeeks: AS.REGULAR_SEASON_WEEKS, schedule: null, cut: 4, sims,
      seed: (seed * 104729 + 31) >>> 0 });
    const rd = x => Math.round(x * 10000) / 10000;
    out[label] = {
      mean_weekly: Math.round(series[R.MY_SLOT].reduce((s, x) => s + x, 0)
        / series[R.MY_SLOT].length * 100) / 100,
      playoff_prob: rd(mc[R.MY_SLOT].playoff_prob),
      bottom3_prob: rd(mc[R.MY_SLOT].bottom3_prob),
      champ_prob: rd(ch[R.MY_SLOT].champ_prob),
    };
  });
  return out;
}

function runRoom(R, seed, arm, oppModel, sims, seasonMemo) {
  const d = draftRoom(R, seed, arm, oppModel);
  if (d.crashed) return { seed, crashed: d.crashed };
  const sig = d.picksLog.map(p => p.pid).join(',');
  let season = seasonMemo.get(sig);
  if (!season) {
    season = seasonScore(R, seed, d.teams, sims);
    seasonMemo.set(sig, season);
  }
  const posCounts = {};
  d.teams[R.MY_SLOT].roster.forEach(p => {
    posCounts[p.position] = (posCounts[p.position] || 0) + 1;
  });
  return {
    seed, crashed: null, sig, posCounts,
    myMissingStarters: missingStarters(d.teams[R.MY_SLOT].roster).length,
    picksLog: d.picksLog, overlayDiverged: d.overlayDiverged,
    zero: season.zero, wire: season.wire,
  };
}

/* ── statistics ────────────────────────────────────────────────────────────── */
function meanSe(xs) {
  const n = xs.length;
  if (!n) return { n: 0, mean: null, se: null };
  const m = xs.reduce((s, x) => s + x, 0) / n;
  const v = n > 1 ? xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1) : 0;
  return { n, mean: m, se: Math.sqrt(v / Math.max(1, n)) };
}
const METRICS = ['mean_weekly', 'playoff_prob', 'champ_prob', 'bottom3_prob'];
const MODELS = ['zero', 'wire'];

function summarizeArm(rooms) {
  const ok = rooms.filter(r => !r.crashed);
  const out = { n: rooms.length, crashed: rooms.length - ok.length,
    my_missing_starters_rooms: ok.filter(r => r.myMissingStarters > 0).length };
  MODELS.forEach(model => {
    out[model] = {};
    METRICS.forEach(m => {
      const st = meanSe(ok.map(r => r[model][m]));
      out[model][m] = st.mean == null ? null : Math.round(st.mean * 10000) / 10000;
      out[model][m + '_se'] = st.se == null ? null : Math.round(st.se * 10000) / 10000;
    });
  });
  const shapes = {};
  ok.forEach(r => {
    const key = ['QB', 'RB', 'WR', 'TE'].map(p => p + (r.posCounts[p] || 0)).join('/');
    shapes[key] = (shapes[key] || 0) + 1;
  });
  out.shape_distribution = shapes;
  return out;
}

function pairedDeltas(rooms, controlRooms) {
  const base = new Map(controlRooms.filter(r => !r.crashed).map(r => [r.seed, r]));
  const paired = rooms.filter(r => !r.crashed && base.has(r.seed));
  const out = {
    rooms_diverged: paired.filter(r => r.sig !== base.get(r.seed).sig).length,
    picks_diverged_mean: paired.length ? Math.round(100 * paired.reduce((s, r) => {
      const b = base.get(r.seed).picksLog;
      return s + r.picksLog.filter((p, i) => !b[i] || b[i].pid !== p.pid).length;
    }, 0) / paired.length) / 100 : null,
  };
  MODELS.forEach(model => {
    out[model] = {};
    METRICS.forEach(m => {
      const ds = paired.map(r => r[model][m] - base.get(r.seed)[model][m]);
      const st = meanSe(ds);
      out[model][m] = st.mean == null ? null : {
        n: st.n, mean: Math.round(st.mean * 10000) / 10000,
        se: Math.round(st.se * 10000) / 10000,
        ci95: [Math.round((st.mean - 1.96 * st.se) * 10000) / 10000,
          Math.round((st.mean + 1.96 * st.se) * 10000) / 10000],
      };
    });
  });
  return out;
}

function batchMeans(rooms, seed0, roomsN, batch) {
  const out = [];
  for (let b0 = seed0; b0 < seed0 + roomsN; b0 += batch) {
    const rows = rooms.filter(r => !r.crashed && r.seed >= b0 && r.seed < b0 + batch);
    const entry = { seeds: b0 + '-' + Math.min(seed0 + roomsN - 1, b0 + batch - 1) };
    MODELS.forEach(model => {
      entry[model] = {};
      METRICS.forEach(m => {
        const st = meanSe(rows.map(r => r[model][m]));
        entry[model][m] = st.mean == null ? null : Math.round(st.mean * 10000) / 10000;
      });
    });
    out.push(entry);
  }
  return out;
}

/* Classification, preregistered here (the audit doc repeats it verbatim):
 * against its control, on champ_prob and mean_weekly —
 *   EARNS ITS KEEP  CI-clear positive under at least one replacement model
 *                   and not CI-clear negative under the other;
 *   HURTS           the mirror image;
 *   FREE            everything else (CIs straddle zero, or the two models
 *                   disagree with clear CIs — a sign that flips with the
 *                   replacement bracket is an instrument artifact, per the
 *                   roster-construction pass §5).
 * Direction: remove_from_full deltas are (ablated − full), so a NEGATIVE
 * delta means the layer was helping; classification flips the sign there. */
function classify(delta, direction) {
  const sgn = /^remove/.test(direction) ? -1 : 1;
  const cell = (model, metric) => {
    const d = delta[model][metric];
    if (!d) return 'na';
    const lo = sgn > 0 ? d.ci95[0] : -d.ci95[1];
    const hi = sgn > 0 ? d.ci95[1] : -d.ci95[0];
    if (lo > 0) return 'pos';
    if (hi < 0) return 'neg';
    return 'zero';
  };
  const cells = [];
  MODELS.forEach(model => { ['champ_prob', 'mean_weekly'].forEach(m => cells.push(cell(model, m))); });
  const pos = cells.includes('pos'), neg = cells.includes('neg');
  if (pos && !neg) return 'EARNS';
  if (neg && !pos) return 'HURTS';
  if (pos && neg) return 'FREE (sign flips across models/metrics — bracket artifact)';
  return 'FREE';
}

/* ── main ──────────────────────────────────────────────────────────────────── */
function main() {
  const args = process.argv.slice(2);
  const argOf = (f, dflt) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : dflt; };
  const ROOMS = Number(argOf('--rooms', 120));
  const SEED0 = Number(argOf('--seed', 1));
  const SIMS = Number(argOf('--sims', 2000));
  const BATCH = Number(argOf('--batch', 40));
  const OPP_MODEL = String(argOf('--opponents', 'measured'));
  if (['measured', 'adp'].indexOf(OPP_MODEL) < 0) throw new Error('bad --opponents');
  const ALL_ARMS = buildArms();
  const armNames = String(argOf('--arms', Object.keys(ALL_ARMS).join(','))).split(',');
  armNames.forEach(a => { if (!ALL_ARMS[a]) throw new Error('unknown arm: ' + a); });
  armNames.forEach(a => {
    const c = ALL_ARMS[a].control;
    if (c && armNames.indexOf(c) < 0) {
      throw new Error('arm ' + a + ' is controlled by ' + c + ', which is not in --arms');
    }
  });

  const R = loadRoom();

  // Flag hygiene: snapshot every gate we may touch; the run must restore all.
  const guarded = [
    ['E', 'VONA_WIRE_BENCH'], ['E', 'VONA_SLOT_AWARE'], ['E', 'STAGE2_CAP'],
    ['E', 'CONSERVE_SURVIVAL_ON'], ['E', 'ONESIE_DISCOUNT'],
    ['E', 'ONESIE_HARD_CAP'], ['E', 'ONESIE_NEED_DISCOUNT'],
    ['E', 'FLEX_DISCOUNT'], ['E', 'CEILING_TIEBREAK'], ['E', 'DOCTRINE_TILT_ON'],
    ['C', 'KOV_MEASURED_RAMP'], ['S', 'ROOM_MIX_PRIOR'],
  ];
  const snapshot = guarded.map(([mod, key]) => [mod, key, CFG_OF[mod]()[key]]);

  const detail = {};
  armNames.forEach(a => { detail[a] = []; });
  for (let seed = SEED0; seed < SEED0 + ROOMS; seed++) {
    const seasonMemo = new Map();   // per-seed: identical pick sequences share outcomes
    armNames.forEach(a => {
      detail[a].push(runRoom(R, seed, ALL_ARMS[a], OPP_MODEL, SIMS, seasonMemo));
    });
  }

  snapshot.forEach(([mod, key, value]) => {
    if (CFG_OF[mod]()[key] !== value) {
      throw new Error('CFG flag ' + mod + '.' + key + ' mutated by the run — refusing to write');
    }
  });

  const summary = {}, paired = {}, byBatch = {}, verdicts = {};
  armNames.forEach(a => {
    summary[a] = summarizeArm(detail[a]);
    byBatch[a] = batchMeans(detail[a], SEED0, ROOMS, BATCH);
    const control = ALL_ARMS[a].control;
    if (control && detail[control]) {
      paired[a] = Object.assign({ control }, pairedDeltas(detail[a], detail[control]));
      if (ALL_ARMS[a].layer) {
        verdicts[a] = { layer: ALL_ARMS[a].layer,
          direction: ALL_ARMS[a].direction,
          classification: classify(paired[a], ALL_ARMS[a].direction) };
      }
    }
  });

  // Replay frame, embedded by hash so the two frames travel together without
  // retyping numbers (the embed is pinned to the file by test).
  let replayFrame = null;
  const replayPath = path.join(ROOT, 'draft', 'data', 'engine_ablation_replay_2026.json');
  if (fs.existsSync(replayPath)) {
    const raw = fs.readFileSync(replayPath);
    replayFrame = { file: 'draft/data/engine_ablation_replay_2026.json',
      sha256: crypto.createHash('sha256').update(raw).digest('hex'),
      summary: JSON.parse(raw.toString()).summary || null };
  }

  const layersOut = {};
  Object.keys(LAYERS).forEach(k => {
    layersOut[k] = { gate: LAYERS[k].gate, shipped: LAYERS[k].shipped,
      what: LAYERS[k].what, ruled: LAYERS[k].ruled || null,
      caveat: LAYERS[k].caveat || null };
  });

  const out = {
    _territory: 'TERRITORY: A — research artifact, no production reader',
    tool: 'draft/tools/engine_ablation.js',
    question_verbatim: QUESTION_VERBATIM,
    rooms: ROOMS, seed_start: SEED0, batch: BATCH, sims_per_room: SIMS,
    opponents: OPP_MODEL,
    arms: armNames,
    layers: layersOut,
    dark_layers: DARK_LAYERS,
    weekly_sd: CH.CFG.WEEKLY_SD,
    wire_floor: R.WIRE,
    plan_seats_loaded: Object.keys(R.PLAN_SLOT).length,
    opp_keeper_teams: R.OPP_KEEPERS.size,
    generated_at: new Date().toISOString(),
    note: 'SIMULATION throughout: paired-seed model outcomes under BOTH replacement '
      + 'models (zero = empty/bye slot scores 0; wire = each slot floored at the '
      + 'measured waiver level). The opponents are our own measured model — layers '
      + 'built to exploit real-room behavior can measure zero here by construction; '
      + 'per-layer caveats are in `layers` and the dark layers in `dark_layers`. '
      + 'Read paired deltas, never levels.',
    classification_rule: 'vs control, champ_prob + mean_weekly, both replacement '
      + 'models: EARNS = CI-clear positive contribution in >=1 model, not CI-clear '
      + 'negative in the other; HURTS = mirror; FREE otherwise. Any remove_* '
      + 'delta is (ablated - control): a negative delta there means the layer helps.',
    summary, paired_vs_control: paired, verdicts, batches: byBatch,
    replay_frame: replayFrame,
    detail,
  };
  const OUT_PATH = process.env.ENGINE_ABLATION_OUT
    || path.join(ROOT, 'draft', 'data', 'engine_ablation_2026.json');
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));

  console.log('ENGINE ABLATION — ' + ROOMS + ' paired rooms/arm, seeds ' + SEED0 + '-'
    + (SEED0 + ROOMS - 1) + ', opponents=' + OPP_MODEL + ', ' + armNames.length + ' arms');
  armNames.forEach(a => {
    const s = summary[a];
    const p = paired[a];
    const line = '  ' + a.padEnd(26)
      + ' wk ' + (s.zero.mean_weekly == null ? '—' : s.zero.mean_weekly.toFixed(1))
      + '  champ ' + (100 * s.zero.champ_prob).toFixed(1) + '%'
      + (p && p.zero.mean_weekly ? ('  Δwk ' + p.zero.mean_weekly.mean.toFixed(2)
        + ' [' + p.zero.mean_weekly.ci95.join(',') + '] vs ' + p.control
        + '  diverged ' + p.rooms_diverged + '/' + s.n) : '')
      + (verdicts[a] ? ('  ' + verdicts[a].classification) : '')
      + (s.crashed ? ('  CRASHED ' + s.crashed) : '');
    console.log(line);
  });
  console.log('  wrote ' + OUT_PATH);
}

module.exports = { LAYERS, DARK_LAYERS, buildArms, withFlags, CFG_OF,
  BOARD_TRANSFORMS, stripOpportunity, stripDepthChart, loadRoom, draftRoom,
  seasonScore, runRoom, pairedDeltas, classify, meanSe, QUESTION_VERBATIM,
  summarizeArm, batchMeans, METRICS, MODELS };

if (require.main === module) main();
