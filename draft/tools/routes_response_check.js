#!/usr/bin/env node
// TERRITORY: relay — the relay owns "nothing is lost", and this is that, measured.
/**
 * IS ANYONE ANSWERING? — the inbox latency check ROUTES.md never had.
 *
 * Cory, 2026-08-18: *"And you've prevent this from happening again? Communication needs
 * to be better."* The honest answer when he asked was **no**, and this is the gap.
 *
 * `DEFECT-REGISTER.md` has `register_recheck_check.js`, which fails the build on a row
 * past its recheck date. `PREDICTION-LEDGER.md` has `prediction_ledger_check.js`, which
 * fails on a prediction past its grade-by date. **`ROUTES.md` — the actual cross-lane
 * inbox, the one place work is handed between lanes — had NO latency guard at all.**
 * `routes_integrity.test.js` exists but guards a different thing: merge corruption,
 * duplication and resurrection. Nothing measured whether an item was ever ANSWERED.
 *
 * That is how six items sat in `TO: E` from 08-17 with nobody noticing, and the first
 * real measurement says the problem is an order of magnitude larger than the case that
 * exposed it: **273 open items, 227 of them carrying no DEFAULT.**
 *
 * ── THE RULE, AND IT COMES FROM `OPERATING-MODEL.md`, NOT FROM TASTE ──────────
 *
 * The operating model already settled what silence means: *"Every request to A carries
 * an ASK, EVIDENCE, a RECOMMENDATION and a DEFAULT, so silence is consent to the
 * default and nobody idles waiting."*
 *
 *   * An open item **WITH a default** is fine at any age. Silence resolves it; that is
 *     the design working, not a backlog.
 *   * An open item **WITHOUT a default** blocks its sender indefinitely. Silence is not
 *     an answer, and no clock exists to say so. **That is the failure this counts.**
 *
 * ── WHY IT RATCHETS INSTEAD OF SIMPLY FAILING ────────────────────────────────
 *
 * Failing outright on all 227 would put the build red for weeks, four days before a
 * draft, and it would be switched off. That is not speculation — `intervention-rate`
 * wrote the epitaph for exactly this: *"A guard that cries wolf every morning is a
 * guard that gets switched off."* A guard nobody can satisfy protects nothing.
 *
 * So it fails only when the number **GROWS**. The backlog cannot get worse silently,
 * and every time it improves the tool asks you to lower the baseline, which is how the
 * number actually comes down. The baseline is committed, so lowering it is a deliberate
 * act with an author and a diff.
 *
 * Run:  node draft/tools/routes_response_check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ROUTES = path.join(ROOT, 'ROUTES.md');
const BASELINE = path.join(ROOT, 'draft', 'baseline', 'routes_backlog_baseline.json');

/** Below this age an unanswered item is simply in flight, not a communication failure. */
const RESPOND_BY_DAYS = 3;

const ITEM = /^- \[( |x)\] (\d{4}-\d{2}-\d{2}) · (.+?) ·/;

/**
 * ROUTES items, each with the body that follows it.
 *
 * An item owns every line until the next item or the next `##` section, because the
 * DEFAULT usually sits several lines below the header. Reading only the header line
 * would classify almost everything as default-less and make the count meaningless.
 */
function parse(text) {
  const out = [];
  let cur = null;
  let section = null;
  text.split('\n').forEach(function (line) {
    const m = ITEM.exec(line);
    if (m) {
      if (cur) out.push(cur);
      cur = { done: m[1] === 'x', date: m[2], who: m[3].trim(), section: section, body: [line] };
    } else if (/^## /.test(line)) {
      if (cur) { out.push(cur); cur = null; }
      // THE SECTION IS THE RECIPIENT, and without it this report names the wrong
      // lane. Most items carry no explicit "→ X", so falling back to the header
      // line attributes them to whoever WROTE them — printing "waiting on C" for
      // 83 items C is waiting on someone else for. A latency dashboard that
      // reverses the direction of the wait is worse than no dashboard.
      const s = /^##\s*TO:\s*(.+?)\s*$/.exec(line);
      section = s ? s[1] : null;
    } else if (cur) {
      cur.body.push(line);
    }
  });
  if (cur) out.push(cur);
  return out;
}

/** Does this item let silence be an answer? */
function hasDefault(item) {
  return /DEFAULT\s*(IF|:)|\*\*DEFAULT/i.test(item.body.join('\n'));
}

function ageDays(item, nowMs) {
  return Math.floor((nowMs - Date.parse(item.date + 'T00:00:00Z')) / 864e5);
}

/** The blocked set: open, no default, old enough that silence is now a failure. */
function blocked(items, nowMs, respondBy) {
  return items.filter(function (i) {
    return !i.done && !hasDefault(i) && ageDays(i, nowMs) >= respondBy;
  });
}

/** Per-lane latency — who is sitting on how much, and for how long. */
function byLane(items, nowMs) {
  const lanes = {};
  items.forEach(function (i) {
    // Explicit "→ X" wins (a redirect inside a section); otherwise the section
    // header, which is the recipient; the sender is the last resort only.
    const to = /→\s*([A-Za-z/]+)/.exec(i.who);
    const lane = to ? to[1] : (i.section || i.who);
    const l = lanes[lane] || (lanes[lane] = { lane: lane, count: 0, oldest: 0 });
    l.count++;
    l.oldest = Math.max(l.oldest, ageDays(i, nowMs));
  });
  return Object.keys(lanes).map(k => lanes[k]).sort((a, b) => b.count - a.count);
}

function main() {
  const items = parse(fs.readFileSync(ROUTES, 'utf8'));
  if (!items.length) {
    console.error('routes_response_check: parsed 0 items from ROUTES.md — the format '
      + 'changed and this check is now blind. Failing rather than passing vacuously.');
    return 1;
  }
  const now = Date.now();
  const open = items.filter(i => !i.done);
  const stuck = blocked(items, now, RESPOND_BY_DAYS);
  const shape = { blocked: stuck.length, open: open.length,
                  answered: items.length - open.length,
                  open_with_default: open.filter(hasDefault).length };

  let base = { blocked: null };
  try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { /* first run */ }

  console.log('='.repeat(76));
  console.log('ROUTES RESPONSE CHECK — is anyone answering?');
  console.log('='.repeat(76));
  console.log('  ' + items.length + ' items · ' + open.length + ' open · '
    + open.filter(hasDefault).length + ' of those carry a DEFAULT (silence resolves them)');
  console.log('  ' + stuck.length + ' BLOCKED — open, no default, ' + RESPOND_BY_DAYS
    + '+ days old. Silence answers nothing here.');

  if (stuck.length) {
    console.log('\n  waiting on:');
    byLane(stuck, now).slice(0, 8).forEach(function (l) {
      console.log('    ' + String(l.count).padStart(4) + '  ' + String(l.oldest + 'd').padStart(5)
        + ' oldest   ' + l.lane);
    });
    console.log('\n  the five oldest:');
    stuck.slice().sort((a, b) => ageDays(b, now) - ageDays(a, now)).slice(0, 5)
      .forEach(function (i) {
        const head = i.body[0].replace(/^- \[ \] /, '').replace(/\s+/g, ' ');
        console.log('    ' + ageDays(i, now) + 'd  ' + head.slice(0, 96));
      });
  }

  /* ── DOES THE LOOP VISIBLY CLOSE? ─────────────────────────────────────────
   *
   * Cory, 2026-08-18: *"Is A now seeing and responding to D and E requests?"*
   * The blocked count above could not answer that, and answering it by hand
   * turned up the reason it matters:
   *
   *     E (red team) → A    26 items    19 ticked (73%)    0 with no default
   *     D            → A    19 items     1 ticked ( 5%)   17 with no default
   *
   * A HAD answered both — `A → D` carries *"YOUR LATEST REPORT, ANSWERED POINT
   * BY POINT"* the same day. **Nothing ticked D's originals**, so from D's side
   * the inbox reads as nineteen unanswered asks. A's own reply names the cause:
   * *"two of your three questions were already answered there AND YOU HAD NOT
   * SEEN IT."* That is not A failing to respond; it is the loop not closing
   * where the asker looks.
   *
   * The blocked ratchet cannot see this: an item answered-but-unticked is
   * indistinguishable from one nobody read, and D's are all under the 3-day
   * threshold today — **all seventeen trip on 08-20, keeper-lock day.**
   *
   * So the closure rate is reported per sender. It is a NUMBER, not a gate:
   * a low rate can be a genuine backlog or pure bookkeeping, and no static rule
   * tells those apart. The asymmetry is the thing to look at.
   */
  const pairs = {};
  items.forEach(function (i) {
    if (!i.section) return;
    //: `who` sometimes already carries the "→ recipient" half ("relay → A"), so
    //: keying on it raw prints "relay → A → A" and splits one pair into two.
    const from = i.who.replace(/\s*→.*$/, '').trim();
    const k = from + ' → ' + i.section;
    (pairs[k] = pairs[k] || { n: 0, done: 0, noDefault: 0 });
    pairs[k].n++;
    if (i.done) pairs[k].done++;
    else if (!hasDefault(i)) pairs[k].noDefault++;
  });
  const big = Object.keys(pairs).filter(k => pairs[k].n >= 5)
    .sort((a, b) => (pairs[a].done / pairs[a].n) - (pairs[b].done / pairs[b].n));
  if (big.length) {
    console.log('\n  DOES THE LOOP VISIBLY CLOSE? — ticked share by sender→recipient');
    console.log('  (a low rate is a QUESTION: real backlog, or answered and never ticked?)');
    big.forEach(function (k) {
      const p = pairs[k];
      console.log('    ' + k.padEnd(24) + String(p.n).padStart(4) + ' items  '
        + String(Math.round(100 * p.done / p.n) + '%').padStart(5) + ' ticked  '
        + String(p.noDefault).padStart(3) + ' open with NO default');
    });
  }

  if (base.blocked == null) {
    console.log('\n  No baseline committed yet. Record this shape in '
      + path.relative(ROOT, BASELINE) + ' to arm the ratchet:');
    console.log('  ' + JSON.stringify(shape));
    console.log('='.repeat(76));
    return 0;
  }
  console.log('\n  baseline ' + base.blocked + '  ->  now ' + stuck.length);

  /* THE RATCHET HAS ONE HOLE AND THIS IS IT.
   *
   * `blocked` falls for two very different reasons: someone ANSWERED an item, or
   * someone bolted a DEFAULT onto it. A default written when the ask is filed is
   * the operating model working — silence becomes consent and nobody idles. A
   * default added later, to a pile of items nobody intends to read, is the check
   * being satisfied instead of the problem being solved, and it would show up as a
   * clean green ratchet.
   *
   * They are distinguishable: answering moves items from open to done, while
   * bolting on defaults leaves the open count flat and raises open_with_default.
   * So the signature is a fall in `blocked` with no rise in `answered`. Reported,
   * not failed — a lane may legitimately decide a batch of old asks can all
   * proceed on their defaults, and that is a real decision, not gaming. It just
   * has to be VISIBLE rather than silent. */
  if (base.answered != null && stuck.length < base.blocked) {
    const cleared = base.blocked - stuck.length;
    const answered = shape.answered - base.answered;
    if (answered < cleared / 2) {
      console.log('\n  ⚠️  ' + cleared + ' items left the blocked set but only ' + answered
        + ' were actually ANSWERED.');
      console.log('     The rest gained a DEFAULT instead. That can be a real decision —'
        + ' but say so,');
      console.log('     because from the ratchet alone it is indistinguishable from'
        + ' silencing the check.');
    }
  }
  if (stuck.length > base.blocked) {
    console.log('\n  ❌ THE BACKLOG GREW BY ' + (stuck.length - base.blocked)
      + '. Answer them, add a DEFAULT so silence resolves them, or SEND BACK.');
    console.log('     A ratchet that only reports is the thing that failed here already.');
    console.log('='.repeat(76));
    return 1;
  }
  if (stuck.length < base.blocked) {
    console.log('\n  ✅ DOWN ' + (base.blocked - stuck.length) + '. Lower the baseline to '
      + stuck.length + ' in ' + path.relative(ROOT, BASELINE) + ' to lock the gain in —');
    console.log('     a ratchet nobody tightens is just a high-water mark.');
  } else {
    console.log('\n  Holding at the baseline. Not worse.');
  }
  console.log('='.repeat(76));
  return 0;
}

module.exports = { parse, hasDefault, ageDays, blocked, byLane, RESPOND_BY_DAYS, main };

if (require.main === module) process.exit(main());
