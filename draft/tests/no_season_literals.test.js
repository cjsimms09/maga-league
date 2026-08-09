'use strict';
// GUARD — no season-specific literal may hide in live code.
//
// The dangerous failure mode (Cory): a hardcoded year/date that shows LAST
// season as current every January and nobody notices. This scans the live,
// rendering code for the three mechanisms that cause it and FAILS if a new one
// appears — the same shape as the guards that caught duplicate module names and
// zero-collecting test files: a rule that cannot silently recur.
//
// It does NOT scan history/seed/archive data (years there are legitimate — they
// ARE the record) or comments' dates. Season-current values must derive from
// config / season.year / Sleeper, never from a literal.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

// Live, season-current code. Excluded on purpose: history-data.js + views/history
// (the chronicle IS years), seed-data.js/data.js (seeded history), rawarchive.js
// (archive years), predledger.js (ledger years), lineup.js (harvest window — its
// own dated tables, flagged for the Annual separately).
const FILES = [
  'src/betlogic.js', 'src/venmo.js', 'src/sidebets.js', 'src/dashboard.js', 'src/ledger.js', 'src/notify.js',
  'src/routes/member.js', 'src/routes/pickem.js', 'src/routes/dispatch.js', 'src/routes/playoffs.js',
  'src/routes/whatwatch.js', 'src/routes/marks.js', 'src/routes/trashtalk.js', 'src/routes/h2h.js',
  'src/routes/standings-movement.js', 'src/routes/pooladvisor.js',
  'views/dashboard.ejs', 'views/matchup.ejs', 'views/pickem.ejs', 'views/watch.ejs', 'views/bank.ejs',
  'views/team.ejs', 'views/partials/header.ejs', 'views/partials/footer.ejs',
];

// The three silent-stale mechanisms, as line-level patterns.
const BANNED = [
  { name: 'year baked into an identifier/key (e.g. draft_day_alert_2026)', re: /[A-Za-z]_20\d\d\b/ },
  { name: 'hardcoded season date string (e.g. "2026-09-10")', re: /['"]20\d\d-\d\d-\d\d['"]/ },
  { name: 'year literal as a fallback (e.g. || 2026)', re: /\|\|\s*20\d\d\b/ },
];

// Intentional, reviewed exceptions — legacy ONE-TIME migrations whose guard keys
// must stay (renaming them would re-run the migration). Add here ONLY with a
// reason; a bare season-current literal must never be allowlisted.
const ALLOW = [
  // (helpers.js is not scanned; listed for the record.) No live-code exceptions.
];

let pass = 0, fail = 0;
const ck = (n, c, d) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (d ? ' -> ' + d : ''))); };

let hits = [];
for (const rel of FILES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // strip line comments so dated comments ("Cory (2026-08-09):") don't trip it
    const code = line.replace(/\/\/.*$/, '').replace(/<%#[\s\S]*?%>/g, '');
    for (const b of BANNED) {
      if (b.re.test(code)) {
        const key = `${rel}:${i + 1}`;
        if (ALLOW.includes(key)) continue;
        hits.push(`${key}  [${b.name}]  ${line.trim().slice(0, 90)}`);
      }
    }
  });
}

ck('no season-specific literal in live code', hits.length === 0,
  hits.length ? '\n  ' + hits.join('\n  ') : '');

// sanity: the guard actually detects the patterns (so a green run means something)
const probe = (s, re) => re.test(s);
ck('guard detects year-in-key', probe('config.draft_day_alert_2026', BANNED[0].re));
ck('guard detects date string', probe("'2026-09-10'", BANNED[1].re));
ck('guard detects || year fallback', probe('x || 2026', BANNED[2].re));
ck('guard ignores month-day (not a year)', !probe("'09-10'", BANNED[1].re));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
