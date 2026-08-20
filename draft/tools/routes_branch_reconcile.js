#!/usr/bin/env node
/**
 * `main`'s ROUTES BACKLOG IS NOT THE BACKLOG. IT IS THE BACKLOG MINUS EVERY
 * BRANCH NOBODY HAS MERGED YET — AND I REPORTED THE WRONG ONE TO CORY.
 *
 * ── THE DEFECT THIS EXISTS FOR ────────────────────────────────────────────
 *
 * On 2026-08-18 the relay answered Cory's *"how's the queue looking? Everyone
 * clearing or backlog?"* by counting unticked items in `ROUTES.md` **on `main`**.
 * The numbers were arithmetically correct and the answer was wrong: four lanes
 * were clearing hard on branches `main` could not see. B said so in a commit
 * message the same evening — *"Flag the babysitting report's B numbers as
 * merge-stale, not real backlog"* — which is a lane having to correct the
 * relay's report of that lane, the exact thing the relay exists to prevent.
 *
 * This is the FOURTH time "unticked ≠ unfinished" has produced a confident
 * wrong reading in this project, and every previous fix was me promising to
 * remember. `lane_status.js` reports unmerged COMMITS, which is the same
 * insight one level too coarse: it can say "D has 19 commits main cannot see",
 * it cannot say "and 11 of A's open items are already answered inside them."
 *
 * ── WHAT IT DOES ──────────────────────────────────────────────────────────
 *
 * Reads `ROUTES.md` at `main` and at every unmerged branch, keys each item by
 * its normalised text, and reports per lane:
 *
 *     open on main   ·   already ticked on some branch   ·   TRUE open
 *
 * plus the branch each reconciled tick came from, so the answer to "why is this
 * still showing" is always a branch name somebody can merge.
 *
 * It REPORTS. It never merges, never ticks, never fails the build — the same
 * reason `lane_status.js` doesn't. A tool that silently reconciles a mailbox is
 * a tool that can silently lose an item, and this project has already had one
 * merge resolver delete 9,400 characters including a draft-blocking row.
 *
 * ── RULE 3e: THE KNOWN POSITIVE IS SYNTHETIC, ON PURPOSE ──────────────────
 *
 * The obvious control — "assert it finds a real reconciled item today" — decays
 * the instant those branches merge, which is precisely the bug that killed the
 * first weight-drift control (anchored to a moving `HEAD`, passed once, failed
 * forever). So `--control` builds a two-document case where the answer is known
 * by construction: one item unticked on main and ticked on a branch (must
 * reconcile to 1) and one identical pair (must reconcile to 0). Both arms, so a
 * tool that reconciles everything fails as loudly as one that reconciles
 * nothing.
 *
 * Run: node draft/tools/routes_branch_reconcile.js [--control] [--lane A]
 */
'use strict';

const { execSync } = require('child_process');
const { warnIfStale } = require('./git_ref_freshness.js');

/* ⚠️ `maxBuffer` IS NOT DEFENSIVE, IT IS LOAD-BEARING, AND THE CONTROL DID NOT
 * CATCH THIS. `ROUTES.md` is **over a megabyte** — Node's default 1 MB pipe
 * buffer makes `git show origin/main:ROUTES.md` die with `ENOBUFS`, on the one
 * file this tool exists to read. The synthetic control passed cleanly minutes
 * earlier because it never shells out at all. Rule 3f, exactly: the control
 * proved the LOGIC and the first real run proved the PLUMBING, and only running
 * it against the real repo before writing the answer down found the difference. */
function git(cmd) {
  return execSync(cmd, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
  });
}

/** Old divergence, not in-flight work — same threshold and reason as lane_status.js. */
const ABANDONED_DAYS = 5;

/**
 * An item's identity is its text, not its position: sections get re-ordered,
 * re-indented and re-wrapped by every merge, and a positional key would call
 * that a different item. Punctuation and case go too — a lane that fixes a typo
 * while ticking must not read as "one item closed, one new item filed".
 */
function keyOf(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 120);
}

/** `{lane: {key: {ticked, text}}}` for one ROUTES.md document. */
function parseRoutes(text) {
  const lanes = {};
  const parts = String(text || '').split(/^## TO: /m);
  for (const part of parts.slice(1)) {
    const lane = part.split('\n')[0].trim();
    const items = lanes[lane] || (lanes[lane] = {});
    const re = /^- \[( |x)\] ([\s\S]*?)(?=^- \[| ?$)/gm;
    let m;
    while ((m = re.exec(part))) {
      const body = m[2].trim();
      if (!body) continue;
      const k = keyOf(body);
      if (!k) continue;
      /* A duplicated item where either copy is ticked counts as ticked — the
       * repair pass on 08-18 found a 5,884-char UNTICKED copy of an item whose
       * 1,065-char twin was ticked, and reading that pair as open is how a
       * finished ask gets re-dispatched to a lane that already did it. */
      if (!items[k] || m[1] === 'x') items[k] = { ticked: m[1] === 'x', text: body.slice(0, 120) };
    }
  }
  return lanes;
}

/**
 * THE PURE CORE. `branches` is `[{branch, text}]`. Returns per-lane counts plus
 * the reconciled items and the branch that closes each — separated from all git
 * access so the control and the tests exercise the real logic.
 */
function reconcile(mainText, branches) {
  const mainLanes = parseRoutes(mainText);
  const parsed = branches.map((b) => ({ branch: b.branch, lanes: parseRoutes(b.text) }));
  const out = {};
  for (const lane of Object.keys(mainLanes)) {
    const items = mainLanes[lane];
    const rec = [];
    let open = 0;
    for (const k of Object.keys(items)) {
      if (items[k].ticked) continue;
      open++;
      for (const p of parsed) {
        const hit = (p.lanes[lane] || {})[k];
        if (hit && hit.ticked) { rec.push({ key: k, text: items[k].text, branch: p.branch }); break; }
      }
    }
    out[lane] = { open, reconciled: rec, trueOpen: open - rec.length };
  }
  return out;
}

function unmergedBranches(nowMs) {
  const raw = git('git for-each-ref --format="%(refname:short)\t%(committerdate:iso8601)" '
    + 'refs/remotes/origin').trim().split('\n');
  const rows = [];
  for (const line of raw) {
    const [ref, date] = line.replace(/"/g, '').split('\t');
    if (!ref || /\/(HEAD|main)$/.test(ref)) continue;
    const ageDays = (nowMs - new Date(date).getTime()) / 86400000;
    if (!Number.isFinite(ageDays) || ageDays > ABANDONED_DAYS) continue;
    const ahead = parseInt(git('git rev-list --count origin/main..' + ref).trim(), 10);
    if (!ahead) continue;
    rows.push({ branch: ref, ahead: ahead });
  }
  return rows;
}

function control() {
  const MAIN = [
    '## TO: A', '', '- [ ] 2026-08-18 · relay → A · ship the thing',
    '- [ ] 2026-08-18 · relay → A · a second, genuinely open thing', '',
  ].join('\n');
  const BRANCH = [
    '## TO: A', '', '- [x] 2026-08-18 · relay → A · ship the thing',
    '- [ ] 2026-08-18 · relay → A · a second, genuinely open thing', '',
  ].join('\n');

  const positive = reconcile(MAIN, [{ branch: 'lane/x', text: BRANCH }]).A;
  const negative = reconcile(MAIN, [{ branch: 'lane/x', text: MAIN }]).A;

  const posOk = positive.open === 2 && positive.reconciled.length === 1
    && positive.trueOpen === 1 && positive.reconciled[0].branch === 'lane/x';
  const negOk = negative.open === 2 && negative.reconciled.length === 0;

  console.log('KNOWN-POSITIVE CONTROL — both arms, synthetic by design');
  console.log('  a tick that exists ONLY on a branch  -> '
    + (posOk ? 'RECONCILED (1 of 2), branch named' : 'MISSED'));
  console.log('  a branch identical to main           -> '
    + (negOk ? 'reconciles nothing, correctly' : 'FALSE RECONCILE'));
  console.log('  ' + (posOk && negOk
    ? 'PASS — it finds a branch-only tick, and does not invent one.'
    : 'FAIL — a reconciler that reconciles everything is as wrong as one that '
      + 'reconciles nothing; both arms must hold.'));
  return posOk && negOk ? 0 : 1;
}

function main(argv) {
  if (argv.includes('--control')) return control();
  const laneArg = (argv[argv.indexOf('--lane') + 1] || '').trim();

  /* ABOVE the numbers, never below: a stale-ref warning printed under a table
   * is read after the number has already been believed. See git_ref_freshness.js
   * — this tool itself ran against a 45-commit-stale `origin/main` on 08-19. */
  warnIfStale('origin/main');

  const branches = unmergedBranches(Date.now());
  const mainText = git('git show origin/main:ROUTES.md');
  const withText = branches.map((b) => {
    let text = '';
    try { text = git('git show ' + b.branch + ':ROUTES.md'); } catch (e) { text = ''; }
    return { branch: b.branch, ahead: b.ahead, text: text };
  });

  const res = reconcile(mainText, withText);

  console.log('='.repeat(76));
  console.log('ROUTES BACKLOG — WHAT `main` SAYS vs WHAT THE BRANCHES ALREADY ANSWERED');
  console.log('='.repeat(76));
  console.log('  ' + withText.length + ' unmerged branch(es) read: '
    + withText.map((b) => b.branch.replace('origin/', '')).join(', '));
  console.log('');
  console.log('  lane   open on main   answered on a branch   TRUE open');
  let recTotal = 0;
  for (const lane of Object.keys(res).sort()) {
    if (laneArg && lane !== laneArg) continue;
    const r = res[lane];
    recTotal += r.reconciled.length;
    console.log('  ' + lane.padEnd(7) + String(r.open).padStart(9)
      + String(r.reconciled.length).padStart(21) + String(r.trueOpen).padStart(12));
  }
  console.log('');
  if (!recTotal) {
    console.log('  ✅ no open item on `main` is already ticked on an unmerged branch —');
    console.log('     the backlog on `main` IS the backlog, and can be quoted as one.');
  } else {
    console.log('  ⚠️  ' + recTotal + ' item(s) read as OPEN on `main` and are already done:');
    for (const lane of Object.keys(res).sort()) {
      if (laneArg && lane !== laneArg) continue;
      for (const r of res[lane].reconciled) {
        console.log('     TO: ' + lane + '  ← ' + r.branch.replace('origin/', ''));
        console.log('        ' + r.text.replace(/\s+/g, ' ').slice(0, 96));
      }
    }
    console.log('');
    console.log('  QUOTING THE `main` COLUMN TO CORY WOULD OVERSTATE THE BACKLOG BY THAT');
    console.log('  MANY ITEMS. The fix is a merge, not a re-dispatch: re-sending an ask a');
    console.log('  lane has already answered is how a cleared queue reads as an idle one.');
  }
  console.log('='.repeat(76));
  return 0;
}

module.exports = { parseRoutes, reconcile, keyOf };

if (require.main === module) process.exit(main(process.argv.slice(2)));
