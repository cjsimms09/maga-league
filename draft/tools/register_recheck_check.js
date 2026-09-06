/* TERRITORY: relay — findings must be ACTED ON, and a date nobody enforces is a wish.
 *
 * Cory, 2026-08-17: "I feel like we are still make tons of findings but no one
 * is following up or acting on any of them.. that needs to change."
 *
 * He is right and the relay is the biggest contributor: in one evening it filed
 * 4h, 4i, 4j, Q13, Q14 and D1-D9, and ACTED on almost none of them. The register
 * already carries the right fields — every row has an owner and a "recheck MM-DD".
 * NOTHING READ THEM. A recheck date that no build enforces is indistinguishable
 * from a row nobody intends to look at again, which is exactly the state Cory is
 * describing.
 *
 * So this is the same mechanism the repo already trusts for commitments —
 * "a date, and a check that FIRES if the date passes" — pointed at the register.
 * ONE check covers every finding ever filed, including the ones not written yet.
 *
 * WHAT IT DOES NOT DO, deliberately: it does not judge whether the work was
 * good, and it does not fail on a row that has no date. It fails on exactly one
 * thing — a row that is still OPEN after the date its own author promised to
 * look again. That is the smallest claim that makes a finding cost something.
 *
 * Run: node draft/tools/register_recheck_check.js [--today YYYY-MM-DD]
 * Exit 1 = at least one finding is past its own recheck date and still open.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REGISTER = path.join(__dirname, '..', '..', 'DEFECT-REGISTER.md');
const YEAR = 2026;

/* Rows are `| # | what | owner | status | next action |`. Status is the
 * second-from-last cell — read ONLY that, never the prose, so a row cannot
 * talk its way out by containing the word "closed" somewhere in its text.
 * The same narrowness the refusal guard needed, for the same reason.
 *
 * ⚠️ SPLIT ON UNESCAPED PIPES ONLY. A register cell may contain `\|` — the
 * register's own hard gate (`test_defect_register.py`) requires the escape,
 * because a bare `|` is a column separator and silently scrambles the row.
 * Splitting on every `|` re-creates that bug HERE instead: the escaped pipe
 * adds phantom cells, `cells.length - 2` lands one column too far right, and
 * the "status" this check reads is a fragment of prose.
 *
 * MEASURED 2026-08-18, and it was not hypothetical: NINE rows carried an
 * escaped pipe and FIVE had their status misread — worst of them row 4s, whose
 * real status is `✅ RESOLVED 08-18` and which this check was reading as
 * "33+` 240 → 151 graded, `WR\" and counting as OPEN. */
function rows(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    if (/^[|\-: ]+$/.test(t)) continue;
    const cells = t.replace(/^\|/, '').replace(/\|$/, '')
      .split(/(?<!\\)\|/).map(c => c.trim());
    if (cells.length < 4) continue;
    if (/^(#|what|question)$/i.test(cells[0])) continue;
    /* `line` is the raw row, added 2026-09-05 so the OTHER register tools can
     * stop carrying their own line-walkers: `closed_rows_resolve.js` and
     * `reopen_risk.js` both need the full row text to pull backticked paths and
     * shas out of it, and that need was the whole reason they each re-parsed
     * the table by hand and drifted (register 469, D10). Additive — every
     * existing consumer reads `id`/`status`/`all`. */
    out.push({ id: cells[0], status: cells[cells.length - 2], all: cells.join(' '), line: t });
  }
  return out;
}

/* A ROW IS CLOSED ONLY IF IT SAYS SO IN A WORD. NOT IF IT WEARS A TICK.
 *
 * This used to be `/closed|✅/i`, and the ✅ half quietly undid the whole
 * mechanism for the rows that needed it most. `CLAUDE.md`'s own headline is
 * about findings going invisible to the check built to chase them — that was
 * undated rows; this is the same failure in a costume, and it hid THREE rows
 * that are explicitly waiting on a named human:
 *
 *     31   ✅ TEXT FIXED, ⚠️ SEND BACK OFFERED     — a SEND BACK is an open
 *                                                   question by OPERATING-MODEL
 *     E6   ✅ **FIXED — verify**                   — B has not verified
 *     E15  ✅ **FIXED — verify**                   — A and B have not verified
 *
 * "Fixed" is not "closed". The tick means somebody did work; it says nothing
 * about whether the person who has to accept that work has seen it, and those
 * are precisely the rows that go quiet.
 *
 * It also missed the opposite case: `RESOLVED` with no tick (row 39) counted as
 * OPEN forever, because "resolved" does not contain the substring "closed".
 *
 * So: an explicit terminal WORD, in the status cell, or the row is open.
 * ANSWERED / MITIGATED / IN HAND / WAITING are deliberately NOT terminal — they
 * are progress reports, and the safe direction to err is toward being chased.
 *
 * ⚠️ RETRACTED ADDED 2026-08-18, ON A THIRD FAILURE MODE OF THE SAME CELL.
 * The merge of `main` brought in two rows — DS5 and 44 — whose status reads
 * "⚠️ RETRACTED, kept for the record", both being the SAME retraction under two
 * ids after a renumber. A retracted finding is withdrawn by definition: the
 * author looked again and said it was not real. Counting it OPEN forever
 * inflates the backlog with rows nobody can ever close, and an open count that
 * includes uncloseable rows is one people learn to ignore — the same decay that
 * killed the intervention-rate check.
 *
 * Note the direction of both bugs found in this cell so far: the ✅ rule closed
 * rows that were still live, and this one held open rows that were already dead.
 * **The status cell is the single most misread field in the register**, which is
 * why every rule about it is a WORD LIST rather than a symbol or a substring. */
/* ⚠️ ONE VOCABULARY, READ FROM draft/config/register_status_vocabulary.json
 * (register 313, 2026-08-24). This was a literal regex and
 * test_defect_register.py carried a DIFFERENT literal set, so the two guards
 * disagreed about what a status is. A row reading `✅ FIXED` matched NEITHER:
 * invisible to that file's owner/action/pipe checks, and counted OPEN forever
 * here. 25 of 295 numbered rows were in that gap, two of them ORANGE — live
 * work nothing was tracking. Two lists kept in sync by hand is how they
 * diverged; one file read by both is the fix.
 *
 * REFUSES rather than falling back to a literal. A silent fallback is precisely
 * how the drift happened, and a guard that quietly reverts to its old
 * vocabulary would hide the next divergence exactly as well as this one hid. */
const TERMINAL = (() => {
  const fsv = require('fs');
  const pv = require('path').join(__dirname, '..', 'config',
    'register_status_vocabulary.json');
  let doc;
  try { doc = JSON.parse(fsv.readFileSync(pv, 'utf8')); }
  catch (e) {
    console.error('REGISTER RECHECKS: cannot read register_status_vocabulary.json ('
      + e.message + '). REFUSING to fall back to a hardcoded status list — a '
      + 'silent fallback is how the two guards drifted apart (register 313).');
    process.exit(2);
  }
  const words = (doc.terminal || []).map(w => String(w).toLowerCase());
  if (!words.length) {
    console.error('REGISTER RECHECKS: the vocabulary carries no `terminal` words.');
    process.exit(2);
  }
  return new RegExp('\\b(' + words.join('|') + ')\\b', 'i');
})();

function isClosed(r) {
  return TERMINAL.test(r.status);
}

/* ── "FIXED" IS NOT "CLOSED", AND THE BACKLOG COULD NOT SHOW THE DIFFERENCE ──
 *
 * The vocabulary has always said `FIXED` / `BUILT` / `DIAGNOSED` describe work
 * done rather than a row closed, and that is right: a fixed defect can still
 * owe a test, a note, or a follow-up row. But this report lumped those rows in
 * with rows nobody had touched, so the two looked identical from outside.
 *
 * MEASURED 2026-08-28: 10 of 118 overdue rows carried a done-word and no
 * terminal word, and the first three examined (143, 144, 146) closed on the
 * spot — one of them carrying an "Open" clause that had been stale for eight
 * days because the thing it asked for was already in the code. THEY ARE
 * ROUTINELY THE CHEAPEST ROWS IN THE BACKLOG and they were the hardest to see.
 *
 * Report only. They are still open, still overdue, still counted; they simply
 * get their own heading now. Register 398. */
const CLAIMED_DONE = (() => {
  const fsv = require('fs');
  const pv = require('path').join(__dirname, '..', 'config',
    'register_status_vocabulary.json');
  let doc;
  try { doc = JSON.parse(fsv.readFileSync(pv, 'utf8')); }
  catch (e) {
    console.error('REGISTER RECHECKS: cannot read register_status_vocabulary.json ('
      + e.message + ').');
    process.exit(2);
  }
  const words = (doc.claimed_done || []).map(w => String(w).toLowerCase());
  /* No refusal here, unlike TERMINAL: this list only SPLITS a report. An older
   * vocabulary without the key must not stop the check from running — the
   * bucket simply comes back empty and says so. */
  return words.length ? new RegExp('\\b(' + words.join('|') + ')\\b', 'i') : null;
})();

/* ⚠️ A STATUS THAT ALSO SAYS "OPEN" IS NOT CLAIMING DONE. The first cut matched
 * the word anywhere in the cell and pulled in five rows whose status reads
 * `🟠 OPEN — measured, NOT acted on` and the like: the done-word is prose inside
 * a sentence that plainly says the row is live. A row stating a `live` word is
 * telling you it is open, whatever else the sentence contains, so it belongs in
 * the ordinary overdue list. That cut the bucket from 12 to the 6 that really do
 * read as "the work is done, nobody closed it" — measured 2026-08-28.
 *
 * The known positive and negative for this rule are in CLAIMED_DONE_TEST below,
 * taken VERBATIM from live register rows rather than invented (register 121). */
const LIVE = (() => {
  const fsv = require('fs');
  const pv = require('path').join(__dirname, '..', 'config',
    'register_status_vocabulary.json');
  let doc;
  try { doc = JSON.parse(fsv.readFileSync(pv, 'utf8')); } catch (e) { return null; }
  const w = (doc.live || []).map(x => String(x).toLowerCase());
  return w.length ? new RegExp('\\b(' + w.join('|') + ')\\b', 'i') : null;
})();

function claimsDone(r) {
  if (!CLAIMED_DONE || isClosed(r)) return false;
  if (LIVE && LIVE.test(r.status)) return false;
  return CLAIMED_DONE.test(r.status);
}

/* Verbatim status cells from the live register on 2026-08-28. */
const CLAIMED_DONE_TEST = [
  ['✅ FIXED 08-22', true],                                   // row 253
  ['✅ **FIXED, tested, awaiting review**', true],            // row E37
  ['🟠 MEASURED 08-19 — fix built, graded, CI-clear POSITIVE, deliberately '
    + 'NOT shipped', true],                                   // row 56
  // KNOWN NEGATIVES — a done-word inside a sentence that says the row is OPEN
  ['🟠 OPEN — measured, NOT acted on.', false],               // row 68
  ['🟠 OPEN — 5 suites FIXED, 23 left to A\'s judgement', false], // row E21
  ['🔴 ⏳ WAITING ON CORY (A14)', false],                     // row 76
  // and a genuinely closed row is never in this bucket, whatever it claims
  ['✅ CLOSED — fixed in abc1234', false],
];

/* "recheck 08-19" / "recheck 2026-08-19" — the register uses MM-DD.
 *
 * ⚠️ THE SEPARATOR IS NOT `\s+`, AND THAT COST US SIXTEEN INVISIBLE ROWS.
 * On 08-18 the E-lane merge added rows written `recheck **08-19**` and
 * `recheck post-08-22`. Both are perfectly clear to a human and BOTH WERE
 * INVISIBLE to this function, so sixteen open rows — including E12, "the
 * draft-day runbook's one irreversible step rests on a false premise" —
 * silently counted as having no recheck date and were never chased.
 *
 * That was remediated by hand-normalising the DATES. The MECHANISM was left
 * exactly as it was, so the same sixteen rows would reappear the moment
 * anyone bolded another one. Re-measured 08-19 with a known-positive control
 * (see SELF_TEST below): `recheck **08-26**` and `recheck post-08-22` were
 * still invisible, three weeks and one documented incident later.
 *
 * A false NEGATIVE here silently exempts a row from the only mechanism that
 * chases it — and an undated row is only REPORTED, never failed on (see the
 * comment in main()), so a missed date is genuinely silent. That is the
 * dangerous direction, and it is why this tolerates markdown emphasis.
 *
 * ⛔ IT DOES NOT TOLERATE A FREE-STANDING WORD, AND THE FIRST VERSION OF THIS
 * FIX DID. `(?:[a-z-]+[\s-]+)?` was meant to catch "recheck post-08-22"; it
 * also caught row 21b's "recheck WAS 08-18 — see the 08-23 date at the end of
 * this row", grabbing the SUPERSEDED date and reporting a healthy row as
 * overdue. The old regex got 21b right. Caught within a minute because the
 * dated/undated counts did not move while a new overdue row appeared — a
 * suspicious positive, rule 3d — and the shape is pinned in SELF_TEST below.
 * Only a HYPHEN-ATTACHED prefix ("post-", "pre-") is allowed. */
const RECHECK_RE =
  /recheck\b[\s:]*[*_~`]*\s*(?:[a-z]+-)?(?:(\d{4})-)?(\d{2})-(\d{2})/i;

/* ⛔ AND THE FIRST DATE IN A ROW IS NOT THE ROW'S DATE — 2026-08-20.
 *
 * Row 115 came due and was reported overdue at 08-19 while its actual date,
 * written at the end of the row, is 08-27. The 08-19 it matched is a date
 * QUOTED AS AN EXAMPLE inside the row's own prose — and the row is the one
 * documenting that this parser reads dates wrongly. It broke on itself.
 *
 * The register's convention is already last-wins and is written down inside it:
 * row 21b says "recheck WAS 08-18 — see the 08-23 date at the end of this row".
 * A row that gets re-dated appends; it does not rewrite history in place. So the
 * OPERATIVE date is the last one, and first-match was reading the archive.
 *
 * ⚠️ MEASURED BEFORE CHANGING, over all 239 rows — and the first measurement
 * was WRONG, which is worth recording because it is rule 3f exactly. I sized
 * the blast radius with a hand-written regex simpler than this file's own
 * (`recheck\s+(?:\*\*)?`) and predicted SEVEN rows moving, two of them open.
 * Re-run with THE TOOL'S ACTUAL PATTERN: ELEVEN move, SIX of them open. A probe
 * that does not use the code's own regex is not measuring the code.
 *
 * The eleven, and the only direction that is dangerous is a row silently
 * getting MORE time:
 *   115  OPEN  08-19 -> 08-27   later, and CORRECT — 08-19 was a date quoted
 *                               as an example inside the row's own prose
 *   E34  OPEN  08-22 -> 08-27   later; shape is "post-08-22 ... recheck 08-27",
 *   46   OPEN  08-22 -> 08-25   later; same shape. The concrete trailing date
 *                               is the operative one and "post-08-22" is a
 *                               constraint phrase, which is the convention.
 *   34   OPEN  08-25 -> 08-22   EARLIER — stricter
 *   30   OPEN  08-25 -> 08-22   EARLIER — stricter
 *   20b  OPEN  08-26 -> 08-20   EARLIER — stricter
 *   2b 4x 5e 24 E28             all CLOSED; the guard does not read them
 *
 * ZERO rows lost a date (144 dated before, 144 after) — that is the control
 * that matters, because an unparsed date is only reported, never failed on, so
 * dropping one is the silent failure this whole file exists to prevent.
 *
 * The known-positive and known-negative for this precedence are in SELF_TEST. */
function recheckOf(r) {
  /* last match, not first — see above. The regex is reused with /g rather than
   * duplicated, because two copies of this pattern is two chances to disagree
   * about what a recheck date looks like. */
  const g = new RegExp(RECHECK_RE.source, 'gi');
  let m = null, hit;
  while ((hit = g.exec(r.all)) !== null) m = hit;
  if (!m) return null;
  return `${m[1] || YEAR}-${m[2]}-${m[3]}`;
}

/* ── KNOWN POSITIVE, RULE 3e ────────────────────────────────────────────────
 * A parser with no test is how the last one stayed broken through its own
 * incident report. Every shape below has been seen in the register or is one
 * keystroke from it; the NEGATIVES matter as much, because a regex loose
 * enough to match anything would "fix" the false negatives by never firing. */
const SELF_TEST = [
  /* ── PRECEDENCE: THE LAST DATE WINS, added 2026-08-20 ──────────────────────
   * KNOWN POSITIVE — row 115's own shape, which broke this parser on the very
   * row documenting that this parser breaks. Two dates quoted as EXAMPLES in
   * the prose, the real one at the end. */
  ['sixteen rows written `recheck **08-19**` and `recheck post-08-22` were '
    + 'invisible. POST-DRAFT, owner relay, recheck 08-27.', '2026-08-27'],
  /* KNOWN NEGATIVE — a single-date row must be untouched by the precedence
   * change. Without this, "last wins" could be silently taking the only match
   * and the positive above would pass for the wrong reason. */
  ['owner A, recheck 08-24.', '2026-08-24'],
  /* KNOWN NEGATIVE — the operative date is LAST even when it is EARLIER than
   * an earlier-quoted one, so this is precedence and not "pick the latest". */
  ['was recheck 09-30 before the ruling. recheck 08-21.', '2026-08-21'],
  // the shapes that were INVISIBLE before 08-19, each one keystrokes from the register
  ['recheck 08-26.', '2026-08-26'],
  ['recheck **08-26**.', '2026-08-26'],
  ['**recheck 08-26**.', '2026-08-26'],
  ['_recheck 08-26_.', '2026-08-26'],
  ['recheck `08-26`.', '2026-08-26'],
  ['recheck post-08-22.', '2026-08-22'],
  ['recheck pre-09-01.', '2026-09-01'],
  ['recheck 2027-01-15.', '2027-01-15'],
  ['recheck: 09-05.', '2026-09-05'],
  // ⛔ THE ONE THAT KILLED THE FIRST FIX — verbatim from row 21b. A superseded
  // date announced in prose, with the live one later in the same row. The
  // parser must reach past it, not grab it.
  ['owner A, recheck WAS 08-18 — see the 08-23 date at the end of this row, '
   + 'unblocked by nothing, owner relay, recheck 08-23.', '2026-08-23'],
  // known NEGATIVES — a regex loose enough to match anything would "fix" the
  // false negatives by never returning null, which is not a fix
  ['no date here at all', null],
  ['rechecked the numbers and moved on', null],
  ['recheck when the draft is over', null],
];

function selfTest() {
  const bad = [];
  for (const [text, want] of SELF_TEST) {
    const got = recheckOf({ all: text });
    if (got !== want) bad.push(`  "${text}" -> ${got} (expected ${want})`);
  }
  /* The claimed-done split, same discipline: a report bucket that has never
   * been shown to separate anything is a heading, not a measurement. */
  for (const [status, want] of CLAIMED_DONE_TEST) {
    const got = claimsDone({ status: status });
    if (got !== want) bad.push(`  claimsDone("${status.slice(0, 50)}") -> ${got} (expected ${want})`);
  }
  if (bad.length) {
    console.error('⛔ recheck PARSER SELF-TEST FAILED — refusing to audit, because a\n' +
      '   broken parser reports "0 rows without a date" exactly like a healthy one:');
    bad.forEach(b => console.error(b));
    process.exit(1);
  }
}

/* ── ONE ROW, ONE LIVE DATE (added 2026-09-01, register 456) ────────────────
 *
 * `recheckOf` takes the LAST date in the cell, deliberately and with its own
 * known-positive above. That precedence is correct and it is also a trap: an
 * owner who rolls a date and leaves the OLD one in place has changed nothing if
 * the old one happens to sit later in the prose. Which date governs then
 * depends on cell ORDERING rather than on anybody's intent, and the roll is
 * silent either way.
 *
 * That is not hypothetical. Row 307 was rolled 08-31 -> 09-04 with the old date
 * left live (CLAUDE.md records it), and sweeping the whole register on
 * 2026-09-01 found FOUR more rows carrying two DIFFERENT live dates — 147
 * (08-27 and 09-08), 193 (08-31 and 09-15), 400 (three dates), 404 (09-03 and
 * 09-05). All four are now resolved by demoting the superseded ones to
 * `recheck WAS`, which is the register's existing convention for a date that
 * has been replaced.
 *
 * So this is a RATCHET ON A CLEAN STATE, not a fix for a live breakage: the
 * count is zero as it lands, and it goes red on the day the next one appears
 * rather than whenever somebody happens to sweep. Rows with the SAME date
 * repeated are left alone — a quoted date is not an ambiguous one.
 */
function multiLiveDates(open) {
  const g = /recheck\s+(?!WAS\b)(?:(2026)-)?(\d{2})-(\d{2})/gi;
  const bad = [];
  open.forEach(r => {
    const found = new Set();
    let m;
    g.lastIndex = 0;
    while ((m = g.exec(r.all)) !== null) found.add(`${m[1] || YEAR}-${m[2]}-${m[3]}`);
    if (found.size > 1) bad.push({ r, dates: [...found].sort() });
  });
  return bad;
}

function audit(text, today) {
  const all = rows(text);
  const open = all.filter(r => !isClosed(r));
  const dated = open.map(r => ({ r, due: recheckOf(r) })).filter(x => x.due);
  const overdue = dated.filter(x => x.due < today);
  const undated = open.filter(r => !recheckOf(r));
  const claimedDone = overdue.filter(x => claimsDone(x.r));
  const untouched = overdue.filter(x => !claimsDone(x.r));
  return { all, open, dated, overdue, claimedDone, untouched, undated,
    ambiguous: multiLiveDates(open),
    dupes: nearDuplicates(open) };
}

/* ── TWO OPEN ROWS, ONE FINDING (added 2026-08-18, on three at once) ────────
 *
 * Merging `main` produced THREE duplicate pairs — DS1/31, DS4/45, DS5/44 —
 * each the same measurement word for word under two ids. The mechanism will
 * recur: the D lane renumbered its `DS`-prefixed rows to numeric ids at its own
 * merge (row 45 still says "renumbered from 38 at merge — id taken"), and a
 * later merge brings BOTH the original and the renumbered copy back.
 *
 * That costs more than tidiness. A duplicated row inflates the open count, and
 * two lanes can independently work the same defect and each believe the other
 * row is something else. It is the register's version of the ledger's duplicate
 * id — which was also found live, and also only after it had already happened.
 *
 * ⚠️ COMPARED ON A NORMALISED PREFIX, NOT THE WHOLE CELL. Rows accrete
 * annotations, so two copies diverge in their tails within a day of being
 * filed — comparing full text would stop matching exactly when it matters. The
 * headline is what identifies a finding, so that is what is compared.
 */
function normalise(r) {
  return String(r.all || '')
    .replace(/\*|`|_|~/g, '')          // markdown emphasis
    .replace(/^\s*[A-Za-z0-9]+\s*/, '')  // the id itself
    .replace(/\(renumbered[^)]*\)/i, '') // the renumber note, which differs BY DESIGN
    .replace(/[^\w ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 160);
}

function nearDuplicates(open) {
  const seen = new Map();
  const out = [];
  for (const r of open) {
    const k = normalise(r);
    if (k.length < 40) continue;        // too short to be a confident match
    if (seen.has(k)) out.push({ a: seen.get(k).id.trim(), b: r.id.trim(), head: k.slice(0, 70) });
    else seen.set(k, r);
  }
  return out;
}

function main() {
  selfTest();                       // rule 3e — before it is allowed to report a null
  const i = process.argv.indexOf('--today');
  const today = i > -1 ? process.argv[i + 1] : new Date().toISOString().slice(0, 10);
  const a = audit(fs.readFileSync(REGISTER, 'utf8'), today);

  console.log('REGISTER RECHECKS — a finding that nobody acted on costs something\n');
  console.log(`  today: ${today}`);
  console.log(`  ${a.all.length} rows, ${a.open.length} open, `
    + `${a.dated.length} carrying a recheck date, ${a.undated.length} without one\n`);

  /* A DUPLICATE IS A HARD FAILURE, not a note. Two open rows for one finding
   * means two lanes can work it independently, each believing the other row is
   * something else — and the open count that everyone reads is wrong. */
  if (a.dupes.length) {
    console.log(`  ✗ ${a.dupes.length} DUPLICATE ROW PAIR(S) — one finding, two open ids:\n`);
    a.dupes.forEach(d => console.log(`      ${d.a} and ${d.b}: "${d.head}…"`));
    console.log('\n  Keep one, mark the other SUPERSEDED with a pointer. Do NOT delete it —\n'
      + '  an id that vanishes breaks every reference to it.');
    process.exitCode = 1;
  }

  if (a.claimedDone.length) {
    console.log('  🟡 THE WORK IS CLAIMED DONE AND THE ROW IS NOT CLOSED — '
      + a.claimedDone.length + ' row(s).');
    console.log('     These say FIXED / BUILT / GRADED / DIAGNOSED / MEASURED and carry no');
    console.log('     terminal word, so they are open, correctly. They are also usually the');
    console.log('     CHEAPEST rows here: verify the claim, then write "✅ CLOSED — fixed in');
    console.log('     <sha>". On 2026-08-28 the first three examined closed on the spot, and');
    console.log('     one was asking for something already in the code (register 398).\n');
    a.claimedDone.sort((x, y) => (x.due < y.due ? -1 : 1)).forEach(x =>
      console.log(`     ${x.r.id.padEnd(5)} due ${x.due}   ${String(x.r.status).slice(0, 40)}`));
    console.log('');
  }
  if (a.overdue.length) {
    console.log('  🔴 PAST ITS OWN RECHECK DATE AND STILL OPEN:\n');
    a.overdue.sort((x, y) => (x.due < y.due ? -1 : 1)).forEach(x =>
      console.log(`     ${x.r.id.padEnd(5)} due ${x.due}   ${x.r.all.slice(0, 96)}`));
    console.log('\n  Each of these was filed with a promise to look again by that date,'
      + '\n  and the date has passed. Act on it, or change the date and say why —'
      + '\n  both are fine. Leaving it silent is the thing this check exists to stop.');
  } else {
    console.log('  ✅ no finding is past its own recheck date.');
  }

  /* Undated OPEN rows are REPORTED, never failed on — yet. The register's own
   * standard says a refusal needs "an unblock condition, an owner and a recheck
   * date", so an undated open row is a real gap; but turning that red today
   * would fail the build on rows that predate this check, which trains people
   * to ignore it. Reported now, tightened once the count reaches zero. */
  if (a.undated.length) {
    console.log(`\n  ⚠️  ${a.undated.length} open row(s) carry NO recheck date, so this check`
      + '\n     cannot ever fire for them. Reported, not failed — see the comment in'
      + '\n     this file for why, and what closes that hole.');
  }
  if (a.ambiguous.length) {
    console.log(`\n  🔴 ${a.ambiguous.length} OPEN row(s) carry MORE THAN ONE live recheck date,`
      + '\n     so which one governs depends on where it sits in the prose rather than'
      + '\n     on what anyone decided. Demote the superseded one to `recheck WAS <date>`:');
    a.ambiguous.forEach(x =>
      console.log(`     ${x.r.id.padEnd(5)} ${x.dates.join('  and  ')}`));
  }

  return (a.overdue.length || a.ambiguous.length) ? 1 : 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { audit, rows, isClosed, claimsDone, recheckOf, nearDuplicates, normalise };
