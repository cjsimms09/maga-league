'use strict';
// IN-SEASON SURFACE DESIGN GUARDS — the pages Cory uses every week for four
// months (lineup optimizer, what-to-watch, analyzer, matchup). These had
// correctness sweeps and never an aesthetic one; these are the defects that pass
// a correctness test while looking broken, so they need their own guard.
//
// Renders the real templates through EJS (no browser needed in CI) and asserts
// the CSS contract that fixes them.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');

// 1) THE RUN-ON TITLE. `<span class="sub">` inside an h1.page-title had NO rule
// of its own, so it inherited the display face (1.7rem, uppercase, weight 900)
// and the subtitle rendered as part of the heading — three lines deep on a phone
// with no hierarchy. It must be styled subordinate.
{
  const m = css.match(/h1\.page-title \.sub\s*\{([^}]*)\}/);
  ck('h1.page-title .sub has its own rule (not inheriting the display face)', !!m);
  if (m) {
    const body = m[1];
    ck('  subtitle drops to its own line', /display\s*:\s*block/.test(body));
    ck('  subtitle is not uppercase', /text-transform\s*:\s*none/.test(body));
    ck('  subtitle uses the body face, not the display face', /font-family\s*:\s*var\(--font-body\)/.test(body));
    ck('  subtitle is visually quieter (muted + small)', /color\s*:\s*var\(--muted\)/.test(body) && /font-size\s*:\s*\.?\d/.test(body));
  }
}

// 2) THE CLIPPED TAB. `.section-tabs a { flex: 1 0 auto }` refused to shrink, so
// a long sub-label pushed the strip past the viewport and clipped at the right
// edge on a phone. They must be allowed to shrink and share the width.
{
  const m = css.match(/\.section-tabs a \{([^}]*)\}/);
  ck('.section-tabs a exists', !!m);
  if (m) {
    ck('  tabs are allowed to SHRINK (flex-shrink != 0), so long labels wrap not clip',
      /flex\s*:\s*1\s+1\s+/.test(m[1]), m[1].match(/flex\s*:[^;]*/));
  }
}

// 3) The pages that carry a page-title subtitle should all benefit — assert the
// pattern is actually in use (so the rule isn't dead code).
{
  const views = ['lineup.ejs', 'watch.ejs', 'analyzer.ejs', 'matchup.ejs'];
  const using = views.filter(v => {
    const p = path.join(ROOT, 'views', v);
    if (!fs.existsSync(p)) return false;
    const s = fs.readFileSync(p, 'utf8');
    return /class="page-title"[\s\S]{0,200}?class="sub"/.test(s);
  });
  ck('the in-season pages use the page-title + sub pattern the rule fixes',
    using.length >= 3, using.join(','));
}

// 4) THE NORMAL WEEK MUST NOT LOOK LIKE AN EMPTY PAGE. A's measurement: the
// dual-objective optimizer beats "start your highest projections" only ~11% of
// weeks (~$9/season). So the no-change week is the common one — and the moves
// card used to VANISH on it, which both changes the page's shape week to week
// and makes the rare week look like the default. The quiet answer must be said
// out loud, with its measured frequency, and the loud one marked as rare.
{
  const ejs = require('ejs');
  const tplPath2 = path.join(ROOT, 'views', 'lineup.ejs');
  const tpl2 = fs.readFileSync(tplPath2, 'utf8').replace(/<%-\s*include\([^%]+%>/g, '');
  const locals2 = calls => ({
    me: { id: 1, name: 'Cory' }, owners: [], tab: 'live', season: { year: 2026 },
    band: { median: 140 }, projSource: 'sleeper', roster: [], matchup: null, weekNo: 3,
    alert: null, posture: null, proof: null, eff: null, myLeak: 0, drill: null,
    configured: true, logged: false,
    live: { calls, lineup: [{ slot: 'WR', name: 'X', pos: 'WR', proj: 10, pid: 'z' }],
      naive: [], ev: { mean: 100, pHigh: 0.3, pWin: 0.5 }, edge: 10,
      projPending: false, oppKnown: true, confidence: 'ok' },
  });
  const render2 = calls => ejs.render(tpl2, locals2(calls), { filename: tplPath2 });
  const none = render2([]);
  ck('a no-change week SAYS so instead of the card vanishing', /Nothing to change this week/.test(none));
  ck('  and states the measured frequency rather than implying a puzzle',
    /9 weeks in 10/.test(none) && /11%/.test(none));
  ck('  it does not render the moves card', !/What changed vs your studs/.test(none));
  const some = render2([{ startId: 'a', startName: 'Boom', startPos: 'WR', startProj: 9.1,
    sitName: 'Safe', sitPos: 'WR', sitProj: 12.4, dollars: 6, dollarsHigh: 8, dollarsWin: -2 }]);
  ck('a week WITH moves shows them, marked as the rare case',
    /What changed vs your studs/.test(some) && /a rare week/.test(some));
  ck('  and the no-change card is absent then', !/lo-nochange/.test(some));
}

// 5) WHAT TO WATCH — the live Sunday panel. Two design defects on the surface
// the league stares at during games:
//   • the SCORE was computed on every row and rendered on none. On a page called
//     What to Watch, mid-game, you could not see the score.
//   • the sweat meter's track was rgba(255,255,255,.08) — a dark-theme value on
//     a #fff panel, 1.00:1, invisible. With no track the fill can't be read as a
//     proportion.
//   • the state words were all dark-theme too; SWEATING at 1.83:1 was the worst,
//     and it labels exactly the games worth watching.
{
  const ejs = require('ejs');
  const tp = path.join(ROOT, 'views', 'watch.ejs');
  const tpl = fs.readFileSync(tp, 'utf8').replace(/<%-\s*include\([^%]+%>/g, '');
  const row = o => ({ owner_id: 1, opp_id: 2, name: 'Cory', oppName: 'Mike', live: 84.2,
    oppLive: 84.1, myProj: 84.2, oppProj: 84.1, margin: 0.1, playersLeft: 0, oppPlayersLeft: 0,
    remainKnown: true, pWin: 0.5, highP: null, label: { icon: '🔥', word: 'coin flip', level: 'flip' },
    need: 'Up 0.1 projected.', ...o });
  const render = rows => ejs.render(tpl, { me: { id: 1 }, rows, source: 'live', inWindow: true,
    weekNo: 3, band: { median: 141 }, preview: false }, { filename: tp });

  const priced = render([row({})]);
  ck('the live score is on the row (it was computed and never rendered)',
    /wtw-score/.test(priced) && /84\.2/.test(priced) && /84\.1/.test(priced));
  ck('  a priced row still shows the meter and the percentage',
    /wtw-meter/.test(priced) && /wtw-pct/.test(priced));

  const unpriced = render([row({ pWin: null, remainKnown: false,
    label: { icon: '🏈', word: 'in progress', level: 'live' }, need: 'Up 0.1 on the board.' })]);
  ck('with no per-player feed the score still shows', /84\.2/.test(unpriced));
  ck('  but no invented percentage', !/wtw-pct/.test(unpriced));
  ck('  and no meter drawn from a probability we do not have', !/wtw-meter/.test(unpriced));
  ck('  the footnote says plainly which half is missing',
    /sweat meter[\s\S]{0,120}isn't wired up yet/.test(unpriced));

  ck('the meter track is visible on the light panel (was 1.00:1 white-on-white)',
    /\.wtw-meter \{[^}]*background:\s*rgba\(12,26,43/.test(css));
  // Every state word must clear 4.5:1 on #fff — .66rem uppercase is small text.
  {
    const hx = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
    const lum = c => { const s = hx(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return .2126 * s[0] + .7152 * s[1] + .0722 * s[2]; };
    const ratio = c => (Math.max(lum(c), 1) + .05) / (Math.min(lum(c), 1) + .05);
    for (const lvl of ['flip', 'sweat', 'safe', 'cooked']) {
      const m = css.match(new RegExp('\\.wtw-word\\.' + lvl + ' \\{[^}]*color:\\s*(#[0-9a-fA-F]{6})'));
      ck(`  .wtw-word.${lvl} is a literal that clears AA on white`, !!m && ratio(m[1]) >= 4.5,
        m ? m[1] + ' = ' + ratio(m[1]).toFixed(2) + ':1' : 'no hex literal');
    }
  }
  // A week you aren't playing in must still get the section header.
  const noMine = render([row({ owner_id: 9, opp_id: 8, name: 'Ann', oppName: 'Bo' })]);
  ck('the list is headed even when you are not on the slate', /Around the league/.test(noMine));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
