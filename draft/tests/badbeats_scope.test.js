'use strict';
// A HALL OF FAME THAT ONLY REACHES BACK THREE SEASONS HAS TO SAY SO.
//
// The league starts in 2016; week-by-week scores only exist from the Sleeper
// era. The Record Book said so — "Box-score records cover 2023–2025 — the
// seasons with week-by-week scores on file". The Bad Beats Hall of Fame is
// built from the SAME archive and said "the most points EVER scored in a losing
// effort", "carved in stone", "written here forever", with no scope line
// anywhere on the page. A 2019 beat cannot appear there and nothing admitted
// it. Two pages, one partial dataset, two different promises about it.
//
// The sentence now comes from views/history/_boxscope.ejs so the two cannot
// drift, and this pins that: the span must appear on BOTH pages, must be the
// same span, and must come from the data rather than a year somebody typed.
//
// The page's own arithmetic is checked too — it was already right, and it is
// the kind of thing that stops being right quietly.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 300) : ''))); };
const flat = h => h.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const scopeOf = t => (t.match(/Box-score records cover (\d{4})(?:–(\d{4}))?/) || []).slice(1, 3).filter(Boolean);

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const cory = owners.find(o => o.username === 'cory');
  cory.password_hash = hashPassword('pw'); cory.must_change_password = false;
  await store.set('owners', owners);

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'username=cory&password=pw' });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const get = async r => (await fetch(base + r, { headers: { cookie } })).text();

  const bbHtml = await get('/history/badbeats');
  const recHtml = await get('/history/records');
  const bb = flat(bbHtml), rec = flat(recHtml);

  ck('the bad beats page renders', /Bad Beats/.test(bb) && /The Monument/.test(bb));
  ck('the record book renders', /Record Book/.test(rec) && /Most points in a loss/.test(rec));

  // ── THE SCOPE.
  const bbScope = scopeOf(bb), recScope = scopeOf(rec);
  ck('the bad beats page states how far back the box scores go', bbScope.length > 0, bbScope);
  ck('  and says the same span the record book does',
    bbScope.join('-') === recScope.join('-'), { badbeats: bbScope, records: recScope });
  // It must be the data's span, not a year in the copy. Compared against the
  // seasons the archive actually carries.
  {
    // The seasons the archive holds, taken from the chronicle's own index —
    // the record book page carries no season links, and reading an empty list
    // made Math.min return Infinity, which sailed through the fixture check
    // below. A guard that passes on no data is the thing this file is about.
    const idx = await get('/history');
    const seasons = [...idx.matchAll(/\/history\/season\/(\d{4})/g)].map(m => Number(m[1]));
    ck('  fixture check: the chronicle lists the seasons on file at all',
      seasons.length > 0, seasons);
    const from = Math.min(...seasons), to = Math.max(...seasons);
    ck('  and the span is the seasons the archive actually holds',
      seasons.length > 0 && Number(bbScope[0]) === from && Number(bbScope[bbScope.length - 1]) === to,
      { stated: bbScope, seasons_on_file: [from, to] });
    // FIXTURE CHECK: if the box scores happened to reach all the way back, the
    // whole point of the sentence would be moot and none of this would bite.
    ck('  fixture check: the box scores do NOT reach the league\'s first season',
      seasons.length > 0 && from > 2016, { box_from: from });
  }
  ck('  the page no longer claims the record unqualified',
    /in every season the box scores reach/.test(bb)
    && !/most points ever scored in a losing effort\. You can/.test(bb),
    (bb.match(/most points[^.]*\./) || [])[0]);

  // ── ONE FACT, TWO PAGES: the Monument is the record book's most-in-a-loss.
  {
    const mon = (bbHtml.match(/The Monument — ([^,<]+), (\d{4})<\/span><span class="pts">([\d.]+)/) || []).slice(1, 4);
    const recLine = (rec.match(/Most points in a loss[^)]*\)\s*([\d.]+)\s*(\w+)\s*·\s*(\d{4})/) || []).slice(1, 4);
    ck('the Monument and the record book name the same beat',
      mon.length === 3 && recLine.length === 3
      && Math.abs(Number(mon[2]) - Number(recLine[0])) < 0.005
      && mon[0].trim() === recLine[1] && mon[1] === recLine[2],
      { monument: mon, record_book: recLine });
  }

  // ── THE PAGE'S OWN ARITHMETIC. "Missed the weekly high by N" must be the
  // difference between the two scores printed in the same row.
  {
    // Per BLOCK, not across the page: an unanchored [\s\S]*? ran from the
    // Monument's score straight into the first near-miss note and compared two
    // numbers that were never in the same row.
    const rows = bbHtml.split('<div class="beat').map(blk => {
      const m = blk.match(/<span class="who">([^<]+)<\/span><span class="pts">([\d.]+)<\/span>/);
      const n = blk.match(/Missed the weekly high by ([\d.]+) — ([^<]+?) took the \$100 with ([\d.]+)\./);
      return m && n ? { who: m[1], mine: +m[2], by: +n[1], winner: n[2], top: +n[3] } : null;
    }).filter(Boolean);
    ck('fixture check: there are near-miss rows to check', rows.length >= 3, rows.length);
    const bad = rows.filter(r => Math.abs((r.top - r.mine) - r.by) > 0.005);
    ck('every "missed by" is the gap between the two scores in its own row',
      bad.length === 0, bad);
    ck('  and every one of them really is under the two points the heading claims',
      rows.every(r => r.by < 2), rows.filter(r => r.by >= 2));
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
