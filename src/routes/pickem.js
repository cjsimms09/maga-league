// ─────────────────────────────────────────────────────────────────────────────
// PICK'EM — the league picks every game, every week, and it is remembered.
//
// The shape of it: each week the league plays five head-to-head games. Before
// kickoff, everyone taps a winner for each one. At the first kickoff the picks
// LOCK — after that you are betting on information, not making a pick — and the
// split becomes public ("7 of 10 took Michael"), so you find out who backed you
// and who backed the guy across from you. When the week finishes the picks grade
// themselves off the same Sleeper scores everything else uses.
//
// Accuracy is the whole point, so it is tracked loudly: a season leaderboard, an
// all-time accumulation that never resets, and a Hall of Shame that names the
// worst picker to his face. It is all league-visible — a pick is a RESULT, not a
// tool (ACCESS-RULE.md), so it lives with the standings and the money, not behind
// the commissioner wall.
//
// This module is the ENGINE: pure grading/aggregation functions plus the thin
// store layer that persists picks and freezes each week's slate. The HTTP surface
// lives in member.js, same division as the lineup optimizer (LO) and the pool
// advisor. Everything here is derived from data the site already trusts — the
// Sleeper scoreboard and the picks people actually made — so nothing is a
// hand-set number waiting to rot.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const BL = require('../betlogic');
const { store, getDoc, setDoc, now } = require('../data');

// ── config ───────────────────────────────────────────────────────────────────
const CFG = {
  // A picker is only eligible for the leaderboard — and for the shame of last
  // place — once they have GRADED at least this many games. One lucky week is
  // not a season, and naming someone "the worst" off two decided games is the
  // kind of wrong that starts an actual argument. A week is five games, so a
  // full slate graded is the floor. Derived from the slate size when we have it
  // (see rankBoard); this is the fallback when we don't.
  MIN_GRADED_FOR_RANK: 5,
  // Points comparisons borrow the side-bet engine's epsilon so a pick'em game
  // and a matchup side-bet decide a dead-heat the same way: a tie is a tie, it
  // counts for nobody, and it is not a missed pick.
  POINTS_EPSILON: BL.CFG.POINTS_EPSILON,
};

// ── stable identifiers ─────────────────────────────────────────────────────────
// A game is identified by the pair of OWNER ids, low first — stable across the
// season even though Sleeper's roster_id and matchup_id are not. A pick stores
// the owner id it backed, so a pick means the same thing whatever the schedule
// does around it.
function gameId(aId, bId) {
  const x = Number(aId), y = Number(bId);
  return x < y ? `${x}:${y}` : `${y}:${x}`;
}

/**
 * The week's games, from a live Sleeper bundle. Pairs the matchups by
 * matchup_id, maps each roster to its owner, and drops anything that is not a
 * clean two-owner game (byes, unmapped teams). Ordered by the lower owner id so
 * the slate reads the same every render.
 *
 * @returns [{ id, a: ownerObj, b: ownerObj }]   (a is always the lower owner id)
 */
function weekGames(sData, sleeperMap, owners) {
  if (!sData || !Array.isArray(sData.matchups)) return [];
  const ownerFor = rid => {
    const id = (sleeperMap || {})[String(rid)];
    return (owners || []).find(o => o.id === Number(id)) || null;
  };
  const byMatch = {};
  for (const m of sData.matchups) {
    const key = m.matchup_id != null ? `m${m.matchup_id}` : `solo-${m.roster_id}`;
    (byMatch[key] ??= []).push(m);
  }
  const games = [];
  for (const pair of Object.values(byMatch)) {
    if (pair.length !== 2) continue;                 // bye or malformed — not a pick
    const oa = ownerFor(pair[0].roster_id), ob = ownerFor(pair[1].roster_id);
    if (!oa || !ob) continue;                        // an unmapped team can't be picked
    const [a, b] = oa.id < ob.id ? [oa, ob] : [ob, oa];
    games.push({ id: gameId(a.id, b.id), a, b });
  }
  games.sort((x, y) => Number(x.id.split(':')[0]) - Number(y.id.split(':')[0]));
  return games;
}

/** Slimmed owner ref for a frozen slate — id + name, nothing that drifts. */
const slim = o => ({ id: o.id, name: o.name });

// ── locking ────────────────────────────────────────────────────────────────────
/** When this week's picks lock: the week's first kickoff (betlogic's calendar). */
function lockAt(week, seasonStart) { return BL.kickoffOf(week, seasonStart); }

/**
 * Are the picks locked? Two signals, earlier wins — the same rule matchup bets
 * use, on purpose, so "locked" means one thing across the site:
 *   1. points on the board — a game has kicked off, which is a fact, or
 *   2. the scheduled first kickoff has passed.
 */
function isLocked({ week, seasonStart, at = new Date(), anyScore = false }) {
  if (anyScore) return true;
  return at >= BL.kickoffOf(week, seasonStart);
}

/** Any points on this week's board yet? (kickoff has happened if so.) */
function anyScoreOnBoard(sData) {
  return !!(sData && Array.isArray(sData.matchups)
    && sData.matchups.some(m => (m.points || 0) > 0));
}

// ── grading ─────────────────────────────────────────────────────────────────────
/**
 * One game's result from a finished week's points (owner_id -> points).
 * Returns null while the game is undecided (a score missing), so "we don't know
 * yet" never masquerades as a loss.
 * @returns { winner: ownerId|'tie', a, b } | null
 */
function gameResult(game, weekPoints) {
  if (!weekPoints) return null;
  const a = weekPoints[String(game.a.id)];
  const b = weekPoints[String(game.b.id)];
  if (a == null || b == null) return null;
  if (Math.abs(a - b) < CFG.POINTS_EPSILON) return { winner: 'tie', a, b };
  return { winner: a > b ? game.a.id : game.b.id, a, b };
}

/**
 * Score one picker's card for a week.
 * @param picks  { gameId: pickedOwnerId }
 * @param games  the slate
 * @param weekPoints  finished-week points, or null while live
 * @returns { correct, graded, total, pending, missed }
 *   graded  = decided games this picker had a (non-tie) pick on
 *   correct = of those, how many they got right
 *   pending = games not yet decided
 *   missed  = decided games they never picked (counts against a full slate)
 */
function scoreWeek(picks, games, weekPoints) {
  let correct = 0, graded = 0, pending = 0, missed = 0;
  for (const g of games) {
    const res = gameResult(g, weekPoints);
    const pick = picks && picks[g.id];
    if (!res) { pending++; continue; }
    if (res.winner === 'tie') continue;              // decided by nobody
    if (pick == null) { missed++; continue; }        // didn't pick — not scored, but noted
    graded++;
    if (Number(pick) === Number(res.winner)) correct++;
  }
  return { correct, graded, total: games.length, pending, missed };
}

/**
 * How the whole league split a game — only meaningful once picks lock.
 * @param allPicks  [{ owner_id, picks }]
 * @returns { a, b, none, total } counts per side
 */
function gameSplit(game, allPicks) {
  let a = 0, b = 0, none = 0;
  for (const p of allPicks || []) {
    const v = p.picks && p.picks[game.id];
    if (Number(v) === game.a.id) a++;
    else if (Number(v) === game.b.id) b++;
    else none++;
  }
  return { a, b, none, total: a + b };
}

/** "7 of 10 took Michael" — the split as one English line, majority side first. */
function splitLine(game, allPicks, nameOf) {
  const s = gameSplit(game, allPicks);
  if (!s.total) return 'nobody picked this one';
  const [big, bigN, small, smallN] = s.a >= s.b
    ? [game.a, s.a, game.b, s.b] : [game.b, s.b, game.a, s.a];
  if (smallN === 0) return `all ${bigN} took ${nameOf(big.id)}`;
  return `${bigN} of ${s.total} took ${nameOf(big.id)}, ${smallN} took ${nameOf(small.id)}`;
}

/** Who backed the guy across from you: owners who picked my opponent in my game. */
function backedAgainst(game, myId, allPicks, nameOf) {
  const oppId = Number(game.a.id) === Number(myId) ? game.b.id : game.a.id;
  return (allPicks || [])
    .filter(p => Number(p.owner_id) !== Number(myId) && Number(p.picks && p.picks[game.id]) === Number(oppId))
    .map(p => nameOf(p.owner_id));
}

// ── the boards ──────────────────────────────────────────────────────────────────
/**
 * Rank a set of aggregated rows into a leaderboard.
 * @param rows  [{ owner_id, name, correct, graded, weeks }]
 * @param slateSize  games in a typical week, to set the eligibility floor
 * @returns rows sorted best-first, each with { pct, rank, eligible, worst }
 *   pct     = correct/graded (0 when nothing graded)
 *   worst   = the single lowest-accuracy ELIGIBLE picker (the Hall of Shame seat)
 * Ties in pct break on more graded (a bigger sample of the same rate ranks higher);
 * still level, the earlier name — deterministic, never random.
 */
function rankBoard(rows, slateSize) {
  const floor = Math.max(1, slateSize || CFG.MIN_GRADED_FOR_RANK);
  const out = (rows || []).map(r => ({
    ...r,
    pct: r.graded ? r.correct / r.graded : 0,
    eligible: r.graded >= floor,
  }));
  // Eligible pickers rank first — a one-game 100% is not the best in the league,
  // it's a small sample. Then by accuracy, then by the bigger sample of the same
  // rate, then name (deterministic, never random).
  out.sort((x, y) =>
    (Number(y.eligible) - Number(x.eligible))
    || (y.pct - x.pct) || (y.graded - x.graded)
    || String(x.name).localeCompare(String(y.name)));
  out.forEach((r, i) => { r.rank = i + 1; });
  // The worst seat: lowest pct among the eligible. Computed on its own so a
  // picker with too small a sample is never shamed, and so it survives whatever
  // order the caller renders in.
  const elig = out.filter(r => r.eligible);
  if (elig.length >= 2) {
    let worst = elig[0];
    for (const r of elig) {
      if (r.pct < worst.pct
        || (r.pct === worst.pct && r.graded > worst.graded)) worst = r;
    }
    out.forEach(r => { r.worst = (r.owner_id === worst.owner_id); });
  }
  return out;
}

/** Merge per-week score rows into one accumulated row per owner. */
function accumulate(perOwner) {
  const acc = {};
  for (const { owner_id, name, correct, graded } of perOwner) {
    const k = String(owner_id);
    (acc[k] ??= { owner_id: Number(owner_id), name, correct: 0, graded: 0, weeks: 0 });
    acc[k].correct += correct;
    acc[k].graded += graded;
    if (graded > 0) acc[k].weeks += 1;
    if (name) acc[k].name = name;
  }
  return Object.values(acc);
}

// ═══════════════════════════════ store layer ═══════════════════════════════════
// Keys:
//   pickem:<season>:<week>:<ownerId>   one picker's card for a week (owner writes own)
//   pickem-slate:<season>:<week>       the frozen slate (games) for a week
// A slate is frozen the first time we see the live matchups so scoring a past
// week never depends on re-reaching Sleeper, and so a mid-week schedule oddity
// can't rewrite games people already picked against.

const pickKey  = (s, w, o) => `pickem:${s}:${w}:${o}`;
const pickPref = (s, w)    => `pickem:${s}:${w}:`;
const slateKey = (s, w)    => `pickem-slate:${s}:${w}`;

async function getMyPicks(season, week, ownerId) {
  const doc = await getDoc(pickKey(season, week, ownerId), null);
  return (doc && doc.picks) || {};
}

/**
 * Save a picker's card, keeping ONLY picks for games on the current slate and
 * only while unlocked. Returns the saved picks. The lock is re-checked here, on
 * the server, because hiding the form is not a guarantee.
 */
async function savePicks(season, week, ownerId, picks, games) {
  const valid = new Set(games.map(g => g.id));
  const clean = {};
  for (const g of games) {
    const v = picks[g.id];
    if (v == null || v === '') continue;
    if (Number(v) === g.a.id || Number(v) === g.b.id) clean[g.id] = Number(v);
  }
  await setDoc(pickKey(season, week, ownerId), {
    season, week, owner_id: Number(ownerId), picks: clean, updated_at: now(),
  });
  return clean;
}

/** Everyone's cards for a week: [{ owner_id, picks, updated_at }]. */
async function allPicksForWeek(season, week) {
  const keys = await store.listKeys(pickPref(season, week));
  const docs = await Promise.all(keys.map(k => store.get(k)));
  return docs.filter(Boolean).map(d => ({
    owner_id: Number(d.owner_id), picks: d.picks || {}, updated_at: d.updated_at,
  }));
}

/** Read a frozen slate, or null. Owner refs are the slim {id,name} form. */
async function getSlate(season, week) {
  const doc = await getDoc(slateKey(season, week), null);
  return (doc && doc.games) ? doc : null;
}

/**
 * Freeze the slate for a week if we can see it live and it isn't frozen yet (or
 * refresh it while still unlocked, in case the schedule was posted late). Never
 * rewrites a locked slate. Returns the games actually in force.
 */
async function ensureSlate(season, week, liveGames, { locked } = {}) {
  const existing = await getSlate(season, week);
  if (existing && (existing.locked || locked)) return existing.games;
  if (!liveGames || !liveGames.length) return existing ? existing.games : [];
  const frozen = liveGames.map(g => ({ id: g.id, a: slim(g.a), b: slim(g.b) }));
  await setDoc(slateKey(season, week), {
    season, week, games: frozen, locked: !!locked,
    saved_at: now(), locked_at: locked ? now() : null,
  });
  return frozen;
}

/**
 * The season board: accumulate every LOCKED week's graded picks into a
 * leaderboard. Pure of the network — it reads frozen slates + cached week points
 * + stored picks, all of which persist. `weekPointsFor(week)` is injected so the
 * caller controls how points are fetched (and cached).
 *
 * @returns { board, weeksGraded, slateSize }
 */
async function seasonBoard(season, upToWeek, owners, weekPointsFor) {
  const nameOf = id => (owners.find(o => o.id === Number(id)) || {}).name || `#${id}`;
  const perOwner = [];
  let weeksGraded = 0, slateSizeSum = 0, slateSizeN = 0;
  for (let w = 1; w <= upToWeek; w++) {
    const slate = await getSlate(season, w);
    if (!slate || !slate.games.length) continue;
    const wp = await weekPointsFor(w);
    if (!wp) continue;                                // week not final — skip
    const games = slate.games;
    slateSizeSum += games.length; slateSizeN += 1;
    let anyGraded = false;
    const cards = await allPicksForWeek(season, w);
    for (const o of owners) {
      const mine = cards.find(c => c.owner_id === o.id);
      const s = scoreWeek(mine ? mine.picks : {}, games, wp);
      if (s.graded > 0) anyGraded = true;
      perOwner.push({ owner_id: o.id, name: o.name, correct: s.correct, graded: s.graded });
    }
    if (anyGraded) weeksGraded += 1;
  }
  const slateSize = slateSizeN ? Math.round(slateSizeSum / slateSizeN) : CFG.MIN_GRADED_FOR_RANK;
  const board = rankBoard(accumulate(perOwner), slateSize);
  return { board, weeksGraded, slateSize };
}

/**
 * All-time accumulation across every season that has pick'em data. Same grading,
 * summed forever — this is the number that never resets, the one the chronicle
 * quotes years later. `seasonsWithData` and `weekPointsFor(season, week)` are
 * injected so this module stays free of the seasons config and the network.
 *
 * @returns { board, seasons: number[] }
 */
async function allTimeBoard(seasonsWithData, owners, weekPointsFor, weeksPerSeason = 18) {
  const perOwner = [];
  let sizeSum = 0, sizeN = 0;
  const touched = [];
  for (const season of seasonsWithData) {
    let seasonHad = false;
    for (let w = 1; w <= weeksPerSeason; w++) {
      const slate = await getSlate(season, w);
      if (!slate || !slate.games.length) continue;
      const wp = await weekPointsFor(season, w);
      if (!wp) continue;
      sizeSum += slate.games.length; sizeN += 1;
      const cards = await allPicksForWeek(season, w);
      for (const o of owners) {
        const mine = cards.find(c => c.owner_id === o.id);
        const s = scoreWeek(mine ? mine.picks : {}, slate.games, wp);
        perOwner.push({ owner_id: o.id, name: o.name, correct: s.correct, graded: s.graded });
        if (s.graded > 0) seasonHad = true;
      }
    }
    if (seasonHad) touched.push(season);
  }
  const slateSize = sizeN ? Math.round(sizeSum / sizeN) : CFG.MIN_GRADED_FOR_RANK;
  return { board: rankBoard(accumulate(perOwner), slateSize), seasons: touched };
}

module.exports = {
  CFG, gameId, weekGames, lockAt, isLocked, anyScoreOnBoard,
  gameResult, scoreWeek, gameSplit, splitLine, backedAgainst,
  rankBoard, accumulate,
  // store layer
  getMyPicks, savePicks, allPicksForWeek, getSlate, ensureSlate,
  seasonBoard, allTimeBoard,
  pickKey, slateKey,
};
