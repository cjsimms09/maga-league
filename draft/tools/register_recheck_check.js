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
    out.push({ id: cells[0], status: cells[cells.length - 2], all: cells.join(' ') });
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
const TERMINAL = /\b(closed|resolved|ruled|withdrawn|superseded|retracted)\b/i;

function isClosed(r) {
  return TERMINAL.test(r.status);
}

/* "recheck 08-19" / "recheck 2026-08-19" — the register uses MM-DD. */
function recheckOf(r) {
  const m = r.all.match(/recheck\s+(?:(\d{4})-)?(\d{2})-(\d{2})/i);
  if (!m) return null;
  return `${m[1] || YEAR}-${m[2]}-${m[3]}`;
}

function audit(text, today) {
  const all = rows(text);
  const open = all.filter(r => !isClosed(r));
  const dated = open.map(r => ({ r, due: recheckOf(r) })).filter(x => x.due);
  const overdue = dated.filter(x => x.due < today);
  const undated = open.filter(r => !recheckOf(r));
  return { all, open, dated, overdue, undated, dupes: nearDuplicates(open) };
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
  return a.overdue.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { audit, rows, isClosed, recheckOf, nearDuplicates, normalise };
