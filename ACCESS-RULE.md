# ACCESS RULE — TOOLS vs HISTORY (FINAL, Cory 2026-08-09)

_Single source of truth for what is commissioner-only versus league-visible. This
stops the rule flip-flopping between sessions. If it ever seems to conflict with an
older instruction, THIS file wins — the older instruction was the superseded reading._

**The distinction is TOOLS versus HISTORY — not raw-data versus analysis.** An
earlier framing drew the line at raw-data-vs-analysis; that was wrong. Session B
implemented the earlier instruction correctly, so the over-strip was not B's fault —
the correction is Cory's.

## 🔒 COMMISSIONER-ONLY — the tools, and only the tools

Anything that **generates a recommendation for the commissioner**:

- The **war room** and everything it computes.
- **`/lineup`**, the lineup optimizer, and its **proof** tab.
- The **in-season recommendation surfaces** — waiver calls, streaming, trade radar,
  the Sunday alert.

## 👁 LEAGUE-VISIBLE — everything that describes what already happened

Regardless of how it was computed:

- **All-play** records, **luck-gap** rankings, **robbery** records.
- **Lineup-efficiency %**, per-owner and per-season.
- **Season bench-point totals.**
- All **money, standings, scores, champions, records, bad beats**.
- **Every analytical framing in the history chapters.** History is the league's
  shared record; good writing about what happened stays visible.

## Enforcement

- `draft/tests/access_guard.test.js` (A's lane) asserts the TOOLS return 403 to a
  non-commissioner and 200 to the commissioner. It does **not** assert history pages
  hide analysis — that would encode the superseded reading. A positive guard (history
  pages DO render the league-visible analysis) is the natural follow-up once B's
  history restore lands, coordinated with B on the rendered phrases.
- **Deploy discipline:** the tool gating ships whenever ready; the history restore
  (putting all-play/efficiency/bench back on the league-visible pages) must be LIVE
  before or with any deploy that would otherwise ship the over-stripped history.
