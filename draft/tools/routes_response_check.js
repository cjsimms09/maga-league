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
    } else if (/^##/.test(line)) {
      //: `/^##/` NOT `/^## ` — the archive's headings are `### (was ...)` and a
      //: third hash sits where the space would be, so the old pattern skipped
      //: them entirely and every archived item inherited the wrong section.
      if (cur) { out.push(cur); cur = null; }
      // THE SECTION IS THE RECIPIENT, and without it this report names the wrong
      // lane. Most items carry no explicit "→ X", so falling back to the header
      // line attributes them to whoever WROTE them — printing "waiting on C" for
      // 83 items C is waiting on someone else for. A latency dashboard that
      // reverses the direction of the wait is worse than no dashboard.
      // `## TO: X` in the inbox, and the archive's `### (was `## TO: X`)` form —
      // added 08-18 when 101 closed items moved out and the closure census read
      // them as section-less, which reported `A → B 15 -> 0` as a regression.
      const s = /^##\s*TO:\s*(.+?)\s*$/.exec(line)
        || /^###\s*\(was\s*`##\s*TO:\s*(.+?)`\)\s*$/.exec(line);
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

/* AN ITEM THAT ASKS FOR NOTHING CANNOT BLOCK ITS SENDER, and counting it as
 * blocked overstates the backlog in a way that eventually gets the number
 * ignored.
 *
 * FOUND BY TURNING THIS TOOL ON MYSELF. Having just told D that six of their
 * items into A carry no default, I checked the relay's own: **twelve.** Twice
 * D's. Three of the four I filed today were explicitly *"NO ASK, NO DEFAULT
 * NEEDED"* or *"No ask. Reporting a mechanism"* — informational, and the
 * detector could not tell them from a request nobody can answer.
 *
 * ⚠️ REPORTED, NOT SUBTRACTED FROM THE RATCHET. This is a loophole by
 * construction — anyone can silence the check by typing "no ask" — so it does
 * NOT change what counts as BLOCKED, and the committed baseline stays
 * comparable. It prints the split beside it so the two are visible at once and
 * a lane inflating the informational half is obvious rather than hidden.
 */
function noAsk(item) {
  //: only the header line, so a "no ask" buried in a later paragraph about
  //: somebody else's item does not reclassify this one
  return /\b(NO ASK|No ask|NO DECISION|ASK:\s*none)\b/.test(item.body[0]);
}

/* A BROADCAST IS STRUCTURALLY NOT A REQUEST, AND THIS IS THE HALF THAT CANNOT
 * BE TYPED INTO EXISTENCE.
 *
 * Having warned that `noAsk` is a loophole anyone can write, the next honest
 * step was to find a classification nobody can write. An item whose header
 * appears verbatim in THREE OR MORE different inboxes is a rule announcement —
 * "you do not stop a capture job", "'we can't get it' is not a finished
 * answer", rule 3d — and a rule sent to four lanes is not four decisions
 * pending. You cannot fake this by rewording: rewording is exactly what stops
 * it matching.
 *
 * IT IS SMALL AND IS REPORTED AS SMALL: 3 broadcasts, 9 open instances out of
 * 169. The honest conclusion is the remainder — **no mechanical rule can
 * classify the other 160.** Only the sender knows whether a decision is owed,
 * which is why the fix routed to D and to my own lane is "say so", not "build
 * a better detector".
 */
function broadcastKeys(items) {
  const seen = {};
  items.forEach(function (i) {
    const k = i.body[0].replace(/^- \[[ x]\] \S+ · [^·]+ · /, '')
      .replace(/[*`_~]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 110);
    (seen[k] = seen[k] || new Set()).add(i.section);
  });
  const out = new Set();
  Object.keys(seen).forEach(k => { if (seen[k].size >= 3) out.add(k); });
  return out;
}

function isBroadcast(item, keys) {
  const k = item.body[0].replace(/^- \[[ x]\] \S+ · [^·]+ · /, '')
    .replace(/[*`_~]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 110);
  return keys.has(k);
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

/** The closure census, ACROSS ROUTES.md and ROUTES-ARCHIVE.md.
 *
 * Extracted from main() 2026-08-18 so the test suite measures the SAME census
 * the tool reports — its ratchet block had kept a private ROUTES.md-only copy
 * and went red the moment the archive both-files fix landed here, which is
 * exactly the drift a private copy guarantees. Pass the already-parsed
 * ROUTES.md items; the archive is read (and section-attributed via its
 * `### (was …)` headings, handled in parse()) here.
 */
function closureCensus(items) {
  let censusItems = items;
  try {
    censusItems = items.concat(parse(fs.readFileSync(
      path.join(ROOT, 'ROUTES-ARCHIVE.md'), 'utf8')));
  } catch (e) { /* no archive yet — the census is simply ROUTES.md */ }

  const pairs = {};
  censusItems.forEach(function (i) {
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
  return pairs;
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

  /* The split, printed beside the ratchet rather than folded into it. */
  const openNoDefault = open.filter(i => !hasDefault(i));
  const bkeys = broadcastKeys(items);
  const informational = openNoDefault.filter(noAsk);
  const bcast = openNoDefault.filter(i => isBroadcast(i, bkeys) && !noAsk(i));
  const unknown = openNoDefault.length - informational.length - bcast.length;
  console.log('  of ' + openNoDefault.length + ' open item(s) with no default: '
    + informational.length + ' SAY they ask for nothing · ' + bcast.length
    + ' are BROADCASTS (same');
  console.log('  header in 3+ inboxes — a rule, not four decisions) · ' + unknown
    + ' declare NEITHER, so nobody');
  console.log('  can tell whether a decision is owed. That last number is the '
    + 'real state of the inbox.');
  console.log('  NEITHER IS SUBTRACTED: "no ask" is a loophole anyone can type, '
    + 'so the baseline stays');
  console.log('  comparable and the split prints beside it. Only the broadcast '
    + 'half is unfakeable —');
  console.log('  rewording is precisely what stops it matching.');

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
  /* ⚠️ CLOSURE IS COUNTED ACROSS ROUTES.md **AND** ROUTES-ARCHIVE.md, AND THE
   * RATCHET'S FIRST REAL EVENT IS WHY.
   *
   * 2026-08-18: Cory asked for the moot items to go, so 101 closed pre-08-17
   * items moved to the archive. The ratchet fired immediately — `C → A: 68 -> 3`,
   * `A → B: 15 -> 0` — because it was reading one file and the closures had
   * moved to the other.
   *
   * **The right fix is not a baseline edit.** An archived item is still CLOSED;
   * it has not come un-done, and letting "I archived it" silence the ratchet
   * would be the loophole this whole check exists to avoid. So the closure
   * census reads both files, which makes it immune to archiving while still
   * catching the thing it was built for: a ticked item going untucked.
   *
   * The BLOCKED count deliberately still reads only `ROUTES.md` — an archived
   * item is not in anybody's inbox, so it cannot be blocking anybody. */
  const pairs = closureCensus(items);
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
  /* ── THE CLOSURE RATCHET, AND THE UNIT IS A COUNT RATHER THAN A RATE ──────
   *
   * Cory, 2026-08-18: *"Have you solved communication problem going forward?"*
   * The measurement was solved; the behaviour was not. This is the half that
   * bites — and it is deliberately the mildest form that still catches
   * something real.
   *
   * ⚠️ A RATE WOULD CRY WOLF ON EVERY NEW FILING. `D → A` at 5% ticked drops
   * further the moment D files a legitimate new item, so a rate ratchet would
   * fail the build for doing the right thing. `intervention-rate` already wrote
   * that epitaph. **So the ratchet is on the ABSOLUTE TICKED COUNT per pair**,
   * which cannot fall by filing and can only fall by un-ticking or losing a
   * closed item.
   *
   * THAT IS NOT A HYPOTHETICAL FAILURE. This file's own `_history` records it:
   * seven items were closed on 08-17 and re-opened on 08-18 by a union merge
   * (E had forked before the closure, so the merge took both sides), and
   * `routes_resurrections.py` had to delete them. **A closure ratchet is the
   * guard that would have caught that on the closure side rather than after
   * somebody noticed.**
   *
   * It does NOT fail on a low rate. A lane with a genuine backlog is not the
   * defect this catches; work being un-done silently is.
   */
  if (base.closure_by_pair) {
    const regressed = [];
    Object.keys(base.closure_by_pair).forEach(function (k) {
      const was = base.closure_by_pair[k].done;
      const now = pairs[k] ? pairs[k].done : 0;
      if (now < was) regressed.push(k + ': ' + was + ' -> ' + now);
    });
    if (regressed.length) {
      console.log('\n  ❌ CLOSED WORK CAME BACK OPEN: ' + regressed.join(' · '));
      console.log('     A ticked item going untucked is either a union merge taking both');
      console.log('     sides of a closure (see this baseline\'s _history) or somebody');
      console.log('     reopening without saying so. Repair it, or record why in the');
      console.log('     baseline. Do NOT lower the number to make this pass.');
      console.log('='.repeat(76));
      process.exitCode = 1;
      return 1;
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

module.exports = { parse, hasDefault, noAsk, broadcastKeys, isBroadcast, ageDays,
  blocked, byLane, closureCensus, RESPOND_BY_DAYS, main };

if (require.main === module) process.exit(main());
