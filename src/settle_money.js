// SETTLE THE MONEY — the job itself, with no idea what invoked it.
//
// This was inside netlify/functions/weekly-high-cron.js, which made it
// reachable only by things Netlify schedules. Cory, 2026-09-17, after finding
// week 1 unattributed: "settle it now." The only doors were a weekly cron that
// had never fired and an HTTP twin locked behind a key that is not configured —
// so the honest answer was "you cannot, wait until 11:00Z", for a job whose
// whole purpose is that nobody should have to wait for it.
//
// So the job lives here, in src/, where the Express app can call it too. Three
// callers, ONE definition:
//
//   netlify/functions/weekly-high-cron.js   the daily schedule
//   netlify/functions/settle-money.js       the keyed HTTP door (CI, catch-up)
//   POST /admin/settle-now                  Cory, logged in, one tap
//
// The admin route needs no new secret because it is already behind
// requireCommissioner — it is his own authenticated action, not a public write
// endpoint, which is exactly why settle-money keeps its key and this does not.
//
// Everything below is unchanged from the scheduled version: it records only
// FINISHED weeks, NEVER overwrites an existing entry, and is safe to run as
// often as you like — every run after the first is a no-op that says so.

'use strict';

const H = require('./helpers');
const L = require('./ledger');
const sleeper = require('./sleeper');
const WH = require('./weekly_high');
const SA = require('./season_awards');
const PM = require('./payment_match');

async function run() {
  const log = [];
  const world = await H.loadWorld();
  const leagueId = world.config && world.config.sleeper_league_id;
  if (!leagueId) return { ok: false, error: 'no sleeper_league_id configured', log };

  const season = H.currentSeason(world.seasons);
  if (!season) return { ok: false, error: 'no current season', log };

  const data = await sleeper.bundle(leagueId);
  if (!data || !data.state) return { ok: false, error: 'sleeper bundle unavailable', log };
  const stateWeek = Number(data.state.week) || 0;

  const owners = H.activeOwners(world.owners);
  const map = world.config.sleeper_map || {};
  const todo = WH.weeksNeedingRecord(season, stateWeek, world.ledger);

  log.push(`season ${season.year}, sleeper state week ${stateWeek}, `
           + `${todo.length} finished week(s) needing a record: [${todo.join(', ')}]`);

  const recorded = [];
  const skipped = [];
  const matched = [];
  for (const week of todo) {
    let scorer = null;
    try {
      const m = await sleeper.matchupsForWeek(leagueId, week);
      scorer = sleeper.highScorer(m, data, map, owners);
    } catch (e) {
      skipped.push({ week, reason: `sleeper fetch failed: ${e && e.message}` });
      continue;
    }
    const decision = WH.entryFor(season, week, scorer);
    if (!decision.ok) {
      skipped.push({ week, reason: decision.reason, detail: decision.detail });
      continue;
    }
    const created = await L.addEntry(decision.entry);
    recorded.push({ week, ...decision.scorer, amount: decision.entry.amount });
    log.push(`week ${week}: ${decision.scorer.owner} (${decision.scorer.team}) `
             + `${decision.scorer.points} pts -> $${decision.entry.amount}`);

    // ⚠️ CORY OFTEN PAYS BEFORE THE JOB RUNS, and until 2026-09-17 that made the
    // winner look like a DEBTOR: his standalone -$100 sat alone on the books
    // until the prize landed, so the balances table read "Richard owes you
    // $100" the day after Richard was paid. If an exact, unsettled payment for
    // this prize is already there, settle the pair — the money moved, both
    // sides know it, and neither should stay flagged as outstanding.
    const paid = PM.matchPrizeToOpenPayment({ entries: await L.allEntries(), prize: created });
    if (paid) {
      const nice = `week ${week} high point`;
      await L.setSettled(paid.id, true, `matched to ${nice}`, 'auto');
      await L.setSettled(created.id, true, `already paid — matched to payment ${paid.id}`, 'auto');
      matched.push({ week, owner: decision.scorer.owner, amount: Math.abs(paid.amount) });
      log.push(`  ↳ already paid: matched to open payment ${paid.id}, both settled`);
    }
  }

  // ── THE OTHER FIVE-SIXTHS OF THE MONEY ────────────────────────────────────
  // Cory, 2026-09-17: "Same with all other winnings.. it shouldn't need claude
  // to do these things." Regular-season and playoff prizes are decided by the
  // same data and were settled by the same kind of unpressed button
  // (POST /admin/awards). Same job, same cadence, same rules: only when
  // DECIDED, never overwrite, never mark paid, shout on an unmapped winner.
  // ⚠️ THE AWARDS HALF MUST NEVER TAKE THE WEEKLY HIGH DOWN WITH IT. The weekly
  // $100 is already written by the time we get here; a missing `season.payouts`
  // or a Sleeper bracket hiccup would otherwise throw, return 500, and make a
  // successful weekly run look like a failed one. Awards degrade to "not
  // settled this run" and say so; they are retried next Tuesday for free.
  try {
  const table = H.payoutTable(season);
  const amounts = {};
  for (const row of [...(table.reg || []), ...(table.playoff || [])]) {
    if (row && row.category) amounts[row.category] = row.amount;
  }
  const ranked = sleeper.standings(data, map, owners);
  const bracket = await sleeper.winnersBracket(leagueId);
  const placements = sleeper.placementsFrom(bracket);
  const ownerOf = (rid) => {
    const row = ranked.find(r => Number(r.roster_id) === Number(rid));
    return row ? row.owner_id : null;
  };
  const aw = SA.awardsToRecord(season, stateWeek, ranked, placements, amounts, world.ledger, ownerOf);
  for (const e of aw.entries) {
    const { _roster_id, ...entry } = e;
    entry.desc = H.CATEGORY_LABELS[entry.category] || entry.category;
    await L.addEntry(entry);
    const who = (ranked.find(r => Number(r.roster_id) === Number(_roster_id)) || {});
    recorded.push({ category: entry.category, owner: who.owner_name || entry.owner_id,
                    team: who.team, amount: entry.amount });
    log.push(`${entry.category}: ${who.owner_name || entry.owner_id} -> $${entry.amount}`);
  }
  for (const s2 of aw.skipped) skipped.push(s2);
  log.push(`awards: ${aw.entries.length} recorded, ${aw.skipped.length} not yet decided or already present`);
  } catch (e) {
    skipped.push({ category: 'awards', reason: `award settling failed: ${e && e.message}` });
    log.push(`⚠️ awards not settled this run: ${e && e.message} — the weekly high above is unaffected`);
  }

  // An unmapped roster is the one skip that must be impossible to miss: it means
  // real money is going unattributed and will keep doing so every week.
  const unmapped = skipped.filter(s => /UNMAPPED/.test(s.reason || ''));
  for (const u of unmapped) {
    log.push(`🔴 ${u.week != null ? 'week ' + u.week : u.category}: ${u.reason} ${JSON.stringify(u.detail || {})}`);
  }

  return { ok: true, season: season.year, stateWeek, recorded, skipped, matched, log,
           needs_attention: unmapped.length > 0 };
}

module.exports = { run };
