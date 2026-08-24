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

/* ── ONE DECISION MAY BE PRESENTED ONCE PER SEAT IT COULD FILL ──────────────
 *
 * REGISTER 294 (🔴🔴, found by E 2026-08-24): the waiver page showed Cory eight
 * claims and all eight were kickers, six of them below replacement, while the
 * tight-end upgrade — the largest positional hole on any roster in this league
 * — sat at rank 34 and never rendered.
 *
 * THE ARITHMETIC WAS NEVER WRONG. `net_value` is lineup points gained; he
 * drafted no kicker, so every free kicker fills a slot currently scoring zero
 * and books its ENTIRE season projection as the gain. Thirty-three consecutive
 * kickers outranked the first non-kicker, correctly. The ranking was useless
 * anyway, because HE CAN START ONE KICKER: the page presented one decision
 * eight times and pushed the second decision off the bottom.
 *
 * ⚠️ AND THE FIX THE REGISTER RECOMMENDED — exclude K and DEF — DOES NOT FIX
 * THE CLASS, IT MOVES IT. That output is printed at the bottom of E's own probe
 * and reads EIGHT TIGHT ENDS: Strange · Johnson · Hockenson · Schultz ·
 * Freiermuth · Sadiq · Dulcich · Okonkwo. Cory holds one weak TE, so every TE
 * on the wire is a real upgrade over the same starter — one decision, presented
 * eight times, at a different position. Excluding two positions treats the
 * symptom of the roster he happens to hold today; the defect is structural.
 *
 * SO THE BAR IS STRUCTURAL: a position may occupy at most as many rows as it
 * has STARTABLE SEATS — `starters[pos]`, plus the FLEX seat for the positions
 * eligible to fill it. QB 1 · RB 3 · WR 3 · TE 2 · K 1 · DEF 1. That bound is a
 * property of the league's slot template, so it holds for whatever roster he
 * holds in whatever week, and it fires for ANY position that goes empty rather
 * than only the one that is empty today.
 *
 * WHAT IT DOES NOT DO, deliberately: it does not reorder, reweight or suppress
 * a position. The kicker is still #1 — with an empty K slot that is the single
 * largest lineup gain available and it would be dishonest to hide it. What
 * stops is the SEVEN RESTATEMENTS of it. Feed this an unbounded cap and it
 * returns today's list byte-for-byte; that is its control, and it is asserted
 * in `draft/tests/waiver_claims_are_distinct_decisions.test.js`.
 */
const FLEX_ELIGIBLE = new Set(['RB', 'WR', 'TE']);

function startableSlotCaps(starters) {
  const s = starters || {};
  const flex = Number(s.FLEX || 0);
  const caps = {};
  Object.keys(s).forEach(pos => {
    if (pos === 'FLEX') return;
    /* Floor of 1: a position the template does not seat at all (a league with
     * no kicker slot) still gets to show its best claim rather than vanishing
     * — a cap of zero would be a suppression, and this is not one. */
    caps[pos] = Math.max(1, Number(s[pos] || 0) + (FLEX_ELIGIBLE.has(pos) ? flex : 0));
  });
  return caps;
}

function capPerPosition(claims, starters, limit) {
  const caps = startableSlotCaps(starters);
  const used = {};
  const out = [];
  for (const c of claims || []) {
    const pos = c.position;
    /* An UNKNOWN position defaults to 1 rather than to unlimited. The failure
     * mode being fixed here is a flood; defaulting the unknown case to
     * unlimited would let a position the template does not name reproduce it. */
    const cap = caps[pos] == null ? 1 : caps[pos];
    if ((used[pos] || 0) >= cap) continue;
    used[pos] = (used[pos] || 0) + 1;
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

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
  /* Register 294. Was `.slice(0, 8)` on the raw ranking, which rendered eight
   * kickers. `league.starters` is the league's own template read above, not a
   * default — capping against a template we do not play would bound the list at
   * the wrong number. */
  out.claims = capPerPosition(res.claims.filter(c => c.net_value > 0),
    league.starters, 8);
  // STREAMING (K/DEF), same underlying valuation, different decision shape. A
  // stream is a FREE weekly swap, not a priority-costly claim — the
  // counterfactual is "kept who I have", not "held priority". Same tested
  // net_value ranking; limitation (season-value, not matchup-tuned) is stated
  // on the page.
  /* ⚠️ THE SAME DEFECT WAS HERE TOO, and it is the Rule 3g follow-up on 294
   * rather than a second discovery: `.slice(0, 2)` on a K/DEF POOL renders the
   * best two of whichever position is inflated. On Cory's roster that is TWO
   * KICKERS — Mevis and Santos — and he can start one. The block meant to hold
   * his kicker decision AND his defense decision held the kicker decision
   * twice.
   *
   * Capped by the same rule, it renders the best K and the best DEF, at most
   * one each, which is how many of each he can field.
   *
   * ⚠️ AND ON TODAY'S BOARD IT RENDERS ONE ROW, NOT TWO — that is CORRECT and
   * is why the cap is not a "show one of each" rule. ZERO defenses clear
   * net_value > 0: his rostered DEF beats every free one, so there is no
   * defense decision to present. A rule that forced a second row would invent
   * one. Measured, not assumed — the control is in the guard suite. */
  out.streamClaims = capPerPosition(
    res.claims.filter(c => (c.position === 'K' || c.position === 'DEF')
      && c.net_value > 0), league.starters, 2);
  out.currentKD = (inputs.myRoster || [])
    .filter(p => p.position === 'K' || p.position === 'DEF')
    .map(p => ({ player_id: p.player_id, name: p.name, position: p.position }));

  // INJURY NEWS ON MY ROSTER (the Tuesday wire alert's third panel): players
  // carrying a designation, split hard-out vs questionable using the SAME
  // tables lineup/matchup use (LO.INACTIVE_INJURY) — a third injury vocabulary
  // is how two surfaces come to disagree about the same player.
  out.myInjured = (inputs.myRoster || []).map(p => {
    const raw = String(p.injury_status || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!raw) return null;
    return { player_id: p.player_id, name: p.name, position: p.position,
      tag: raw, out: LO.INACTIVE_INJURY.has(raw) };
  }).filter(Boolean);

  /* BLOCK WATCH (Cory's 08-24 mandate, the adversarial-waivers item): the
   * best available player at each position an EAGER opponent has a hole at —
   * the claim whose value is partly that it denies THEM. Rolling priority
   * makes this real: a block spends your position exactly like a claim does,
   * so the surface states who it denies and leaves the spend to Cory.
   *
   * MEASURED INPUTS ONLY: opponent need comes from the same
   * openStartableSlots/whoElseNeeds read the CONTESTED chip already uses; the
   * player ranking is proj_mean. What is NOT modelled is stated on the
   * surface: whether the opponent would actually claim (that is P331's grade
   * — flagged players must get added by flagged owners at a higher rate than
   * unflagged same-position peers, or this panel retires). */
  const byPos = {};
  for (const fa of inputs.freeAgents) {
    if (fa.proj_mean == null) continue;
    (byPos[fa.position] || (byPos[fa.position] = [])).push(fa);
  }
  const leagueRosters = Object.fromEntries((sData.rosters || [])
    .filter(r => String(r.roster_id) !== String(myRid))
    .map(r => [r.roster_id, (r.players || []).map(pid => {
      const info = (playersDb && playersDb.players && playersDb.players[pid]) || {};
      return { player_id: pid, position: info.pos, proj_mean: null };
    }).filter(p => p.position)]));
  out.blockWatch = [];
  for (const pos of Object.keys(byPos)) {
    const best = byPos[pos].sort((a, b) => b.proj_mean - a.proj_mean)[0];
    const rivals = W.whoElseNeeds(best, leagueRosters, league, null).filter(r => r.eager);
    if (!rivals.length) continue;
    const mine = out.claims.find(c => String(c.player_id) === String(best.player_id));
    out.blockWatch.push({
      player_id: String(best.player_id), name: best.name, position: pos,
      proj_mean: best.proj_mean,
      denies: rivals.map(r => r.rid),
      my_net_value: mine ? mine.net_value : null,
    });
  }
  out.blockWatch.sort((a, b) => (b.denies.length - a.denies.length) || (b.proj_mean - a.proj_mean));
  out.blockWatch = out.blockWatch.slice(0, 4);
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
                   buildAutoStreamEntry, buildAutoLineupEntry,
                   capPerPosition, startableSlotCaps };
