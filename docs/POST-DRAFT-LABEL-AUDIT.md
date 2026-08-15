# POST-DRAFT LABEL AUDIT

_Audited 2026-08-08. Draft is 2026-08-22 — **14 days out.**_

Everything carrying a post-draft label was re-examined against **real
dependencies, not habit**. The only legitimate blockers are:

| gate | meaning |
|---|---|
| **(a)** | needs my final roster |
| **(b)** | needs the draft to have occurred as an event |
| **(c)** | needs 2026 season data that does not exist yet |
| **(d)** | genuinely competes with draft-critical work for build attention |

Anything else moves to **BUILD NOW** or **BUILD NOW / ACTIVATE LATER** (build
and test against history, ship behind an `awaiting season` flag) — the same rule
as the in-season master.

**The code freeze applies to the war-room surface only.** Nothing else is frozen
by it. That was the single biggest source of mislabelling: "freeze" was being
read as "the repo is frozen," and it never meant that.

---

## THE HEADLINE: most of the post-draft queue was mislabelled

Of 17 items examined, **11 move to BUILD NOW or BUILD NOW / ACTIVATE LATER.**
Only 6 have a real gate. Two items were labelled post-draft when they are
actually **draft-critical and should have been near the top of the queue**.

---

## ⚠️ THREE CORRECTIONS TO THE PREMISES

Stated up front because they change what is buildable, and two of them narrow
the scope you asked for.

### 1. The decade is harvested for MONEY, not for BOX SCORES

> _"the league history page (2016-2025 chapters need ZERO draft data — the whole
> decade is already harvested)"_

Half right, and the half that is wrong constrains the chronicle spec.

| era | what exists | source |
|---|---|---|
| **2016–2022** | buy-ins, pot size, payout percentages, and the **named winner of every money category** | `master_sheet_archive.json` — 12 seasons, 2016→2027 |
| **2023–2025** | all of the above **plus** full box scores: `points`, `starters`, `players_points`, `starters_points`, standings, 1,091 transactions, brackets, drafts | `league_history.json` — Sleeper export |

For 2016–2022 the season records are literally empty arrays:
`standings: []`, `draft_order: []`, `trades: []`. Those seasons **predate
Sleeper and exist nowhere else** — the archive says so in its own note.

**Consequence for the voice spec:** the requirement that *every* season name the
fraud, the robbed, the collapse, and mine the box scores for absurdities is
**satisfiable for 2023, 2024 and 2025 only.** For 2016–2022 we can name the
champion, the money, and every amendment — a real chapter, but a different *kind*
of chapter. The existing spec already scoped season chapters to "2023 → present,"
and it was right.

This is not a blocker. It is a shape: **the early decade is the Founding and the
Amendments; the box-score chronicle begins in 2023.** Handled explicitly in the
rewritten history spec rather than papered over.

### 2. The waiver engine has no historical price signal

`league_history.json` provenance: **`"transactions_with_bids": 0`**. All 1,091
transactions are recorded without FAAB bid amounts.

So the waiver engine splits:
- **claim/priority logic, target identification, drop-candidate ranking** —
  buildable and testable on history now;
- **bid pricing** (what a player is worth in FAAB) — **genuinely gate (c)**.
  There is no historical price to calibrate against. Not a labelling error; a
  real data gap.

### 3. "Dead-code removal is fine now" — with one carve-out

True for site code. But the biggest dead-code candidates live in
`survival.js` / `engine.js` / `app.js`, which **are** the war-room surface and
**are** frozen. Scope Phase 2's redundancy hunt to non-draft-path files until
Aug 23. Fingerprinting, asset work and the dead-code sweep outside `public/js/draft/`
proceed now.

---

## THE RECLASSIFIED LIST

### ✅ MOVED — BUILD NOW (no gate at all)

| item | old label | real gate | why it moves |
|---|---|---|---|
| **In-season instrumentation** (ledger kinds) | Sept 1 hard date | **NONE** | Proved today: 4 kinds added in one commit, plus a conformance guard. It is a list extension and a test. **Ship before the freeze.** It also *has* to move — see the note below. |
| **League history: Founding + Amendments + Rolls** | post-draft | **NONE** | Needs zero draft data and zero 2026 data. Buy-in ladder 100→400, payout revisions, keeper adoption, the rebrand, the pending 2027 votes — all sitting in `master_sheet_archive.json` today. |
| **League history: 2023–25 season chapters** | post-draft | **NONE** | Full box scores present. Fraud/robbed/miracle detection is a pure function of data already on disk (verified below). |
| **Contact directory** (email/phone + tappable owner cards) | new | **NONE** | Same profile store as Venmo, same one-record-many-readers rule. No draft coupling whatsoever. |
| **Dashboard widening / data spine** | post-draft | **NONE** | Site-side only. |
| **Site-opt Phase 2 — fingerprinting, assets, dead code outside the draft path** | Aug 23+ | **NONE** (carve-out above) | Only draft-path refactors wait for the freeze. |
| **Self-host the two web fonts** (`PARKED #13`) | — | **NONE** | Removes a render-blocking third-party fetch on draft night. Cheap. |

> **Why instrumentation cannot wait for Sept 1.** The ledger records decisions
> **at decision time.** Draft night *is* the highest-density decision event of
> the year. A kind that ships Sept 1 captures nothing from Aug 22 — the data is
> gone, not delayed. Today's rehearsal found four kinds that had been silently
> 400ing, which is exactly this failure already happening. Ship before the draft
> or accept a permanent hole in the record.

### 🔶 MOVED — BUILD NOW / ACTIVATE LATER (build + test on history, flag `awaiting season`)

| item | real gate on *activation* | testable on |
|---|---|---|
| **Lineup optimizer** | (c) live weekly data | 2023–25 `starters_points` + `players_points`. The `EFFICIENCY-LEAK` figure was *already* computed this way — the machinery exists. |
| **Weekly brief** | (c) live weeks | 3 seasons × 18 weeks of real matchups |
| **Streaming engine** (K/DEF) | (c) live matchups | historical K/DEF weekly scoring is in `players_points` |
| **Trade radar** | (c) live rosters | 1,091 historical transactions |
| **Waiver engine — claims/targets/drops** | (c) live wire | historical adds/drops |
| **League-wide projections** | **(a)** final rosters | projection machinery is board-side and buildable now |
| **Richard bet advisor** | **(a)** final rosters | rides on the projections above |

Each ships dark behind an `awaiting season` flag, with a robot scenario driving
fixture weeks through the real code path — the in-season master already
mandates that pattern; it just never said the build could start now.

### 🔴 STAYS GATED (a real dependency, correctly labelled)

| item | gate | note |
|---|---|---|
| **Waiver *bid pricing*** | **(c)** | no historical FAAB bids exist — cannot calibrate |
| **Keeper report cards for 2026** | **(b)** | needs the draft to have happened |
| **2026 draft recap chapter** | **(b)** | same |
| **Shadow-standings grading** | **(a)+(c)** | needs final rosters *and* a season to grade against |
| **Experiment 37 (in-season $ attribution)** | **(c)** | explicitly gated on 2026 existing |
| **Site-opt Phase 2 — draft-path refactors** | **(d)** + freeze | war-room surface only |

### 🚨 MISLABELLED IN THE OTHER DIRECTION — these are DRAFT-CRITICAL

Two items sat in the parked queue that should not have been there.

| item | why it is draft-critical |
|---|---|
| **`PARKED #12` — tap targets under a fixed overlay** | `#arm-alerts` is `position:fixed`, `z-index:150`, x=1266–1426. The board's ✕ / ➕ Me buttons centre at x≈1260. **Six pixels of clearance.** A dropped tap on those two buttons is precisely how mock #2 ended with a drifted roster. This is the same class as the 6-second freeze, not cosmetic. |
| **`PARKED #11` — the remaining 1.9s per opponent pick** | ~4 minutes of frozen UI across a draft, during which taps are dropped. Already 3.2× better; the rest is worth one scoped pass before the freeze. |

---

## THE NEW BUILD ORDER

**Tier 1 — draft-critical, before the Aug 22 freeze (in order)**

1. **Tap-target overlay fix** + a width sweep across viewports — 6px of clearance is not a margin
2. **Mock #3**, live, with the rehearsal harness re-run after
3. **In-season instrumentation ledger kinds** — must precede draft night or the draft-night record is lost
4. **The remaining survival latency** (`PARKED #11`) — one scoped pass; if it needs behaviour changes, it stops and reports rather than guessing
5. **Self-host the fonts** — removes a draft-night third-party dependency
6. **D11 four diagnostics** — still held, still undiagnosed; it is the only open *science* item that touches a draft decision

**Tier 2 — reclassified, in value order, runs in parallel with Tier 1 where it does not compete for the draft path**

7. **League history: Founding + Chronicle of Amendments + The Rolls** — highest joy-per-hour in the whole backlog, zero gates, and the amendment ledger is the spine everything else hangs on
8. **Contact directory + tappable owner cards** — small, immediately useful, unblocks settlement chasing
9. **League history: 2023–25 chapters in chronicle voice** — the box-score mining below is already proven to work
10. **Lineup optimizer** (build + historical validation, dark) — the largest measured dollar leak, ~$520–637.50/team/season
11. **Weekly brief** (dark) — the front door; if a tool does not surface here it does not exist
12. **Streaming engine** (dark)
13. **League-wide projections machinery** (dark; activation waits on final rosters)
14. **Waiver engine — claims/targets/drops** (dark; bid pricing stays gated)
15. **Trade radar** (dark)
16. **Richard bet advisor** (activation waits on final rosters)
17. **Site-opt Phase 2 — non-draft-path** (fingerprinting, assets, dead code)
18. **Dashboard widening / data spine**

**Tier 3 — genuinely gated, unchanged**

Waiver bid pricing · 2026 keeper report cards · 2026 draft recap · shadow grading · exp 37 · draft-path refactors.

---

## THE ORDERING PRINCIPLE

Tier 1 is short on purpose. Fourteen days is not much, and the draft is the one
deadline that cannot slip. But Tier 1 does not consume 14 days of attention, and
the old labelling implied it did — which is how a decade of league history and a
contact directory ended up behind a draft they have nothing to do with.

Gate (d) is real but it is **narrow**: it applies to work touching
`public/js/draft/`, not to work touching the site. Those are different files,
different tests, and different risk. Treating them as one queue was the habit
this audit was called to break.
