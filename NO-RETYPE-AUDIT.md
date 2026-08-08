# NO-RETYPE AUDIT — every input field's verdict (Data Spine §3)

First pass, 2026-08-08, for Cory's review. Rule: a field is **REDUNDANT** if the site already knows the fact (Sleeper harvest, or `payouts.json`) — it should be replaced with derived rendering and killed. It is **MANUAL** only if the fact exists nowhere digital (side-bet terms, announcements, votes, new commissioner facts, payment handles, auth). Nav/routing params are **PLUMBING** (not facts).

## 🔴 REDUNDANT — kill the field, render derived (the no-retype violations)
| field | where | already known from | verdict |
|---|---|---|---|
| `total_pot` | admin/console | `payouts.json.total_pot` | **REDUNDANT — render from payouts.json** |
| `weekly_payout` | admin/console | `payouts.json.weekly_high.amount` | **REDUNDANT** |
| `reg_1`, `reg_2` | admin/console | `payouts.json.regular_season.champ/runner_up` | **REDUNDANT** |
| `playoff_1`..`playoff_4` | admin/console | `payouts.json.playoffs.1..4` | **REDUNDANT** |
| `weeks` | admin/console | Sleeper league settings (season length) | **REDUNDANT (confirm not a distinct config)** |
| `wins`, `ties` | admin/console | Sleeper standings harvest | **REDUNDANT — standings are derived** |
| `teams` | admin/draft-config | Sleeper league settings | **REDUNDANT (Sleeper knows team count)** |
| `weekly_payout`/`total_pot` echoes anywhere else | — | payouts.json | **REDUNDANT** |

**Headline:** `admin/console.ejs` carries a whole payout-settings form that duplicates `payouts.json` (now the checksum-guarded ground truth). That form is the flagship redundancy — payout amounts must be **derived**, never typed. Killing it also closes a correctness hole (two sources of the pot that can disagree).

## 🟢 MANUAL — legitimately hand-entered (facts that exist nowhere digital)
| field(s) | where | why manual |
|---|---|---|
| `party`, `stake`, `terms`, `resolves`, `ticket`, `logic`, `format`, `cond_*`, `winner` | _side_bets / _bet_builder | **Side-bet book** — the one manual surface; terms exist nowhere digital |
| `amount`, `kind` (ledger/dues context) | admin/console, bank | dues recorded / manual adjustments (a NEW fact) — but a **payout** amount here should derive; split by kind |
| `paid` | admin/console | dues-paid toggle — commissioner creates a NEW fact |
| `choice`, `question`, `vote_threshold`, `desc` | votes | voting booth — new facts |
| `text`, `note` | posts/announcements | league announcements — new content |
| `venmo`, `zelle`, `paypal` | bank | payment handles — exist nowhere digital |
| `username`, `password`, `token`, `confirm`, `secret` | auth | credentials, not league facts |
| `slot` | draft.ejs | draft-spot **claim** — a new fact until Sleeper's draft order lands (then it derives) |
| `undrafted_rule`, `undrafted_round`, `pool_rules`, `picks_required`, `format` | league setup | rule definitions — new facts (until mirrored from Sleeper where possible) |

## ⚪ PLUMBING — not facts (nav / routing / filters, leave as-is)
`year` · `tab` · `back` · `next` · `section` · `owner_id` (entity selector) · `week` (filter) · `position`/`pos` (filter) · `sweek` · `status`

## Open questions for the build (not decided here)
1. `weeks` and `wins`/`ties` in console — confirm they are standings/record entry (→ REDUNDANT) vs a distinct manual override; if an override, keep but label as override-of-derived.
2. `amount`/`kind` in the bank/console ledger — split: a **dues receipt** is manual; a **payout receipt** must derive from the settlement. The ledger UI should offer derived payout lines, not free-typed amounts, for pot money.
3. Rule-definition fields (`undrafted_rule`, `pool_rules`, …) — where Sleeper exposes the rule, mirror it; where it doesn't, keep manual.

## Next step (on the spine build)
Kill the REDUNDANT payout form first (highest severity — duplicate money source), render those figures from `payouts.json`. Then the §3 cross-surface reconciliation CI test (same fact identical everywhere) becomes the standing guarantee. The history page + settlement report get built ON this spine, not retrofitted.
