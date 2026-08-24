// TERRITORY: A
/* THE WIRE MAY NOT PRESENT ONE DECISION EIGHT TIMES.
 *
 * Register 294 (🔴🔴). The live waiver page showed Cory eight claims, all eight
 * kickers, six of them below replacement, while the tight-end upgrade sat at
 * rank 34 and never rendered. `net_value` is lineup points gained and he
 * drafted no kicker, so every free kicker filled a zero-scoring slot and booked
 * its whole season projection. The arithmetic was right; the LIST was useless,
 * because he can start one kicker.
 *
 * ⚠️ AND THE FIX THE ROW RECOMMENDED — exclude K and DEF — RENDERS EIGHT TIGHT
 * ENDS on the same board. It is printed at the bottom of the probe that filed
 * the row. So this suite does not test "no kickers"; it tests the structural
 * property that survives whatever roster he holds in week 9:
 *
 *     A POSITION MAY OCCUPY AT MOST AS MANY ROWS AS IT HAS STARTABLE SEATS.
 *
 * ── WHY IT LIVES HERE AND NOT ONLY IN THE FIX ──────────────────────────────
 *
 * Register 300's finding, in one line: the mechanism is what survives, the
 * human noticing is what does not. This defect went out on a LIVE surface and
 * was found by a person reading a page, three days after register 277 sent Cory
 * a recommendation to drop Ja'Marr Chase for the same reason — an instruction
 * emitted by a surface with no instrument watching it. A one-line filter fixes
 * today's page. This is what fails the next one.
 *
 * ── THE CONTROLS ARE THE POINT (Rule 3e / GRADING-POLICY §3) ───────────────
 *
 * An assertion that "no position exceeds its cap" passes trivially on an empty
 * list, on a one-row list, and on any list from a roster with no holes. This
 * file therefore proves, on the REAL committed board and Cory's REAL drafted
 * roster, that the unfixed code DOES trip the bar — 8 of 8 at one position —
 * before asserting the fixed code does not.
 *
 * Run: node draft/tests/waiver_claims_are_distinct_decisions.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RECO = require(path.join(ROOT, 'src', 'waiver_reco.js'));
const W = require(path.join(ROOT, 'src', 'routes', 'waivers.js'));
const LO = require(path.join(ROOT, 'src', 'routes', 'lineup.js'));

const DATA = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const CFG = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
const LOG = fs.readFileSync(
  path.join(ROOT, 'draft', 'data', 'draft_pick_log_2026.jsonl'), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

let pass = 0, fail = 0;
const ck = (n, c, d) => {
  if (c) { pass++; console.log('PASS  ' + n); }
  else {
    fail++;
    console.log('FAIL  ' + n + (d !== undefined
      ? '  — ' + String(JSON.stringify(d)).slice(0, 400) : ''));
  }
};

/* ── THE REAL INPUTS ────────────────────────────────────────────────────────
 * Cory's actual drafted roster off the committed pick log, at the seat named by
 * config — never typed, because `is_mine` is false on all 150 rows (register
 * 264) and `team_slot` is the working field. */
const MY_SLOT = Number(CFG.my_draft_slot);
const avail = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const byId = {};
avail.concat(DATA.kept_players || []).forEach(p => { byId[String(p.player_id)] = p; });
const taken = new Set(LOG.map(r => String(r.player_id)));
const enrich = p => ({ player_id: String(p.player_id), name: p.name,
  position: p.position, proj_mean: p.proj_mean, bye: p.bye, vorp: p.vorp || 0 });
const roster = LOG.filter(r => Number(r.team_slot) === MY_SLOT)
  .map(r => byId[String(r.player_id)]).filter(Boolean).map(enrich);
const freeAgents = avail.filter(p => !taken.has(String(p.player_id))).map(enrich);

const league = { teams: 10, starters: CFG.starters };
const typical = LO.typicalTeamScore();
const ranked = W.evaluateClaims(freeAgents, roster, league, {
  band: LO.weeklyHighBand(), lineupMean: typical.median, lineupSd: typical.sd,
  oppMean: typical.median, leagueRosters: {},
}).claims.filter(c => c.net_value > 0);

const shapeOf = rows => {
  const m = {};
  rows.forEach(c => { m[c.position] = (m[c.position] || 0) + 1; });
  return m;
};
const worst = rows => Math.max(0, ...Object.values(shapeOf(rows)));

// ── CONTROLS ───────────────────────────────────────────────────────────────
ck('CONTROL — the league declares a starter template, or every cap below is '
  + 'derived from nothing', CFG.starters && Object.keys(CFG.starters).length > 0,
CFG.starters);
ck('CONTROL — Cory\'s roster assembled from the pick log at his seat is a real '
  + 'roster, not an empty one: an empty roster makes EVERY position look open '
  + 'and the flood would be correct behaviour',
roster.length > 10, { roster: roster.length, shape: shapeOf(roster) });
ck('CONTROL — the wire produced a ranking long enough for a flood to be '
  + 'possible at all', ranked.length >= 8, { ranked: ranked.length });

/* ── THE KNOWN POSITIVE: the bar must be able to go red on real data ────────
 * Rule 3e — a gate that has never returned a positive has not been tested, only
 * run. The UNCAPPED list is the code as it shipped on 2026-08-24. */
const unfixed = ranked.slice(0, 8);
ck('KNOWN POSITIVE — the code as it shipped DOES trip this bar on the real '
  + 'board: one position occupies more rows than it has startable seats. If '
  + 'this ever passes, the bar has stopped measuring anything.',
worst(unfixed) > Math.max(...Object.values(RECO.startableSlotCaps(CFG.starters))),
{ shipped_shape: shapeOf(unfixed), caps: RECO.startableSlotCaps(CFG.starters) });

/* ── AND SO DOES THE FIX THE REGISTER RECOMMENDED ───────────────────────────
 * Kept as a live assertion rather than a comment: it is the reason the rule is
 * structural, and if the board ever changes so that excluding K/DEF WOULD have
 * been sufficient, this failing tells us the justification has expired. */
{
  const excludeKD = ranked.filter(c => c.position !== 'K' && c.position !== 'DEF')
    .slice(0, 8);
  const caps = RECO.startableSlotCaps(CFG.starters);
  ck('KNOWN POSITIVE #2 — "exclude K and DEF" ALSO trips the bar on this board, '
    + 'which is why the shipped rule is a per-position cap and not a position '
    + 'blacklist', worst(excludeKD) > (caps[Object.keys(shapeOf(excludeKD))[0]] || 1),
  { shape: shapeOf(excludeKD), caps: caps });
}

// ── THE PROPERTY, ON THE SHIPPED PATH ──────────────────────────────────────
{
  const capped = RECO.capPerPosition(ranked, CFG.starters, 8);
  const caps = RECO.startableSlotCaps(CFG.starters);
  const over = Object.entries(shapeOf(capped))
    .filter(([pos, n]) => n > (caps[pos] == null ? 1 : caps[pos]));
  ck('no position occupies more rows than it has startable seats — the '
    + 'structural property, on Cory\'s real roster and the committed board',
  over.length === 0, { over: over, shape: shapeOf(capped), caps: caps });

  ck('the list still leads with the largest honest gain rather than hiding it: '
    + 'capping removes RESTATEMENTS, it does not reorder or suppress',
  capped.length > 0 && capped[0].player_id === ranked[0].player_id,
  { capped_top: capped[0] && capped[0].name, ranked_top: ranked[0].name });

  ck('and it surfaces more than one KIND of decision, which is the outcome the '
    + 'register was filed about', Object.keys(shapeOf(capped)).length >= 2,
  shapeOf(capped));

  console.log('      shipped list: ' + capped.map(c =>
    c.position + ' ' + c.name + ' (' + Number(c.net_value).toFixed(1) + ')').join(' · '));
}

/* ── THE CAP IS A REFINEMENT, NOT A DIFFERENT COMPUTATION ───────────────────
 * The strongest single check in this file. Hand the rule an unbounded template
 * and it must return the OLD list byte-for-byte — that is what proves the fix
 * changed the presentation and nothing about the valuation. */
{
  const unbounded = { QB: 99, RB: 99, WR: 99, TE: 99, K: 99, DEF: 99, FLEX: 0 };
  const same = RECO.capPerPosition(ranked, unbounded, 8);
  ck('KNOWN NEGATIVE — with an unbounded template the rule reproduces the '
    + 'pre-fix list EXACTLY, so it is a refinement of the ranking and not a '
    + 'replacement for it',
  JSON.stringify(same.map(c => c.player_id))
    === JSON.stringify(unfixed.map(c => c.player_id)),
  { got: same.map(c => c.name), want: unfixed.map(c => c.name) });
}

// ── THE CAP ARITHMETIC ITSELF, on the league's own template ────────────────
{
  const caps = RECO.startableSlotCaps(CFG.starters);
  ck('a FLEX-eligible position carries the flex seat (RB 2+1, WR 2+1, TE 1+1) '
    + 'because a third RB genuinely has a seat to fill',
  caps.RB === 3 && caps.WR === 3 && caps.TE === 2, caps);
  ck('...and a position that cannot fill FLEX does not (QB 1, K 1, DEF 1) — '
    + 'this is the bound that stops the flood',
  caps.QB === 1 && caps.K === 1 && caps.DEF === 1, caps);
  ck('FLEX is not itself a claimable position', caps.FLEX === undefined, caps);
  const zeroed = RECO.startableSlotCaps({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 });
  ck('a position the template does not seat still shows its best claim rather '
    + 'than vanishing — a cap of zero would be a suppression and this is not one',
  RECO.capPerPosition([{ position: 'K', player_id: 'k1' },
    { position: 'K', player_id: 'k2' }], { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 }, 8)
    .length === 1, zeroed);
}

/* ── THE STREAM BLOCK, WHICH HAD THE SAME DEFECT ────────────────────────────
 * Rule 3g follow-up on 294, not a second discovery. `.slice(0, 2)` on a K/DEF
 * POOL renders the best two of whichever position is inflated — on Cory's
 * roster, TWO KICKERS. The block meant to hold his kicker decision and his
 * defense decision held the kicker decision twice. */
{
  const kd = ranked.filter(c => c.position === 'K' || c.position === 'DEF');
  const shipped = kd.slice(0, 2);
  ck('KNOWN POSITIVE — the stream block as it shipped put the SAME position in '
    + 'both of its two rows on the real board',
  shipped.length === 2 && shipped[0].position === shipped[1].position,
  shipped.map(c => c.position + ' ' + c.name));

  const capped = RECO.capPerPosition(kd, CFG.starters, 2);
  ck('...and the cap leaves at most one of each, which is how many of each he '
    + 'can field', new Set(capped.map(c => c.position)).size === capped.length,
  capped.map(c => c.position + ' ' + c.name));

  /* ⚠️ THE CONTROL THAT STOPS THE OBVIOUS WRONG FIX. It would be natural to
   * make this a "one K and one DEF" rule. On today's board that would INVENT a
   * decision: no defense clears the bar at all, because his rostered DEF beats
   * every free one. An absent row is the correct answer and the cap must be
   * able to return one. */
  const defs = ranked.filter(c => c.position === 'DEF');
  ck('CONTROL — zero DEF claims clear net_value > 0 today, so a ONE-ROW stream '
    + 'block is correct and a rule forcing one of each position would fabricate '
    + 'a decision he does not have', defs.length === 0
    && capped.every(c => c.position === 'K'),
  { def_claims: defs.length, capped: capped.map(c => c.position) });

  /* And the fixed path must still be a pure refinement here too. */
  ck('KNOWN NEGATIVE — an unbounded template reproduces the old two-row stream '
    + 'block exactly',
  JSON.stringify(RECO.capPerPosition(kd,
    { QB: 99, RB: 99, WR: 99, TE: 99, K: 99, DEF: 99, FLEX: 0 }, 2)
    .map(c => c.player_id)) === JSON.stringify(shipped.map(c => c.player_id)));
}

/* ── THE TWO SURFACES THE SWEEP CLEARED, ASSERTED RATHER THAN REMEMBERED ────
 * A sweep is a person remembering. These two rank-and-truncate the same way and
 * were checked and found IMMUNE BY CONSTRUCTION; that immunity is a property of
 * their code and can be lost by an edit, so it is pinned here.
 *
 *   blockWatch  — builds `byPos[pos].sort(...)[0]`, exactly one per position.
 *   sundayAlert — `calls`/`changes` are optimizer swaps, and a swap set has one
 *                 entry per SLOT, so it is already bounded by the template.
 *
 * Checked structurally, on source, because instantiating the live Sleeper
 * bundle here would make this suite need the network. */
{
  const src = fs.readFileSync(path.join(ROOT, 'src', 'waiver_reco.js'), 'utf8');
  ck('blockWatch still takes exactly ONE player per position — if this becomes '
    + 'a pooled ranking it inherits register 294 and this line is the warning',
  /byPos\[pos\][\s\S]{0,80}\[0\]/.test(src), 'byPos[pos]...[0] not found');

  const lo = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'lineup.js'), 'utf8');
  ck('the Sunday alert still derives its rows from optimizer SWAPS (result.calls '
    + '/ set.changes) rather than from a free-agent pool — a swap set is bounded '
    + 'by slots, which is what makes it immune',
  /result\.calls/.test(lo) && /set\.changes/.test(lo));
}

// ── FAIL ARM: the checker must be able to fail ─────────────────────────────
{
  const flood = Array.from({ length: 8 }, (_, i) =>
    ({ position: 'K', player_id: 'flood' + i, name: 'K' + i, net_value: 100 - i }));
  const capped = RECO.capPerPosition(flood, CFG.starters, 8);
  ck('FAIL ARM — a synthetic eight-kicker flood is cut to one, so the rule is '
    + 'load-bearing rather than passing because the input was already clean',
  capped.length === 1 && capped[0].player_id === 'flood0',
  capped.map(c => c.player_id));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('FAILED'); process.exit(1); }
