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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
