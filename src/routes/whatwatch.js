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
 *   remainKnown          false when we have no per-player feed at all (see below)
 * }
 * @returns { pWin, myProj, oppProj, margin, playersLeft, oppPlayersLeft, remainKnown }
 *   projected FINAL score = live + remaining projection; pWin over the two
 *   Normal finals; margin is projected (positive = you're favored).
 *
 * REMAINKNOWN — the difference between "the week is over" and "we can't see who
 * is left". An empty `remain` used to mean both, and the live path always sends
 * an empty one (no per-player feed yet, PARKED for A). The consequence was not
 * coarseness, it was falsehood: zero remaining players means zero variance, so
 * pWin collapsed to exactly 1 or 0 and a game separated by a TENTH OF A POINT
 * rendered "🟢 in control · 100% · Done — nothing left on the field" from the
 * opening kickoff, for every game, all Sunday. The rehearsal path supplies
 * `remain`, which is why the preview looked right and only the real thing was
 * broken. With remainKnown false we decline to state a probability at all and
 * fall back to the score, which is real.
 */
function sweat(e) {
  const me = remainStats(e.remain), op = remainStats(e.oppRemain);
  const myProj = (Number(e.live) || 0) + me.mean;
  const oppProj = (Number(e.oppLive) || 0) + op.mean;
  const remainKnown = e.remainKnown !== false;
  return {
    pWin: remainKnown ? LO.pWin(myProj, me.varc, oppProj, op.varc) : null,
    live: r1(Number(e.live) || 0), oppLive: r1(Number(e.oppLive) || 0),
    myProj: r1(myProj), oppProj: r1(oppProj), margin: r1(myProj - oppProj),
    playersLeft: (e.remain || []).length, oppPlayersLeft: (e.oppRemain || []).length,
    remainKnown,
  };
}

/** P(this owner clears the weekly-high band) given their remaining players.
 *  Null without the per-player feed — with no variance this is a bare 0/1 and
 *  would print "🎯 100% at the $100" for whoever happened to be leading. */
function highSweat(e, bandSamples) {
  if (e.remainKnown === false) return null;
  const me = remainStats(e.remain);
  const myProj = (Number(e.live) || 0) + me.mean;
  return LO.pClearHigh(myProj, me.varc, bandSamples || []);
}

/** 🟢 / 🟡 / 🔴 / 🔥 — how much this game is worth watching.
 *  Null probability (no per-player feed) gets its own neutral state rather than
 *  borrowing one of the four confident ones. */
function sweatLabel(p) {
  if (p == null) return { icon: '🏈', word: 'in progress', level: 'live' };
  if (Math.abs(p - 0.5) <= CFG.COINFLIP) return { icon: '🔥', word: 'coin flip', level: 'flip' };
  if (p >= CFG.SAFE) return { icon: '🟢', word: 'in control', level: 'safe' };
  if (p <= CFG.COOKED) return { icon: '🔴', word: 'cooked', level: 'cooked' };
  return { icon: '🟡', word: 'sweating', level: 'sweat' };
}

/** The one line: what THIS owner needs from here. */
function needLine(s) {
  const behind = s.oppProj - s.myProj;   // projected points behind
  if (s.remainKnown === false) {
    // No per-player feed: say what the board says and nothing more. "Done" is a
    // claim we cannot make — the players left are exactly what we can't see.
    //
    // WHO is this about? Unqualified, "Down 6.3 on the board" reads as second
    // person, which is right in the "Your game" row and wrong in every row under
    // "Around the league" — there it means the first team named, and the reader
    // has to work that out. `who` names the subject when the caller knows the row
    // isn't the viewer's; it stays second-person when it is.
    const dir = s.margin > 0 ? 'up' : 'down';
    const by = r1(Math.abs(s.margin));
    if (Math.abs(s.margin) < 0.05) {
      return s.who ? `${s.who} is dead even on the board.` : 'Dead even on the board.';
    }
    return s.who
      ? `${s.who} is ${dir} ${by} on the board.`
      : `${dir === 'up' ? 'Up' : 'Down'} ${by} on the board.`;
  }
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
 * @param viewerId     who is reading (optional) — rows that are not theirs get
 *                     their subject named instead of an implied "you"
 * @returns rows with sweat + label + needLine + highP, sorted for watchability
 */
function panelRows(entries, bandSamples, viewerId) {
  const rows = (entries || []).map(e => {
    const s = sweat(e);
    // Name the subject on rows that are NOT the viewer's own game, so
    // "down 6.3 on the board" can't be read as being about the reader. With no
    // viewerId nobody is named, which is the previous behaviour.
    if (viewerId != null && e.owner_id !== viewerId) s.who = e.name;
    return {
      owner_id: e.owner_id, opp_id: e.opp_id, name: e.name, oppName: e.oppName,
      ...s, label: sweatLabel(s.pWin), need: needLine(s),
      highP: bandSamples && bandSamples.length ? highSweat(e, bandSamples) : null,
    };
  });
  // Most-watchable first: closeness to a coin flip, then how many players are
  // still live (more players left = more can still happen).
  //
  // Rows with no probability can't be ranked that way — |pWin - 0.5| was NaN
  // for them, which left the "most watchable first" sort completely inert on
  // live data (every comparison NaN → original order preserved). They rank
  // among themselves by closeness on the board, which is the honest proxy, and
  // sit below any game we can actually price.
  const priced = rows.filter(r => r.pWin != null)
    .sort((a, b) => (Math.abs(a.pWin - 0.5) - Math.abs(b.pWin - 0.5))
      || ((b.playersLeft + b.oppPlayersLeft) - (a.playersLeft + a.oppPlayersLeft)));
  const unpriced = rows.filter(r => r.pWin == null)
    .sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin));
  return [...priced, ...unpriced];
}

/* ── THE LEAGUE-WIDE SWING LAYER (member-site pass, 2026-08-16) ──────────────
 *
 * Cory's extension to this panel: "what to watch that could swing a matchup"
 * across ALL games — the one-line STAKE per game, so everyone tracks
 * everyone's matchups. The stake is computed from real standings arithmetic
 * (re-rank the table under each result of THIS game, holding everything else
 * fixed), never from vibes: what place the winner takes, whether the playoff
 * cut line moves, who holds the toilet, where the $100 lead is riding.
 *
 * Per-NFL-game grouping ("which league matchups can the MNF slate still flip")
 * needs the per-player feed this panel already declares missing (remainKnown);
 * `gameStake` takes the game as a PAIR so the grouping layer can call it
 * unchanged the week that feed lands.
 */

/** Rank owners the way the standings sort: wins desc, then points-for desc.
 *  @returns { [owner_id]: rank } (1-based) */
function rankOwners(rows) {
  const sorted = [...rows].sort((a, b) => b.wins - a.wins || b.pf - a.pf);
  const out = {};
  sorted.forEach((r, i) => { out[r.owner_id] = i + 1; });
  return out;
}

/**
 * The one-line stake of a single game.
 * @param aId/bId  the two owners in the game
 * @param ctx { rows: [{owner_id, wins, losses, pf}] (all teams, current),
 *              cut: playoff spots, names: id -> name,
 *              whLeaderId: who currently leads the weekly $100 (optional) }
 * @returns string | null  (null = nothing sharper than "a game happens")
 */
function gameStake(aId, bId, ctx) {
  if (!ctx || !Array.isArray(ctx.rows) || ctx.rows.length < 4) return null;
  const rows = ctx.rows;
  const nameOf = id => (ctx.names && ctx.names[id]) || `#${id}`;
  const a = rows.find(r => Number(r.owner_id) === Number(aId));
  const b = rows.find(r => Number(r.owner_id) === Number(bId));
  const parts = [];
  if (a && b) {
    const bump = (winner) => rows.map(r => {
      if (r.owner_id === winner.owner_id) return { ...r, wins: (r.wins || 0) + 1 };
      return r;
    });
    const ifA = rankOwners(bump(a));
    const ifB = rankOwners(bump(b));
    const cut = Number(ctx.cut) || 4;
    const last = rows.length;
    // The playoff line: does THIS game decide who sits inside the cut tonight?
    const aCross = ifA[a.owner_id] <= cut && ifB[a.owner_id] > cut;
    const bCross = ifB[b.owner_id] <= cut && ifA[b.owner_id] > cut;
    if (aCross && bCross) {
      parts.push(`playoff-line game — the winner sits ${ord(Math.min(ifA[a.owner_id], ifB[b.owner_id]))}, inside the top ${cut}; the loser falls out`);
    } else if (aCross || bCross) {
      const who = aCross ? a : b, rankW = aCross ? ifA[a.owner_id] : ifB[b.owner_id],
        rankL = aCross ? ifB[a.owner_id] : ifA[b.owner_id];
      parts.push(`${nameOf(who.owner_id)} is playing for the cut: a win sits ${ord(rankW)} (top ${cut}), a loss ${ord(rankL)}`);
    } else if (ifA[a.owner_id] < ifB[a.owner_id] || ifB[b.owner_id] < ifA[b.owner_id]) {
      // No cut drama — say the sharpest real movement in the table.
      const aMove = ifB[a.owner_id] - ifA[a.owner_id];   // places A gains by winning
      const bMove = ifA[b.owner_id] - ifB[b.owner_id];
      const who = aMove >= bMove ? a : b;
      const win = who === a ? ifA[a.owner_id] : ifB[b.owner_id];
      const lose = who === a ? ifB[a.owner_id] : ifA[b.owner_id];
      if (win !== lose) parts.push(`${nameOf(who.owner_id)} climbs to ${ord(win)} with a win, sits ${ord(lose)} with a loss`);
    }
    // The toilet: only when THIS game decides who holds last place tonight.
    const aLast = ifB[a.owner_id] === last, bLast = ifA[b.owner_id] === last;
    if (aLast && bLast) parts.push('the loser holds last place — the toilet is on the line');
    else if ((aLast && ifA[a.owner_id] !== last) || (bLast && ifB[b.owner_id] !== last)) {
      const who = aLast ? a : b;
      parts.push(`${nameOf(who.owner_id)} climbs off the bottom with a win`);
    }
  }
  if (ctx.whLeaderId != null && (Number(ctx.whLeaderId) === Number(aId) || Number(ctx.whLeaderId) === Number(bId))) {
    parts.push(`the $100 lead (${nameOf(Number(ctx.whLeaderId))}) is riding in this one`);
  }
  return parts.length ? parts.join(' · ') : null;
}

function ord(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

module.exports = { CFG, remainStats, sweat, highSweat, sweatLabel, needLine, panelRows,
  rankOwners, gameStake, ord };
