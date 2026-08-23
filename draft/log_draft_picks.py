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


def my_slot(fz: dict) -> int | None:
    """WHICH SEAT IS CORY'S, read off the freeze instead of being passed in.

    ⚠️ THIS EXISTS BECAUSE `is_mine` WAS FALSE ON ALL 150 ROWS OF THE 2026
    DRAFT — Cory's twelve picks included. `_from_sleeper` builds a pick entry
    with `pick, team_slot, player_id, player_name, position, is_keeper` and has
    never set `is_mine`; `record` then wrote `bool(entry.get("is_mine"))`,
    which is `bool(None)`, which is False, for every row of every draft. The
    field was not wrong occasionally — it was structurally incapable of being
    True on the live path, because nothing on that path knew which seat was
    ours.

    Nothing crashed and no test failed. `--status` printed `mine: 0 of 12` in
    plain English while the draft was running and its exit code gates nothing,
    so the one instrument that noticed was the one nobody was required to read.
    That is the same shape as the freeze-mismatch guard fifty lines above,
    which was moved from `--status` into a refusal at append time for exactly
    this reason.

    The freeze already knows the answer and is the right authority: `my_picks`
    are our overall picks, and `pick_order.picks` maps every overall to a seat,
    so the seat that owns our picks is a lookup, not a configuration value
    somebody has to remember to set. Returns None rather than guessing if the
    freeze does not name exactly one seat — a wrong seat silently relabels
    another owner's draft as ours, which is worse than an absent flag.
    """
    mine = set(fz.get("my_picks") or [])
    if not mine:
        return None
    # `pick_order.picks` is a list of dicts on the real freeze, but the chaos
    # drill's synthetic freeze builds it as a list of plain ints — and an int
    # has no .get, so the unguarded form raises AttributeError from inside a
    # field derivation rather than returning "seat unknown". A freeze whose
    # shape we do not recognise means we cannot name the seat; that is a None,
    # which every caller already handles, not an exception.
    slots = {p.get("slot") for p in (fz.get("pick_order") or {}).get("picks", [])
             if isinstance(p, dict) and p.get("overall") in mine
             and p.get("slot") is not None}
    return slots.pop() if len(slots) == 1 else None


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


VONA_ROOMS = 200
VONA_SEED = 20260823


def vona_path_recommendation(fz: dict, gone: set[str], current_pick: int,
                             my_next_pick: int | None, top: int = 5) -> dict | None:
    """THE PICK-TIME PATH — cost of waiting, not a static ranking.

    ── WHY THIS EXISTS, measured rather than asserted ────────────────────────

    `old_path_recommendation` above sorts by `vorp`, which IS what the shipped
    board ranks on and IS correct for a full board. It is not a pick-time
    quantity. Measured on the real 2026 draft
    (`draft/audit/why_the_shadow_log_recommends_defences_2026-08-23.md`):

        after N picks   RB    WR    TE    QB     K   DEF
              0        156   125    81    64    10    29
             60        -19    29    18    11    10    29   <- DEF leads
            100        -53    -9     0     8    10    29   <- and never stops

    DEF VORP is FLAT AT 29 for a hundred picks (32 defences exist, ~10 get
    taken, all late) while skill VORP collapses and goes negative. So a static
    ranking hands you a defence from pick ~60 onward, which is what the 2026
    log actually recorded at 101 of 150 picks.

    VONA re-baselines against WHAT IS LEFT: what does waiting until my next
    pick cost me, per position. That is the question a pick answers.

    ── DETERMINISTIC, because a capture that cannot be reproduced is a story ──

    `old_path_recommendation`'s docstring makes determinism its defining
    property. This is a SIMULATION, so it seeds from a fixed constant plus the
    pick number — same freeze, same gone-set, same pick, byte-identical output,
    re-runnable in January. Never `random.random()` unseeded.

    ⚠️ AND IT IS AN ESTIMATE, WHICH THE AUTOPSY LATER GRADES. At pick time
    nobody knows who the room will actually take, so the drain is simulated
    from `adjusted_adp` and `adp_sd`. After the draft, `draft_autopsy.js`
    computes the SAME quantity from the real pick order — so the gap between
    this field and the autopsy's is a measurement of the simulator itself.
    That comparison is the reason to record it rather than compute it later.
    """
    import random as _random

    pool = [p for p in fz["players"]
            if str(p["player_id"]) not in gone and p.get("proj_mean") is not None]
    if not pool:
        return None
    positions = sorted({p["position"] for p in pool if p.get("position")})

    def best_of(players, pos):
        cands = [p for p in players if p.get("position") == pos]
        return max(cands, key=lambda p: p["proj_mean"]) if cands else None

    best_now = {q: best_of(pool, q) for q in positions}

    if my_next_pick is None:
        # Last pick of the draft: nothing to wait for, so waiting costs
        # nothing and the honest answer is the best man left, not a VONA.
        top_now = sorted(pool, key=lambda p: -p["proj_mean"])[:top]
        return {"basis": "last_pick_no_wait", "rooms": 0,
                "cost_of_waiting": {},
                "recommendation": [_slim(p) for p in top_now]}

    gap = max(0, my_next_pick - current_pick - 1)
    rng = _random.Random(VONA_SEED + current_pick)
    sums = {q: 0.0 for q in positions}
    counts = {q: 0 for q in positions}
    for _ in range(VONA_ROOMS):
        keyed = []
        for p in pool:
            adp = p.get("adjusted_adp")
            sd = p.get("adp_sd") or 12
            if adp is None:
                continue
            keyed.append((adp + rng.gauss(0, sd), p))
        keyed.sort(key=lambda t: t[0])
        taken = {str(t[1]["player_id"]) for t in keyed[:gap]}
        left = [p for p in pool if str(p["player_id"]) not in taken]
        for q in positions:
            b = best_of(left, q)
            if b is not None:
                sums[q] += b["proj_mean"]
                counts[q] += 1

    cost = {}
    for q in positions:
        bn = best_now.get(q)
        if bn is None or not counts[q]:
            continue
        cost[q] = round(bn["proj_mean"] - sums[q] / counts[q], 1)

    if not cost:
        return None
    order = sorted(cost, key=lambda q: -cost[q])
    lead = order[0]
    picks = [p for p in pool if p.get("position") == lead]
    picks.sort(key=lambda p: -p["proj_mean"])
    return {
        "basis": "vona_adp_drain",
        "rooms": VONA_ROOMS,
        "opponent_picks_until_my_next": gap,
        "cost_of_waiting": cost,
        "highest_cost_position": lead,
        "recommendation": [_slim(p) for p in picks[:top]],
    }


def _slim(p: dict) -> dict:
    return {"player_id": str(p["player_id"]), "name": p.get("name"),
            "position": p.get("position"), "proj_mean": p.get("proj_mean"),
            "vorp": p.get("vorp")}


def record(entry: dict) -> dict:
    """Append ONE pick. Refuses a duplicate rather than overwriting it."""
    fz = _freeze()
    rows = _rows()

    # ── THE FREEZE CHANGED UNDER A LIVE LOG (chaos drill, 2026-08-16). ──────
    #
    # Before this guard, swapping the freeze mid-draft was SILENT at append
    # time: `record` happily wrote new rows carrying the NEW sha into a log
    # whose earlier rows carry the OLD one, and only `--status` — whose exit
    # code nothing on the draft-night path enforces — would mention the mix
    # afterwards. A log spanning two boards looks exactly like a good one and
    # grades nothing, which is the precise failure the per-row sha exists to
    # catch. So the mismatch now refuses AT THE MOMENT OF APPEND, where the
    # operator is watching, instead of in a report nobody is required to read.
    if rows:
        prev_sha = rows[-1].get("freeze_sha256")
        cur_sha = fz["_sha256_of_payload"]
        if prev_sha and prev_sha != cur_sha:
            raise SystemExit(
                "REFUSING: the freeze on disk (sha %s…) is NOT the freeze this "
                "log's %d existing rows are joined to (%s…). The freeze changed "
                "mid-draft — a log spanning two boards looks fine and grades "
                "nothing. Restore the original freeze, or move this log aside "
                "and re-freeze, before logging another pick."
                % (cur_sha[:12], len(rows), prev_sha[:12]))

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
    _ms = my_slot(fz)

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
        # LANDED 2026-08-23, on Cory's order after the 2026 draft. The old
        # reason read "Step 5 VORP-space path not landed at capture time" —
        # true then, and it left new_path_recommendation None on all 150 rows,
        # so the before/after this log exists for had a before and no after.
        "new_path_recommendation": vona_path_recommendation(
            fz, gone, int(entry["pick"]), my_next),
        "new_path_reason":
            "Pick-time VONA (cost of waiting until my next pick), estimated by "
            "seeded ADP drain over %d rooms. Deterministic given (freeze, gone, "
            "pick). The old path above is a STATIC vorp ranking, which measured "
            "flat-at-29 for DEF across a hundred picks while skill VORP went "
            "negative -- see why_the_shadow_log_recommends_defences_2026-08-23."
            % VONA_ROOMS,

        # ⚠️ THIS PAIR WAS DROPPED BY THE FIRST CUT AND THE REHEARSAL CAUGHT IT.
        # `_from_sleeper` set `is_keeper` and `record` never copied it, so all
        # 150 rows came back with 20 keepers indistinguishable from 130
        # selections — the exact collapse the docstring above warns about,
        # reintroduced one function later. A keeper is GONE from the pool but
        # was never a decision, so scoring a recommendation against him would
        # grade the board on a pick nobody made.
        "is_keeper": bool(entry.get("is_keeper")),
        "is_selection": not bool(entry.get("is_keeper")),

        # ⚠️ DERIVED, NOT COPIED — see my_slot(). The old form was
        # `bool(entry.get("is_mine"))`, and because the live Sleeper path never
        # sets that key it evaluated `bool(None)` on all 150 rows of the 2026
        # draft. An explicit value on the entry still wins so a hand-recorded
        # row or a test can state its own truth; only the absent case derives.
        "is_mine": (bool(entry.get("is_mine")) if entry.get("is_mine") is not None
                    else (_ms is not None and entry.get("team_slot") == _ms)),
        "my_slot_source": ("explicit on the entry" if entry.get("is_mine") is not None
                           else ("pre_draft_freeze my_picks -> pick_order slot"
                                 if _ms is not None else
                                 "UNKNOWN — the freeze does not name exactly one seat")),

        # THE WHY BEHIND THE PICK. Both were None on all 150 rows of 2026 and
        # Cory's verdict on that was "the why behind your twelve decisions is
        # unrecoverable". `my_actual_pick` is now DERIVED for our own rows —
        # the row is the pick, so leaving it blank was never anything but a
        # missing assignment. `my_deviation_reason` is the one field that
        # genuinely needs a human, and it is the only one left blank here.
        "my_actual_pick": (entry.get("my_actual_pick")
                           if entry.get("my_actual_pick") is not None
                           else ({"player_id": pid,
                                  "name": entry.get("player_name"),
                                  "position": entry.get("position"),
                                  "pick": pick}
                                 if (_ms is not None
                                     and entry.get("team_slot") == _ms
                                     and not entry.get("is_keeper")) else None)),
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
    md = p.get("metadata") or {}
    # ⚠️ THE FALLBACK USED TO BE `md["first_name"]` ALONE, AND IT TRUNCATED
    # EXACTLY THREE ROWS OF THE 2026 LOG: "Ja'Marr", "Derrick", "Kenneth" —
    # CORY'S OWN THREE KEEPERS, all at his seat. The other 20 keepers in the
    # draft carry full names, so this never read as "keepers are broken"; it
    # read as nothing at all.
    #
    # Same root cause as the `is_mine` defect: OUR keepers are removed from the
    # board pool by design (`keepers_on_board_at_freeze`), so `players.get(pid)`
    # misses for them and only for them, and the fallback fires on the three
    # rows the autopsy needs most. A first name alone joins to nothing.
    full = " ".join(x for x in [md.get("first_name"), md.get("last_name")] if x)
    roster = p.get("roster_id")
    slot = next((int(s) for s, r in (slot_to_roster or {}).items() if r == roster),
                p.get("draft_slot"))
    return {
        "pick": int(p["pick_no"]),
        "team_slot": slot,
        "player_id": pid,
        "player_name": meta.get("name") or full or md.get("first_name"),
        "position": meta.get("position") or md.get("position"),
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

    # ── A MALFORMED PAYLOAD MUST REFUSE BY NAME, NOT CRASH MID-EXPRESSION ──
    #
    # Chaos drill, 2026-08-16. Sleeper answering with an error object
    # ({"error": ...} parses as JSON!) crashed here as
    # `AttributeError: 'str' object has no attribute 'get'` — a traceback
    # pointing at a dict-iteration accident three calls from the cause. A
    # non-integer pick_no died the same way (`ValueError: invalid literal`).
    # On draft night both surface in the workflow log as bare tracebacks that
    # name neither Sleeper nor the offending entry. Refuse loudly instead;
    # the poll loop retries, which is the correct response to a bad read.
    if not isinstance(picks, list):
        raise SystemExit(
            "REFUSING: Sleeper's picks payload is %s, not a list of picks. An "
            "error body ({\"error\": ...}) or a truncated/garbage response "
            "parses as JSON too — it must not be treated as draft data. "
            "Payload head: %r. The next poll retries."
            % (type(picks).__name__, str(picks)[:200]))
    bad_shape = [p for p in picks if not isinstance(p, dict)]
    if bad_shape:
        raise SystemExit(
            "REFUSING: %d entr%s in Sleeper's picks payload are not pick "
            "objects (first: %r). A half-garbage list is a broken read, not a "
            "draft. The next poll retries."
            % (len(bad_shape), "y" if len(bad_shape) == 1 else "ies",
               str(bad_shape[0])[:120]))

    def _pick_no(p: dict) -> int:
        try:
            return int(p["pick_no"])
        except (TypeError, ValueError):
            raise SystemExit(
                "REFUSING: malformed Sleeper pick — pick_no=%r is not an "
                "integer (player_id=%r). Refusing the whole payload rather "
                "than guessing an order for it. The next poll retries."
                % (p.get("pick_no"), p.get("player_id")))

    players = {str(p["player_id"]): p for p in fz["players"]}
    # pick number -> the player the log already has there, for conflict checks.
    have = {r["pick"]: str(r.get("player_id") or "") for r in _rows()}
    incoming = sorted((p for p in picks if p.get("pick_no")), key=_pick_no)

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
    held_reason = None
    seq = []
    queued = {}      # pick number -> player_id queued for append THIS pass
    skipped = 0
    conflicts = []
    expect = (max(have) + 1) if have else 1
    for p in incoming:
        e = _from_sleeper(p, slot_to_roster or {}, players)
        if e["pick"] in have:
            skipped += 1
            # ── SLEEPER CONTRADICTING THE LOG WAS SKIPPED SILENTLY (chaos
            # drill, 2026-08-16): a re-served pick number carrying a DIFFERENT
            # player (commissioner undo/redo on Sleeper's side) fell into this
            # `continue` and vanished — the log stayed out of step with
            # Sleeper's record forever, with nothing printed. The log is
            # append-only, so nothing is rewritten here; the disagreement is
            # REPORTED so the operator can append a correction row on purpose.
            if have[e["pick"]] and e["player_id"] and have[e["pick"]] != e["player_id"]:
                conflicts.append({
                    "pick": e["pick"],
                    "logged_player_id": have[e["pick"]],
                    "sleeper_player_id": e["player_id"],
                    "note": "Sleeper now reports a DIFFERENT player for this "
                            "already-logged pick (undo/redo?). NOT rewritten — "
                            "the log is append-only; if Sleeper is right, add "
                            "a correction row with `supersedes` by hand.",
                })
            continue
        if e["pick"] in queued:
            if queued[e["pick"]] == e["player_id"]:
                skipped += 1           # the same event twice in one payload
                continue
            # Two different players on one pick number is corrupt data, not a
            # gap — before 2026-08-16 this fell into the gap branch below and
            # reported "pick N arrived while N+1 is still missing", a hole
            # that does not exist (and `skipped` went NEGATIVE, a silently
            # wrong number in the one tool whose job is refusing those).
            stop_at = e["pick"]
            held_reason = (
                f"pick {e['pick']} appears TWICE in this payload with two "
                f"different players ({queued[e['pick']]} vs {e['player_id']}). "
                "That is corrupt data, not a gap — nothing at or after it can "
                "be trusted, so the log holds here until Sleeper serves a "
                "clean list.")
            # WITHDRAW the contradicted pick from this pass's queue too:
            # logging either of two players Sleeper cannot agree on is a
            # guess, and "holds here" must mean BEFORE the ambiguity.
            seq = [x for x in seq if x["pick"] < e["pick"]]
            break
        if e["pick"] != expect:
            stop_at = e["pick"]
            held_reason = (
                f"pick {stop_at} arrived while {expect} is still missing. "
                "Holding: logging past a hole makes the gone-set wrong for "
                "every row after it. The next poll should fill it.")
            break
        seq.append(e)
        queued[e["pick"]] = e["player_id"]
        expect += 1

    added = []
    for e in seq:
        added.append(record(e)["pick"])

    logged = sorted(r["pick"] for r in _rows())
    return {
        "added": len(added), "skipped": skipped, "logged_total": len(logged),
        "held_at_gap": stop_at,
        "held_reason": held_reason,
        # Always present, usually empty — a missing key is an accident, and a
        # surface cannot warn on a field that only exists when things go wrong.
        "pick_conflicts": conflicts,
        "contiguous": logged == list(range(1, len(logged) + 1)),
        # The tool's recommendation at every logged pick — captured on the same
        # poll, reported in the same result. See shadow_sync's docstring.
        "shadow": shadow_sync(),
    }


def _league_id() -> str:
    """This season's Sleeper league id, from the committed config."""
    cfg = json.loads((ROOT / "draft" / "config" / "league_config.json").read_text())
    lid = cfg.get("league_id")
    if not lid:
        raise RuntimeError("league_config.json carries no league_id")
    return str(lid)


def discover_draft_id() -> str:
    """Resolve THIS season's draft_id from the league, so no human types it.

    Rule 3e applies with force here: this returns a single string, and a WRONG
    string looks exactly like a right one until the draft is over and the log is
    empty. So it refuses rather than guesses — if the league reports no drafts,
    or more than one plausible candidate for this season, it raises with what it
    saw instead of picking.
    """
    import sleeper_import as si
    lid = _league_id()
    drafts = si.fetch_drafts(lid) or []
    if not drafts:
        raise RuntimeError("Sleeper reports NO drafts for league %s" % lid)
    season = str(json.loads(
        (ROOT / "draft" / "config" / "league_config.json").read_text()
    ).get("season") or "")
    same = [d for d in drafts if str(d.get("season") or "") == season] or drafts
    ids = sorted({str(d.get("draft_id")) for d in same if d.get("draft_id")})
    if len(ids) != 1:
        raise RuntimeError(
            "cannot resolve a single draft_id for league %s season %s — saw %s. "
            "Pass it explicitly rather than letting this guess."
            % (lid, season, ids))
    return ids[0]


def sync_live(draft_id: str) -> dict:
    """Poll Sleeper and append. The draft-night entry point.

    Kept as a thin wrapper so the whole of `sync` is exercisable against real
    recorded picks without a network — which is the only rehearsal available
    here, since Sleeper is blocked from this sandbox (HTTP 000 via the proxy).
    """
    import sleeper_import as si
    drafts = si.fetch_drafts_by_id(draft_id) if hasattr(
        si, "fetch_drafts_by_id") else None
    # live=True BYPASSES sleeper_import's 1-hour on-disk cache. Chaos drill,
    # 2026-08-16: without it, poll 1 cached the pick list and every poll for
    # the next HOUR re-read that first snapshot from disk — the draft-night
    # loop would trail the live draft by up to an hour while cheerfully
    # reporting added:0, and the 2026-08-15 dry-run rehearsal could not see it
    # because a COMPLETED draft's pick list never changes between polls.
    picks = si.fetch_draft_picks(draft_id, live=True)
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
    # DERIVED, NOT TRUSTED. The 2026 log is on disk with `is_mine` False on all
    # 150 rows and it is append-only on purpose — a correction there is a new
    # row with `supersedes`, never an edit, because a log you rewrite is a log
    # that flatters itself. So the flag is not repaired retroactively; it is
    # simply not the authority. `team_slot` was captured correctly all along
    # and the freeze names our seat, so ownership is recoverable for every past
    # row without touching one of them. A reader falls back to the flag only
    # when the seat cannot be derived.
    _ms = my_slot(fz)
    mine = [r for r in rows
            if (r.get("team_slot") == _ms if _ms is not None else r.get("is_mine"))]
    scored = [r for r in rows if r["availability_at_my_next_pick"] is not None]
    print("freeze     : %s (%d players)" % (fz["_sha256_of_payload"][:12],
                                            len(fz["players"])))
    print("picks       : %d of %d logged" % (len(rows), total))
    # KEEPERS AND SELECTIONS ARE DIFFERENT POPULATIONS AND THIS LINE COMPARED
    # THEM. `mine` is every row at our seat — 15 in 2026 — and `my_picks` is
    # the twelve LIVE picks only, so the first honest run of this fix printed
    # "mine: 15 of 12", a ratio above 1 that reads as a bug in either
    # direction. A keeper is not a pick anybody made; it is counted, and
    # counted separately.
    mine_live = [r for r in mine if not r.get("is_keeper")]
    mine_kept = len(mine) - len(mine_live)
    print("mine        : %d of %d live picks (+%d keepers)"
          % (len(mine_live), len(fz["my_picks"]), mine_kept))
    print("with an availability prediction attached: %d" % len(scored))
    shadowed = {r["pick_no"] for r in _shadow_rows()}
    lag = len({r["pick"] for r in rows} - shadowed)
    print("shadow rows (tool's rec at each pick): %d%s"
          % (len(shadowed), "" if lag == 0 else "  ⚠ %d pick(s) unshadowed" % lag))
    bad = [r["pick"] for r in rows if r["freeze_sha256"] != fz["_sha256_of_payload"]]
    if bad:
        print("⚠ %d row(s) joined to a DIFFERENT freeze: %s" % (len(bad), bad[:8]))
        return 1

    # ⚠️ THIS LINE USED TO BE PRINTED AND NOT ENFORCED, AND THAT IS HOW THE
    # 2026 DRAFT WAS LOGGED WITH `is_mine` FALSE ON ALL 150 ROWS. "mine: 0 of
    # 12" was on screen, correct, and cost nothing to ignore, so it was
    # ignored. A count that can only ever be right is not worth printing; a
    # count that can be wrong has to be able to fail. Zero of our own picks
    # flagged, in a log that HAS picks, is never a real draft — it is always a
    # broken seat derivation, and it makes the shadow grading, the autopsy and
    # every "what did we do differently" question unanswerable after the fact.
    if rows and not mine_live:
        print("⚠ REFUSING to report healthy: %d picks logged and NOT ONE is "
              "flagged as ours. my_slot() returned %s. Every downstream grade "
              "that filters on is_mine sees an empty draft."
              % (len(rows), my_slot(fz)))
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
    if "--discover" in sys.argv:
        try:
            print(discover_draft_id())
            return 0
        except Exception as exc:                            # noqa: BLE001
            print("DISCOVERY FAILED: %s" % exc, file=sys.stderr)
            return 1
    if "--sync" in sys.argv:
        i = sys.argv.index("--sync")
        did = sys.argv[i + 1] if len(sys.argv) > i + 1 else ""
        # ⚙️ NO ARGUMENT = DISCOVER IT. The draft-night capture used to require a
        # hand-typed Sleeper draft_id, which meant the one irreversible event of
        # the year was captured only if somebody remembered to look the id up and
        # paste it correctly under time pressure. The league id is in
        # league_config.json and Sleeper will name the draft; there is no reason
        # for a human to be in that loop.
        if not did or did.startswith("--"):
            did = discover_draft_id()
            print("discovered draft_id %s from league %s" % (did, _league_id()),
                  file=sys.stderr)
        print(json.dumps(sync_live(did), indent=1))
        return 0
    print("usage: log_draft_picks.py --sync [draft_id] | --discover "
          "| --record <json> | --status")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
