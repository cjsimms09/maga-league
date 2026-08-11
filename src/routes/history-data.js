'use strict';
//
// THE MFGA ARCHIVE — data engine for the League History page.
//
// This is the "one build script" of league-history-page.md §4, run at server
// load rather than emitted to disk: it reads the committed harvest artifacts
// and derives EVERYTHING the chronicle shows — standings, money, the weekly-high
// ledger, all-play fraud/robbery, superlatives, bad beats, the records book, the
// Money Board and the franchise pages. Deterministic and provenance-stamped; no
// runtime LLM calls, no hand-maintained numbers. Change a harvest number and
// every derived page moves with it, which is the whole point (§4, §5).
//
// SOURCES (all read-only — these live in Session A's territory, we only read):
//   draft/data/league_history.json    — Sleeper harvest, full box scores 2023-25
//   draft/data/master_sheet_archive.json — the founding document, money 2016-25
//   draft/config/identity_map.json    — Sleeper handle <-> real name
//   draft/config/payouts.json         — per-season payout structure (money math)
//   public/draft_data.json            — player id -> name/position (2026 board)
//
// The written CHAPTERS (prose) are NOT here — they are committed content under
// views/history/chapters/, because prose cannot be regenerated deterministically.
// This module hands each chapter the numbers its roasts must trace back to.

const fs = require('fs');
const path = require('path');

// ---- file resolution -------------------------------------------------------
// Mirror server-app's findViews: the bundle may land the repo at the root, at
// cwd, or under /var/task in a deployed function.
function findFile(rel) {
  const roots = [
    path.join(__dirname, '..', '..'),
    process.cwd(),
    '/var/task',
    path.join(__dirname, '..', '..', '..', '..'),
  ];
  for (const r of roots) {
    const p = path.join(r, rel);
    try { if (fs.existsSync(p)) return p; } catch (e) { /* keep looking */ }
  }
  return path.join(roots[0], rel);
}
function readJSON(rel) {
  return JSON.parse(fs.readFileSync(findFile(rel), 'utf8'));
}

// ---- constants -------------------------------------------------------------
const PO = require('./playoffs');   // one definition of the playoff cut
const REG_WEEKS = 15;            // weeks 1-15 count; the weekly-$100 is reg-only
const PLAYOFF_START = 16;
// Real first name shown everywhere on the page. The master sheet uses first
// names; the Sleeper handles map to them via identity_map.
const FIRST_NAME = {
  coryjsimms: 'Cory', ds7mmet: 'David', mhagen: 'Michael', Jreis: 'Jeremy',
  cashworth: 'Justin', Schmelley: 'Dylan', Sadbru: 'Sam', B8T3S: 'Bates',
  MarianSaar: 'Marian', Richard2121: 'Richard',
};
// §8.1 — David and Marian are German; the other eight American.
const GERMAN = new Set(['David', 'Marian']);

// ---------------------------------------------------------------------------
// build() — the whole archive, memoised. Everything downstream reads this.
// ---------------------------------------------------------------------------
let _cache = null;
function build() {
  if (_cache) return _cache;

  const harvest = readJSON('draft/data/league_history.json');
  const master = readJSON('draft/data/master_sheet_archive.json');
  const payouts = readJSON('draft/config/payouts.json');
  const board = readJSON('public/draft_data.json');

  // player id -> { name, pos, team }.  DST are team codes (PHI, KC…) => DEF.
  const players = {};
  for (const p of (board.players || [])) {
    players[String(p.player_id)] = { name: p.name, pos: p.position, team: p.team };
  }
  for (const p of (board.kept_players || [])) {
    if (!players[String(p.player_id)]) players[String(p.player_id)] = { name: p.name, pos: p.position, team: p.team };
  }
  const playerName = id => (players[String(id)] || {}).name || `#${id}`;
  const playerPos = id => {
    if (players[String(id)]) return players[String(id)].pos;
    return /^[A-Z]{2,3}$/.test(String(id)) ? 'DEF' : '?';   // team code => defense
  };

  // Sleeper handle -> real first name, per season, keyed by roster_id.
  const seasonsRaw = harvest.seasons.filter(s => String(s.season) !== '2026' && (s.weeks && Object.keys(s.weeks).length));
  seasonsRaw.sort((a, b) => Number(b.season) - Number(a.season));

  const seasons = seasonsRaw.map(s => buildSeason(s, { playerName, playerPos, payouts }));
  const byYear = {};
  for (const s of seasons) byYear[s.year] = s;

  const owners = buildOwnerRegistry(seasons, master);
  const records = buildRecordsBook(seasons, owners);
  const moneyBoard = buildMoneyBoard(master, owners);
  const amendments = buildAmendments(master, payouts);
  const badBeats = buildBadBeats(seasons, owners);
  const champions = buildChampionsRoll(master);
  const catalogue = buildCatalogue(seasons, owners);
  const chiefsHomers = buildChiefsHomers(seasons, board);

  // LEAGUE-NAME LINEAGE + dated amendments — corrected against ground truth.
  // 2016 founding name is "Balls and Wieners League" (owner-confirmed). The
  // Sleeper harvest carries per-season names only from 2023 (WLBL) and 2024+
  // (MFGA), so the rebrand year is derivable (min MFGA season) but the
  // BWL->WLBL transition predates Sleeper and is not in the data.
  const mfgaYears = seasons.filter(s => s.name === 'Make Football Great Again').map(s => s.year);
  const wlblYears = seasons.filter(s => s.name === 'Whiny Little Bitch League').map(s => s.year);
  // Keeper adoption: the draft data shows the first season carrying keeper
  // designations. 2023 has none; 2024 is the first with keepers.
  let keeperAdoptionYear = null;
  for (const s of [...seasons].sort((a, b) => a.year - b.year)) {
    if (s.draft && (s.draft.picks || []).some(p => p.is_keeper)) { keeperAdoptionYear = s.year; break; }
  }
  const lore = {
    foundingYear: 2016,
    foundingName: 'Balls and Wieners League',
    nameLineage: [
      { name: 'Balls and Wieners League', from: 2016, note: 'the founding name' },
      { name: 'Whiny Little Bitch League', from: null, note: 'transition year predates Sleeper — unrecorded; in use by the 2023 season' },
      { name: 'Make Football Great Again', from: mfgaYears.length ? Math.min(...mfgaYears) : null, note: 'the current name' },
    ],
    rebrandYear: mfgaYears.length ? Math.min(...mfgaYears) : null,     // 2024
    wlblInUseBy: wlblYears.length ? Math.max(...wlblYears) : null,     // 2023
    websiteFoundedYear: 2026,
    keeperAdoptionYear,                                                // 2024 (first draft with keepers)
    keeperNote: keeperAdoptionYear ? `first season with keeper designations in the draft data (${keeperAdoptionYear - 1} had none)` : 'year unknown',
    // Weekly-high $100 pool: appears in the master sheet's payout structure only
    // from 2023 on (2016-2022 split the pot between regular-season finish and
    // playoffs only). It is NOT a founding feature.
    weeklyHighIntroYear: (function () {
      const withWeekly = Object.keys((payouts.by_season || {}))
        .filter(y => (payouts.by_season[y].weekly_high || {}).amount).map(Number);
      return withWeekly.length ? Math.min(...withWeekly) : 2023;
    })(),
    // Owner turnover (owner-confirmed): three replacements. The departed three
    // appear NOWHERE in the data; the added three are already present by 2019,
    // the earliest year the master sheet names owners — so the exact seasons
    // predate the record and are not establishable. Stated, not invented.
    turnover: {
      departed: ['Brandon', 'Taylor Hagen', 'Tori'],
      added: ['Sam', 'Dylan', 'Jeremy'],
      yearsKnown: false,
      note: 'Sam, Dylan and Jeremy replaced Brandon, Taylor Hagen and Tori. The master sheet names owners only from 2019 (all current ten already present), so the exact seasons are not in the data. Name caveat: the records preserve a "Ben" (a single 2024 draft-order entry) and nothing for "Tori"; the third departed name is Cory\'s recollection and the data cannot confirm it either way.',
      // Data-integrity flag: pre-join winnings attributed to the replacements
      // that likely belong to their predecessors — surfaced, not silently kept.
      moneyCaveat: 'The master sheet credits Dylan with $406.25 (2017) and $187.50 (2018) and Jeremy with $156.25 (2017) — before either is known to have joined. Those dollars most likely belong to the owners they replaced; the true split is not recoverable from the data.',
    },
  };

  _cache = {
    provenance: {
      harvest_built_at: harvest.built_at,
      master_source: master.source_file,
      master_sha256: master.source_sha256,
      note: master.note,
    },
    seasons, byYear, owners, records, moneyBoard, amendments, badBeats, champions, catalogue, chiefsHomers, lore,
    firstName: FIRST_NAME, german: GERMAN,
    modernYears: seasons.map(s => s.year),        // 2023-2025 (full box scores)
    votesPending: master.votes_pending || [],
  };
  return _cache;
}

// ---------------------------------------------------------------------------
// One modern season (2023-2025) — the seasons with full box scores.
// ---------------------------------------------------------------------------
function buildSeason(s, ctx) {
  const year = Number(s.season);
  const { playerName, payouts } = ctx;
  const pay = (payouts.by_season || {})[String(year)] || null;

  // Season-authoritative position map. The starters array follows the roster
  // order [QB, RB, RB, WR, WR, TE, FLEX, K, DEF], so a player's slot names his
  // position for THIS season — more reliable than the 2026 board, which loses
  // anyone who has since retired or changed roles. Definitive slots only; the
  // FLEX slot (index 6) is ambiguous, so it falls back to the board.
  const SLOT_POS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', null, 'K', 'DEF'];
  const seasonPos = {};
  for (const arr of Object.values(s.weeks)) {
    for (const m of arr) {
      (m.starters || []).forEach((pid, i) => {
        const p = SLOT_POS[i];
        if (p && !seasonPos[String(pid)]) seasonPos[String(pid)] = p;
      });
    }
  }
  const playerPos = id => seasonPos[String(id)] || ctx.playerPos(id);

  // roster_id -> owner (real first name, handle, team name)
  const teams = {};
  for (const [rid, o] of Object.entries(s.owners)) {
    teams[Number(rid)] = {
      roster_id: Number(rid),
      handle: o.display_name,
      name: FIRST_NAME[o.display_name] || o.display_name,
      team_name: o.team_name || '',
    };
  }
  const nameOf = rid => (teams[rid] || {}).name || `#${rid}`;

  // Weekly box scores, normalised.  weeks[w] = [ {roster_id, matchup_id,
  // points, opt (optimal lineup pts), best (best single starter), benchTop } ]
  const weeks = {};
  const weekList = Object.keys(s.weeks).map(Number).sort((a, b) => a - b);
  for (const w of weekList) {
    weeks[w] = s.weeks[w].map(m => {
      const opt = optimalLineup(m.players_points || {}, m.players || [], playerPos);
      // best single STARTER performance this week (for "best single-player game")
      let best = null;
      (m.starters || []).forEach((pid, i) => {
        const pts = (m.starters_points || [])[i];
        if (pts == null) return;
        if (!best || pts > best.points) best = { player_id: pid, name: playerName(pid), pos: playerPos(pid), points: pts };
      });
      // highest-scoring BENCHED player (starter set vs full roster)
      const starterSet = new Set((m.starters || []).map(String));
      let benchTop = null;
      for (const pid of (m.players || [])) {
        if (starterSet.has(String(pid))) continue;
        const pts = (m.players_points || {})[pid];
        if (pts == null) continue;
        if (!benchTop || pts > benchTop.points) benchTop = { player_id: pid, name: playerName(pid), pos: playerPos(pid), points: pts };
      }
      // Slot-level points, by the roster order [QB,RB,RB,WR,WR,TE,FLEX,K,DEF].
      // The slot names the position for this season — reliable where the 2026
      // board is not. Powers the kicker>QB and defense>WR-corps detectors.
      const sp = m.starters_points || [];
      const st = m.starters || [];
      const slotPlayer = i => ({ name: playerName(st[i]), pts: round2(sp[i]) });
      const slot = {
        qb:  sp[0] != null ? slotPlayer(0) : null,
        wr:  [2, 3].map(() => null),   // placeholder, replaced below
        te:  sp[5] != null ? slotPlayer(5) : null,
        flex: sp[6] != null ? slotPlayer(6) : null,
        k:   sp[7] != null ? slotPlayer(7) : null,
        def: sp[8] != null ? slotPlayer(8) : null,
      };
      slot.rb = [1, 2].filter(i => sp[i] != null).map(slotPlayer);
      slot.wr = [3, 4].filter(i => sp[i] != null).map(slotPlayer);
      return {
        roster_id: m.roster_id, matchup_id: m.matchup_id,
        points: round2(m.points), opt: round2(opt),
        eff: opt > 0 ? m.points / opt : 1,
        best, benchTop, slot,
      };
    });
  }

  // Head-to-head results, regular season: pair the two teams sharing a
  // matchup_id each week.
  const games = [];               // {week, a, b, pa, pb, winner, margin}
  for (const w of weekList) {
    if (w > REG_WEEKS) continue;
    const byMatch = {};
    for (const tw of weeks[w]) (byMatch[tw.matchup_id] ??= []).push(tw);
    for (const pair of Object.values(byMatch)) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      const winner = a.points === b.points ? 0 : (a.points > b.points ? a.roster_id : b.roster_id);
      games.push({
        week: w, a: a.roster_id, b: b.roster_id, pa: a.points, pb: b.points,
        winner, margin: round2(Math.abs(a.points - b.points)),
      });
    }
  }

  // Standings straight from the harvest (authoritative W-L-PF-PA-rank).
  const standings = (s.standings || []).map(row => {
    const t = teams[row.roster_id] || {};
    // season lineup efficiency over the games actually played (reg + playoffs
    // the team appeared in) — the number the chronicle quotes.
    let act = 0, opt = 0;
    for (const w of weekList) {
      if (w > REG_WEEKS) continue;                 // regular season only, comparable across all ten
      const tw = weeks[w].find(x => x.roster_id === row.roster_id);
      if (tw) { act += tw.points; opt += tw.opt; }
    }
    return {
      roster_id: row.roster_id, name: t.name, handle: t.handle, team_name: t.team_name,
      wins: row.wins, losses: row.losses, ties: row.ties || 0,
      pf: round2(row.points_for), pa: round2(row.points_against), rank: row.rank,
      eff: opt > 0 ? round1(100 * act / opt) : null,
      // points left on the bench (optimal minus actual, regular season) — the
      // "297 bench points" line. Reproduces the spec's ground-truth figure.
      benchLeft: round2(opt - act),
    };
  }).sort((a, b) => a.rank - b.rank);

  // Weekly-high ledger (regular season only) — winner, score, margin over 2nd.
  const weeklyHigh = [];
  for (const w of weekList) {
    if (w > REG_WEEKS) continue;
    const rows = [...weeks[w]].sort((x, y) => y.points - x.points);
    const top = rows[0], second = rows[1];
    weeklyHigh.push({
      week: w, roster_id: top.roster_id, name: nameOf(top.roster_id),
      score: top.points, second: second ? second.points : null,
      second_name: second ? nameOf(second.roster_id) : null,
      margin: second ? round2(top.points - second.points) : null,
    });
  }

  // All-play: each week score every team against every other; the gap between
  // all-play win% and actual win% is fraud (positive) or robbery (negative).
  // §2 — the honest instrument, not a naive rank comparison.
  const allPlay = computeAllPlay(weeks, weekList, teams);

  const bracket = buildBracket(s.brackets, teams);
  const money = pay ? computeMoney(year, pay, standings, weeklyHigh, bracket, teams) : null;
  const draft = buildDraftRecap(s.drafts, teams, playerName, playerPos);
  const superlatives = buildSuperlatives(weeks, weekList, games, teams, standings);

  return {
    year, name: s.name, status: s.status, teams,
    standings, weeks, weekList, games, weeklyHigh, allPlay, bracket, money,
    draft, superlatives, pay,
    playoffStart: PLAYOFF_START,
    // The one definition of the cut (routes/playoffs.playoffCut), applied to
    // THIS season's settings. Was a private copy of the same rule, agreeing by
    // coincidence with six other copies until one of them did not.
    playoffTeams: PO.playoffCut(s),
  };
}

// ---- optimal lineup (lineup efficiency) -----------------------------------
// Fill QB,RB,RB,WR,WR,TE,FLEX,K,DEF to maximise points from the full roster.
function optimalLineup(playersPoints, roster, posOf) {
  const byPos = { QB: [], RB: [], WR: [], TE: [], K: [], DEF: [] };
  for (const pid of roster) {
    const pts = playersPoints[pid];
    if (pts == null) continue;
    const pos = posOf(pid);
    if (byPos[pos]) byPos[pos].push(pts);
  }
  for (const k of Object.keys(byPos)) byPos[k].sort((a, b) => b - a);
  const take = (pos, n) => byPos[pos].splice(0, n).reduce((a, b) => a + b, 0);
  let total = 0;
  total += take('QB', 1);
  total += take('RB', 2);
  total += take('WR', 2);
  total += take('TE', 1);
  total += take('K', 1);
  total += take('DEF', 1);
  // FLEX: best remaining RB/WR/TE
  const flexPool = [...byPos.RB, ...byPos.WR, ...byPos.TE].sort((a, b) => b - a);
  if (flexPool.length) total += flexPool[0];
  return total;
}

// ---- all-play record -------------------------------------------------------
function computeAllPlay(weeks, weekList, teams) {
  const rid = Object.keys(teams).map(Number);
  const apWins = {}, apGames = {}, actWins = {}, actGames = {};
  for (const r of rid) { apWins[r] = 0; apGames[r] = 0; actWins[r] = 0; actGames[r] = 0; }
  for (const w of weekList) {
    if (w > REG_WEEKS) continue;
    const rows = weeks[w];
    for (const me of rows) {
      for (const other of rows) {
        if (me.roster_id === other.roster_id) continue;
        apGames[me.roster_id]++;
        if (me.points > other.points) apWins[me.roster_id]++;
        else if (me.points === other.points) apWins[me.roster_id] += 0.5;
      }
    }
    // actual result via matchup pairs
    const byMatch = {};
    for (const tw of rows) (byMatch[tw.matchup_id] ??= []).push(tw);
    for (const pair of Object.values(byMatch)) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      actGames[a.roster_id]++; actGames[b.roster_id]++;
      if (a.points > b.points) actWins[a.roster_id]++;
      else if (b.points > a.points) actWins[b.roster_id]++;
      else { actWins[a.roster_id] += 0.5; actWins[b.roster_id] += 0.5; }
    }
  }
  const out = {};
  for (const r of rid) {
    const apPct = apGames[r] ? apWins[r] / apGames[r] : 0;
    const actPct = actGames[r] ? actWins[r] / actGames[r] : 0;
    out[r] = {
      roster_id: r, name: teams[r].name,
      allPlayWins: apWins[r], allPlayGames: apGames[r], allPlayPct: apPct,
      actualWins: actWins[r], actualGames: actGames[r], actualPct: actPct,
      // positive => won more than performance earned (FRAUD)
      // negative => performance earned more than the record (ROBBED)
      gap: actPct - apPct,
      allPlayRecord: `${apWins[r]}-${apGames[r] - apWins[r]}`,
    };
  }
  return out;
}

// ---- playoff bracket -------------------------------------------------------
function buildBracket(brackets, teams) {
  if (!brackets) return null;
  const nameOf = rid => (teams[rid] || {}).name || `#${rid}`;
  const norm = arr => (arr || []).map(m => ({
    round: m.r, match: m.m, place: m.p || null,
    t1: m.t1, t2: m.t2, winner: m.w, loser: m.l,
    t1_name: nameOf(m.t1), t2_name: nameOf(m.t2),
    winner_name: nameOf(m.w), loser_name: nameOf(m.l),
  }));
  const winners = norm(brackets.winners);
  const losers = norm(brackets.losers);
  // placements from the winners bracket p-matches
  const placements = {};
  for (const m of winners) {
    if (m.place === 1) { placements[1] = m.winner; placements[2] = m.loser; }
    if (m.place === 3) { placements[3] = m.winner; placements[4] = m.loser; }
  }
  return { winners, losers, placements };
}

// ---- money (cross-checks against master_sheet per_owner_money) -------------
function computeMoney(year, pay, standings, weeklyHigh, bracket, teams) {
  const rows = {};
  for (const r of Object.keys(teams).map(Number)) {
    rows[r] = { roster_id: r, name: teams[r].name, weekly: 0, regular_season: 0, playoffs: 0, total: 0 };
  }
  // weekly highs (reg season only)
  const wAmt = (pay.weekly_high || {}).amount || 100;
  for (const wh of weeklyHigh) rows[wh.roster_id].weekly += wAmt;
  // regular-season champ / runner-up by standings rank
  const rs = pay.regular_season || {};
  const rank1 = standings.find(s => s.rank === 1);
  const rank2 = standings.find(s => s.rank === 2);
  if (rank1 && rs.champ) rows[rank1.roster_id].regular_season += rs.champ;
  if (rank2 && rs.runner_up) rows[rank2.roster_id].regular_season += rs.runner_up;
  // playoff placements
  const po = pay.playoffs || {};
  if (bracket && bracket.placements) {
    for (const place of [1, 2, 3, 4]) {
      const rid = bracket.placements[place];
      if (rid != null && po[String(place)]) rows[rid].playoffs += po[String(place)];
    }
  }
  for (const r of Object.values(rows)) r.total = round2(r.weekly + r.regular_season + r.playoffs);
  return { rows, pot: pay.total_pot, buy_in: pay.buy_in };
}

// ---- draft recap -----------------------------------------------------------
function buildDraftRecap(drafts, teams, playerName, playerPos) {
  if (!drafts || !drafts.length) return null;
  const d = drafts[0];
  const nameOf = rid => (teams[rid] || {}).name || `#${rid}`;
  const picks = (d.picks || []).map(p => ({
    round: p.round, pick_no: p.pick_no, roster_id: p.roster_id,
    owner: nameOf(p.roster_id), player_id: p.player_id,
    player: playerName(p.player_id), pos: playerPos(p.player_id),
    is_keeper: !!p.is_keeper,
  }));
  return { rounds: d.settings ? d.settings.rounds : null, firstTwo: picks.filter(p => p.round <= 2), picks };
}

// ---- THE CHIEFS-HOMER COUNTER ----------------------------------------------
// Bates carries a reputation as the league's Chiefs homer who overpays for KC
// players. This tests the LOYALTY half of that claim (the "overpay" half is not
// computable — no archived ADP for 2023-25 — so it is not asserted). This IS a
// RESULT (who drafted whom), so it is league-visible, not a commissioner tool.
//
// Method: non-keeper draft picks only (a keeper is not a draft decision),
// skeleton positions only (team DEFs are team codes, not "players"). Player→NFL
// team comes from the 2026 board, so a player who has since changed clubs is
// attributed to his current one — noise in both directions, favours no one.
function buildChiefsHomers(seasons, board) {
  const teamOf = {};
  for (const p of (board.players || [])) teamOf[String(p.player_id)] = p.team;
  for (const p of (board.kept_players || [])) if (teamOf[String(p.player_id)] == null) teamOf[String(p.player_id)] = p.team;

  const tally = {};   // owner name -> { kc, total, matched, seasons:Set }
  let leagueKC = 0, leagueTotal = 0;
  const years = [];
  for (const s of seasons) {
    if (!s.draft || !s.draft.picks) continue;
    years.push(s.year);
    for (const p of s.draft.picks) {
      if (p.is_keeper) continue;
      if (p.pos === 'DEF') continue;
      const o = p.owner;
      const t = teamOf[String(p.player_id)] || null;
      const row = tally[o] || (tally[o] = { owner: o, kc: 0, total: 0, matched: 0, kcPicks: [] });
      row.total++;
      if (t != null) row.matched++;
      if (t === 'KC') { row.kc++; leagueKC++; row.kcPicks.push({ year: s.year, player: p.player, round: p.round }); }
      leagueTotal++;
    }
  }

  const leagueRate = leagueTotal ? leagueKC / leagueTotal : 0;
  const rows = Object.values(tally).map(r => ({
    ...r,
    share: r.total ? r.kc / r.total : 0,
    vsLeague: leagueRate ? (r.total ? (r.kc / r.total) / leagueRate : 0) : 0,
  })).sort((a, b) => b.kc - a.kc || b.share - a.share);

  // ranking + the honest verdict about Bates specifically
  rows.forEach((r, i) => { r.rank = i + 1; });
  const batesRow = rows.find(r => r.owner === 'Bates') || null;
  const leaders = rows.filter(r => r.kc === rows[0].kc);   // ties at the top
  const batesRank = batesRow ? batesRow.rank : null;

  // one honest sentence — the reputation without the receipts
  let verdict;
  if (batesRow && leaders.length && !leaders.some(l => l.owner === 'Bates')) {
    const names = leaders.map(l => l.owner);
    const nm = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
    verdict = `Bates is the ${ordinalRank(batesRank)}-biggest Chiefs drafter in his own league — out-Chiefed by ${nm}. `
      + `${batesRow.kc} KC picks in ${years.length} seasons isn't a signature, it's a rounding error. `
      + `The reputation runs on vibes, not receipts — and the actual Chiefs homer${leaders.length > 1 ? 's are' : ' is'} ${nm}, who ${leaders.length > 1 ? 'have' : 'has'} never been accused of caring about Kansas City in ${leaders.length > 1 ? 'their' : 'his'} life.`;
  } else if (batesRow && leaders.some(l => l.owner === 'Bates')) {
    verdict = `Bates does lead the league in Chiefs picks (${batesRow.kc} in ${years.length} seasons) — the one time the reputation holds.`;
  } else {
    verdict = `Not enough draft data to rule on the Bates reputation.`;
  }

  return {
    years, leagueKC, leagueTotal, leagueRate: round2(leagueRate * 100),
    rows, leaders: leaders.map(l => l.owner), bates: batesRow, batesRank,
    verdict,
    // The overpay claim stays UNMEASURED, not fabricated.
    overpayNote: 'The "overpay" half of the reputation is not computable — no archived draft-market (ADP) for 2023-25 exists in the data. Only loyalty is measured here.',
    teamAttributionNote: 'Player→NFL team is the current-season board, so a player who has since changed clubs is counted for his present team. Noise favours no one.',
  };
}

function ordinalRank(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---- per-season superlatives ----------------------------------------------
function buildSuperlatives(weeks, weekList, games, teams, standings) {
  const nameOf = rid => (teams[rid] || {}).name || `#${rid}`;
  const allTW = [];
  for (const w of weekList) for (const tw of weeks[w]) allTW.push({ ...tw, week: w });

  const regTW = allTW.filter(t => t.week <= REG_WEEKS);
  const highest = maxBy(regTW, t => t.points);
  const lowest = minBy(regTW, t => t.points);
  // biggest blowout / closest game (regular season, decided)
  const decided = games.filter(g => g.winner !== 0);
  const blowout = maxBy(decided, g => g.margin);
  const closest = minBy(decided, g => g.margin);

  // best single-player game (any starter, any week)
  let bestPlayer = null;
  for (const t of allTW) if (t.best && (!bestPlayer || t.best.points > bestPlayer.points)) {
    bestPlayer = { ...t.best, week: t.week, owner: nameOf(t.roster_id) };
  }
  // bench catastrophe of the year: highest benched player in a LOSS
  const lossByTeamWeek = new Set();
  for (const g of games) {
    if (g.winner === 0) continue;
    const loser = g.winner === g.a ? g.b : g.a;
    lossByTeamWeek.add(`${loser}:${g.week}`);
  }
  let benchCat = null;
  for (const t of allTW) {
    if (t.week > REG_WEEKS) continue;
    if (!lossByTeamWeek.has(`${t.roster_id}:${t.week}`)) continue;
    if (t.benchTop && (!benchCat || t.benchTop.points > benchCat.points)) {
      benchCat = { ...t.benchTop, week: t.week, owner: nameOf(t.roster_id), teamPoints: t.points };
    }
  }

  // longest win / loss streaks (regular season)
  const streaks = computeStreaks(games, teams);

  // sub-70 disasters, kicker-outscores-QB, DEF-outscores-WR-corps
  return {
    highest: sup(highest, nameOf), lowest: sup(lowest, nameOf),
    blowout: blowout && { ...blowout, winner_name: nameOf(blowout.winner), loser_name: nameOf(blowout.winner === blowout.a ? blowout.b : blowout.a) },
    closest: closest && { ...closest, winner_name: nameOf(closest.winner), loser_name: nameOf(closest.winner === closest.a ? closest.b : closest.a) },
    bestPlayer, benchCat, streaks,
    sub70: regTW.filter(t => t.points < 70).map(t => ({ week: t.week, owner: nameOf(t.roster_id), points: t.points })).sort((a, b) => a.points - b.points),
  };
}
function sup(tw, nameOf) { return tw && { week: tw.week, owner: nameOf(tw.roster_id), points: tw.points }; }

function computeStreaks(games, teams) {
  const seq = {};
  for (const r of Object.keys(teams).map(Number)) seq[r] = [];
  const byWeek = [...games].sort((a, b) => a.week - b.week);
  for (const g of byWeek) {
    if (g.winner === 0) continue;
    const loser = g.winner === g.a ? g.b : g.a;
    seq[g.winner].push('W'); seq[loser].push('L');
  }
  const best = { win: null, loss: null };
  for (const [r, arr] of Object.entries(seq)) {
    let curW = 0, curL = 0, maxW = 0, maxL = 0;
    for (const x of arr) {
      if (x === 'W') { curW++; curL = 0; } else { curL++; curW = 0; }
      maxW = Math.max(maxW, curW); maxL = Math.max(maxL, curL);
    }
    if (!best.win || maxW > best.win.len) best.win = { roster_id: Number(r), name: teams[r].name, len: maxW };
    if (!best.loss || maxL > best.loss.len) best.loss = { roster_id: Number(r), name: teams[r].name, len: maxL };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Owner registry — the ten men, a decade.  Career rows for franchise pages.
// ---------------------------------------------------------------------------
function buildOwnerRegistry(seasons, master) {
  const owners = {};        // real name -> record
  // seed from FIRST_NAME so all ten exist even in years without box scores
  for (const [handle, name] of Object.entries(FIRST_NAME)) {
    owners[name] = {
      name, handle, german: GERMAN.has(name),
      seasons: {},                 // year -> {record, pf, pa, eff, rank}
      career: { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 },
    };
  }
  const byRoster = {};
  for (const s of seasons) {
    for (const row of s.standings) {
      const o = owners[row.name];
      if (!o) continue;
      o.seasons[s.year] = {
        wins: row.wins, losses: row.losses, ties: row.ties, pf: row.pf, pa: row.pa,
        rank: row.rank, eff: row.eff, team_name: row.team_name,
      };
      o.career.wins += row.wins; o.career.losses += row.losses; o.career.ties += row.ties;
      o.career.pf += row.pf; o.career.pa += row.pa;
      byRoster[`${s.year}:${row.roster_id}`] = row.name;
    }
  }
  // head-to-head grid (modern era) — owner name -> opp name -> {w,l,t}
  for (const o of Object.values(owners)) o.h2h = {};
  for (const s of seasons) {
    for (const g of s.games) {
      const an = (s.teams[g.a] || {}).name, bn = (s.teams[g.b] || {}).name;
      if (!an || !bn) continue;
      ensureH2H(owners, an, bn); ensureH2H(owners, bn, an);
      if (g.winner === 0) { owners[an].h2h[bn].t++; owners[bn].h2h[an].t++; }
      else if (g.winner === g.a) { owners[an].h2h[bn].w++; owners[bn].h2h[an].l++; }
      else { owners[bn].h2h[an].w++; owners[an].h2h[bn].l++; }
    }
  }
  // money per owner across ALL years, from the master sheet (authoritative).
  const tw = master.total_winnings || {};
  const masterKey = { Michael: 'Michael', 'Michael Hagen': 'Michael' };
  for (const o of Object.values(owners)) {
    const key = o.name === 'Michael' ? 'Michael' : o.name;
    const row = tw[key] || tw[masterKey[o.name]] || null;
    o.money = row ? { by_year: row.by_year || {}, career: row.career_from_years ?? row.sheet_total ?? 0,
                      wins: row.wins, loss: row.loss, tie: row.tie, win_pct: row.win_pct } : null;
  }
  for (const o of Object.values(owners)) { o.career.pf = round2(o.career.pf); o.career.pa = round2(o.career.pa); }
  return owners;
}
function ensureH2H(owners, a, b) {
  if (!owners[a].h2h[b]) owners[a].h2h[b] = { w: 0, l: 0, t: 0 };
}

// ---------------------------------------------------------------------------
// The All-Time Records Book (crown jewel) — spanning the modern seasons.
// ---------------------------------------------------------------------------
function buildRecordsBook(seasons, owners) {
  const allTW = [];       // every team-week with owner + year
  const allGames = [];
  for (const s of seasons) {
    for (const w of s.weekList) {
      for (const tw of s.weeks[w]) {
        allTW.push({ ...tw, year: s.year, week: w, owner: (s.teams[tw.roster_id] || {}).name, reg: w <= REG_WEEKS });
      }
    }
    for (const g of s.games) allGames.push({ ...g, year: s.year, winner_name: (s.teams[g.winner] || {}).name });
  }
  const reg = allTW.filter(t => t.reg);
  const highestWeek = topN(allTW, t => t.points, 5);
  const lowestWeek = botN(reg, t => t.points, 5);
  const decided = allGames.filter(g => g.winner !== 0);
  const biggestBlowout = topN(decided, g => g.margin, 5).map(g => withGameNames(g, seasons));
  const closest = botN(decided, g => g.margin, 5).map(g => withGameNames(g, seasons));

  // most points in a loss — the Bad Beat record (Richard 2025 monument).
  const losses = [];
  for (const s of seasons) for (const g of s.games) {
    if (g.winner === 0) continue;
    const loserRid = g.winner === g.a ? g.b : g.a;
    const loserPts = g.winner === g.a ? g.pb : g.pa;
    losses.push({ year: s.year, week: g.week, owner: (s.teams[loserRid] || {}).name, points: loserPts,
      winner_name: (s.teams[g.winner] || {}).name, winner_points: g.winner === g.a ? g.pa : g.pb });
  }
  const mostInLoss = topN(losses, l => l.points, 5);

  // best single-player game ever
  let bestPlayer = null;
  for (const t of allTW) if (t.best && (!bestPlayer || t.best.points > bestPlayer.points)) {
    bestPlayer = { ...t.best, year: t.year, week: t.week, owner: t.owner };
  }

  // career: most weekly highs; single-season weekly highs
  const whCareer = {}, whSeason = {};
  for (const s of seasons) for (const wh of s.weeklyHigh) {
    whCareer[wh.name] = (whCareer[wh.name] || 0) + 1;
    const k = `${wh.name}:${s.year}`;
    whSeason[k] = (whSeason[k] || 0) + 1;
  }
  const weeklyHighCareer = Object.entries(whCareer).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  const weeklyHighSeason = Object.entries(whSeason).map(([k, n]) => ({ name: k.split(':')[0], year: Number(k.split(':')[1]), n })).sort((a, b) => b.n - a.n).slice(0, 5);

  return {
    highestWeek, lowestWeek, biggestBlowout, closest, mostInLoss, bestPlayer,
    weeklyHighCareer, weeklyHighSeason,
    weird: buildWeird(seasons),
  };
}
function withGameNames(g, seasons) {
  const s = seasons.find(x => x.year === g.year);
  return { ...g, winner_name: (s.teams[g.winner] || {}).name,
           loser_name: (s.teams[g.winner === g.a ? g.b : g.a] || {}).name };
}

// Weird & Unique auto-detections (§ league-history-page.md 2.Weird)
function buildWeird(seasons) {
  const out = { ties: [], bothUnder80: [], lastBeatFirst: [], identical: [] };
  for (const s of seasons) {
    const rankByRid = {};
    for (const st of s.standings) rankByRid[st.roster_id] = st.rank;
    for (const g of s.games) {
      if (g.winner === 0) out.ties.push({ year: s.year, week: g.week, a: (s.teams[g.a] || {}).name, b: (s.teams[g.b] || {}).name, pts: g.pa });
      if (g.pa < 80 && g.pb < 80) out.bothUnder80.push({ year: s.year, week: g.week, a: (s.teams[g.a] || {}).name, b: (s.teams[g.b] || {}).name, pa: g.pa, pb: g.pb });
      // last place (rank 10) beating first (rank 1)
      const ra = rankByRid[g.a], rb = rankByRid[g.b];
      if (g.winner !== 0) {
        const wr = rankByRid[g.winner], lr = rankByRid[g.winner === g.a ? g.b : g.a];
        if (wr >= 9 && lr <= 2) out.lastBeatFirst.push({ year: s.year, week: g.week,
          winner: (s.teams[g.winner] || {}).name, winner_rank: wr,
          loser: (s.teams[g.winner === g.a ? g.b : g.a] || {}).name, loser_rank: lr });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE ABSURDITY & MIRACLE CATALOGUE — every box score 2023-2025 mined for the
// material the chapters will need. Box scores exist ONLY for the modern seasons;
// 2016-2022 are pre-Sleeper and carry no box-score absurdities (never invented).
// ---------------------------------------------------------------------------
function buildCatalogue(seasons, owners) {
  const CATS = [
    ['subOnePoint',    '⚔️ Wins by Under a Point',            'Games decided by less than 1.00.'],
    ['ties',           '🤝 Ties',                              'Nobody has to lose — but sometimes nobody wins.'],
    ['kickerOverQB',   '🦵 Kicker Outscored the Starting QB',  'The kicker put up more than the quarterback.'],
    ['defOverWR',      '🛡️ Defense Outscored the WR Corps',    'The defense beat both starting receivers combined.'],
    ['defOverQB',      '🛡️ Defense Outscored the QB',          'The defense beat the starting quarterback.'],
    ['sub70',          '💩 Sub-70 Disasters',                  'A starting lineup that failed to reach 70.'],
    ['benchOverLineup','🪑 Bench Player Beat the Whole Lineup', 'One benched player outscored the entire starting nine.'],
    ['benchOverBest',  '🪑 Best Player Was on the Bench',       'The top scorer that week never left the bench.'],
    ['nearHigh',       '💵 Weekly High Lost by a Fraction',     'The $100 missed by under two points.'],
    ['lastBeatFirst',  '🙃 Last Beat First',                    'The cellar-dweller toppled the league leader.'],
    ['blowout',        '💥 Biggest Blowouts',                   'The most lopsided beatings.'],
  ];

  const bySeason = {};
  for (const s of seasons) {
    const nameOf = rid => (s.teams[rid] || {}).name || `#${rid}`;
    const c = { subOnePoint: [], ties: [], kickerOverQB: [], defOverWR: [], defOverQB: [],
      sub70: [], benchOverLineup: [], benchOverBest: [], nearHigh: [], lastBeatFirst: [], blowout: [] };

    // TIED SCORES — scan EVERY week, playoffs included. A tie is exactly the
    // kind of event this pass exists to catch, so it must not be scoped to the
    // regular season the way the win/loss game list is. (Result for 2023-2025:
    // none — the closest any matchup came was 1.10. The one tie in league
    // history is pre-Sleeper; see preSleeperTies below.)
    for (const w of s.weekList) {
      const byM = {};
      for (const tw of s.weeks[w]) (byM[tw.matchup_id] ??= []).push(tw);
      for (const pair of Object.values(byM)) {
        if (pair.length !== 2) continue;
        if (pair[0].points === pair[1].points) {
          c.ties.push({ year: s.year, week: w, a: nameOf(pair[0].roster_id), b: nameOf(pair[1].roster_id),
            pts: pair[0].points, playoff: w >= PLAYOFF_START,
            summary: `${nameOf(pair[0].roster_id)} and ${nameOf(pair[1].roster_id)} tied at ${pair[0].points.toFixed(2)} (Week ${w}${w >= PLAYOFF_START ? ', playoffs' : ''}).` });
        }
      }
    }
    // game-level (regular season)
    for (const g of s.games) {
      if (g.margin != null && g.winner !== 0 && g.margin < 1) {
        const w = nameOf(g.winner), l = nameOf(g.winner === g.a ? g.b : g.a);
        c.subOnePoint.push({ year: s.year, week: g.week, winner: w, loser: l, margin: g.margin,
          summary: `${w} beat ${l} by ${g.margin.toFixed(2)} in Week ${g.week}.` });
      }
    }
    // biggest blowouts of the season (top 3 decided games)
    for (const g of [...s.games].filter(x => x.winner !== 0).sort((a, b) => b.margin - a.margin).slice(0, 3)) {
      const w = nameOf(g.winner), l = nameOf(g.winner === g.a ? g.b : g.a);
      c.blowout.push({ year: s.year, week: g.week, winner: w, loser: l, margin: g.margin,
        pw: g.winner === g.a ? g.pa : g.pb, pl: g.winner === g.a ? g.pb : g.pa,
        summary: `${w} buried ${l} by ${g.margin.toFixed(2)} in Week ${g.week}.` });
    }
    // weekly highs lost by a fraction (< 2)
    for (const wh of s.weeklyHigh) {
      if (wh.margin != null && wh.margin < 2 && wh.second_name) {
        c.nearHigh.push({ year: s.year, week: wh.week, missed_by: wh.second_name, took_it: wh.name,
          margin: wh.margin, score: wh.score, second: wh.second,
          summary: `${wh.second_name} missed the Week ${wh.week} high by ${wh.margin.toFixed(2)} — ${wh.name} banked $100 with ${wh.score.toFixed(2)}.` });
      }
    }
    // last (rank>=9) beat first (rank<=2)
    const rankByRid = {};
    for (const st of s.standings) rankByRid[st.roster_id] = st.rank;
    for (const g of s.games) {
      if (g.winner === 0) continue;
      const wr = rankByRid[g.winner], loserRid = g.winner === g.a ? g.b : g.a, lr = rankByRid[loserRid];
      if (wr >= 9 && lr <= 2) c.lastBeatFirst.push({ year: s.year, week: g.week,
        winner: nameOf(g.winner), winner_rank: wr, loser: nameOf(loserRid), loser_rank: lr,
        summary: `${nameOf(g.winner)} (finished #${wr}) beat ${nameOf(loserRid)} (#${lr}) in Week ${g.week}.` });
    }
    // team-week-level (regular season): positional absurdities + bench
    for (const w of s.weekList) {
      if (w > REG_WEEKS) continue;
      for (const tw of s.weeks[w]) {
        const who = nameOf(tw.roster_id), sl = tw.slot || {};
        if (tw.points < 70) c.sub70.push({ year: s.year, week: w, owner: who, points: tw.points,
          summary: `${who} scored just ${tw.points.toFixed(2)} in Week ${w}.` });
        if (sl.k && sl.qb && sl.k.pts > sl.qb.pts) c.kickerOverQB.push({ year: s.year, week: w, owner: who,
          k: sl.k.name, kpts: sl.k.pts, qb: sl.qb.name, qbpts: sl.qb.pts,
          summary: `${who}'s kicker ${sl.k.name} (${sl.k.pts.toFixed(2)}) outscored his QB ${sl.qb.name} (${sl.qb.pts.toFixed(2)}), Week ${w}.` });
        const wrSum = round2((sl.wr || []).reduce((a, x) => a + x.pts, 0));
        if (sl.def && (sl.wr || []).length && sl.def.pts > wrSum) c.defOverWR.push({ year: s.year, week: w, owner: who,
          def: sl.def.name, defpts: sl.def.pts, wrpts: wrSum,
          summary: `${who}'s ${sl.def.name} defense (${sl.def.pts.toFixed(2)}) outscored both starting WRs combined (${wrSum.toFixed(2)}), Week ${w}.` });
        if (sl.def && sl.qb && sl.def.pts > sl.qb.pts) c.defOverQB.push({ year: s.year, week: w, owner: who,
          def: sl.def.name, defpts: sl.def.pts, qb: sl.qb.name, qbpts: sl.qb.pts,
          summary: `${who}'s ${sl.def.name} defense (${sl.def.pts.toFixed(2)}) outscored his QB ${sl.qb.name} (${sl.qb.pts.toFixed(2)}), Week ${w}.` });
        if (tw.benchTop && tw.benchTop.points > tw.points) c.benchOverLineup.push({ year: s.year, week: w, owner: who,
          player: tw.benchTop.name, pts: tw.benchTop.points, lineup: tw.points,
          summary: `${who} benched ${tw.benchTop.name} (${tw.benchTop.points.toFixed(2)}) — more than his ENTIRE starting lineup scored (${tw.points.toFixed(2)}), Week ${w}.` });
        else if (tw.benchTop && tw.best && tw.benchTop.points > tw.best.points) c.benchOverBest.push({ year: s.year, week: w, owner: who,
          player: tw.benchTop.name, pts: tw.benchTop.points, bestStarter: tw.best.name, bestPts: tw.best.points,
          summary: `${who}'s best player was on the bench: ${tw.benchTop.name} (${tw.benchTop.points.toFixed(2)}) beat his top starter ${tw.best.name} (${tw.best.points.toFixed(2)}), Week ${w}.` });
      }
    }
    // sort within each list, most extreme first where a magnitude exists
    c.subOnePoint.sort((a, b) => a.margin - b.margin);
    c.sub70.sort((a, b) => a.points - b.points);
    c.nearHigh.sort((a, b) => a.margin - b.margin);
    c.kickerOverQB.sort((a, b) => (b.kpts - b.qbpts) - (a.kpts - a.qbpts));
    c.defOverWR.sort((a, b) => (b.defpts - b.wrpts) - (a.defpts - a.wrpts));
    c.benchOverBest.sort((a, b) => (b.pts - b.bestPts) - (a.pts - a.bestPts));
    c.streaks = s.superlatives.streaks;
    bySeason[s.year] = c;
  }

  // all-time roll-ups (flatten every season, sort)
  const flat = key => seasons.flatMap(s => bySeason[s.year][key] || []);
  const allTime = {};
  for (const [key] of CATS) allTime[key] = flat(key);
  allTime.subOnePoint.sort((a, b) => a.margin - b.margin);
  allTime.nearHigh.sort((a, b) => a.margin - b.margin);
  allTime.sub70.sort((a, b) => a.points - b.points);
  allTime.blowout.sort((a, b) => b.margin - a.margin);

  // counts, for the summary bar
  const counts = {};
  for (const [key] of CATS) counts[key] = allTime[key].length;

  // PRE-SLEEPER TIES — the master sheet keeps career W-L-T but no per-week
  // scores for 2016-2022, so a tied game there survives only as a tally. Exactly
  // two owners carry one tie each, which means they tied EACH OTHER; the season,
  // week and score predate Sleeper and exist nowhere. Surfaced honestly, not
  // invented. This is distinct from the 2022 Marian/Sam agreed split (a cancelled
  // game, not a tied score — that carries the asterisk, see the Rolls).
  const preSleeperTies = Object.values(owners || {})
    .filter(o => o.money && (o.money.tie || 0) > 0)
    .map(o => ({ name: o.name, ties: o.money.tie }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { cats: CATS, bySeason, allTime, counts, preSleeperTies,
    coverageNote: 'Box scores exist only for 2023–2025 (Sleeper era). 2016–2022 pre-date Sleeper and carry no box-score detail — the archive says so plainly rather than inventing it.' };
}

// ---------------------------------------------------------------------------
// The Money Board — all-time career earnings, ranked (the settling table).
// ---------------------------------------------------------------------------
function buildMoneyBoard(master, owners) {
  const tw = master.total_winnings || {};
  const rows = [];
  for (const [name, o] of Object.entries(owners)) {
    if (!o.money) continue;
    rows.push({ name, career: round2(o.money.career), by_year: o.money.by_year,
      wins: o.money.wins, loss: o.money.loss, tie: o.money.tie, win_pct: o.money.win_pct });
  }
  rows.sort((a, b) => b.career - a.career);
  // years present across the board
  const years = new Set();
  for (const r of rows) for (const y of Object.keys(r.by_year || {})) if (r.by_year[y]) years.add(Number(y));
  return { rows, years: [...years].sort() };
}

// ---------------------------------------------------------------------------
// The Chronicle of Amendments — buy-in escalation + votes pending.
// ---------------------------------------------------------------------------
function buildAmendments(master, payouts) {
  const seasons = master.seasons || {};
  const buyIns = [];
  for (const y of Object.keys(seasons).sort()) {
    const b = seasons[y].buy_in;
    if (b != null) buyIns.push({ year: Number(y), buy_in: b });
  }
  // the escalation steps (only where the number changes)
  const steps = [];
  let prev = null;
  for (const b of buyIns) {
    if (b.buy_in !== prev) { steps.push(b); prev = b.buy_in; }
  }
  // Payout-structure revisions: emit an entry each time the structure changes
  // (pot, playoff purse or regular-season split). Traceable to payouts.json.
  const payRevisions = [];
  let prevSig = null;
  for (const y of Object.keys((payouts && payouts.by_season) || {}).sort()) {
    const p = payouts.by_season[y];
    if (p.total_pot == null) continue;          // skip placeholder/future seasons
    const po = p.playoffs || {}, rs = p.regular_season || {};
    const sig = JSON.stringify([p.total_pot, po['1'], po['2'], po['3'], po['4'], rs.champ, rs.runner_up]);
    if (sig !== prevSig) {
      payRevisions.push({ year: Number(y), pot: p.total_pot, buy_in: p.buy_in,
        playoffs: [po['1'], po['2'], po['3'], po['4']], reg: [rs.champ, rs.runner_up] });
      prevSig = sig;
    }
  }
  return { buyIns, steps, payRevisions, votesPending: master.votes_pending || [] };
}

// ---------------------------------------------------------------------------
// Champions roll (2016-2025) — from the master sheet, with the 2022 asterisk.
// ---------------------------------------------------------------------------
function buildChampionsRoll(master) {
  const seasons = master.seasons || {};
  const roll = [];
  for (const y of Object.keys(seasons).sort()) {
    const s = seasons[y];
    const po = s.playoffs || {};
    const champ = po['1st'] && po['1st'].winner;
    if (!champ) continue;
    const co = String(champ).includes('/');
    roll.push({
      year: Number(y), champion: champ, co_championship: co,
      asterisk: co,                     // the 2022 Marian/Sam split — the asterisk
      buy_in: s.buy_in,
      payout: (po['1st'] && po['1st'].amount != null) ? po['1st'].amount : null, // what the title paid
    });
  }
  return roll;
}

// ---------------------------------------------------------------------------
// Bad Beats Hall of Fame — auto-detected (§ league-history-page.md 2.BadBeats).
// ---------------------------------------------------------------------------
function buildBadBeats(seasons, owners) {
  const beats = [];
  // (1) lost while scoring top-3 that week
  for (const s of seasons) {
    for (const w of s.weekList) {
      if (w > REG_WEEKS) continue;
      const ranked = [...s.weeks[w]].sort((a, b) => b.points - a.points);
      const top3 = new Set(ranked.slice(0, 3).map(t => t.roster_id));
      for (const g of s.games.filter(x => x.week === w)) {
        if (g.winner === 0) continue;
        const loser = g.winner === g.a ? g.b : g.a;
        const loserPts = g.winner === g.a ? g.pb : g.pa;
        if (top3.has(loser)) {
          beats.push({ kind: 'top3_loss', year: s.year, week: w,
            owner: (s.teams[loser] || {}).name, points: loserPts,
            note: `Top-3 score in the league that week and still lost — to ${(s.teams[g.winner] || {}).name}.` });
        }
      }
    }
  }
  // (2) missed a weekly high by < 2 points
  for (const s of seasons) {
    for (const wh of s.weeklyHigh) {
      if (wh.margin != null && wh.margin < 2 && wh.second_name) {
        beats.push({ kind: 'near_high', year: s.year, week: wh.week,
          owner: wh.second_name, points: wh.second,
          note: `Missed the weekly high by ${wh.margin.toFixed(2)} — ${wh.name} took the $100 with ${wh.score.toFixed(2)}.` });
      }
    }
  }
  // (3) highest score in a losing effort, each season
  for (const s of seasons) {
    let worst = null;
    for (const g of s.games) {
      if (g.winner === 0) continue;
      const loser = g.winner === g.a ? g.b : g.a;
      const loserPts = g.winner === g.a ? g.pb : g.pa;
      if (!worst || loserPts > worst.points) worst = { year: s.year, week: g.week, owner: (s.teams[loser] || {}).name, points: loserPts, winner: (s.teams[g.winner] || {}).name };
    }
    if (worst) beats.push({ kind: 'season_high_loss', ...worst, note: `The season's highest score in a loss.` });
  }
  // (4) missed the playoffs on a tiebreak — same record as the last qualifier,
  // out on total points. The cruellest cut: a whole season lost by a rounding
  // error's worth of points. (Cory 2024, by 8.20, is the archetype.)
  for (const s of seasons) {
    const cut = s.playoffTeams || 4;
    const inLast = s.standings.find(x => x.rank === cut);
    const outFirst = s.standings.find(x => x.rank === cut + 1);
    if (inLast && outFirst && inLast.wins === outFirst.wins && inLast.losses === outFirst.losses) {
      const gap = round2(inLast.pf - outFirst.pf);
      beats.push({ kind: 'tiebreak_miss', year: s.year, week: null, owner: outFirst.name,
        points: gap,
        note: `Missed the playoffs on a tiebreak — same ${outFirst.wins}-${outFirst.losses} record as ${inLast.name}, out by ${gap.toFixed(2)} total points across the season. ${outFirst.benchLeft != null ? `Left ${outFirst.benchLeft.toFixed(0)} on the bench.` : ''}`.trim() });
    }
  }
  return beats.sort((a, b) => b.points - a.points || a.year - b.year);
}

// ---- small numeric helpers -------------------------------------------------
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }
function maxBy(arr, f) { return arr.reduce((m, x) => (m == null || f(x) > f(m) ? x : m), null); }
function minBy(arr, f) { return arr.reduce((m, x) => (m == null || f(x) < f(m) ? x : m), null); }
function topN(arr, f, n) { return [...arr].sort((a, b) => f(b) - f(a)).slice(0, n); }
function botN(arr, f, n) { return [...arr].sort((a, b) => f(a) - f(b)).slice(0, n); }

module.exports = { build, FIRST_NAME, GERMAN, REG_WEEKS };

// Allow `node src/routes/history-data.js` to dump a provenance + sanity report.
if (require.main === module) {
  const a = build();
  const out = {
    provenance: a.provenance,
    seasons: a.seasons.map(s => ({ year: s.year, name: s.name, champion_bracket: s.bracket && s.bracket.placements })),
    moneyBoardTop: a.moneyBoard.rows.slice(0, 3).map(r => ({ name: r.name, career: r.career })),
  };
  console.log(JSON.stringify(out, null, 2));
}
