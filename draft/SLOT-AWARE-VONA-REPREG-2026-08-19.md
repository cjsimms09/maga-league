# PREREGISTRATION — re-taking the diagnosis that switched `VONA_SLOT_AWARE` off

**A, 2026-08-19. Filed BEFORE running anything.** Draft is 08-22.

Cory: *"keep tuning roster selection (still too many RBs)"* and *"What happened
to our flex rules and bench rules and the things that fixed our roster building?
wtf"*.

---

## 1. Why this is being re-taken, and why that is not a licence to switch it on

`VONA_SLOT_AWARE: false` (`engine.js:245`) is the second of register 60's three
disconnections. **The recorded reason it is off is a measurement:** flooring the
flex marginal at 0 tied **1331 of 1686 players at exactly 0**, ordering below the
starters stopped existing, and quarterbacks won the tie.

**That measurement was taken on a VONA that was computing the wrong quantity.**
Register 56 / P107 fixed `VONA_INCLUDE_SELF` on 08-19 — the player now belongs in
his own next-pick pool, worth +114.1 per seat-season, replicated 3/3. Every
number in the collapse diagnosis predates it.

**A stale justification is a reason to re-measure, NOT evidence for the other
side.** The honest default is that the flag stays off; it moves only if the
re-take clears the bar written below, before I look at any output.

Two further facts that must not be read as support:
- The floor at 0 that caused the collapse **is already gone** from the code
  (`return player.proj_mean - forgone`, unfloored). So the specific mechanism
  may already be fixed independently of the VONA change, and if the collapse is
  gone I must NOT attribute that to `VONA_INCLUDE_SELF`.
- The function has collapsed **three times** in three different ways (a floor at
  0, a multiplicative crush that moved negatives up, a clamp that flattened the
  tail). Every one showed as the board filling with one-start positions. The
  prior here is that it collapses, not that it works.

## 2. Arms

| arm | `VONA_INCLUDE_SELF` | `VONA_SLOT_AWARE` | `VONA_WIRE_BENCH` |
|---|---|---|---|
| **s0** — shipped | true | **false** | (unreachable) |
| **s1** | true | **true** | false |
| **s2** | true | **true** | true, with `wire_level` supplied |

s2 requires the `wire_level` join that register 60 (3) says `build.py` never
does. If that join is not in place when this runs, **s2 is NOT RUN and is
reported as not run** — it is not silently folded into s1.

## 3. The collapse diagnostic — stated with its threshold BEFORE the run

Primary quantity: **the share of the priced board whose VONA lands on the single
most common value**, at Cory's real pick 48 with his committed keepers.

- Historic failure: **1331 / 1686 = 78.9%.**
- **PASS: modal share ≤ 5%** in s1 — i.e. the board is ordered.
- **FAIL: modal share > 5%.** Anything above that is the same failure again and
  the flag stays off regardless of every other number in this document.

Secondary, reported either way and NOT decision rules on their own:
distinct-value count, the position mix of the top 40, and whether QBs win ties.

## 4. The decision rule — all four, or the flag stays off

`VONA_SLOT_AWARE` ships ON only if **every one** holds:

1. **No collapse** — modal share ≤ 5% (§3).
2. **The seat replay does not get worse.** On the preregistered primary
   (hindsight-optimal legal lineup), s1 − s0 ≥ 0 across 30 seat-years, with
   season-clustered CI over 3 clusters. **A point estimate is not enough: the CI
   must not exclude zero on the negative side.**
3. **The roster shape moves toward legality, not away.** Register 59's symptom is
   RB10/WR1 with an un-fieldable week-11 lineup. s1 must not increase the count
   of un-fieldable weeks.

   > **⚠️ MEASURED 2026-08-19 — AND MY FIRST ANSWER WAS THAT I COULD NOT.**
   > I marked this NOT MEASURABLE because the seat replay's `optimal` estimand
   > CONSTRUCTS a legal lineup every week by definition, so it can never report
   > one. **That was a condition written against an instrument that cannot
   > answer it — the same error as publishing a null on an instrument that
   > could not have seen the effect.** `draft/tools/fieldability_probe.js`
   > measures it directly on the live board, where byes are known, with a
   > bipartite matcher (greedy strands dedicated slots) and five controls
   > including two greedy traps.
   >
   > **Un-fieldable SKILL weeks — K/DEF excluded, because a one-kicker roster
   > is un-fieldable in its own kicker's bye by construction and you stream
   > that:**
   >
   > | arm | un-fieldable skill weeks |
   > |---|---|
   > | shipped | **3** — wk6 (QB+WR), wk11 (WR), wk13 (TE) |
   > | **s1 slot-aware** | **0** — the only arm at zero |
   > | need=1.0 | 1 (wk14 QB) |
   > | auto | 1 (wk6 QB) |
   >
   > **Register 59's week-11 empty WR slot reproduces exactly on the shipped
   > arm, and there are two more weeks nobody had found.** CONDITION 3 PASSES.
   >
   > **What this does NOT establish:** the probe drains the room in strict ADP
   > order, so its roster counts are the same untrustworthy kind register 67
   > names — shipped shows RB12/WR2 here against RB4.77 on the seat replay, and
   > s1 shows QB4/TE3 here against QB2.00/TE1.47 there. **The COMPARISON between
   > arms on one shared room is what is meaningful; neither absolute count is.**
4. **No one-start pileup** — s1 must not raise the QB+TE count on the simulated
   roster above s0's.

**If (1) passes and (2) is a null, the flag STAYS OFF.** A null is not a licence;
the ±41.8 pts/season detection floor means a null is what this instrument
returns for most real changes, and switching a flag three days before the draft
on "it did not measurably hurt" is exactly the reasoning `no_fit_guard` exists to
stop.

## 5. What would make me abandon this rather than report it

If the collapse diagnostic FAILS, I stop. I do not tune the flex baseline, the
bench rate, or the forgone term until it passes — **that is fitting a
configuration to a diagnostic, which is the same error in a smaller box.** The
finding would be "still collapses, cause unknown, owner A, post-draft."

## 6. Registered prediction

**P119 (filed with this document):** the collapse diagnostic **PASSES** (modal
share ≤ 5%), because the floor at 0 that caused it has already been removed from
the code — **and the seat replay is a NULL**, because tail-of-board reordering is
what that estimand is least sensitive to (the same reasoning as P117).

**So my own prediction is that this ends with the flag STAYING OFF**, and I am
writing that down first so a passing collapse test cannot be read forward into a
ship.
