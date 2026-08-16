# RELAY PROTOCOL — how the relay session keeps contributing once A is back

Filed 2026-08-16 under Cory's directive, verbatim: *"have we found a way you
can keep working on this project when A gets turned back on. I want you to
still contribute but not get in As way. You should be able to communicate
back and forth with A efficiently!"*

The machinery below already exists — this document just binds it into the
standing operating mode. Nothing here overrides TERRITORY.md; it sits on top
of it.

## 1. The Monday handoff ends the mega-branch era

A merges `claude/fantasy-football-research-926y6z` once, via
`bash scripts/merge-relay.sh` (verify → local merge → both suites → A pushes
deliberately). After that merge, **the relay never builds another
60-commit branch.** Every subsequent relay work unit is:

- **one branch, one concern**, cut from fresh `origin/main`;
- carrying its own claims: the branch's final commit message states what
  changed and which tests prove it — A's review of any relay branch is
  "run the suites, read one commit message, merge or bounce";
- merged promptly or abandoned — no long-lived divergence.

## 2. The wire: ROUTES.md + inbox.sh (already built, already parsed)

- **Messages** are ROUTES.md items in the `- [ ] YYYY-MM-DD · SENDER · head`
  format. `bash scripts/inbox.sh A` triages A's inbox into DECISIONS /
  RECEIPTS / WORK; `bash scripts/inbox.sh A --sent` shows the outbox. The
  relay signs items `relay`; A signs `A`. A resolved item gets its ✅
  RESOLVED line and becomes a receipt — never deleted.
- **Decisions** live in exactly one place: DECISIONS-NEEDED.md ⚡ THE QUEUE.
  Neither side buries a Cory-call in a routed message.
- **Disagreement** between A and the relay = a queue item for Cory, stated
  with both positions and the evidence. Neither side overrides the other.

## 3. Staying out of A's way: claims, not vibes

- TERRITORY.md remains the map. The relay works A-lane by default (it has
  been operating AS A's relief); B/C-lane crossings keep the Override
  pattern: documented, tested, listed for the owner's review.
- **Active-area claims**: before starting work that touches an area A is
  likely working (draft/backtest, the engine, the board pipeline), the relay
  posts a one-line `TO:A · CLAIM:` item naming files and expected duration;
  A does the same in reverse (`TO:relay · CLAIM:`). A file under someone's
  open claim or unmerged branch is theirs until merged — the other side
  routes a message instead of editing.
- The nightly board rebuild, cron jobs, and main's CI belong to whoever's
  change broke them — red main outranks all other work, both sides.

## 4. What the relay is FOR, standing

The division that has worked: **A owns judgment and integration** (model
promotions land through A; A merges; A holds the standards); **the relay
owns throughput** — backtests, audits, test coverage, design passes via
agents, data ingestion, the grind of turning routed findings into tested
fixes. The relay surfaces evidence; A and Cory decide. Rulings from Cory
execute wherever he issues them (either side), always with the ruled-flip
protocol: test pins updated with the ruling cited, baseline re-frozen,
gates' exemption lists as the ruling record.

## 5. Cadence

- The relay batches work into review-ready branches rather than streaming
  commits at A.
- Each relay branch ends green on BOTH suites — A never inherits a red.
- The queue and ROUTES stay current in the same commit as the work they
  describe, so A's `inbox.sh` + the queue are always sufficient to know the
  whole state. TODO.md stays the index, pointer-style.
