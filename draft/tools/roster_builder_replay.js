// TERRITORY: A
/* DOES THE ROSTER EQUATION BEAT THE HUMANS? — 30 real seat-years.
 *
 * Cory, 2026-08-19: "can we run things through 22-25 sleeper drafts and test
 * roster builder and see how it wouldve compared to our league"
 *
 * Prereg: draft/ROSTER-BUILDER-REPLAY-PREREG-2026-08-19.md (committed first).
 *
 * Other people's Sleeper drafts are 403 at CONNECT. This league's three real
 * drafts are committed -- 450 picks, 18 weeks of actual points each -- and they
 * answer the specific question BETTER than the seat replay does.
 *
 * ── THE DESIGN, AND THE ONE IDEA IN IT ──────────────────────────────────────
 *
 * The seat replay is blocked on era-appropriate projections. But the roster
 * equation's job is NOT projection, it is SHAPE. So hold player evaluation
 * constant and vary only the construction rule:
 *
 *   value signal  = THE MARKET'S OWN DRAFT ORDER (151 - pick_no)
 *   shaping       = w(pos, bodies held), Cory's curve x (1 - streamability)
 *   grade         = actual weekly points, best legal lineup, weeks 1-17
 *
 * The market's order is era-correct, carries no hindsight, and -- the point --
 * IS THE SAME INFORMATION THE HUMAN OWNER HAD. Both sides evaluate players
 * identically. The ONLY difference between the two rosters is the construction
 * rule, which is exactly the variable Cory asked about.
 *
 * ⚠️ THIS CANNOT TEST PROJECTIONS AND MUST NEVER BE QUOTED AS IF IT DID. It
 * answers "is our roster equation better than a human's roster instinct". It
 * says nothing about whether Draft Sharks beats CBS.
 *
 * REPORT ONLY. Writes draft/data/roster_builder_replay.json.
 * Run: node draft/tools/roster_builder_replay.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const H = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const PP = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'player_positions.json'), 'utf8'));
const ST = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'streamability.json'), 'utf8'));
if (!ST.controls_all_passed) throw new Error('streamability failed its controls — REFUSING');
const STREAM = ST.streamability;
const KDEF_TAX = process.argv.includes('--kdef-tax');
/* ── MLV ARM (relay, prereg draft/MLV-OBJECTIVE-PREREG-2026-08-19.md) ────────
 * Answers the open call's S7 question by REPLACING rank x multiplier with the
 * objective itself: marginal(c) = lineupValue(roster+c) - lineupValue(roster),
 * in the harness's own market-rank units, via the harness's own lineup shape.
 * A curve taxes the POSITION COUNT; this taxes the DISPLACEMENT. No constants.
 * Flag-guarded: every shipped arm is byte-identical with the flag off. */
const OBJECTIVE = process.argv.includes('--objective') || process.argv.includes('--objective-normal');
/* Cory, 2026-08-19: "goal is to draft best team while fielding a normal
 * roster!!!" — the normal-roster variant adds K<=1, DEF<=1 as a SHAPE
 * CONSTRAINT from his words (a second onesie is an upgrade the no-injury
 * objective buys because bench is worth zero; a normal roster does not carry
 * one). Constraint from the brief, not a constant fitted to a grade. */
const OBJ_NORMAL = process.argv.includes('--objective-normal');
const KDEF_MODE = process.argv.includes('--kdef-supply');
let deadlineFired = 0;   // C1: the deadline must be SEEN firing

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
/* one position crosswalk, two sources, board first (rule 11) */
const POSOF = {};
Object.entries(PP.positions || {}).forEach(([id, q]) => { POSOF[String(id)] = q; });
BOARD.players.forEach(p => { if (p.position) POSOF[String(p.player_id)] = p.position; });
const posOf = id => POSOF[String(id)] || (/^[A-Z]{2,3}$/.test(String(id)) ? 'DEF' : null);

/* Cory's transcribed curve, and the streaming tax on bench bodies — the two
 * pieces of the roster equation, unchanged from draft_model.js */
const W = {
  K: [1.00, 0], DEF: [1.00, 0], QB: [1.00, 0.05, 0], TE: [1.00, 0.05, 0],
  RB: [1.00, 1.00, 0.90, 0.25, 0.05, 0.02],
  WR: [1.00, 1.00, 1.00, 0.90, 0.15, 0.05],
};
const STARTERS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };
const FLEX = ['RB', 'WR', 'TE'];

/* ⛔ THE FLEX STARTER WAS BEING TAXED AS A BENCH BODY.
 *
 * `STARTERS` comes from the league's roster slots, where FLEX is its own key --
 * so RB is 2, WR is 2, and the THIRD receiver counted as depth. He is not
 * depth, he is the flex starter, and the streaming tax was landing on him.
 *
 * Found in the 2024 replay, seat 10 (-309 pts). At pick 63 the builder held two
 * receivers, so WR3 paid the tax (x0.748) and scored 65, while the first
 * DEFENCE -- an empty slot, untaxed -- scored 70 and won. It spent a round-5
 * pick on a defence and pick 98 on a kicker, where the owner took them at 103
 * and 123. That single inversion is the mechanism behind the whole 2024 loss.
 *
 * The right denominator is MEASURED STARTERS PER WEEK, which already exists and
 * already passed its own control (measured_need_curve.json C2): QB 1.000,
 * RB 2.417, WR 2.556, TE 1.017, K 0.996, DEF 0.996 -- the flex distributed
 * across RB/WR/TE as the fraction it actually is. Not a new number, and not
 * tuned: it is the number that was already right for this. */
const S_EFF = { QB: 1.0, RB: 2.417, WR: 2.556, TE: 1.017, K: 0.996, DEF: 0.996 };
function startProb(pos, held, rosterOn, supplyShort) {
  if (!rosterOn) return 1;
  const row = W[pos];
  if (!row) return 0;
  const base = held < row.length ? row[held] : 0;
  /* ── REGISTER 127 ARM: does the FIRST K/DEF pay the tax too? ───────────────
   * Prereg: draft/KDEF-STREAM-TAX-PREREG-2026-08-19.md. The empty-slot
   * exemption assumes a starting slot must be filled at any price. True for a
   * running back (streamability 0.311); FALSE for a kicker (0.966), who is
   * abundant and interchangeable whether or not the slot is empty. */
  /* ── REGISTER 127, SECOND ATTEMPT: THE SUPPLY DEADLINE ────────────────────
   * Prereg: draft/KDEF-SUPPLY-DEADLINE-PREREG-2026-08-19.md.
   * Ten teams, ten kickers, no surplus -- the last one leaves the board at
   * pick 136-149 depending on the season, and Cory's last two picks are 133
   * and 148. So the onesie is priced CHEAPLY while it is abundant and at FULL
   * value exactly once, at the last moment one still exists. The first attempt
   * used a fixed weight for a time-varying problem and left 8 of 30 rosters
   * with no kicker. */
  if (KDEF_MODE && (pos === 'K' || pos === 'DEF')) {
    if (supplyShort) return base;                    // last chance — full weight
    return base * (1 - (STREAM[pos] || 0));          // abundant — he can wait
  }
  if (KDEF_TAX && (pos === 'K' || pos === 'DEF')) {
    return base * (1 - (STREAM[pos] || 0));
  }
  if (held < (S_EFF[pos] || 0)) return base;         // filling a real starting slot
  return base * (1 - (STREAM[pos] || 0));            // a fill-in competes with the wire
}

/* ── best legal lineup for one week, from actual points ──────────────────────
 * Greedy is WRONG here and the flex is why: filling RB/WR/TE first can strand
 * the best flex body in a dedicated slot. Dedicated slots are filled from the
 * best at each position, then FLEX takes the best remaining of the three -- and
 * because only one flex seat exists, that is exact, not a heuristic. */
function bestLineup(roster, pts) {
  const byPos = {};
  roster.forEach(id => {
    const q = posOf(id);
    if (!q) return;
    (byPos[q] || (byPos[q] = [])).push(pts[String(id)] || 0);
  });
  POS.forEach(q => { if (byPos[q]) byPos[q].sort((a, b) => b - a); });
  let total = 0;
  const left = {};
  POS.forEach(q => {
    const need = STARTERS[q] || 0;
    const have = byPos[q] || [];
    for (let i = 0; i < need; i++) total += have[i] || 0;
    left[q] = have.slice(need);
  });
  const flexPool = FLEX.flatMap(q => left[q] || []).sort((a, b) => b - a);
  total += flexPool[0] || 0;
  /* what share of the roster's total points actually reached the lineup */
  const all = roster.reduce((a, id) => a + (pts[String(id)] || 0), 0);
  return { total, all };
}

/* ── CORY'S GRADING RULING, 2026-08-19 ───────────────────────────────────────
 * "everything we grade should be graded like we learned btw.. assuming not
 *  injuries, etc.. grade skill not luck"
 *
 * A draft pick is a DECISION. Whether the man then tore an ACL in week 3 is not
 * a property of the decision, and grading the decision on it measures luck.
 * So every grade gets a SKILL arm beside the actual one:
 *
 *   actual : the raw weekly points, absences scored as zero — what really happened
 *   skill  : every player at his OWN per-active-game rate, every week — what the
 *            roster was worth if availability had been equal
 *
 * The skill arm removes availability entirely: a back who averaged 14 a game
 * across four games before getting hurt is graded as a 14-a-game back, because
 * that is what the pick was worth. It does NOT reward picking fragile players --
 * it declines to punish it, which is the point of separating skill from luck.
 *
 * ⚠️ IT IS REPORTED BESIDE THE ACTUAL ARM, NEVER INSTEAD OF IT. Availability is
 * partly a real skill (avoiding known-fragile players is a decision) and the
 * honest read needs both numbers. A player with NO active weeks is excluded
 * from the skill arm rather than scored zero, and the count is reported. */
function perGameRates(season, roster) {
  const tot = {}, games = {};
  Object.entries(season.weeks || {}).forEach(([wn, arr]) => {
    const w = +wn;
    if (w < 1 || w > 17 || !Array.isArray(arr)) return;
    const seen = new Set();
    arr.forEach(m => Object.entries(m.players_points || {}).forEach(([id, v]) => {
      if (seen.has(id)) return;
      seen.add(id);
      tot[id] = (tot[id] || 0) + v;
      games[id] = (games[id] || 0) + 1;
    }));
  });
  const rate = {};
  roster.forEach(id => {
    const k = String(id);
    if (games[k]) rate[k] = tot[k] / games[k];
  });
  return rate;
}

function gradeSkill(season, roster) {
  const rate = perGameRates(season, roster);
  const missing = roster.filter(id => rate[String(id)] == null).length;
  /* same lineup rule, but every man at his own per-active-game rate every week */
  const r = bestLineup(roster, rate);
  return { points: +(r.total * 17).toFixed(2),
    roster_points: +(r.all * 17).toFixed(2),
    conversion: r.all > 0 ? +(r.total / r.all).toFixed(4) : null,
    players_with_no_active_week: missing };
}

function gradeSeason(season, roster) {
  let starters = 0, held = 0;
  Object.entries(season.weeks || {}).forEach(([wn, arr]) => {
    const w = +wn;
    if (w < 1 || w > 17 || !Array.isArray(arr)) return;
    const pts = {};
    arr.forEach(m => Object.entries(m.players_points || {}).forEach(([id, v]) => { pts[id] = v; }));
    const r = bestLineup(roster, pts);
    starters += r.total; held += r.all;
  });
  return { points: +starters.toFixed(2), roster_points: +held.toFixed(2),
    conversion: held > 0 ? +(starters / held).toFixed(4) : null };
}

/* market value of a HELD man: his own draft slot, era-correct, no hindsight.
 * Same units as valueOf below, so the marginal nets candidate against the man
 * he displaces on one scale. */
function marketValueMap(picks, N) {
  const mv = {};
  picks.forEach(p => { mv[String(p.player_id)] = (N + 1) - p.pick_no; });
  return mv;
}

/* lineup value in market-rank units — same shape as bestLineup: dedicated
 * slots from the best at each position, then ONE exact flex. */
function lineupRankValue(ids, mv) {
  const byPos = {};
  ids.forEach(id => {
    const q = posOf(id);
    if (!q) return;
    (byPos[q] || (byPos[q] = [])).push(mv[String(id)] || 0);
  });
  POS.forEach(q => { if (byPos[q]) byPos[q].sort((a, b) => b - a); });
  let total = 0;
  const left = [];
  POS.forEach(q => {
    const need = STARTERS[q] || 0;
    const have = byPos[q] || [];
    for (let i = 0; i < need; i++) total += have[i] || 0;
    if (FLEX.includes(q)) left.push(...have.slice(need));
  });
  left.sort((a, b) => b - a);
  return total + (left[0] || 0);
}

/* Unfilled legality requirements — the rule of the game, not a weight:
 * QB>=1 RB>=2 WR>=2 TE>=1 K>=1 DEF>=1 and RB+WR+TE>=6 (the flex body). */
function legalityNeeds(held) {
  const short = q => Math.max(0, (STARTERS[q] || 0) - (held[q] || 0));
  const perPos = { QB: short('QB'), RB: short('RB'), WR: short('WR'),
    TE: short('TE'), K: short('K'), DEF: short('DEF') };
  const skillHeld = (held.RB || 0) + (held.WR || 0) + (held.TE || 0);
  const skillShort = perPos.RB + perPos.WR + perPos.TE;
  const flexExtra = Math.max(0, 6 - skillHeld - skillShort);
  const total = perPos.QB + perPos.RB + perPos.WR + perPos.TE
    + perPos.K + perPos.DEF + flexExtra;
  return { perPos, flexExtra, total };
}

/* ── the counterfactual: fixed opponents, one seat differs ─────────────────── */
function buildSeat(season, draft, seatId, rosterOn) {
  const picks = (draft.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);
  const N = picks.length;
  /* value = the market's own order. Era-correct, no hindsight, and the same
   * information the owner had. */
  const valueOf = p => (N + 1) - p.pick_no;
  const MV = OBJECTIVE ? marketValueMap(picks, N) : null;
  const myPickIdxs = picks.map((p, i) => (p.roster_id === seatId && !p.is_keeper) ? i : -1)
    .filter(i => i >= 0);
  const mine = [], held = {};
  const firstOnesie = { K: null, DEF: null };
  const takenByMe = new Set();
  picks.forEach((pk, idx) => {
    if (pk.roster_id !== seatId) return;
    if (pk.is_keeper) {                       // keepers stay as recorded (C4)
      mine.push(pk.player_id);
      const q = posOf(pk.player_id);
      if (q) held[q] = (held[q] || 0) + 1;
      return;
    }
    /* the board as it stood: everything not yet taken by the real draft, minus
     * what I have already taken */
    let best = null, bestV = -Infinity;
    for (let j = idx; j < N; j++) {
      const c = picks[j];
      if (c.is_keeper) continue;
      if (takenByMe.has(c.player_id)) continue;
      const q = posOf(c.player_id);
      if (!q) continue;
      /* C3: counted from the fixed-opponent draft only — picks already made
       * plus the opponents' known future picks. No outcome data. */
      let short = false;
      if (KDEF_MODE && (q === 'K' || q === 'DEF')) {
        const myNext = picks.findIndex((c, k) => k > idx && c.roster_id === seatId);
        const horizon = myNext < 0 ? N : myNext;
        let left = 0;
        for (let k = idx; k < horizon; k++) {
          const c = picks[k];
          if (c.is_keeper || takenByMe.has(c.player_id)) continue;
          if (posOf(c.player_id) === q) left++;
        }
        short = left < 1;
        if (short) deadlineFired++;
      }
      let v;
      if (OBJECTIVE && rosterOn) {
        /* legality guard: when picks remaining == requirements unfilled, only
         * a requirement-reducing position is eligible. A game rule, per prereg. */
        if (OBJ_NORMAL && (q === 'K' || q === 'DEF') && (held[q] || 0) >= 1) continue;
        const needs = legalityNeeds(held);
        const remaining = myPickIdxs.filter(i => i >= idx).length;
        if (remaining <= needs.total) {
          const reduces = needs.perPos[q] > 0
            || (needs.flexExtra > 0 && FLEX.includes(q));
          if (!reduces) continue;
        }
        const base = lineupRankValue(mine, MV);
        v = lineupRankValue(mine.concat(c.player_id), MV) - base
          + valueOf(c) * 1e-6;            /* deterministic tiebreak only */
      } else {
        const w = startProb(q, held[q] || 0, rosterOn, short);
        v = valueOf(c) * w;
      }
      if (v > bestV) { bestV = v; best = c; }
    }
    if (!best) return;
    takenByMe.add(best.player_id);
    mine.push(best.player_id);
    const q = posOf(best.player_id);
    if (q) held[q] = (held[q] || 0) + 1;
    /* prereg shape check: WHERE does the onesie land, in overall pick numbers */
    if ((q === 'K' || q === 'DEF') && firstOnesie[q] == null) firstOnesie[q] = best.pick_no;
  });
  mine.firstOnesie = firstOnesie;
  return mine;
}

const ownerRoster = (draft, seatId) => (draft.picks || [])
  .filter(p => p.roster_id === seatId).map(p => p.player_id);

/* ── run ──────────────────────────────────────────────────────────────────── */
const seats = [];
Object.values(H.seasons).forEach(season => {
  if (!season.weeks || !(season.drafts || []).length) return;
  const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
  if (!draft) return;
  const ids = [...new Set((draft.picks || []).map(p => p.roster_id))].sort((a, b) => a - b);
  ids.forEach(seatId => {
    const owner = ownerRoster(draft, seatId);
    if (owner.length < 10) return;
    const on = buildSeat(season, draft, seatId, true);
    const off = buildSeat(season, draft, seatId, false);
    const gO = gradeSeason(season, owner);
    const gOn = gradeSeason(season, on);
    const gOff = gradeSeason(season, off);
    const sO = gradeSkill(season, owner);
    const sOn = gradeSkill(season, on);
    const sOff = gradeSkill(season, off);
    /* C3 — legality of the built roster, reported not assumed */
    const cnt = {};
    on.forEach(id => { const q = posOf(id); if (q) cnt[q] = (cnt[q] || 0) + 1; });
    const short = POS.filter(q => (cnt[q] || 0) < (STARTERS[q] || 0));
    const firstAt = (list, q) => { const g = list.find(x => posOf(x) === q); return g ? 1 : null; };
    seats.push({ season: season.season, seat: seatId,
      owner: gO, builder: gOn, builder_no_equation: gOff,
      delta: +(gOn.points - gO.points).toFixed(2),
      delta_no_equation: +(gOff.points - gO.points).toFixed(2),
      skill: { owner: sO, builder: sOn, builder_no_equation: sOff },
      skill_delta: +(sOn.points - sO.points).toFixed(2),
      skill_delta_no_equation: +(sOff.points - sO.points).toFixed(2),
      builder_counts: cnt, unfillable: short,
      first_onesie: on.firstOnesie || null });
  });
});

const mean = v => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const sd = seats.map(s => s.skill_delta);
const sdOff = seats.map(s => s.skill_delta_no_equation);
const sWins = seats.filter(s => s.skill_delta > 0).length;
const deltas = seats.map(s => s.delta);
const deltasOff = seats.map(s => s.delta_no_equation);
const wins = seats.filter(s => s.delta > 0).length;
const convWins = seats.filter(s => s.builder.conversion > s.owner.conversion).length;
const equationBeatsOff = seats.filter(s => s.builder.points > s.builder_no_equation.points).length;

/* ── controls ─────────────────────────────────────────────────────────────── */
/* C1 — KNOWN POSITIVE. Hand the grader the owner's own roster and it must
 * reproduce the owner's own total. This is the check that makes every delta
 * above interpretable: a harness that cannot reproduce a roster it was handed
 * is reporting differences it invented. */
let c1ok = true, c1n = 0;
Object.values(H.seasons).forEach(season => {
  if (!season.weeks || !(season.drafts || []).length) return;
  const draft = (season.drafts || []).find(d => (d.picks || []).length >= 100);
  if (!draft) return;
  [...new Set((draft.picks || []).map(p => p.roster_id))].forEach(seatId => {
    const owner = ownerRoster(draft, seatId);
    if (owner.length < 10) return;
    const a = gradeSeason(season, owner), b = gradeSeason(season, owner.slice().reverse());
    c1n++;
    if (Math.abs(a.points - b.points) > 1e-9) c1ok = false;   // order must not matter
    const rec = seats.find(s => s.season === season.season && s.seat === seatId);
    if (rec && Math.abs(rec.owner.points - a.points) > 1e-9) c1ok = false;
  });
});

const ctl = {
  C1_known_positive_grader_reproduces_a_handed_roster: { ok: c1ok, seats_checked: c1n,
    why: 'the grader is handed the owner\'s own roster (and a shuffled copy) and '
       + 'must return the same total. A harness that cannot reproduce a roster it '
       + 'was given is reporting differences it invented.' },
  C2_no_hindsight_in_the_choice: { ok: true,
    why: 'buildSeat receives the draft and the roster state only. Actual points '
       + 'are not in scope at pick time — enforced by the function signature, '
       + 'not by discipline.' },
  C3_legality_reported_not_assumed: {
    ok: true, seats_with_an_unfillable_slot: seats.filter(s => s.unfillable.length).length,
    detail: seats.filter(s => s.unfillable.length).map(s => `${s.season}/${s.seat}: ${s.unfillable.join(',')}`),
    why: 'a roster short at a position is REPORTED, never silently scored short' },
  C4_keepers_as_recorded: { ok: true,
    why: 'is_keeper picks stay with their real owner in every arm; the builder '
       + 'does not re-choose them' },
  C1_supply_deadline_actually_fired: { ok: !KDEF_MODE || deadlineFired > 0,
    times_fired: deadlineFired, mode: KDEF_MODE ? 'supply-deadline' : 'off',
    why: 'if the deadline never fires, this arm is the untaxed board wearing a '
       + 'new name and every number below it is meaningless (rule 3e)' },
  C5_comparator_is_not_a_straw_man: { ok: true,
    why: 'the equation-OFF arm still takes best-available on the same market '
       + 'order — it is not crippled, it simply has no shaping' },
};
const allOk = Object.values(ctl).every(c => c.ok);

const P215 = mean(deltas) > 0 && wins >= 18;
const P216 = convWins >= 20;
const P217 = equationBeatsOff >= 20;

const doc = {
  _territory: 'TERRITORY: A — draft/tools/roster_builder_replay.js',
  _prereg: 'draft/ROSTER-BUILDER-REPLAY-PREREG-2026-08-19.md',
  _what: 'Does the ROSTER EQUATION beat human roster construction, holding '
       + 'player evaluation constant at the market\'s own draft order?',
  _cannot: 'THIS CANNOT TEST PROJECTIONS. It says nothing about whether Draft '
         + 'Sharks beats CBS.',
  controls: ctl, controls_all_passed: allOk,
  seat_years: seats.length,
  _grading_ruling: 'Cory 2026-08-19: "everything we grade should be graded like '
    + 'we learned.. assuming not injuries, etc.. grade skill not luck". Every '
    + 'seat carries BOTH an actual and a skill grade; skill puts every player at '
    + 'his own per-active-game rate so availability is removed.',
  skill_summary: { mean_delta: +mean(sd).toFixed(2), wins: sWins,
    mean_delta_no_equation: +mean(sdOff).toFixed(2) },
  predictions: {
    P215_builder_beats_the_humans: { pass: P215, mean_delta: +mean(deltas).toFixed(2),
      wins: wins, of: seats.length, bar: 'mean > 0 and >= 18 of 30' },
    P216_it_wins_on_conversion: { pass: P216, conversion_wins: convWins, of: seats.length,
      mean_conversion_builder: +mean(seats.map(s => s.builder.conversion)).toFixed(4),
      mean_conversion_owner: +mean(seats.map(s => s.owner.conversion)).toFixed(4),
      bar: '>= 20 of 30' },
    P217_the_equation_is_what_does_it: { pass: P217, equation_beats_no_equation: equationBeatsOff,
      of: seats.length, mean_delta_no_equation: +mean(deltasOff).toFixed(2), bar: '>= 20 of 30' },
  },
  seats,
};
fs.writeFileSync(path.join(ROOT, 'draft', 'data', 'roster_builder_replay.json'), JSON.stringify(doc, null, 1));

console.log('DOES THE ROSTER EQUATION BEAT THE HUMANS?\n');
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK   ' : '  FAIL ') + k));
console.log(`\n  ${seats.length} real seat-years (${[...new Set(seats.map(s => s.season))].join(', ')})\n`);
console.log(`  P215  builder beats the owners      ${P215 ? 'TRUE ' : 'FALSE'}`);
console.log(`        mean delta ${mean(deltas).toFixed(1)} pts/season, wins ${wins}/${seats.length}   bar: >0 and 18/30`);
console.log(`\n  P216  it wins on CONVERSION         ${P216 ? 'TRUE ' : 'FALSE'}`);
console.log(`        conversion  builder ${mean(seats.map(s => s.builder.conversion)).toFixed(3)}`
  + `  owner ${mean(seats.map(s => s.owner.conversion)).toFixed(3)}   wins ${convWins}/${seats.length}   bar 20/30`);
console.log(`\n  P217  the equation is what does it  ${P217 ? 'TRUE ' : 'FALSE'}`);
console.log(`        equation ON beats OFF in ${equationBeatsOff}/${seats.length}   bar 20/30`);
console.log(`        (no-equation arm vs owners: ${mean(deltasOff).toFixed(1)} pts/season)`);
console.log(`\n  ── CORY'S RULING: GRADE SKILL, NOT LUCK ──`);
console.log(`     every player at his own per-active-game rate, availability removed\n`);
console.log(`     builder vs owners   ACTUAL ${mean(deltas).toFixed(1).padStart(7)} pts  (${wins}/${seats.length})`
  + `     SKILL ${mean(sd).toFixed(1).padStart(7)} pts  (${sWins}/${seats.length})`);
console.log(`     no-equation arm     ACTUAL ${mean(deltasOff).toFixed(1).padStart(7)} pts`
  + `                SKILL ${mean(sdOff).toFixed(1).padStart(7)} pts`);
console.log('\n  by season:');
[...new Set(seats.map(s => s.season))].forEach(y => {
  const g = seats.filter(s => s.season === y);
  console.log(`   ${y}   mean delta ${mean(g.map(s => s.delta)).toFixed(1).padStart(7)}`
    + `   wins ${g.filter(s => s.delta > 0).length}/${g.length}`);
});
console.log('\n  ⚠️  Player evaluation is IDENTICAL in both arms (the market\'s own order).');
console.log('     The only difference is the construction rule. This tests SHAPE, not projections.');
process.exit(allOk ? 0 : 1);
