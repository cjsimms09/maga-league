// TERRITORY: A
'use strict';
/* THE BET-CARD GRAMMAR + THE MARKET/ACTION SPLIT — the load-bearing rendered
 * claims of the 2026-08-15 side-bet design pass, pinned the war-room way:
 * boot the real app, seed one bet of every kind in every state, and assert
 * the page says what the store holds.
 *
 * Pinned here:
 *   1. ONE SECTION PER BET — no bet renders twice (the old page rendered an
 *      awaiting-confirm bet in both "Waiting on You" and "On the Books").
 *   2. NEEDS-YOU FIRST — the needs-you block precedes the board and the book,
 *      and contains exactly the four action shapes (answer / confirm /
 *      engine-ready / your draft pick).
 *   3. STATE IS A CHIP, KIND IS A CHIP — the states and kinds render as
 *      labeled chips, not status words buried in a meta line.
 *   4. THE CLOCK IS ON THE CARD — an open offer shows its accept deadline.
 *   5. THE SCORE BUG — a live bet carries the engine's headline with the
 *      working one tap deeper; a decided one carries the one-tap DECLARE
 *      (never a settle): pressing it produces AWAITING_CONFIRM with
 *      source=sleeper, and the other side still confirms. The iron rule
 *      (THE ENGINE NEVER SETTLES A BET) survives the convenience.
 *   6. DIRECT /settle IS COMMISSIONER-ONLY — a party posting it is refused.
 *   7. PAID-FLOW STATES — payer sees "I've paid" (a claim), the page then
 *      says "sent — waiting to confirm"; the receiver sees the claim and
 *      confirms with "Got it".
 */
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bcgram-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 220) : ''))); };
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const active = owners.filter(o => o.active).slice(0, 10);
  const cory = owners.find(o => o.username === 'cory');
  const others = active.filter(o => o.id !== cory.id);
  const [david, rich, marian, michael, sam] = others;
  for (const o of [cory, david, rich, marian, sam]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  // The direct-settle refusal arm needs a PARTY who is NOT the commissioner.
  cory.is_commissioner = true; david.is_commissioner = false;
  await store.set('owners', owners);

  const LID = 'GRAMLEAGUE';
  const cfg = await store.get('config');
  cfg.sleeper_league_id = LID; cfg.sleeper_map = {};
  active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  cfg.season_start = '2026-09-10';
  await store.set('config', cfg);

  // Week 8 "now" rides in on the cache doc the app actually reads; week 5 is
  // final and its points are frozen, so the engine can decide a week-5 bet.
  await store.set('sleeper-cache', {
    league_id: LID, fetched_at: Date.now(),
    data: {
      state: { week: 8 }, week: 8,
      league: { name: 'MFGA', total_rosters: 10, settings: { playoff_week_start: 16, playoff_teams: 4 } },
      users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
      rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
        settings: { wins: 3, losses: 4, ties: 0, fpts: 770, fpts_decimal: 0 } })),
      matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: 50 + i })),
    },
  });
  const wk5 = {};
  active.forEach((o, i) => { wk5[String(o.id)] = o.id === cory.id ? 141.2 : 95 + i; });
  await store.set(`weekpoints:${LID}:5`, { fetched_at: Date.now(), points: wk5 });

  // ── the spread ────────────────────────────────────────────────────────────
  // (a) proposed TO cory — matchup kind, week 9, clock ahead.
  const aBet = await SB.propose({ proposer_id: david.id, party_ids: [cory.id], stake: 25,
    terms: 'David outscores Cory in week 9', kind: 'matchup', week: 9,
    conditions: [{ test: 'outscores', when: 'week', week: 9, subject_id: david.id, target_id: cory.id }] });
  // (b) awaiting cory's confirm — handshake bet, other side declared.
  const bBet = await SB.propose({ proposer_id: rich.id, party_ids: [cory.id], stake: 40,
    terms: 'Loser wears the jersey' });
  await SB.accept(bBet.id, cory.id, cory.name);
  await SB.declareResult(bBet.id, rich.id, rich.name, { winner_ids: [rich.id] });
  // (c) pool draft, cory on the clock.
  const cBet = await SB.propose({ proposer_id: cory.id, party_ids: [rich.id], stake: 100,
    terms: 'The franchise pool', format: 'pool', pool_rules: ['champion'],
    pool_teams: active.map(o => o.id), pool_wins: 'holds the champion' });
  await SB.accept(cBet.id, rich.id, rich.name);
  await SB.startPoolDraft(cBet.id, [cory.id, rich.id], 'Cory picks first.');
  // (d) open market bet by michael — proposition kind.
  const dBet = await SB.propose({ proposer_id: michael.id, open_slots: 1, stake: 30,
    terms: 'Michael makes the playoffs',
    conditions: [{ test: 'finishes', when: 'season', subject_id: michael.id, target_place: 'playoffs' }] });
  // (e) live, engine can't call it — week 10.
  const eBet = await SB.propose({ proposer_id: cory.id, party_ids: [sam.id], stake: 20,
    terms: 'Cory outscores Sam in week 10', kind: 'matchup', week: 10,
    conditions: [{ test: 'outscores', when: 'week', week: 10, subject_id: cory.id, target_id: sam.id }] });
  await SB.accept(eBet.id, sam.id, sam.name);
  // (f) live, engine DECIDED — week 5, cory won on the frozen points.
  const fBet = await SB.propose({ proposer_id: cory.id, party_ids: [marian.id], stake: 35,
    terms: 'Cory outscores Marian in week 5', kind: 'matchup', week: 5,
    conditions: [{ test: 'outscores', when: 'week', week: 5, subject_id: cory.id, target_id: marian.id }] });
  await SB.accept(fBet.id, marian.id, marian.name);
  // (g) settled, unpaid: cory owes david $75.
  const gBet = await SB.propose({ proposer_id: cory.id, party_ids: [david.id], stake: 75,
    terms: 'My QB outpoints yours' });
  await SB.accept(gBet.id, david.id, david.name);
  await SB.settle(gBet.id, [david.id], cory.id, cory.name);

  const server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(base + '/login', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `username=${u}&password=pw`, redirect: 'manual' }));
  const cc = await login('cory');
  const page = async (ckie) => (await fetch(base + '/bank?section=sidebets', { headers: { Cookie: ckie || cc } })).text();
  const post = async (p, ckie, body) => (await fetch(base + p, { method: 'POST',
    headers: { Cookie: ckie, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body || '', redirect: 'manual' })).status;

  let html = await page();
  ck('the page renders without template errors', !/ReferenceError|Cannot read|is not defined/.test(html));

  // 1. one section per bet — each card id appears exactly once.
  for (const b of [aBet, bBet, cBet, dBet, eBet, fBet]) {
    const n = (html.match(new RegExp(`id="bet-${b.id}"`, 'g')) || []).length;
    ck(`bet ${b.terms.slice(0, 24)}… renders exactly once`, n === 1, n);
  }

  // 2. needs-you first, holding exactly the four action shapes.
  const at = s => html.indexOf(s);
  ck('the needs-you block renders with a count', /Needs You/.test(html) && /bc-count/.test(html));
  ck('needs-you precedes the board and the book',
    at('Needs You') > 0 && at('Needs You') < at('On the Board') && at('Needs You') < at('On the Books'),
    { needs: at('Needs You'), board: at('On the Board'), books: at('On the Books') });
  const needsSlice = html.slice(at('Needs You'), at('Who Owes Who'));
  for (const [what, b] of [['answer', aBet], ['confirm', bBet], ['engine-ready', fBet], ['draft pick', cBet]]) {
    ck(`needs-you contains the ${what} bet`, needsSlice.includes(`id="bet-${b.id}"`));
  }
  ck('the merely-live bet is NOT in needs-you', !needsSlice.includes(`id="bet-${eBet.id}"`));

  // 3. state chips + kind chips.
  for (const s of ['YOUR ANSWER', 'CONFIRM NEEDED', 'READY TO SETTLE', 'YOUR PICK', 'LIVE', 'OPEN — TAKE IT', 'SETTLED']) {
    ck(`state chip "${s}" renders`, html.includes(s));
  }
  for (const k of ['⚔️ MATCHUP', '🏆 POOL', '📐 PROPOSITION', '🤝 HANDSHAKE']) {
    ck(`kind chip "${k}" renders`, html.includes(k));
  }

  // 4. the clock is on the offer card.
  ck('an open offer shows its accept deadline on the card',
    /accept before [A-Z][a-z]{2} \d+, \d+:\d{2} [AP]M ET/.test(html.replace(/&nbsp;/g, ' ')),
    (html.match(/accept before[^<]*/) || [])[0]);

  // 5. the score bug: live shows the engine's read; decided shows the one-tap.
  ck('a live undecided bet carries the ⏳ engine bug with its working behind a tap',
    /⏳ ENGINE/.test(html) && /the working — every number it used/.test(html));
  ck('a decided bet carries the ⚖️ bug and the one-tap DECLARE',
    /⚖️ ENGINE/.test(html) && /Offer this result — Cory wins/.test(html));
  ck('  and says the other side still confirms',
    /the other side still confirms\. Nothing settles on its own\./.test(html));

  // The one-tap DECLARES (source: sleeper), never settles.
  await post(`/sidebets/${fBet.id}/settle-auto`, cc);
  let f2 = await SB.get(fBet.id);
  ck('one tap → AWAITING_CONFIRM, never SETTLED', f2.status === 'awaiting_confirm', f2.status);
  ck('  the declaration is source-tagged sleeper', f2.declared && f2.declared.source === 'sleeper', f2.declared);
  const mc = await login(marian.username);
  const mView = await page(mc);
  ck('  the other side sees the auto-detected confirm card',
    /auto-detected from Sleeper/.test(mView) && /Confirm &amp; settle/.test(mView));
  await post(`/sidebets/${fBet.id}/confirm`, mc);
  f2 = await SB.get(fBet.id);
  ck('  and the HUMAN confirm is what settles it', f2.status === 'settled' && f2.winner_ids[0] === cory.id, f2.status);

  // 6. direct /settle: a party is refused, the commissioner may adjudicate.
  const dc = await login(david.username);
  await post(`/sidebets/${eBet.id}/settle`, dc, `winner=${david.id}`);
  let e2 = await SB.get(eBet.id);
  ck('a party posting direct /settle is refused (still locked)', e2.status === 'locked', e2.status);
  ck('  and the party view carries no by-hand settle control', !/(Adjudicate: settle by hand)/.test(await page(dc)));
  await post(`/sidebets/${eBet.id}/settle`, cc, `winner=${sam.id}`);
  e2 = await SB.get(eBet.id);
  ck('the commissioner CAN adjudicate by hand', e2.status === 'settled' && e2.winner_ids[0] === sam.id, e2.status);
  await SB.reopen(eBet.id, cory.id, cory.name);   // put it back for the record

  // 7. paid-flow states on the page.
  html = await page();
  ck('the payer sees "I\'ve paid" (the claim button), not a settle switch',
    /I've paid|I&#39;ve paid/.test(html));
  await post(`/sidebets/${gBet.id}/leg/${(await SB.get(gBet.id)).legs[0].id}`, cc);
  html = await page();
  ck('after the claim the page says sent — waiting to confirm',
    html.includes(`sent — waiting on ${david.name} to confirm`));
  const dView = await page(dc);
  ck('the receiver sees the claim and the Got-it confirm',
    /says they've paid|says they&#39;ve paid/.test(dView) && /Got it/.test(dView));
  await post(`/sidebets/${gBet.id}/leg/${(await SB.get(gBet.id)).legs[0].id}`, dc);
  const g2 = await SB.get(gBet.id);
  ck('the receiver\'s Got-it is what settles the leg', g2.legs[0].paid === true);

  // 8. the nav badge counts the draft pick as waiting.
  ck('awaiting() counts a pool draft blocked on your pick',
    SB.awaiting(await SB.all(), cory.id).some(b => b.id === cBet.id));

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
