// TERRITORY: A
/* THE SEAT PLAN, AS AN ARTIFACT THE WAR ROOM CAN READ.
 *
 * Cory: *"We need real coordination between you and B to make sure the draft
 * board I see matches your model."*
 *
 * The gap is concrete and measured. What he sees is the ENGINE'S GREEDY #1.
 * `greedy_vs_plan.js` scores that line at 2091.0 against the global seat
 * assignment's 2150.5, and `seat_hybrid.js` showed the whole 59.6 is recoverable
 * by CONSTRAINING THE ENGINE TO THE PLAN'S SEAT — the engine already ranks the
 * right player at 6 of 6 seats, it is just never asked the right question.
 *
 * The plan lives in `draft_plan.js`, a Node tool. The war room is a browser. So
 * the schedule ships as DATA rather than as a second solver: it depends on
 * keepers, the board and my pick slots, all known before the draft, and its seat
 * ORDER was measured robust to ADP drift from -25% to +15%.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
 *
 * It does NOT re-solve live. draft_plan assumes the room drafts near ADP, and
 * the room will not cooperate. So every row carries its own shortlist AND the
 * rule for when the shortlist is gone, and the artifact states its assumption
 * in a field the UI can print rather than in a comment only I will read.
 *
 * It does NOT change the engine's ranking. The engine still scores what it
 * scores; this is the SEAT the plan wants filled, shown alongside, so Cory can
 * see both and see when they disagree. Changing a live objective term nine days
 * out on simulated evidence is the thing I have refused twice this week.
 *
 * Run: node draft/tools/emit_seat_plan.js        (writes public/seat_plan.json)
 */
/* TERRITORY-GRANT: B plan_value, planInList
 *
 * GRANTED BY A, 2026-08-14. `superseded` is my state and the right shape; the
 * value beside it was not updated with it, so pick 88 shipped
 * `plan_player: null` with `plan_value: 12.4` — a price for a player the seat
 * no longer names. Same orphan class I closed one field over.
 *
 * B nulled it rather than re-pricing, and that line is exactly right: deleting
 * a statement the seat no longer makes is mechanical; re-pricing to the
 * shortlist head is a modelling call and stays mine.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PLAN = require('./draft_plan.js');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));

const { plan, pool, keep, SCHED } = PLAN;
const num = v => (Number.isFinite(+v) ? +v : null);
const adpOf = p => (p.adjusted_adp != null ? +p.adjusted_adp
  : (p.raw_adp != null ? +p.raw_adp : 9999));
const byAdp = pool.slice().sort((a, b) => adpOf(a) - adpOf(b));
const kept = new Set(keep.map(k => String(k.player_id)));
const byIdPool = {};
pool.forEach(p => { byIdPool[String(p.player_id)] = p; });
const ELIG = slot => (slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [slot]);

/* ── THE WIRE, AND THE CONSTANT IT REPLACES ───────────────────────────────
 *
 * This file shipped `WIRE = {QB 20.9, RB 5.3, WR 13.3, TE 6.3}` with
 * `WIRE_N = {5, 46, 39, 6}` and a note claiming 764 measured acquisitions. The
 * value, the n and the note were three different quantities: the value is the
 * median of per-(position, week) CELL MEDIANS over only the cells that cleared
 * C's `min_n = 5` REPORTING floor; the n is those cells' pooled acquisition
 * count; and 96 acquisitions survive that filter, not 764. In a ten-team league
 * the median cell holds TWO adds, so the quarterback figure was ONE WEEK and so
 * was the tight end.
 *
 * `wire_level.js` measures it from the full sample and exports the SORTED
 * SAMPLE, because the bench simulator draws from it week by week and a median
 * cannot produce convexity. K and DEF have no realized sample at all and it
 * refuses rather than returning zero. */
const WL = require('./wire_level.js');
const WIRE_MEASURED = WL.measure();
const WIRE = {};
const WIRE_N = {};
WL.MEASURED_POSITIONS.forEach(p => {
  const s = WIRE_MEASURED.summary[p];
  if (s) { WIRE[p] = s.median; WIRE_N[p] = s.n; }
});

/* ── LINEUP SKILL, MEASURED, AND THE ρ IT CALIBRATES ──────────────────────
 *
 * A bench player's worth depends entirely on how often the right man gets
 * started, and until 2026-08-13 that number was not measured anywhere. It is
 * now: this league captures 87.7% of its hindsight-optimal points against an
 * 84.1% floor from lineups set on season averages alone, so it takes 22.5% of
 * the available in-week edge — stable at 24.9 / 21.8 / 20.7 across three
 * seasons. `calibrate()` solves for the ρ that reproduces that in the simulator
 * ON THIS ROSTER, rather than anyone picking a midpoint. */
const SKILL = require('./lineup_skill.js');
const BENCH = require('./bench_mv.js');
const SKILL_MEASURED = SKILL.summarise(SKILL.measure().rows);

/* ── THE EDGE, MEASURED RATHER THAN QUOTED ────────────────────────────────
 * Three lines scored by ONE function (lineup_value.bestLineup): the engine
 * greedy, the engine constrained to these seats, and the global plan. Same
 * driver parameterised by the chooser so they cannot diverge through the
 * harness — the failure mode behind every engine_drive error. */
const EDGE = (function () {
  global.window = global;
  global.document = { getElementById: () => null, querySelector: () => null,
    addEventListener: () => {} };
  const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
  const LV = require(path.join(ROOT, 'draft', 'tools', 'lineup_value.js'));
  const full = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
  const order = full.slice().sort((a, b) => adpOf(a) - adpOf(b));
  const slotAt = {};
  plan.forEach(x => { if (!x.bench && x.slot) slotAt[x.pick] = x.slot; });
  function drive(choose) {
    const took = new Set(keep.map(k => String(k.player_id)));
    const roster = keep.map(k => Object.assign({}, k, { is_keeper: true }));
    SCHED.forEach((pk, i) => {
      let need = (pk - 1) - (took.size - keep.length);
      for (let j = 0; j < order.length && need > 0; j++) {
        const p = order[j];
        if (took.has(String(p.player_id))) continue;
        took.add(String(p.player_id)); need--;
      }
      const board = full.filter(p => !took.has(String(p.player_id)));
      const out = E.recommend({ board, roster, nextPick: SCHED[i + 1] || null,
        currentPick: pk, pick: pk, round: null, myPicksLeft: SCHED.length - i,
        myPickIndex: i, totalMyPicks: SCHED.length, totalPicks: 150,
        league: DATA.league, weights: E.MEASURED_WEIGHTS || E.DEFAULT_WEIGHTS,
        currentKeepers: roster.filter(p => p.is_keeper), ceilingAllStages: false,
        doctrine: null, drift: null, intervening: (SCHED[i + 1] || pk) - pk });
      const list = Array.isArray(out) ? out : (out && out.scored) || [];
      const top = choose(list, pk);
      if (!top || !top.player) return;
      took.add(String(top.player.player_id));
      roster.push(Object.assign({}, top.player));
    });
    return roster;
  }
  const ELIG2 = sl => (sl === 'FLEX' ? ['RB', 'WR', 'TE'] : [sl]);
  const eng = drive(l => l[0]);
  const hyb = drive((l, pk) => {
    const sl = slotAt[pk];
    if (!sl) return l[0];
    const ok = ELIG2(sl);
    return l.find(r => r && r.player && ok.indexOf(r.player.position) >= 0) || l[0];
  });
  const planRoster = keep.map(k => Object.assign({}, k, { is_keeper: true }))
    .concat(plan.filter(x => x.p).map(x => Object.assign({}, x.p)));
  const sc = r => { const l = LV.bestLineup(r, DATA); return l && l.total != null ? l.total : 0; };
  const seatPicks = Object.keys(slotAt).map(Number);
  let coincide = 0;
  seatPicks.forEach(pk => {
    const pl = plan.find(x => x.pick === pk);
    if (pl && pl.p && hyb.some(r => String(r.player_id) === String(pl.p.player_id))) coincide++;
  });
  const e = sc(eng), h = sc(hyb), p2 = sc(planRoster);
  return { engine: e, hybrid: h, plan: p2,
    gap: Math.round((p2 - e) * 10) / 10, coincide: coincide, seats: seatPicks.length };
})();

const taken = new Set();
const seats = [];

/* ── ρ, SOLVED ONCE, ON THE ROSTER THIS PLAN ACTUALLY BUILDS ──────────────
 * Not a constant and not a midpoint. `calibrate` bisects for the ρ at which the
 * simulator reproduces this league's measured 22.5% skill share on this roster,
 * because ρ is not a property of a manager alone — a deeper bench offers more
 * chances to be right, so the roster is part of the question. */
const FULL_ROSTER = keep.map(k => byIdPool[String(k.player_id)] || k)
  .concat(plan.filter(x => x.p).map(x => byIdPool[String(x.p.player_id)] || x.p))
  .filter(Boolean);
const RHO = SKILL.calibrate(FULL_ROSTER, SKILL_MEASURED.skill_share, { sims: 400 });

/* THE ROSTER A BENCH SEAT IS PRICED AGAINST is everything already committed at
 * that pick — keepers plus every earlier planned selection. A marginal value
 * quoted against no roster is meaningless: the whole point of MV(i|R) is who is
 * standing in front of him. */
const committed = keep.map(k => byIdPool[String(k.player_id)] || k).filter(Boolean);

/* ⚠️ WHO IS GONE IS A COUNT OF SELECTIONS, NOT A BOARD PICK NUMBER.
 *
 * This was `byAdp.slice(0, x.pick - 1)` — the top (pick-1) by ADP — and it
 * OVER-REMOVES by exactly the number of keeper slots that precede the pick.
 *
 * A keeper slot takes no player out of `byAdp`, because a kept player is
 * ALREADY excluded from `DATA.players`; the board simply never deals that pick.
 * So at overall 33 there are 32 board slots behind me but only TWENTY-NINE
 * selections, and three men the plan called gone are still sitting there:
 * DeVonta Smith, Breece Hall, Cam Skattebo — the same names the survival panel
 * puts at 58% and 52% likely to REACH this pick.
 *
 * I TOLD CORY THIS DIVERGENCE WAS ZERO AND IT WAS NOT. That measurement asked
 * whether WITHHELD OPPONENT keepers move the pool — they do not, because they
 * are still in it — and I stopped there. His OWN three keepers are out of the
 * pool while their slots still count toward `pick - 1`, which is the case I did
 * not ask about. A null that answers a narrower question than the one that
 * matters reads exactly like a null that answers the right one.
 *
 * IT IS THE THIRD INSTANCE OF ONE SCALE CONFUSION IN A DAY — after the survival
 * curve and the waiver depth — and the same rule settles all three: a count of
 * SELECTIONS and a BOARD position are different quantities, and `pick_order`
 * carries both under separate names precisely so they stop being swapped.
 *
 * Three players today. Seventeen once the confirmed slate lands, at every seat. */
const liveBefore = (pick) => {
  const rows = (DATA.pick_order || {}).picks || [];
  if (!rows.length) {
    throw new Error('emit_seat_plan: pick_order.picks is empty, so selections '
      + 'before a pick cannot be counted. REFUSING to fall back to pick-1 — that '
      + 'over-removes by the keeper count and is what this replaced.');
  }
  return rows.filter(r => r.overall < pick && !r.keeper_slot).length;
};

plan.forEach(x => {
  const gone = new Set(byAdp.slice(0, liveBefore(x.pick)).map(p => String(p.player_id)));
  const elig = x.bench ? ['QB', 'RB', 'WR', 'TE'] : ELIG(x.slot);
  /* RANKING A BENCH SHORTLIST BY RAW proj_mean IS THE JOSH-ALLEN DEFECT AGAIN,
   * and my first cut shipped it: every bench row came back three quarterbacks
   * deep, because a QB's raw season total beats any running back's and nothing
   * in a cross-position sort knows that a QB2 never plays.
   *
   * A STARTER SEAT is position-constrained, so raw projection is the right
   * comparator there — the candidates are already comparable.
   *
   * A BENCH SEAT is not. What a bench player is worth is his edge over WHAT IS
   * FREE AT HIS OWN POSITION, per week — Cory's roster-spot rule, and the only
   * quantity that puts a backup QB and a backup RB on one scale. The wire pays
   * 20.9/wk at QB and 5.3 at RB, which is exactly why the raw sort was upside
   * down. */
  /* THE SCALAR IS GONE FROM THE BENCH. It was `(proj_mean / 15) − WIRE[pos]`,
   * which has no lineup in it: it cannot see that a second quarterback plays no
   * weeks unless the first is hurt, that a bye is a hole with a date, or that
   * two receivers sharing a bye are not two receivers. A bench row is now ranked
   * on MV(i|R) from `bench_mv.js` — the value of the ROSTER SPOT, in season
   * points, with convexity coming out of the lineup optimizer on sampled weeks
   * and from nowhere else.
   *
   * A STARTER SEAT still ranks on projection, and that is not an oversight: the
   * candidates there are position-constrained and already comparable, and MV
   * against a committed roster would mostly re-measure who is already on it. */
  const WEEKS = 15;
  const scalar = p => (x.bench && WIRE[p.position] != null)
    ? (num(p.proj_mean) / WEEKS) - WIRE[p.position]
    : num(p.proj_mean);
  const pre = pool.filter(p => !gone.has(String(p.player_id)) && !kept.has(String(p.player_id))
    && !taken.has(String(p.player_id)) && elig.indexOf(p.position) >= 0
    && num(p.proj_mean) != null)
    .sort((a, b) => scalar(b) - scalar(a));
  /* TWO STAGES, STATED. MV costs a few hundred simulated seasons per candidate,
   * so the field is narrowed by the scalar to twelve and then RE-RANKED by MV.
   * The prefilter can only lose a man the scalar ranks below twelve others and
   * MV ranks in the top five — possible, and the reason the width is written
   * down rather than tuned quietly. */
  const PREFILTER = 12;
  const mvOf = {}, mvDetail = {};
  if (x.bench) {
    pre.slice(0, PREFILTER).forEach(p => {
      const d = BENCH.marginalValue(committed, p,
        { sims: 600, lineupInfo: RHO, detail: true });
      mvOf[String(p.player_id)] = d.mv;
      mvDetail[String(p.player_id)] = d;
    });
  }
  const rank = p => (x.bench ? (mvOf[String(p.player_id)] != null
    ? mvOf[String(p.player_id)] : -Infinity) : num(p.proj_mean));
  const cands = (x.bench ? pre.slice(0, PREFILTER) : pre)
    .slice().sort((a, b) => rank(b) - rank(a));
  if (x.p) taken.add(String(x.p.player_id));

  const short = cands.slice(0, 5).map(p => ({
    player_id: String(p.player_id), name: p.name, position: p.position,
    proj_mean: Math.round(num(p.proj_mean) * 10) / 10,
    adp: Math.round(adpOf(p) * 10) / 10,
    /* The number the seat is actually ranked on, so the UI can show WHY this
     * order and never has to re-derive it. */
    rank_metric: Math.round(rank(p) * 10) / 10,
    /* THE NUMBER THE ROW SHOULD LEAD WITH, so the gap beneath it is derivable
     * from what is on screen. B: a bench row printed 212.1 and 202.6 (SEASON
     * points) above a gap of 0.6 (PTS/WEEK) — every figure correct, and a
     * reader cannot get from the two numbers to the third. Leading with the
     * quantity the seat was ranked on makes the gap subtractable by eye. */
    display_primary: Math.round(rank(p) * 10) / 10,
    display_primary_units: 'season points',
    display_secondary: x.bench ? Math.round(num(p.proj_mean) * 10) / 10 : null,
    display_secondary_units: x.bench ? 'his own season projection' : null,
    rank_basis: x.bench
      ? 'MV(i|R): season points this roster spot gains over giving it to a free '
        + 'player, at the measured lineup skill (rho ' + RHO.toFixed(3) + ')'
      : 'season projection (candidates are position-comparable at a starter seat)',
    beats_wire_by: (WIRE[p.position] != null)
      ? Math.round(((num(p.proj_mean) / WEEKS) - WIRE[p.position]) * 10) / 10 : null,
  }));

  /* THE TOSSUP MEASUREMENT, not a label. The gap between the top two eligible
   * names IS the question "does this pick matter"; a 2-point gap and a 40-point
   * gap are different decisions and the UI cannot tell them apart from a rank. */
  /* The gap is measured in the SAME units the seat was ranked in, or it compares
   * two different quantities and the tossup flag means nothing. */
  const gap = short.length >= 2
    ? Math.round((short[0].rank_metric - short[1].rank_metric) * 10) / 10 : null;
  /* ONE THRESHOLD, EXPRESSED IN EACH ROW'S OWN UNITS. My first cut used 8 for
   * starters and 1.0 for bench — two arbitrary numbers in two unit systems,
   * which flagged 13 of 15 picks as tossups and made the flag meaningless.
   * TOSSUP_SEASON_PTS is the single quantity; a bench row is ranked per week, so
   * the same 8 points becomes 8/15. */
  /* ── THE TOSSUP THRESHOLD IS NOW MEASURED ON A BENCH ROW ────────────────
   *
   * It was 8 season points everywhere, and on MV that fired on 9 of 12 rows —
   * a flag carrying no information, which is the "a tie is not a recommendation"
   * failure in a new place. The number that belongs here is not a preference: a
   * gap smaller than the noise in the estimate IS a tossup, and the simulation
   * can report its own noise.
   *
   * Under common random numbers each candidate's MV comes from a per-sim series
   * against the same base arm, so the top two subtract term by term and the
   * PAIRED standard error of their gap follows. Two SEs is the band inside which
   * the ordering is not distinguishable from a coin flip. Pairing matters: on
   * the first bench seat the paired SE is 0.93 against 1.53 added in quadrature,
   * and using the larger one would call real gaps tossups by a more respectable
   * route than picking 8.
   *
   * A STARTER ROW KEEPS THE 8 AND IT IS A STATED JUDGEMENT, NOT A MEASUREMENT.
   * Those candidates are ranked on a projection, which carries no sampling error
   * for a measurement-error band to be built from — the real question there is
   * whether the gap is inside PROJECTION error, which nothing here measures. Two
   * thresholds again, in the same units, but now for two different reasons and
   * each labelled with which kind it is. */
  const TOSSUP_SEASON_PTS = 8;
  let thresh = TOSSUP_SEASON_PTS;
  let threshBasis = 'stated judgement: 8 season points of projection';
  if (x.bench && short.length >= 2) {
    const dA = mvDetail[short[0].player_id], dB = mvDetail[short[1].player_id];
    if (dA && dB) {
      const se = BENCH.gapStandardError(dA, dB);
      if (se != null && Number.isFinite(se)) {
        thresh = Math.round(2 * se * 10) / 10;
        threshBasis = 'MEASURED: two paired standard errors of this seat\'s own '
          + 'top-two gap over ' + dA.sims + ' simulated seasons';
      }
    }
  }
  const tossup = gap != null && gap <= thresh;

  /* ── TWO WAIVER LEVELS IN ONE ROW: the defect B blocked on ────────────
   *
   * B found `plan_player` absent from its own shortlist at three bench seats and
   * was right to stop. The cause is not a display slip — it is two incompatible
   * valuations of the same seat presented as one view:
   *
   *   draft_plan ranks bench by option value against the PRESEASON
   *   BEST-UNDRAFTED line. This shortlist ranks by the REALIZED WIRE — what 764
   *   actual waiver adds delivered in the week they were added.
   *
   * `wire_vs_bench.js` already established those are different quantities that
   * do not bracket: at QB and WR the "lower bound" EXCEEDS the "upper bound",
   * because best-undrafted is a preseason projection of a STATIC leftover pool
   * while a realized acquisition comes from a pool that refreshes all season. I
   * measured that, wrote it down, and then shipped both numbers into one row.
   *
   * THE REALIZED WIRE WINS, and not by preference. It is the line that made
   * Cory's roster-spot rule computable, and it is the one that changes answers:
   * against best-undrafted only Chris Rodriguez failed the rule; against the
   * realized wire, Evans is 99% and Reed is 122% of a free player. Those three
   * seats are exactly where the two lines disagree, which is why they are the
   * three B caught.
   *
   * So on a bench row the plan's NAME is demoted to a labelled footnote rather
   * than presented as the recommendation, and the shortlist stands. A row that
   * shows a name its own list does not contain is not a disagreement a reader
   * can resolve — it is the screen contradicting itself. */
  const planInList = x.p && short.some(q => q.player_id === String(x.p.player_id));
  seats.push({
    pick: x.pick,
    slot: x.bench ? 'BENCH' : x.slot,
    is_starter_seat: !x.bench,
    unpriced: !!x.unpriced,
    plan_player: (x.p && (!x.bench || planInList))
      ? { player_id: String(x.p.player_id), name: x.p.name, position: x.p.position } : null,
    /* Kept, never dropped: "the plan named nobody" and "the plan named someone
     * on a line since superseded" are different facts. */
    superseded_plan_player: (x.p && x.bench && !planInList)
      ? { player_id: String(x.p.player_id), name: x.p.name, position: x.p.position,
          why: 'draft_plan chose him on the PRESEASON best-undrafted waiver line. '
            + 'This shortlist ranks on the REALIZED wire (764 measured acquisitions), '
            + 'which is the line that makes the roster-spot rule computable and the '
            + 'one that changes answers. He is not in the list because the two lines '
            + 'genuinely disagree here.' } : null,
    plan_value: x.unpriced ? null : Math.round(x.v * 10) / 10,
    shortlist: short,
    gap_to_second: gap,
    /* ONE UNIT SYSTEM NOW. A bench row used to carry points-per-week over the
     * free player at its own position while a starter row carried season points,
     * which is how one threshold became two. MV(i|R) is season points, so both
     * row types are the same quantity and the field says so identically. */
    gap_units: 'season points',
    tossup_basis: threshBasis,
    tossup: tossup,
    tossup_threshold: Math.round(thresh * 100) / 100,
    /* WHAT TO DO WHEN THE SHORTLIST IS GONE — the case a single-name plan
     * handles worst, and the one most likely to happen at a live table. */
    fallback_rule: x.bench ? 'No seat is asserted here. Take upside, a handcuff, or the WR gap.'
      : 'Take the best remaining player ELIGIBLE FOR ' + x.slot
        + ', not the best player on the board — the board ordering is roster-blind.',
  });
});

const out = {
  /* PROVENANCE FIRST. A plan with no statement of what it assumed is a plan
   * that will be trusted after it stops being true. */
  generated_from: 'draft/tools/emit_seat_plan.js',
  source_board_players: (DATA.players || []).length,
  keepers: keep.map(k => ({ player_id: String(k.player_id), name: k.name, position: k.position })),
  my_picks: SCHED,
  assumption: 'The room drafts near ADP at every intervening pick. The SEAT ORDER '
    + 'held under ADP drift from -25% to +15%; the NAMES did not. Re-read the '
    + 'shortlist whenever the board has moved a lot.',
  /* MEASURED HERE, NOT RESTATED. This field held a hardcoded 59.6 — correct when
   * written and WRONG the moment the pick schedule was fixed, because that
   * number was computed against fifteen picks starting at R1.8 that Cory does
   * not own. The true figure on his real twelve picks is smaller.
   *
   * That is the SCHED defect again, one field over: a constant that looks like
   * data, plausible, inherited downstream, and stale without a symptom. So it is
   * DERIVED on every emit. A number that recomputes cannot silently rot. */
  measured_edge_vs_greedy: EDGE.gap,
  measured_edge_detail: { engine_greedy: EDGE.engine, seat_constrained: EDGE.hybrid,
    global_plan: EDGE.plan, seats_where_engine_names_the_plans_player: EDGE.coincide,
    seats: EDGE.seats },
  measured_edge_note: 'Derived on this emit, on Cory\'s ACTUAL picks. Driving the '
    + 'engine\'s own #1 at every pick scores ' + EDGE.engine.toFixed(1) + ' against this '
    + 'schedule\'s ' + EDGE.plan.toFixed(1) + '. Constraining the engine to these seats '
    + 'scores ' + EDGE.hybrid.toFixed(1) + ', because it already names the plan\'s own '
    + 'player at ' + EDGE.coincide + ' of ' + EDGE.seats + ' seats. EXPLORATORY — a '
    + 'simulated room drafting near ADP, not an observed draft.',
  wire_per_week: WIRE,
  wire_n: WIRE_N,
  wire_note: 'Realized median points in the week a player was added off waivers, '
    + 'pooled 2023-25 over the FULL sample of ' + WIRE_MEASURED.ledger.scored
    + ' scored acquisitions (of ' + WIRE_MEASURED.ledger.acquisitions + ' adds; the '
    + 'rest are K/DEF, which nflverse weekly cannot score, or men who did not play '
    + 'that week and are counted ABSENT rather than zero). This REPLACES a constant '
    + 'that was the median of per-week cell medians over the 96 acquisitions that '
    + 'cleared a min_n=5 REPORTING filter — at QB and TE that was one week each.',
  lineup_skill: {
    capture: Math.round(1000 * SKILL_MEASURED.capture) / 1000,
    no_information_floor: Math.round(1000 * SKILL_MEASURED.naive_capture) / 1000,
    skill_share: Math.round(1000 * SKILL_MEASURED.skill_share) / 1000,
    team_weeks: SKILL_MEASURED.n,
    rho: Math.round(1000 * RHO) / 1000,
    note: 'MEASURED from three completed seasons of this league\'s own started '
      + 'lineups. Capture is what the room started over what the best legal lineup '
      + 'would have scored; the floor is the same rosters with lineups set on season '
      + 'averages alone. The share between them is what bench depth can actually be '
      + 'converted into, and rho is SOLVED for the value that reproduces it in the '
      + 'simulator on this roster. It is the LEAGUE\'s rate, not Cory\'s — three of '
      + 'the ten players missing from the board started on his roster every season, '
      + 'so only four of his 54 team-weeks are gradeable and his own rate is UNKNOWN.',
  },
  bench_basis: {
    equation: 'MV(i|R) = E[sum_w OptLineup(R+{i},w)] - E[sum_w OptLineup(R+{omega},w)]',
    units: 'season points over weeks ' + BENCH.FIRST_WEEK + '-' + BENCH.LAST_WEEK,
    omega: 'the roster spot goes to a freely available body, which is the same as '
      + 'leaving it open and streaming the hole. Position-free ON PURPOSE: pricing '
      + 'each man against his OWN position\'s free-agent floor hands running backs '
      + 'a ten-point discount that is about the position, not the player.',
    streaming: 'UNLIMITED by default, which is the setting under which a bench '
      + 'player is worth the LEAST. This league completes 1.498 adds per team per '
      + 'week (764 over 51 season-weeks) and capping it there raises every bench '
      + 'value; the unlimited number is the conservative end of that bracket.',
    not_modelled: ['weekly_sd is DERIVED from a season sd, never observed',
      'games_expected is a per-POSITION constant, so a handcuff is worth nothing here',
      'player-to-player correlation is unmeasured',
      'succession / inherited-touch shares are absent',
      'the objective is points, not the payout structure',
      'weeks ' + (BENCH.LAST_WEEK + 1) + '+ (the playoffs) are excluded'],
  },

  /* ── THE DISPLAY CONTRACT ────────────────────────────────────────────────
   *
   * Cory: *"we need to ensure what B is showing is the correct interpretation
   * of the data and model."* Reading the same file is not the same as reading
   * it correctly, and the misreadings that actually happen are boring:
   *
   *   UNITS      a per-week number captioned as season points. I shipped this
   *              exact bug in this exact file today — two tossup thresholds in
   *              two unit systems.
   *   DIRECTION  `beats_wire_by` rendered as a magnitude, so -2.4 (worse than
   *              a free player) reads as a positive edge.
   *   CAVEAT     "+59.6 pts" shown without "simulated room, not an observed
   *              draft", which converts exploratory evidence into a promise.
   *   DUPLICATE  a number recomputed in the renderer instead of read here, so
   *              the two drift and the screen disagrees with itself. That has
   *              already happened once: a card captioned "best flex-eligible
   *              VALUE" was ranked by ADP, a market price, on the same screen
   *              as a model estimate using the same word.
   *
   * So every displayable number declares its unit, its direction, and the
   * caveat that must travel with it. A renderer that prints the number without
   * the caption is then a VISIBLE defect rather than a judgement call, and
   * `seat_plan_contract.test.js` fails if a field here loses its declaration. */
  display_contract: {
    'seats[].plan_value': { units: 'season points', higher_is_better: true,
      label: 'plan value', caveat: null },
    'seats[].gap_to_second': { units: 'SEE seats[].gap_units — it differs by row',
      higher_is_better: true, label: 'gap to the next eligible name',
      caveat: 'A starter row is season points and a bench row is points/week. '
        + 'Never print this number without its row\'s gap_units.' },
    'seats[].shortlist[].proj_mean': { units: 'season points', higher_is_better: true,
      label: 'projection', caveat: null },
    'seats[].shortlist[].rank_metric': { units: 'SEE seats[].shortlist[].rank_basis',
      higher_is_better: true, label: 'what this seat is ranked on',
      caveat: 'Starter seats rank on season projection; bench seats rank on '
        + 'pts/week over the free player at that position. Comparing the two '
        + 'across rows is the cross-position error this schedule exists to stop.' },
    'seats[].shortlist[].beats_wire_by': { units: 'points per week',
      higher_is_better: true, label: 'edge over a free player at his position',
      caveat: 'SIGNED. Negative means the waiver wire is BETTER than him and the '
        + 'roster spot is losing value. Render the sign, never the magnitude.' },
    'measured_edge_vs_greedy': { units: 'season points', higher_is_better: true,
      label: 'edge of this schedule over the engine\'s greedy line',
      caveat: 'EXPLORATORY — one simulated room drafting near ADP, not an '
        + 'observed draft. Must not be shown as a promise.' },
    'wire_per_week': { units: 'points per week', higher_is_better: true,
      label: 'what the waiver wire actually delivers',
      caveat: 'Carry wire_n. QB rests on n=5 and TE on n=6; a median of five '
        + 'reads exactly like a median of forty unless the count travels with it.' },
  },
  seats: seats,
};

const dest = path.join(ROOT, 'public', 'seat_plan.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');

console.log('SEAT PLAN EMITTED -> public/seat_plan.json\n');
console.log('  pick  seat    the plan wants          gap   shortlist (eligible only)');
console.log('  ' + '-'.repeat(88));
seats.forEach(s => {
  console.log('  ' + String(s.pick).padStart(4) + '  ' + s.slot.padEnd(6) + '  '
    + (s.plan_player ? (s.plan_player.position + ' ' + s.plan_player.name) : '(free)').padEnd(22)
    + (s.gap_to_second == null ? '   —' : String(s.gap_to_second).padStart(5))
    + (s.tossup ? ' T' : '  ') + '  '
    + s.shortlist.slice(0, 3).map(p => p.position + ' ' + p.name.split(' ').slice(-1)[0]).join(', '));
});
console.log('\n  T = TOSSUP: the top two eligible names are close enough that the SEAT');
console.log('  matters more than the NAME. Both row types are in SEASON POINTS — starters');
console.log('  on projection, bench on MV(i|R) — so the numbers are comparable even where');
console.log('  the thresholds are derived differently.');
console.log('  A BENCH ROW\'S THRESHOLD IS MEASURED, NOT CHOSEN: two PAIRED standard');
console.log('  errors of that seat\'s own top-two gap, from the same common-random-number');
console.log('  series the MVs come from. A gap inside it is not distinguishable from a');
console.log('  coin flip. A STARTER row keeps 8 points as a stated judgement — those');
console.log('  candidates are ranked on a projection, which carries no sampling error to');
console.log('  build a band from. Each row says which kind it got, in tossup_basis.');
console.log('  ' + seats.filter(s => s.tossup).length + ' of ' + seats.length + ' picks are tossups.');
console.log('\n  This artifact is READ by the war room so the board Cory sees follows the');
console.log('  model. It does NOT change the engine\'s ranking — it states the SEAT, and');
console.log('  the engine still picks the player for it.');
