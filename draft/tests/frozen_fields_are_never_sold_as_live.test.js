// TERRITORY: A
/* NO PANEL MAY TELL CORY A FROZEN FIELD FOLLOWS HIS SOURCE TOGGLE.
 *
 * THIRD INSTANCE OF ONE DEFECT, and the reason this is a mechanism now:
 *   1. the source banner claimed "VONA, TIERS and the recommended player on
 *      THIS ENTIRE PAGE" followed the toggle — three of the four did not;
 *   2. the "+N wire" chip was Draft-Sharks-priced under every source label;
 *   3. 2026-08-22, ~2h before the draft: the tier-cliff note was rewritten to
 *      "Red tier lines = this source's opinion. For timing, trust STRIKE" —
 *      BOTH HALVES FALSE, and contradicting the banner two inches away.
 *
 * WHAT IS ACTUALLY FROZEN, measured rather than asserted:
 *   · `cliff_after_rank` / `cliff_size` exist in position_boards.json with NO
 *     `_by_source` variant — one value, Draft Sharks, whatever the toggle says.
 *   · `strikePeaks()` reads `d.VONA`, the plain field, NOT
 *     `VONA_by_source[rankKey]`. So the STRIKE bar is Draft Sharks too.
 * Both are re-derived from the shipped artifact and the shipped source below,
 * so if either ever GAINS a per-source form this file goes red and the copy
 * gets to change — the guard tracks the code, not this date.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ck = (n, c, d) => { if (c) { pass++; console.log('PASS  ' + n); }
  else { fail++; console.log('FAIL  ' + n + (d !== undefined ? '  — ' + String(JSON.stringify(d)).slice(0, 260) : '')); } };

const PB = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'position_boards.json'), 'utf8'));
const VIEW = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'position_boards_view.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');

/* ── 1. ESTABLISH WHAT IS FROZEN, FROM THE DATA ───────────────────────────── */
const blocks = [];
(PB.picks || []).forEach(r => Object.keys(r.positions || {}).forEach(q => blocks.push(r.positions[q])));
ck('CONTROL: position blocks exist, so "no per-source variant" is a finding '
  + 'rather than an empty artifact', blocks.length >= 30, { n: blocks.length });

const cliffPerSource = blocks.some(b => Object.keys(b).some(k => /cliff/i.test(k) && /_by_source$/.test(k)));
ck('CONTROL: the cliff fields are still SINGLE-SOURCE — if this flips, the '
  + 'copy below is allowed to change and this file should be revisited',
  !cliffPerSource, { cliffPerSource });

const strikeReadsPlainVona = /function strikePeaks[\s\S]{0,400}d\.VONA\b/.test(VIEW)
  && !/function strikePeaks[\s\S]{0,400}VONA_by_source/.test(VIEW);
ck('CONTROL: strikePeaks() still reads the PLAIN d.VONA, not '
  + 'VONA_by_source[rankKey] — this is what makes the STRIKE bar Draft Sharks',
  strikeReadsPlainVona);

/* ── 2. NO COPY MAY SELL EITHER AS PER-SOURCE ─────────────────────────────── */
const BAD = [
  [/Red tier lines\s*=\s*this source/i, 'cliff lines called "this source\'s opinion"'],
  [/switch source and the cliffs move/i, 'cliff lines claimed to move with the source'],
  [/For timing,\s*trust\s*\\u26a1?\s*⚡?\s*STRIKE/i, 'STRIKE sold as the timing signal to trust, unqualified'],
  [/STRIKE[^.]{0,40}the timing signal to trust/i, 'STRIKE sold as "the timing signal to trust"'],
];
const hits = [];
[['app.js', APP], ['position_boards_view.js', VIEW]].forEach(([name, src]) => {
  BAD.forEach(([re, why]) => {
    /* the guard's own BAD list lives in this file, not in those two — but the
     * correction comments in them quote the old wording. Only count a hit
     * OUTSIDE a comment block that is explicitly recording the correction. */
    const m = src.match(re);
    if (!m) return;
    const at = src.indexOf(m[0]);
    const before = src.slice(Math.max(0, at - 900), at);
    const isQuotedCorrection = /⚠️[\s\S]*(CORRECTED|FALSE)/.test(before);
    if (!isQuotedCorrection) hits.push(name + ': ' + why);
  });
});
ck('no live copy claims the tier-cliff lines or the STRIKE bar follow the '
  + 'Ranking Source toggle — a Draft Sharks answer wearing another source\'s '
  + 'label is the defect this family keeps producing',
  hits.length === 0, hits);

/* ── 3. AND THEY ARE NAMED AS DRAFT SHARKS WHERE THEY ARE SHOWN ───────────── */
ck('the STRIKE legend names Draft Sharks, so a reader on CBS knows whose '
  + 'timing he is looking at', /STRIKE[\s\S]{0,160}Draft Sharks/i.test(VIEW));
ck('the cliff note names Draft Sharks too', /Red tier lines[\s\S]{0,120}DRAFT SHARKS/i.test(APP));
ck('and the source banner still names both as frozen — the two panels must '
  + 'not disagree, which is what started this',
  /the tier-cliff lines[\s\S]{0,120}strike strip[\s\S]{0,80}do not follow/i.test(APP));

/* ── 4. FAIL ARM (rule 3f) ────────────────────────────────────────────────── */
{
  const poisoned = "note.textContent += ' Red tier lines = this source’s opinion.';";
  let caught = false;
  BAD.forEach(([re]) => { if (re.test(poisoned)) caught = true; });
  ck('CONTROL (rule 3f) — the detector REJECTS the exact string that shipped '
    + 'tonight. A guard that cannot recognise the bug it was written for is '
    + 'decoration', caught);
  ck('CONTROL (rule 3f) — and ACCEPTS honest copy, so it discriminates',
    !BAD.some(([re]) => re.test('Red tier lines and STRIKE are DRAFT SHARKS, whatever source you pick')));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
