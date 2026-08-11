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
  const seed = async (minePF, minePts, recs = null) => {
    const pool = OTHERS.filter(v => v !== minePF);
    const pf = [minePF, ...pool];
    const W = i => (recs ? recs[i] : 4), L = i => (recs ? 12 - recs[i] : 2);
    const pts = active.map((o, i) => (i === 0 ? minePts : (i === 2 ? 131.0 : 70 + i * 6.3)));
    await store.set('sleeper-cache', {
      league_id: lid, fetched_at: Date.now(), cached: new Date().toISOString(),
      data: { state: { week: 7 }, league: { name: 'MFGA', season: '2026', total_rosters: 10 },
        users: active.map((o, i) => ({ user_id: 'u' + i, display_name: o.name })),
        rosters: active.map((o, i) => ({ roster_id: i + 1, owner_id: 'u' + i,
          settings: { wins: W(i), losses: L(i), fpts: pf[i] } })),
        matchups: active.map((o, i) => ({ roster_id: i + 1, matchup_id: Math.floor(i / 2) + 1, points: pts[i] })),
        week: 7 },
    });
    // The odds the page should be describing, computed here, independently.
    const rows = active.map((o, i) => ({ owner_id: o.id, wins: W(i), losses: L(i), pf: pf[i] }));
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

  // ── 2) A SIMULATED ZERO IS NOT ELIMINATION. simOdds is 4,000 iterations; a
  // team that goes 0-for-4,000 scores exactly 0, and the page printed that as a
  // flat "0%". Here the viewer is 2–10 with eight games left — bottom of the
  // table, and mathematically able to finish 10–10.
  {
    const RECS = [2, 2, 2, 2, 2, 6, 6, 6, 6, 6];      // viewer is RECS[0]
    const lev = await seed(700, 120.0, RECS);
    ck('fixture check: the simulation really does return a bare zero',
      !!lev && lev.win === 0 && lev.lose === 0, lev);
    ck('  fixture check: and the season is NOT over — eight games left',
      !!lev && lev.exact === false, lev && lev.exact);
    // Winning out is 12–10, which beats five 6–6 teams outright. Alive.
    ck('  fixture check: winning out would actually reach the field',
      RECS[0] + 8 > Math.max(...RECS.slice(1)), { best: RECS[0] + 8, field: RECS });

    const line = (strip(await page()).match(/What this is worth:[^.]*\./) || ['(absent)'])[0];
    ck('a team that can still make it is never told it is at a flat 0%',
      !/\b0% to make the playoffs/.test(line) && !/drops you to 0%/.test(line), line);
    ck('  it says so as a bound instead', /<1%/.test(line), line);
  }

  // ── 3) THE SAME RULE ON /watch. Its sweat meter is a Normal model, never a
  // result, and it is read WHILE THE BALL IS IN THE AIR — the one place a flat
  // 0% is least defensible. The rehearsal is the only state that renders it in
  // the off-season, which is exactly why the defect survived: nobody could see
  // it any other way.
  {
    const t = strip(await (await fetch(base + '/watch?preview=1', { headers: { cookie } })).text());
    ck('the rehearsal panel renders games', /Rehearsal/.test(t) && /coin flip|cooked|in control/.test(t));
    const pcts = (t.match(/\b\d{1,3}%|<1%|>99%/g) || []);
    ck('  fixture check: it really is printing probabilities', pcts.length >= 4, pcts);
    ck('  no live game is priced at a flat 0% or 100%',
      !pcts.includes('0%') && !pcts.includes('100%'), pcts);
    ck('  and the blowouts are still called, as bounds',
      pcts.includes('<1%') && pcts.includes('>99%'), pcts);
    // The scores down one column are the same quantity; they printed "58" next
    // to "88.4" before.
    const scores = (t.match(/\b\d+(?:\.\d+)? – \d+(?:\.\d+)?/g) || []);
    ck('  every score on the panel carries the same precision',
      scores.length > 0 && scores.every(s => /^\d+\.\d – \d+\.\d$/.test(s)), scores);
  }

  // ── 3b) THE STANDINGS PO% COLUMN — the third surface, and the one where the
  // defect argues with itself. The cell only renders for teams that are neither
  // clinched nor eliminated, so a bare "0%" sits on a row the same function has
  // just declined to eliminate: ALIVE and 0% on one line.
  {
    const RECS = [2, 2, 2, 2, 2, 6, 6, 6, 6, 6];
    await seed(700, 120.0, RECS);
    const html = await (await fetch(base + '/', { headers: { cookie } })).text();
    const cells = [...html.matchAll(/class="po-odds"[^>]*>([^<]+)</g)].map(m => m[1]);
    const badges = [...html.matchAll(/class="po-badge [^"]*"[^>]*>([^<]+)</g)].map(m => m[1]);
    // Every team in the table gets a verdict. This cell is assembled as HTML
    // and inserted unescaped, so a figure containing "<" is read as a tag and
    // the column silently goes BLANK — which is how the first version of this
    // fix rendered five of the ten rows.
    ck('fixture check: the standings really are rendering the PO% column',
      cells.length + badges.length === 10, { cells, badges });
    ck('  no row is priced at a flat 0% or 100% beside a badge that says alive',
      !cells.includes('0%') && !cells.includes('100%'), cells);
    ck('  the long shots are still called, as bounds',
      cells.some(c => c === '&lt;1%' || c === '<1%'), cells);
  }

  // ── 4) THE WEEKLY-HIGH BAR: bar − your score = the gap it prints.
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

  // ── 5) THE FORMATTER ITSELF. The pages above exercise the inexact path; this
  // pins the other half of the rule — a caller that CAN prove a certainty still
  // gets to print one, so the final week says "100%" rather than hedging a
  // finished table into ">99%".
  {
    const OT = require(path.join(ROOT, 'src', 'routes', 'oddstext'));
    ck('an unproven zero prints as a bound', OT.pctText(0) === '<1%', OT.pctText(0));
    ck('  an unproven one likewise', OT.pctText(1) === '>99%', OT.pctText(1));
    ck('  a PROVEN zero is allowed to say so', OT.pctText(0, true) === '0%', OT.pctText(0, true));
    ck('  and a proven one', OT.pctText(1, true) === '100%', OT.pctText(1, true));
    ck('  exactness does not touch the ordinary middle',
      OT.pctText(0.37) === '37%' && OT.pctText(0.37, true) === '37%', OT.pctText(0.37, true));
    ck('  a tiny-but-nonzero value is a bound whatever the caller claims',
      OT.pctText(0.0001, true) === '<1%', OT.pctText(0.0001, true));
    ck('  no odds at all reads as no odds, not as zero', OT.pctText(null) === '—', OT.pctText(null));
    // The final week is the one place matchupLeverage can prove it.
    const rows = Array.from({ length: 10 }, (_, i) => ({ owner_id: 'o' + i, wins: 4, losses: 9, pf: 700 + i * 11 }));
    ck('  matchupLeverage claims exactness only in the last week',
      PO.matchupLeverage(rows, 1, 4, 'o9').exact === true
      && PO.matchupLeverage(rows, 2, 4, 'o9').exact === false,
      { last: PO.matchupLeverage(rows, 1, 4, 'o9'), earlier: PO.matchupLeverage(rows, 2, 4, 'o9') });
  }

  srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
