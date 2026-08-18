'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// RECORDS WATCH — chips when someone is playing their way into the franchise
// record book (member-site pass, 2026-08-16; Cory: "records watch yes").
//
// League-visible (records are the league's shared history — ACCESS-RULE.md) and
// DORMANT by construction: every function returns [] until a live number is
// actually near a book entry, so a normal week renders nothing.
//
// THE HONESTY RULES, because a record claim mid-game is a claim about the
// future:
//   • A team's WEEKLY SCORE only ever rises while the week runs, so "already
//     past the No. 5 score" is a fact-in-progress and may be stated plainly;
//     "N shy of the book" is arithmetic off two printed numbers.
//   • A MARGIN can shrink, so a blowout chip always carries "if it holds" —
//     never stated as done while the ball is in the air.
//   • BAD BEAT (most points in a loss) and the STINKER (lowest week) only mean
//     anything when the week is FINAL — a loss and a floor don't exist
//     mid-game — so those live in completedWatch, never in liveWatch.
//
// The book is history-data's records (buildRecordsBook over the 2023-25 box
// scores) — the same entries the History page renders, never re-derived here.
// ─────────────────────────────────────────────────────────────────────────────

const CFG = {
  TOP_N: 5,        // the book's published depth (top-5 lists in buildRecordsBook)
  NEAR_PTS: 12,    // "approaching" when within this of the No. 5 weekly score
};

const r1 = n => Math.round(Number(n) * 10) / 10;
const nth = i => (['record', '2nd', '3rd', '4th', '5th'][i] || `${i + 1}th`);

/** Where a value would slot into a top-5 list (descending by f). Null if out. */
function slotIn(list, value, f, opts = {}) {
  if (!Array.isArray(list) || list.length < CFG.TOP_N) return null;
  const cmp = opts.ascending ? (a, b) => a < b : (a, b) => a > b;
  for (let i = 0; i < CFG.TOP_N; i++) {
    if (cmp(value, f(list[i]))) return i;
  }
  return null;
}

/**
 * LIVE chips, while games are on. `cards` is the scoreboard's shape:
 * [{ a:{id,name}, b:{id,name}, aPts, bPts }] — points may be null pre-kick.
 * @returns [{ kind, level:'in'|'near', ownerId, text }]
 */
function liveWatch(records, cards, opts = {}) {
  const out = [];
  if (!records || !Array.isArray(cards)) return out;
  const high = records.highestWeek || [];
  const blow = records.biggestBlowout || [];
  const canHigh = high.length >= CFG.TOP_N;
  const canBlow = blow.length >= CFG.TOP_N;
  const highFloor = canHigh ? Number(high[CFG.TOP_N - 1].points) : null;

  for (const c of cards) {
    for (const [side, other] of [['a', 'b'], ['b', 'a']]) {
      const pts = c[side + 'Pts'];
      const who = c[side];
      if (pts == null || !who || !(pts > 0)) continue;
      if (canHigh && pts > highFloor) {
        const slot = slotIn(high, pts, e => Number(e.points));
        out.push({ kind: 'high', level: 'in', ownerId: who.id, gameId: c.g ? c.g.id : null,
          text: `${who.name}'s ${r1(pts)} is already past the all-time No. ${CFG.TOP_N} week (${r1(highFloor)})`
            + (slot === 0 ? ` — the FRANCHISE RECORD (${r1(Number(high[0].points))}) is in reach` : ` — a top-5 week in the book`) });
      } else if (canHigh && highFloor - pts <= CFG.NEAR_PTS) {
        out.push({ kind: 'high', level: 'near', ownerId: who.id, gameId: c.g ? c.g.id : null,
          text: `${who.name} is ${r1(highFloor - pts)} shy of the all-time top-5 (No. ${CFG.TOP_N} is ${r1(highFloor)})` });
      }
      // Blowout: stated once per game, from the leader's side only, always "if it holds".
      if (canBlow && side === 'a' && c.aPts != null && c.bPts != null) {
        const margin = Math.abs(c.aPts - c.bPts);
        const slot = slotIn(blow, margin, e => Number(e.margin));
        if (slot != null && margin > 0) {
          const lead = c.aPts > c.bPts ? c.a : c.b;
          const trail = c.aPts > c.bPts ? c.b : c.a;
          out.push({ kind: 'blowout', level: 'near', ownerId: lead.id, gameId: c.g ? c.g.id : null,
            text: `${lead.name} is up ${r1(margin)} on ${trail.name} — a top-5 all-time beatdown IF IT HOLDS (No. ${CFG.TOP_N} is ${r1(Number(blow[CFG.TOP_N - 1].margin))})` });
        }
      }
    }
  }
  return out;
}

/**
 * COMPLETED-WEEK banners — the claims that only exist once a week is final.
 * `weekRows`: [{ ownerId, name, pts, oppPts }] for one FINISHED week.
 * @returns [{ kind, ownerId, text }]
 */
function completedWatch(records, weekRows, weekNo) {
  const out = [];
  if (!records || !Array.isArray(weekRows)) return out;
  const wk = weekNo != null ? `Week ${weekNo}: ` : '';
  const high = records.highestWeek || [];
  const low = records.lowestWeek || [];
  const loss = records.mostInLoss || [];
  for (const rrow of weekRows) {
    if (rrow.pts == null) continue;
    const hs = slotIn(high, rrow.pts, e => Number(e.points));
    if (hs != null) {
      out.push({ kind: 'high', ownerId: rrow.ownerId,
        text: `${wk}${rrow.name}'s ${r1(rrow.pts)} enters the record book — the No. ${hs + 1} week ever scored in this league` });
    }
    const ls = slotIn(low, rrow.pts, e => Number(e.points), { ascending: true });
    if (ls != null) {
      out.push({ kind: 'low', ownerId: rrow.ownerId,
        text: `${wk}${rrow.name}'s ${r1(rrow.pts)} lands in the record book's basement — the No. ${ls + 1} worst week ever` });
    }
    if (rrow.oppPts != null && rrow.pts < rrow.oppPts) {
      const bs = slotIn(loss, rrow.pts, e => Number(e.points));
      if (bs != null) {
        out.push({ kind: 'badbeat', ownerId: rrow.ownerId,
          text: `${wk}${rrow.name} scored ${r1(rrow.pts)} and LOST — a top-5 all-time bad beat (No. ${bs + 1} in the book)` });
      }
    }
  }
  return out;
}

module.exports = { CFG, slotIn, liveWatch, completedWatch };
