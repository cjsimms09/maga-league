
---

## ROUTE 1 COVERAGE — ANSWERED, AND CLOSED ON THIS EVIDENCE (run 31551417577, 2026-08-12)

**The bounded pass registered for this question has run, with the known-answer gate as
its only instrument, and it answers. Per Cory 2026-08-12: finish as registered and stop.**

```
SATISFIES F5                       0
CONTENT-DATED LEAD (not evidence)  3
LIVE, NO PRE-CUTOFF CAPTURE        0
INCONCLUSIVE — WALK TRUNCATED      0
NO BOARD AT THIS URL              15
UNBINNED — REPORT IS INCOMPLETE    0
```

**The walk was NOT truncated this time, and that is why the zero can be read.** Every
target examined every day the index returned: 2 of 2, 3 of 3, 1 of 1, and `no index` for
the rest. `INCONCLUSIVE` is 0 and `UNBINNED` is 0, so the buckets account for all 18
targets. The capture counts are on the rows, which is what made the previous two zeros
uninterpretable and this one readable.

**The archive holds almost nothing for these URLs in the window.** Not 60 preseason days
per target — **0 to 3**. That is the coverage answer: there is no series here. One
capture was never going to be a replay input, and the index does not hold the rest.

**And every capture that did exist failed one of two ways:**

| target | capture | outcome |
|---|---|---|
| FP ppr live | 20240731003145 | 422,880 bytes, **0 player hits** |
| FP ppr live | 20240618215630 | 378,309 bytes, **0 player hits** |
| FP overall live | 20240731003217 | **0 bytes** |
| FP overall live | **20240712092948** | **0 bytes** |
| FFC page std | 20240723073039 | **0 bytes** |

The big-bytes-zero-hits rows are the known-answer gate doing exactly its job: those are
navigation menus, the same 422KB page that was once scored as a board by shape-counting
and reported as ROUTE 1 IS OPEN before being withdrawn.

### THE LIMITATION, STATED RATHER THAN BURIED

**`20240712092948` is the capture that passed the known-answer gate 15 of 15, with the
real 2024 top fifteen in order, in an earlier targeted check. Here it returned 0 bytes.**

The walk cannot tell a genuinely empty capture from a fetch that failed: the workflow's
`get()` yields `body or b""`, so a transport failure and a 0-byte snapshot arrive as the
same empty string. **That is this lane's recurring defect class one more time — "we could
not fetch it" rendered as "there is nothing there" — and it is present in this result.**

So the honest strength of the zero is: *no capture the archive served us contained a
recognisable board*, not *no such capture exists*. Some share of the five zero-byte rows
is likely archive.org throttling rather than empty snapshots.

### WHY IT IS STILL CLOSED, AND NOT REOPENED TO FIX THAT

Distinguishing empty-from-unfetched is a one-line change. **It is not worth making, and
the reason is the ceiling, not the effort.** Route 1 serves F4 and F5; the binding
constraint is F1; the leagues it could ever rescue number at most ~24 in 2025 and zero in
2026, against F7's bar of 200 — and F1 is not moving (Cory, 2026-08-12). A perfectly
instrumented Route 1 returning every board it could still cannot change F7's answer.

**ROUTE 1 IS CLOSED ON THIS EVIDENCE.** Stated precisely, and this is the sentence that
survives: across 18 registered targets, no capture strictly predating the cutoff served a
board containing recognisable NFL players; the archive holds 0–3 preseason days per URL,
which is not a series under any reading; and the strength of that negative is limited by
an empty-versus-unfetched conflation which is named above and was not repaired because
the route's ceiling makes the repair worthless rather than because it is hard.

It does not rule out a paid archive, a source not on the registered list, or a capture the
CDX index does not hold. It was never going to rule those out, and it is not the reason
the sample is small.

**STOPPING HERE, as instructed.**
