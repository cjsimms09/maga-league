/* Four-policy replay of our own prior drafts.
 *
 * WHY THIS IS JAVASCRIPT. B3 is the production composite, and the production
 * composite is engine.js. A Python re-implementation would be testing a second
 * system that merely resembles the one shipping on draft day — which is exactly
 * how the round-2 tournament investigation nearly went wrong, and why importing
 * the real simulate() is what kept that diagnosis honest. So Python prepares the
 * era-appropriate bundle under AsOf discipline, and the replay is driven by the
 * same engine.js and survival.js the War Room loads.
 *
 * WHAT IS COMPARED, on identical board and roster state at every pick:
 *   B0  highest contemporaneous ADP available  — the cheat-sheet baseline
 *   B1  highest projected points available
 *   B2  highest VORP available
 *   B3  the full composite
 *
 * B0 IS THE ONE THAT MATTERS. B1 and B2 are diagnostic: if B3 beats B0 but not
 * B2, the edge is in the value model and not in any of the machinery layered on
 * top of it, and that is a materially different claim.
 *
 * GRADING IS NOT DONE HERE. This file records choices. Actual points are joined
 * afterwards from GradingStore, which the replay never holds a reference to.
 */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'engine.js'));
const S = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'survival.js'));

const CFG = {
  // Rounds beyond this are kickers, defences and dart throws; including them
  // dilutes the headline with picks nobody makes a decision about.
  MAX_ROUND_GRADED: 12,
};

function rosterPositionsToStarters(rp) {
  const starters = {};
  (rp || []).forEach(slot => {
    if (slot === 'BN' || slot === 'IR' || slot === 'TAXI') return;
    starters[slot] = (starters[slot] || 0) + 1;
  });
  return starters;
}

/* ---- the four policies. Each sees exactly the same arguments. ------------ */
const POLICIES = {
  B0: function (board) {
    // Lowest ADP number = earliest off the board = the cheat sheet's top name.
    let best = null;
    board.forEach(p => {
      const a = p.adjusted_adp != null ? p.adjusted_adp : p.raw_adp;
      if (a == null) return;
      const b = best == null ? null : (best.adjusted_adp != null ? best.adjusted_adp : best.raw_adp);
      if (b == null || a < b) best = p;
    });
    return best || board[0] || null;
  },
  B1: function (board) {
    return board.reduce((a, b) => ((b.proj_mean || 0) > (a.proj_mean || 0) ? b : a), board[0] || null);
  },
  B2: function (board) {
    return board.reduce((a, b) => ((b.vorp || 0) > (a.vorp || 0) ? b : a), board[0] || null);
  },
  B3: function (board, ctx) {
    const out = E.recommend(ctx);
    return out.length ? out[0].player : (board[0] || null);
  },
};

/**
 * Replay one season.
 * `bundle` is produced by the Python side under AsOf discipline and carries
 * only pre-draft-knowable inputs.
 */
function replaySeason(bundle) {
  const teams = bundle.teams || 10;
  const starters = rosterPositionsToStarters(bundle.roster_positions);
  const league = { teams: teams, starters: starters,
                   roster_slots: Object.assign({}, starters) };
  const byId = {};
  (bundle.players || []).forEach(p => { byId[String(p.player_id)] = p; });

  const picks = (bundle.picks || []).slice().sort((a, b) => a.pick_no - b.pick_no);
  const totalPicks = picks.length;
  const taken = new Set();
  const rosters = {};
  const records = [];
  const survivalPredictions = [];

  // Keepers are off the board before pick 1 — that is what being kept means.
  picks.filter(p => p.is_keeper).forEach(p => {
    taken.add(String(p.player_id));
    const r = rosters[p.roster_id] = rosters[p.roster_id] || [];
    const pl = byId[String(p.player_id)];
    if (pl) r.push(pl);
  });

  picks.forEach(pick => {
    const pid = String(pick.player_id);
    if (pick.is_keeper) return;                       // not a decision
    const board = (bundle.players || []).filter(p => !taken.has(String(p.player_id)));
    const roster = rosters[pick.roster_id] = rosters[pick.roster_id] || [];
    if (!board.length) return;

    // When does this seat pick again? Needed for survival and VONA, and
    // derivable from the schedule alone — no outcome information.
    let nextPick = null;
    for (let i = 0; i < picks.length; i++) {
      if (picks[i].pick_no > pick.pick_no && picks[i].roster_id === pick.roster_id
          && !picks[i].is_keeper) { nextPick = picks[i].pick_no; break; }
    }
    const myPicksLeft = picks.filter(p => p.roster_id === pick.roster_id
                                     && p.pick_no >= pick.pick_no && !p.is_keeper).length;
    const ctx = {
      board: board, currentPick: pick.pick_no, nextPick: nextPick || pick.pick_no + teams,
      totalPicks: totalPicks, myPicksLeft: myPicksLeft, roster: roster, league: league,
      weights: E.DEFAULT_WEIGHTS, runMultipliers: {}, intervening: [],
      roundsLeft: Math.max(1, (bundle.rounds || 15) - (pick.round || 1) + 1),
    };

    const choices = {};
    Object.keys(POLICIES).forEach(k => {
      const c = POLICIES[k](board, ctx);
      choices[k] = c ? String(c.player_id) : null;
    });

    // Survival calibration: what did the model predict for the top of the
    // board, and did those players actually last to this seat's next pick?
    if (nextPick) {
      board.slice(0, 12).forEach(p => {
        let sv = null;
        try { sv = S.survivalProbability(p, nextPick, ctx); } catch (e) { sv = null; }
        if (sv != null && isFinite(sv)) {
          survivalPredictions.push({
            season: bundle.season, pick_no: pick.pick_no, next_pick: nextPick,
            player_id: String(p.player_id), predicted: sv,
          });
        }
      });
    }

    records.push({
      season: bundle.season, pick_no: pick.pick_no, round: pick.round,
      roster_id: pick.roster_id,
      actual: pid,
      choices: choices,
      board_size: board.length,
    });

    // Advance history, not our own recommendation. A replay that follows its
    // own advice stops being a replay after one pick.
    taken.add(pid);
    const pl = byId[pid];
    if (pl) roster.push(pl);
  });

  return { season: bundle.season, records: records,
           survival_predictions: survivalPredictions,
           projection_method: bundle.projection_method,
           sanity: bundle.sanity || null };
}

/* ---- grading and aggregation, joined AFTER the replay -------------------- */

function mean(xs) { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
}
/** 95% CI half-width. Small N is the whole story here, so this is not optional. */
function ci95(xs) { return xs.length < 2 ? 0 : 1.96 * sd(xs) / Math.sqrt(xs.length); }

function grade(replays, actualPoints, opts) {
  opts = opts || {};
  const maxRound = opts.maxRound || CFG.MAX_ROUND_GRADED;
  const pts = id => {
    const v = actualPoints[String(id)];
    return (v == null || !isFinite(v)) ? null : v;
  };

  const rows = [];
  replays.forEach(r => r.records.forEach(rec => {
    if ((rec.round || 99) > maxRound) return;
    const b0 = pts(rec.choices.B0), b3 = pts(rec.choices.B3);
    if (b0 == null || b3 == null) return;             // ungradeable, not zero
    rows.push({
      season: rec.season, round: rec.round, pick_no: rec.pick_no,
      roster_id: rec.roster_id,
      b0: b0, b1: pts(rec.choices.B1), b2: pts(rec.choices.B2), b3: b3,
      actual: pts(rec.actual),
      disagree: rec.choices.B3 !== rec.choices.B0,
      vs_human: rec.choices.B3 !== rec.actual,
      ids: rec.choices, actual_id: rec.actual,
    });
  }));

  const diffs = rows.map(r => r.b3 - r.b0);
  const dis = rows.filter(r => r.disagree);
  const disDiffs = dis.map(r => r.b3 - r.b0);

  const byRound = {};
  rows.forEach(r => {
    const k = String(r.round);
    (byRound[k] = byRound[k] || []).push(r.b3 - r.b0);
  });
  const perRound = Object.keys(byRound).map(Number).sort((a, b) => a - b).map(rd => ({
    round: rd, n: byRound[String(rd)].length,
    mean_gain: +mean(byRound[String(rd)]).toFixed(2),
    ci95: +ci95(byRound[String(rd)]).toFixed(2),
  }));

  const drafts = {};
  rows.forEach(r => {
    const k = r.season + ':' + r.roster_id;
    drafts[k] = (drafts[k] || 0) + (r.b3 - r.b0);
  });
  const perDraft = Object.keys(drafts).map(k => drafts[k]);

  const human = rows.filter(r => r.vs_human && r.actual != null);

  return {
    graded_picks: rows.length,
    headline: {
      b0_mean: +mean(rows.map(r => r.b0)).toFixed(2),
      b1_mean: +mean(rows.filter(r => r.b1 != null).map(r => r.b1)).toFixed(2),
      b2_mean: +mean(rows.filter(r => r.b2 != null).map(r => r.b2)).toFixed(2),
      b3_mean: +mean(rows.map(r => r.b3)).toFixed(2),
      mean_gain_per_pick: +mean(diffs).toFixed(2),
      ci95_per_pick: +ci95(diffs).toFixed(2),
      mean_gain_per_draft: +mean(perDraft).toFixed(2),
      ci95_per_draft: +ci95(perDraft).toFixed(2),
      drafts_counted: perDraft.length,
    },
    disagreement: {
      n: dis.length,
      share_of_picks: rows.length ? +(dis.length / rows.length).toFixed(3) : 0,
      win_rate: dis.length ? +(dis.filter(r => r.b3 > r.b0).length / dis.length).toFixed(3) : null,
      mean_gain: +mean(disDiffs).toFixed(2),
      ci95: +ci95(disDiffs).toFixed(2),
    },
    per_round: perRound,
    vs_human: {
      n: human.length,
      win_rate: human.length ? +(human.filter(r => r.b3 > r.actual).length / human.length).toFixed(3) : null,
      mean_gain: +mean(human.map(r => r.b3 - r.actual)).toFixed(2),
      ci95: +ci95(human.map(r => r.b3 - r.actual)).toFixed(2),
    },
    rows: rows,
  };
}

/** Did players the model said would survive actually survive? */
function calibration(replays, survivedFn) {
  const buckets = [];
  for (let i = 0; i < 10; i++) buckets.push({ lo: i / 10, hi: (i + 1) / 10, n: 0, survived: 0 });
  replays.forEach(r => (r.survival_predictions || []).forEach(sp => {
    const s = survivedFn(sp);
    if (s == null) return;
    let idx = Math.min(9, Math.max(0, Math.floor(sp.predicted * 10)));
    buckets[idx].n++;
    if (s) buckets[idx].survived++;
  }));
  return buckets.map(b => ({
    bucket: (b.lo * 100) + '-' + (b.hi * 100) + '%',
    predicted_mid: +(((b.lo + b.hi) / 2)).toFixed(2),
    n: b.n,
    actual_rate: b.n ? +(b.survived / b.n).toFixed(3) : null,
    // Positive = the model was too pessimistic; negative = overconfident.
    error: b.n ? +((b.survived / b.n) - (b.lo + b.hi) / 2).toFixed(3) : null,
  }));
}

module.exports = { CFG, POLICIES, replaySeason, grade, calibration, mean, sd, ci95 };
