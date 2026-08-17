// ─────────────────────────────────────────────────────────────────────────────
// TRASH TALK ON MATCHUPS — posts attached to a specific game, permanent,
// archived so a chapter can quote exactly what someone said the week before they
// lost by forty.
//
// A game is identified the same way pick'em identifies it — season + week + the
// low-first owner pair — so a post is welded to the actual game, not to a
// roster_id or a matchup_id that won't survive the season. One document per post
// (never a shared array) so two people talking at once never overwrite each
// other. Nothing is edited or deleted here: trash talk is a matter of record.
// League-visible (it's banter about what's happening — a RESULT-in-progress,
// ACCESS-RULE.md), attributed and timestamped.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { store, getDoc, setDoc, newId, now } = require('../data');
const PE = require('./pickem');

const CFG = {
  MAX_LEN: 500,            // a taunt, not an essay
  MAX_PER_GAME: 200,       // a sane ceiling so one game can't unbound a listing
};

const gameKey = (season, week, gameId) => `trash:${season}:${week}:${gameId}`;

/* THE SAME-MILLISECOND COIN FLIP (root-caused 2026-08-15, after it rolled an
 * integrate.sh run back off main and then passed 8/8 re-runs). Two posts in
 * one millisecond share created_at AND newId()'s Date.now() prefix, so the
 * byTime tiebreak fell through to the id's RANDOM suffix — order between the
 * two was a coin flip against insertion order. Stable across renders (the
 * same ids sort the same way every time), which is exactly why the flake
 * never reproduced on a re-read: only the WRITE-side race re-rolls the coin,
 * so "run it again" always looked green. A module-local monotonic counter
 * breaks the tie in true arrival order; it does not survive a restart and
 * does not need to — a restart takes far longer than a millisecond, so
 * created_at separates posts across process lives on its own. */
let seqCounter = 0;

/** Post to a game. Returns the stored post, or null if the body was empty. */
async function post(season, week, gameId, ownerId, body) {
  const text = String(body == null ? '' : body).trim().slice(0, CFG.MAX_LEN);
  if (!text) return null;
  const id = newId();
  const rec = { id, season, week, game_id: gameId, owner_id: Number(ownerId), body: text,
    created_at: now(), seq: seqCounter++ };
  await setDoc(`${gameKey(season, week, gameId)}:${id}`, rec);
  return rec;
}

// Oldest first, and TOTALLY ordered. `created_at` is an ISO string with
// millisecond resolution, so two posts inside the same millisecond compared
// equal and the thread fell back to whatever order listKeys happened to return
// — which is directory order, i.e. arbitrary and not even stable between
// calls. On a record the page advertises as permanent and quotable, a thread
// that renders in a different order on a refresh is not a cosmetic problem.
//
// ⚠️ The previous comment here claimed the id tiebreak made the order
// "deterministic even where the timestamp cannot separate two posts" — HALF
// TRUE, and the half that was false was a live flake: the id IS stable across
// renders, but its same-millisecond ordering is its RANDOM suffix, a coin
// flip against true arrival order (the mechanism behind the trashtalk
// integrate.sh rollback — see post() above). `seq` now carries true arrival
// order within a process; records written before seq existed carry none and
// fall through to the id exactly as before, so historical threads render
// identically.
const byTime = (a, b) => String(a.created_at).localeCompare(String(b.created_at))
  || ((a.seq ?? 0) - (b.seq ?? 0))
  || String(a.id).localeCompare(String(b.id));

/** Every post on one game, oldest first (the order an argument actually happened). */
async function forGame(season, week, gameId) {
  // ONE ORDER DECIDES BOTH THE THREAD AND THE CAP.
  //
  // This sliced MAX_PER_GAME keys in listKeys order and sorted afterwards, so
  // an over-cap thread showed an ARBITRARY subset presented as the thread.
  // Sorting the keys first fixed the subset but left TWO orders in one
  // function: the cap was applied in key (id) order, the thread rendered in
  // (created_at, id) order. Those can disagree — `post` reads the clock twice,
  // newId() via Date.now() and created_at via new Date(), and the pair can
  // straddle a millisecond — so at the cap boundary the two disagreed and the
  // test caught it as an intermittent failure.
  //
  // So: sort the documents once, cap the sorted list. Loading every post to
  // drop some is only wasteful at a scale this cannot reach — the cap is 200
  // on one game in a ten-person league, and it exists as a backstop, not as a
  // paging strategy. No "N older posts hidden" note for the same reason: a
  // banner for a state nobody can get to is a claim to maintain for nothing.
  const keys = await store.listKeys(`${gameKey(season, week, gameId)}:`);
  const docs = (await Promise.all(keys.map(k => store.get(k)))).filter(Boolean).sort(byTime);
  return docs.slice(-CFG.MAX_PER_GAME);
}

/** Count only — cheap enough to show a badge without loading the thread. */
async function countForGame(season, week, gameId) {
  return (await store.listKeys(`${gameKey(season, week, gameId)}:`)).length;
}

/**
 * The whole season's trash talk, for the chronicle. Grouped by game so a chapter
 * can pull "what was said on the David–Marian game in week 9" in one lookup.
 * @returns { [gameId:"a:b"]: { week, posts: [...] }[] }  (flat list, newest last)
 */
async function archiveForSeason(season) {
  const keys = await store.listKeys(`trash:${season}:`);
  const docs = (await Promise.all(keys.map(k => store.get(k)))).filter(Boolean);
  docs.sort(byTime);              // same total order as the thread — see above
  return docs;
}

module.exports = { CFG, gameKey, post, forGame, countForGame, archiveForSeason,
  // re-export so callers derive the game id identically to pick'em
  gameId: PE.gameId };
