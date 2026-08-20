/* TERRITORY: A
 *
 * THE DRAFT-NIGHT CHEAT SHEET, AS A PAGE CORY CAN OPEN ON HIS PHONE.
 *
 * Cory asked for this twice. First: "Also maybe a cheat sheet on front page."
 * Then, to the relay: "tips or things we've identified... anything that will
 * help me draft better." The relay wrote `draft/DRAFT-NIGHT-CHEATSHEET.md` and
 * routed the placement question to me with DEFAULT "no link needed — the file
 * is delivered to Cory directly and lives on main; a link is a convenience,
 * not a dependency."
 *
 * ⚠️ I AM NOT TAKING THAT DEFAULT, and the reason is that it answers a
 * different question than the one Cory asked. A markdown file on main is not
 * "on the front page". At 6PM Saturday, on a phone, mid-draft, the difference
 * between a tap and "find the repo, find the file, read raw markdown" is the
 * whole feature. The default was written about a dependency; Cory asked about a
 * surface.
 *
 * ── GENERATED, NEVER HAND-MAINTAINED ───────────────────────────────────────
 *
 * The page is built FROM the markdown, the same way sources.html is built by
 * sources_page.js. Two copies of draft advice that can disagree is the defect
 * this repo keeps paying for (register 148 is two replacement tables; register
 * 5h is a weight ruling shipping while the prose quoting it never updates). So
 * there is one source of truth — the .md, which is the relay's file and stays
 * the relay's file — and this only renders it.
 *
 * The converter handles exactly the constructs the sheet uses, measured before
 * writing it rather than assumed: h1 x1, h2 x7, paragraphs x69, bullets x4,
 * ordered items x2, bold x13, and zero tables, code fences, links or rules. It
 * REFUSES on anything else rather than silently dropping it — a cheat sheet
 * that quietly loses a line is worse than no cheat sheet, because Cory would
 * not know a line was missing.
 *
 * Self-contained: no external CSS, no fonts, no script. It has to open on a
 * phone with bad conference-room wifi.
 *
 * Run: node draft/tools/cheatsheet_page.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'draft', 'DRAFT-NIGHT-CHEATSHEET.md');
const OUT = path.join(ROOT, 'public', 'cheatsheet.html');

const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Inline: bold only, applied AFTER escaping so `**` inside escaped text cannot
 * produce a tag. Nothing else is interpreted — no raw HTML passthrough. */
function inline(s) {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

function convert(md) {
  // HTML comments carry the territory header and the provenance note. They are
  // for readers of the repo, not for Cory mid-draft.
  const body = md.replace(/<!--[\s\S]*?-->/g, '');
  const lines = body.split('\n');
  const out = [];
  const unsupported = [];
  let para = [];
  let list = null;          // 'ul' | 'ol' | null

  const flushPara = () => {
    if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
  };
  const flushList = () => {
    if (list) { out.push('</' + list + '>'); list = null; }
  };

  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    const t = line.trim();

    if (!t) { flushPara(); flushList(); return; }

    // REFUSE rather than drop. Every one of these would silently lose content.
    if (/^```/.test(t) || /^\|/.test(t) || /^>/.test(t)) {
      unsupported.push('line ' + (i + 1) + ': ' + t.slice(0, 60));
      return;
    }

    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const lvl = h[1].length;
      out.push('<h' + lvl + '>' + inline(h[2]) + '</h' + lvl + '>');
      return;
    }

    const ul = t.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushPara();
      if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; }
      out.push('<li>' + inline(ul[1]) + '</li>');
      return;
    }

    const ol = t.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushPara();
      if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; }
      out.push('<li>' + inline(ol[1]) + '</li>');
      return;
    }

    flushList();
    para.push(t);
  });
  flushPara(); flushList();
  return { html: out.join('\n'), unsupported };
}

const md = fs.readFileSync(SRC, 'utf8');
const { html, unsupported } = convert(md);

if (unsupported.length) {
  console.error('\n  REFUSING TO WRITE — the sheet uses constructs this renderer '
    + 'does not handle, and dropping them silently would lose draft advice '
    + 'without Cory knowing:\n');
  unsupported.forEach(u => console.error('    ' + u));
  console.error('\n  Extend convert() to cover them, then re-run.\n');
  process.exit(1);
}

/* Every heading becomes a jump link. On a phone mid-draft, scrolling 99 lines
 * to find the bench rules is the failure mode this page exists to remove. */
const heads = [...md.matchAll(/^##\s+(.*)$/gm)].map(m => m[1].replace(/\*\*/g, ''));
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let withIds = html;
heads.forEach(h => {
  const rendered = h.replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  withIds = withIds.replace('<h2>' + rendered + '</h2>',
    '<h2 id="' + slug(h) + '">' + rendered + '</h2>');
});
const toc = heads.length
  ? '<nav class=toc>' + heads.map(h =>
    '<a href="#' + slug(h) + '">' + esc(h.length > 42 ? h.slice(0, 40) + '…' : h) + '</a>').join('')
    + '</nav>'
  : '';

const page = `<!doctype html><meta charset=utf-8>
<title>Draft-night cheat sheet</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>
:root{--bg:#0f1115;--fg:#e7e9ee;--dim:#8b93a7;--line:#232838;--acc:#f5a623}
@media(prefers-color-scheme:light){:root{--bg:#fff;--fg:#15181f;--dim:#5b6377;--line:#e3e6ef}}
*{box-sizing:border-box}
body{margin:0;padding:1rem 1.1rem 3rem;background:var(--bg);color:var(--fg);
font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
max-width:44rem;margin-inline:auto}
h1{font-size:1.15rem;line-height:1.3;margin:0 0 .1rem}
h2{font-size:1rem;margin:1.7rem 0 .45rem;color:var(--acc);
scroll-margin-top:.6rem;border-top:1px solid var(--line);padding-top:.9rem}
h2:first-of-type{border-top:0}
h3{font-size:.92rem;margin:1rem 0 .3rem}
p{margin:.5rem 0}
ul,ol{margin:.5rem 0;padding-left:1.3rem}
li{margin:.28rem 0}
b{color:var(--fg);font-weight:650}
.toc{display:flex;flex-wrap:wrap;gap:.35rem;margin:.7rem 0 .2rem}
.toc a{font-size:.76rem;text-decoration:none;color:var(--dim);
border:1px solid var(--line);border-radius:.35rem;padding:.2rem .45rem}
.toc a:active{color:var(--acc)}
.back{display:inline-block;margin:0 0 .6rem;font-size:.8rem;color:var(--dim);
text-decoration:none;border:1px solid var(--line);border-radius:.35rem;padding:.25rem .55rem}
.gen{color:var(--dim);font-size:.72rem;margin-top:2rem;border-top:1px solid var(--line);
padding-top:.6rem}
</style>
<a class=back href="/admin/warroom">← War Room</a>
${toc}
${withIds}
<p class=gen>Generated from <code>draft/DRAFT-NIGHT-CHEATSHEET.md</code> by
draft/tools/cheatsheet_page.js — one source, so the page cannot drift from the
sheet. Every line in it carries its own evidence.</p>
`;

fs.writeFileSync(OUT, page);
console.log('\n  DRAFT-NIGHT CHEAT SHEET -> public/cheatsheet.html');
console.log('    ' + heads.length + ' sections, ' + page.length + ' bytes, self-contained');
heads.forEach(h => console.log('      · ' + h));
console.log('');
