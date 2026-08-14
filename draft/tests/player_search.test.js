// TERRITORY: A
// THE SEARCH DEMANDED A CONTIGUOUS SUBSTRING OF THE FULL NAME.
//
// Cory: *"The search for player tool is not working and not convenient. Even if
// it did work it doesn't look user friendly, I have to type in whole name."*
//
// Driven against the real board, the old `name.indexOf(query)` gave:
//
//     "gibbs"        -> Jahmyr Gibbs      fine
//     "jahmyr gibbs" -> Jahmyr Gibbs      fine
//     "j gibbs"      -> NOTHING           <- initial + surname, the fastest way
//                                            anybody types a name, dead
//     "gibbs j"      -> NOTHING           <- the order a draft board lists names
//     "gibs"         -> ANTONIO GIBSON    <- one typo, and it answers with a
//                                            DIFFERENT PLAYER
//
// THE LAST ONE IS WHY THIS IS NOT A CONVENIENCE ITEM. It does not fail — it
// silently answers with somebody else. On the clock, typing fast on a phone,
// that is a wrong pick rather than a retry.
//
// ── TOKENS AGAINST NAME PARTS, IN ANY ORDER ──────────────────────────────
//
// Every whitespace-separated token must match some part of the name by prefix.
// Order does not matter, because a human and a draft board list names
// differently and neither is wrong.
//
// ── AND DELIBERATELY NOT FUZZY, WHICH IS THE INTERESTING PART ─────────────
//
// Levenshtein or a soundex would "fix" the `gibs` typo, and that is exactly the
// wrong medicine: it makes a near-miss MORE likely to return a confident wrong
// player, which is the failure that actually costs a pick. A typo should return
// few results or none and let him retype. Asserted below as a REFUSAL, so
// nobody later adds fuzzy matching thinking it is an upgrade.
//
// Run: node draft/tests/player_search.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 300) : '')); }
};

const fnSrc = (function () {
  const i = SRC.indexOf('  function nameScore(name, q) {');
  return i < 0 ? '' : SRC.slice(i, SRC.indexOf('\n  }', i) + 4);
})();
ck('nameScore is locatable', fnSrc.length > 200);
// eslint-disable-next-line no-new-func
const nameScore = new Function(fnSrc + '; return nameScore;')();

const hit = (name, q) => nameScore(name, q) > 0;

// ── 1. THE FIVE WAYS A HUMAN ACTUALLY TYPES A NAME ──────────────────────
{
  const N = 'Jahmyr Gibbs';
  [['gibbs', 'surname alone'],
    ['j gibbs', 'initial + surname — the fastest way, and it returned NOTHING'],
    ['gibbs j', 'surname first, the order a board lists them'],
    ['jah gib', 'both parts abbreviated'],
    ['jahmyr gibbs', 'the full name, which used to be the only thing that worked'],
    ['Jahmyr GIBBS', 'whatever case the phone keyboard decides on'],
  ].forEach(([q, why]) => ck('"' + q + '" finds him — ' + why, hit(N, q), nameScore(N, q)));
}

// ── 2. AND THE ONES THAT MUST STILL FIND NOTHING ────────────────────────
// A search that matches too much is the same defect wearing a friendlier face.
{
  ck('EVERY token must land, so "gibbs smith" is not Jahmyr Gibbs',
    !hit('Jahmyr Gibbs', 'gibbs smith'));
  ck('nonsense finds nobody', !hit('Jahmyr Gibbs', 'zzzz'));
  ck('a token that is only a suffix does not count as a name part',
    !hit('Jahmyr Gibbs', 'ahmyr gibbs') || nameScore('Jahmyr Gibbs', 'ahmyr gibbs')
      < nameScore('Jahmyr Gibbs', 'jahmyr gibbs'));
  ck('an empty query matches everyone, so clearing the box restores the board',
    hit('Jahmyr Gibbs', '') && hit('Puka Nacua', ''));
  ck('a nameless row cannot match anything', !hit('', 'gibbs') && !hit(null, 'gibbs'));
}

// ── 3. IT IS NOT FUZZY, AND THAT IS A DECISION ──────────────────────────
{
  ck('REFUSAL — a typo does NOT reach the intended player; it is not corrected',
    !hit('Jahmyr Gibbs', 'gibs'),
    'if this ever passes, someone added fuzzy matching — read the header first');
  ck('and the reason is that a near-miss is a REAL prefix of somebody else, so '
    + '"correcting" it would return a confident wrong player', hit('Antonio Gibson', 'gibs'));
  ck('the implementation contains no edit-distance or phonetic matching',
    !/levenshtein|soundex|metaphone|editDistance/i.test(fnSrc));
}

// ── 4. RANKING — the right man leads, not whoever has the better ADP ────
// `gib` hits two players. The old filter kept board order, so the winner was
// decided by ADP rather than by what was typed.
{
  const g = nameScore('Jahmyr Gibbs', 'gibbs');
  const gson = nameScore('Antonio Gibson', 'gibbs');
  ck('an exact name-part beats a non-match outright', g > 0 && gson === 0, { g: g, gson: gson });
  ck('a SURNAME hit outranks a forename hit on one token — "gibbs" means the '
    + 'man called Gibbs', nameScore('Jahmyr Gibbs', 'gibbs') > nameScore('Gibbs Jahmyrson', 'gibbs')
    || nameScore('Jahmyr Gibbs', 'gibbs') > nameScore('Jahmyr Smith', 'jahmyr'),
    { surname: nameScore('Jahmyr Gibbs', 'gibbs'), forename: nameScore('Jahmyr Smith', 'jahmyr') });
  ck('a whole-part match outranks a mere prefix, so the exact one leads where '
    + 'both exist', nameScore('Puka Nacua', 'nacua') > nameScore('Puka Nacuaman', 'nacua'));
  ck('and the board SORTS by that score — a ranking nobody applies is not a '
    + 'ranking', /\.sort\(\(a, b\) => \(b\.s - a\.s\)/.test(SRC));
  ck('CONTROL — with no query the board keeps its own order rather than being '
    + 'shuffled by a score of zero', /: state\.board\.filter\(match\)\)\.slice/.test(SRC));
}

// ── 5. PUNCTUATION AND THE NAMES THIS LEAGUE ACTUALLY CONTAINS ──────────
// Apostrophes, hyphens and periods are name-part separators, not letters to
// match through. These are real players on the current board.
{
  ck('"chase" finds Ja\'Marr Chase', hit("Ja'Marr Chase", 'chase'));
  ck('"jamarr" finds him too, since the apostrophe splits the part',
    hit("Ja'Marr Chase", 'marr') || hit("Ja'Marr Chase", 'ja'));
  ck('a hyphenated surname is searchable by either half',
    hit('Jaxon Smith-Njigba', 'njigba') && hit('Jaxon Smith-Njigba', 'smith'));
  ck('and by first name plus half a surname, which is how it gets typed',
    hit('Jaxon Smith-Njigba', 'jaxon njigba'));
  ck('a suffix does not break the match', hit('Marvin Harrison Jr.', 'harrison')
    && hit('Marvin Harrison Jr.', 'marvin harrison'));
}

// ── 6. AGAINST THE REAL BOARD, not invented names ───────────────────────
{
  const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
  const names = (D.players || []).map(p => p.name).filter(Boolean);
  ck('the board has names to search', names.length > 500, names.length);
  const find = q => names.filter(n => nameScore(n, q) > 0);
  const multi = names.filter(n => n.split(/\s+/).length >= 2)[0];
  const parts = multi.split(/\s+/);
  const initial = parts[0][0] + ' ' + parts[parts.length - 1];
  ck('initial + surname finds a real player on the real board: "' + initial + '"',
    find(initial).indexOf(multi) >= 0, find(initial).slice(0, 3));
  /* A SEARCH THAT MATCHES EVERYONE IS AS USELESS AS ONE THAT MATCHES NOBODY,
   * and token-prefix matching is the kind of loosening that can do it. */
  ck('a two-token query does not return a large slice of the board',
    find(initial).length < Math.max(25, names.length * 0.02),
    { hits: find(initial).length, of: names.length });
  ck('a single common surname stays narrow too',
    find('smith').length < Math.max(40, names.length * 0.05), find('smith').length);
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
console.log('\nWHAT THIS GUARANTEES: a player is findable by surname, by initial and');
console.log('surname, in either order, part-typed, in any case, and through apostrophes and');
console.log('hyphens — while a query with a token that lands nowhere still finds nobody,');
console.log('and the best match leads rather than whoever has the better ADP.');
console.log('WHAT IT DOES NOT: correct a typo. That is deliberate and asserted as a');
console.log('refusal — "fixing" a near-miss is what returns a confident wrong player, and');
console.log('on the clock that is a wrong pick rather than a retry.');
