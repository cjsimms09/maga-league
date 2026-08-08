# WAR ROOM v2 — THE DOCTRINE BANNER

Filed 2026-08-08 (Cory). **Top of screen, above the status bar — the most
prominent strategic element on the page.** The War Room's strategic spine, made
visible: at every moment it names the doctrine being executed, how confident the
plan is, and the live alternative. Depends on the tournaments (experiment 19 +
the strategy tournament) having raced to produce the named doctrines and the
Cory-conditional winner; **build the state machine now (below), enroll the winner
when the tournaments land** ("build now, activate when reality allows").

## 1. Named philosophies + creeds
Formalize the doctrine vocabulary from experiment 19's archetypes **plus the
tournament's actual winners** — every strategy the machine can execute gets a
short human name and a one-line creed. Working set (final names come from
whatever the tournaments race):
- **Hero-RB Continuation** — "one anchor back, then hammer WR value."
- **WR Feast** — "ride the value fall; TE and QB wait; ceiling in the flex."
- **Elite-TE Anchor** — "pay for the last elite TE; the positional cliff pays it back."
- **Early-QB Strike** — "take the rushing-QB edge before the room does; 6-pt passTD makes it real."
- **Ceiling Chase** — "high-variance builds; the weekly-high pool rewards booms, not floors."
- **Balanced Value** — "no constraints; best expected dollars available (the control)."

The **tournament's Cory-conditional winner is enrolled as THE PLAN** — displayed
pre-draft with its **dollar edge over the runner-up**.

## 2. The banner shows three things at all times
- **CURRENT DOCTRINE** — name + creed.
- **CONFIDENCE** — "Plan intact — executing WR Feast, on script through 2 picks."
- **LIVE ALTERNATIVE** — the second-ranked doctrine and its current dollar gap:
  "Early-QB Strike trails by $9."

## 3. Doctrine switches are EVENTS
When the room's behavior flips the rankings (the Navigator's pivot logic), the
banner announces it loudly — color shift + one plain sentence:
> ⚡ SWITCHING TO EARLY-QB STRIKE: the QB run erased Late-QB's edge; this branch
> now projects +$14. Paths re-ranked below.

- **One-tap DECLINE** keeps the prior doctrine (my draft, my call). Declines log
  to the ledger through the existing override machinery.
- **HYSTERESIS — switches are RARE by design.** A switch requires the alternative
  to lead by **more than the noise band** for **more than one pick** (a
  configurable `SWITCH_MIN_PICKS`, default 2). A banner that changes doctrine
  every pick is a mood ring, not a strategy. The noise band is the same even-
  money band the dollar-gap model already uses (`DG_NOISE_BAND`).

## 4. Everything speaks the same vocabulary
- **Path cards** tag their doctrine ("this is the WR Feast branch").
- The **Navigator's pivot** reads named doctrines.
- The **opening script** is written AS the winning doctrine's script, with its
  **named contingency branches**.
- The **ledger** logs doctrine state per pick (current, alternative, gap, any
  switch/decline).
- **January grades** whether declared doctrines and switches earned their dollars.

## 5. Robot scenarios
- Banner renders the enrolled plan (name + creed + confidence + alternative + gap).
- A fixture **QB-run triggers exactly ONE switch announcement** with correct
  dollar framing.
- **Hysteresis suppresses a noise-band flap** — an alternative that leads by less
  than the band, or for only one pick, produces NO switch.
- **Decline preserves the prior doctrine and logs** the override to the ledger.

## Build split (what's buildable NOW vs tournament-gated)
- **NOW (pure, testable):** the **doctrine state machine** — a module that holds
  the ranked doctrines with their dollar gaps, applies the hysteresis rule to
  decide `switch | hold`, produces the switch sentence + framing, and records
  decline. Robot scenario 5 runs against it with fixtures. This is the load-
  bearing logic; it needs no tournament output to be correct.
- **TOURNAMENT-GATED (enroll when 19 + the strategy tournament land):** the
  actual named winner as THE PLAN, the per-doctrine dollar rankings fed from live
  Navigator pivot logic, and the banner UI wired into `warroom.ejs`.
