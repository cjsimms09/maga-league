# THE AUTHORITY DOCTRINE — who wins when the site and Sleeper disagree

Filed 2026-08-08 (Cory). The keeper-tab hierarchy, generalized into a standing
architectural rule. **Every future feature touching dual-source data cites this
file** — "who wins when these disagree" is answered at design time, forever,
instead of discovered at draft time.

## 1. The rule

For every fact that exists on BOTH the site and Sleeper:

> **Sleeper is always truth once it speaks. Site data is DECLARATION** — intent,
> staging, convenience — **never record.**

Three phases, every dual-source fact:
1. **Declaration accepted** — the site takes the entry and renders it with a
   provenance label (`site-declared` / `site-claimed`), never dressed as
   confirmed fact.
2. **Reconciliation gate** — the moment Sleeper speaks, the site's declaration
   is checked against it. A mismatch is 🚨 LOUD (halt, banner, checklist red) —
   never silently resolved. Agreement upgrades the label (`Sleeper-confirmed ✓`).
3. **Hard cutover** — once Sleeper is authoritative for a fact, reads come from
   the Sleeper-derived source only. No code path quietly re-reads the site
   declaration. Structural (greppable), not procedural.

## 2. The inventory

### SLEEPER-SETTLED (the doctrine applies — three-phase wiring status)

| fact | declaration (site) | reconciliation gate | cutover | status |
|---|---|---|---|---|
| **Draft slots** | `/draft` claim page → `draft:{year}` doc | A2 slot-verify truth table: `slotSource` = manual / site-claimed / sleeper; only a real Sleeper draft object with assigned order VERIFIES (R-slot robot) | war room uses Sleeper `draft_order` once assigned; site claim renders `site-claimed — Sleeper pending` until then | ✅ matches doctrine (A2 built + robot) |
| **Keepers** | keeper designations + commissioner placements | `reconcile.js`: unknown-keeper, missing-keeper, AND placement-identity mismatch (wrong team / wrong round) all HALT recommendations loudly; R-placement robot | corrected slate rebuilds from what Sleeper shows (`correctedSlate` → `reapply`) | ✅ built (keeper-placement verification) |
| **Draft picks** | local mark = a GUESS (`markLocal`), manual-entry mode during sync gaps | `applyRemote`: Sleeper pick stream wins in EVERY ordering, including a wrong-player guess (the Loveland scenarios, R1/R3 robot) | attribution module places players only from the authoritative stream once it reports; guesses are revisable (A-2 undo) and never survive a conflicting Sleeper report | ✅ built (attribution module) |
| **Rosters** | site displays only | weekly sync reads Sleeper rosters; no site entry path for roster membership | all roster renders derive from the Sleeper bundle / harvested history | ✅ no site write path (asserted by test) |
| **Matchup results / scores** | NONE — never site-entered | n/a — no declaration phase exists | Sleeper-only, structurally: no route writes a score | ✅ asserted by test (no entry path) |
| **League settings** | config imports + overrides staged on site | watchdog: ruleset-hash change trips the checklist (settings drift = red); `draft_rounds` checklist line ("Draft object rounds == 15") | `config_schema.draft_rounds` + build pipeline treat the Sleeper-imported config as source; overrides are labeled overrides | ✅ (watchdog + SSOT tests) |
| **Transactions / waivers** | NONE | n/a | Sleeper-only (harvest); no site write path | ✅ asserted by test |

### SITE-NATIVE (site IS truth — no conflict possible, doctrine does not apply)
Votes · side bets (the one legitimate manual book) · Venmo/payment handles ·
league announcements/chat · commissioner ledger entries (dues, prizes recorded)
· personal prefs (targets/never/queue/sliders) · prediction-ledger entries.

### DERIVED (computed from the above — the spine covers it)
Money tables, career earnings, standings displays, records, the settlement, the
weekly-high ledger, the Lab's E[$] grades. One canonical computation each;
`test_data_spine.py` asserts cross-surface identity. A derived fact never has an
authority question — its inputs do, and they are classified above.

## 3. The enforcement

`draft/tests/authority.test.js`, in CI: for every Sleeper-settled fact it
asserts (a) the provenance labels render pre-confirmation, (b) the
reconciliation gate exists and a fixture mismatch FIRES it, (c) post-cutover no
code path reads the site store — structural greps plus live-module fixtures
(the same tested gates the features already carry: reconcile halt, applyRemote
wins, slot-verify truth table). A future dual-source feature that skips a phase
goes red here.

## 4. How to use this file

Adding a feature that touches a fact Sleeper also knows?
1. Classify it (Sleeper-settled / site-native / derived).
2. If Sleeper-settled: build all three phases before shipping, label the
   declaration, wire the loud gate, cut over reads.
3. Add the fact to the inventory table AND a case to `authority.test.js`.
4. Cite this file in the spec/commit.
