// TERRITORY: B
/* CLICK-INS EVERYWHERE, AND CLEARER WORDING — Cory, live 2026-08-20: "What
 * things would you want if you were drafting. Improve look and
 * operability. Make wording as clear and concise as possible always
 * allow click ins for more info on everything you can."
 *
 * An audit of every player-name surface on the war room found six places
 * a name was NOT clickable while every other name on the page was
 * (inconsistent, reads as broken): the Roster Builder Model panel, the
 * Compare tray, the Queue, the source-boards cheat sheet (which also
 * truncated names with NO way to confirm who was clipped), and the
 * position-boards Ceiling Steals table. Plus four bare-jargon spots
 * (VORP shown twice with no gloss, WOPR, aDOT) that had no tooltip while
 * the identically-jargony VONA already did everywhere else on the page.
 *
 * This file pins all of it: the wiring (data-drill reaches the same
 * document-level open-panel delegate every other row already uses) and
 * the wording (every term now explained where it's shown, not just
 * defined somewhere else on the page).
 *
 * Run: node draft/tests/click_ins.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };
const esc = (s) => (s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));

// ── 1. Roster Builder Model panel — rows are clickable ──────────────────────
{
  const RBM = require(path.join(ROOT, 'public', 'js', 'draft', 'rbm_view.js'));
  const recs = [
    { player: { player_id: '111', name: 'Alpha Guy' }, position: 'RB', marginal: 12.3, why: 'starts over your worst RB' },
    { player: { player_id: '222', name: 'Beta Guy' }, position: 'WR', marginal: 8.1, why: 'flex upgrade' },
    { player: { name: 'No Id Guy' }, position: 'TE', marginal: 2.0, why: 'bench, positive' },
  ];
  const html = RBM.render(recs, {}, null, '', esc);
  ck('a recommended player with an id carries data-drill',
    /data-drill="111"[\s\S]{0,60}Alpha Guy/.test(html), html);
  ck('every player gets its own id, not the first row\'s reused',
    /data-drill="222"/.test(html), html);
  ck('CONTROL — a row with no player_id gets no data-drill at all, not a broken data-drill="undefined"',
    !/No Id Guy[\s\S]{0,80}data-drill="undefined"/.test(html)
    && (() => {
      const idx = html.indexOf('No Id Guy');
      const rowStart = html.lastIndexOf('<li', idx);
      const rowEnd = html.indexOf('</li>', idx);
      return !/data-drill/.test(html.slice(rowStart, rowEnd));
    })(), html);
}

// ── 2. position_boards_view.js — Ceiling Steals rows are clickable ─────────
// stealsStrip() isn't in the module's public API (only renderPositionBoards
// is, exercised end-to-end in position_boards_view.test.js already), so this
// lifts it directly by source text — same brace-matching pattern used
// elsewhere in this repo for internal helpers.
{
  const list = [
    { player_id: '9221', name: 'Steal Guy', position: 'RB', adp: 133, proj: 136, ceiling: 228, steal_gap: 15 },
    { name: 'No Id Steal', position: 'WR', adp: 100, proj: 120, ceiling: 200, steal_gap: 8 },
  ];
  const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'position_boards_view.js'), 'utf8');
  const liftFn = (name) => {
    const i = SRC.indexOf('function ' + name + '(');
    let depth = 0, j = SRC.indexOf('{', i);
    for (let k = j; k < SRC.length; k++) {
      if (SRC[k] === '{') depth++;
      if (SRC[k] === '}') { depth--; if (!depth) { j = k + 1; break; } }
    }
    return SRC.slice(i, j);
  };
  // stealsStrip() calls fmtNum() — lift both and close over it via new Function,
  // same pattern this repo uses whenever a lifted function has a sibling
  // dependency (see ui_fidelity_verdict.test.js).
  // eslint-disable-next-line no-new-func
  const stealsStrip = new Function(liftFn('fmtNum') + ';\n' + liftFn('stealsStrip') + ';\nreturn stealsStrip;')();
  const html2 = stealsStrip(list, null, esc);
  ck('a ceiling-steal with a real player_id carries data-drill',
    /data-drill="9221"[\s\S]{0,40}Steal Guy/.test(html2), html2);
  ck('CONTROL — a steal entry with no player_id gets no data-drill, not a throw',
    (() => {
      const idx = html2.indexOf('No Id Steal');
      const rowStart = html2.lastIndexOf('<tr', idx);
      const rowEnd = html2.indexOf('</tr>', idx);
      return !/data-drill/.test(html2.slice(rowStart, rowEnd));
    })(), html2);
  ck('CONTROL — empty list -> empty string, not a broken shell', stealsStrip([], null, esc) === '');
}

// ── 3. draft/tools/position_boards.js — ceiling_steals now carries player_id
// (TERRITORY: A, disclosed trespass — same shape as the earlier players[]
// fix, needed so #2 above has anything to wire onto) ───────────────────────
{
  const SRC = fs.readFileSync(path.join(ROOT, 'draft', 'tools', 'position_boards.js'), 'utf8');
  ck('the ceiling_steals map now emits player_id, same pattern as the earlier players[] fix',
    /const ceiling_steals = pool\s*\n\s*\.map\(x => \(\{\s*\n\s*player_id: x\.id,/.test(SRC));
  const board = path.join(ROOT, 'public', 'position_boards.json');
  if (fs.existsSync(board)) {
    const data = JSON.parse(fs.readFileSync(board, 'utf8'));
    ck('KNOWN-POSITIVE: the real committed artifact\'s ceiling_steals rows actually carry player_id',
      Array.isArray(data.ceiling_steals) && data.ceiling_steals.length > 0
      && data.ceiling_steals.every(r => r.player_id != null), (data.ceiling_steals || []).slice(0, 2));
    ck('...and its own controls still pass after the regeneration', data.controls_all_passed === true);
  } else {
    console.log('SKIP  no committed position_boards.json');
  }
}

// ── 4. app.js — source-text wiring checks for the browser-only surfaces ────
{
  const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  const slice = (fnName, len) => SRC.slice(SRC.indexOf('function ' + fnName), SRC.indexOf('function ' + fnName) + len);

  ck('the compare tray wires data-drill onto both player columns',
    /data-drill="' \+ escapeHtml\(String\(p\.player_id\)\)/.test(slice('renderCompareTray', 6000)));
  ck('the queue wires data-drill onto its name span',
    /q-name"' \+ \(p \? ' data-drill="' \+ escapeHtml\(String\(p\.player_id\)\)/.test(slice('renderQueue', 2000)));
  ck('the source-boards cheat sheet wires data-drill AND keeps the full name in a title '
    + '(a truncated + unclickable name was the worst combination on the page)',
    (() => {
      const s = slice('renderSourceBoards', 3200);
      return /class="src-name" data-drill="/.test(s) && /truncated \? ' title="' \+ escapeHtml\(p\.name\)/.test(s);
    })());

}

// ── 4b. warroom_charts.js — the drill-down's own VORP/WOPR/aDOT tooltips ───
{
  const WC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'warroom_charts.js'), 'utf8');
  ck('VORP has a tooltip on the drill-down row label',
    /'<span title="Value Over Replacement Player/.test(WC));
  ck('WOPR has a tooltip in the usage row',
    /'<span title="Weighted Opportunity Rating/.test(WC));
  ck('aDOT has a tooltip in the usage row',
    /'<span title="Average Depth of Target/.test(WC));
}

// ── 5. views/admin/warroom.ejs — big-board header tooltips ─────────────────
{
  const VIEW = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');
  ck('the big board\'s VORP header now explains itself',
    /title="Value Over Replacement Player[^"]*">VORP</.test(VIEW));
  ck('Adj ADP and Raw are distinguished (which is ours, which is the market\'s)',
    /title="Our own ranking[^"]*">Adj ADP</.test(VIEW) && /title="The market's plain ADP[^"]*">Raw</.test(VIEW));
}

// ── 6. verdict.js — the WOPR tiebreak fact spells itself out (escaped text,
// no HTML tooltip possible there — confirmed by reading how it renders) ────
{
  const SRC = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'verdict.js'), 'utf8');
  ck('the WOPR fallback branch names what WOPR means inline, since this text is HTML-escaped '
    + 'downstream and a title= tooltip would render as literal text, not a hover',
    /vlab = 'WOPR \(weighted opportunity rating/.test(SRC));
  const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('CONTROL — confirms the premise: tiebreak facts really are escapeHtml\'d, so inline '
    + 'wording (not a tooltip) is the only way to explain a term there',
    /v\.tiebreak\.facts\.map\(f => '<li>' \+ escapeHtml\(f\)/.test(appSrc));
}

// ── 7. THE COMPARE-TRAY CRASH — found live-verifying this batch, not by
// Cory: dollarGap() REFUSES a cross-position QB or K/DEF pair (D10a/5e
// rulings) with a `terms` object carrying only `.note`, no `.A`/`.B`.
// renderCompareTray's "Why?" panel read `g.terms.A.dollars` unconditionally,
// so comparing a QB against anyone else threw the moment you opened it. ────
{
  const E = require(path.join(ROOT, 'public', 'js', 'draft', 'engine.js'));
  // Premise check first (rule 3f) — confirm the refusal shape really does
  // lack .A/.B before asserting the render guard needs it.
  const qb = { player_id: '1', name: 'A QB', position: 'QB', proj_mean: 300, proj_ceiling: 400, adjusted_adp: 5 };
  const rb = { player_id: '2', name: 'A RB', position: 'RB', proj_mean: 200, proj_ceiling: 300, adjusted_adp: 10 };
  const refused = E.dollarGap(qb, rb, {});
  ck('CONTROL — a QB-vs-non-QB dollarGap really is refused (confidence: "refused")',
    refused.confidence === 'refused', refused);
  ck('...and the refusal object genuinely lacks .A/.B — this is the premise the crash rests on',
    refused.terms.A === undefined && refused.terms.B === undefined, refused.terms);

  const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'js', 'draft', 'app.js'), 'utf8');
  ck('the compare tray\'s "Why?" panel now guards on g.terms.A && g.terms.B before reading '
    + '.dollars off either one',
    /\(g\.terms\.A && g\.terms\.B\s*\n\s*\?\s*'<br>' \+ escapeHtml\(a\.name\)/.test(appSrc));
  ck('a normal (non-refused) pair still gets the full boom\\/season breakdown — the guard '
    + 'degrades ONLY the refused case, it does not remove the feature',
    (() => {
      const same = E.dollarGap(qb, { ...qb, player_id: '3', name: 'Another QB', proj_mean: 280 }, {});
      return same.terms.A !== undefined && same.terms.B !== undefined;
    })());
}

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
if (fail) { console.log('\nFAILED'); process.exit(1); }
