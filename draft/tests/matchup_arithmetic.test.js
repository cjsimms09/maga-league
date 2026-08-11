'use strict';
// THE NUMBERS ON ONE LINE HAVE TO SUBTRACT TO EACH OTHER.
//
// /matchup prints two figures and then a third derived from them, twice: the
// playoff swing ("a win puts you at X, a loss drops you to Y — a Z-point
// swing") and the weekly-high bar ("typically N wins the week ... you're G
// short of that bar"). Both were computed off values the reader never saw:
//
//   • the swing subtracted Math.round(p * 100) — but the page prints ">99%"
//     and "<1%" as BOUNDS near the extremes, so a team at 99.7% / 96.7% read
//     ">99%" and "97%" and was then told "a 3-point swing". Subtract what is
//     on the page and you get 2.
//   • the bar printed Math.round(median) = 148 and measured the gap off the
//     unrounded 148.48, so a team on 120.0 was "28.5 short" of 148.
//
// Neither is a rounding wobble; each is a sentence a reader can disprove with
// the two numbers directly above it. Driven through the real app so the check
// is on what the page SAYS, and every claim is verified against the odds
// computed independently here — not against a copy of the view's formula.
const os = require('os'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mua-'));
const store = require(path.join(ROOT, 'src', 'store')); store.initFiles();
const data = require(path.join(ROOT, 'src', 'data'));
const { hashPassword } = require(path.join(ROOT, 'src', 'auth'));
const { createApp } = require(path.join(ROOT, 'server-app'));
const PO = require(path.join(ROOT, 'src', 'routes', 'playoffs'));
const LO = require(path.join(ROOT, 'src', 'routes', 'lineup'));

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d !== undefined ? ' -> ' + JSON.stringify(d).slice(0, 260) : ''))); };
const strip = h => h.replace(/<[^>]*>/g, ' ').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// What a printed figure PROVES about the real percentage, as [lo, hi]. This is
// the English meaning of the token, not a copy of the view's code.
const span = t => t === '<1%' ? [0, 1] : t === '>99%' ? [99, 100]
  : t === '0%' ? [0, 0] : t === '100%' ? [100, 100]
    : [parseFloat(t) - 0.5, parseFloat(t) + 0.5];
const bounded = t => t === '<1%' || t === '>99%';

(async () => {
  await data.ensureSeeded();
  const owners = await store.get('owners');
  const mem = owners.find(o => o.active && o.username && o.username !== 'cory');
  mem.password_hash = hashPassword('pw'); mem.must_change_password = false; mem.is_commissioner = false;
  await store.set('owners', owners);

  // The viewer sits at roster 1 so its points-for is the one dial that moves.
  const rest = owners.filter(o => o.active && o.id !== mem.id).slice(0, 9);
  const active = [mem, ...rest];
  const cfg = await store.get('config');
  const lid = cfg.sleeper_league_id || 'TESTLEAGUE';
  cfg.sleeper_league_id = lid;
  cfg.sleeper_map = {}; active.forEach((o, i) => { cfg.sleeper_map[String(i + 1)] = o.id; });
  await store.set('config', cfg);

  // Week 7, ten teams all 4–2, separated only on points-for. `pf` is a
  // permutation of the same ten values in every state, so the only thing that
  // changes between states is where the VIEWER sits in it.
  const OTHERS = [700, 711, 722, 733, 744, 755, 766, 777, 788, 799];
  const seed = async (minePF, minePts) => {
    const pool = OTHERS.filter(v => v !== minePF);
    const pf = [minePF, ...pool];
    const pts = active.map((o, i) => (i === 0 ? minePts : (i === 2 ? 131.0 : 70 + i * 6.3)));
    await store.set('sleeper-cache', {
      league_id: lid, fetched_at: Date.now(), cached: new Date().toISOString(),
      data: { state: { week: 7 }, league: { name: 'MFGA', season: '2026', total_rosters: 10 },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
          settings: { wins: 4, losses: 2, fpts: pf[i] } })),
        matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: pts[i] })),
        week: 7 },
    });
    // The odds the page should be describing, computed here, independently.
    const rows = active.map((o, i) => ({ owner_id: o.id, wins: 4, losses: 2, pf: pf[i] }));
    return PO.matchupLeverage(rows, PO.gamesRemaining(7, 14), PO.playoffCut({}), mem.id);
  };

  const srv = createApp().listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `username=${mem.username}&password=pw` });
  const cookie = (login.headers.getSetCookie() || []).map(x => x.split(';')[0]).join('; ');
  const page = async () => strip(await (await fetch(base + '/matchup', { headers: { cookie } })).text());

  // ── 1) THE PLAYOFF SWING, in both shapes: the viewer near the top of the
  // points table (which prints ">99%" — a bound) and mid-table (two exact
  // figures). The same sentence has to hold up in each.
  for (const [label, minePF] of [['top of the table (a BOUNDED figure)', 799], ['mid-table (both figures exact)', 744]]) {
    const lev = await seed(minePF, 120.0);
    const t = await page();
    const line = (t.match(/What this is worth:[^.]*\./) || ['(stakes line absent)'])[0];
    ck(`[${label}] the stakes line renders`, /What this is worth/.test(line), line);

    const figs = line.match(/at (\S+) to make the playoffs, a loss drops you to (\S+)/);
    ck(`[${label}]   both figures are on the page`, !!figs, line);
    if (!figs || !lev) { ck(`[${label}]   FIXTURE produced odds`, false, { lev }); continue; }
    const [, wT, lT] = figs;
    const rawPts = lev.swing * 100;

    // Fixture check first: if the state stopped producing the shape, say so
    // rather than passing on a line that never exercised the branch.
    ck(`[${label}]   fixture check: this state really is that shape`,
      bounded(wT) === /BOUNDED/.test(label), { wT, lT, raw: rawPts.toFixed(2) });

    const claim = line.match(/— (?:(at least a|a) (\d+)-point swing|(barely a swing either way))/);
    ck(`[${label}]   the line says what the game is worth`, !!claim, line);
    if (!claim) continue;
    const [, qual, nStr, barely] = claim;
    const n = Number(nStr);

    // (a) The claim must be true of the odds themselves.
    ck(`[${label}]   the claim is true of the real swing`,
      barely ? rawPts < 3 : (qual === 'at least a' ? rawPts >= n : Math.abs(rawPts - n) < 1),
      { claim: claim[0], raw: rawPts.toFixed(2) });

    // (b) And a reader must not be able to disprove it from the two figures
    // above it. An EXACT number may only be asserted off two exact figures,
    // and then it is exactly their difference — the subtraction a reader does.
    ck(`[${label}]   no exact swing is asserted off a bounded figure`,
      !(qual === 'a' && (bounded(wT) || bounded(lT))), { wT, lT, claim: claim[0] });
    if (qual === 'a') {
      ck(`[${label}]   the asserted swing IS the difference of the two figures shown`,
        n === parseFloat(wT) - parseFloat(lT), { wT, lT, n });
    } else if (qual === 'at least a') {
      ck(`[${label}]   the floor is one the two figures shown support`,
        n <= span(wT)[1] - span(lT)[0] && n >= 1, { wT, lT, n });
    }
  }

  // ── 2) THE WEEKLY-HIGH BAR: bar − your score = the gap it prints.
  {
    const band = LO.weeklyHighBand();
    ck('fixture check: there is a three-season band to quote', !!(band && band.n), band && band.n);
    ck('  fixture check: the band median is NOT a whole number',
      !!band && Math.round(band.median) !== band.median, band && band.median);

    await seed(744, 120.0);
    const t = await page();
    // Lazy to the end of the SENTENCE, not to the first '.' — the gap prints
    // one decimal, so "28.0" ends a naive [^.]* match halfway through.
    const note = (t.match(/Typically .*?(?:short of that bar|already past the typical winning score)/) || ['(band note absent)'])[0];
    ck('the weekly-high note renders', /Typically/.test(note), note);
    const m = note.match(/Typically (\d+) wins the week/);
    const g = note.match(/You're ([\d.]+) short of that bar/);
    const mine = (t.match(/you: ([\d.]+)/) || [])[1];
    ck('  the bar, the gap and your score are all on the page', !!(m && g && mine), { note, mine });
    if (m && g && mine) {
      ck('  bar − your score = the gap the page prints',
        Math.abs((Number(m[1]) - Number(mine)) - Number(g[1])) < 0.05,
        { bar: m[1], mine, gap: g[1], subtracts_to: (Number(m[1]) - Number(mine)).toFixed(1) });
    }
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
