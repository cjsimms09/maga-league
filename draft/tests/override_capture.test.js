'use strict';
// THE HUMAN-OVERRIDE LOOP, END TO END — the tap on the optimizer, the ledger
// entry it writes, and the accuracy page that reads it back.
//
// `inseason_override` has been a REGISTERED ledger kind with an enforced
// counterfactual since before the draft, and nothing ever wrote one. The
// optimizer could record only AGREEMENT: "Log this lineup" preserved the call,
// and going against it had no button at all — so every disagreement, which is
// the whole attribution question, left no trace. This asserts the capture
// exists, costs exactly one tap, writes the unrecoverable half, and surfaces.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'override-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const ACC = require(path.join(ROOT, 'src', 'routes', 'accuracy'));
const PL = require(path.join(ROOT, 'src', 'predledger'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 240) : ''))); };

(async () => {
  // ── The kind must be registered, and it must demand a counterfactual. Both
  // were already true; this pins them so the capture can't be silently 400'd.
  ck('inseason_override is a registered ledger kind',
    PL.KINDS ? PL.KINDS.includes('inseason_override') : /inseason_override/.test(fs.readFileSync(path.join(ROOT, 'src', 'predledger.js'), 'utf8')));

  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false; cory.is_commissioner = true;
  await store.set('owners', owners);
  const years = Object.values(await store.get('seasons'));
  const season = String((years.find(y => y.status !== 'complete') || years[years.length - 1]).year);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');

  const lineup = JSON.stringify([{ id: 'p1', name: 'Studly', pos: 'WR', proj: 14.2 }]);
  const post = (url, body) => fetch(base + url, { method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString() });

  // ── THE TAP. One request, carrying only fields the page already holds.
  const r1 = await post('/lineup/override', { week: '3', dollars: '6.4',
    recommended: lineup, confidence: 'start X over Y', reason: 'injury news' });
  ck('the override capture exists and accepts the tap', r1.status >= 200 && r1.status < 400, r1.status);
  ck('  and returns you to the optimizer with a confirmation', /overrode=1/.test(r1.headers.get('location') || ''), r1.headers.get('location'));

  const entries = async () => {
    const keys = (await store.listKeys(`pred:${season}:`)).sort();
    const out = []; for (const k of keys) { const e = await store.get(k); if (e) out.push(e); }
    return out;
  };
  let all = await entries();
  const ov = all.filter(e => e.kind === 'inseason_override');
  ck('a real ledger entry is written', ov.length === 1, all.map(e => e.kind));
  if (ov.length) {
    const p = ov[0].payload || {};
    ck('  it preserves the tool\'s recommendation — the unrecoverable half',
      JSON.stringify(p.recommended) === JSON.stringify(JSON.parse(lineup)), p.recommended);
    ck('  it carries the counterfactual the ledger demands', !!p.counterfactual);
    ck('  it stores the RAW dollar gap, not just a flag', p.gap_dollars === 6.4, p.gap_dollars);
    ck('  it records the reason chosen by the tap itself', p.reason === 'injury news', p.reason);
    ck('  a $6.40 gap is not contested', p.contested === false, p.contested);
    ck('  and the week', p.week === 3, p.week);
  }

  // A near-indifferent call must be flagged contested — an override there costs
  // nothing and should not be scored against the human.
  await post('/lineup/override', { week: '4', dollars: '0.8', recommended: lineup, reason: 'gut' });
  all = await entries();
  const small = all.filter(e => e.kind === 'inseason_override').find(e => (e.payload || {}).week === 4);
  ck('a sub-$2 gap IS flagged contested', small && small.payload.contested === true, small && small.payload);

  // A followed week, for the denominator.
  await post('/lineup/log', { week: '5', dollars: '3', recommended: lineup, counterfactual: lineup });
  all = await entries();
  ck('following the tool is still captured too', all.some(e => e.kind === 'lineup_call'), all.map(e => e.kind));

  // ── THE SURFACE.
  const html = await (await fetch(base + '/lineup/accuracy', { headers: { cookie } })).text();
  ck('the accuracy page is the accuracy page', /Model Accuracy/.test(html) && /predictions logged/.test(html));
  ck('the override card renders from the captured ledger', /Your overrides/.test(html));
  // Assert on the rendered TEXT, not the markup — a regex spanning tags passes
  // or fails on attribute length rather than on what the page says.
  const ovText = ((html.match(/Your overrides[\s\S]{0,2600}/) || [''])[0])
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  ck('  showing how often — 2 of 3 decisions',
    /3 lineup decisions/.test(ovText) && /2 you overrode/.test(ovText) && /67% of the time/.test(ovText), ovText.slice(0, 300));
  ck('  showing the biggest gap', /\$6\b/.test(html));
  // NOT just /contested/ — that word is in the static copy either way, so the
  // assertion would pass on a card showing nothing. Test the derived counts.
  ck('  naming which were contested', /1 of 2 was contested/.test(ovText), ovText.slice(0, 400));
  ck('  and marking each week contested or not', /wk 4 gut −?\$1 yes/.test(ovText) && /wk 3 injury news \$6 no/.test(ovText), ovText.slice(0, 500));
  ck('  and the per-week reasons', /injury news/.test(html) && /gut/.test(html));
  ck('  it does NOT claim how they turned out', /isn't measured yet/.test(html));
  ck('  and never prints a made-up verdict', !/you were right \d+%/.test(html));

  srv.close();

  // ── The reducer, directly.
  const cap = ACC.capturedOverrides([
    { kind: 'lineup_call', payload: { week: 1 } },
    { kind: 'inseason_override', payload: { week: 2, gap_dollars: 9, contested: false, reason: 'gut' } },
    { kind: 'inseason_override', payload: { week: 3, gap_dollars: -1, contested: true, reason: 'gut' } },
    { kind: 'forecast', payload: {} },   // unrelated kinds are ignored
  ]);
  ck('the reducer counts only lineup decisions', cap.decisions === 3, cap);
  ck('  override rate over the right denominator', cap.rate === 67, cap.rate);
  ck('  biggest gap is by magnitude', cap.gapMax === 9, cap.gapMax);
  ck('  contested counted', cap.contested === 1);
  ck('  reasons tallied', cap.reasons[0].reason === 'gut' && cap.reasons[0].count === 2, cap.reasons);
  ck('nothing captured yet returns null, so the card stays absent rather than empty',
    ACC.capturedOverrides([{ kind: 'forecast', payload: {} }]) === null);

  // ── THE BUTTON ITSELF must actually be on the optimizer page. Every assertion
  // above proves the ROUTE works; none of them proves anything is wired to it,
  // and a capture endpoint nothing can reach is the defect this whole entry is
  // about. Render the real template in the live state and look for it.
  {
    const ejs = require('ejs');
    const tp = path.join(ROOT, 'views', 'lineup.ejs');
    const tpl = fs.readFileSync(tp, 'utf8').replace(/<%-\s*include\([^%]+%>/g, '');
    const out = ejs.render(tpl, {
      me: { id: 1, name: 'Cory' }, owners: [], tab: 'live', season: { year: 2026 },
      band: { median: 140 }, projSource: 'sleeper', roster: [], matchup: { week: 3 }, weekNo: 3,
      alert: null, posture: null, proof: null, eff: null, myLeak: 0, drill: null,
      configured: true, logged: false, overrode: false, sent: false,
      live: { calls: [], lineup: [{ slot: 'WR', name: 'X', pos: 'WR', proj: 10, pid: 'z' }],
        naive: [], ev: { mean: 100, pHigh: 0.3, pWin: 0.5 }, edge: 6.4,
        projPending: false, oppKnown: true, confidence: 'ok' },
    }, { filename: tp });
    ck('the optimizer page carries an override form pointed at the capture',
      /action="\/lineup\/override"/.test(out));
    ck('  every reason is a SUBMIT button — choosing one IS the tap',
      (out.match(/type="submit" name="reason"/g) || []).length >= 4,
      (out.match(/name="reason" value="[^"]*"/g) || []));
    ck('  it carries the tool\'s recommendation and the gap with it',
      /name="recommended"/.test(out) && /name="dollars" value="6.4"/.test(out));
    ck('  and shows the gap in the copy so the tap is informed',
      /\$6/.test(out.slice(out.indexOf('lo-override'))));
    ck('  a near-indifferent week says the override costs about nothing', (() => {
      const o2 = ejs.render(tpl, { me: { id: 1 }, owners: [], tab: 'live', season: { year: 2026 },
        band: { median: 140 }, projSource: 's', roster: [], matchup: { week: 3 }, weekNo: 3, alert: null,
        posture: null, proof: null, eff: null, myLeak: 0, drill: null, configured: true, logged: false,
        overrode: false, sent: false,
        live: { calls: [], lineup: [{ slot: 'WR', name: 'X', pos: 'WR', proj: 10, pid: 'z' }], naive: [],
          ev: { mean: 100, pHigh: 0.3, pWin: 0.5 }, edge: 0.6, projPending: false, oppKnown: true, confidence: 'ok' },
      }, { filename: tp });
      return /costs about nothing/.test(o2);
    })());
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
