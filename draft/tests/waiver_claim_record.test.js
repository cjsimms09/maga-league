// TERRITORY: A
/* THE GRADEABLE RECORD FOR A WAIVER CLAIM — the payload, not the write.
 *
 * THE GAP. Of the four tools that must emit gradeable predictions before
 * September 1, only the LINEUP optimizer writes one. `waiver_claim` has been a
 * registered ledger kind with an ENFORCED counterfactual since before the draft
 * and NOTHING HAS EVER WRITTEN ONE — src/routes/waivers.js does not touch the
 * ledger at all. Same for `stream_call` and `trade_eval`. The instrumentation
 * suite says it in its own words: "waiver/stream/trade kinds ready, await their
 * tools."
 *
 * AND THIS IS THE UNRECOVERABLE HALF. Sleeper returns the transaction in
 * January; what it cannot return is what the tool RECOMMENDED at the moment,
 * which is the entire attribution question. A week of waivers uncaptured in
 * September cannot be graded, ever.
 *
 * THE WRITE IS B'S (its route, its surface). What was missing is not the ledger
 * call but the DECISION the call has to record, which is this module's job.
 *
 * Run: node draft/tests/waiver_claim_record.test.js
 */
'use strict';
const path = require('path');
const V = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'valuation.js'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const threw = f => { try { f(); return null; } catch (e) { return e.message; } };

const DEC = { net_points: 4.2, lineup_before: 100, lineup_after: 104.2, improves: true, why: 'x' };
const STOP = V.claimStoppingRule({ depletes: false, net_points: 4.2, contested: true, reserve: 99 });
const base = {
  decision: DEC, stopping: STOP, depletes: false, week: 3, owner_id: 1,
  claim: { player_id: '9', name: 'Guy' }, drop: { player_id: '2', name: 'Old' },
  consensus_claim: { player_id: '7', name: 'Obvious Add' }, dollars: 12,
};

// ── THE LEDGER'S ENFORCED SHAPE ─────────────────────────────────────────────
{
  const r = V.waiverClaimRecord(base);
  ck('the record carries a counterfactual — the ledger REFUSES the write without one',
    r.counterfactual != null && r.counterfactual.claim === '7', r.counterfactual);
  ck('  and a recommendation to compare it against',
    r.recommended && r.recommended.claim === '9', r.recommended);
  ck('  with the raw number the decision turned on, not just a verdict',
    r.net_points === 4.2, r);
}

// ── THE COUNTERFACTUAL IS NAMED, NEVER DEFAULTED ───────────────────────────
{
  const msg = threw(() => V.waiverClaimRecord(Object.assign({}, base, { consensus_claim: undefined })));
  ck('a missing counterfactual throws', !!msg, msg);
  ck('  and the message says why "do nothing" would be the flattering default',
    /credit the tool for every claim that happened to work/.test(msg || ''), msg);
  // The counterfactual must be the ROOM'S move, not an empty one: crediting the
  // tool against "no claim" scores every successful add as the tool's win.
  const r = V.waiverClaimRecord(base);
  ck('  the basis states what the counterfactual IS',
    /best available by raw projection/.test(r.counterfactual.basis), r.counterfactual);
}

// ── THE REGIME RIDES WITH THE RECORD, AND IS NOT INFERRED ──────────────────
{
  // THE BUG THIS PINS. The first version derived it as
  // `stop.spend_priority !== null`. Under reverse standings claimStoppingRule
  // returns spend_priority FALSE — not null — so a non-depleting league recorded
  // depletes:true. A regime read off the shape of an incidental field is not the
  // regime, and January would have graded our waivers under the wrong economics.
  const r = V.waiverClaimRecord(base);
  ck('our league (reverse standings) records depletes:false', r.depletes === false, r.depletes);
  const roll = V.waiverClaimRecord(Object.assign({}, base, { depletes: true }));
  ck('  and a rolling league records depletes:true', roll.depletes === true);
  const msg = threw(() => V.waiverClaimRecord(Object.assign({}, base, { depletes: undefined })));
  ck('  a missing regime throws rather than being guessed', !!msg, msg);
  ck('  because spend_priority is FALSE under reverse standings, not null',
    STOP.spend_priority === false, STOP);
}

// ── A HOLLOW RECORD IS WORSE THAN NO RECORD ────────────────────────────────
{
  const msg = threw(() => V.waiverClaimRecord({ consensus_claim: null, depletes: false }));
  ck('no decision throws', !!msg, msg);
  ck('  and says why an empty entry is worse than none',
    /making January read as though it were measured/.test(msg || ''), msg);
}

// ── IT AGREES WITH THE RULE IT REPORTS ─────────────────────────────────────
{
  const r = V.waiverClaimRecord(base);
  ck('recommended.act matches the stopping rule\'s verdict', r.recommended.act === STOP.claim,
    { act: r.recommended.act, rule: STOP.claim });
  const noGain = V.claimStoppingRule({ depletes: false, net_points: -3, contested: false });
  const r2 = V.waiverClaimRecord(Object.assign({}, base, {
    decision: { net_points: -3, lineup_before: 100, lineup_after: 97, why: 'down' },
    stopping: noGain }));
  ck('  a downgrade records act:false rather than being dropped',
    r2.recommended.act === false && r2.net_points === -3, r2.recommended);
  /* WAS `ck(..., true)`. Testable: a declined claim is only gradeable if it still
   * carries what a later outcome joins on. My first attempt asserted a single
   * `key` field — a shape I had not read. There isn't one: the record joins on
   * WEEK + OWNER + the claim id, which is the composite the ledger actually
   * keys waivers by. The prose was right and the check was guessing. */
  ck('  and the declined claim still carries what an outcome joins on',
    r2.week != null && r2.owner_id != null && r2.recommended.claim != null,
    { week: r2.week, owner_id: r2.owner_id, claim: r2.recommended.claim });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

// ── THE DROP IS HALF THE TRANSACTION ───────────────────────────────────────
{
  /* FOUND BY THE END-TO-END AUDIT, 2026-08-12. The record carried the add and
   * not the cut, so January would have graded "was the pickup good" with the
   * COST of the pickup absent — half a transaction graded as a whole one.
   *
   * Sleeper returns the drop retroactively; what it cannot return is what the
   * dropped man was PROJECTED AT when I cut him, which is the number the
   * decision turned on. Same argument as the override record's frozen values. */
  const r = V.waiverClaimRecord(Object.assign({}, base, {
    drop: { player_id: '2', name: 'Old', proj_mean: 88.5, vorp: -12.1 } }));
  ck('the record carries the DROP, not just the add',
    r.dropped && r.dropped.player_id === '2', r.dropped);
  ck('  with what he was projected at WHEN I CUT HIM — the unrecoverable half',
    r.dropped.proj_mean === 88.5 && r.dropped.vorp === -12.1, r.dropped);
  const none = V.waiverClaimRecord(Object.assign({}, base, { drop: null }));
  ck('  and an add with no drop records null rather than inventing one',
    none.dropped === null, none.dropped);
}
