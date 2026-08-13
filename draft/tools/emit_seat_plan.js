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
const ELIG = slot => (slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [slot]);

/* Realized wire, pooled 2023-25 (waiver_replacement.py). Carried so the UI can
 * answer "is this worth a roster spot" without a second source of truth. */
const WIRE = { QB: 20.9, RB: 5.3, WR: 13.3, TE: 6.3 };
const WIRE_N = { QB: 5, RB: 46, WR: 39, TE: 6 };

const taken = new Set();
const seats = [];

plan.forEach(x => {
  const gone = new Set(byAdp.slice(0, x.pick - 1).map(p => String(p.player_id)));
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
  const WEEKS = 15;
  const rank = p => (x.bench && WIRE[p.position] != null)
    ? (num(p.proj_mean) / WEEKS) - WIRE[p.position]
    : num(p.proj_mean);
  const cands = pool.filter(p => !gone.has(String(p.player_id)) && !kept.has(String(p.player_id))
    && !taken.has(String(p.player_id)) && elig.indexOf(p.position) >= 0
    && num(p.proj_mean) != null)
    .sort((a, b) => rank(b) - rank(a));
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
    display_primary: x.bench ? Math.round(rank(p) * 10) / 10 : Math.round(num(p.proj_mean) * 10) / 10,
    display_primary_units: x.bench ? 'pts/week over the free player at his position'
      : 'season points',
    display_secondary: x.bench ? Math.round(num(p.proj_mean) * 10) / 10 : null,
    display_secondary_units: x.bench ? 'season points' : null,
    rank_basis: x.bench ? 'pts/week over the free player at his position'
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
  const TOSSUP_SEASON_PTS = 8;
  const thresh = x.bench ? TOSSUP_SEASON_PTS / WEEKS : TOSSUP_SEASON_PTS;
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
    gap_units: x.bench ? 'pts/week over the free player at his position' : 'season points',
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
  measured_edge_vs_greedy: 59.6,
  measured_edge_note: 'greedy_vs_plan.js: the engine\'s own #1 at every pick scores '
    + '2091.0 against this schedule\'s 2150.5. seat_hybrid.js: constraining the engine '
    + 'to these seats recovers all of it, because the engine already ranks the right '
    + 'player at 6 of 6 seats. This is EXPLORATORY evidence — a simulated room, not an '
    + 'observed draft.',
  wire_per_week: WIRE,
  wire_n: WIRE_N,
  wire_note: 'Realized median points in the week a player was added off waivers, '
    + 'pooled 2023-25 across 764 acquisitions. QB and TE rest on n=5 and n=6.',

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
console.log('\n  T = TOSSUP: the top two eligible names are within 8 SEASON points of each');
console.log('  other, so the SEAT matters more than the NAME. Starter rows are ranked on');
console.log('  season projection and bench rows on points/week over the free player at');
console.log('  that position, so the same 8 points reads as 8 or as 0.53 by row.');
console.log('  ' + seats.filter(s => s.tossup).length + ' of ' + seats.length + ' picks are tossups.');
console.log('\n  This artifact is READ by the war room so the board Cory sees follows the');
console.log('  model. It does NOT change the engine\'s ranking — it states the SEAT, and');
console.log('  the engine still picks the player for it.');
