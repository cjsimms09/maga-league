// TERRITORY: E
/* THE WAIVER PAGE SHOWS EIGHT CLAIMS. ON CORY'S ROSTER ALL EIGHT ARE KICKERS.
 *
 * `src/waiver_reco.js:58` — `res.claims.filter(c => c.net_value > 0).slice(0, 8)`
 * — is what `member.js` renders as *"What the wire would add"*. `evaluateClaims`
 * sorts on `net_value`, which is lineup points gained. Cory drafted no kicker
 * (register 275), so EVERY free kicker fills a slot that currently scores zero
 * and books his ENTIRE season projection as the gain. Thirty-three of them
 * outrank the best non-kicker on the wire.
 *
 * The arithmetic is right and the ranking is useless: he can start one kicker,
 * so the list presents ONE decision thirty-three times and pushes the second
 * decision off the page. Kickers already have their own section
 * (`out.streamClaims`, K/DEF only), so the top two appear twice on one page
 * while the tight-end upgrade — the largest positional hole on any roster in
 * this league — never renders at all.
 *
 * REPORT ONLY. Reads the committed board and pick log; writes nothing.
 *
 * Run: node draft/tools/waiver_wire_shape_probe.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const W = require(path.join(ROOT, 'src', 'routes', 'waivers.js'));

const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'config', 'league_config.json'), 'utf8'));
const LOG = fs.readFileSync(path.join(ROOT, 'draft', 'data', 'draft_pick_log_2026.jsonl'), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

/* `src/waiver_reco.js:58`. Restated here because this file cannot import a
 * local inside that function; if that line changes, this number is stale and
 * the control below says so out loud rather than quietly comparing the wrong
 * window. */
const SHOWN = 8;

const fails = [];
const pad = (x, n) => { x = String(x); return x + ' '.repeat(Math.max(0, n - x.length)); };
const ok = (n, c, d) => { console.log('  ' + n + ' ' + pad(d, 66) + (c ? 'OK' : '*** FAILED ***')); if (!c) fails.push(n); };

const avail = DATA.players.filter(p => p.position && (p.proj_mean || 0) > 0);
const byId = {};
avail.concat(DATA.kept_players || []).forEach(p => { byId[String(p.player_id)] = p; });
const taken = new Set(LOG.map(r => String(r.player_id)));

/* `is_mine` is FALSE on all 150 rows of the committed log — register 264, fixed
 * in code and deliberately never backfilled. That row names the working field:
 * `team_slot`. Seat read from config, never typed. */
const MY_SLOT = Number(CFG.my_draft_slot);
const enrich = p => ({ player_id: String(p.player_id), name: p.name, position: p.position,
                       proj_mean: p.proj_mean, bye: p.bye, vorp: p.vorp || 0 });
/* ⚠️ THE ROSTER SOURCE MOVED ON 2026-08-25 AND THIS PROBE WOULD HAVE GONE
 * QUIETLY STALE. The 8-kicker finding was measured off the DRAFT PICK LOG, which
 * is a record of the draft and NOT a roster: it stopped describing what Cory owns
 * the moment he made his first waiver claim. He added Harrison Mevis (K) and
 * swapped Oronde Gadsden for Kenyon Sadiq (TE) in week 1.
 *
 * So the LIVE roster is read from `league_history.json`'s `final_rosters` while
 * the season is in progress, and the pick log is the FALLBACK for the pre-season
 * state the original finding was taken in. The source is printed, because
 * "which roster was this measured on" is the first question about any number here. */
/* ⚠️ AND `final_rosters` IS ITSELF A WEEKLY SNAPSHOT — `league-history-export.yml`
 * runs `cron: '0 11 * * 2'`, TUESDAYS ONLY. So this source is current on a
 * Tuesday and up to SEVEN DAYS behind on a Monday, across exactly the waiver and
 * game cycle. Repointing at it fixed a stale pick log and introduced a slower
 * staleness one source over, so the age is printed rather than implied. The LIVE
 * site does not have this problem: it reads Sleeper directly. */
function ageNote(builtAt) {
  if (!builtAt) return 'age unknown';
  const days = (Date.now() - Date.parse(builtAt)) / 86400000;
  if (!isFinite(days)) return 'age unknown';
  if (days < 1.5) return 'CURRENT (' + (24 * days).toFixed(0) + 'h old)';
  return '⚠️ ' + days.toFixed(1) + ' DAYS OLD — the export runs Tuesdays only, so '
    + 'any add or drop since then is invisible here';
}
function liveRoster() {
  try {
    const hist = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'league_history.json'), 'utf8'));
    const s = (hist.seasons || []).find(x => String(x.season) === '2026');
    if (!s || s.status !== 'in_season') return null;
    const rid = Object.keys(s.owners || {})
      .find(k => ((s.owners[k] || {}).display_name) === 'coryjsimms');
    if (!rid) return null;
    const r = (s.final_rosters || []).find(x => String(x.roster_id) === String(rid));
    return (r && (r.players || []).length)
      ? { ids: r.players.map(String),
          source: 'league_history final_rosters, built ' + (hist.built_at || '?')
            + ' — ' + ageNote(hist.built_at) }
      : null;
  } catch (e) { return null; }
}
const liveRos = liveRoster();
const ROSTER_SOURCE = liveRos ? liveRos.source
  : 'draft pick log — PRE-SEASON, seat ' + MY_SLOT + ' (no live roster available)';
const rosterIds = liveRos ? liveRos.ids
  : LOG.filter(r => Number(r.team_slot) === MY_SLOT).map(r => String(r.player_id));
const roster = rosterIds.map(id => byId[id]).filter(Boolean).map(enrich);
const freeAgents = avail.filter(p => !taken.has(String(p.player_id))).map(enrich);

function shape(rows) {
  const m = {};
  rows.forEach(p => { m[p.position] = (m[p.position] || 0) + 1; });
  return m;
}

console.log('CONTROLS');
console.log('  roster source: ' + ROSTER_SOURCE);
ok('C1', roster.length >= 15, 'roster resolves to ' + roster.length + ' players');
const noK = !roster.some(p => p.position === 'K');
ok('C2', true, 'kicker on the roster? ' + (noK ? 'NO — the flood precondition holds'
   : 'YES — the flood precondition is GONE, and that is the point') + '  ' + JSON.stringify(shape(roster)));

const live = W.evaluateClaims(freeAgents, roster, DATA.league, {});
const shown = live.claims.filter(c => c.net_value > 0).slice(0, SHOWN);

/* C3 IS THE ONE THAT MATTERS. If the flood is caused by the empty slot, then
 * handing the roster ONE kicker must clear it. If it does not, my explanation is
 * wrong and every number below is void — a probe that only ever demonstrates the
 * symptom has not identified a cause. */
const bestK = freeAgents.filter(p => p.position === 'K')
  .sort((a, b) => b.proj_mean - a.proj_mean)[0];
const withK = W.evaluateClaims(freeAgents.filter(p => p.player_id !== bestK.player_id),
  roster.concat([bestK]), DATA.league, {});
const shownWithK = withK.claims.filter(c => c.net_value > 0).slice(0, SHOWN);
const kNow = shown.filter(c => c.position === 'K').length;
const kThen = shownWithK.filter(c => c.position === 'K').length;
ok('C3', noK ? (kNow === SHOWN && kThen < SHOWN) : (kNow < SHOWN),
   noK ? ('give him one kicker and the flood clears: ' + kNow + '/' + SHOWN + ' -> ' + kThen + '/' + SHOWN)
       : ('he HAS a kicker now, so the flood is gone on its own: ' + kNow + '/' + SHOWN
          + ' onesies in the block — which is exactly what C3 predicted'));

if (fails.length) { console.log('\n*** ' + fails.length + ' control(s) failed — output void ***'); process.exit(1); }

console.log('\nWHAT THE PAGE RENDERS TODAY (src/waiver_reco.js:58, top ' + SHOWN + ' with net_value > 0)');
shown.forEach((c, i) => console.log('  ' + pad(i + 1, 4) + pad(c.position + ' ' + c.name, 26)
  + pad('net ' + c.net_value, 13) + pad('startable ' + c.startable_value, 20) + (c.fills || '')));

const firstNonK = live.claims.findIndex(c => c.position !== 'K');
const kBlock = live.claims.slice(0, firstNonK).filter(c => c.position === 'K').length;
console.log('\n  ' + kBlock + ' consecutive kickers before the first non-kicker.');
console.log('  first non-kicker: rank ' + (firstNonK + 1) + ' — '
  + live.claims[firstNonK].position + ' ' + live.claims[firstNonK].name
  + ', net ' + live.claims[firstNonK].net_value);

const worstShown = live.claims.slice(0, firstNonK)
  .reduce((m, c) => Math.min(m, c.startable_value), Infinity);
console.log('  the weakest of those kickers is ' + worstShown + ' BELOW replacement,');
console.log('  and still outranks a +' + live.claims[firstNonK].net_value + ' upgrade.');

console.log('\n  AND THE TOP TWO APPEAR TWICE: `out.streamClaims` is the same ranking');
console.log('  filtered to K/DEF, so ' + live.claims.slice(0, 2).map(c => c.name).join(' and ')
  + ' render in both blocks on one page.');

/* ---- REGISTER 277'S UNTRACED HALF ---------------------------------------
 * D fixed `waiverInputsFromBundle` to index `kept_players` (the wire was
 * nominating Ja'Marr Chase as the drop) and flagged one thing as NOT traced:
 * *"`lineupPoints` reads `proj_mean || 0`, so every '+N pts to your starting
 * lineup' on that surface has been computed against a lineup missing his three
 * best players — I have NOT traced that half."*
 *
 * Traced here. `lineupPoints` has exactly ONE call site (`evaluateClaims`,
 * waivers.js:175) and its roster comes from the same fixed
 * `waiverInputsFromBundle`, so D's own fix covers it — there is no second path.
 * What it was worth before the fix is below. */
console.log('\nREGISTER 277\'s UNTRACED HALF — what the lineup baseline was worth');
const LO = require(path.join(ROOT, 'src', 'routes', 'lineup.js'));
const preIdx = {};
avail.forEach(p => { preIdx[String(p.player_id)] = p; });   // pre-277: `players` only
const mineIds = LOG.filter(r => Number(r.team_slot) === MY_SLOT).map(r => String(r.player_id));
const lineup = (zeroMissing) => {
  const pts = {}, pos = {};
  mineIds.forEach(id => {
    const seen = preIdx[id], fullRow = byId[id];
    if (seen) { pts[id] = Number(seen.proj_mean || 0); pos[id] = seen.position; }
    else if (zeroMissing && fullRow) { pts[id] = 0; pos[id] = fullRow.position; }
  });
  const b = LO.bestLineup(pts, pos, Object.keys(pts), DATA.league.starters);
  return { total: (b.starters || []).reduce((s, x) => s + Number(x.points || 0), 0),
           slots: (b.starters || []).map(x => x.slot + ' ' + (byId[x.pid] ? byId[x.pid].name : x.pid)) };
};
const fixedPts = {}, fixedPos = {};
roster.forEach(p => { fixedPts[String(p.player_id)] = Number(p.proj_mean || 0); fixedPos[String(p.player_id)] = p.position; });
const bFixed = LO.bestLineup(fixedPts, fixedPos, Object.keys(fixedPts), DATA.league.starters);
const fixedTotal = (bFixed.starters || []).reduce((s, x) => s + Number(x.points || 0), 0);
const preDrop = lineup(false), preZero = lineup(true);
/* The two pre-fix simulations must AGREE. A keeper the index misses is either
 * absent from the roster or present priced at zero, and a zero-point player
 * never wins a slot while alternatives exist — so if these differ, I have
 * modelled the pre-fix path wrong and the number below is void. */
console.log('  control: absent-keeper and priced-at-zero simulations agree — '
  + (preDrop.total === preZero.total ? 'OK' : '*** FAILED, number void ***'));
console.log('  best lineup, keepers indexed (today) : ' + fixedTotal.toFixed(1));
console.log('  best lineup, pre-277 path            : ' + preZero.total.toFixed(1));
console.log('  baseline was ' + (fixedTotal - preZero.total).toFixed(1)
  + ' points low, and every "+N pts to your starting lineup" was measured against it');
console.log('  it started:  ' + preZero.slots.filter(s => !(bFixed.starters || [])
  .some(x => s === x.slot + ' ' + (byId[x.pid] ? byId[x.pid].name : x.pid))).join(' · '));
console.log('  in place of: ' + (bFixed.starters || []).map(x => x.slot + ' ' + (byId[x.pid] ? byId[x.pid].name : x.pid))
  .filter(s => !preZero.slots.includes(s)).join(' · '));

console.log('\nWHAT IT WOULD RENDER WITH K/DEF EXCLUDED FROM THE CLAIMS BLOCK');
live.claims.filter(c => c.position !== 'K' && c.position !== 'DEF' && c.net_value > 0)
  .slice(0, SHOWN)
  .forEach((c, i) => console.log('  ' + pad(i + 1, 4) + pad(c.position + ' ' + c.name, 26)
    + pad('net ' + c.net_value, 13) + (c.fills || '')));
