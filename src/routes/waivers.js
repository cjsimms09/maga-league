/* THE WAIVER TOOL (tool 2, SYSTEM-BUILD-PLAN #2). The largest gap in the system.
 *
 * A waiver claim is the SAME decision as a late-round draft pick against a
 * different pool, so it prices players through the SAME shared valuation the draft
 * uses (contract C1) — if the draft and the waiver tool ever value the same player
 * differently, that is a bug. Each week it answers:
 *   - who to CLAIM (the free agents that add the most startable capacity),
 *   - who to DROP (my least valuable rosterable player),
 *   - what the claim is WORTH (in startable points AND in dollars, via the same
 *     lineup machinery — a claim that upgrades my weekly lineup raises P(win) and
 *     P(clear the weekly high), and those convert to money at the SAME $110/$100
 *     the lineup tool uses),
 *   - and WHO ELSE will claim him (which teams are short at his position — read
 *     from the roster analyzer, so I know whether to spend waiver priority).
 *
 * CONSENSUS ALONGSIDE DOLLARS (C3): every claim carries the raw consensus
 * projection next to its dollar figure, clearly labelled, so a claim the machinery
 * loves but the projection doesn't is visible as exactly that.
 *
 * PREDICT + GRADE (C4): each recommendation records what it expects — the claim's
 * point value and whether someone else claims the player — for the weekly grader.
 *
 * Pure functions over (freeAgents, myRoster, league, ctx). Live wiring (Sleeper
 * FA pool + rosters) is the caller's job; these are testable in isolation.
 */
'use strict';
const path = require('path');
const V = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'valuation.js'));
const LO = require(path.join(__dirname, '..', '..', 'src', 'routes', 'lineup.js'));

// The dollar value of ONE marginal projected point added to my starting lineup,
// via the SAME model the lineup tool uses: it nudges P(win) (worth matchupValue)
// and P(clear the weekly high) (worth $100). Priced at the margin around my
// current lineup mean, so it is the local exchange rate points->dollars.
function dollarsPerPoint(ctx) {
  const matchupValue = ctx.matchupValue == null ? 110 : Number(ctx.matchupValue);   // C2: playoff equity, not a side bet
  const weeklyHigh = ctx.weeklyHigh == null ? 100 : Number(ctx.weeklyHigh);
  const mean = Number(ctx.lineupMean || 120);
  const sd = Number(ctx.lineupSd || 24);
  const oppMean = Number(ctx.oppMean || mean);
  const oppSd = Number(ctx.oppSd || 24);
  const band = (ctx.band && ctx.band.samples) || (LO.weeklyHighBand().samples) || [];
  const eps = 1.0;
  const winBase = LO.pWin(mean, sd * sd, oppMean, oppSd * oppSd);
  const winUp = LO.pWin(mean + eps, sd * sd, oppMean, oppSd * oppSd);
  const highBase = LO.pClearHigh(mean, sd * sd, band);
  const highUp = LO.pClearHigh(mean + eps, sd * sd, band);
  const dWin = (winUp - winBase) / eps, dHigh = (highUp - highBase) / eps;
  return { perPoint: dWin * matchupValue + dHigh * weeklyHigh, dWin, dHigh, matchupValue, weeklyHigh };
}

/* The drop candidate: my least valuable player who is NOT a locked starter — the
 * body a claim would replace. Bench pieces first, by startable value ascending. */
function dropCandidate(roster, league) {
  const scored = (roster || []).map(p => ({ player: p, sv: V.startableValue(p, roster, league) }));
  // Never suggest dropping a player who fills a starter/flex slot when a bench body
  // exists to drop instead.
  const bench = scored.filter(s => s.sv.fills === 'bench');
  const pool = bench.length ? bench : scored;
  pool.sort((a, b) => a.sv.value - b.sv.value);
  return pool.length ? pool[0] : null;
}

/* Consensus projection for a player — now DELEGATED to the ONE shared C3
 * derivation (`public/js/draft/consensus.js`), so the wire and the draft board
 * cannot label the same player differently.
 *
 * This used to be a second, local implementation. It returned the same VALUE but
 * a dishonest LABEL: with only Sleeper wired it still said "raw consensus", the
 * exact small-lie-in-the-sanity-check the shared module's honest-labelling rule
 * exists to prevent (>=2 sources -> "Consensus (N src)"; 1 -> "<Source> proj").
 * Second derivations of one quantity are the disease we keep finding; this is one
 * fewer. Shape is preserved for existing callers (value/sources/label), with
 * `sources` kept NUMERIC here (the shared module returns the source names).
 */
const SharedConsensus = require('../../public/js/draft/consensus.js');

function consensusProjection(player, provenance) {
  const r = SharedConsensus.rawProjection(player, provenance);
  return {
    value: r.value,
    sources: (r.sources || []).length,
    label: r.value == null ? 'no projection' : r.label,
    isConsensus: !!r.isConsensus,
  };
}

/* WHAT THE OPTIMAL STARTING LINEUP PROJECTS, for a given roster.
 *
 * The unit `net_value` and `dollars` are supposed to be expressed in: points
 * that actually reach the field. Built from LO.bestLineup — the same solver the
 * lineup optimizer uses — so a claim's worth is measured by the machinery that
 * will later be asked to start him, rather than by a second idea of value.
 */
function startingTotal(roster, league) {
  const pts = {}, pos = {};
  for (const p of (roster || [])) {
    if (!p || !p.position) continue;
    pts[String(p.player_id)] = Number(p.proj_mean || 0);
    pos[String(p.player_id)] = p.position;
  }
  const best = LO.bestLineup(pts, pos, Object.keys(pts), (league || {}).starters);
  return (best.starters || []).reduce((sum, st) => sum + Number(st.points || 0), 0);
}

/* Evaluate the free-agent pool for MY roster. Returns ranked claims, each with the
 * player it would replace, its worth in points and dollars, the raw consensus
 * projection alongside, and (if leagueRosters given) which other teams need him.
 *
 * ── net_value WAS COMPUTED AGAINST TWO DIFFERENT BASELINES (fixed 2026-08-11) ──
 *
 * It was `startableValue(fa) - startableValue(drop)`, and for a BENCH player
 * startableValue returns `(proj − proj of the incumbent AT HIS POSITION) × 0.35`.
 * The two terms therefore measured against DIFFERENT incumbents, so the
 * subtraction did not cancel and the remainder was a comparison between two of
 * my own players who had nothing to do with the transaction.
 *
 * Driven on a real roster: claiming a kicker projected 110, while already
 * starting one projected 130, scored +23.36 net points and $59 — of which
 * 0.35 × (my WR2 210 − my kicker 130) = 28.00 came from the gap between two
 * players neither added nor dropped. Same-position swaps cancelled cleanly;
 * cross-position ones, which are most of a real wire, did not.
 *
 * There was a UNITS error stacked on top: a position-relative bench marginal was
 * multiplied by `dollarsPerPoint`, which is the value of one marginal point
 * added to the STARTING LINEUP. Two different kinds of point.
 *
 * Now: the change in what my optimal starting lineup projects, before and after
 * the swap. That is the quantity the docstring always claimed ("net startable
 * points added"), it is in the same unit dollarsPerPoint prices, and a strictly
 * worse kicker scores exactly zero because he never reaches the field.
 *
 * WHAT IS DELIBERATELY NOT CHANGED: `startableValue` itself, which is A's, and
 * `startable_value` on every claim, which still reports it unmodified. Contract
 * C1 — the draft engine and the waiver tool must value the same player
 * identically — is asserted on THAT field, so it holds by construction and
 * waivers.test.js proves it rather than my asserting it.
 *
 * Depth is not lost, it is demoted: a pure bench add scores 0 lineup gain and
 * keeps its positive `startable_value`, which breaks the tie. Ranking by "what
 * reaches the field, then by depth" is the honest order.
 */
function evaluateClaims(freeAgents, myRoster, league, ctx) {
  ctx = ctx || {};
  const drop = dropCandidate(myRoster, league);
  const dropVal = drop ? drop.sv.value : 0;
  const dpp = dollarsPerPoint(ctx);
  const roster = (myRoster || []).filter(p => p && p.position);
  const before = startingTotal(roster, league);
  const afterDrop = drop ? roster.filter(p => String(p.player_id) !== String(drop.player.player_id)) : roster;

  const claims = (freeAgents || []).map(fa => {
    const sv = V.startableValue(fa, myRoster, league);
    // NET STARTABLE POINTS = what my starting lineup gains by making the swap.
    // Both totals come from the same solver over the same slot template, so
    // nothing about my other players leaks into the comparison.
    const netPoints = Math.max(0, round2(startingTotal(afterDrop.concat([fa]), league) - before));
    const consensus = consensusProjection(fa);
    const rivals = ctx.leagueRosters ? whoElseNeeds(fa, ctx.leagueRosters, league, ctx.postures) : [];
    return {
      player_id: fa.player_id,
      name: fa.name,
      position: fa.position,
      fills: sv.fills,
      why: sv.why,
      startable_value: round2(sv.value),
      net_value: round2(netPoints),
      drop: drop ? { player_id: drop.player.player_id, name: drop.player.name, value: round2(dropVal) } : null,
      dollars: round2(netPoints * dpp.perPoint),
      consensus_projection: consensus.value == null ? null : round2(consensus.value),
      consensus_label: consensus.label,
      rivals: rivals,                    // teams likely to claim him too
      contested: rivals.length > 0,
    };
  });
  // What reaches the field first; depth (A's marginal, untouched) breaks the tie.
  claims.sort((a, b) => (b.net_value - a.net_value) || (b.startable_value - a.startable_value));
  return { drop: claims.length ? claims[0].drop : (drop ? { player_id: drop.player.player_id, name: drop.player.name, value: round2(dropVal) } : null),
           dollars_per_point: round2(dpp.perPoint), claims };
}

/* Which OTHER teams have an open startable slot at this player's position — the
 * teams that will compete for the claim. Prioritised by posture (a contender or a
 * desperate team spends priority; a team chasing only the weekly high may not). */
function whoElseNeeds(player, leagueRosters, league, postures) {
  const out = [];
  Object.keys(leagueRosters || {}).forEach(rid => {
    const roster = leagueRosters[rid];
    const open = V.openStartableSlots(roster, league);
    const needsPos = open[player.position] || (open.FLEX && ['RB', 'WR', 'TE'].includes(player.position));
    if (!needsPos) return;
    const posture = (postures && postures[rid]) || null;
    // A team chasing only the weekly high is least likely to spend priority on a
    // startable-depth add; contenders and desperate teams are most likely.
    const eager = posture == null || posture === 'contender' || posture === 'desperate' || posture === 'lock';
    out.push({ rid: Number(rid), posture, eager });
  });
  // eager teams first
  out.sort((a, b) => (b.eager - a.eager));
  return out;
}

function round2(x) { return Math.round(Number(x || 0) * 100) / 100; }

/* LIVE ADAPTER — turn a real Sleeper bundle into waiver tool inputs.
 *
 * @param bundle     sleeper.bundle() result { rosters, ... }
 * @param playersDb  sleeper.players() { players: {pid: {name,pos,team,inj,...}} }
 * @param artifact   the draft artifact (draft_data.json) — the SOURCE OF TRUTH for
 *                   VORP and projections. CRITICAL: VORP must come from here, at
 *                   full-pool replacement, NOT be recomputed over the FA pool —
 *                   the waiver_live_check probe proved that recomputing over the
 *                   thin available pool inflates RB/WR VORP and makes the waiver
 *                   disagree with the draft on the same player (a C1 violation).
 * @param myRosterId my Sleeper roster_id
 *
 * Returns { freeAgents, myRoster } ready for evaluateClaims. A player without an
 * artifact entry (a deep waiver name the draft never ranked) is priced at the
 * artifact's positional replacement — the same baseline the draft uses — so the
 * valuation stays consistent across tools.
 *
 * NOT yet run live: Sleeper egress is blocked from the sandbox and the 2026 season
 * is undrafted. This is the wired path for when both clear; today the tool is
 * exercised on real 2025 data via draft/backtest/waiver_live_check.js.
 */
function waiverInputsFromBundle(bundle, playersDb, artifact, myRosterId) {
  const byId = {};
  ((artifact && artifact.players) || []).forEach(p => { byId[String(p.player_id)] = p; });
  // positional replacement from the artifact (full-pool), for players it never ranked
  const replByPos = {};
  ((artifact && artifact.players) || []).forEach(p => {
    if (p.vorp == null || p.proj_mean == null) return;
    const repl = p.proj_mean - p.vorp;   // proj - vorp == replacement level, per position
    if (replByPos[p.position] == null) replByPos[p.position] = repl;
  });
  const enrich = pid => {
    const info = (playersDb && playersDb.players && playersDb.players[pid]) || {};
    const art = byId[String(pid)];
    const position = art ? art.position : (info.pos || null);
    const proj_mean = art ? art.proj_mean : null;
    // CANONICAL vorp from the artifact; deep FAs get artifact positional replacement.
    const vorp = art ? art.vorp
      : (proj_mean != null && replByPos[position] != null ? proj_mean - replByPos[position] : 0);
    return { player_id: String(pid), name: info.name || (art && art.name) || String(pid),
      position, proj_mean, vorp,
      proj_sleeper: info.proj != null ? Number(info.proj) : undefined,
      bye: art ? art.bye : info.bye, injury_status: info.inj };
  };
  const rosters = (bundle && bundle.rosters) || [];
  const mine = rosters.find(r => String(r.roster_id) === String(myRosterId));
  const rosteredEverywhere = new Set();
  rosters.forEach(r => (r.players || []).forEach(pid => rosteredEverywhere.add(String(pid))));
  const myRoster = ((mine && mine.players) || []).map(enrich).filter(p => p.position);
  // Free agents = in the players DB, on NO roster.
  const freeAgents = Object.keys((playersDb && playersDb.players) || {})
    .filter(pid => !rosteredEverywhere.has(String(pid)))
    .map(enrich).filter(p => p.position && p.proj_mean != null);
  return { freeAgents, myRoster };
}

module.exports = { evaluateClaims, dropCandidate, whoElseNeeds, dollarsPerPoint,
                   consensusProjection, waiverInputsFromBundle };
