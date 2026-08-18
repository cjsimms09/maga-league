// TERRITORY: A
'use strict';
// THE FORGOT-TO-RESCIND GATE — Cory's scenario (2026-08-16), tested at the
// real HTTP doors: "avoid someone accepting bet after outcome close to being
// over if someone forgets to rescind."
//
// The enforcement exists in member.js's tooLate() (calendar deadline from
// betlogic.acceptDeadline + the points-on-the-board fact check) on BOTH doors
// — /accept and /take — but until this file it had zero test coverage, and a
// silent regression there is exactly a stolen bet. Also pinned here: an
// EXPIRED proposal drops out of awaiting() (the banner / nav badge / Needs
// You count) instead of nagging forever about a bet the server would refuse
// anyway, and resend() legitimately revives it.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sblate-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const SB = require(path.join(ROOT, 'src', 'sidebets'));
const BL = require(path.join(ROOT, 'src', 'betlogic'));
const sleeper = require(path.join(ROOT, 'src', 'sleeper'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const cookieFrom = r => r.headers.getSetCookie().map(s => s.split(';')[0]).join('; ');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  const other = owners.find(o => o.active && o.id !== cory.id);
  for (const o of [cory, other]) { o.password_hash = hashPassword('pw'); o.must_change_password = false; }
  await store.set('owners', owners);

  // A mutable Sleeper stub: each arm sets the scoreboard it needs. Week 3 of
  // the season, whose real-calendar kickoff is in the future relative to any
  // August/September test run — so the CALENDAR gate stays open and the
  // POINTS-ON-THE-BOARD gate is what each arm exercises, deterministically.
  let boardPoints = 0;
  sleeper.bundle = async () => ({
    week: 3,
    league: { settings: { playoff_week_start: 16, playoff_teams: 4 } },
    users: [], rosters: [],
    matchups: [{ matchup_id: 1, roster_id: 1, points: boardPoints }],
  });
  sleeper.weekPointsByOwner = async () => null;

  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const b = `http://127.0.0.1:${server.address().port}`;
  const login = async u => cookieFrom(await fetch(b + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `username=${u}&password=pw`, redirect: 'manual' }));
  const coryC = await login('cory');
  const post = (url, cookie) => fetch(b + url, { method: 'POST', headers: { Cookie: cookie }, redirect: 'manual' });

  const mkWeekBet = () => SB.propose({
    proposer_id: other.id, party_ids: [cory.id], stake: 20,
    terms: 'I outscore you in week 3', week: 3,
    conditions: [{ test: 'outscores', when: 'week', week: 3, subject_id: other.id, target_id: cory.id }],
  });

  // ── Arm 1: the theft. Offered before kickoff, never rescinded, the week is
  // now scoring — accepting must be REFUSED at the server, not just hidden.
  const stale = await mkWeekBet();
  boardPoints = 87.4;                              // somebody has scored
  const r1 = await post(`/sidebets/${stale.id}/accept`, coryC);
  ck('accept AFTER the week starts scoring is refused (redirect late=1)',
    r1.status === 302 && /late=1/.test(r1.headers.get('location') || ''), r1.headers.get('location'));
  const stale2 = await SB.get(stale.id);
  ck('...and the bet did not move: still proposed, my side not accepted',
    stale2.status === SB.STATUS.PROPOSED
    && !stale2.parties.find(p => p.owner_id === cory.id).accepted);

  // ── Arm 2: the control. Same bet shape, week not yet scoring — accepting works.
  boardPoints = 0;
  const live = await mkWeekBet();
  const r2 = await post(`/sidebets/${live.id}/accept`, coryC);
  const live2 = await SB.get(live.id);
  ck('accept BEFORE any scoring works and locks the bet',
    r2.status === 302 && !/late=1/.test(r2.headers.get('location') || '')
    && live2.status === SB.STATUS.LOCKED);

  // ── Arm 3: the market door enforces the same rule.
  const open = await SB.propose({
    proposer_id: other.id, open_slots: 1, stake: 10,
    terms: 'anyone: I outscore the field in week 3',
    conditions: [{ test: 'scores_at_least', when: 'week', week: 3, subject_id: other.id, target_number: 120 }],
  });
  boardPoints = 12.2;
  const r3 = await post(`/sidebets/${open.id}/take`, coryC);
  const open2 = await SB.get(open.id);
  ck('taking an open bet after the week starts scoring is refused too',
    /late=1/.test(r3.headers.get('location') || '') && open2.status === SB.STATUS.OPEN
    && open2.parties.length === 1);

  // ── Arm 4: a proposal nobody answered in 10 days is expired everywhere the
  // same way — refused at the door AND gone from the needs-you count.
  boardPoints = 0;
  const old = await SB.propose({ proposer_id: other.id, party_ids: [cory.id],
    stake: 30, terms: 'gut-feel handshake, no conditions' });
  const doc = await store.get(`sidebet:${old.id}`);
  doc.created_at = new Date(Date.now() - (BL.CFG.PROPOSAL_MAX_DAYS + 1) * 86400000).toISOString();
  await store.set(`sidebet:${old.id}`, doc);
  ck('the expired proposal really is past its deadline (betlogic agrees)',
    BL.acceptDeadline(await SB.get(old.id)).open === false);
  const r4 = await post(`/sidebets/${old.id}/accept`, coryC);
  ck('accepting the expired proposal is refused at the door',
    /late=1/.test(r4.headers.get('location') || ''));
  const waiting = SB.awaiting(await SB.all(), cory.id).map(x => x.id);
  ck('the expired proposal is NOT in awaiting (no eternal nag for a corpse)',
    !waiting.includes(old.id));
  ck('a live proposal still IS in awaiting (the filter did not over-cull)',
    waiting.includes(stale.id));

  // ── Arm 5: resend() revives it honestly — new clock, back in the queue.
  await SB.resend(old.id, other.id, other.name);
  const waiting2 = SB.awaiting(await SB.all(), cory.id).map(x => x.id);
  ck('resend restarts the clock and the proposal returns to awaiting',
    waiting2.includes(old.id) && BL.acceptDeadline(await SB.get(old.id)).open === true);

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
