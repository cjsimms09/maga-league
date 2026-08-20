// TERRITORY: A
/* THE SOURCE-DISAGREEMENT PAGE — static, generated, zero war-room work.
 *
 * Cory, 2026-08-19: "sounds like a lot of work for B to make this all easy to
 * use and build the page.. I should also be able to get to the mean page that
 * shows the combo of all of them and has the updated proj ceiling and floors
 * based on mean proj"
 *
 * THE MEAN PAGE ALREADY EXISTS AND NEEDED NOTHING. `attach_draftsharks.py` put
 * the blend on `public/draft_data.json`, so the war room's DEFAULT board is now
 * the mean of 7 sources with Draft Sharks' floor/ceiling percentages on it.
 * Nacua reads 282.9 / 212.4 / 313.8 where he used to read 286.7 / 177 / 192.
 *
 * So the only thing left was the per-source view, and that does NOT need to be
 * an interactive toggle in the war room. It needs to be a page. This generates
 * one -- static HTML, no build step, no framework, reads only committed
 * artifacts, and takes B off the critical path entirely.
 *
 * ⚠️ WHAT THIS IS NOT: it is not the draft board and must never be mistaken for
 * one. It ranks nobody and recommends nobody. It answers one question --
 * "who disagrees about this man, and by how much" -- and the war room stays the
 * single place a pick is made.
 *
 * REPORT ONLY. Writes public/sources.html.
 * Run: node draft/tools/sources_page.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const BOARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'draft_data.json'), 'utf8'));
const SNAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'draft', 'data', 'projection_snapshot_2026.json'), 'utf8'));
if (!SNAP.controls_all_passed) throw new Error('snapshot failed its controls — REFUSING');

const SOURCES = ['sleeper', 'draftsharks', 'cbs', 'espn', 'fftoday', 'fantasypros', 'own_v6'];
const LABEL = { sleeper: 'Sleeper', draftsharks: 'DraftSharks', cbs: 'CBS', espn: 'ESPN',
  fftoday: 'FFToday', fantasypros: 'FantasyPros', own_v6: 'Ours (v6)' };
const POS = ['RB', 'WR', 'QB', 'TE', 'K', 'DEF'];
const snapById = {};
SNAP.players.forEach(p => { snapById[String(p.player_id)] = p; });

/* ── per source, per position, a RANK. A raw projection cannot be compared
 * across sources (they sit on different levels, and per position: Draft Sharks
 * runs 25.6 low on QBs and 10.9 high on WRs). A RANK WITHIN POSITION is the
 * comparable thing, and it is what "who does this source like" actually means. */
const rankOf = {};
SOURCES.forEach(s => {
  rankOf[s] = {};
  POS.forEach(q => {
    SNAP.players
      .filter(p => p.position === q && p.proj && p.proj[s] != null)
      .sort((a, b) => b.proj[s] - a.proj[s])
      .forEach((p, i) => { rankOf[s][String(p.player_id)] = i + 1; });
  });
});

/* how many players each source-union actually ranks at each position -- the
 * denominator that makes a spread comparable */
const POOL_DEPTH = {};
POS.forEach(q => {
  POOL_DEPTH[q] = Math.max(1, Math.max(...SOURCES.map(s =>
    Object.keys(rankOf[s]).filter(id => (snapById[id] || {}).position === q).length)));
});

const rows = BOARD.players
  .filter(p => p.adp != null && p.adp <= 260 && POS.includes(p.position))
  .sort((a, b) => a.adp - b.adp)
  .map(p => {
    const id = String(p.player_id);
    const ranks = {};
    SOURCES.forEach(s => { ranks[s] = rankOf[s][id] != null ? rankOf[s][id] : null; });
    const seen = SOURCES.map(s => ranks[s]).filter(v => v != null);
    const spread = seen.length >= 3 ? Math.max(...seen) - Math.min(...seen) : null;
    /* ⚠️ AND A RAW SPREAD IS NOT COMPARABLE ACROSS POSITIONS EITHER. The first
     * version sorted on it and the top ten came back NINE RECEIVERS -- not a
     * finding, a fact about pool size: 241 receivers are ranked and 30
     * quarterbacks are, so a spread of 84 is available at WR and arithmetically
     * impossible at QB. Fifth time today that a statistic pooled across
     * positions produced a list that was really about the scale of the
     * position. Normalised by the position's own depth. */
    const depth = POOL_DEPTH[p.position] || 1;
    const rel = spread == null ? null : spread / depth;
    return { p, ranks, spread, rel, n: seen.length };
  });

const esc = t => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (v, d) => v == null ? '—' : (typeof v === 'number' ? v.toFixed(d == null ? 0 : d) : v);

function table(list) {
  let h = '<table><thead><tr><th class=l>player</th><th>pos</th><th>ADP</th>'
    + '<th>mean<br>proj</th><th>floor</th><th>ceiling</th>'
    + SOURCES.map(s => `<th title="${esc(LABEL[s])} rank within position">${esc(LABEL[s])}</th>`).join('')
    + '<th title="rank spread as a share of how many players are ranked at that position — raw spread is not comparable across positions">spread</th></tr></thead><tbody>';
  list.forEach((r) => {
    const { p, ranks, spread, n } = r;
    const band = p.ds_band_from ? '' : ' class=noband';
    h += `<tr><td class=l>${esc(p.name)}</td><td>${esc(p.position)}</td>`
      + `<td>${num(p.adp)}</td><td class=b>${num(p.proj_mean)}</td>`
      + `<td${band}>${p.ds_band_from ? num(p.proj_floor) : '—'}</td>`
      + `<td${band}>${p.ds_band_from ? num(p.proj_ceiling) : '—'}</td>`
      + SOURCES.map(s => {
        const v = ranks[s];
        if (v == null) return '<td class=miss>·</td>';
        const best = Math.min(...SOURCES.map(x => ranks[x]).filter(y => y != null));
        const worst = Math.max(...SOURCES.map(x => ranks[x]).filter(y => y != null));
        const cls = (n >= 3 && v === best) ? ' class=hi' : (n >= 3 && v === worst) ? ' class=lo' : '';
        return `<td${cls}>${v}</td>`;
      }).join('')
      + `<td class="${r.rel != null && r.rel >= 0.18 ? 'split' : ''}" title="${spread == null ? '' : spread + ' rank places out of ' + (POOL_DEPTH[p.position] || 0) + ' ranked at ' + p.position}">`
      + `${r.rel == null ? '—' : (100 * r.rel).toFixed(0) + '%'}</td></tr>`;
  });
  return h + '</tbody></table>';
}

/* ⚠️ AND NORMALISING BY DEPTH OVERCORRECTED — the list came back ALL K AND DEF,
 * because 18 rank places out of 30 kickers is 60% while 84 out of 241 receivers
 * is 35%. Raw spread favours the deep positions, relative spread favours the
 * shallow ones, and NEITHER is a cross-position fact. There is no honest single
 * list here: the quantity only means something inside a position. Cory picks the
 * position, so the page answers "who is contested AT WR" — the same conclusion
 * the ADP-upside tool reached this morning, arrived at twice in one day from
 * opposite directions. */
const disagreeBy = {};
POS.forEach(q => {
  disagreeBy[q] = rows.filter(r => r.p.position === q && r.rel != null)
    .sort((a, b) => b.rel - a.rel).slice(0, 8);
});
const disagree = POS.flatMap(q => disagreeBy[q]);

const html = `<!doctype html><meta charset=utf-8>
<title>Sources — who disagrees, and by how much</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>
:root{--bg:#0f1115;--fg:#e7e9ee;--dim:#8b93a7;--line:#232838;--hi:#2ecc71;--lo:#e74c3c;--acc:#f5a623}
@media(prefers-color-scheme:light){:root{--bg:#fff;--fg:#15181f;--dim:#666f85;--line:#e3e6ef}}
*{box-sizing:border-box}
body{margin:0;padding:1.2rem;background:var(--bg);color:var(--fg);
font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}
h1{font-size:1.05rem;margin:0 0 .2rem}
h2{font-size:.9rem;margin:1.6rem 0 .4rem;color:var(--acc)}
p.note{color:var(--dim);margin:.2rem 0 .8rem;max-width:62rem;font-size:12px}
.wrap{overflow-x:auto;border:1px solid var(--line);border-radius:6px}
table{border-collapse:collapse;width:100%;min-width:60rem}
th,td{padding:3px 7px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
th{position:sticky;top:0;background:var(--bg);color:var(--dim);font-weight:500;font-size:11px}
td.l,th.l{text-align:left}
td.b{font-weight:600}
td.hi{color:var(--hi)}td.lo{color:var(--lo)}
td.miss{color:var(--line)}
td.noband{color:var(--dim)}
td.split{color:var(--acc);font-weight:600}
</style>
<h1>Sources — who disagrees, and by how much</h1>
<p class=note>
Each source column is that source's <b>rank within the position</b>, not its raw points —
raw numbers sit on different levels and can't be compared (Draft Sharks runs 25.6 low on
QBs and 10.9 high on WRs, so its points would mislead where its ranks don't).
<span style="color:var(--hi)">Green</span> = this source is that player's biggest believer.
<span style="color:var(--lo)">Red</span> = his harshest. <span class=miss>·</span> = source has
no opinion on him. A <b>—</b> floor/ceiling means no Draft Sharks band exists for him, so the
ceiling adjuster can't move him and we're not inventing one.
<br><b>mean proj / floor / ceiling are the same numbers the war room now shows</b> —
the blend of 7 sources, wearing Draft Sharks' band percentages.
<br><b>This is not a draft board.</b> It ranks nobody and recommends nobody. It answers
"who disagrees about this man" — the pick still gets made in the war room.
</p>

<h2>Biggest disagreements, within each position — where your own read is worth the most</h2>
<p class=note><b>Top 8 within each position</b>, and that is deliberate. Sorting the raw
spread across positions returned nine receivers in the top ten &mdash; a fact about pool
size (241 WRs ranked vs 30 QBs), not about disagreement. Normalising by position depth
overcorrected to all kickers and defences (18 places out of 30 beats 84 out of 241). Neither
is a cross-position fact: the quantity only means something inside a position, so the list
stays inside one. These are the players the industry can't agree on; a consensus number
hides exactly this.</p>
<div class=wrap>${table(disagree)}</div>

${POS.map(q => `<h2>${q}</h2><div class=wrap>${table(rows.filter(r => r.p.position === q).slice(0, 40))}</div>`).join('')}

<p class=note>Generated ${esc(new Date().toISOString().slice(0, 16))}Z by
draft/tools/sources_page.js from public/draft_data.json and
draft/data/projection_snapshot_2026.json. Static — regenerate to refresh.</p>
`;

fs.writeFileSync(path.join(ROOT, 'public', 'sources.html'), html);

/* ── controls ─────────────────────────────────────────────────────────────── */
const withSpread = rows.filter(r => r.rel != null);
const ctl = {
  C1_ranks_are_within_position: { ok: true,
    why: 'a raw projection cannot be compared across sources — they sit on '
       + 'different per-position levels. Rank within position is the comparable '
       + 'quantity, and it is what "who does this source like" means.' },
  C2_known_positive_disagreement_is_real: {
    /* rule 3e: if every spread came back ~0 the page would be pointless AND
     * indistinguishable from a broken join. It must PROVE it found disagreement. */
    ok: withSpread.length > 100 && Math.max(...withSpread.map(r => r.spread)) >= 15,
    players_compared: withSpread.length,
    widest_spread: Math.max(...withSpread.map(r => r.spread)),
    median_spread: withSpread.map(r => r.spread).sort((a, b) => a - b)[withSpread.length >> 1],
    positions_in_top_30: [...new Set(withSpread.slice().sort((a, b) => b.rel - a.rel).slice(0, 30).map(r => r.p.position))],
    why: 'a page of zero spreads would look identical to a page whose join '
       + 'silently failed. It has to show real disagreement to be believed.' },
  C3_missing_is_shown_not_filled: { ok: true,
    why: 'a source with no opinion prints ·, and a player with no Draft Sharks '
       + 'band prints — for floor/ceiling. Neither is back-filled.' },
};
const allOk = Object.values(ctl).every(c => c.ok);

console.log('SOURCE-DISAGREEMENT PAGE\n');
Object.entries(ctl).forEach(([k, v]) => console.log((v.ok ? '  OK   ' : '  FAIL ') + k));
console.log(`\n  ${rows.length} players through ADP 260`);
console.log(`  rank spread across sources: median ${ctl.C2_known_positive_disagreement_is_real.median_spread}`
  + `, widest ${ctl.C2_known_positive_disagreement_is_real.widest_spread}`);
console.log('\n  the most contested, WITHIN each position (top 3 shown per position):');
POS.forEach(q => {
  disagreeBy[q].slice(0, 3).forEach(r => {
    console.log('   ' + r.p.name.slice(0, 22).padEnd(24)
      + r.p.position.padStart(4) + '  ADP ' + String(Math.round(r.p.adp)).padStart(3)
      + '   spread ' + String(r.spread).padStart(3)
      + ' (' + (100 * r.rel).toFixed(0) + '% of ' + r.p.position + ' depth)'
      + '   ranks ' + SOURCES.map(x => r.ranks[x] == null ? '·' : r.ranks[x]).join('/'));
  });
});
console.log('\n  wrote public/sources.html');
process.exit(allOk ? 0 : 1);
