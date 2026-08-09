'use strict';
//
// THE CROWN — who is the defending champion, derived from the champions roll, and
// how many titles each owner holds. Never hand-set: the roll is built from the
// season results, so when the new champion is decided in January this changes on
// its own and the crown transfers without anyone touching a file.
//
// "Defending champion" = the champion of the latest COMPLETE season. A season only
// enters the roll once it has a champion, so the max year in the roll is it. A
// co-championship (2022) yields two holders — both wear the crown that year.
//
// League-visible: this is the record of what happened, not analysis, so it belongs
// to everyone. Consumed by a res.locals middleware (member router) that lights the
// crown next to a name on every league-visible surface — and, by living only on
// the member router, never in the war room.

const HIST = require('./routes/history-data');

function roll() {
  try { return HIST.build().champions || []; } catch (e) { return []; }
}

// Split "Marian/Sam" (a co-championship) into the individual holders.
function holders(champ) {
  return String(champ || '').split('/').map(s => s.trim()).filter(Boolean);
}

// The latest completed season's row (max year), computed rather than assuming the
// roll is sorted.
function latestComplete(r) {
  return (r || roll()).reduce((best, c) => (!best || c.year > best.year ? c : best), null);
}

// The name(s) currently wearing the crown.
function defendingChampions(r) {
  const last = latestComplete(r);
  return last ? holders(last.champion) : [];
}

function isDefending(name, r) {
  return !!name && defendingChampions(r).includes(name);
}

// name -> { clean, disputed, total }. The disputed one is 2022's asterisked co-
// championship, kept separate so the dynasty badge reads "three plus the disputed
// one" (Marian) rather than a flat, wrong "four". A co-championship counts for each
// holder.
function titleCounts(r) {
  const counts = {};
  for (const c of (r || roll())) {
    for (const name of holders(c.champion)) {
      const t = counts[name] || (counts[name] = { clean: 0, disputed: 0, total: 0 });
      if (c.asterisk) t.disputed++; else t.clean++;
      t.total++;
    }
  }
  return counts;
}

// The year the current crown was won (for the tooltip / flourish).
function reigningYear(r) {
  const last = latestComplete(r);
  return last ? last.year : null;
}

module.exports = { defendingChampions, isDefending, titleCounts, latestComplete, reigningYear, holders, roll };
