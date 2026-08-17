# Every session starts here

**⭐ READ `DRAFT-WEEK-BRIEF.md` FIRST** (written 2026-08-17; draft is 08-22).
08-17 changed the model's FOUNDATIONS, not its features: every dispersion field
on the board was `proj_mean x a per-band constant` — zero player-specific
information — which is the single cause of three conclusions we had believed.
The board, the backtest harness and the money proxy are all fixed, the studies
that rested on them are re-run, and a real per-player upside signal now exists.

**One of those re-runs REVERSED, and it is the headline: the composite `ceiling`
weight ships at 0 on a measurement that could not have come out any other way.**
Three preregistered runs across two independent seed sets now say a non-zero
weight beats that zero — 3/3 seeds, separably, at every value from 0.15 to 0.65.
**It is held at zero through the draft deliberately**, because the
no-change-before-08-22 rule was fixed in all four preregs before any of them
produced a number. Brief §7b.

So there are now **TWO decisions waiting on Cory** (the ADP-sd ratchet, and the
ceiling weight after 08-22) and the ONE action for draft day. The brief carries
all three.


**⚙️ HOW THE FOUR OF US WORK — `OPERATING-MODEL.md`, one screen.** A is the
gatekeeper and the only one who merges to `main`; B, C and the relay feed A.
Every request to A carries an ASK, EVIDENCE, a RECOMMENDATION and a DEFAULT, so
silence is consent to the default and nobody idles waiting. A can reply
`SEND BACK: <reason>` and that is a complete answer.

**🧾 NOTHING GETS LEFT BEHIND — `DEFECT-REGISTER.md`.** Every open data or
logic concern that could change a number Cory drafts or starts on, each with an
owner and a next action. Four blocking rows today. A row with no owner is itself
a defect — `test_defect_register.py` fails on it.

**🔗 "WE DON'T HAVE IT" IS NOT AN ANSWER — `DATA-LIFECYCLE.md`.** Eight
questions every data gap must walk: why not, can we get it, should we capture it
consistently, does it predict, should it, is it graded, should it be, does the
grade move the weights. Measured today: **two of ten stores complete the chain;
four stop at step 4 or 6 with no recorded reason.**

**Then `MONDAY-BRIEF.md`** for 08-15/16 — still accurate, superseded as the
entry point: the relay executed seven Cory rulings, promoted the projection
model twice (own_v6 live), and merged five design passes.

Then your role file: **A → `SESSION-A.md`**, **B → `SESSION-B.md`**, shared
state → `STATUS.md`, plain-English queue → `TODO.md`. Rules change in files,
in the commit that changes behaviour — never only in chat.
