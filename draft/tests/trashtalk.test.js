'use strict';
// TRASH TALK — posts welded to a specific game (season+week+owner pair),
// permanent, archived. Pure engine + the HTTP round trip over the real app.
//
// ── RED ON main SINCE 2026-08-16 ~23:01, CI ONLY, THREE OF SIX HTTP CLAUSES ─
//
// Same fix as `matchup_placed_bet.test.js`, and the verified mechanism is the
// SAME root cause, not a second bug: the posts below go to `week: 1`, and
// `/matchup`'s trash-talk read is keyed on `weekNo`, which falls through
// `liveMatchup.week || sData.week || 1`. The moment `sleeper.bundle()`
// returns anything, a real `/v1/state/nfl` week overrides the `1` fallback
// and the thread lookup reads a week nobody posted to. No owner mapping is
// involved and the opponent pairing was never the problem — the posts
// themselves land in the right game every time (the engine assertions above
// are network-independent and stayed green); only the PAGE's read of "this
// week's thread" was looking at the wrong week.
//
// `src/seed-data.js` hardcodes a real league id identical in every
// environment, so the only thing that differs is whether the fetch reaches
// the network. REPRODUCED locally with a mock `/v1/state/nfl` reporting
// `week: 3`: same 24-passed/3-failed split as the CI logs, same three names.
//
// SLEEPER_BASE MUST BE SET BEFORE THE REQUIRE — `sleeper.js` reads
// `process.env.SLEEPER_BASE` once, at module load.
process.env.SLEEPER_BASE = 'http://127.0.0.1:1';
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const TT = require(path.join(ROOT, 'src', 'routes', 'trashtalk'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + (typeof d === 'string' ? d : JSON.stringify(d)) : ''))); };

(async function () {
  // ═══════════════ ENGINE ═══════════════
  const gid = TT.gameId(4, 2);                       // low-first, same as pick'em
  ck('gameId matches pick\'em (low first)', gid === '2:4', gid);

  const p1 = await TT.post(2026, 3, gid, 2, '  you are getting run off the field  ');
  ck('post trims + stores', p1 && p1.body === 'you are getting run off the field' && p1.owner_id === 2);
  const empty = await TT.post(2026, 3, gid, 2, '   ');
  ck('empty body is rejected', empty === null);
  await TT.post(2026, 3, gid, 4, 'talk after you actually win one');

  const thread = await TT.forGame(2026, 3, gid);
  ck('forGame returns both posts', thread.length === 2, thread.length);
  ck('thread is oldest-first', thread[0].owner_id === 2 && thread[1].owner_id === 4);
  ck('concurrent posts both survive (per-post docs)', new Set(thread.map(p => p.id)).size === 2);
  ck('count matches', (await TT.countForGame(2026, 3, gid)) === 2);

  // a different game is isolated
  await TT.post(2026, 3, TT.gameId(1, 9), 1, 'unrelated');
  ck('posts are isolated per game', (await TT.forGame(2026, 3, gid)).length === 2);

  const arch = await TT.archiveForSeason(2026);
  ck('archiveForSeason gathers the whole season', arch.length === 3, arch.length);
  ck('long bodies are capped', (await TT.post(2026, 3, gid, 2, 'x'.repeat(999))).body.length === TT.CFG.MAX_LEN);

  // ═══════════════ HTTP ═══════════════
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const rich = owners.find(o => o.name === 'Richard');
  for (const o of [cory, rich]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));
  const cc = await login('cory'), rc = await login(rich.username);
  const get = async (p, ck) => { const r = await fetch(b + p, { headers: { Cookie: ck }, redirect: 'manual' }); return { status: r.status, body: r.status === 200 ? await r.text() : '' }; };
  const post = async (p, ck, body) => { const r = await fetch(b + p, { method: 'POST', headers: { Cookie: ck, 'Content-Type': 'application/x-www-form-urlencoded' }, body, redirect: 'manual' }); return { status: r.status, loc: r.headers.get('location') }; };

  // Cory talks trash on his game vs Richard
  const r1 = await post('/matchup/trash', cc, `opp=${rich.id}&week=1&body=${encodeURIComponent('hope you like losing, Richard')}`);
  ck('POST /matchup/trash redirects back to the game', r1.status === 302 && new RegExp('opp=' + rich.id).test(r1.loc || ''), r1.loc);

  // it shows on the matchup page for that game, attributed
  const page = await get(`/matchup?opp=${rich.id}`, cc);
  ck('the post renders on the matchup page', /hope you like losing, Richard/.test(page.body), 'missing');
  ck('Trash Talk section is present', /Trash Talk/.test(page.body));

  // Richard sees it too (league-visible) and can reply on the same game
  const richView = await get(`/matchup?opp=${cory.id}`, rc);
  ck('the other party sees the same thread (league-visible)', /hope you like losing, Richard/.test(richView.body));
  await post('/matchup/trash', rc, `opp=${cory.id}&week=1&body=${encodeURIComponent('big words for a benchwarmer')}`);
  const page2 = await get(`/matchup?opp=${rich.id}`, cc);
  ck('both sides of the thread persist on the one game', /hope you like losing/.test(page2.body) && /big words for a benchwarmer/.test(page2.body));

  // ═══════════════ ORDER, ON A RECORD THAT IS PERMANENT ═══════════════
  // "thread is oldest-first" above passed most of the time and failed under
  // load — the two posts landed in the SAME MILLISECOND, created_at compared
  // equal, and the order fell through to listKeys, which is directory order.
  // A guard that is right by coincidence is not a guard, and the page sells
  // this thread as "on the record, forever".
  {
    const g = TT.gameId(7, 8);
    // Posted in one tick with no await between, so they share a millisecond by
    // construction rather than by luck.
    const burst = await Promise.all(['first', 'second', 'third', 'fourth', 'fifth']
      .map((b, i) => TT.post(2026, 9, g, i + 1, b)));
    const stamps = new Set(burst.map(p => p.created_at));
    ck('fixture check: the burst really does collide on the timestamp',
      stamps.size < burst.length, { distinct: stamps.size, posted: burst.length });

    // The property is that the thread's order does NOT depend on the order the
    // store hands the keys back. Calling it twice cannot show that — the local
    // file store lists a directory the same way every time, so a broken
    // implementation looks stable here and only reorders on a store that
    // doesn't (Netlify Blobs makes no such promise). So: hand the keys back
    // REVERSED and require the same thread.
    const reversed = async fn => {
      const real = store.listKeys;
      store.listKeys = async (...args) => (await real.call(store, ...args)).slice().reverse();
      try { return await fn(); } finally { store.listKeys = real; }
    };
    const a = await TT.forGame(2026, 9, g);
    const b = await reversed(() => TT.forGame(2026, 9, g));
    ck('a thread returns every post', a.length === burst.length, a.length);
    ck('  the thread reads the same whatever order the store lists keys in',
      a.map(p => p.id).join() === b.map(p => p.id).join(),
      JSON.stringify({ listed: a.map(p => p.body), reversed: b.map(p => p.body) }));
    ck('  and the order is total — no two posts tie',
      new Set(a.map(p => p.created_at + '|' + p.id)).size === a.length);
    // ═══ THE COIN FLIP, PINNED (root cause of the integrate.sh rollback) ═══
    // Stability across renders was never the whole property: same-millisecond
    // posts also tied on newId()'s Date.now() prefix, so their relative order
    // fell to the id's RANDOM suffix — a write-time coin flip against arrival
    // order that no re-read could ever reproduce (the ids re-sort the same
    // way every time, which is why 8/8 re-runs looked green after a red).
    // `seq` now records true arrival order; this asserts the burst renders in
    // exactly the order it was posted, which before the fix had ~50% odds per
    // adjacent same-ms pair of being inverted.
    ck('  a same-millisecond burst renders in ARRIVAL order, not id-suffix order',
      a.map(p => p.body).join() === 'first,second,third,fourth,fifth',
      a.map(p => p.body));
    ck('  fixture check: seq is strictly increasing across the burst',
      burst.every((p, i) => i === 0 || p.seq > burst[i - 1].seq),
      burst.map(p => p.seq));
    // The season archive reads the same posts with NO key sort in front of it,
    // so the tie-break is the only thing holding it together.
    const arcA = (await TT.archiveForSeason(2026)).filter(p => p.game_id === g);
    const arcB = (await reversed(() => TT.archiveForSeason(2026))).filter(p => p.game_id === g);
    ck('  the season archive is ordered the same way, and just as stably',
      arcA.map(p => p.id).join() === arcB.map(p => p.id).join()
      && arcA.map(p => p.id).join() === a.map(p => p.id).join(),
      JSON.stringify({ archive: arcA.map(p => p.body), reversed: arcB.map(p => p.body) }));

    // Distinct timestamps must still come back in real chronological order.
    await new Promise(r => setTimeout(r, 5));
    const late = await TT.post(2026, 9, g, 9, 'and another thing');
    const after = await TT.forGame(2026, 9, g);
    ck('  a later post lands last, not wherever the store filed it',
      after[after.length - 1].id === late.id, after.map(p => p.body));

    // THE CAP. It sliced keys in store order and sorted afterwards, so an
    // over-cap thread showed an arbitrary subset. Lowered here rather than
    // writing 200 posts; the code path is the same one.
    // TWO ORDERS IN ONE FUNCTION. `post` reads the clock twice — newId() via
    // Date.now(), created_at via new Date() — so the pair can straddle a
    // millisecond and id order can disagree with created_at order. While the
    // cap was applied in key (id) order and the thread rendered in created_at
    // order, the two picked different posts at the boundary; that is what made
    // this suite fail intermittently under load. Forced here rather than waited
    // for, on a game of its own so it disturbs nothing else: two posts with
    // genuinely distinct timestamps, then their created_at swapped, so id order
    // and created_at order MUST disagree.
    {
      const g2 = TT.gameId(5, 6);
      const first = await TT.post(2026, 9, g2, 5, 'earlier by the clock');
      await new Promise(r => setTimeout(r, 5));
      const second = await TT.post(2026, 9, g2, 6, 'later by the clock');
      const keyOf = pp => `trash:2026:9:${g2}:${pp.id}`;
      const d1 = await store.get(keyOf(first)), d2 = await store.get(keyOf(second));
      const t1 = d1.created_at; d1.created_at = d2.created_at; d2.created_at = t1;
      await store.set(keyOf(first), d1); await store.set(keyOf(second), d2);

      const th = await TT.forGame(2026, 9, g2);
      ck('  fixture check: id order and created_at order now disagree',
        String(first.id).localeCompare(String(second.id)) < 0
        && String(d1.created_at).localeCompare(String(d2.created_at)) > 0,
        { ids: [first.id, second.id], stamps: [d1.created_at, d2.created_at] });
      ck('  the thread follows created_at, not the id its key is built from',
        th.length === 2 && th[0].id === second.id && th[1].id === first.id,
        { order: th.map(x => x.body) });
      // And the cap, which used to be applied in the OTHER order, agrees.
      const realCap2 = TT.CFG.MAX_PER_GAME;
      TT.CFG.MAX_PER_GAME = 1;
      const cap1 = await TT.forGame(2026, 9, g2);
      TT.CFG.MAX_PER_GAME = realCap2;
      ck('  and the cap keeps the newest by that SAME order',
        cap1.length === 1 && cap1[0].id === first.id, { kept: cap1.map(x => x.body) });
    }

    const realCap = TT.CFG.MAX_PER_GAME;
    TT.CFG.MAX_PER_GAME = 3;
    const capped = await TT.forGame(2026, 9, g);
    TT.CFG.MAX_PER_GAME = realCap;
    ck('  over the cap it keeps the NEWEST posts, still oldest-first',
      capped.length === 3 && capped[2].id === late.id
      && capped.map(p => p.id).join() === after.slice(-3).map(p => p.id).join(),
      { capped: capped.map(p => p.body), tail: after.slice(-3).map(p => p.body) });
  }

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
