# THE CHECK THAT CHASES EVERY FINDING WAS HIDING THREE OF THEM

**Relay, 2026-08-18. Territory: relay — this is the relay's own mechanism, and
the relay's own defect.**

---

## 1 · HOW IT SURFACED

Not by looking for it. I ran a routine census of open register rows by date and
owner, and my ad-hoc Python count said **74 open, 4 undated**. Two minutes
earlier `register_recheck_check.js` had printed **72 open, 0 undated**.

Two counts of the same file disagreeing is a bug report, not a rounding
difference. Rule 3d — *an implausible result is a bug report until proven
otherwise* — and in this case it was worth chasing because the disagreement was
about **which rows are still being chased at all.**

The checker was wrong. In three independent ways.

---

## 2 · DEFECT 1 — A TICK IS NOT AN ACCEPTANCE, AND THREE ROWS WERE LOST TO IT

```js
function isClosed(r) { return /closed|✅/i.test(r.status); }
```

Any ✅ anywhere in the status cell closed the row. Three rows carry a tick that
does **not** mean closed:

| row | status cell | who is actually waiting |
|---|---|---|
| **31** | `✅ TEXT FIXED, ⚠️ SEND BACK OFFERED` | **A** — D edited four TERRITORY: A files and offered a SEND BACK |
| **E6** | `✅ **FIXED — verify**` | **B** — has not verified a change to B's own screen |
| **E15** | `✅ **FIXED — verify**` | **A** (engine) + **B** (surface) |

**"Fixed" is not "closed."** The tick means somebody did work. It says nothing
about whether the person who has to *accept* that work has seen it — and those
are exactly the rows that go quiet, because the author has moved on and the
reviewer was never told.

**`CLAUDE.md`'s headline is this failure.** *"Sixteen open rows were invisible to
the mechanism built to chase them."* That was undated rows and bold-broken dates.
This is the same failure wearing a costume, and the costume was a tick.

**⚠️ AND THE WORST ROW IN THE REGISTER WAS ONE OF THE THREE.** **E15 is the QB
over-recommendation Cory hit in his own live session** — at pick 88 the engine
promoted Bo Nix over Brock Purdy, **14.5 projected points worse**, and labelled
it *"on upside"*, when the only thing making Nix's ceiling bigger was
`QB 9-16` carrying a 1.426 multiplier against `QB 4-8`'s 1.316. A **calibration
constant, not a player.** E fixed it (score inversions 16 → 0, guards that
self-release, JS 315/315, war-room 19/19). **Nobody has reviewed it, and it was
marked closed, four days before Cory drafts on that engine.**

---

## 3 · DEFECT 2 — `RESOLVED` DOES NOT CONTAIN `CLOSED`

The other direction. A row whose status is the bare word `RESOLVED`, with no
tick, matched neither `closed` nor `✅` — so **row 39 was counted OPEN forever**,
with no way to ever leave the backlog except by someone adding an emoji.

---

## 4 · DEFECT 3 — THE PARSER RE-CREATED THE BUG ITS SIBLING GATE FORBIDS

`test_defect_register.py` has a **hard gate at zero** on unescaped pipes: a bare
`|` in a cell is a column separator and scrambles the row. It has caught me four
times this week.

`register_recheck_check.js` then split on **every** `|`, escapes included. So an
escaped `\|` added phantom columns, `cells.length - 2` landed one column too far
right, and the "status" it read was a fragment of prose.

**Measured: nine rows carry an escaped pipe and FIVE had their status misread.**

| row | what the check read as "status" | the real status |
|---|---|---|
| **4s** | ``33+` 240 → 151 graded, `WR\`` | **`✅ RESOLVED 08-18`** — counted OPEN |
| 2b | `delta\` | `🔴 OPEN` |
| 2d | `overall_rank − ADP\` | `OPEN` |
| 4i | `\` | `🔴 OPEN` |
| 39 | 100 characters of the next action | `RESOLVED` |

The guard against a bug, containing the bug.

---

## 5 · THE FIX

**Parser:** `split(/(?<!\)\|/)` — unescaped pipes only, matching the sibling
gate's own rule.

**Closure:** an explicit terminal **word** in the status cell —
*closed*, *resolved*, *ruled*, *withdrawn*, *superseded*. **A bare tick no longer
closes anything.** `ANSWERED`, `MITIGATED`, `IN HAND` and `WAITING` are
deliberately **not** terminal: they are progress reports, and **the safe
direction to err is toward being chased.**

**Eight new tests** (7 → 15), each with its counterpart:

- fail arms — `✅ FIXED — verify` is open · `SEND BACK OFFERED` is open ·
  `RESOLVED` with no tick is closed · an escaped pipe does not shift the status
  cell (using row 4s's real text)
- controls — every real terminal status in the register still closes · every
  progress word stays open · an escaped pipe does not *accidentally* close an
  open row whose prose contains the word "closed"
- **and one that reads the LIVE register**: no open row may wear a tick *and*
  carry no recheck date. That is the precise combination that hid all three —
  looks finished, cannot be chased. **It failed on first run, on 31, E6 and
  E15**, which is how it earned its place.

---

## 6 · THE COUNT WAS WRONG IN BOTH DIRECTIONS

**72 → 74 open.** Not a backlog that grew — a count that was wrong: **+3**
hidden rows, **−1** (4s, resolved but misread as open), **−1** (39, resolved but
unmatchable), **+1** (4t, below).

The three surfaced rows are now dated and routed, per `CLAUDE.md`'s rule that the
relay assigns dates and owners may move them with a reason:

- **E15 → 08-20**, the earliest, deliberately: an unverified fix to behaviour
  Cory personally reported, two days before he drafts on it.
- **E6 → 08-21**: a label change with no number moved — cheap to accept, cheap
  to leave rotting, and it must be settled before he reads the board.
- **31 → 08-23**: date **normalised, not moved.** It already said *"recheck
  post-08-22"*, a real date the regex cannot read because a prefix breaks
  `recheck\s+MM-DD` — the exact failure `CLAUDE.md` warned about, still present.

---

## 7 · TWO MORE THINGS THIS TURNED UP

**Row 4t was malformed and nobody could see it.** Six columns instead of five —
a bare pipe had split its action cell in two — and the row did not end with `|`
at all. Repaired by merging the fragments and closing the row.

**⚠️ AND THE OWNER GATE HAD BEEN PASSING BY ACCIDENT.**
`test_every_tracked_row_names_an_owner` looked for *"the first cell under 40
characters containing a lane letter"*. That heuristic is wrong in both
directions: it matches any short prose fragment, and it **misses a legitimate
owner cell that says more than a letter** — `**B** (fixed by E on Cory's
instruction — **B please review**)` is 58 characters and is the clearest owner
cell in the register.

**It had been passing on E6 and E15 only because the column-scrambling produced a
short fragment that satisfied the length test.** Un-scrambling the rows made the
real gap visible. Now positional — owner is the cell before status, which the
column-count gate guarantees — plus a control that pins the long-owner case and
the prose-contains-"OPEN" case that broke my first attempt at the fix.

**Two guards, each concealing the other's failure.** That is the part worth
remembering.

---

## 8 · RULE 3g — WHAT ELSE DOES THIS MEAN

**Does it imply another failure we have not looked for?** Yes, and it is
specific: **every other tool that parses `DEFECT-REGISTER.md` or `ROUTES.md` by
splitting on `|`.** `prediction_ledger_check.js` and `routes_response_check.js`
both read pipe tables. Checked today: the ledger check is green on its own terms
(74 predictions, none overdue), but neither has been audited for the escaped-pipe
split. **Not before 08-22** — the register is now correct and that is what
matters this week.

**Does it invalidate something we already trust?** **Yes — every "N open rows"
figure quoted this week**, including in `A-DRAFT-DAY-DECISIONS.md`, which says
73 (its guard allows ±25%, so it stands). No projection, price or board number is
touched; this is bookkeeping. But the bookkeeping is what decides which defects
get looked at before Saturday, so being wrong about it is not cosmetic.

**Is it routed to the lane that can act?** The mechanism was mine and is fixed.
The three surfaced rows are routed to **A** (31, E15 engine), **B** (E6, E15
surface) with dates before the draft.

---

*Guarded by `draft/tests/register_recheck_check.test.js` (15 checks) and
`draft/tests/test_defect_register.py` (13).*
