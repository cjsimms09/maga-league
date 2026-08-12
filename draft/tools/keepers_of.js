/* ONE KEEPER LOOKUP, BECAUSE FOUR TOOLS HAD FOUR.
 *
 * Cory's keepers are NOT in draft_data.json's `players` array. They are in
 * `kept_players`, which is disjoint from it — the same fact that made
 * draft_session.js restore an empty keeper set until its test caught it.
 *
 * boundary_walk.js looked them up in `players` alone and ended with
 * `.filter(Boolean)`, so it found ZERO keepers and RAN ANYWAY, on an empty
 * roster, and I reported findings from it. cfg_sensitivity.js and
 * lab_term_degeneracy.js had the fallback and a count check. tripwire_-
 * calibrate.js had the count check and no fallback, so it failed loudly — which
 * is how the whole thing surfaced.
 *
 * FOUR COPIES, THREE BEHAVIOURS, AND THE ONE THAT WAS SILENT IS THE ONE THAT
 * PRODUCED A REPORT. So there is one copy now, and it CANNOT return a short
 * list: a partial match throws, because an empty roster is not a smaller
 * experiment, it is a different one — stack, keeper value and the entire bench
 * branch are functions of the roster.
 *
 * Run nothing; require it.
 */
'use strict';

const CORY_KEEPERS = ["Ja'Marr Chase", 'Derrick Henry', 'Kenneth Walker'];

/* `alsoLookIn` names the second array explicitly rather than searching every
 * key, so a future board that renames `kept_players` fails here with a message
 * instead of silently finding nobody. */
function keepersFrom(data, names) {
  const want = names || CORY_KEEPERS;
  const pools = [
    ['players', (data && data.players) || []],
    ['kept_players', (data && data.kept_players) || []],
  ];
  const found = [];
  const missing = [];
  want.forEach(n => {
    let hit = null, from = null;
    for (const [label, arr] of pools) {
      hit = arr.find(p => p && p.name === n);
      if (hit) { from = label; break; }
    }
    if (hit) found.push(Object.assign({}, hit, { _keeper_source: from }));
    else missing.push(n);
  });
  if (missing.length) {
    throw new Error(
      'keepersFrom: ' + missing.length + ' of ' + want.length + ' keepers not found '
      + '(' + missing.join(', ') + '). Searched players[' + pools[0][1].length + '] '
      + 'and kept_players[' + pools[1][1].length + ']. REFUSING TO RETURN A SHORT '
      + 'LIST: an empty or partial roster is not a smaller experiment, it is a '
      + 'different one — stack, keeper value and the whole bench branch are '
      + 'functions of the roster.');
  }
  return found;
}

module.exports = { keepersFrom, CORY_KEEPERS };
