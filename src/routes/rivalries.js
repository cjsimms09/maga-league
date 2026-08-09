// ─────────────────────────────────────────────────────────────────────────────
// NAMED RIVALRIES — the games that get billed. Declared (Cory named them), by
// owner NAME so they survive id/roster churn. A game is a rivalry if its two
// owners match a pair here, either order.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const NAMED = [
  { a: 'David',  b: 'Marian',  label: 'The German Derby',  emoji: '🇩🇪', note: 'Back-to-back world war champs, one trophy.' },
  { a: 'Dylan',  b: 'Sam',     label: 'Dylan v. Sam',      emoji: '⚔️', note: 'The one they both circle on the schedule.' },
  { a: 'Bates',  b: 'Richard', label: 'Bates v. Richard',  emoji: '⚔️', note: 'Bad blood, long memory.' },
];

/** The rivalry billing for a game between two owner names, or null. */
function rivalryFor(nameA, nameB) {
  const a = String(nameA || '').toLowerCase(), b = String(nameB || '').toLowerCase();
  return NAMED.find(r =>
    (r.a.toLowerCase() === a && r.b.toLowerCase() === b) ||
    (r.a.toLowerCase() === b && r.b.toLowerCase() === a)) || null;
}

module.exports = { NAMED, rivalryFor };
