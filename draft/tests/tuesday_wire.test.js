/* THE TUESDAY WIRE ALERT (task 36, Cory's 08-24 "fastest on news" mandate) —
 * wirePayload's actionability decisions and the real email through the
 * intercepted provider (the sunday_why.test.js pattern: never trust the
 * template, read what would actually be sent).
 */
'use strict';
process.env.DATA_DIR = require('fs').mkdtempSync(
  require('path').join(require('os').tmpdir(), 'tueswire-'));

const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { wirePayload } = require(path.join(ROOT, 'netlify', 'functions', 'waiver-reco-cron'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + '  -> ' + JSON.stringify(d))); };

const ridName = rid => ({ 3: 'Richard', 7: 'David' })[rid] || `team ${rid}`;

// ── actionability ───────────────────────────────────────────────────────────
const fullReco = {
  live: true,
  claims: [{ player_id: 'f1', name: 'Wire Back', position: 'RB', net_value: 6.2, dollars: 41 }],
  drop: { player_id: 'm9', name: 'Bench Body' },
  streamClaims: [{ player_id: 'DEN', name: 'Broncos', position: 'DEF', net_value: 3.1 }],
  blockWatch: [{ player_id: 'f9', name: 'Hole Filler', position: 'K', proj_mean: 118,
                 denies: [3, 7], my_net_value: null }],
  myInjured: [{ player_id: 'm2', name: 'Star Back', position: 'RB', tag: 'OUT', out: true },
              { player_id: 'm5', name: 'Slot Guy', position: 'WR', tag: 'Q', out: false }],
};
const p1 = wirePayload(fullReco, 3, ridName);
ck('a positive claim makes the week actionable', p1.actionable === true, p1);
ck('block-watch rid lists become NAMES for the inbox',
  p1.blockWatch[0].denies_names.join(',') === 'Richard,David', p1.blockWatch[0]);
ck('the drop rides with the claim', p1.topClaim.drop && p1.topClaim.drop.name === 'Bench Body', p1.topClaim);

const quiet = wirePayload({ live: true, claims: [], streamClaims: [], blockWatch: [],
  myInjured: [{ name: 'Slot Guy', position: 'WR', tag: 'Q', out: false }] }, 3, ridName);
ck('a Questionable tag alone is NOT actionable (Q is Sunday business, not Tuesday)',
  quiet.actionable === false, quiet);

const injOnly = wirePayload({ live: true, claims: [], streamClaims: [], blockWatch: [],
  myInjured: [{ name: 'Star Back', position: 'RB', tag: 'IR', out: true }] }, 3, ridName);
ck('a hard OUT alone IS actionable — insurance is a Tuesday decision', injOnly.actionable === true, injOnly);

const negClaim = wirePayload({ live: true, claims: [{ name: 'Bad Add', position: 'RB', net_value: -1 }],
  streamClaims: [], blockWatch: [], myInjured: [] }, 3, ridName);
ck('a negative-value claim never headlines an email', negClaim.topClaim === null && !negClaim.actionable, negClaim);

// ── the real email ──────────────────────────────────────────────────────────
(async () => {
  const store = require(path.join(ROOT, 'src', 'store'));
  const data = require(path.join(ROOT, 'src', 'data'));
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.email = 'cory@example.com'; cory.is_commissioner = true; cory.active = true;
  await store.set('owners', owners);

  process.env.RESEND_API_KEY = 'test-key-not-real';
  const realFetch = global.fetch;
  let sent = null;
  global.fetch = async (url, opts) => {
    if (String(url).includes('api.resend.com')) {
      sent = JSON.parse(opts.body);
      return { ok: true, text: async () => '', json: async () => ({}) };
    }
    return realFetch(url, opts);
  };
  const notify = require(path.join(ROOT, 'src', 'notify'));
  const r = await notify.tuesdayWire(owners, p1);
  global.fetch = realFetch;
  delete process.env.RESEND_API_KEY;

  ck('the wire email sends through the real path', r && r.sent === true, r);
  const html = (sent && sent.html) || '';
  ck('…headlining the claim with its points', /Wire Back/.test(html) && /\+6\.2 pts/.test(html), html.slice(0, 160));
  ck('…naming the drop', /drop Bench Body/.test(html), 'drop line missing');
  ck('…carrying the injury news with OUT loud', /Star Back/.test(html) && /OUT/.test(html), 'injury block missing');
  ck('…and the block watch with owner names', /Hole Filler/.test(html) && /Richard, David/.test(html), 'block line missing');
  ck('…the subject prices the claim', /Wire Back \+6\.2 pts before waivers clear/.test(sent.subject), sent.subject);
  ck('…linking to the wire', /\/waivers/.test(html), 'no /waivers link');
  ck('a non-commissioner list refuses', (await notify.tuesdayWire([{ id: 9, name: 'X', active: true }], p1)).skipped === true);

  console.log(`\n${pass}/${pass + fail} tuesday-wire checks passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
