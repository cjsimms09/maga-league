/* THE WAIVER STOPPING RULE — is this claim worth the priority it costs?
 *
 * TWO DEFECTS IN ONE PLACE. The waiver tool ranks claims by `net_value` alone,
 * which answers "is he an upgrade" and never "is he worth SPENDING ON" — and
 * `whoElseNeeds` already derives `rivals`/`contested`, which the route publishes
 * and the sort ignores. A value produced and not consumed (rule 14), and the
 * consumer that was missing is the one this rule needs.
 *
 * AND THE PART THAT IS DELIBERATELY NOT DECIDED. league_config says
 * `is_faab: false` with a vestigial `budget: 100`, which does not distinguish
 * ROLLING priority (depletes; option value real) from REVERSE STANDINGS (resets
 * weekly; no stopping problem at all). `depletes` is therefore required with no
 * default, and `reserve` absent yields UNDECIDED rather than a permissive zero.
 *
 * Run: node draft/tests/claim_stopping.test.js
 */
'use strict';
const path = require('path');
const V = require(path.join(__dirname, '..', '..', 'public', 'js', 'draft', 'valuation.js'));
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

// ── THE UNRESOLVED SETTING MUST NOT BE GUESSED ───────────────────────────────
{
  let threw = null;
  try { V.claimStoppingRule({ net_points: 5, contested: true, reserve: 1 }); }
  catch (e) { threw = e.message; }
  ck('omitting `depletes` THROWS rather than assuming a waiver system',
    threw !== null && /required and has no default/.test(threw || ''), threw);
  ck('  and the error names both systems so the reader can resolve it',
    /rolling/i.test(threw || '') && /reverse/i.test(threw || ''), threw);
}

// ── REVERSE STANDINGS: there is no stopping problem ──────────────────────────
{
  const r = V.claimStoppingRule({ depletes: false, net_points: 0.5, contested: true, reserve: 99 });
  ck('when priority does not deplete, any positive claim is made', r.claim === true, r);
  ck('  and no priority is spent, however contested or however large the reserve',
    r.spend_priority === false, r);
  const z = V.claimStoppingRule({ depletes: false, net_points: -3, contested: false });
  ck('  a downgrade is still refused', z.claim === false, z);
}

// ── ROLLING PRIORITY: the option value binds ─────────────────────────────────
{
  const hold = V.claimStoppingRule({ depletes: true, net_points: 2.0, contested: true, reserve: 6.0 });
  ck('contested and worth LESS than the reserve -> hold the priority',
    hold.claim === true && hold.spend_priority === false, hold);
  ck('  and the reason states the size of what is being given up',
    /buy 4/.test(hold.reason), hold.reason);

  const spend = V.claimStoppingRule({ depletes: true, net_points: 9.0, contested: true, reserve: 6.0 });
  ck('contested and worth MORE than the reserve -> spend it',
    spend.spend_priority === true && spend.margin === 3, spend);
}

// ── THE DISCARDED INPUT, NOW LOad-BEARING ────────────────────────────────────
{
  const un = V.claimStoppingRule({ depletes: true, net_points: 1.0, contested: false, reserve: 50 });
  ck('UNCONTESTED: claim him without spending priority, even against a huge reserve',
    un.claim === true && un.spend_priority === false, un);
  ck('  which is the whole point of `contested` — it changes the ANSWER, not the display',
    /no rival has an open startable slot/.test(un.reason), un.reason);
  /* THE SAME PLAYER, CONTESTED, IS A DIFFERENT DECISION — probed where the
   * decision CAN differ. My first fixture used net=1 against reserve=50, where
   * both arms correctly say "do not spend" (one because he is free, one because
   * he is not worth it) and the assertion was unsatisfiable by construction. A
   * probe that cannot distinguish the two cases tests nothing about `contested`.
   * Above the reserve, the contested arm must spend and the uncontested must not. */
  const unHi  = V.claimStoppingRule({ depletes: true, net_points: 60, contested: false, reserve: 50 });
  const conHi = V.claimStoppingRule({ depletes: true, net_points: 60, contested: true,  reserve: 50 });
  ck('  contested vs uncontested DIFFER once value clears the reserve',
    unHi.spend_priority === false && conHi.spend_priority === true, { unHi, conHi });
}

// ── AN ABSENT RESERVE IS UNDECIDED, NOT PERMISSIVE ───────────────────────────
{
  const r = V.claimStoppingRule({ depletes: true, net_points: 4.0, contested: true });
  ck('no reserve supplied -> spend_priority is null (UNDECIDED), never true',
    r.spend_priority === null, r);
  ck('  and it says so rather than reading as approval',
    /UNDECIDED, not approved/.test(r.reason), r.reason);
  // A zero default would make every contested claim worth spending on — the most
  // aggressive policy reachable, arrived at by an omitted argument.
  const zero = V.claimStoppingRule({ depletes: true, net_points: 4.0, contested: true, reserve: 0 });
  ck('  an EXPLICIT zero reserve does spend — so the null case is not just zero',
    zero.spend_priority === true, zero);
}

// ── NO GAIN IS NO CLAIM, under either system ─────────────────────────────────
{
  for (const dep of [true, false]) {
    const r = V.claimStoppingRule({ depletes: dep, net_points: 0, contested: true, reserve: 0 });
    ck('net_points 0 is never a claim (depletes=' + dep + ')', r.claim === false, r);
  }
}

// ── depletes IS DERIVED FROM waiver_type, NOT HAND-SET ───────────────────────
{
  ck('rolling (0) depletes', V.waiverPriorityDepletes(0) === true);
  ck('reverse standings (1) does NOT deplete', V.waiverPriorityDepletes(1) === false);
  ck('FAAB (2) returns null — a budget is a different problem, not a queue position',
    V.waiverPriorityDepletes(2) === null);
  ck('an unknown code is null, never a guessed boolean',
    V.waiverPriorityDepletes(99) === null && V.waiverPriorityDepletes(undefined) === null);

  /* AGAINST THE REAL LEAGUE. Confirmed from the Sleeper UI on 2026-08-11:
   * "Reverse Standings" is the selected tile. Cory's memory said ROLLING — this
   * is the assertion that keeps the code following the setting rather than the
   * recollection, and it will flip on its own if the commissioner changes it. */
  const fs2 = require('fs');
  const dump = path.join(__dirname, '..', 'data', 'sleeper_league_settings.json');
  if (fs2.existsSync(dump)) {
    const wt = JSON.parse(fs2.readFileSync(dump, 'utf8')).settings.waiver_type;
    ck('our league imports waiver_type ' + wt + ' -> depletes ' + V.waiverPriorityDepletes(wt),
      V.waiverPriorityDepletes(wt) === false, 'waiver_type=' + wt);
    const r = V.claimStoppingRule({ depletes: V.waiverPriorityDepletes(wt),
      net_points: 2.4, contested: true, reserve: 9.9 });
    ck('  so a contested claim worth LESS than the reserve is still made — there '
      + 'is nothing to hold', r.claim === true && r.spend_priority === false, r);
  } else { console.log('SKIP  no settings dump'); }
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
