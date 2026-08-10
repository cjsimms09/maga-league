// ─────────────────────────────────────────────────────────────────────────────
// WHAT TO WATCH — Sunday & Monday night, what each owner actually needs: the
// live sweat meter (P you still win this game), the weekly-hundred race sweat
// (P you take the $100), and the one-line "what you need" off the players you
// have left on the field.
//
// The probability core is the optimizer's, reused verbatim (LO.pWin / pClearHigh
// / lineupStats over Normal(projection, sigma)), so the sweat meter and the
// start/sit tool agree by construction. This module is the PURE engine + a
// panel builder; the HTTP surface (the /watch panel, primetime-gated, plus a
// rehearsal preview so the first live Sunday isn't the first time it has run)
// lives in member.js.
//
// League-visible (it's the live race — a RESULT-in-progress, ACCESS-RULE.md) and
// DORMANT without live game data, so it shows nothing off-hours and lights up on
// its own when there are games on and players still to play.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const LO = require('./lineup');

const CFG = {
  // Sweat buckets on P(win). A blowout in either direction isn't a sweat; the
  // middle is where you actually watch. Tuned to read, not to be precise.
  SAFE: 0.85,        // 🟢 in control
  COOKED: 0.15,      // 🔴 all but done
  COINFLIP: 0.08,    // within this of 50/50 → 🔥 coin flip
  DEFAULT_SD: 7,     // per-player weekly SD when a position sigma is missing
};

const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const r1 = n => Math.round(n * 10) / 10;

/** Mean + variance of a set of not-yet-played starters under the proj model. */
function remainStats(starters) {
  const mean = sum(starters || [], s => Number(s.proj) || 0);
  const varc = sum(starters || [], s => { const sd = Number(s.sd) || CFG.DEFAULT_SD; return sd * sd; });
  return { mean, varc };
}

/**
 * The sweat meter for one owner's game, mid-flight.
 * @param e {
 *   live, oppLive        points on the board now for each side
 *   remain, oppRemain    [{proj, sd}] starters yet to play for each side
 * }
 * @returns { pWin, myProj, oppProj, margin, playersLeft, oppPlayersLeft }
 *   projected FINAL score = live + remaining projection; pWin over the two
 *   Normal finals; margin is projected (positive = you're favored).
 */
function sweat(e) {
  const me = remainStats(e.remain), op = remainStats(e.oppRemain);
  const myProj = (Number(e.live) || 0) + me.mean;
  const oppProj = (Number(e.oppLive) || 0) + op.mean;
  const pWin = LO.pWin(myProj, me.varc, oppProj, op.varc);
  return {
    pWin, myProj: r1(myProj), oppProj: r1(oppProj), margin: r1(myProj - oppProj),
    playersLeft: (e.remain || []).length, oppPlayersLeft: (e.oppRemain || []).length,
  };
}

/** P(this owner clears the weekly-high band) given their remaining players. */
function highSweat(e, bandSamples) {
  const me = remainStats(e.remain);
  const myProj = (Number(e.live) || 0) + me.mean;
  return LO.pClearHigh(myProj, me.varc, bandSamples || []);
}

/** 🟢 / 🟡 / 🔴 / 🔥 — how much this game is worth watching. */
function sweatLabel(p) {
  if (Math.abs(p - 0.5) <= CFG.COINFLIP) return { icon: '🔥', word: 'coin flip', level: 'flip' };
  if (p >= CFG.SAFE) return { icon: '🟢', word: 'in control', level: 'safe' };
  if (p <= CFG.COOKED) return { icon: '🔴', word: 'cooked', level: 'cooked' };
  return { icon: '🟡', word: 'sweating', level: 'sweat' };
}

/** The one line: what THIS owner needs from here. */
function needLine(s) {
  const behind = s.oppProj - s.myProj;   // projected points behind
  if (s.playersLeft === 0) {
    if (Math.abs(s.margin) < 0.05) return 'Done — dead even, a tie.';
    return s.margin > 0
      ? `Done — projected to win by ${r1(Math.abs(s.margin))}.`
      : `Done — projected to lose by ${r1(Math.abs(s.margin))}. Nothing left on the field.`;
  }
  if (behind > 0.05) {
    const from = `${s.playersLeft} player${s.playersLeft === 1 ? '' : 's'} left`;
    return `Need ~${r1(behind)} more, from ${from}.`;
  }
  return `Up ${r1(-behind)} projected — ${s.oppPlayersLeft} of theirs still to play.`;
}

/**
 * Build the panel rows for a set of owners, sorted most-watchable first (coin
 * flips and live sweats to the top, decided games to the bottom).
 * @param entries [{ owner_id, opp_id, name, oppName, live, oppLive, remain, oppRemain }]
 * @param bandSamples  the weekly-high thresholds for the $100 sweat (optional)
 * @returns rows with sweat + label + needLine + highP, sorted for watchability
 */
function panelRows(entries, bandSamples) {
  const rows = (entries || []).map(e => {
    const s = sweat(e);
    return {
      owner_id: e.owner_id, opp_id: e.opp_id, name: e.name, oppName: e.oppName,
      ...s, label: sweatLabel(s.pWin), need: needLine(s),
      highP: bandSamples && bandSamples.length ? highSweat(e, bandSamples) : null,
    };
  });
  // Most-watchable first: closeness to a coin flip, then how many players are
  // still live (more players left = more can still happen).
  rows.sort((a, b) =>
    (Math.abs(a.pWin - 0.5) - Math.abs(b.pWin - 0.5))
    || ((b.playersLeft + b.oppPlayersLeft) - (a.playersLeft + a.oppPlayersLeft)));
  return rows;
}

module.exports = { CFG, remainStats, sweat, highSweat, sweatLabel, needLine, panelRows };
