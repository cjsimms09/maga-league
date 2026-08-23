# TERRITORY: C
"""TRADE CAPTURE — Cory's in-season queue, item 2: "the trade null is
starved (6 trades in 3 seasons) — capture every 2026 trade WITH both
rosters as they stood at accept-time." `ROUTES.md` TO: C, 2026-08-21.

WHY IT CANNOT BE BACKFILLED, SAME REASONING AS THE TUESDAY WIRE SNAPSHOT
(rule 11 -- the shape, not the code, is reused): a trade's own transaction
object (`adds`/`drops`/`roster_ids`) survives forever in Sleeper's history
and IS backfillable -- `waiver_transaction_history.py` already proves this
for 2023-2025 (6 real trades, P304). What does NOT survive is what each
ROSTER held BESIDE the traded players at that moment -- the context that
makes "worth it" gradeable (P287's trade MC). A December re-fetch of
2026's rosters shows who holds what TODAY, after every subsequent
add/drop/trade -- not what either side gave up relative to.

DETECTION, NOT A WEBHOOK: Sleeper has no trade webhook, so this polls the
current + previous week's transactions (a trade accepted late one week
can settle just past a week boundary) and diffs against every trade
already captured, by `transaction_id` where Sleeper provides one --
CENSUS-AWARE FALLBACK, same discipline as the Tuesday wire snapshot's
priority-field guess (no file in this repo has verified Sleeper really
names it `transaction_id` on this endpoint against a live response): if
that key is absent, `(roster_ids, created)` is used instead, which is
unique for any two DIFFERENT trades in practice (two genuinely distinct
trades sharing both the same two rosters AND the same millisecond
`created` timestamp is not a real scenario).

APPROXIMATION STATED PLAINLY: "as they stood at accept-time" is really
"as they stood at first DETECTION" -- bounded by how often this cron
runs (daily is the plan; see the workflow). A same-day trade followed by
a same-day waiver claim on either roster would blur the snapshot. This is
the honest limit, not hidden -- still categorically better than nothing,
which is what November's roster-fetch would give P287 today.

REUSED, NOT REBUILT (rule 11): `history_export.fetch_transactions()` (the
real transactions fetch, already used for the historical export) and
`sleeper_import.fetch_rosters()` / `weekly_proj_snapshot.nfl_state()`
(same reuse as `tuesday_wire_snapshot.py`).

APPEND-ONLY, one JSONL row per trade (not per-week like the Tuesday
snapshot, since trades have no natural one-per-week cardinality) --
`draft/data/trade_capture_2026.jsonl`. A trade already captured is never
re-appended, checked before every write.

Run (CI only): python3 draft/backtest/trade_capture.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent          # draft/backtest
DRAFT = HERE.parent
ROOT = DRAFT.parent
sys.path.insert(0, str(DRAFT))                  # sleeper_import.py, weekly_proj_snapshot.py,
                                                  # history_export.py

LEAGUE_CONFIG = DRAFT / "config" / "league_config.json"
OUT_PATH = DRAFT / "data" / "trade_capture_2026.jsonl"

#: Every documented Sleeper transaction-id key this module knows of,
#: checked in order -- not assumed correct, only tried (rule 3e/3f, same
#: discipline as tuesday_wire_snapshot.py's PRIORITY_KEY_CANDIDATES).
TRANSACTION_ID_KEY_CANDIDATES = ("transaction_id", "id")

#: How many weeks back of transactions to check on every run, beyond the
#: current week -- a trade accepted late one week can settle just past a
#: week boundary before this cron's next run sees it.
LOOKBACK_WEEKS = 1


def transaction_key(txn: dict) -> tuple:
    """A stable identity for one transaction, census-aware (tries real
    Sleeper id keys first, falls back to a composite that is unique for
    any two genuinely different trades in practice). Pure."""
    for key in TRANSACTION_ID_KEY_CANDIDATES:
        if txn.get(key) is not None:
            return ("id", key, txn[key])
    return ("composite", tuple(sorted(txn.get("roster_ids") or [])), txn.get("created"))


def is_trade(txn: dict) -> bool:
    return txn.get("type") == "trade" and txn.get("status") == "complete"


def find_new_trades(transactions: list, already_captured: set) -> list:
    """Trades in `transactions` whose key is not already in
    `already_captured`. Pure -- the whole detection logic, testable
    without a fetch."""
    out = []
    for txn in transactions:
        if not is_trade(txn):
            continue
        key = transaction_key(txn)
        if key in already_captured:
            continue
        out.append(txn)
    return out


def already_captured_keys(existing_rows: list) -> set:
    """Rebuild the dedup set from every row already written -- reads the
    SAME `transaction` sub-object each row stores, so this is symmetric
    with `transaction_key` by construction, not a second definition of
    identity that could drift from the first."""
    return {transaction_key(row["transaction"]) for row in existing_rows}


def snapshot_trade(txn: dict, rosters_by_id: dict, *, captured_at: str) -> dict:
    """One trade, with both involved rosters' FULL player lists as of
    `captured_at`. Pure."""
    involved = sorted(set(txn.get("roster_ids") or []))
    roster_snapshots = {}
    for rid in involved:
        roster = rosters_by_id.get(rid)
        roster_snapshots[str(rid)] = {
            "owner_id": (roster or {}).get("owner_id"),
            "players_at_capture": sorted((roster or {}).get("players") or []),
            "roster_found": roster is not None,
        }
    return {
        "captured_at": captured_at,
        "transaction": txn,
        "roster_ids": involved,
        "roster_snapshots": roster_snapshots,
    }


#: Rule 3e known-positive: a realistic 2-roster trade fixture. Both
#: rosters must resolve, and a second, already-captured trade must be
#: correctly skipped as a duplicate.
KNOWN_POSITIVE_TXN = {"type": "trade", "status": "complete", "roster_ids": [1, 2],
                     "adds": {"9001": 2, "9002": 1}, "drops": {"9001": 1, "9002": 2},
                     "created": 1755000000000, "transaction_id": "txn_abc123"}
KNOWN_POSITIVE_DUPLICATE = dict(KNOWN_POSITIVE_TXN)  # same key, must be skipped
KNOWN_POSITIVE_ROSTERS = {
    1: {"roster_id": 1, "owner_id": "u1", "players": ["9002", "1001", "1002"]},
    2: {"roster_id": 2, "owner_id": "u2", "players": ["9001", "2001"]},
}


def verify_known_positive() -> dict:
    fresh = find_new_trades([KNOWN_POSITIVE_TXN], already_captured=set())
    dup_skipped = find_new_trades(
        [KNOWN_POSITIVE_DUPLICATE],
        already_captured={transaction_key(KNOWN_POSITIVE_TXN)})
    snap = snapshot_trade(KNOWN_POSITIVE_TXN, KNOWN_POSITIVE_ROSTERS,
                          captured_at="2026-09-16T12:00:00Z")
    fresh_ok = len(fresh) == 1
    dup_ok = len(dup_skipped) == 0
    snap_ok = (snap["roster_snapshots"]["1"]["owner_id"] == "u1"
              and snap["roster_snapshots"]["2"]["owner_id"] == "u2"
              and "9002" in snap["roster_snapshots"]["1"]["players_at_capture"])
    return {"ok": fresh_ok and dup_ok and snap_ok,
           "fresh_ok": fresh_ok, "dup_ok": dup_ok, "snap_ok": snap_ok}


# ── egress (CI only) ─────────────────────────────────────────────────────

def _league_id() -> str:  # pragma: no cover  (egress)
    cfg = json.loads(LEAGUE_CONFIG.read_text())
    league_id = cfg.get("league_id")
    if not league_id:
        raise RuntimeError("league_config.json has no league_id -- refusing to guess one")
    return str(league_id)


def _load_existing() -> list:  # pragma: no cover  (trivial I/O, not egress)
    if not OUT_PATH.exists():
        return []
    rows = []
    for line in OUT_PATH.read_text().splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def run() -> dict:  # pragma: no cover  (egress)
    import history_export as HE
    import sleeper_import as SI
    import weekly_proj_snapshot as WPS

    league_id = _league_id()
    state = WPS.nfl_state()
    week = state.get("week")
    if not week:
        raise RuntimeError("nfl_state() returned no week -- cannot bound the "
                           "transaction fetch")

    weeks_to_check = sorted({w for w in
                             (int(week) - LOOKBACK_WEEKS, int(week)) if w >= 1})
    transactions = []
    for wk in weeks_to_check:
        transactions.extend(HE.fetch_transactions(league_id, wk) or [])

    existing_rows = _load_existing()
    already = already_captured_keys(existing_rows)
    new_trades = find_new_trades(transactions, already)

    captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    new_rows = []
    if new_trades:
        rosters = SI.fetch_rosters(league_id)
        rosters_by_id = {r["roster_id"]: r for r in rosters}
        for txn in new_trades:
            new_rows.append(snapshot_trade(txn, rosters_by_id, captured_at=captured_at))

    return {"weeks_checked": weeks_to_check, "transactions_seen": len(transactions),
           "already_captured": len(existing_rows), "new_rows": new_rows}


def main() -> int:  # pragma: no cover  (egress)
    control = verify_known_positive()
    if not control["ok"]:
        print(f"VOID -- known-positive control failed: {control}", file=sys.stderr)
        return 1

    result = run()
    new_rows = result["new_rows"]
    if not new_rows:
        print(f"no new trades ({result['transactions_seen']} transactions "
             f"checked across weeks {result['weeks_checked']}, "
             f"{result['already_captured']} already captured)")
        return 0

    with OUT_PATH.open("a") as f:
        for row in new_rows:
            f.write(json.dumps(row) + "\n")
    print(f"captured {len(new_rows)} new trade(s) -> {OUT_PATH.relative_to(ROOT)} "
         f"(weeks checked: {result['weeks_checked']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
