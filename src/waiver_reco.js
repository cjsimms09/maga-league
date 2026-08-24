// TERRITORY: relay (extracted 2026-08-24, Cory's mandate: "you should be
// logging and grading ALL recommendations everywhere even if I don't do them")
/* THE ONE WAIVER RECOMMENDATION — shared by the /waivers page and the
 * Tuesday-night auto-capture cron (netlify/functions/waiver-reco-cron.js).
 *
 * This is the exact computation the /waivers route used to carry inline. It
 * moved HERE so the page and the ledger cannot drift: the row the cron writes
 * is definitionally what the page would have shown at that instant, because
 * both call this function with the same inputs. A second implementation in
 * the cron would be how "what we graded" and "what Cory saw" quietly become
 * two different things — the exact failure the shadow ledger's stale-freeze
 * taint already demonstrated once this week.
 *
 * PURE GIVEN ITS INPUTS: no store, no fetch, no clock. IO (the Sleeper
 * bundle, the players DB, the board artifact) stays with the callers.
 */
const W = require('./routes/waivers');
const LO = require('./routes/lineup');

/**
 * @param sData       sleeper.bundle() result
 * @param playersDb   sleeper.players() result
 * @param artifact    the committed draft board (public/draft_data.json), parsed
 * @param myRid       the Sleeper roster_id whose roster the wire is priced against
 * @param ownersCount fallback league size when the bundle lacks total_rosters
 * @returns { live, claims, drop, perPoint, streamClaims, currentKD }
 *          live=false when the roster cannot be assembled (unmapped, empty).
 */
function computeWaiverReco(sData, playersDb, artifact, myRid, ownersCount) {
  const out = { live: false, claims: [], drop: null, perPoint: 0,
                streamClaims: [], currentKD: [] };
  const inputs = W.waiverInputsFromBundle(sData, playersDb, artifact || {}, myRid);
  if (!inputs || !inputs.myRoster.length) return out;

  out.live = true;
  const band = LO.weeklyHighBand();
  // The league's own slot template, not a default — a wrong template prices
  // every claim against a lineup we do not play.
  const template = (sData.league && sData.league.roster_positions) || null;
  const league = {
    teams: (sData.league && sData.league.total_rosters) || ownersCount,
    starters: template ? LO.slotsFromTemplate(template) : LO.DEFAULT_SLOTS,
  };
  // Rank by what reaches the field, and only look at the top of the wire — a
  // full FA pool is thousands of names and the tail is all zeros.
  const typical = LO.typicalTeamScore();
  const res = W.evaluateClaims(inputs.freeAgents, inputs.myRoster, league, {
    band, lineupMean: typical.median, lineupSd: typical.sd, oppMean: typical.median,
    leagueRosters: Object.fromEntries((sData.rosters || [])
      .filter(r => String(r.roster_id) !== String(myRid))
      .map(r => [r.roster_id, (r.players || []).map(pid => {
        const info = (playersDb && playersDb.players && playersDb.players[pid]) || {};
        return { player_id: pid, position: info.pos, proj_mean: null };
      }).filter(p => p.position)])),
  });
  out.drop = res.drop;
  out.perPoint = res.dollars_per_point;
  out.claims = res.claims.filter(c => c.net_value > 0).slice(0, 8);
  // STREAMING (K/DEF), same underlying valuation, different decision shape. A
  // stream is a FREE weekly swap, not a priority-costly claim — the
  // counterfactual is "kept who I have", not "held priority". Same tested
  // net_value ranking; limitation (season-value, not matchup-tuned) is stated
  // on the page.
  out.streamClaims = res.claims.filter(c => (c.position === 'K' || c.position === 'DEF')
    && c.net_value > 0).slice(0, 2);
  out.currentKD = (inputs.myRoster || [])
    .filter(p => p.position === 'K' || p.position === 'DEF')
    .map(p => ({ player_id: p.player_id, name: p.name, position: p.position }));
  return out;
}

/**
 * The ledger row for the tool's headline advice this week — the TOP claim,
 * shaped exactly like the manual /waivers/log capture so the existing
 * resolver (claims-cron) and grader (grade-cron) handle it with no new code.
 *
 * The key deliberately uses the surface tag 'waiver_auto', NOT 'waiver_claim':
 * a manual log of the same player in the same week keys as
 * waiver_claim|…|player and must stay a SEPARATE entry — one records what the
 * tool said Tuesday night, the other records what Cory decided. Same kind, so
 * both grade; different key, so neither shadows the other.
 *
 * Returns null when the tool's honest position is "no claim clears the bar" —
 * an absence the CRON records via its marker, never a fabricated row.
 */
function buildAutoWaiverEntry(reco, season, week, ownerId) {
  if (!reco || !reco.live || !reco.claims || !reco.claims.length) return null;
  const top = reco.claims[0];
  if (!top || !(top.net_value > 0) || top.player_id == null) return null;
  return {
    kind: 'waiver_claim',
    method: 'waiver-auto-v1',
    season: String(season),
    payload: {
      key: `waiver_auto|${season}|w${week}|${ownerId}|${top.player_id}`,
      owner_id: Number(ownerId),
      week: Number(week),
      chosen: { player_id: String(top.player_id), name: top.name || null,
                position: top.position || null, net_value: top.net_value,
                dollars: top.dollars != null ? top.dollars : null },
      // REQUIRED by the ledger, and true: the tool's advice is priced against
      // holding priority — the same counterfactual the manual capture records.
      counterfactual: 'hold priority',
      drop: reco.drop ? { player_id: String(reco.drop.player_id || ''),
                         name: reco.drop.name || null } : null,
      dollars: top.dollars != null ? top.dollars : null,
      contested: null,
      // Marks the row as the tool's own emission, unprompted — the reader of
      // the accuracy page can split "advice given" from "advice taken".
      auto: true,
    },
  };
}

/**
 * The stream twin (register 287 ①): the K/DEF stream advice this module
 * already computes (streamClaims) becomes a stream_call row, shaped exactly
 * like the manual /stream/log capture. The counterfactual is a REAL
 * alternative — the K/DEF already rostered at the claimed position, who
 * would have started absent the stream; with none rostered it records the
 * resolver's own empty-slot note shape, which grades as 0 by construction.
 */
function buildAutoStreamEntry(reco, season, week, ownerId) {
  if (!reco || !reco.live || !reco.streamClaims || !reco.streamClaims.length) return null;
  const top = reco.streamClaims[0];
  if (!top || !(top.net_value > 0) || top.player_id == null) return null;
  const held = (reco.currentKD || []).find(p => p.position === top.position) || null;
  return {
    kind: 'stream_call',
    method: 'stream-auto-v1',
    season: String(season),
    payload: {
      key: `stream_auto|${season}|w${week}|${ownerId}|${top.player_id}`,
      owner_id: Number(ownerId),
      week: Number(week),
      chosen: { player_id: String(top.player_id), name: top.name || null,
                position: top.position || null, net_value: top.net_value },
      counterfactual: held
        ? { player_id: String(held.player_id), name: held.name || null,
            position: held.position || null }
        : { note: 'no current ' + (top.position || 'K/DEF') + ' on roster' },
      dollars: top.dollars != null ? top.dollars : null,
      auto: true,
    },
  };
}

/**
 * The lineup twin (register 287 ①): the optimizer's Sunday-morning start/sit
 * advice as a lineup_call row, shaped exactly like the /lineup/log form —
 * recommended = the tool's lineup, counterfactual = the start-your-studs
 * naive lineup, both as {id,name,pos,proj} arrays the resolver sums over the
 * week's real points. `live` is liveOptimizeFor()'s result; `band` its
 * weekly-high band (opp_mean mirrors the form's Math.round(band.median)).
 * Unlike waivers there is no "hold" week: whenever the optimizer is live its
 * lineup IS the advice, so an edge of zero still emits — "tool agrees with
 * the studs" is a gradeable claim, not an absence.
 */
function buildAutoLineupEntry(live, band, season, week, ownerId) {
  if (!live || !Array.isArray(live.lineup) || !live.lineup.length
      || !Array.isArray(live.naive) || !live.naive.length) return null;
  const side = arr => arr.map(s => ({ id: s.pid, name: s.name, pos: s.pos, proj: s.proj }));
  return {
    kind: 'lineup_call',
    method: 'lineup-auto-v1',
    season: String(season),
    payload: {
      key: `lineup_auto|${season}|w${week}|${ownerId}`,
      owner_id: Number(ownerId),
      week: Number(week),
      recommended: side(live.lineup),
      counterfactual: side(live.naive),
      dollars: live.edge != null ? Number(live.edge) : null,
      confidence: String(live.confidence || '').slice(0, 600),
      opp_mean: band && band.median != null ? Math.round(band.median) : null,
      auto: true,
    },
  };
}

module.exports = { computeWaiverReco, buildAutoWaiverEntry,
                   buildAutoStreamEntry, buildAutoLineupEntry };
