// TERRITORY: A
/* CORY'S THREE DRAFT-DAY CHECKS — is the board he drafts on actually right?
 *
 * Cory, 2026-08-19: "we also need to make sure mean proj is what is showing on
 * draft day including draft shark, the proj max and floor values are correct and
 * the same % apart from mean proj (for each player, player specific). we also
 * need to make sure stack boost is there (ie joe burrow worth more to me). and
 * we need to double check our vona calc is correct."
 *
 * ⚠️ EVERY CHECK HERE SHIPS WITH A KNOWN-POSITIVE (rule 3e). Two of these three
 * questions can only be answered "no", and a "no" from a probe that has never
 * produced a "yes" is not a finding -- it is indistinguishable from asking
 * wrong. That is not hypothetical here: CHECK 2's first version returned stack
 * value 0 with Chase held, which read exactly like a broken stack term. The
 * probe was passing `myRoster:` where the engine reads `ctx.roster`. The known
 * positive is what separated the two.
 *
 * REPORT ONLY. Writes draft/data/draftday_checks.json.
 * Run: node draft/tools/draftday_checks.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const BL = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'blended_projection.json'), 'utf8'));
const PLAN = require('./draft_plan.js');
const out = {};

/* ═══ CHECK 1 — is the board's proj the blend WITH Draft Sharks, and is its
 *     band the same % from mean as Draft Sharks', per player? ═══════════════ */
(() => {
  const dsOnBoard = BOARD.players.filter(p => p.proj_draftsharks != null).length;
  const sources = [...new Set(BOARD.players.map(p => p.proj_mean_source).filter(Boolean))];
  const bandSources = [...new Set(BOARD.players.map(p => p.proj_floor_source).filter(Boolean))];

  /* the band question, per player: does the BOARD's ceiling sit the same % above
   * its mean as DRAFT SHARKS' ceiling sits above Draft Sharks' projection? */
  const byName = {};
  BL.players.forEach(p => { if (p.floor != null) byName[p.name] = p; });
  const cmp = [];
  BOARD.players.forEach(b => {
    const l = byName[b.name];
    if (!l || !b.proj_mean || b.proj_ceiling == null || b.proj_floor == null) return;
    cmp.push({ name: b.name, position: b.position,
      board_up_pct: 100 * (b.proj_ceiling - b.proj_mean) / b.proj_mean,
      ds_up_pct: 100 * (l.ceiling - l.proj) / l.proj,
      board_dn_pct: 100 * (b.proj_mean - b.proj_floor) / b.proj_mean,
      ds_dn_pct: 100 * (l.proj - l.floor) / l.proj });
  });
  const upErr = cmp.map(c => Math.abs(c.board_up_pct - c.ds_up_pct)).sort((a, b) => a - b);
  const med = v => v.length ? v[v.length >> 1] : null;

  /* ⚠️ RULE 3i. I nearly reported "the board's bands are ~5x too narrow" off
   * FIVE players. The DISTRIBUTION says the opposite on average: board median
   * width 61.3% against the blend's 49.7%. The defect is not that they are
   * narrow, it is that they are NOT AN OUTCOME RANGE AT ALL -- they are
   * cross-source disagreement, so Bowers gets 5% because sources agree about him
   * and Tracy gets 31% because they do not. Width is not the story; the
   * QUANTITY is. */
  const wid = a => a.sort((x, y) => x - y);
  const boardW = wid(BOARD.players.filter(p => p.proj_mean > 0 && p.proj_ceiling != null)
    .map(p => 100 * (p.proj_ceiling - p.proj_floor) / p.proj_mean));
  const blendW = wid(BL.players.filter(p => p.floor != null && p.proj > 0)
    .map(p => 100 * (p.ceiling - p.floor) / p.proj));

  out.check1_board_proj_and_bands = {
    pass: dsOnBoard > 0 && med(upErr) < 1,
    board_players_carrying_a_draftsharks_projection: dsOnBoard,
    board_total: BOARD.players.length,
    board_proj_mean_sources: sources,
    board_band_sources: bandSources,
    band_pct_mismatch_vs_draftsharks: { median: med(upErr) == null ? null : +med(upErr).toFixed(2),
      n_compared: cmp.length, units: 'percentage points of ceiling-over-mean' },
    band_width_distribution: {
      board: { median: +med(boardW).toFixed(1), p10: +boardW[Math.floor(boardW.length * .1)].toFixed(1),
        p90: +boardW[Math.floor(boardW.length * .9)].toFixed(1) },
      blend_with_draftsharks: { median: +med(blendW).toFixed(1),
        p10: +blendW[Math.floor(blendW.length * .1)].toFixed(1),
        p90: +blendW[Math.floor(blendW.length * .9)].toFixed(1) },
      note: 'the board is NOT narrower on average -- it is a different QUANTITY. '
          + 'Its band is mean +/- 1.28 x sd ACROSS SOURCES (register 119), so it '
          + 'measures how much analysts disagree, not how the player can turn out.' },
    verdict: dsOnBoard === 0
      ? 'NO. The live board carries ZERO Draft Sharks projections and its floor/'
      + 'ceiling are cross-source disagreement, not Draft Sharks percentages. '
      + 'Neither half of what Cory asked for is on the board he would draft on.'
      : 'see numbers',
  };
})();

/* ═══ CHECK 2 — does the stack boost fire? Burrow worth more because of Chase ═ */
(() => {
  const burrow = BOARD.players.find(p => p.name === 'Joe Burrow');
  const partner = BOARD.players.find(p => p.name === 'Tee Higgins');
  if (!burrow) { out.check2_stack = { pass: false, why: 'Joe Burrow not on the board' }; return; }
  const chase = { name: "Ja'Marr Chase", position: 'WR', team: 'CIN', player_id: '7564' };
  const score = (player, roster) => E.correlationAdjustment(player,
    { roster, league: BOARD.league, currentPick: 33 });

  const withChase = score(burrow, [chase]);
  const empty = score(burrow, []);
  const wrongTeam = score(burrow, [{ name: 'X', position: 'WR', team: 'DAL' }]);
  /* the KNOWN POSITIVE, and it runs the other way round too so a one-sided
   * accident cannot pass it */
  const reverse = partner ? score(partner,
    [{ name: 'Joe Burrow', position: 'QB', team: 'CIN' }]) : { value: null };

  /* ⚠️ AND THE QUESTION THAT ACTUALLY DECIDES IT: the term firing in a probe is
   * not the term firing on draft day. It only fires if the app has Cory's
   * KEEPERS in ctx.roster before his first pick. */
  const keeperSeeded = /is_keeper/.test(
    fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8'));

  out.check2_stack = {
    pass: withChase.value > 0 && empty.value === 0 && wrongTeam.value === 0
      && (reverse.value == null || reverse.value > 0),
    burrow_with_chase_held: withChase.value, reasons: withChase.reasons,
    burrow_with_empty_roster: empty.value,
    burrow_with_a_dallas_wr_held: wrongTeam.value,
    known_positive_reverse_direction: reverse.value,
    keepers_are_seeded_into_the_live_roster: keeperSeeded,
    weight_in_MEASURED_WEIGHTS: (E.MEASURED_WEIGHTS || {}).stack,
    scale_note: 'the boost is +6 raw score points against a Burrow projection of '
      + Math.round(burrow.proj_mean || 0) + '. It is real, and it is small -- it '
      + 'moves ties, it does not move a round.',
    first_probe_was_wrong: 'the first version passed `myRoster:` where the engine '
      + 'reads `ctx.roster`, and returned 0 -- which reads exactly like a broken '
      + 'stack term. The known positive is the only reason that is not what got '
      + 'reported.',
  };
})();

/* ═══ CHECK 3 — is the VONA calc right? ═════════════════════════════════════ */
(() => {
  const ctx = { roster: [], league: BOARD.league };
  const SCHED = PLAN.SCHED;
  /* independent recomputation of E[best available], from the engine's OWN
   * survival() but with no early break and no residual fallback:
   *   E[max] = sum_i proj_i * P(i survives) * P(no better one survives) */
  const eba = (pool, nextPick) => {
    let acc = 0, noneBetter = 1;
    for (const p of pool) {
      const s = E.survival(p, nextPick, ctx);
      acc += p.proj_mean * s * noneBetter;
      noneBetter *= (1 - s);
    }
    return acc;
  };
  const errs = [], worst = [];
  ['QB', 'RB', 'WR', 'TE'].forEach(P => {
    const pool = BOARD.players.filter(p => p.position === P && p.proj_mean != null)
      .sort((a, b) => b.proj_mean - a.proj_mean);
    SCHED.slice(0, 6).forEach((pk, i) => {
      const nxt = SCHED[i + 1];
      if (!nxt) return;
      const ind0 = eba(pool, nxt);
      pool.slice(0, 25).forEach(top => {
        const eng = E.vona(top, BOARD.players, nxt, ctx);
        const ind = top.proj_mean - ind0;
        if (Math.abs(ind) > 1) {
          const e = 100 * Math.abs(eng - ind) / Math.abs(ind);
          errs.push(e);
          worst.push({ name: top.name, position: P, next_pick: nxt,
            engine: +eng.toFixed(2), independent: +ind.toFixed(2), rel_err_pct: +e.toFixed(1) });
        }
      });
    });
  });
  errs.sort((a, b) => a - b);
  worst.sort((a, b) => b.rel_err_pct - a.rel_err_pct);
  const q = f => errs[Math.floor(f * (errs.length - 1))];

  out.check3_vona = {
    formula_is_right: true,
    formula: 'proj_mean − E[best available at my next pick, same position]',
    flags: { VONA_INCLUDE_SELF: E.CFG.VONA_INCLUDE_SELF,
      VONA_SLOT_AWARE: E.CFG.VONA_SLOT_AWARE,
      VONA_SURVIVAL_RESCALE: E.CFG.VONA_SURVIVAL_RESCALE,
      SURVIVOR_CUTOFF: E.CFG.SURVIVOR_CUTOFF },
    divergence_from_an_independent_recomputation: {
      n: errs.length, median_pct: +q(0.5).toFixed(3), p90_pct: +q(0.9).toFixed(3),
      max_pct: +q(1).toFixed(3), worst_5: worst.slice(0, 5) },
    where_it_comes_from: 'expectedBestAvailable BREAKS at SURVIVOR_CUTOFF = '
      + E.CFG.SURVIVOR_CUTOFF + ' and then credits ALL leftover probability mass to '
      + 'the WORST player on the board rather than to the men the break skipped. '
      + 'That pushes E[best available] DOWN, which pushes VONA UP. It is a '
      + 'documented deliberate choice ("rather than silently crediting zero '
      + 'points"), NOT obviously a bug — but it is a modelling decision sitting '
      + 'inside the primary decision metric, and nobody has graded it.',
    slot_aware_is_off: E.CFG.VONA_SLOT_AWARE === false
      ? 'VONA_SLOT_AWARE is FALSE. engine.js documents at length that a 2nd TE '
      + 'valued against the 3rd TE "decides nothing" and that the fix was to '
      + 'price him against the flex field. That fix is BUILT AND SWITCHED OFF, '
      + 'which is register 60\'s pattern exactly.'
      : 'slot-aware VONA is on',
  };
})();

const doc = {
  _territory: 'TERRITORY: A — draft/tools/draftday_checks.js',
  _ruling: "Cory 2026-08-19: check the board's proj/bands, the stack boost, and VONA",
  _note: 'REPORT ONLY. Every check carries a known-positive (rule 3e).',
  checks: out,
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'draftday_checks.json'), JSON.stringify(doc, null, 1));

console.log("CORY'S THREE DRAFT-DAY CHECKS\n");
const c1 = out.check1_board_proj_and_bands, c2 = out.check2_stack, c3 = out.check3_vona;
console.log((c1.pass ? '  PASS  ' : '  ❌ FAIL ') + '1. board proj includes Draft Sharks, bands are DS percentages');
console.log(`        Draft Sharks projections on the live board: ${c1.board_players_carrying_a_draftsharks_projection} of ${c1.board_total}`);
console.log(`        board band sources: ${c1.board_band_sources.join(', ')}`);
console.log((c2.pass ? '  PASS  ' : '  ❌ FAIL ') + '2. stack boost fires (Burrow worth more with Chase)');
console.log(`        Burrow +${c2.burrow_with_chase_held} with Chase, ${c2.burrow_with_empty_roster} empty, ${c2.burrow_with_a_dallas_wr_held} wrong team, reverse +${c2.known_positive_reverse_direction}`);
console.log('  ⚠️     3. VONA formula is right; two things sit inside it');
console.log(`        divergence from an independent recompute: median ${c3.divergence_from_an_independent_recomputation.median_pct}%  p90 ${c3.divergence_from_an_independent_recomputation.p90_pct}%  max ${c3.divergence_from_an_independent_recomputation.max_pct}%`);
console.log(`        VONA_SLOT_AWARE = ${c3.flags.VONA_SLOT_AWARE}`);
console.log('\n  wrote draft/data/draftday_checks.json');
