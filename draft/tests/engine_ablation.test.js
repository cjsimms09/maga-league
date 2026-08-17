// TERRITORY: A
// THE ENGINE ABLATION DRIVER — mechanics only: determinism, flag plumbing
// (every ablation flag PROVEN to change behavior where its mechanism lives —
// a flag that changes nothing is a broken ablation), flag SCOPING (my policy
// only, never the opponent room), room parity with archetype_rooms.js, and
// artifact hygiene. What the layers MEASURED belongs in
// draft/audit/engine_ablation_2026-08-16.md — a strategy question has no
// pass/fail, only a report.
//
// Seeds here are 9001+ — the smoke pool reserved for mechanics, excluded
// from every ranking.
//
// Run: node draft/tests/engine_ablation.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
global.window = global;
const S = require(path.join(ROOT, 'public', 'js', 'draft', 'survival.js'));
const C = require(path.join(ROOT, 'public', 'js', 'draft', 'composite.js'));
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
require(path.join(ROOT, 'public', 'js', 'draft', 'needrule.js'));
const LC = require(path.join(ROOT, 'draft', 'tools', 'live_context.js'));
const EA = require(path.join(ROOT, 'draft', 'tools', 'engine_ablation.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d).slice(0, 300) : ''))); };

const TEST_OUT = path.join(os.tmpdir(), 'engine_ablation.test-out.json');
const COMMITTED = path.join(ROOT, 'draft', 'data', 'engine_ablation_2026.json');
const committedHashBefore = fs.existsSync(COMMITTED)
  ? crypto.createHash('sha256').update(fs.readFileSync(COMMITTED)).digest('hex') : null;

function run(extra) {
  return execSync('node draft/tools/engine_ablation.js ' + extra,
    { cwd: ROOT, env: Object.assign({}, process.env,
      { ENGINE_ABLATION_OUT: TEST_OUT }) }).toString();
}
function readOut() { return JSON.parse(fs.readFileSync(TEST_OUT, 'utf8')); }
function stripTime(doc) { const d = Object.assign({}, doc); delete d.generated_at; return d; }

const WIRE = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'wire_level.json'), 'utf8')).per_week;
const LEAGUE = { teams: 10, rounds: 15,
  starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 } };
const mk = (id, pos, pm, vorp, extra) => Object.assign(
  { player_id: id, name: pos + id, position: pos, proj_mean: pm, vorp,
    adjusted_adp: 50 + (Number(id) || 0), tier: 1 }, extra || {});
const baseCtx = over => Object.assign({
  board: [], roster: [], league: LEAGUE, currentPick: 100, nextPick: 113,
  myPicksLeft: 5, totalPicks: 150, myPickIndex: 7, totalMyPicks: 12,
  weights: E.DEFAULT_WEIGHTS, wireWeekly: WIRE, currentKeepers: [],
  intervening: [], roundsLeft: 5 }, over);

// ── 1. withFlags: sets, scopes, restores — including on throw ──────────────
{
  const shipped = E.CFG.VONA_WIRE_BENCH;
  let inside = null;
  EA.withFlags([['E', 'VONA_WIRE_BENCH', !shipped]], () => { inside = E.CFG.VONA_WIRE_BENCH; });
  ck('withFlags sets the flag inside the callback and restores it after',
    inside === !shipped && E.CFG.VONA_WIRE_BENCH === shipped);
  let threw = false;
  try {
    EA.withFlags([['E', 'VONA_WIRE_BENCH', !shipped], ['S', 'ROOM_MIX_PRIOR', false]],
      () => { throw new Error('boom'); });
  } catch (e) { threw = true; }
  ck('withFlags restores every flag even when the callback throws',
    threw && E.CFG.VONA_WIRE_BENCH === shipped && S.CFG.ROOM_MIX_PRIOR === true);
}

// ── 2. EVERY CFG-GATED LAYER'S FLIP CHANGES THE SURFACE ITS MECHANISM LIVES ON
// (the non-vacuity mandate: a flag that changes nothing is a broken ablation).
// Layers that CANNOT move the shipped surface are proven twice: mechanism
// live under DEFAULT_WEIGHTS / the reachable config, AND inert in the shipped
// config — the inertness is a finding, not a gap, and both halves are pinned.
{
  // Board-level flips that reach the real pick-33 surface (production ctx).
  const topN = c => E.recommend(c).slice(0, 15)
    .map(s => s.player.name + ':' + (s.score == null ? 'null' : s.score.toFixed(3))).join('|');
  const mkCtx = () => { const c2 = LC.liveContext({ currentPick: 33, nextPick: 48 }); c2.wireWeekly = WIRE; return c2; };
  const base = topN(mkCtx());
  [['kov_ramp', [['C', 'KOV_MEASURED_RAMP', false]]],
    ['room_mix', [['S', 'ROOM_MIX_PRIOR', false]]],
    ['conserve', [['E', 'CONSERVE_SURVIVAL_ON', false]]],
    ['vona_slot_aware', [['E', 'VONA_SLOT_AWARE', true]]],
    ['stage2_cap', [['E', 'STAGE2_CAP', true]]],
  ].forEach(([name, flip]) => {
    const alt = EA.withFlags(flip, () => topN(mkCtx()));
    ck('flag plumbing — ' + name + ' flip changes the top-15 at the real pick 33',
      alt !== base);
  });
  /* CEILING_TIEBREAK moved OUT of the pick-33 list, RE-PINNED 2026-08-17 as
   * the suite's own two-halves pattern. The tiebreak only fires inside a
   * TIE_THRESHOLD near-tie, and the 08-17 rebuild — the opportunity layer
   * zeroed by ruling and proj_ceiling switched to the measured p90
   * (use_measured_ceiling) — re-spread the early board: the pick-33 top-15 no
   * longer contains a tie for the flag to break, so a flip there changes
   * nothing. That is the board being decisive, not the flag being dead: on
   * the SAME artifact the flip still reorders the top-15 from pick 68 on.
   * Both halves pinned — inert where the board is spread, live where it is
   * tied — so the plumbing stays proven without demanding a tie exist at a
   * pick where the rebuilt board does not have one. */
  {
    const alt33 = EA.withFlags([['E', 'CEILING_TIEBREAK', false]], () => topN(mkCtx()));
    ck('flag plumbing — ceiling_tiebreak flip is INERT at pick 33 on the 08-17 '
      + 'board (no near-tie in the top-15 to break) — the finding, pinned',
    alt33 === base);
    /* RE-PINNED 68 → 98 on 2026-08-17 evening, same pattern as the 08-17
     * morning move out of pick 33: the survival empty-window fix (the 41%-wall
     * root cause, survival_fallen_uniform.test.js) gave fallen players their
     * room-model survival back, which re-spread VONA — and with it the
     * mid-board near-ties. Probed on the same artifact across picks 68-118:
     * inert through 93, live from 98 on. The board being decisive at 68 is,
     * again, the finding; the flag's plumbing is proven where a tie exists. */
    const mkLate = () => { const c2 = LC.liveContext({ currentPick: 98, nextPick: 103 }); c2.wireWeekly = WIRE; return c2; };
    const late = topN(mkLate());
    const altLate = EA.withFlags([['E', 'CEILING_TIEBREAK', false]], () => topN(mkLate()));
    ck('…and LIVE at the real pick 98, where the board still carries a near-tie '
      + '— the mechanism, proven on the same artifact', altLate !== late);
  }
}
{
  // ONESIE_DISCOUNT: a QB2 behind a rostered starter, starters+flex full.
  const roster = [mk('r1', 'QB', 380, 60), mk('r2', 'RB', 250, 70), mk('r3', 'RB', 240, 60),
    mk('r4', 'WR', 260, 70), mk('r5', 'WR', 250, 60), mk('r6', 'TE', 180, 40), mk('r7', 'RB', 200, 20)];
  const board = [mk('1', 'QB', 330, 40), mk('2', 'QB', 300, 10), mk('3', 'RB', 150, 5), mk('4', 'WR', 140, 4)];
  const qb = board[0];
  const on = E.scorePlayer(qb, baseCtx({ board, roster }));
  const off = EA.withFlags([['E', 'ONESIE_DISCOUNT', false]],
    () => E.scorePlayer(qb, baseCtx({ board, roster })));
  ck('flag plumbing — ONESIE_DISCOUNT flip changes a QB2\'s score '
    + '(discounted ' + on.score + ' vs undiscounted ' + off.score + ')',
    on.score !== off.score && on.score < off.score);

  // ONESIE_HARD_CAP: a third QB — capped only while the flag is on.
  const roster2 = roster.concat([mk('r8', 'QB', 300, 30)]);
  const capOn = E.scorePlayer(qb, baseCtx({ board, roster: roster2 }));
  const capOff = EA.withFlags([['E', 'ONESIE_HARD_CAP', false]],
    () => E.scorePlayer(qb, baseCtx({ board, roster: roster2 })));
  ck('flag plumbing — ONESIE_HARD_CAP flip changes a QB3\'s capped state',
    capOn.onesie && capOn.onesie.capped === true
    && capOff.onesie && !capOff.onesie.capped);
}
{
  // ONESIE_NEED_DISCOUNT and FLEX_DISCOUNT rewrite need.value, which
  // MEASURED_WEIGHTS multiplies by 0. Mechanism proven live under
  // DEFAULT_WEIGHTS; inert under MEASURED_WEIGHTS — BOTH pinned, because the
  // in-frame zero these layers measure is exactly this arithmetic.
  const rosterEmptyQB = [mk('r2', 'RB', 250, 70), mk('r3', 'RB', 240, 60),
    mk('r4', 'WR', 260, 70), mk('r5', 'WR', 250, 60), mk('r6', 'TE', 180, 40)];
  const board = [mk('1', 'QB', 330, 40), mk('2', 'QB', 300, 10), mk('3', 'RB', 150, 5)];
  const qb = board[0];
  const dOn = E.scorePlayer(qb, baseCtx({ board, roster: rosterEmptyQB }));
  const dOff = EA.withFlags([['E', 'ONESIE_NEED_DISCOUNT', false]],
    () => E.scorePlayer(qb, baseCtx({ board, roster: rosterEmptyQB })));
  ck('flag plumbing — ONESIE_NEED_DISCOUNT flip moves the score under DEFAULT_WEIGHTS '
    + '(mechanism live: ' + dOn.score + ' vs ' + dOff.score + ')', dOn.score !== dOff.score);
  const mOn = E.scorePlayer(qb, baseCtx({ board, roster: rosterEmptyQB, weights: E.MEASURED_WEIGHTS }));
  const mOff = EA.withFlags([['E', 'ONESIE_NEED_DISCOUNT', false]],
    () => E.scorePlayer(qb, baseCtx({ board, roster: rosterEmptyQB, weights: E.MEASURED_WEIGHTS })));
  ck('…and is INERT under MEASURED_WEIGHTS (w.need=0) — the vacuous-by-weights '
    + 'finding the audit reports, pinned', mOn.score === mOff.score);

  const rosterFlex = [mk('r1', 'QB', 380, 60), mk('r2', 'RB', 250, 70), mk('r3', 'RB', 240, 60),
    mk('r4', 'WR', 260, 70), mk('r5', 'WR', 250, 60), mk('r6', 'TE', 180, 40)];
  const rb = mk('9', 'RB', 180, 30);
  const boardF = [rb, mk('10', 'RB', 170, 25), mk('11', 'WR', 160, 20)];
  const fOn = E.scorePlayer(rb, baseCtx({ board: boardF, roster: rosterFlex }));
  const fOff = EA.withFlags([['E', 'FLEX_DISCOUNT', false]],
    () => E.scorePlayer(rb, baseCtx({ board: boardF, roster: rosterFlex })));
  ck('flag plumbing — FLEX_DISCOUNT flip moves a flex-only RB under DEFAULT_WEIGHTS',
    fOn.score !== fOff.score);
  const fmOn = E.scorePlayer(rb, baseCtx({ board: boardF, roster: rosterFlex, weights: E.MEASURED_WEIGHTS }));
  const fmOff = EA.withFlags([['E', 'FLEX_DISCOUNT', false]],
    () => E.scorePlayer(rb, baseCtx({ board: boardF, roster: rosterFlex, weights: E.MEASURED_WEIGHTS })));
  ck('…and FLEX_DISCOUNT is likewise INERT under MEASURED_WEIGHTS, pinned',
    fmOn.score === fmOff.score);
}
{
  // VONA_WIRE_BENCH: unreachable in the shipped config (slot-aware false ⇒
  // vona() returns `straight` first) — BOTH halves pinned: live under
  // slot-aware VONA, dead in the shipped path. This is the audit's
  // dead-code finding, held by test.
  const roster = [mk('r1', 'QB', 380, 60), mk('r2', 'RB', 250, 70), mk('r3', 'RB', 240, 60),
    mk('r4', 'WR', 260, 70), mk('r5', 'WR', 250, 60), mk('r6', 'TE', 180, 40), mk('r7', 'RB', 200, 20)];
  const board = [mk('1', 'QB', 330, 40), mk('2', 'QB', 300, 10), mk('3', 'RB', 150, 5)];
  const qb = board[0];
  const ctxOf = () => baseCtx({ board, roster });
  const liveOn = EA.withFlags([['E', 'VONA_SLOT_AWARE', true]], () => E.vona(qb, board, 113, ctxOf()));
  const liveOff = EA.withFlags([['E', 'VONA_SLOT_AWARE', true], ['E', 'VONA_WIRE_BENCH', false]],
    () => E.vona(qb, board, 113, ctxOf()));
  ck('flag plumbing — VONA_WIRE_BENCH flip moves bench VONA where the branch is '
    + 'reachable (slot-aware true): ' + liveOn + ' vs ' + liveOff, liveOn !== liveOff);
  const deadOn = E.vona(qb, board, 113, ctxOf());
  const deadOff = EA.withFlags([['E', 'VONA_WIRE_BENCH', false]], () => E.vona(qb, board, 113, ctxOf()));
  ck('…and is DEAD in the shipped config (VONA_SLOT_AWARE=false): flip changes '
    + 'nothing — the unreachability finding, pinned', deadOn === deadOff);
}
{
  // Weight-carried layers: keeper (KOV) and stack.
  const young = mk('12', 'WR', 200, 80, { age: 22, years_exp: 1, adjusted_adp: 58 });
  const board = [young, mk('13', 'WR', 150, 20, { adjusted_adp: 61 })];
  const ctxK = baseCtx({ board, roster: [mk('r2', 'RB', 250, 70)], currentPick: 45, nextPick: 58 });
  const kOn = E.scorePlayer(young, Object.assign({}, ctxK, { weights: E.MEASURED_WEIGHTS }));
  const kOff = E.scorePlayer(young, Object.assign({}, ctxK,
    { weights: Object.assign({}, E.MEASURED_WEIGHTS, { keeper: 0 }) }));
  ck('weight plumbing — keeper 1→0 moves a keeper-eligible young player\'s score',
    kOn.score !== kOff.score, { on: kOn.score, off: kOff.score });
  const wrS = mk('14', 'WR', 200, 40, { team: 'BUF' });
  const rosterS = [mk('r1', 'QB', 380, 60, { team: 'BUF' }), mk('r2', 'RB', 250, 70)];
  const ctxS = baseCtx({ board: [wrS, mk('15', 'WR', 150, 20)], roster: rosterS });
  const sOn = E.scorePlayer(wrS, Object.assign({}, ctxS, { weights: E.MEASURED_WEIGHTS }));
  const sOff = E.scorePlayer(wrS, Object.assign({}, ctxS,
    { weights: Object.assign({}, E.MEASURED_WEIGHTS, { stack: 0 }) }));
  ck('weight plumbing — stack 1→0 moves a stacked WR\'s score',
    sOn.score !== sOff.score, { on: sOn.score, off: sOff.score });
}
{
  // Board transforms: real changes, no mutation of the canonical row.
  /* RE-PINNED 2026-08-17. This block used to FIND its row on the live board
   * (`opportunity_adj && |proj_mean - proj_baseline| > 1`) — and Cory's
   * "Remove 1" ruling set opportunity_cap to 0.0 the same day, so the 08-17
   * artifact carries opportunity_adj 0.0000 on every row and proj_mean equals
   * proj_baseline everywhere. No such row exists to find any more; the find()
   * returned undefined and the whole suite crashed. The live board now pins
   * the ruling (no adjusted row exists), and the transform's arithmetic is
   * proven on a CONSTRUCTED adjusted row — stripping an adjustment the board
   * no longer carries must keep working, because strip_opportunity is exactly
   * the arm the ablation harness would use to measure the layer if the
   * ruling's reserved reversal ever restores it. */
  const data = LC.loadBoard();
  ck('the live board carries NO opportunity-adjusted row — Cory\'s "Remove 1" '
    + 'ruling (opportunity_cap 0.0) is in force in the artifact',
  !data.players.some(p => p.opportunity_adj
      && Math.abs(p.proj_mean - p.proj_baseline) > 1e-9));
  const real = data.players.find(p => p.opportunity_z != null && p.depth_chart_order > 0
    && p.proj_baseline != null && p.vorp != null);
  const row = Object.assign({}, real, {
    // A synthetic +5% opportunity adjustment on a real row's fields.
    opportunity_adj: 0.05, opportunity_z: 1.0,
    proj_mean: Math.round(real.proj_baseline * 1.05 * 100) / 100,
  });
  const so = EA.stripOpportunity(row);
  ck('strip_opportunity reverts proj_mean to proj_baseline and shifts vorp by the same delta',
    so.proj_mean === row.proj_baseline
    && Math.abs((so.vorp - row.vorp) - (row.proj_baseline - row.proj_mean)) < 1e-9);
  ck('strip_opportunity removes opportunity_z/adj; strip_depth_chart removes depth_chart_order; '
    + 'the canonical row is untouched (clone, not mutation)',
    !('opportunity_z' in so) && !('opportunity_adj' in so)
    && !('depth_chart_order' in EA.stripDepthChart(row))
    && row.opportunity_z != null && row.depth_chart_order != null);
  // depth_chart's one live path in the shipped config is KOV's keep model.
  const kpWith = C.keepProbability({ position: 'RB', age: 23, depth_chart_order: 3 }, 8, LEAGUE);
  const kpWithout = C.keepProbability({ position: 'RB', age: 23 }, 8, LEAGUE);
  ck('depth_chart mechanism — keepProbability moves when depth_chart_order is stripped',
    kpWith !== kpWithout);
}

// ── 3. SCOPING — an ablation flips MY policy only, never the opponent room ──
{
  const R = EA.loadRoom();
  const arms = EA.buildArms();
  const seen = [];
  const orig = S.positionProbabilities;
  S.positionProbabilities = function () {
    seen.push(S.CFG.ROOM_MIX_PRIOR);
    return orig.apply(this, arguments);
  };
  let d;
  try {
    d = EA.draftRoom(R, 9001, arms.minus_room_mix, 'measured');
  } finally {
    S.positionProbabilities = orig;
  }
  // The driver's only direct S.positionProbabilities caller is the opponent
  // generator (the engine reaches it through its own closure), so every
  // recorded value is an OPPONENT call — all must see the shipped prior.
  ck('SCOPING — every opponent positionProbabilities call sees the SHIPPED '
    + 'ROOM_MIX_PRIOR while the minus_room_mix arm drafts (' + seen.length + ' calls)',
    !d.crashed && seen.length > 100 && seen.every(v => v === true));
  ck('…and the flag is restored after the room', S.CFG.ROOM_MIX_PRIOR === true);
}

// ── 4. driver runs: determinism, seed variation, parity, divergence controls ─
const FAST = '--rooms 2 --seed 9001 --sims 200 --arms full,baseline_bpa,stripped,minus_opportunity,minus_conserve,minus_wire_bench';
{
  const a = run(FAST); const outA = stripTime(readOut());
  const b = run(FAST); const outB = stripTime(readOut());
  ck('same seed + config reproduce an identical artifact (generated_at aside), twice',
    a === b && JSON.stringify(outA) === JSON.stringify(outB));
  run('--rooms 2 --seed 9007 --sims 200 --arms full,baseline_bpa,stripped,minus_opportunity,minus_conserve,minus_wire_bench');
  const outC = stripTime(readOut());
  ck('a different seed produces different rooms — not the same draft re-served',
    JSON.stringify(outA.detail.full) !== JSON.stringify(outC.detail.full));
  fs.writeFileSync(TEST_OUT + '.a', JSON.stringify(outA));
}
{
  const out = JSON.parse(fs.readFileSync(TEST_OUT + '.a', 'utf8'));
  // CONTROL — ablations that must reach the picks on these seeds do.
  /* minus_opportunity MOVED to the zero-divergence side on 2026-08-17 morning
   * (Cory's "Remove 1" ruling: opportunity_cap 0.0, so every opportunity_adj
   * is 0 and proj_mean == proj_baseline — stripping the ADJUSTMENT limb is a
   * no-op by the ruling, and it stayed one: the board still carries zero
   * adjusted rows, pinned above on the live board).
   *
   * AND MOVED BACK the same evening, for a DIFFERENT limb than the block
   * predicted. strip_opportunity also deletes `opportunity_z`, the layer's
   * other limb, which feeds keeperOptionValue's breakout term (composite.js:
   * `0.35 * clamp(opportunity_z)` inside the keep-probability sigmoid; keeper
   * weight 1.0). Under ceiling 0 that difference existed but flipped no pick
   * on these seeds — the value anchor decided everything the z-limb could
   * touch. The ceiling term going live at 0.45 (Cory's same-day ruling — the
   * record is at MEASURED_WEIGHTS in engine.js) re-spread near-ties, and the
   * z-limb now decides real picks (measured here: 1/2 smoke rooms, first
   * divergence at my-pick index 1, cascading). So the arm returns to the
   * divergence CONTROLS: rooms_diverged === 0 would now mean the ablation
   * stopped reaching a choice the shipped config demonstrably makes. The
   * adjustment limb's no-op stays pinned separately (no-adjusted-row, above);
   * the divergence here is ENTIRELY the z-limb through KOV. */
  ['baseline_bpa', 'stripped', 'minus_opportunity'].forEach(a => {
    ck('CONTROL — ' + a + ' diverges from its control on the smoke seeds '
      + '(the ablation provably reaches the choice)',
      out.paired_vs_control[a].rooms_diverged > 0,
      out.paired_vs_control[a]);
  });
  /* minus_conserve MOVED to a dedicated seed on 2026-08-17 evening — same
   * two-halves pattern as minus_opportunity's history above, and for the same
   * class of reason: an upstream fix legitimately re-spread the numbers. The
   * survival empty-window fix (the 41%-wall root cause,
   * survival_fallen_uniform.test.js) stopped zeroing fallen players' raw
   * survival, so the conservation tilt now receives DIFFERENTIATED weights and
   * applies a smooth, rank-preserving correction instead of jolting a block of
   * players from 0 to exp(−λ). A smooth correction flips fewer argmaxes:
   * measured across seeds 9001-9006, the tilt still flips a real pick in 1/6
   * rooms — at seed 9003 — but no longer on 9001/9002. The control stays
   * non-vacuous by running the seed where the tilt demonstrably reaches a
   * choice; rooms_diverged === 0 THERE would mean the tilt died. */
  run('--rooms 1 --seed 9003 --sims 200 --arms full,minus_conserve');
  const conserveOut = readOut();
  ck('CONTROL — minus_conserve diverges from its control on its dedicated seed '
    + '(9003 — the ablation provably reaches the choice)',
  conserveOut.paired_vs_control.minus_conserve.rooms_diverged > 0,
  conserveOut.paired_vs_control.minus_conserve);
  // The zero-divergence identity: an arm whose rooms never diverged must have
  // EXACTLY zero deltas — pairing and season-memo accounting are exact.
  const zeroArms = [
    ['minus_wire_bench', 'the dead-code finding at driver level'],
  ];
  zeroArms.forEach(([name, why]) => {
    const wb = out.paired_vs_control[name];
    ck(name + ' never diverges (' + why + ') '
      + 'and its paired deltas are EXACTLY zero in both season models',
    wb.rooms_diverged === 0
      && ['zero', 'wire'].every(m => ['mean_weekly', 'champ_prob'].every(k =>
        wb[m][k].mean === 0 && wb[m][k].ci95[0] === 0 && wb[m][k].ci95[1] === 0)));
  });
  // Artifact discipline.
  ck('_territory is the artifact\'s first key; question verbatim; layers + '
    + 'dark layers enumerated; classification rule recorded',
    Object.keys(out)[0] === '_territory'
    && out.question_verbatim === EA.QUESTION_VERBATIM
    && out.layers.wire_bench && out.layers.opportunity
    && out.dark_layers.doctrine_tilt && out.dark_layers.run_detection
    && typeof out.classification_rule === 'string');
  ck('both season rulers are present per room (zero-replacement AND wire-floor)',
    out.detail.full.every(r => r.zero && r.wire
      && r.zero.mean_weekly > 50 && r.wire.mean_weekly > 50
      && r.wire.mean_weekly >= r.zero.mean_weekly - 1e-9));
}
{
  // PARITY — the copied room mechanics cannot drift from archetype_rooms.js:
  // full == shipped, baseline_bpa == bpa_vorp, pick for pick, same seeds.
  const archOut = path.join(os.tmpdir(), 'engine_ablation.arch-par.json');
  execSync('node draft/tools/archetype_rooms.js --rooms 2 --seed 9001 '
    + '--arms shipped,bpa_vorp --sims 200',
    { cwd: ROOT, env: Object.assign({}, process.env, { ARCHETYPE_ROOMS_OUT: archOut }) });
  const arch = JSON.parse(fs.readFileSync(archOut, 'utf8'));
  const mine = JSON.parse(fs.readFileSync(TEST_OUT + '.a', 'utf8'));
  const names = r => r.picksLog.map(p => p.name).join('|');
  const pairs = [['shipped', 'full'], ['bpa_vorp', 'baseline_bpa']];
  ck('ROOM PARITY — full/baseline_bpa reproduce archetype_rooms\' shipped/bpa_vorp '
    + 'pick-for-pick and to the same weekly mean (the no-drift pin on the copied mechanics)',
    pairs.every(([a, b]) => [0, 1].every(i =>
      names(arch.detail[a][i]) === names(mine.detail[b][i])
      && arch.detail[a][i].mean_weekly === mine.detail[b][i].zero.mean_weekly)));
}

// ── 5. classify(): the preregistered rule, both directions, boundary cases ──
{
  const d = (zm, zc, wm, wc) => ({
    zero: { mean_weekly: { mean: zm[0], ci95: zm }, champ_prob: { mean: zc[0], ci95: zc } },
    wire: { mean_weekly: { mean: wm[0], ci95: wm }, champ_prob: { mean: wc[0], ci95: wc } } });
  ck('classify — CI-clear positive add-direction delta EARNS',
    EA.classify(d([0.2, 0.6], [0.001, 0.02], [0.1, 0.5], [0.001, 0.02]), 'add_to_stripped') === 'EARNS');
  ck('classify — the SAME deltas in a remove direction read as HURTS (sign convention)',
    EA.classify(d([0.2, 0.6], [0.001, 0.02], [0.1, 0.5], [0.001, 0.02]), 'remove_from_full') === 'HURTS');
  ck('classify — a remove-direction NEGATIVE delta means the layer helped: EARNS',
    EA.classify(d([-0.6, -0.2], [-0.02, -0.001], [-0.5, -0.1], [-0.02, -0.001]), 'remove_from_full') === 'EARNS');
  ck('classify — straddling CIs are FREE (boundary: ci95 touching zero from inside)',
    EA.classify(d([-0.1, 0.3], [-0.01, 0.01], [-0.2, 0.2], [-0.01, 0.01]), 'add_to_stripped') === 'FREE');
  ck('classify — clear-positive in one replacement model, clear-negative in the '
    + 'other is named a bracket artifact, never EARNS',
    /bracket artifact/.test(
      EA.classify(d([0.2, 0.6], [0.001, 0.02], [-0.5, -0.1], [-0.02, -0.001]), 'add_to_stripped')));
}

// ── 6. hygiene: committed artifact untouched, shipped defaults intact ───────
{
  const committedHashAfter = fs.existsSync(COMMITTED)
    ? crypto.createHash('sha256').update(fs.readFileSync(COMMITTED)).digest('hex') : null;
  ck('the committed artifact was never touched by these runs (ENGINE_ABLATION_OUT redirects)',
    committedHashBefore === committedHashAfter);
  ck('engine/survival/composite defaults match the shipped rulings after all runs '
    + '(VONA_WIRE_BENCH=true, VONA_SLOT_AWARE=false, STAGE2_CAP=false, '
    + 'ROOM_MIX_PRIOR=true, KOV_MEASURED_RAMP=true, CONSERVE_SURVIVAL_ON=true)',
    E.CFG.VONA_WIRE_BENCH === true && E.CFG.VONA_SLOT_AWARE === false
    && E.CFG.STAGE2_CAP === false && S.CFG.ROOM_MIX_PRIOR === true
    && C.CFG.KOV_MEASURED_RAMP === true && E.CFG.CONSERVE_SURVIVAL_ON === true
    && E.CFG.ONESIE_DISCOUNT === true && E.CFG.ONESIE_HARD_CAP === true
    && E.CFG.FLEX_DISCOUNT === true && E.CFG.CEILING_TIEBREAK === true);
}
{
  // The committed artifact (when present) embeds the replay frame BY HASH —
  // the no-retype rule enforced by test, not comment.
  if (fs.existsSync(COMMITTED)) {
    const doc = JSON.parse(fs.readFileSync(COMMITTED, 'utf8'));
    const rf = doc.replay_frame;
    const replayFile = path.join(ROOT, 'draft', 'data', 'engine_ablation_replay_2026.json');
    const sha = crypto.createHash('sha256').update(fs.readFileSync(replayFile)).digest('hex');
    ck('committed artifact embeds the replay frame with a sha256 that matches the '
      + 'committed replay artifact byte-for-byte', rf && rf.sha256 === sha);
    ck('committed artifact: _territory first, verdict per layer-carrying arm, 120 rooms',
      Object.keys(doc)[0] === '_territory' && doc.rooms === 120
      && Object.keys(doc.verdicts).length >= 25);
  } else {
    ck('committed artifact present', false, 'draft/data/engine_ablation_2026.json missing');
  }
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: every ablation flag provably changes behavior');
console.log('where its mechanism lives (and the vacuous-by-weights / dead-code layers');
console.log('are pinned INERT — the finding, held by test); flips are scoped to my');
console.log('policy and never reach the opponent room; the driver is deterministic');
console.log('per seed; the copied room mechanics are pick-for-pick equal to');
console.log('archetype_rooms.js; no run touches the committed artifact or defaults.');
console.log('WHAT IT DOES NOT: judge any layer — see the audit doc.');
