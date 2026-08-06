// Weekly automatic snapshot of every league document into Blobs under
// backup:<date>. Keeps the 12 most recent and prunes the rest, so the books
// survive a bad click, a bad migration, or a bad Tuesday. Scheduled in
// netlify.toml — no setup required, no external service.
const store = require('../../src/store');

const KEEP = 12;
const PREFIXES = ['draft:', 'keepers:', 'vote:', 'ballot:', 'vcomment:', 'punish:', 'pvote:', 'chat:'];
const SINGLES = ['config', 'owners', 'seasons', 'ledger', 'alerts', 'history'];

exports.handler = async (event) => {
  store.initBlobs(event);
  try {
    const dump = { taken_at: new Date().toISOString(), docs: {} };
    for (const key of SINGLES) dump.docs[key] = await store.get(key);
    for (const prefix of PREFIXES) {
      for (const key of await store.listKeys(prefix)) dump.docs[key] = await store.get(key);
    }
    if (dump.docs.config) delete dump.docs.config.secret; // never snapshot the session key

    const stamp = dump.taken_at.slice(0, 10);
    await store.set(`backup:${stamp}`, dump);

    // Prune: keys sort lexicographically, which for ISO dates is chronological.
    const all = (await store.listKeys('backup:')).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP))) await store.del(old);

    const count = Object.keys(dump.docs).length;
    console.log(`backup ${stamp}: ${count} docs, ${all.length} snapshots retained`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, stamp, docs: count }) };
  } catch (e) {
    console.error('backup failed:', e.message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
