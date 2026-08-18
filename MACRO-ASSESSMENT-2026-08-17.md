# Macro assessment — are we actually doing what Cory is asking for?

**Written 2026-08-17 by the relay, at Cory's request.** He asked whether we are
digging rather than accepting answers, closing loops, making the model better —
and whether the whole operation is being run the best way available.

**The verdict in one sentence: this project is world-class at VERIFYING and
poor at INITIATING, and the draft is in five days while the tool Cory actually
drafts on is broken.**

---

## 1. THE EVIDENCE — who found the things that mattered

Every material model finding this week traces to Cory, not to us.

| finding | who found it | how long it sat |
|---|---|---|
| every player shares one ceiling (`proj_mean × constant`) | **Cory's instinct** | weeks |
| the Vegas null is implausible for an oracle | **Cory** | since the study ran |
| McBride over Jefferson looks wrong | **Cory** | live on the board |
| "are we using FP, Sleeper, or a blend?" | **Cory, asked three times over two days** | **never run** |
| `routes_*` runs weekly and feeds nothing | our audit | filed, not fixed |
| Sleeper history is fetchable | our probe (08-16) | **answer sat in a log for a day** |
| `proj_mean` is Sleeper-only, FP enters nothing | relay, chasing Cory's question | since the board existed |

**That table is the whole assessment.** Our machinery — preregs, known-positive
controls, leak gates, refusal-first probes — is genuinely better than most
professional shops. And it is almost entirely pointed at questions somebody else
chose.

## 2. THE MECHANISM — why, not just what

**a) We optimise for defensibility, not for discovery.** Every artifact here is
built to survive scrutiny, which is why nothing ships without a prereg and a
control. The side effect: the cheapest available action is always "measure the
thing we already measured, more carefully," and the most expensive is "go look at
something nobody has looked at." The gradient points away from new questions.

**b) A refusal is treated as an ending.** This repo refuses beautifully —
`no_control`, `failed-gate`, `leaked_markers`, `no_timestamp`. But **a refusal
with no owner and no unblock condition is indistinguishable from a finished
answer.** `proj_mean_blend` refused on 08-16 for want of Sleeper history;
`sleeper_hist_proj` proved that history exists on 08-16; **nobody connected them
for a day.** Both artifacts were correct. The silence between them was the
defect.

**c) Process volume has overtaken result volume.** Today the relay produced five
new rules, four new documents, a dozen register rows and two test files.
**Measured model improvements shipped today: zero.** `ceiling` is still 0.
`proj_mean` is still Sleeper-only. The board still has not published since 08-15.
That ratio is upside down, and it is my doing.

**d) Nobody owns "what should we study next?"** A rules, B builds, C fetches, D
stewards stores, E red-teams outputs, the relay chases. **Not one lane's job is
generating new hypotheses about football.** That is precisely why every new
question arrives from Cory — the org chart has no seat for it.

**e) Boot cost is a symptom of the same disease.** ~130k tokens before any work,
because every session must load the entire history of our carefulness first.

## 3. THE MACRO CALL — we are tuning the model while the tool is broken

**Five days out, the deliverable is not "a better model." It is Cory drafting
well on 08-22.** Against that, the open blocking defects are:

- **The war room computes every pick number, survival % and timing call for the
  WRONG SEAT** (register 4c) — and that build was sent to Cory as a demo.
- **A's live order tells B to build phone-first; Cory drafts on desktop** (4d).
- **The board has not published since 08-15** (row 1).
- **The shortlist is not sorted by the number it displays** (4e), and "left"
  means two different things on one screen (4f).

**Every one of those is worth more on 08-22 than the blend, the ceiling weight,
routes, or snap counts.** We have been doing foundational research with a broken
instrument on the table.

## 4. WHAT I WOULD CHANGE — ranked, concrete

**1. FREEZE THE RESEARCH AGENDA UNTIL 08-23.** Everything except: the war room
correct on desktop, the board publishing, the seat bug, and the four truth
defects. The blend prereg is written and can sit for six days; a wrong seat on
draft night cannot.

**2. EVERY REFUSAL SHIPS ITS UNBLOCK CONDITION.** New vocabulary, enforceable by
test: `REFUSED — unblocked by <condition>, owner <lane>, recheck <date>`. A
refusal without those three is an open defect, not an answer. **This single rule
would have caught the blend/Sleeper disconnect a day early.**

**3. CREATE THE OPEN-QUESTIONS BACKLOG — the thing that does not exist.** Not
defects (broken), not asks (Cory's), but **hypotheses nobody has tested**, each
with a cost estimate and an owner. Seed it from what Cory has said out loud this
week; then make every lane add one per session. Today the only such list is in
Cory's head, which is exactly why he keeps having to be the one who notices.

**4. CAP PROCESS AGAINST RESULT.** No new rule or standing document unless a
measured result has shipped since the last one. Blunt, and the current ratio is
zero, so it binds immediately — starting with me.

**5. STOP ADDING SESSIONS.** D and E were both created today and neither has
produced a finding. That was solving a queueing problem by hiring. No new lane
before 08-23, and the in-season split waits for the season.

**6. ARCHIVE AGGRESSIVELY.** `ROUTES.md` 48k words, `STATUS.md` 28k,
`SESSION-A.md` 15k. Closed material moves out. Keeping the record honest and
keeping it in one file are different goals.

## 5. THE ONE THING TO KEEP

**Cory's instinct is the best detector in this system, and it should be treated
as an instrument rather than as feedback.** Three times this week a plain
"that makes no sense" was worth more than a preregistered study. Rule 3d exists
now because of it, session E exists because of it, and the correct response to
the next one is to run it down immediately — not to file it.
