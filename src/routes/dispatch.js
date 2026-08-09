// ─────────────────────────────────────────────────────────────────────────────
// THE DISPATCH — the league's transient popups. They APPEAR (weekly awards on a
// Tuesday, a power poll, a this-week-in-history callback), get read, get
// dismissed, and are GONE. They never sit on a page. But every one is ARCHIVED
// the moment it's generated, so a chapter can quote the exact thing the site said
// about you the morning after you put up 71.
//
// Written in the league voice: mean about FANTASY, never a slur, nothing actually
// political. Every line is chosen deterministically from the event's key (not
// random), so the archived text is stable — the same week always reads the same,
// which is what makes it quotable later.
//
// Pure generation + a thin store layer (per-owner "seen" set + the immutable
// archive). The HTTP surface (render on the home page, dismiss) lives in
// member.js, same division as pick'em and the optimizer. Everything is DERIVED
// from data the site already has — last week's scoreboard, the standings, the
// record book — so nothing here is a hand-written announcement that rots.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { getDoc, setDoc, now } = require('../data');

const CFG = {
  // How many popups we'll ever stack on someone at once. More than this and it
  // stops being a dispatch and becomes a wall — the thing this feature exists to
  // avoid. Newest first; the rest wait for the next visit after these clear.
  MAX_SHOWN: 4,
};

// Stable index into a template list from a key — same event, same line, forever.
function pick(list, key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}
const one = n => Math.round(n * 100) / 100;

// ── the voice ──────────────────────────────────────────────────────────────────
const V = {
  high: [
    n => `${n} put up the most points in the league and cashed the $100. Enjoy it — nobody remembers week winners, they remember chokers.`,
    n => `${n} led the week. A stopped clock is right twice a day, and this was one of them.`,
    n => `${n} took the weekly high. Frame the hundred dollars; it may be the only thing you win all year.`,
  ],
  low: [
    (n, p) => `${n} scored ${p}. My grandmother could set a better lineup, and she's been dead since 2019.`,
    (n, p) => `${n} managed ${p} points. There are byes that outscore that.`,
    (n, p) => `${n}: ${p}. Somewhere a projection model is apologizing to its family.`,
  ],
  blowout: [
    (w, l, m) => `${w} beat ${l} by ${m}. That's not a game, that's a crime scene.`,
    (w, l, m) => `${w} put ${m} on ${l}. ${l} should ask for the tape back so nobody sees it.`,
    (w, l, m) => `${w} over ${l} by ${m}. Mercy rule when?`,
  ],
  powerTop: [
    n => `${n} is on top. Peaking in October is a proud tradition in this league — ask anyone who's not holding a trophy.`,
    n => `${n} leads the power poll. The bar is low and he cleared it. Applause.`,
  ],
  powerBottom: [
    n => `${n} brings up the rear. Somebody has to pay for everyone else's prizes — thank you for your service.`,
    n => `${n} is dead last in the poll. The good news: it can't get much worse. The bad news: it usually does.`,
  ],
  vaultWeek: [
    (n, y) => `This week back in ${y}, ${n} dropped the weekly high on your heads. Some things never change; some people just get older and still lose to ${n}.`,
    (n, y) => `${y}, this same week: ${n} took the hundred. History doesn't repeat, but in this league it absolutely rhymes.`,
  ],
};

// ── generators (pure) ────────────────────────────────────────────────────────
/**
 * Build the candidate dispatches from already-computed inputs (no network here).
 *
 * @param season       current season year
 * @param week         current NFL week (for the history callback)
 * @param reviewWeek   the last COMPLETED week (or 0/null pre-season)
 * @param review       sleeper.weekReview() output for reviewWeek, or null
 * @param nameOfRoster (roster_id) => owner name  (via the sleeper map)
 * @param standings    sleeper.standings() rows [{owner_name, rank, wins, losses, pf}]
 * @param weeklyHistory { [year]: [nameForWeek1, nameForWeek2, ...] }  (past seasons)
 * @returns [{ key, kind, icon, title, body, season, week }]  newest/most-relevant first
 */
function generate({ season, week, reviewWeek, review, nameOfRoster, standings = [], weeklyHistory = {} }) {
  const items = [];

  // ── weekly awards, off the last completed week's scoreboard ──────────────────
  if (review && reviewWeek) {
    const nm = r => (r ? (nameOfRoster(r.roster_id) || r.team) : '?');
    if (review.top && review.top.points > 0) {
      const key = `award:high:${season}:${reviewWeek}`;
      items.push({ key, kind: 'award', icon: '👑', season, week: reviewWeek,
        title: `Week ${reviewWeek} — the $100`, body: pick(V.high, key)(nm(review.top)) });
    }
    if (review.low && review.low.points >= 0) {
      const key = `award:low:${season}:${reviewWeek}`;
      items.push({ key, kind: 'award', icon: '🚽', season, week: reviewWeek,
        title: `Week ${reviewWeek} — the toilet`, body: pick(V.low, key)(nm(review.low), one(review.low.points)) });
    }
    if (review.blowout && review.blowout.margin > 0) {
      const key = `award:blowout:${season}:${reviewWeek}`;
      items.push({ key, kind: 'award', icon: '💀', season, week: reviewWeek,
        title: `Week ${reviewWeek} — the beating`, body: pick(V.blowout, key)(nm(review.blowout.w), nm(review.blowout.l), one(review.blowout.margin)) });
    }
  }

  // ── the power poll, off the live standings (only once games are played) ───────
  const played = standings.filter(s => (s.wins + s.losses) > 0);
  if (played.length >= 4) {
    const ranked = [...standings].sort((a, b) => (a.rank || 99) - (b.rank || 99));
    const top = ranked[0], bottom = ranked[ranked.length - 1];
    const key = `power:${season}:${week}`;
    items.push({ key, kind: 'power', icon: '📊', season, week,
      title: `Power poll — week ${week}`,
      body: `${pick(V.powerTop, key + ':t')(top.owner_name || top.team)} ${pick(V.powerBottom, key + ':b')(bottom.owner_name || bottom.team)}` });
  }

  // ── this week, years ago (from the record book) ──────────────────────────────
  // Aligned to the SAME week of the season — as close to "on this day" as a
  // week-keyed record book honestly gets. Prefer the most distant past season so
  // it reads as a callback, not last year's news.
  const years = Object.keys(weeklyHistory).map(Number)
    .filter(y => y < season && Array.isArray(weeklyHistory[y]) && weeklyHistory[y][week - 1])
    .sort((a, b) => a - b);
  if (years.length && week >= 1) {
    const y = years[0];
    const who = weeklyHistory[y][week - 1];
    const key = `vault:thisweek:${y}:${week}`;
    items.push({ key, kind: 'vault', icon: '📜', season, week,
      title: `This week, ${y}`, body: pick(V.vaultWeek, key)(who, y) });
  }

  return items;
}

// ═══════════════════════════════ store layer ═══════════════════════════════════
// Keys:
//   dispatch:<key>            the archived item, immutable, for the chronicle
//   dispatch-seen:<ownerId>   { keys: [...] } — what this owner has dismissed
//   dispatch-index:<season>   [key, ...] — the season's archive index (for lookup)

async function archive(item) {
  const k = `dispatch:${item.key}`;
  const existing = await getDoc(k, null);
  if (existing) return existing;                    // immutable — first text wins
  const stored = { ...item, created_at: now() };
  await setDoc(k, stored);
  // Keep a per-season index so the chronicle can enumerate without a full scan.
  const idxKey = `dispatch-index:${item.season}`;
  const idx = await getDoc(idxKey, []);
  if (!idx.includes(item.key)) { idx.push(item.key); await setDoc(idxKey, idx); }
  return stored;
}

async function getSeen(ownerId) {
  const doc = await getDoc(`dispatch-seen:${ownerId}`, { keys: [] });
  return new Set(doc.keys || []);
}

async function markSeen(ownerId, key) {
  const doc = await getDoc(`dispatch-seen:${ownerId}`, { keys: [] });
  if (!doc.keys.includes(key)) { doc.keys.push(key); await setDoc(`dispatch-seen:${ownerId}`, doc); }
}

/** The undismissed dispatches for one owner, newest first, capped. */
function pending(items, seenSet) {
  return items.filter(i => !seenSet.has(i.key)).slice(0, CFG.MAX_SHOWN);
}

/** The season's archive, oldest first — what a chapter reads. */
async function getArchive(season) {
  const idx = await getDoc(`dispatch-index:${season}`, []);
  const docs = await Promise.all(idx.map(k => getDoc(`dispatch:${k}`, null)));
  return docs.filter(Boolean);
}

module.exports = { CFG, generate, pick, archive, getSeen, markSeen, pending, getArchive };
