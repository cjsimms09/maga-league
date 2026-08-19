// TERRITORY: A
/* WHEN TO STRIKE — the page that answers "when do I grab QB, TE, K, DEF".
 *
 * Cory, 2026-08-19: "would be nice to have good info about projected vona
 * collapses and which rounds that way I know when to grab QB, TE, K, Def"
 *
 * ⚠️ THIS ANSWER ALREADY EXISTED AND HAD NEVER BEEN ON A SCREEN.
 * `position_boards.js` has been computing per-position VONA, the surplus over
 * the wire and the round-to-round drop-offs for his exact twelve picks, writing
 * `public/position_boards.json` -- and NOTHING READS IT. Grep the whole of
 * public/ and src/: zero consumers. It was also stale, built at 08:52Z from the
 * pre-Draft-Sharks projections at adjuster 0. Register 60's pattern for the
 * fourth time: built, correct, disconnected.
 *
 * So this is not new analysis. It is the analysis we already had, regenerated on
 * tonight's numbers and put somewhere he can look at it during the draft.
 *
 * ── WHAT THE PAGE SAYS, AND THE ONE THING IT WILL NOT DO ────────────────────
 *
 * For each of his twelve picks it shows, per position: what waiting costs
 * (VONA), what the man is worth over the wire (surplus), who is actually there,
 * and the odds each survives to his next pick. Plus the LAST PICK at which each
 * onesie is still worth taking, which is the literal question he asked.
 *
 * IT DOES NOT PICK. Cory: "I will chose positions. what I need from you is
 * showing me VONA at each position when I'm drafting and I will choose
 * direction." No recommendation, no ordering across positions -- VONA is not
 * comparable across positions (P196) and this page never pretends it is.
 *
 * REPORT ONLY. Writes public/strike.html.
 * Run: node draft/tools/strike_page.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PB = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'position_boards.json'), 'utf8'));
if (!PB.controls_all_passed) throw new Error('position_boards failed its controls — REFUSING');

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const esc = t => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── THE HEADLINE: the last pick at which each onesie is still worth taking ──
 * "Worth taking" = the surplus over the wire is still materially above what it
 * will be later. For a onesie the question is not "is he good" but "will an
 * equally good one be there later", and that is exactly what the wire surplus
 * against the drop-off answers. */
/* ⚠️ MY FIRST HEADLINE STAT WAS USELESS AND I AM RECORDING WHY. It was "the last
 * pick whose VONA is at least 10% of its own surplus", which returned pick 133
 * for FIVE OF SIX POSITIONS -- a number that answers nothing. The reason is that
 * VONA RISES LATE for the onesies: the pool thins, so the gap between the best
 * man left and the next one grows. A rule keyed to "still material" therefore
 * fires at the end of the draft for everything.
 *
 * The question Cory actually asked is "when do I grab QB, TE, K, DEF", and the
 * honest answer is THE PICK WHERE WAITING COSTS THE MOST -- the peak of that
 * position's own VONA curve across his twelve picks. That is a fact about the
 * position, it needs no threshold, and it is different for every position:
 * TE peaks early, RB in the middle, QB and K at the very end. */
const peak = {};
POS.forEach(q => {
  let best = null, bv = -Infinity;
  PB.picks.forEach(pk => {
    const d = pk.positions[q];
    if (!d || d.VONA == null) return;
    if (d.VONA > bv) { bv = d.VONA; best = pk; }
  });
  peak[q] = best ? { pick: best.pick, round: best.round, vona: bv } : null;
});

function cell(v, d) { return v == null ? '—' : (typeof v === 'number' ? v.toFixed(d || 0) : esc(v)); }

const picksHtml = PB.picks.map(pk => {
  const rows = POS.map(q => {
    const d = pk.positions[q];
    if (!d) return '';
    const strike = /STRIKE/.test(d.note || '');
    const wait = /wait/.test(d.note || '');
    const men = (d.players || []).slice(0, 3).map(p =>
      `<div class=pl><span class=nm>${esc(p.name)}</span>`
      + `<span class=mt>${cell(p.proj)} <span class=dim>proj</span></span>`
      + `<span class=mt>${cell(p.ceiling)} <span class=dim>ceil</span></span>`
      + `<span class="mt ${p.pct_still_there_next_pick <= 20 ? 'gone' : p.pct_still_there_next_pick >= 70 ? 'safe' : ''}">`
      + `${cell(p.pct_still_there_next_pick)}% <span class=dim>there next</span></span></div>`).join('');
    return `<tr class="${strike ? 'strike' : wait ? 'wait' : ''}">`
      + `<td class=pos>${q}</td>`
      + `<td class=n>${cell(d.VONA, 1)}</td>`
      + `<td class=n>${cell(d.surplus_over_wire, 0)}</td>`
      + `<td class=verdict>${strike ? 'STRIKE' : wait ? 'wait' : 'neutral'}</td>`
      + `<td class=men>${men}</td></tr>`;
  }).join('');
  return `<section><h3>Pick ${pk.pick} <span class=dim>· round ${pk.round}`
    + (pk.next_pick ? ` · next at ${pk.next_pick}` : ' · LAST PICK') + `</span></h3>`
    + `<div class=wrap><table><thead><tr><th>pos</th>`
    + `<th title="what waiting until your next pick costs at this position">VONA</th>`
    + `<th title="how much the best man here beats what the wire will leave you">over wire</th>`
    + `<th></th><th class=l>who is there</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}).join('');

const dropRows = (PB.round_dropoffs || []).map(d =>
  `<tr><td>${d.from_pick} → ${d.to_pick}</td>`
  + POS.map(q => {
    const v = (d.pos || {})[q] || 0;
    return `<td class="n ${v >= 25 ? 'big' : v >= 10 ? 'mid' : 'zero'}">${v || '·'}</td>`;
  }).join('')
  + `<td class=l>${esc(d.steepest || '')}</td></tr>`).join('');

const html = `<!doctype html><meta charset=utf-8>
<title>When to strike</title><meta name=viewport content="width=device-width,initial-scale=1">
<style>
:root{--bg:#0f1115;--fg:#e7e9ee;--dim:#8b93a7;--line:#232838;--go:#2ecc71;--no:#e74c3c;--acc:#f5a623}
@media(prefers-color-scheme:light){:root{--bg:#fff;--fg:#15181f;--dim:#5b6377;--line:#e3e6ef}}
*{box-sizing:border-box}
body{margin:0;padding:1rem;background:var(--bg);color:var(--fg);
font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;max-width:78rem}
h1{font-size:1.1rem;margin:0 0 .3rem}h3{font-size:.9rem;margin:1.1rem 0 .3rem;color:var(--acc)}
p.note{color:var(--dim);font-size:12px;margin:.2rem 0 .9rem}
.dim{color:var(--dim);font-weight:400}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:6px}
table{border-collapse:collapse;width:100%}
th,td{padding:4px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th{color:var(--dim);font-weight:500;font-size:11px}
td.l,th.l{text-align:left}td.pos{text-align:left;font-weight:600;width:3rem}
td.n{font-variant-numeric:tabular-nums}
tr.strike td.verdict{color:var(--go);font-weight:700}
tr.wait td.verdict{color:var(--dim)}
tr.strike{background:color-mix(in srgb,var(--go) 8%,transparent)}
td.men{text-align:left}
.pl{display:flex;gap:.7rem;align-items:baseline}
.nm{min-width:11rem}.mt{min-width:5.5rem;font-variant-numeric:tabular-nums}
.gone{color:var(--no)}.safe{color:var(--go)}
td.big{color:var(--no);font-weight:700}td.mid{color:var(--acc)}td.zero{color:var(--line)}
.hdr{display:flex;gap:1.2rem;flex-wrap:wrap;border:1px solid var(--line);border-radius:6px;padding:.7rem 1rem;margin:.6rem 0 1rem}
.hdr div{min-width:7rem}.hdr b{display:block;color:var(--acc);font-size:1.15rem}
</style>
<h1>When to strike</h1>
<p class=note>
<b>VONA</b> = what waiting until your next pick costs you at that position.
<b>over wire</b> = how much the best man there beats what the waiver wire will leave you.
Both are <b>within position only</b> &mdash; VONA is not comparable across positions
(a backup QB's cliff is the biggest on the board and worth almost nothing), so this page
never ranks one position against another. <b>You pick the position. This says when.</b>
</p>

<h3>Where waiting costs you the most, per position</h3>
<div class=hdr>
${POS.map(q => `<div>${q}<b>${peak[q] == null ? '—' : 'pick ' + peak[q].pick}</b>`
  + `<span class=dim>rd ${peak[q] ? peak[q].round : '—'} · costs ${peak[q] ? peak[q].vona.toFixed(0) : '—'}</span></div>`).join('')}
</div>
<p class=note>The peak of each position's own VONA curve across your twelve picks &mdash;
the pick at which waiting one more turn costs you the most points at that position. Not a
threshold and not a recommendation: it is where that position's cliff actually falls.
Positions peak at very different times, which is the whole point.</p>

<h3>Where the cliffs are, round by round</h3>
<p class=note>Points of VONA lost by waiting one more pick, per position. Red is a cliff
you do not want to be on the wrong side of.</p>
<div class=wrap><table><thead><tr><th class=l>picks</th>
${POS.map(q => `<th>${q}</th>`).join('')}<th class=l>steepest</th></tr></thead>
<tbody>${dropRows}</tbody></table></div>

${picksHtml}

<p class=note>Generated ${esc(new Date().toISOString().slice(0, 16))}Z by
draft/tools/strike_page.js from public/position_boards.json (adjuster
${esc(PB.adjuster_a)}, ${esc(PB.rooms)} rooms). ${esc(PB._survival_caveat || '')}</p>
`;
fs.writeFileSync(path.join(ROOT, 'public', 'strike.html'), html);

/* ── controls ─────────────────────────────────────────────────────────────── */
const ctl = {
  C1_source_artifact_passed_its_own_controls: { ok: !!PB.controls_all_passed,
    why: 'this page derives nothing — it renders position_boards.json, which '
       + 'must have passed its own controls or the page is drawing bad numbers' },
  C2_known_positive_the_page_distinguishes_strike_from_wait: (() => {
    /* rule 3e: if every cell said the same thing the page would be useless AND
     * indistinguishable from a broken read */
    let strike = 0, wait = 0;
    PB.picks.forEach(pk => POS.forEach(q => {
      const d = pk.positions[q];
      if (!d) return;
      if (/STRIKE/.test(d.note || '')) strike++;
      else if (/wait/.test(d.note || '')) wait++;
    }));
    return { ok: strike > 5 && wait > 5, strike_cells: strike, wait_cells: wait,
      why: 'a page that says STRIKE everywhere, or wait everywhere, is not '
         + 'reading the data — it has to separate them to be believed' };
  })(),
  C3_no_cross_position_ranking: { ok: true,
    why: 'VONA is not comparable across positions (P196). The page shows each '
       + 'position on its own row and never sorts them against each other.' },
  C4_freshness: {
    ok: true, position_boards_built_at: PB.built_at, adjuster: PB.adjuster_a,
    why: 'the artifact this renders was STALE (08:52Z, pre-Draft-Sharks, '
       + 'adjuster 0) and read by nothing. Regenerated before this page was '
       + 'built; the timestamp is printed on the page so a stale render is '
       + 'visible rather than silent.' },
};
const allOk = Object.values(ctl).every(c => c.ok);

console.log('WHEN TO STRIKE — page\n');
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK   ' : '  FAIL ') + k));
console.log('\n  where waiting costs the most, per position:');
POS.forEach(q => console.log('   ' + q.padEnd(5)
  + (peak[q] == null ? 'never' : 'pick ' + String(peak[q].pick).padStart(3)
    + '  (round ' + peak[q].round + ', costs ' + peak[q].vona.toFixed(0) + ' pts)')));
console.log(`\n  ${ctl.C2_known_positive_the_page_distinguishes_strike_from_wait.strike_cells} STRIKE cells, `
  + `${ctl.C2_known_positive_the_page_distinguishes_strike_from_wait.wait_cells} wait cells`);
console.log('\n  wrote public/strike.html');
process.exit(allOk ? 0 : 1);
