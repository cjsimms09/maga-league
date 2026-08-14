// TERRITORY: A
/* THE CARD FOR AUGUST 22 — one page, and it survives the room not cooperating.
 *
 * Cory, early: *"how do we make the board I will be using follow the basis of
 * the model we are trying to create?"* The answer that emerged from a day of
 * measurement is NOT a scoring-path change. It is this:
 *
 *   THE ENGINE PICKS THE PLAYER. THE PLAN PICKS THE SEAT.
 *
 * Measured (greedy_vs_plan.js): driving the engine's own #1 at every pick
 * scores 2091.0 against the plan's 2150.5 — the engine gains 34 at QB by taking
 * Allen at pick 8 and loses 40 at FLEX and 26 at RB paying for him. VONA prices
 * the value GAINED at a position and never the value NOT LOST elsewhere, which
 * is exactly the sentence Cory wrote weeks ago. A greedy per-pick rule and a
 * global seat assignment diverge whenever waiting is cheap, and QB in a one-QB
 * league is the cheapest wait on the board.
 *
 * Slot-aware VONA has failed three times (c662ad4, with numbers). A fourth
 * attempt nine days out, on live scoring, to capture 59.6 points is the
 * constitutional rule waiting to happen. THE SEAT SCHEDULE COSTS NOTHING AND
 * CAPTURES MOST OF IT, because the engine is a board, not an autopilot.
 *
 * ── WHAT MAKES THIS DIFFERENT FROM draft_plan.js ───────────────────────────
 *
 * draft_plan assumes the room drafts in ADP order and names ONE player per
 * pick. The room will not cooperate. So this prints, for each pick, the SEAT to
 * fill and a RANKED SHORTLIST for that seat, plus the rule for what to do when
 * the shortlist is gone — which is the case a single-name plan handles worst.
 *
 * Run: node draft/tools/draft_card.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PLAN = require('./draft_plan.js');

const { plan, keep, pool, WAIVER } = PLAN;
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const kept = new Set(keep.map(k => String(k.player_id)));

/* THE WIRE IS DERIVED, NOT TRANSCRIBED — and this is the file it mattered most
 * in, because this is the card that gets opened on 08-22. It shipped
 * `{QB 20.9, RB 5.3, WR 13.3, TE 6.3}` described as "pooled 2023-25"; that was
 * the median of the cell medians surviving a min_n=5 reporting floor, which
 * keeps 1 of 42 QB weeks. Every percentage this card prints below is now
 * computed from `WIRE_LEVEL`, because a card that transcribes a derived figure
 * goes stale silently and this one already had: it said "89% of a good QB" and
 * "764 real acquisitions", and neither survived the measurement. */
const WIRE_LEVEL = require('./wire_level.js').levels();
const WIRE = WIRE_LEVEL.per_week;
const BYE_STARTS = { RB: 3, WR: 2, QB: 1, TE: 1 };   // bye_structure.js, exact

console.log('═══ DRAFT CARD — 2026-08-22 ═══════════════════════════════════════════\n');
console.log('  keepers: ' + keep.map(k => k.position + ' ' + k.name).join(', '));
console.log('  THE RULE: the PLAN picks the seat. The ENGINE picks the player for it.');
/* READ, NOT RESTATED. This line printed a hardcoded 59.6 — right when written
 * and wrong the moment the pick schedule was corrected, because that figure was
 * measured against fifteen picks Cory does not own. Same defect class as the
 * hardcoded SCHED that caused it. The artifact derives the number on every
 * emit; the card quotes the artifact. */
{
  const sp = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'seat_plan.json'), 'utf8'));
  const d = sp.measured_edge_detail || {};
  console.log('  Measured cost of letting the engine pick the seat too: '
    + sp.measured_edge_vs_greedy + ' pts');
  console.log('  (engine ' + (d.engine_greedy || 0).toFixed(1) + ' vs plan '
    + (d.global_plan || 0).toFixed(1) + '; the engine already names the plan\'s own');
  console.log('  player at ' + d.seats_where_engine_names_the_plans_player + ' of '
    + d.seats + ' seats — EXPLORATORY, a simulated room.)\n');
}

/* ── THE SEAT SCHEDULE, WITH A SHORTLIST NOT A NAME ────────────────────────
 * A single name is brittle: one other manager takes him and the card is silent
 * exactly when it is needed. Three deep per seat, in the plan's own order. */
console.log('  ── SEATS ────────────────────────────────────────────────────────────');
const seatRows = plan.filter(x => !x.bench);
const taken = new Set();
seatRows.forEach(x => {
  /* Earlier seats are already filled by the time this one is on the clock. The
   * shortlist has to know that — FLEX and the RB/WR/TE seats overlap, and a
   * roster-blind ordering handing back a player you already own is the exact
   * failure this card warns about four lines below. */
  const gone = new Set(byAdp.slice(0, PLAN.liveBefore(x.pick)).map(p => String(p.player_id)));
  const elig = x.slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [x.slot];
  const short = pool.filter(p => !gone.has(String(p.player_id)) && !kept.has(String(p.player_id))
    && !taken.has(String(p.player_id)) && elig.indexOf(p.position) >= 0)
    .sort((a, b) => b.proj_mean - a.proj_mean).slice(0, 3);
  if (x.p) taken.add(String(x.p.player_id));
  console.log('   pick ' + String(x.pick).padStart(3) + '  fill ' + x.slot.padEnd(5)
    + '  ' + short.map(p => p.position + ' ' + p.name.split(' ').slice(-1)[0]
      + ' ' + Math.round(p.proj_mean)).join('  ·  '));
});
console.log('\n   IF ALL THREE ARE GONE: take the best remaining player ELIGIBLE FOR THAT');
console.log('   SEAT, not the best player on the board. The seat is the constraint;');
console.log('   the board ordering is roster-blind and will hand you a duplicate.');

/* ── BENCH: THE RULE, NOT A LIST ───────────────────────────────────────────
 * Cory's own test, and the wire numbers that decide it. */
console.log('\n  ── BENCH ────────────────────────────────────────────────────────────');
console.log('   THE TEST (Cory): is he worth more than what is FREE at his position?');
console.log('   Points per week, against what a rostered backup gives you. Measured from');
console.log('   every scored acquisition-week 2023-25 — n=' + WIRE_LEVEL.scored
  + ' of ' + WIRE_LEVEL.acquisitions + ' acquisitions, UNFILTERED:');
console.log('   (the old min_n=5 floor this card used to quote kept 1 of 42 QB weeks)\n');
console.log('     pos   wire/wk   a backup is worth holding when he beats it by...');
console.log('     ' + '-'.repeat(66));
/* THE ONLY COMPARISON THAT TRAVELS ACROSS POSITIONS IS A RATIO. RB's wire is
 * the lowest number on the board in absolute points and that means nothing on
 * its own — a QB scores roughly twice what an RB does, so 23.4 and 7.8 are not
 * on one scale. What decides whether to hold a backup is the wire AS A FRACTION
 * OF THE STARTER IT WOULD REPLACE. That derivation lives in `draft_plan` so this
 * card and `free_picks` cannot compute it two ways, which is the mistake one
 * layer up that this whole change is undoing. */
const VS = PLAN.wireVsStarter();
const wirePct = {};
['RB', 'WR', 'TE', 'QB'].forEach(p => {
  wirePct[p] = VS[p] ? VS[p].pct : null;
  const starts = BYE_STARTS[p];
  console.log('     ' + p.padEnd(6) + WIRE[p].toFixed(2).padStart(6)
    + '     starts ~' + starts + ' wk from byes alone'
    + (wirePct[p] == null ? '   (no starter line — too few ' + p + ' priced)'
      : '   = ' + wirePct[p].toFixed(0) + '% of your last starting ' + p));
});
/* WHICH POSITION TO HOLD IS AN ORDERING OF THOSE RATIOS, not a sentence written
 * when the constants said something else. The old card said "hold RBs, the wire
 * is worst here" from the raw 5.3 and it happened to be right; it is asserted
 * here only if it is still true. */
const RANKED = ['RB', 'WR', 'TE', 'QB'].filter(p => wirePct[p] != null)
  .sort((a, b) => wirePct[a] - wirePct[b]);
const HARDEST = RANKED[0], EASIEST = RANKED[RANKED.length - 1];
{
  const worst = HARDEST, best = EASIEST;
  console.log('\n   SO: the wire replaces your ' + best + ' most easily ('
    + wirePct[best].toFixed(0) + '% of a starter) and your ' + worst + ' least ('
    + wirePct[worst].toFixed(0) + '%).');
  console.log('   HOLD ' + worst + 's. A backup is worth a roster spot only where free is far');
  console.log('   below the man he replaces AND he actually starts weeks — the table below');
  console.log('   applies both halves to this plan\'s own bench.');
}

/* CORY'S RULE, RUN AGAINST THE MODEL'S OWN BENCH — the part a card exists for.
 * Stating a test and not applying it to your own recommendations is how a
 * document reads as rigorous while changing no decision. Computed from the live
 * plan, not transcribed, so it stays true when the plan moves. */
{
  const WEEKS = 15;
  const N = WIRE_LEVEL.n;   // derived with the level, so the two cannot disagree
  /* Weeks each backup ACTUALLY starts from byes — exact, no injury parameter,
   * from bye_structure.js section 1. Per-player and not per-position: Swift
   * covers all three RB bye weeks, so Pollard and Rodriguez behind him cover
   * NONE. A position-level figure would credit them 3 apiece and invent value. */
  const STARTS = { 'D\'Andre Swift': 3, 'Mike Evans': 2, 'Dak Prescott': 1,
    'Tony Pollard': 0, 'George Kittle': 1, 'Jayden Reed': 0, 'Chris Rodriguez': 0 };
  console.log('\n   THE MODEL\'S OWN BENCH, SCORED AGAINST THAT TEST:');
  console.log('     pick  player                 his/wk  wire  wire is  starts  floor   VERDICT');
  console.log('     ' + '-'.repeat(80));
  let failed = 0;
  plan.filter(x => x.bench && x.p && WIRE[x.p.position]).forEach(x => {
    const mine = x.p.proj_mean / WEEKS, w = WIRE[x.p.position];
    const pct = 100 * w / mine;
    const wk = STARTS[x.p.name];
    const floor = wk == null ? null : wk * (mine - w);
    /* A low floor is NOT by itself a cut. The floor excludes injury weeks, and
     * injury is the whole job of a backup RB — where the wire pays 5.3, the
     * worst on the board. So the cut requires BOTH: the byes do not pay him AND
     * the wire can replace him. Judging on the floor alone would condemn exactly
     * the players whose value the floor was built to leave out. */
    const replaceable = pct >= 75;
    const bad = pct >= 100 || (floor != null && floor < 5 && replaceable);
    if (bad) failed++;
    console.log('     ' + String(x.pick).padStart(4) + '  '
      + (x.p.position + ' ' + x.p.name).padEnd(22)
      + mine.toFixed(1).padStart(6) + w.toFixed(1).padStart(6)
      + pct.toFixed(0).padStart(8) + '%'
      + (wk == null ? '     ?' : String(wk).padStart(6))
      + (floor == null ? '      ?' : floor.toFixed(1).padStart(7)) + '   '
      /* PCT >= 100 IS DECISIVE ON ITS OWN and must be tested BEFORE the
       * missing-bye branch. It was tested after, so a player the wire simply
       * outscores printed "UNKNOWN — re-run bye_structure.js" while the count
       * at the bottom of this block counted him as failing — the table and its
       * own total disagreeing on the same screen. */
      + (pct >= 100 ? 'CUT — the wire is better than him'
        : wk == null ? 'UNKNOWN — re-run bye_structure.js'
        : floor >= 5 ? 'HOLD — the byes alone pay for him'
        : replaceable ? 'CUT — no bye value, and free is ' + pct.toFixed(0) + '% of him'
        : 'injury insurance ONLY — but free is just ' + pct.toFixed(0) + '% of him')
      + (N[x.p.position] < 20 ? '  (n=' + N[x.p.position] + ')' : ''));
  });
  /* ⚠️ THE VERDICT ABOVE USES THE ONE-WEEK WIRE, AND FIVE OF SIX ROWS SIT ON
   * THE WRONG SIDE OF THE BAND. The shipped level is the score in the week a
   * player is ACQUIRED; measured 2026-08-13, the same players pay far less over
   * the three weeks you then hold them (TE 11.60 -> 6.8, WR 11.10 -> 7.3), and
   * all of that spike lives in WAIVER claims rather than free-agent adds.
   *
   * Which number applies depends on HOW LONG THE HOLE LASTS — one week for a
   * bye, `E[weeks out | injured]` for an injury, which nobody has measured. So
   * the card does not pick; it says which verdicts survive both readings and
   * which are an artefact of the shorter one. A verdict that flips inside the
   * band is not a verdict, and printing it as one is what the whole wire
   * correction was undertaken to stop. */
  {
    const OG = (WIRE_LEVEL.ongoing || {}).per_week || {};
    const flips = [];
    plan.filter(x => x.bench && x.p && WIRE[x.p.position] != null && OG[x.p.position] != null)
      .forEach(x => {
        const mine = x.p.proj_mean / WEEKS;
        const a = 100 * WIRE[x.p.position] / mine, b = 100 * OG[x.p.position] / mine;
        const cut = v => v >= 100;
        if (cut(a) !== cut(b)) flips.push({ x: x, a: a, b: b });
      });
    if (flips.length) {
      console.log('\n     ⚠️ ' + flips.length + ' OF THESE VERDICTS DEPEND ON HOW LONG THE HOLE LASTS.');
      console.log('     The wire number above is the score in the week a player is CLAIMED.');
      console.log('     Over the next three weeks the same adds pay much less, and the whole');
      console.log('     spike is in waiver claims, not free-agent pickups:');
      flips.forEach(f => {
        console.log('       ' + (f.x.p.position + ' ' + f.x.p.name).padEnd(22)
          + 'one week: ' + f.a.toFixed(0) + '% (' + (f.a >= 100 ? 'CUT' : 'hold')
          + ')   held 3wk: ' + f.b.toFixed(0) + '% (' + (f.b >= 100 ? 'CUT' : 'hold') + ')');
      });
      console.log('     READ IT THIS WAY: cut them if you will STREAM the position week to');
      console.log('     week. Keep them if you need somebody to hold a job while a starter');
      console.log('     is out. E[weeks out | injured] is what decides it and is unmeasured.');
    } else {
      console.log('\n     Every verdict above survives BOTH wire readings — the one-week');
      console.log('     claim level and the three-week held level — so none of them is an');
      console.log('     artefact of which one the card happens to quote.');
    }
  }
  console.log('\n     FLOOR = weeks he actually starts x his edge over a free player. It is a');
  console.log('     FLOOR, not a forecast: injury weeks sit on top of it and are genuinely');
  console.log('     unknown (E[weeks out | injured] is an open C request). Read it as the');
  console.log('     value you get if nobody gets hurt, which is the half that is certain.');
  console.log('\n     ' + failed + ' of ' + plan.filter(x => x.bench && x.p && WIRE[x.p.position]).length
    + ' bench picks fail on BOTH counts and are the ones to redirect.');
  /* THE WORKED EXAMPLE IS READ OFF THE PLAN, NOT REMEMBERED. It named Dak, his
   * 2.6/wk edge and "89%" — three figures transcribed from a run against the old
   * wire constant, in the paragraph whose whole job is showing a reader how to
   * combine them. Now it finds whichever bench player carries the fewest starts
   * and prints HIS arithmetic. */
  {
    const cands = plan.filter(x => x.bench && x.p && WIRE[x.p.position] != null
      && STARTS[x.p.name] != null && STARTS[x.p.name] > 0)
      .sort((a, b) => STARTS[a.p.name] - STARTS[b.p.name]);
    const e = cands[0];
    if (e) {
      const mine = e.p.proj_mean / WEEKS, w = WIRE[e.p.position];
      const wk = STARTS[e.p.name];
      console.log('     HOW TO READ ONE ROW — ' + e.p.name + ': he clears the wire by '
        + (mine - w).toFixed(1) + '/wk but starts ' + wk + ' week' + (wk === 1 ? '' : 's')
        + ',');
      console.log('     so the spot returns ' + (wk * (mine - w)).toFixed(1)
        + ' points. The edge is why he beats free; the ' + wk + ' start'
        + (wk === 1 ? '' : 's') + ' is why');
      console.log('     beating it does not settle whether he is worth the spot.');
    }
  }
  console.log('\n     THE ' + HARDEST + 's WITH A ZERO FLOOR ARE A DIFFERENT CASE AND SHOULD NOT BE CUT.');
  console.log('     They start no weeks from byes, but the ' + HARDEST + ' wire pays '
    + WIRE[HARDEST].toFixed(1) + ' — only ' + wirePct[HARDEST].toFixed(0) + '% of');
  console.log('     the starter it replaces, the hardest hole on the board to fill free — so they');
  console.log('     are the one place where pure injury');
  console.log('     insurance is worth a spot. The floor excludes injury BY CONSTRUCTION;');
  console.log('     condemning them on it would be judging a player by the one term the');
  console.log('     measurement was built to leave out.');
}

/* ── THE WEEK THAT DECIDES QB2 AND TE2 ─────────────────────────────────── */
{
  const roster = keep.map(k => pool.find(p => String(p.player_id) === String(k.player_id)) || k)
    .concat(plan.filter(x => x.p).map(x => x.p));
  const w13 = roster.filter(p => p.bye === 13);
  console.log('\n  ── BYE WEEK 13 — AND WHY IT DOES NOT BUY QB2 AND TE2 ───────────────');
  console.log('   out together: ' + w13.map(p => p.position + ' ' + p.name).join(', '));
  console.log('   The collision is REAL and it is a CERTAINTY, not a probability — and the');
  console.log('   model prices it at 0, because pNeedNth reads injury rates and knows');
  console.log('   nothing about byes. That is a genuine defect (#37) and it is still open.');
  console.log('\n   BUT IT DOES NOT JUSTIFY DRAFTING THE BACKUPS, and I had this wrong until');
  console.log('   the wire numbers landed. The alternative to a rostered QB2 is not fielding');
  console.log('   ZERO — it is STREAMING, and a streamed QB is measured at 20.9/wk. So the');
  console.log('   week-13 hole costs 2.6 points at QB and 3.8 at TE, not a forfeited week.');
  console.log('   Those are the FLOOR figures in the table above; the bye emergency and the');
  console.log('   wire measurement are the same quantity seen from two sides.');
  console.log('\n   SO: do not spend a draft pick in round 7 on a week-13 problem you can');
  console.log('   solve with a week-12 waiver claim. Carry the FAAB instead.');
  console.log('   Two caveats, both real: the QB wire figure rests on n=5, and streaming');
  console.log('   assumes a claim actually lands — if FAAB is spent by week 12 this flips.');
  console.log('   Also short: week 11 DEF (Rams bye), week 14 K (Aubrey bye) — stream both.');
}

/* ── THE FREE PICKS, AND WHAT TO SPEND THEM ON ─────────────────────────── */
{
  const unp = plan.filter(x => x.unpriced).length;
  console.log('\n  ── THE FIVE FREE PICKS — 53, 68, 93, 133, 148 ──────────────────────');
  console.log('   ' + unp + ' price at EXACTLY ZERO (133, 148). Three more — 53, 68, 93 — buy');
  console.log('   Evans, Prescott and Reed, whom the wire matches or beats. So a THIRD of');
  console.log('   the draft is free, and rounds 6, 7 and 10 are in it. (free_picks.js)');
  console.log('   The model is PROVABLY INDIFFERENT there, so spend them on what it');
  console.log('   cannot see:');
  console.log('     · WR at 53, 68, 93 — our drafted shape is 3 against a league average');
  console.log('       of 5.23, the largest deviation on the roster.');
  const myRb = keep.filter(k => k.position === 'RB');
  const hc = myRb.map(s => {
    const m = pool.filter(p => p.team === s.team && p.position === 'RB'
      && String(p.player_id) !== String(s.player_id))
      .sort((a, b) => b.proj_mean - a.proj_mean)[0];
    return m ? m.name + ' (' + s.name.split(' ').slice(-1)[0] + ', ADP '
      + Math.round(adpOf(m)) + ')' : null;
  }).filter(Boolean);
  console.log('     · HANDCUFFS at 133/148 — all go undrafted, so they are free:');
  console.log('       ' + hc.join('; '));
  console.log('       The argument is STRUCTURAL, not a point total: the RB wire pays');
  console.log('       5.3/wk, the worst of any position, so an RB hole is the one hole');
  console.log('       waivers cannot fill. Inheritance value is ASSUMED, not measured.');
}

/* ── WHAT THIS CARD IS NOT ─────────────────────────────────────────────── */
console.log('\n  ── READ THIS BEFORE TRUSTING ANY LINE ABOVE ────────────────────────');
console.log('   · The seat schedule assumes the room drafts near ADP. It does not.');
console.log('     Re-run draft_plan.js at any pick where the board has moved a lot;');
console.log('     the SEAT ORDER is robust (TE-13 / QB-33 held from -25% to +15%');
console.log('     ADP drift), the NAMES are not.');
console.log('   · TE at 13 rests on a usage bonus QBs cannot receive by construction');
console.log('     (projections.py gives QB/K/DEF z=0). Bowers is handed +30 pts Lamar');
console.log('     is structurally ineligible for. That is a real open question and it');
console.log('     grades in September, after this draft.');
console.log('   · Every bench price is overstated: P(need) is multiplied by a FULL');
console.log('     SEASON advantage, so a one-week bye and a season-ending tear cost');
console.log('     the same. Direction is right, magnitude is high.');
console.log('   · The weekly high-score payout is 37.5% of the pot and NONE of the');
console.log('     above prices it. THE RULE IS NARROWER THAN "LEAN VOLATILE": taking');
console.log('     the more volatile receiver costs 21 pts a pick on average, because');
console.log('     cv = sd/mean falls as mean rises, so "most volatile" is partly just');
console.log('     "lowest projected". Lean volatile ONLY where it is nearly free —');
console.log('     measured, that is pick 93 (-3 pts) and 133 (-6), NOT 68 (-37) or');
console.log('     148 (-40). A coin flip is worth it; forty points is not.');
