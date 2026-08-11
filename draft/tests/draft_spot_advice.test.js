'use strict';
// THE DRAFT-SPOT PAGE, IN THE STATES IT PASSES THROUGH ON THE DAY.
//
// Every owner claims a draft position one at a time, and the page tells them
// which open spot gets them on the board soonest for each keeper count. That
// advice is only worth anything if it excludes spots already gone, and it is
// only checkable if the snake arithmetic behind it is right — a late spot picks
// EARLIER than spot #1 once you are keeping players, which is the whole reason
// the card exists.
//
// The advice itself was sound in every state. What was not: the card was gated
// on "has the selection started", not on "is there anything left to choose", so
// after the last owner claimed a spot it kept asking "Which Spot Should You
// Take?", kept explaining the trade-off, and kept closing with "Tap one to jump
// to that spot on the board" — with every button gone, under a banner that
// already said the order was set. Permanently, for the rest of the season.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const H = require(path.join(ROOT, 'src', 'helpers'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const flat = h => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

// The snake, computed here independently of the view: in an odd round the slot
// picks in order, in an even round it reverses. Keeper #k costs round k, so
// with k keepers the first live selection is round k+1.
const N = 10;
const posInRound = (slot, r) => (r % 2 === 1 ? slot : (N + 1 - slot));
const firstPick = (slot, k) => (k) * N + posInRound(slot, k + 1);

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);
  const active = owners.filter(o => o.active).slice(0, N);
  const year = H.currentSeason(await store.get('seasons')).year;

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');

  // `taken` maps position-in-queue -> claimed slot. Cory is active[0].
  const render = async taken => {
    await store.set(`draft:${year}`, { order: active.map((o, i) =>
      ({ owner_id: o.id, slot: taken[i] === undefined ? null : taken[i] })) });
    const r = await fetch(base + '/draft', { headers: { cookie } });
    return { status: r.status, t: flat(await r.text()) };
  };
  const advice = t => Object.fromEntries([...t.matchAll(/Keep (\d)(?: \(you\))? Spot #(\d+) first pick #(\d+)/g)]
    .map(m => [Number(m[1]), { slot: Number(m[2]), pick: Number(m[3]) }]));

  // ── 1) THE SNAKE. The advice must be the best OPEN slot, by the arithmetic
  // computed independently above.
  const cases = [
    ['nothing taken yet', []],
    ['the keep-1 optimum is gone', [10]],
    ['both ends are gone', [10, 1]],
    ['most of the board is gone', [10, 1, 9, 2, 8, 3, 7]],
  ];
  for (const [label, taken] of cases) {
    const { status, t } = await render(taken);
    ck(`[${label}] the page renders`, status === 200);
    const got = advice(t);
    const open = [];
    for (let s = 1; s <= N; s++) if (!taken.includes(s)) open.push(s);
    ck(`[${label}]   it offers a spot for each keeper count`,
      Object.keys(got).length === 4, got);
    for (let k = 0; k <= 3; k++) {
      const best = open.slice().sort((a, b) => firstPick(a, k) - firstPick(b, k))[0];
      ck(`[${label}]   keep ${k}: the earliest OPEN first pick`,
        got[k] && got[k].slot === best && got[k].pick === firstPick(best, k),
        { shown: got[k], expected: { slot: best, pick: firstPick(best, k) }, open });
    }
    ck(`[${label}]   and never a spot that is already taken`,
      Object.values(got).every(v => !taken.includes(v.slot)), { got, taken });
  }

  // ── 2) THE ORDER IS SET. Nothing left to choose, so nothing may be asked.
  {
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { t } = await render(all);
    ck('with every spot taken, the page does not ask a question it cannot answer',
      !/Which Spot Should You Take/.test(t), (t.match(/Which Spot[^.]*\./) || [])[0]);
    ck('  nor tell you to tap a button that is not there',
      !/Tap one to jump/.test(t), (t.match(/Tap one[^.]*\./) || [])[0]);
    ck('  it says where YOU are picking instead',
      /Where You're Picking/.test(t) && /You have Spot #1\b/.test(t),
      (t.match(/Where You're Picking[\s\S]{0,120}/) || [])[0]);
    // Cory took slot 1 and keeps none: first pick #1, and one keeper would push
    // it to spot 1's round-2 pick, which in a snake is #20.
    ck('  with the first-pick arithmetic the board itself uses',
      new RegExp(`first live selection is #${firstPick(1, 0)}\\b`).test(t)
      && new RegExp(`move it to #${firstPick(1, 1)}\\b`).test(t),
      { expect_first: firstPick(1, 0), expect_next: firstPick(1, 1),
        line: (t.match(/first live selection[^.]*\./) || [])[0] });
  }

  // ── 3) THE SAME PAGE FOR SOMEONE WHO KEEPS. The cost of a keeper is the
  // whole point of the card, so it has to move when the keeper count does.
  {
    await store.set(`keepers:${year}:${cory.id}`, { players: ['Bijan Robinson', 'Puka Nacua'] });
    const { t } = await render([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    ck('fixture check: the viewer really is carrying keepers',
      /2 keepers on your card/.test(t), (t.match(/keepers? on your card/) || [])[0]);
    ck('  two keepers cost rounds 1–2, so the first pick is the round-3 one',
      new RegExp(`first live selection is #${firstPick(1, 2)}\\b`).test(t)
      && /1st of Round 3/.test(t),
      { expect: firstPick(1, 2), line: (t.match(/first live selection[^.]*\./) || [])[0] });
    ck('  and it prices one fewer as well as one more',
      new RegExp(`move it to #${firstPick(1, 3)}\\b`).test(t)
      && new RegExp(`one fewer, to #${firstPick(1, 1)}\\b`).test(t),
      { more: firstPick(1, 3), fewer: firstPick(1, 1),
        line: (t.match(/Keeping one more[^.]*\./) || [])[0] });
    await store.del(`keepers:${year}:${cory.id}`);
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
