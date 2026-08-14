# TERRITORY: A
"""THE PICK LOG — every pick, with the prediction attached, written AS IT LANDS.

The other half of the irreversible capture. The freeze records what the board
BELIEVED; this records what actually happened, joined to the belief at the moment
it was still a prediction.

── WHY IT IS APPEND-ONLY AND WRITTEN ON CAPTURE ────────────────────────────

Cory: "Write on capture. Do not reconstruct after the fact — a reconstruction is
a claim about what the board said, not a record of it, and this repo has been
wrong about that class of claim four times."

He is describing his own repository accurately, so the format enforces it:

  * JSONL, appended. A row, once written, is never rewritten.
  * Every row carries the freeze's sha256. A log joined to a DIFFERENT board
    than the one that made the predictions is worthless and would look fine.
  * `availability_at_my_next_pick` is READ OUT OF THE FREEZE, not recomputed.
    It is a lookup of a number that was fixed before the draft started, which
    is the one thing that makes the calibration curve honest.
  * A duplicate pick number REFUSES rather than overwriting.

── WHAT IS A CAPTURE AND WHAT WOULD BE A RECONSTRUCTION ────────────────────

Availability: FROZEN. Pure lookup. Cannot drift.

The old path's recommendation: computed here, at the moment the pick lands, from
the frozen inputs plus the set of players already gone. That is deterministic
given those two things, so computing it as the pick arrives IS the capture — the
same numbers, from the same inputs, at the same moment. What would be a
reconstruction is running it on 5 September against a rebuilt board, and that is
exactly what the freeze exists to make unnecessary.

The new path's recommendation: recorded as null with a REASON, not silently
omitted. If Step 5 lands before the draft the field fills; if it does not, the
frozen inputs let it be computed later and scored out of sample. A null that
says why is a fact; a missing key is an accident.

Run:  python3 draft/log_draft_picks.py --record '<json>'
      python3 draft/log_draft_picks.py --status
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FREEZE = ROOT / "draft" / "data" / "pre_draft_freeze_2026.json"
LOG = ROOT / "draft" / "data" / "draft_pick_log_2026.jsonl"


def _freeze() -> dict:
    if not FREEZE.exists():
        raise SystemExit(
            "REFUSING: no pre-draft freeze. A pick log with nothing to join "
            "against records outcomes and no predictions, which cannot answer "
            "the only question it exists for. Run freeze_pre_draft.py first.")
    return json.loads(FREEZE.read_text())


def _rows() -> list[dict]:
    if not LOG.exists():
        return []
    return [json.loads(l) for l in LOG.read_text().splitlines() if l.strip()]


def next_pick_of_mine(after: int, my_picks: list[int]) -> int | None:
    for p in my_picks:
        if p > after:
            return p
    return None


def old_path_recommendation(fz: dict, gone: set[str], top: int = 5) -> list[dict]:
    """The production valuation, at this moment, from FROZEN inputs.

    Deterministic given (freeze, gone), which is what makes this a capture and
    not a reconstruction. It is `vorp` because that is what the shipped board
    ranks on — deliberately NOT an improved version, since the point is to
    record what the tool would actually have said.
    """
    pool = [p for p in fz["players"]
            if str(p["player_id"]) not in gone and p.get("vorp") is not None]
    pool.sort(key=lambda p: -float(p["vorp"]))
    return [{"player_id": str(p["player_id"]), "name": p["name"],
             "position": p["position"], "vorp": p["vorp"],
             "proj_mean": p.get("proj_mean")}
            for p in pool[:top]]


def record(entry: dict) -> dict:
    """Append ONE pick. Refuses a duplicate rather than overwriting it."""
    fz = _freeze()
    rows = _rows()
    pick = int(entry["pick"])

    seen = {r["pick"] for r in rows}
    if pick in seen:
        raise SystemExit(
            "REFUSING: pick %d is already logged. This file is append-only; a "
            "correction is a NEW row with `supersedes`, so both the original "
            "claim and the correction survive. Overwriting a prediction after "
            "the outcome is known is how a calibration curve flatters itself."
            % pick)
    if rows and pick <= rows[-1]["pick"]:
        raise SystemExit(
            "REFUSING: pick %d is not after the last logged pick %d. Out-of-"
            "order arrival means picks were missed; log them in order or the "
            "`gone` set below is wrong for every row after this one."
            % (pick, rows[-1]["pick"]))

    gone = {str(r["player_id"]) for r in rows if r.get("player_id")}
    my_next = next_pick_of_mine(pick, fz["my_picks"])
    pid = str(entry["player_id"])

    avail = None
    if my_next is not None:
        avail = (fz["availability_by_pick"].get(pid) or {}).get(str(my_next))

    row = {
        "pick": pick,
        "team_slot": entry.get("team_slot"),
        "player_id": pid,
        "player_name": entry.get("player_name"),
        "position": entry.get("position"),

        # THE PREDICTION, AS IT STOOD BEFORE THE DRAFT. A lookup, never a
        # recomputation — this is the number the calibration curve is built on.
        "my_next_pick": my_next,
        "availability_at_my_next_pick": avail,
        "availability_source": "pre_draft_freeze_2026.json (frozen, not recomputed)",

        "old_path_recommendation": old_path_recommendation(fz, gone),
        "new_path_recommendation": None,
        "new_path_reason":
            "Step 5 VORP-space path not landed at capture time. The freeze "
            "carries proj_mean, replacement, adp and adp_sd, so this is "
            "computable later and scorable OUT OF SAMPLE against these rows.",

        "is_mine": bool(entry.get("is_mine")),
        "my_actual_pick": entry.get("my_actual_pick"),
        "my_deviation_reason": entry.get("my_deviation_reason"),

        # A ROW JOINED TO THE WRONG BOARD LOOKS EXACTLY LIKE A GOOD ONE.
        "freeze_sha256": fz["_sha256_of_payload"],
    }
    with LOG.open("a") as fh:
        fh.write(json.dumps(row, sort_keys=True) + "\n")
    return row


def status() -> int:
    fz = _freeze()
    rows = _rows()
    total = len(fz["pick_order"]["picks"])
    mine = [r for r in rows if r["is_mine"]]
    scored = [r for r in rows if r["availability_at_my_next_pick"] is not None]
    print("freeze     : %s (%d players)" % (fz["_sha256_of_payload"][:12],
                                            len(fz["players"])))
    print("picks       : %d of %d logged" % (len(rows), total))
    print("mine        : %d of %d" % (len(mine), len(fz["my_picks"])))
    print("with an availability prediction attached: %d" % len(scored))
    bad = [r["pick"] for r in rows if r["freeze_sha256"] != fz["_sha256_of_payload"]]
    if bad:
        print("⚠ %d row(s) joined to a DIFFERENT freeze: %s" % (len(bad), bad[:8]))
        return 1
    return 0


def main() -> int:
    if "--status" in sys.argv:
        return status()
    if "--record" in sys.argv:
        payload = json.loads(sys.argv[sys.argv.index("--record") + 1])
        row = record(payload)
        print(json.dumps(row, indent=1, sort_keys=True))
        return 0
    print(__doc__.strip().splitlines()[-2].strip())
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
