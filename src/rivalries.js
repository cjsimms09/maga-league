'use strict';
//
// RIVALRY GAME OF THE WEEK — the real relationships in this league, billed when the
// two owners are matched up. League-visible (results/relationships, not analysis).
//
// Each rivalry has a name, a tone, and billing copy in the league voice (crude,
// funny, everyone in on it — about fantasy and about these two, never their real
// lives beyond the relationship itself). The head-to-head record and the notable
// games come from the h2h module (src/routes/h2h.js), so the billing is backed by
// the box score, not just vibes.
//
// Ranking: when more than one fires in a week, the marquee grudge (Dylan–Sam)
// outranks everything, then the love-hate (Bates–Richard), then the rest. The two
// Germans (Marian–David) carry their own easter egg — DIE HERMANNSSCHLACHT — so the
// billing here defers to that treatment rather than duplicating it.

// tone drives the styling + register: 'grudge' (hostile), 'lovehate', 'friendship',
// 'rivalry' (competitive), 'german' (the egg).
const RIVALRIES = [
  {
    key: 'dylan-sam', a: 'Dylan', b: 'Sam', rank: 1, tone: 'grudge',
    name: 'THE GRUDGE',
    tag: 'they actually hate each other',
    blurb: "The one that isn't a bit. These two would trade the whole season for the "
      + "right to talk trash in the group chat for a week. No handshake at the line, "
      + "no 'good game' after — just two men who cannot stand each other, and a scoreboard "
      + "that finally gets to settle it.",
  },
  {
    key: 'bates-richard', a: 'Bates', b: 'Richard', rank: 2, tone: 'lovehate',
    name: 'THE LOVERS’ QUARREL',
    tag: 'a love-hate thing',
    blurb: "They'll be at each other all week and grabbing a beer after. It's not "
      + "hate, it's whatever the thing is where you'd bench your own kicker to beat a "
      + "guy you'd also help move a couch. Billed with love. Settled with points.",
  },
  {
    // The two Germans. The full easter egg (DIE HERMANNSSCHLACHT — the whole matchup
    // screen in German) is its own treatment; this entry supplies the billing + the
    // war-record framing and marks the game so the egg can fire.
    key: 'marian-david', a: 'Marian', b: 'David', rank: 3, tone: 'german',
    name: 'DIE HERMANNSSCHLACHT',
    tag: 'die Schlacht der beiden Deutschen',
    blurb: "Zwei Deutsche, ein Waldstück, drei römische Legionen. Arminius gegen "
      + "Varus, noch einmal, diesmal um den Wochensieg. Der Rest der Liga darf zuschauen.",
    egg: true,
  },
  {
    key: 'sam-jeremy', a: 'Sam', b: 'Jeremy', rank: 4, tone: 'friendship',
    name: 'THE DIVORCE',
    tag: 'inseparable, forced to fight',
    blurb: "These two are a package deal every other week of the year, which is exactly "
      + "what makes this funny: for one week the joint custody is suspended and somebody's "
      + "sleeping on the couch. Nobody wins a game against their best friend. Somebody wins "
      + "this one anyway.",
  },
  {
    key: 'michael-cory', a: 'Michael', b: 'Cory', rank: 5, tone: 'rivalry',
    name: 'THE RECKONING',
    tag: 'a real rivalry',
    blurb: "The commissioner versus the champ. One runs the league, the other keeps "
      + "winning it, and each is quietly sure the other is the reason this whole thing "
      + "is rigged. Points don't lie. Usually.",
  },
  {
    key: 'cory-david', a: 'Cory', b: 'David', rank: 6, tone: 'friendship',
    name: 'THE BROMANCE BOWL',
    tag: 'best friends',
    blurb: "Best friends, which means the loser hears about it until roughly the heat "
      + "death of the universe. No stakes higher than pride, no pride higher than this. "
      + "One of them is going to have a very quiet drive home.",
  },
  {
    key: 'richard-justin', a: 'Richard', b: 'Justin', rank: 7, tone: 'friendship',
    name: 'THE HANDSHAKE',
    tag: 'good friends',
    blurb: "Good friends, a clean fight, and just enough on the line to make Sunday "
      + "interesting. Billed like a friendly — played like it counts, because it does.",
  },
];

// Case-insensitive pair match; order-independent.
function billingFor(nameA, nameB) {
  if (!nameA || !nameB) return null;
  const x = String(nameA).toLowerCase(), y = String(nameB).toLowerCase();
  for (const r of RIVALRIES) {
    const a = r.a.toLowerCase(), b = r.b.toLowerCase();
    if ((x === a && y === b) || (x === b && y === a)) return r;
  }
  return null;
}

// From a live slate — [{ a: name, b: name }] pairings — the rivalry games this week,
// highest-billed first. Used by the home page to crown the Rivalry Game of the Week.
function billingForSlate(pairs) {
  const hits = [];
  for (const p of (pairs || [])) {
    const r = billingFor(p.a, p.b);
    if (r) hits.push(Object.assign({}, r, { pair: p }));
  }
  hits.sort((m, n) => m.rank - n.rank);
  return hits;
}

// Turn an h2h summary (from the h2h module, A-side = first name) into the two or
// three billing facts worth putting under the banner: the record, the closest game,
// the biggest blowout, and whether either has knocked the other out of the playoffs.
function notableFrom(rec, aName, bName) {
  if (!rec || !rec.played) return { record: '0-0', line: 'First meeting. No history — yet.' };
  const winner = g => g.winner === 'a' ? aName : bName;
  const bits = [];
  // closest game
  let closest = null, biggest = null;
  for (const g of rec.games) {
    if (g.winner === 'tie') continue;
    if (!closest || g.margin < closest.margin) closest = g;
    if (!biggest || g.margin > biggest.margin) biggest = g;
  }
  if (closest) bits.push(`closest: ${winner(closest)} by ${closest.margin.toFixed(1)} (${closest.season})`);
  if (biggest && biggest !== closest) bits.push(`worst beating: ${winner(biggest)} by ${biggest.margin.toFixed(1)} (${biggest.season})`);
  if (rec.playoffs) {
    const ko = rec.playoffGames.find(g => !g.final) || rec.playoffGames[0];
    if (ko) bits.push(`${winner(ko)} knocked the other out in the ${ko.season} playoffs`);
  }
  return {
    record: rec.record,
    aWins: rec.a.wins, bWins: rec.b.wins,
    line: bits.join(' · '),
  };
}

module.exports = { RIVALRIES, billingFor, billingForSlate, notableFrom };
