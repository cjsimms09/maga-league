// TERRITORY: A
'use strict';
// 🟠 AUDIT FINDING 5 (external persistence audit, 2026-08-16): SEEDING RACE.
//
// ensureSeeded() checked `config`, then wrote a dozen docs, then wrote
// `config` LAST. Two concurrent first requests both saw no config and both
// seeded: every vote doc got minted twice (unique random ids, so no overwrite
// hides it) and the singleton docs were written twice. The fix serializes
// initialization through store.mutate on a `seed-lock` doc and re-checks
// `config` inside the lock — the second caller finds the first one's work.
//
// RED against the pre-fix data.js (double votes); the red run is preserved in
// draft/audit/persistence_hardening_2026-08-16.md.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'seedrace-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const seed = require(path.join(ROOT, 'src', 'seed-data'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 200) : ''))); };

(async () => {
  // TWO CONCURRENT COLD-START REQUESTS. Both enter before either has written
  // anything — the exact shape of two members opening the site after a deploy.
  await Promise.all([data.ensureSeeded(), data.ensureSeeded()]);

  const voteKeys = await store.listKeys('vote:');
  ck('the seeded votes exist exactly once (not doubled by the race)',
    voteKeys.length === seed.VOTES.length, { got: voteKeys.length, want: seed.VOTES.length });

  const owners = await store.get('owners');
  ck('owners doc seeded', Array.isArray(owners) && owners.length === seed.OWNERS.length,
    owners && owners.length);

  const ledger = await store.get('ledger');
  const buyIns = (ledger || []).filter(e => e.type === 'buy_in');
  ck('exactly ONE buy-in charge per owner', buyIns.length === owners.length,
    { buyIns: buyIns.length, owners: owners.length });
  const perOwner = new Set(buyIns.map(e => e.owner_id));
  ck('  and no owner is charged twice', perOwner.size === buyIns.length);

  const alerts = await store.get('alerts');
  ck('the two seeded alerts exist exactly once each', Array.isArray(alerts) && alerts.length === 2,
    alerts && alerts.length);

  const config = await store.get('config');
  ck('config exists with a secret', !!(config && config.secret));

  // A THIRD call after settle-down is a pure no-op.
  const votesBefore = (await store.listKeys('vote:')).length;
  await data.ensureSeeded();
  ck('a later ensureSeeded is a no-op', (await store.listKeys('vote:')).length === votesBefore);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
