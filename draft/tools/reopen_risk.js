#!/usr/bin/env node
/**
 * WHICH UNMERGED BRANCH WOULD REOPEN A REGISTER ROW WE JUST CLOSED?
 *
 * ── THE INCIDENT, MEASURED 2026-08-18 ─────────────────────────────────────
 *
 * Cory routed `claude/in-season-surface-fixes-6nyayc` to A for merging. That
 * branch's `src/dashboard.js` is the PRE-FIX version: `configured: true` as a
 * literal at line 152 and again at 211. `main` carries neither — one is B's
 * close of register **5m**, the other is register **42**, which was 🔴🔴 and
 * league-facing. A naive merge puts both defects back.
 *
 * **AND THE REVERT WOULD BE INVISIBLE.** The pinned league-wide alert keeps
 * showing the RIGHT date either way; what silently returns is a fallback nobody
 * set announcing itself with the authority of a ruling nobody made. Nothing goes
 * red. Nobody notices until the next time the fallback and the truth disagree,
 * which in draft week is the week it matters.
 *
 * `lane_status.js` lists the branches. `routes_branch_reconcile.js` says which
 * of their work `main` cannot see. **Neither asks the opposite question — what
 * would merging them UNDO** — and with 7 branches outstanding four days before
 * the draft, that is the question with the teeth in it.
 *
 * ── THE SIGNAL, AND WHY IT IS THIS ONE ────────────────────────────────────
 *
 * For a branch B and `main`, at their merge base M:
 *
 *     risk(F)  =  F changed on M..B   AND   F changed on M..main
 *                 AND F is named by a register row closed RECENTLY
 *
 * The first two clauses are the classic both-sides-touched case — the only one
 * where a merge can silently pick a side. The third is what keeps this from
 * being a conflict predictor nobody reads: **hundreds of files change on both
 * sides of a 1,700-commit divergence, and roughly none of them carry a fix
 * somebody closed a row on this week.** Recency is the filter, because an old
 * close has long since propagated into every live branch; a close from three
 * days ago has not.
 *
 * It REPORTS and never merges — same reason as `lane_status.js`. It also does
 * NOT fail the build: both-sides-changed is normal, and a guard that reddens on
 * normal is a guard that gets switched off, which this project has an epitaph
 * for already.
 *
 * ── RULE 3e: THE CONTROL IS PINNED TO IMMUTABLE COMMITS ───────────────────
 *
 * The obvious control — "assert it flags the in-season branch today" — dies the
 * moment A merges it, which is exactly how the first weight-drift control died
 * (anchored to a moving `HEAD`: passed once, failed forever). Branch NAMES move
 * too. So `--control` pins both sides to commit SHAs that cannot change:
 *
 *     b26e1713  the branch head carrying pre-fix src/dashboard.js
 *     92c9d4de  "Close register 5m: draftAnnouncement's configured flag was
 *               still hardcoded true" — the fix, on main
 *
 * ⚠️ AND THE FIRST VERSION OF THE NEGATIVE ARM WAS IMPOSSIBLE, WHICH IS THE
 * ONLY REASON THIS COMMENT IS RIGHT. It asserted `public/css/style.css` was a
 * BRANCH-ONLY change and so must not flag. The control failed on its first run,
 * and the reason was not the tool: across a 1,700-commit divergence **every
 * single file that branch touched was touched on `main` too** — there is no
 * branch-only file in that pair at all. So the both-sides clause has almost no
 * discriminating power here, and a control built on it was measuring nothing.
 *
 * The arms now exercise the clause that actually does the work — the register
 * filter. Same two files, honest question: `src/dashboard.js` is behind a recent
 * close and must flag; `public/css/style.css` is equally both-sides-changed,
 * is behind NO recent close, and must not. A detector that flags every touched
 * file has told you nothing.
 *
 * Run: node draft/tools/reopen_risk.js [--control] [--days N]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const REGISTER = path.join(ROOT, 'DEFECT-REGISTER.md');

/** A close older than this has propagated into live branches already. */
const DEFAULT_RECENT_DAYS = 7;

/** Same "old divergence is not in-flight work" threshold as lane_status.js. */
const ABANDONED_DAYS = 5;

function git(cmd) {
  return execSync(cmd, {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

const TERMINAL = /(✅|CLOSED|RESOLVED|APPLIED|FIXED|RULED)/;

/**
 * MAILBOXES ARE EXCLUDED, AND NOT AS A CONVENIENCE.
 *
 * `ROUTES.md` and its siblings are append-only inboxes that **every lane edits
 * every day**, so they are both-sides-changed on literally every branch — the
 * first real run flagged them on 4 of 7 and the report was mostly this. They
 * also do not carry FIXES: reverting a mailbox loses an item, which is a
 * different failure with a different guard already on it (`merge_completeness.py`,
 * register 5o, and the union-merge resolver that once deleted 9,400 characters).
 *
 * Leaving them in would have made this a check that fires on every branch,
 * every day, for a risk it cannot actually assess — "a guard that cries wolf
 * every morning is a guard that gets switched off", and this project wrote that
 * epitaph itself.
 */
const MAILBOXES = new Set([
  'ROUTES.md', 'ROUTES-ARCHIVE.md', 'CORY-ASKS.md',
  'DEFECT-REGISTER.md', 'OPEN-QUESTIONS.md', 'PREDICTION-LEDGER.md',
]);

/** THE PURE CORE: which both-sides-changed files sit behind a recent close. */
function riskyFiles(bothChanged, guarded) {
  return bothChanged.filter((f) => !MAILBOXES.has(f) && guarded.has(f));
}

/**
 * Register rows closed within `days`, and the repo paths each names.
 *
 * Paths are read from BACKTICKED spans and required to exist on disk — the rows
 * are prose, and a bare `src/dashboard.js:152` or a sentence naming a function
 * would otherwise turn into a path that matches nothing, which is the failure
 * mode where a checker prints a confident clean nothing.
 */
function recentlyClosedRows(text, todayISO, days) {
  const cutoff = new Date(todayISO + 'T00:00:00Z').getTime() - days * 86400000;
  const year = Number(todayISO.slice(0, 4));
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line.startsWith('| ')) continue;
    const cells = line.split(/(?<!\\)\|/);
    if (cells.length < 6) continue;
    const id = cells[1].trim();
    if (!/^\d+[a-z]?$/.test(id)) continue;
    const status = cells[4] || '';
    if (!TERMINAL.test(status)) continue;
    /* The close DATE lives in the status cell as MM-DD ("✅ CLOSED 08-18"). No
     * date means we cannot tell recent from ancient, and treating undated as
     * recent is the safe direction: it can only add a row to a report. */
    const dm = status.match(/(\d{2})-(\d{2})/);
    if (dm) {
      const t = Date.UTC(year, Number(dm[1]) - 1, Number(dm[2]));
      if (t < cutoff) continue;
    }
    const files = new Set();
    for (const m of line.matchAll(/`([^`\s]+?\.(?:js|py|json|ejs|md|yml|css))(?::\d+)?`/g)) {
      const rel = m[1];
      if (fs.existsSync(path.join(ROOT, rel))) files.add(rel);
    }
    if (files.size) out.push({ id: id, files: [...files], status: status.trim().slice(0, 30) });
  }
  return out;
}

/** Files changed on BOTH sides of the merge base — the only silent-revert case. */
function bothSidesChanged(branchRef, mainRef) {
  const mb = git('git merge-base ' + mainRef + ' ' + branchRef).trim();
  const side = (a, b) => new Set(git('git diff --name-only ' + a + ' ' + b).trim()
    .split('\n').filter(Boolean));
  const onBranch = side(mb, branchRef);
  const onMain = side(mb, mainRef);
  return [...onBranch].filter((f) => onMain.has(f));
}

function liveBranches(nowMs) {
  const rows = [];
  for (const line of git('git for-each-ref --format="%(refname:short)\t%(committerdate:iso8601)" '
    + 'refs/remotes/origin').trim().split('\n')) {
    const [ref, date] = line.replace(/"/g, '').split('\t');
    if (!ref || /\/(HEAD|main)$/.test(ref)) continue;
    const ageDays = (nowMs - new Date(date).getTime()) / 86400000;
    if (!Number.isFinite(ageDays) || ageDays > ABANDONED_DAYS) continue;
    if (!parseInt(git('git rev-list --count origin/main..' + ref).trim(), 10)) continue;
    rows.push(ref);
  }
  return rows;
}

function control() {
  /* PINNED. Branch names move and refs move; these two SHAs are history. */
  const BRANCH = 'b26e1713';   // pre-fix src/dashboard.js (configured: true x2)
  const MAIN = '92c9d4de';     // "Close register 5m: ...configured flag was still hardcoded true"
  let both;
  try {
    both = bothSidesChanged(BRANCH, MAIN);
  } catch (e) {
    console.log('CONTROL COULD NOT RUN — ' + BRANCH + '/' + MAIN + ' unreachable. A '
      + 'SHALLOW CLONE does this; the control needs history (CI checks out '
      + 'fetch-depth 0).');
    return 1;
  }
  /* Through the WHOLE pipeline — the register filter included — because the
   * both-sides clause alone discriminates nothing across this divergence. */
  const rows = recentlyClosedRows(fs.readFileSync(REGISTER, 'utf8'),
    new Date().toISOString().slice(0, 10), 90);
  const guarded = new Map();
  rows.forEach((r) => r.files.forEach((f) => guarded.set(f, (guarded.get(f) || []).concat(r.id))));
  const risky = riskyFiles(both, guarded);

  const bothTouched = both.includes('src/dashboard.js')
    && both.includes('public/css/style.css');
  const positive = risky.includes('src/dashboard.js');
  const negative = !risky.includes('public/css/style.css');

  console.log('KNOWN-POSITIVE CONTROL — the real incident, pinned to immutable commits');
  console.log('  precondition: BOTH files changed on both sides -> '
    + (bothTouched ? 'yes, so the arms differ only by the register filter'
      : 'NO — the arms are not comparable, fix the pinned pair'));
  console.log('  src/dashboard.js      behind a close -> '
    + (positive ? 'FLAGGED (registers 42 and 5m would have reverted)' : 'MISSED'));
  console.log('  public/css/style.css  behind none    -> '
    + (negative ? 'not flagged, correctly' : 'FALSE POSITIVE'));
  console.log('  ' + (positive && negative
    ? 'PASS — it finds the revert it was built for, and does not flag every '
      + 'file the branch touched.'
    : 'FAIL — a detector that flags everything has told you nothing, and one '
      + 'that flags nothing has told you less.'));
  return positive && negative && bothTouched ? 0 : 1;
}

function main(argv) {
  if (argv.includes('--control')) return control();
  const di = argv.indexOf('--days');
  const days = di >= 0 ? Number(argv[di + 1]) : DEFAULT_RECENT_DAYS;
  const todayISO = new Date().toISOString().slice(0, 10);

  const rows = recentlyClosedRows(fs.readFileSync(REGISTER, 'utf8'), todayISO, days);
  const guarded = new Map();          //: file -> [row ids]
  rows.forEach((r) => r.files.forEach((f) => {
    guarded.set(f, (guarded.get(f) || []).concat(r.id));
  }));

  console.log('='.repeat(76));
  console.log('WOULD MERGING THIS BRANCH REOPEN SOMETHING WE JUST CLOSED?');
  console.log('='.repeat(76));
  console.log('  ' + rows.length + ' register row(s) closed in the last ' + days
    + ' days name ' + guarded.size + ' file(s) that exist on disk.');
  if (!guarded.size) {
    console.log('');
    console.log('  ⚠️  NOTHING TO CHECK AGAINST. That is not a clean bill of health — it');
    console.log('     means no recent close named a real file, so this run cannot tell a');
    console.log('     safe merge from a dangerous one. Widen --days or check the rows.');
    console.log('='.repeat(76));
    return 0;
  }
  console.log('');

  let hits = 0;
  for (const ref of liveBranches(Date.now())) {
    let both;
    try { both = bothSidesChanged(ref, 'origin/main'); } catch (e) { continue; }
    const risky = riskyFiles(both, guarded);
    const label = ref.replace('origin/', '');
    if (!risky.length) {
      console.log('  ✅ ' + label + ' — touches no file behind a recent close.');
      continue;
    }
    hits += risky.length;
    console.log('  ⚠️  ' + label);
    risky.forEach((f) => console.log('       ' + f
      + '   changed on BOTH sides · guards register ' + guarded.get(f).join(', ')));
  }

  console.log('');
  if (hits) {
    console.log('  Take `main`\'s side on the flagged files unless the branch genuinely');
    console.log('  supersedes the fix, then RUN THE ROW\'S OWN TEST after merging — a');
    console.log('  reverted close is invisible by nature: the screen still looks right,');
    console.log('  and nothing goes red until the fallback and the truth disagree.');
  } else {
    console.log('  No live branch touches a file behind a close from the last '
      + days + ' days.');
  }
  console.log('='.repeat(76));
  return 0;                            //: reports; both-sides-changed is normal
}

module.exports = { recentlyClosedRows, bothSidesChanged, riskyFiles, MAILBOXES };

if (require.main === module) process.exit(main(process.argv.slice(2)));
