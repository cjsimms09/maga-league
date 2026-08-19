// TERRITORY: C owns the data · B owns the surface
// THE DURABILITY TABLE — UN-DEFERRED BY CORY, 2026-08-18: "dont gatekeep
// things for after draft if nothing critical."
//
// C's `where_the_constant_is_furthest_from_the_player` (114-player realized-
// availability study, nflverse_durability.json) was previously ruled
// post-draft on freeze grounds; Cory's order supersedes. READ-ONLY: no board
// field reads this, so it changes no number the engine uses. It exists so the
// read is one tap in the war room instead of a memory of a register row.
//
// Run: node draft/tests/durability_section.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS  ' + n))
  : (fail++, console.log('FAIL  ' + n + (d !== undefined ? '\n        -> ' + JSON.stringify(d) : ''))); };

const ADMIN = fs.readFileSync(path.join(ROOT, 'src', 'routes', 'admin.js'), 'utf8');
const VIEW = fs.readFileSync(path.join(ROOT, 'views', 'admin', 'warroom.ejs'), 'utf8');

ck('the warroom route reads nflverse_durability.json',
  /nflverse_durability\.json/.test(ADMIN));
ck('...specifically the where_the_constant_is_furthest_from_the_player slice',
  /where_the_constant_is_furthest_from_the_player/.test(ADMIN));
ck('a read failure degrades to null, not a thrown error (the page must never break)',
  /durability = null;\s*\}\s*catch/.test(ADMIN) || /catch \(e\) \{ durability = null; \}/.test(ADMIN));
ck('durability is actually passed to the render (built and dropped is not shipped)',
  /durability,\s*\}\);/.test(ADMIN));

ck('the view guards on durability existing before rendering (no throw on a missing file)',
  /durability && durability\.most_optimistic/.test(VIEW));
ck('the section is explicitly labelled HISTORY NOT FORECAST, not left implicit',
  /HISTORY NOT FORECAST/.test(VIEW));
ck('the read-only framing (an argument for a per-player prior, not for fading anyone) survives to the screen',
  /not for fading/.test(VIEW));
ck('the table renders every field the data carries (name, pos, adp, seasons, realized, board, gap)',
  /r\.name/.test(VIEW) && /r\.pos/.test(VIEW) && /r\.adp/.test(VIEW)
  && /r\.seasons/.test(VIEW) && /r\.realized/.test(VIEW) && /r\.board/.test(VIEW) && /r\.gap/.test(VIEW));
ck('the understated direction (board UNDER-states durability) is shown too, not just the optimistic list',
  /durability\.understated/.test(VIEW));

// ── LIVE KNOWN-POSITIVE: the real committed file actually has the shape the
// route and view assume, so this suite is not just checking its own fixture. ──
{
  const raw = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'draft', 'backtest', 'nflverse_durability.json'), 'utf8'));
  const w = raw.where_the_constant_is_furthest_from_the_player;
  ck('KNOWN-POSITIVE — the committed file carries a non-empty most_optimistic list',
    !!w && Array.isArray(w.most_optimistic) && w.most_optimistic.length > 0,
    { n: w && w.most_optimistic && w.most_optimistic.length });
  ck('...every row carries the seven fields the table renders',
    w.most_optimistic.every(r => 'name' in r && 'pos' in r && 'adp' in r
      && 'seasons' in r && 'realized' in r && 'board' in r && 'gap' in r));
  ck('...and the list is sorted worst-gap-first (most negative = board most overrates him)',
    w.most_optimistic.every((r, i) => i === 0 || r.gap >= w.most_optimistic[i - 1].gap));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
