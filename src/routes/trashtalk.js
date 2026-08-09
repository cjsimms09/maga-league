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

/** Post to a game. Returns the stored post, or null if the body was empty. */
async function post(season, week, gameId, ownerId, body) {
  const text = String(body == null ? '' : body).trim().slice(0, CFG.MAX_LEN);
  if (!text) return null;
  const id = newId();
  const rec = { id, season, week, game_id: gameId, owner_id: Number(ownerId), body: text, created_at: now() };
  await setDoc(`${gameKey(season, week, gameId)}:${id}`, rec);
  return rec;
}

/** Every post on one game, oldest first (the order an argument actually happened). */
async function forGame(season, week, gameId) {
  const keys = await store.listKeys(`${gameKey(season, week, gameId)}:`);
  const docs = await Promise.all(keys.slice(0, CFG.MAX_PER_GAME).map(k => store.get(k)));
  return docs.filter(Boolean).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
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
  docs.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return docs;
}

module.exports = { CFG, gameKey, post, forGame, countForGame, archiveForSeason,
  // re-export so callers derive the game id identically to pick'em
  gameId: PE.gameId };
