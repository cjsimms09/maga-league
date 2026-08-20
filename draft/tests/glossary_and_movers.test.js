// TERRITORY: B
/* THE TERM GLOSSARY, AND ADP MOVERS MOVED WHERE IT'S EASY TO SEE — Cory,
 * live 2026-08-20: "Also make sure there is definitions of all those
 * things and how to use them (adot, war). Also did you make sure I can
 * see risers and fallers based on ADP easy.."
 *
 * Two separate asks, one file:
 *   1. TERM_GLOSSARY (app.js) — every stat abbreviation shown anywhere on
 *      the board gets a plain-English definition AND a "how to use it"
 *      instruction, rendered into the existing Help manual and reachable
 *      in one click from the decide surface (a new "❓ Terms" button next
 *      to search). No standalone "WAR" field exists in this system — the
 *      VORP entry says so explicitly, in case that's what was meant.
 *   2. ADP Movers (risers/fallers) — was live and correct but lived on the
 *      ROSTERS tab; its own copy already argued for the DRAFT tab ("if a
 *      mover is on your queue or in a tossup, that is the moment this
 *      panel earns its space"). Moved, and its rows are now clickable
 *      like every other name on the page.
 *
 * Run: node draft/tests/glossary_and_movers.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

// ── 1. TERM_GLOSSARY — lift the real array and check its content ───────────
{
  const i = SRC.indexOf('const TERM_GLOSSARY = [');
  if (i < 0) throw new Error('TERM_GLOSSARY not found in app.js');
  const arrStart = SRC.indexOf('[', i);
  let depth = 0, j = arrStart;
  for (let k = arrStart; k < SRC.length; k++) {
    if (SRC[k] === '[') depth++;
    if (SRC[k] === ']') { depth--; if (!depth) { j = k + 1; break; } }
  }
  // eslint-disable-next-line no-eval
  const TERM_GLOSSARY = eval(SRC.slice(arrStart, j));

  ck('the glossary is non-trivial (covers real ground, not a stub)', TERM_GLOSSARY.length >= 12, TERM_GLOSSARY.length);
  ck('every entry has a term, a definition, and a "how to use it" instruction — '
    + 'a definition alone is half of what was asked for',
    TERM_GLOSSARY.every(t => t.term && t.def && t.use && t.def.length > 20 && t.use.length > 20),
    TERM_GLOSSARY.filter(t => !t.term || !t.def || !t.use));

  const has = (term) => TERM_GLOSSARY.some(t => t.term === term);
  ck('VORP is defined (shown bare in two places before this session\'s tooltip fix)', has('VORP'));
  ck('VONA is defined', has('VONA'));
  ck('ADP is defined (both Raw and Adj covered in one entry)', has('ADP'));
  ck('aDOT is defined (Cory named this one explicitly)', has('aDOT'));
  ck('WOPR is defined', has('WOPR'));
  ck('Tier is defined', has('Tier'));
  ck('Survival % is defined', has('Survival %'));
  ck('ADP velocity is defined (the ADP Movers panel\'s own term)', has('ADP velocity'));

  ck('CONTROL — no glossary entry is fabricated under the literal term "WAR"; the codebase '
    + 'genuinely carries no such field on the board (grepped separately: only "war room" hits)',
    !has('WAR'));
  const vorpEntry = TERM_GLOSSARY.find(t => t.term === 'VORP');
  ck('the VORP entry explicitly addresses the "WAR" question rather than silently omitting it '
    + '— Cory named it, so a silent absence would read as an oversight, not an answer',
    /WAR/.test(vorpEntry.def), vorpEntry.def);
}

// ── 2. renderHelp() actually renders the glossary ───────────────────────────
{
  ck('renderHelp() emits the glossary as a definition list, term-glossary section titled '
    + 'so it reads as a lookup, not more panel prose',
    /Terms — what they mean and how to use them/.test(SRC));
  ck('...built from the real TERM_GLOSSARY array, not a second hand-typed copy',
    /TERM_GLOSSARY\.map\(t =>/.test(SRC));
  ck('...as an actual <dl> (semantic definition list), each term escaped',
    /<dl class="wr-glossary">/.test(SRC) && /<dt>' \+ escapeHtml\(t\.term\)/.test(SRC));
}

// ── 3. one click from the decide surface to the glossary ───────────────────
{
  const VIEW = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
  ck('a "❓ Terms" button sits next to the search bar, on the DRAFT tab (the decide surface)',
    /wr-terms-btn" data-wrtab-btn="intel" data-jump-help="1"/.test(VIEW));
  const WC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');
  ck('the tab-switch click delegate opens AND scrolls to the help card when data-jump-help is set '
    + '— "switch tabs, then go hunting" is not one click',
    /data-jump-help/.test(WC) && /helpCard\.open = true/.test(WC) && /scrollIntoView/.test(WC));
}

// ── 4. ADP Movers — moved to the DRAFT tab, and its rows are clickable ─────
{
  const VIEW = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
  const draftTabStart = VIEW.indexOf('id="wr-tab-draft"');
  const draftTabEnd = VIEW.indexOf('/wr-zone1');
  const rostersTabStart = VIEW.indexOf('id="wr-tab-rosters"');
  const rostersTabEnd = VIEW.indexOf('id="wr-tab-adjust"');
  ck('the ADP Movers card is now inside the DRAFT tab\'s zone1, not the ROSTERS tab',
    VIEW.slice(draftTabStart, draftTabEnd).indexOf('id="adp-movers-card"') >= 0);
  ck('...and it is genuinely GONE from the ROSTERS tab, not duplicated (one card, one home)',
    VIEW.slice(rostersTabStart, rostersTabEnd).indexOf('id="adp-movers-card"') === -1);

  const CSS = fs.readFileSync(path.join(ROOT, 'public', 'css', 'style.css'), 'utf8');
  ck('the card has a real CSS order in .wr-zone1, so it actually renders in the flow '
    + 'rather than falling back to order:0 (the exact bug #position-boards had once)',
    /\.wr-zone1 > #adp-movers-card\s*\{\s*order:\s*15;/.test(CSS));

  ck('a mover row now carries data-drill onto its name, same as every other name on the page',
    /wr-mover-name"' \+ \(p\.player_id != null \? ' data-drill="' \+ escapeHtml\(String\(p\.player_id\)\)/.test(SRC));
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
