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
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FREEZE = ROOT / "draft" / "data" / "pre_draft_freeze_2026.json"
# Overridable so draft-night-sync.yml's dry_run mode (added 2026-08-15, see
# that workflow's own comment) can verify the --sync polling/exit mechanics
# for real against GitHub Actions without ever writing to the real 2026 pick
# log — the default here is completely unchanged for every normal caller.
_DEFAULT_LOG = ROOT / "draft" / "data" / "draft_pick_log_2026.jsonl"
LOG = Path(os.environ.get("DRAFT_PICK_LOG_PATH") or str(_DEFAULT_LOG))

# ── THE SHADOW LEDGER (Cory's ruling, 2026-08-16: "Do 2") ────────────────────
#
# Every --sync also records what the ENGINE would have recommended, for the
# seat that was on the clock, at every pick — all ten teams, not just mine.
# draft/tools/draft_shadow.js computes it from the shipped board + the pick
# log's own gone-set and appends to draft/data/draft_shadow_2026.jsonl.
# Wired HERE so draft night captures it with ZERO new operator steps: the
# same poll that logs the pick shadows it, and the row's timestamp is the
# forward guarantee (a January recompute would be a reconstruction).
#
# A shadow failure NEVER blocks pick capture — the pick log is the primary
# record and outranks everything — but it is REPORTED in the sync result, not
# swallowed, so a red shadow on draft night is visible on the very poll that
# broke it.
SHADOW_TOOL = ROOT / "draft" / "tools" / "draft_shadow.js"


def _shadow_path() -> Path:
    """Where the shadow rows go, resolved at CALL time so a monkeypatched or
    env-overridden LOG carries its shadow with it (the dry_run isolation of
    draft-night-sync.yml extends to the shadow without the workflow knowing
    this file grew a second output)."""
    env = os.environ.get("DRAFT_SHADOW_LOG_PATH")
    if env:
        return Path(env)
    if str(LOG) == str(_DEFAULT_LOG):
        return ROOT / "draft" / "data" / "draft_shadow_2026.jsonl"
    return LOG.with_name(LOG.stem + "_shadow" + LOG.suffix)


def _shadow_rows() -> list[dict]:
    p = _shadow_path()
    if not p.exists():
        return []
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


def shadow_sync() -> dict:
    """Bring the shadow ledger up to the pick log. Idempotent; reported, never
    raising — a lost recommendation is a hole in the January grading, a lost
    PICK is a hole in everything, so the pick path must not die for this."""
    if os.environ.get("DRAFT_SHADOW_DISABLE"):
        return {"ok": True, "disabled": True,
                "why": "DRAFT_SHADOW_DISABLE set (rehearsals that are not "
                       "about the shadow — draft night never sets this)"}
    logged = {r["pick"] for r in _rows()}
    shadowed = {r["pick_no"] for r in _shadow_rows()}
    if not (logged - shadowed):
        return {"ok": True, "added": 0, "shadow_total": len(shadowed), "lag": 0}
    try:
        out = subprocess.run(
            ["node", str(SHADOW_TOOL), "--sync",
             "--pick-log", str(LOG), "--out", str(_shadow_path())],
            capture_output=True, text=True, timeout=300, cwd=str(ROOT))
    except Exception as e:  # noqa: BLE001 — reported, by design
        return {"ok": False, "error": "shadow tool did not run: %s" % e}
    if out.returncode != 0:
        return {"ok": False, "error": (out.stderr or out.stdout)[-500:]}
    try:
        return json.loads(out.stdout.strip().splitlines()[-1])
    except Exception:  # noqa: BLE001
        return {"ok": False, "error": "unparseable shadow output: %r"
                % out.stdout[-300:]}


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

        # ⚠️ THIS PAIR WAS DROPPED BY THE FIRST CUT AND THE REHEARSAL CAUGHT IT.
        # `_from_sleeper` set `is_keeper` and `record` never copied it, so all
        # 150 rows came back with 20 keepers indistinguishable from 130
        # selections — the exact collapse the docstring above warns about,
        # reintroduced one function later. A keeper is GONE from the pool but
        # was never a decision, so scoring a recommendation against him would
        # grade the board on a pick nobody made.
        "is_keeper": bool(entry.get("is_keeper")),
        "is_selection": not bool(entry.get("is_keeper")),

        "is_mine": bool(entry.get("is_mine")),
        "my_actual_pick": entry.get("my_actual_pick"),
        "my_deviation_reason": entry.get("my_deviation_reason"),

        # A ROW JOINED TO THE WRONG BOARD LOOKS EXACTLY LIKE A GOOD ONE.
        "freeze_sha256": fz["_sha256_of_payload"],
    }
    with LOG.open("a") as fh:
        fh.write(json.dumps(row, sort_keys=True) + "\n")
    return row


def _from_sleeper(p: dict, slot_to_roster: dict, players: dict) -> dict:
    """One Sleeper pick -> one log entry.

    ⚠️ A KEEPER IS A PICK BUT NOT A SELECTION, AND SLEEPER SERVES BOTH IN ONE
    LIST. The 2025 draft is 150 picks of which 20 carry `is_keeper: true`. Both
    remove a player from the pool, so both belong in the `gone` set; only one is
    a decision anybody made, so only one can be scored against a recommendation.

    That is `picks` versus `live_picks` again — the distinction the artifact's
    own numbering_note draws and `applySlot` collapsed. Recorded per row here so
    the scoring in September cannot re-collapse it.
    """
    pid = str(p.get("player_id") or "")
    meta = players.get(pid) or {}
    roster = p.get("roster_id")
    slot = next((int(s) for s, r in (slot_to_roster or {}).items() if r == roster),
                p.get("draft_slot"))
    return {
        "pick": int(p["pick_no"]),
        "team_slot": slot,
        "player_id": pid,
        "player_name": meta.get("name") or (p.get("metadata") or {}).get("first_name"),
        "position": meta.get("position") or (p.get("metadata") or {}).get("position"),
        "is_keeper": bool(p.get("is_keeper")),
    }


def sync(picks: list, *, slot_to_roster: dict | None = None) -> dict:
    """Append every pick not already logged. IDEMPOTENT ON PURPOSE.

    Draft night is a poll loop: this runs every few seconds against a list that
    keeps growing. `record()` refuses a duplicate because a duplicate there means
    someone is rewriting a prediction. Here a duplicate is the NORMAL case — it
    is the same pick seen again — so it is skipped, and only genuinely new picks
    are appended.

    Two different meanings for one word, kept apart by two functions rather than
    by a flag, because a flag is a thing a caller gets wrong at 8pm on draft
    night.
    """
    fz = _freeze()
    players = {str(p["player_id"]): p for p in fz["players"]}
    have = {r["pick"] for r in _rows()}
    incoming = sorted((p for p in picks if p.get("pick_no")),
                      key=lambda p: int(p["pick_no"]))

    # ── DO NOT APPEND PAST A GAP. ───────────────────────────────────────────
    #
    # Sleeper serves the FULL pick list on every poll, so a pick arriving after
    # a later one cannot happen ACROSS polls — but a truncated or partial
    # payload absolutely can, and it looks identical to "the draft is only this
    # far along".
    #
    # Every row's `old_path_recommendation` is computed from the set of players
    # already gone. Log pick 41 while 40 is missing and that set is wrong for 41
    # and for all 109 rows after it — a whole draft of plausible, unfalsifiable
    # recommendations. So the log advances only over a CONTIGUOUS prefix and
    # stops at the first hole, which is a wait rather than a failure: the next
    # poll brings the missing pick and the log resumes.
    stop_at = None
    seq = []
    expect = (max(have) + 1) if have else 1
    for p in incoming:
        e = _from_sleeper(p, slot_to_roster or {}, players)
        if e["pick"] in have:
            continue
        if e["pick"] != expect:
            stop_at = e["pick"]
            break
        seq.append(e)
        expect += 1

    added = []
    for e in seq:
        added.append(record(e)["pick"])

    skipped = len(incoming) - len(added) - (0 if stop_at is None else
                                            sum(1 for p in incoming
                                                if int(p["pick_no"]) >= stop_at))
    logged = sorted(r["pick"] for r in _rows())
    return {
        "added": len(added), "skipped": skipped, "logged_total": len(logged),
        "held_at_gap": stop_at,
        "held_reason": None if stop_at is None else (
            f"pick {stop_at} arrived while {expect} is still missing. Holding: "
            "logging past a hole makes the gone-set wrong for every row after "
            "it. The next poll should fill it."),
        "contiguous": logged == list(range(1, len(logged) + 1)),
        # The tool's recommendation at every logged pick — captured on the same
        # poll, reported in the same result. See shadow_sync's docstring.
        "shadow": shadow_sync(),
    }


def sync_live(draft_id: str) -> dict:
    """Poll Sleeper and append. The draft-night entry point.

    Kept as a thin wrapper so the whole of `sync` is exercisable against real
    recorded picks without a network — which is the only rehearsal available
    here, since Sleeper is blocked from this sandbox (HTTP 000 via the proxy).
    """
    import sleeper_import as si
    drafts = si.fetch_drafts_by_id(draft_id) if hasattr(
        si, "fetch_drafts_by_id") else None
    picks = si.fetch_draft_picks(draft_id)
    if not picks:
        raise SystemExit(
            "REFUSING: Sleeper returned no picks for draft %s. An empty read is "
            "not an empty draft, and logging zero picks as if the board were "
            "untouched is the `or []` failure this repo has already paid for "
            "once on the keeper path." % draft_id)
    s2r = (drafts or {}).get("slot_to_roster_id") if drafts else None
    return sync(picks, slot_to_roster=s2r)


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
    shadowed = {r["pick_no"] for r in _shadow_rows()}
    lag = len({r["pick"] for r in rows} - shadowed)
    print("shadow rows (tool's rec at each pick): %d%s"
          % (len(shadowed), "" if lag == 0 else "  ⚠ %d pick(s) unshadowed" % lag))
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
        # The manual fallback path gets the same shadow capture as --sync —
        # 8pm operator error must not decide whether a pick has its shadow.
        row["shadow"] = shadow_sync()
        print(json.dumps(row, indent=1, sort_keys=True))
        return 0
    if "--sync" in sys.argv:
        did = sys.argv[sys.argv.index("--sync") + 1]
        print(json.dumps(sync_live(did), indent=1))
        return 0
    print("usage: log_draft_picks.py --sync <draft_id> | --record <json> | --status")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
