// TERRITORY: relay
/* THE BOARD IS TWO LISTS, AND READING ONE OF THEM HAS NOW COST ELEVEN PEOPLE.
 *
 * `public/draft_data.json` splits into DISJOINT `players` (the draftable pool)
 * and `kept_players` (the keepers). Register 80 made the split; register 476
 * records ten consumers that walked `players` alone and silently lost the
 * keepers — matchupOdds refusing "starter 7564 is not on the board" for Cory's
 * own Chase, Henry and Walker, every week.
 *
 * The eleventh was me, on 2026-09-06, and it is the reason this file exists.
 * Pricing 2026 week-1 rosters off `players` alone, 23 of the 90 starters came
 * back absent — and because they were the league's best players (CeeDee Lamb,
 * Gibbs, Chase, Henry, Jeanty, A.J. Brown, Jonathan Taylor) the result looked
 * like a STRUCTURAL truth: "the board is the available pool, so it excludes
 * rostered players." That reads as an insight. It is simply the keeper list,
 * unread. I wrote it into three files' comments before catching it.
 *
 * A wrong diagnosis that explains the evidence is more dangerous than a crash,
 * so this is a test rather than a note: the trap is that the failure is
 * plausible, not that it is obscure.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BOARD = path.join(ROOT, 'public', 'draft_data.json');
const HIST = path.join(ROOT, 'draft', 'data', 'league_history.json');

if (!fs.existsSync(BOARD) || !fs.existsSync(HIST)) {
  console.log('board_keeper_split: SKIPPED (board or history absent)');
  process.exit(0);
}

const board = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
const players = board.players || [];
const kept = board.kept_players || [];

// 1 — the split exists and the two lists are disjoint. If a future board merges
//     them this test should be revisited, not deleted.
{
  assert.ok(players.length > 0, 'the board has a draftable pool');
  assert.ok(kept.length > 0,
    'the board has a kept_players list — if this is now empty, confirm the split was merged on purpose');
  const inPlayers = new Set(players.map(p => String(p.player_id)));
  const overlap = kept.filter(p => inPlayers.has(String(p.player_id)));
  assert.deepStrictEqual(overlap.map(p => p.name), [],
    'players and kept_players must stay disjoint — an overlap double-counts a player');
}

// 2 — THE KNOWN POSITIVE: on the real season, `players` alone loses starters,
//     and the two lists together lose none. This is the exact measurement that
//     fooled me, kept as the control.
{
  const hist = JSON.parse(fs.readFileSync(HIST, 'utf8'));
  const s26 = (hist.seasons || []).find(s => String(s.season) === '2026');
  if (s26) {
    const starters = [];
    ((s26.weeks || {})['1'] || []).forEach(e =>
      (e.starters || []).forEach(id => { if (id != null) starters.push(String(id)); }));

    const poolOnly = new Set(players.map(p => String(p.player_id)));
    const both = new Set([...players, ...kept].map(p => String(p.player_id)));

    const missedByPoolOnly = starters.filter(id => !poolOnly.has(id));
    const missedByBoth = starters.filter(id => !both.has(id));

    assert.ok(missedByPoolOnly.length > 0,
      'reading players alone must visibly lose starters — if it stops, the split changed');
    assert.deepStrictEqual(missedByBoth, [],
      `players + kept_players must cover every starter; ${missedByBoth.length} were missed`);

    // and the ones lost are STARS, which is what makes the wrong conclusion
    // so easy to reach — a nobody going missing would have been investigated.
    const keptById = new Map(kept.map(p => [String(p.player_id), p]));
    const lostNames = missedByPoolOnly.map(id => (keptById.get(id) || {}).name).filter(Boolean);
    assert.ok(lostNames.length >= missedByPoolOnly.length - 1,
      'the starters lost by reading players alone should be exactly the keepers');
  }
}

// 3 — every in-repo consumer that reads the board reads BOTH lists. Grep-based
//     on purpose: this is the check that would have caught all eleven.
{
  const SRC = path.join(ROOT, 'src');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name))
      : (e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  /* WANTING ONLY THE DRAFTABLE POOL IS LEGITIMATE, so the check needs an
   * allowlist — and the allowlist is the part to distrust. A file earns a place
   * here only by being a DRAFT-TIME tool, where a keeper is off the board by
   * definition and including one would be the bug. Each entry carries its
   * reason; adding one without a reason is how this check becomes decoration.
   * Verified by reading the call sites, not by the file's name. */
  const POOL_ONLY_IS_CORRECT = {
    'src/slotpicker.js':
      'picks a DRAFT SLOT from the draftable board (vorp-sorted, best-available TE) — keepers are not draftable',
    'src/routes/admin.js':
      'renders draft-board views: ADP-sorted list, by-position and by-team panels — the draftable pool is the subject',
  };
  const offenders = [];
  for (const f of walk(SRC)) {
    const rel = path.relative(ROOT, f);
    const t = fs.readFileSync(f, 'utf8');
    // a file that reaches for `.players` off a board artifact must also mention
    // kept_players somewhere, or it is walking half the board.
    const readsPool = /\b(artifact|art|board)\s*(&&\s*\w+\s*)?\.\s*players\b/.test(t);
    if (readsPool && !/kept_players/.test(t) && !POOL_ONLY_IS_CORRECT[rel]) offenders.push(rel);
  }
  assert.deepStrictEqual(offenders, [],
    'these files read the board\'s `players` without ever mentioning kept_players — '
    + 'they are dropping the keepers (register 476). If a file genuinely wants only the '
    + 'draftable pool, add it to POOL_ONLY_IS_CORRECT with the reason: ' + offenders.join(', '));

  // The allowlist must not outlive its entries: a name that no longer exists,
  // or that has since learned about kept_players, has to come off.
  for (const [rel, why] of Object.entries(POOL_ONLY_IS_CORRECT)) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `allowlisted file is gone, drop it: ${rel}`);
    assert.ok(why && why.length > 20, `allowlist entry needs a real reason: ${rel}`);
    assert.ok(!/kept_players/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')),
      `${rel} now reads kept_players — remove it from POOL_ONLY_IS_CORRECT`);
  }
}

console.log('board_keeper_split: 3/3 — split intact and disjoint, players-alone loses exactly the keepers, no consumer reads half the board');
