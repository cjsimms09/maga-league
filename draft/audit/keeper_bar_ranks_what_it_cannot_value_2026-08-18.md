# E's seventeenth sweep — the keeper bar ranks rows it cannot value, and fixing it moves A's published term table

**Session E (red team), 2026-08-18.** Sibling of E17.

**⚠️ STATUS CHANGED THE SAME DAY. This was written as FILED-NOT-FIXED, because
applying it moves a published claim in a document marked `TERRITORY: A`. I routed
it `NO DEFAULT — BLOCKED` and held. Cory overrode the hold — *"Fix and continue"*
— so the fix and the document moved together, and the document edit is stamped as
an override for A's review. The reasoning below is left as written; the closing
section records what changed.**

---

## THE DEFECT

E17 fixed the **seam** — keepers reached `state.myRoster` without `vorp`. This is
the **reader**. `composite.js:nextYearVorp` reads:

```js
return (player.vorp || 0) * factor;
```

so **any** roster entry with no `vorp` scores as worth exactly zero rather than
unknown. The keeper bar is `ranked[slots-1]`, so a valueless row at that index
drags the bar NEGATIVE, after which `max(0, raw − bar)` **adds** to every
candidate.

**Two live paths put valueless rows on the roster BY DESIGN, and both are correct
to exist:**

- `app.js:recordManualPick` — a name typed at the table.
- the Sleeper poll's `known || {…off_board: true}` — a pick whose player is not
  on our board. The file's own measurement: **3.3% expected, 14% upper bound.**

The pick count, seat rosters, need and legality all have to see these rows. They
are simply not keeper candidates, because nothing knows what they are worth.

## WHAT IT PRODUCES — measured at pick 33

Roster of two keepers plus one off-board stub:

| candidate | claim on screen |
|---|---|
| Zay Flowers | "beats **Off-board Guy 1** by 12 pts" |
| Colston Loveland | "beats **Off-board Guy 1** by 12 pts" |

**Three KEEPER TARGET badges, each asserting a candidate beats a player the tool
has no projection for.** On screen the stub carries its real Sleeper name, so it
reads as a genuine judgement about a genuine player.

**THE BADGE ITSELF IS NOT THE DEFECT**, and the distinction is the whole point.
With a *valued* weak third candidate the same scenario produces "beats **Jordan
Mason** by 13 pts" — which is **true**. Only the unknown row is wrong.

## IT IS INERT FOR CORY'S SLATE TODAY — measured, not hoped

With three valued keepers the bar is `ranked[2]` and all three outrank any
valueless row, so the bar is **identical with and without stubs at every one of
his twelve picks**:

| roster (round 5) | bar |
|---|---|
| 3 keepers — his slate today | **+2.54** |
| 3 keepers + 2 stubs | **+2.54** |
| 2 keepers + 1 stub | **−7.71** |
| 1 keeper + 2 stubs | **−7.71** |

**It binds only when fewer than `slots` roster entries carry a real value.** That
is reachable: **if Cory locks two keepers on 08-20** (he has been weighing Nabers
against Henry) **and an off-board pick lands on his roster.**

## WHY IT IS FILED AND NOT FIXED — the part that matters

The fix is one line: filter the incumbent list on a finite `vorp` instead of
substituting zero. It is written, measured, and committed as a patch at
**`draft/audit/proposed/E18_keeper_bar_ignores_unvalued_rows.patch`**. It is
**not applied**, for a reason I did not anticipate and found by running the
suites:

**IT MOVES A PUBLISHED CLAIM IN A DOCUMENT MARKED `TERRITORY: A`.**

`draft/backtest/WAR-ROOM-SURFACE-CONTRACT.md` publishes the term table, and
`surface_contract.test.js` re-derives it and asserts `value` largest, `stack`
smallest:

| term | doc says | keepers scored at 0 | keepers correctly valued |
|---|---|---|---|
| `value` (VONA) | 59.0% | 56.1% | **63.1%** |
| `onesie` | 16.8% | 21.8% | **25.2%** |
| `keeper` | 14.3% | **12.0%** | **0.2%** |
| `stack` | 9.9% | 10.1% | **11.6%** |

**The keeper term's ~12–14% share was almost entirely the defect.** Valued
correctly it contributes **0.2%** — it is effectively inert at Cory's picks, and
it is now the SMALLEST term, not the third-largest. The document's stable claim
("`stack` is the smallest of the four") becomes false.

### AND A SECOND FINDING FELL OUT OF THAT, WHICH IS A'S TO ACT ON

**`surface_contract.test.js` builds its roster from `D.kept_players` verbatim**
— the raw artifact rows, which carry no `vorp`. The app has not done that since
E17 landed; `populateKeepers` now derives it. **So the suite is green while
grading a keeper term no surface produces.**

That is the same defect `rec_rows.test.js` records for its `|| undefined`
weights: *"a suite that cannot find the production weights must stop, not
guess."* Here the fixture does not go missing — it goes STALE, silently, because
the test constructs the roster itself instead of using the app's path.

**I corrected that fixture, saw it go red, and REVERTED IT.** Correcting it is
right, but it invalidates A's published table, and the document is A's. Editing
A's document to make A's suite pass on my measurement would be exactly the
override this lane is forbidden.

## WHAT I DID KEEP — truth only, no behaviour

Two comments in `app.js` asserted this could not happen, and both are now
narrowed to describe an OPEN defect:

- `recordManualPick`: *"The stub carries no projection, so it can never move a
  recommendation."* → it cannot be SCORED, but it does reach the keeper bar.
- the Sleeper stub: `off_board: true, // rendered differently; never scored` →
  never scored **as a candidate**, which is not the same as reaching nothing.

This is the self-description class the engine already documents about itself.
No behaviour changes.

### ASK / EVIDENCE / REC / DEFAULT → **A** (owns `composite.js` AND the contract doc)

```
ASK:      Apply the one-line incumbent filter, and re-derive the term table in
          WAR-ROOM-SURFACE-CONTRACT.md -- or rule that neither should move
          before 08-22.
EVIDENCE: Three KEEPER TARGET badges at pick 33 claiming a candidate beats a
          player with no projection, on a 2-keeper + 1-stub roster. Bar -7.71
          against +2.54 correct. Applying the fix moves the published table:
          keeper 12.0% -> 0.2%, and keeper becomes the SMALLEST term, which
          makes the document's "stack is smallest" claim false.
REC:      Apply BOTH after the draft, together, in one commit -- the fix and
          the re-derived table. Separately they contradict each other. And
          fix surface_contract.test.js's fixture at the same time: it builds
          its roster from raw kept_players and is green today only because it
          grades a keeper term the app stopped producing when E17 landed.
DEFAULT:  Nothing before 08-22. Inert for a 3-keeper slate, which is what Cory
          holds. If he locks FEWER THAN THREE on 08-20, this stops being
          inert and I will re-raise it that day.
```

Rule 3d, answered:
1. **Did the input vary?** No, and that is the finding: `vorp` is `undefined` on
   every stub, every run, by design.
2. **Did it arrive?** Yes — the stub reaches `state.myRoster` (app.js:5757 and
   :9515) and therefore `ctx.roster`, which the incumbent loop reads directly.
3. **Could the check have fired?** Yes. The known-positive is the 2-keeper +
   1-stub roster producing three badges; the negative control is that a *valued*
   weak candidate still correctly earns "beats Jordan Mason by 13".

## WHAT THIS SWEEP DOES **NOT** COVER

1. **It does not revisit whether KOV's model is right** — only that it ranks rows
   it cannot value. The ramp, discount and `keepProbability` are unexamined.
2. **The 0.2% keeper share is a consequence, not a verdict.** That the term is
   nearly inert at Cory's picks once valued correctly is a fact about this board
   and this roster; whether the term should be doing more is A's question.
3. **One roster.** Cory's, three keepers, twelve picks.


---

# APPLIED — 2026-08-17, on Cory's override

*"Fix and continue."* The hold above was mine, not his, and he overrode it. What
landed:

1. **`composite.js`** — the incumbent ranking filters on a finite `vorp` instead
   of substituting zero. One line, exactly the patch in
   `draft/audit/proposed/`.
2. **`WAR-ROOM-SURFACE-CONTRACT.md`** (`TERRITORY: A`) — §1's term table
   re-derived, with a dated note saying what moved and why, and an **override
   stamp at the head of the file** telling A to change it if they would have
   derived it differently. VONA's share corrected 59% → 63% in the two other
   places it appears.
3. **`surface_contract.test.js`** — the stale fixture fixed (it built its roster
   from raw `kept_players`, which the app stopped doing when E17 landed), and the
   order assertion **re-aimed to the full order rather than relaxed**.

## THE ORDER GOT STRONGER, NOT WEAKER — which I did not expect

The old document said the **middle ranks are board-dependent** because `keeper`
(14.3%) and `onesie` (16.8%) ran within a few points and a nightly rebuild
swapped them. **That closeness was the defect.** With the keepers valued, the
order does not move across any roster condition measurable on this board:

| roster | value | onesie | stack | keeper |
|---|---|---|---|---|
| 3 keepers (his slate today) | 63.1% | 25.2% | 11.6% | 0.2% |
| 2 keepers | 71.8% | 18.0% | 9.2% | 1.1% |
| 1 keeper | 71.8% | 18.0% | 9.2% | 1.1% |
| 0 keepers | 73.4% | 18.4% | 7.1% | 1.1% |

So the caveat is retired and the **full** order is pinned again — with the outer
two (`value` first, `keeper` last) asserted separately, since they carry the
widest margins and are what a reader acts on.

**Still one board.** The document's caution about nightly rebuilds is about board
variation, which I cannot test here. What I can say is that the *reason* the
middle pair used to swap is gone.

## E17 AND E18 ARE INDEPENDENT — neither subsumes the other

Found by running E17's suite after applying E18 and watching its known-positives
go **green by absence**, which is a test passing for the wrong reason. Measured at
pick 33:

| state | what the screen says |
|---|---|
| keepers with no `vorp`, E18 applied | *"3 keeper slots still open"* — **FALSE**, he holds three |
| keepers seeded (E17) + E18 | *"beats Derrick Henry"*, bar 1.63 — correct |

**E18 stops the bar asserting things about rows it cannot value; E17 is what
makes Cory's keepers valued enough to be counted at all.** Both are load-bearing,
and that pair is now a check in the E18 suite. E17's own known-positive was
rewritten to reconstruct the historical behaviour faithfully — an explicit
`vorp: 0`, which is what `(vorp || 0)` actually did — rather than relying on an
absence the fix now handles.

## THE HONEST CONSEQUENCE, STATED IN THE DOCUMENT RATHER THAN BURIED

**The `keeper` term is very nearly inert at Cory's picks: 0.2% of what separates
the top five, at weight 1.0.** It is not broken. It is correctly reporting that
with three strong keepers already held, the marginal keeper slot is worth almost
nothing to a mid-draft candidate — which is exactly what `KOV_marginal` was
designed to say. **Whether the term should be doing more than that is a live
question for A, and neither this audit nor the document settles it.**

## SUITES

`keeper_bar_ignores_what_it_cannot_value.test.js` — 13 checks, including the
known-positive that the defect is reachable, the negative control that a *valued*
weak candidate still earns a truthful badge, the E17/E18 independence pair, and
the inertness measurement at all twelve of Cory's picks.

**61 of 61** JS suites touching the keeper, composite or surface-contract paths
pass, plus `engine_ablation` and `bench_wire_room_sim` (both slow, run separately).
