'use strict';
// TWO PAGES READ THE SAME HEAD-TO-HEAD. ONE OF THEM SAID IT NEVER HAPPENED.
//
// /matchup resolves each owner to a Sleeper user_id, preferring the LIVE bundle
// ("authoritative when present; the name map is the offline fallback — both
// proven to agree"). When they do not agree, the failure is silent and
// confident: uidOf returns a perfectly well-formed user_id the harvest has
// never seen, headToHead faithfully reports played:0 for it, and the page
// prints
//
//   "No games on record against Marian yet — this is your first meeting since
//    the box scores begin (2023)."
//
// for a pair with FIVE meetings that /rivalry, reading the same archive by
// name, lists in full. A zero from an id that matches nothing is not a record
// of nothing — headToHead returns the identical shape either way, so nothing
// downstream could tell them apart.
//
// The live id is now only trusted when the archive knows it, and the page can
// say "we could not place you two" instead of asserting a first meeting.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'h2ha-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const H2H = require(path.join(ROOT, 'src', 'routes', 'h2h'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const flat = h => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const recOf = t => (t.match(/(You|\w+) leads? (\d+)–(\d+)/) || []).slice(1, 4);
const metOf = t => (t.match(/(\d+) meetings?, (\d{4})–(\d{4})/) || (t.match(/(\d+) games? · (\d{4})–(\d{4})/) || [])).slice(1, 4);

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const marian = owners.find(o => o.name === 'Marian');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  const active = owners.filter(o => o.active).slice(0, 10);
  await store.set('owners', owners);
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid; cfg.sleeper_map = {};
  active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);
  const SEASON = String(H.currentSeason(await store.get('seasons')).year);

  // A live bundle whose user_ids are NOT the ids the archive was harvested
  // under. That is the whole condition, and it is stated as a fixture check
  // below because without it none of this can fail.
  const putBundle = async () => store.set('sleeper-cache', {
    league_id: lid, fetched_at: Date.now(),
    data: { state: { week: 7, season: SEASON },
      league: { name: 'MFGA', season: SEASON, total_rosters: 10 },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
      rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i, settings: { wins: 4, losses: 3, fpts: 700 + i * 11 } })),
      matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 100 })),
      week: 7 } });

  const archiveIds = new Set(Object.values(H2H.handleUserIds() || {}));
  ck('fixture check: the live bundle\'s ids are NOT the archive\'s ids',
    !archiveIds.has('u0') && !archiveIds.has('u1'), { sample: [...archiveIds].slice(0, 2) });
  ck('fixture check: and this pair really does have a history to lose',
    H2H.headToHead(H2H.userIdForName('Cory'), H2H.userIdForName('Marian')).played >= 2,
    H2H.headToHead(H2H.userIdForName('Cory'), H2H.userIdForName('Marian')).played);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const get = async r => flat(await (await fetch(base + r, { headers: { cookie } })).text());

  // ── 1) WITH the mismatched live bundle: the two pages must still agree.
  {
    await putBundle();
    const m = await get('/matchup?opp=' + marian.id);
    const r = await get('/rivalry?a=Cory&b=Marian');
    ck('with a live bundle, /matchup does not claim a first meeting',
      !/No games on record/.test(m), (m.match(/No games on record[^.]*\./) || [])[0]);
    ck('  /matchup and /rivalry report the same record',
      recOf(m).length === 3 && recOf(m).join('-') === recOf(r).join('-'),
      { matchup: recOf(m), rivalry: recOf(r) });
    ck('  and the same number of meetings, over the same seasons',
      metOf(m).length === 3 && metOf(m).join('-') === metOf(r).join('-'),
      { matchup: metOf(m), rivalry: metOf(r) });
  }

  // ── 2) WITHOUT a live bundle the name map was always used, and that path was
  // never broken. It has to keep giving the same answer.
  //
  // THIS ARM WAS THE ONLY PLACE IN THE SUITE THAT WAS ACTUALLY ONLINE, and it
  // was the one named "offline". `store.del('sleeper-cache')` removes the CACHE;
  // it does not stop a REFETCH. In a sandbox the refetch 403s and the path
  // really is offline, so it passed locally for everyone. In CI the refetch
  // SUCCEEDS, so this arm ran against real Sleeper ids and had been red for
  // 30+ consecutive runs — asserting a precondition it never established.
  //
  // So the precondition is now ESTABLISHED and then PROVEN: Sleeper's host is
  // blocked for the duration, and the arm asserts both that a refetch was
  // attempted-and-refused and that no bundle came back. Only the Sleeper host
  // is blocked — the suite talks to its own server over the same `fetch`, and a
  // blanket block would break the test rather than the network.
  {
    const realFetch = global.fetch;
    let blocked = 0;
    global.fetch = async (u, o) => {
      if (String((u && u.url) || u).includes('sleeper.app')) {
        blocked++;
        throw new Error('network disabled: this is the OFFLINE arm');
      }
      return realFetch(u, o);
    };
    try {
      await store.del('sleeper-cache');
      const m = await get('/matchup?opp=' + marian.id);
      const r = await get('/rivalry?a=Cory&b=Marian');

      // THE PRECONDITION, ASSERTED RATHER THAN ASSUMED. Without this the arm
      // means "offline" on one machine and "online" on another, which is how it
      // came to be red in exactly one place for a month.
      //
      // "No cache entry" is the WRONG test and my first version used it. On a
      // failed fetch `src/sleeper.js` writes a NEGATIVE entry —
      // `{fetched_at: 0, failed_at: <ts>, data: null}` — so it does not hammer
      // the API on every request. That is correct behaviour and it means an
      // entry EXISTS while the path is genuinely offline. What offline actually
      // means here is that no live DATA came back, so that is what is checked.
      const after = await store.get('sleeper-cache');
      ck('  the offline arm is ACTUALLY offline (refetch refused, no live data)',
        blocked > 0 && (after == null || after.data == null),
        { sleeper_fetches_blocked: blocked,
          cached_data: after == null ? '(no entry)'
            : (after.data == null ? null : 'LIVE DATA PRESENT — not offline') });

      ck('offline, the two pages still agree',
        recOf(m).length === 3 && recOf(m).join('-') === recOf(r).join('-'),
        { matchup: recOf(m), rivalry: recOf(r) });
    } finally {
      global.fetch = realFetch;
    }
  }

  // ── 2b) THE DEFECT THE CI FAILURE WAS ACTUALLY EXPOSING, REPRODUCED WITHOUT
  // THE NETWORK.
  //
  // Fixing arm 2 above closes the environment difference. It does NOT close what
  // arm 2 was accidentally catching: with a live bundle whose ids the archive
  // DOES know, the two pages resolve an owner by different rules and can report
  // different records for the same pair. `/matchup` prefers the live id when the
  // archive knows it; `/rivalry` reads the name map only — no live id, no alias,
  // no fallback (`src/routes/member.js:1101` against `:2069`).
  //
  // Arm 1 cannot catch it, because its live ids are ones the archive has never
  // seen, so `/matchup` correctly declines them and both pages land on the name
  // map. The condition needs a live id that is BOTH archive-known AND the wrong
  // person — which is exactly what a real Sleeper response supplies and a
  // synthetic `u0..u9` bundle never can.
  //
  // ⚠ THIS ARM IS EXPECTED TO FAIL UNTIL THE TWO PAGES SHARE ONE RESOLVER. That
  // is B's lane (`src/routes/member.js`) and is routed, not worked around here.
  // It is deliberate that it fails LOCALLY: the old failure only appeared in CI,
  // so the person who has to fix it could not see it.
  {
    const idCory = H2H.userIdForName('Cory');
    const idMarian = H2H.userIdForName('Marian');
    const mine = H2H.headToHead(idCory, idMarian);
    // An archive-known id belonging to SOMEBODY ELSE, whose record against Cory
    // differs from Marian's — searched rather than hardcoded, so the fixture
    // cannot quietly stop being adversarial when the archive grows.
    const decoy = [...archiveIds].find(id => {
      if (!id || id === idCory || id === idMarian) return false;
      const h = H2H.headToHead(idCory, id);
      return h && (h.played !== mine.played || h.wins !== mine.wins);
    });
    ck('fixture check: an archive-known id exists that is the WRONG person',
      decoy != null, { decoy, marian: idMarian });

    if (decoy) {
      await store.set('sleeper-cache', {
        league_id: lid, fetched_at: Date.now(),
        data: { state: { week: 7, season: SEASON },
          league: { name: 'MFGA', season: SEASON, total_rosters: 10 },
          // Marian's seat carries an id the archive KNOWS and that is not his.
          users: active.map((o, i) => ({
            user_id: o.id === marian.id ? decoy : 'u' + i, display_name: o.name })),
          rosters: active.map((o, i) => ({
            roster_id: i + 1, owner_id: o.id === marian.id ? decoy : 'u' + i,
            settings: { wins: 4, losses: 3, fpts: 700 + i * 11 } })),
          matchups: active.map((o, i) => ({
            roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 100 })),
          week: 7 } });

      const m = await get('/matchup?opp=' + marian.id);
      const r = await get('/rivalry?a=Cory&b=Marian');
      ck('an archive-known live id for the WRONG person does not split the pages',
        recOf(m).length === 3 && recOf(m).join('-') === recOf(r).join('-'),
        { matchup: recOf(m), rivalry: recOf(r),
          why: 'the two pages resolve the same owner by different rules' });
    }
  }

  // ── 3) AN OWNER THE ARCHIVE CANNOT PLACE AT ALL. Neither the live id nor the
  // name resolves, so there is no record to show — and no basis for saying
  // these two have never met.
  {
    const all = await store.get('owners');
    const target = all.find(o => o.id === marian.id);
    const realName = target.name;
    target.name = 'Zzyzx'; target.alias = null;
    await store.set('owners', all);
    await putBundle();
    ck('fixture check: that name really is unknown to the archive',
      H2H.userIdForName('Zzyzx') == null, H2H.userIdForName('Zzyzx'));

    const m = await get('/matchup?opp=' + marian.id);
    ck('an owner we cannot place is not reported as never having played',
      !/No games on record/.test(m) && !/first meeting/.test(m),
      (m.match(/(No games on record|Couldn't match)[^.]*\./) || ['(neither line present)'])[0]);
    ck('  the page says it is a lookup problem, in those words',
      /Couldn't match you and/.test(m) && /not a record of no meetings/.test(m),
      (m.match(/Couldn't match[^.]*\./) || ['(absent)'])[0]);

    target.name = realName; await store.set('owners', all);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
