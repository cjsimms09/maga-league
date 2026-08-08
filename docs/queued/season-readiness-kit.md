# Season-Readiness Kit — consolidated reference

**Status:** recovered/consolidated 2026-08-08. The in-season-master references
"the season-readiness spec" as if it were a committed document; it was not — it
lived only in chat. Rather than re-derive it, this file consolidates the
season-readiness requirements that ARE specified inline in the committed
`in-season-master.md`, and names that document as authoritative. If the original
standalone kit resurfaces, reconcile against it; until then, this is the spec.

Do not start before **23 Aug 2026** (post-draft, post-freeze), same gate as the
rest of the in-season work.

## The four Phase-1 components (live by Sep 8), from `in-season-master.md` §1

### Waiver Engine — Lite (then Full by week 3)
> **⚠️ NO FAAB (Cory, 2026-08-08).** This league runs **priority economics**, not
> bids. Every FAAB assumption below is struck and refit. The pipeline stamps the
> real waiver settings into `config.waivers` (`waiver_type`, day, clear days) —
> `is_faab=false` is the machine-checkable confirmation.

- Tuesday detection of newly-available players
- **Stealth score** — under-owned production the room hasn't noticed yet
- Value = RoS projection over my current **worst starter** at the position
- **~~Bid bands~~ → Priority economics:** the recommendation is add-value vs the
  **option value of my current waiver-priority position**. Track everyone's
  priority position weekly (rolling vs reverse-standings, per `config.waivers`).
  Each target gets a **burn/hold verdict**: is this add worth dropping to the
  back of the priority order (rolling), or is it marginal enough to wait for
  free agency?
- **FA-speed layer:** post-clear free agency is **first-come-first-served**, so
  Tuesday detection gains a **clear-time alert mode** — ranked FA targets pushed
  the moment waivers process (the add-fast window is the edge, not the bid).
- **Every recommendation logged to the prediction ledger at decision time**
  (kind `waiver`, method `waiver-priority-v1`) — graded on its schedule.
- Full upgrade (week 3): ~~empirical competing-bid model~~ → **priority-usage
  model** from league transaction history (who burns priority on marginal adds,
  who camps FA, who's fast after clears); vacated-opportunity attribution down
  real depth charts; keeper-forward flag under **flat-cost** rules (a waiver add
  is this-season-only value EXCEPT a plausible top-30-next-year player — no
  phantom late-round keeper value).

### The Weekly Brief — the front door (Tuesday, 3-minute phone read)
Waiver card · matchup outlook · lineup flags · shadow standings · one intel
note · system health. Plus a **Thursday micro-brief** (injury-report deltas,
close calls restated) and a **Sunday-morning inactives sweep** (any starter
OUT/doubtful → push notification with the recommended pivot).
_If a tool's output doesn't surface in the brief, it doesn't exist to me._

### Opponent capture from snap one (capture-only in Phase 1)
Weekly lineup efficiency, zombie starts, bench points, transaction cadence,
FAAB burn → auto-appended to all nine dossiers, era-tagged. Analysis surfaces
land in Phase 3 (§3.4). This is Part 11 L4's capture core.

### In-season rankings substrate
See `in-season-rankings.md` — the committed spec everything above reads from.

## Design principles (from `in-season-master.md`, non-negotiable)
Adaptable (every threshold in config; weekly re-fit; ruleset-hash aware) ·
Intuitive (plain-language sentence + recommended action first) · Graded (ledger
at decision time, graded on schedule) · Robot-tested (a simulated-season
scenario through the real code path before each calendar gate).

## Acceptance (the four-touch test)
By week 6: Tuesday brief (3 min) → waiver card → Thursday micro-brief → Sunday
alert. ~10 min/week, every decision logged and graded. If a tool demands more,
the surface is wrong, not the routine.
