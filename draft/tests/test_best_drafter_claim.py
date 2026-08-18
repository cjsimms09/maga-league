# TERRITORY: D
"""NO PROSE FILE MAY CROWN A "BEST DRAFTER" THE REPLAY TABLE DOES NOT CROWN.

DEFECT GUARDED: `CLAUDE.md`, `OWNERS.md` and two `ROUTES.md` entries all read
"the tool ... loses to the league's best drafter (-163)", naming ds7mmet. The
artifact they cite ranks ds7mmet FOURTH of ten on its own tool-independent
drafter study; the rank-1 drafter is Schmelley, whose seat the tool loses by
-29.0 — inside the league median.

The label was attached to whichever seat produced the tool's worst delta, which
is circular: it names the drafter "best" using the very number it is offered to
explain. Both the artifact and its audit doc forbid the read in advance —

  replay_league_table.json.honesty: "only the top3-vs-bottom-half group
  contrast is quotable"
  league_benchmark_2026-08-16.md §2: "No 'best drafter' is crowned on a margin
  the table itself can't support"

...and four downstream files quoted it anyway. That is this repo's recurring
failure mode — a sentence nobody reconciled with the file it summarises — so
the sentence is now checked rather than trusted, the way
test_data_lifecycle_predicts_column.py made a lifecycle step number testable.

`repo_parity`-marked: a prose claim can never block a board publish.

draft/audit/replay_best_drafter_claim_2026-08-18.md
Run: python -m pytest draft/tests/test_best_drafter_claim.py -q
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
TABLE = ROOT / "draft" / "data" / "replay_league_table.json"

#: Every file that summarises the replay for a reader who will not open it.
PROSE = ("CLAUDE.md", "OWNERS.md", "ROUTES.md", "STATUS.md", "DRAFT-WEEK-BRIEF.md")

#: The crown, in the forms this repo actually writes it.
CROWN = re.compile(r"best drafter", re.IGNORECASE)

#: How far either side of the crown an owner name still counts as crowned.
WINDOW = 160

#: This repo keeps corrected claims in place rather than deleting them
#: (league_benchmark_2026-08-16.md is the precedent). A paragraph that
#: RETRACTS the crowning may therefore quote it. The exemption is deliberately
#: narrow — it needs an explicit retraction word in the same paragraph, and
#: test_the_exemption_does_not_swallow_a_fresh_claim proves it cannot be used
#: to smuggle one back in.
RETRACTION = re.compile(
    r"CORRECTED|used to read|DOES NOT REPRODUCE|is FALSE|SUPERSEDED|WITHDRAWN"
    r"|MISREAD|the original sentence was wrong",
    re.IGNORECASE,
)


def _live_paragraphs(text: str) -> list[str]:
    """Paragraphs making a claim — retraction paragraphs are not claims."""
    return [b for b in re.split(r"\n\s*\n", text) if not RETRACTION.search(b)]

def _ranking() -> dict[str, int]:
    table = json.loads(TABLE.read_text())
    return {r["owner"]: r["rank"] for r in table["drafter_study"]["ranking"]}


def _crownings(text: str, owners: dict[str, int]) -> list[tuple[str, int]]:
    """Owner names sitting within WINDOW chars of the phrase 'best drafter'."""
    found = []
    for m in CROWN.finditer(text):
        near = text[max(0, m.start() - WINDOW) : m.end() + WINDOW]
        for owner, rank in owners.items():
            if owner in near:
                found.append((owner, rank))
    return found


def test_ranking_is_readable_and_has_a_rank_one():
    """CONTROL — if the ranking cannot be read, every assertion below is vacuous."""
    owners = _ranking()
    assert len(owners) == 10, owners
    assert sorted(owners.values()) == list(range(1, 11))


def test_the_detector_can_fire():
    """KNOWN-POSITIVE CONTROL — the check must find a crowning that IS there.

    Guards the shape that made the stale-refusal sweep useless: a detector
    proven only against text that happens to be clean.
    """
    owners = _ranking()
    rank4 = next(o for o, r in owners.items() if r == 4)
    planted = f"the tool loses badly to {rank4}, the league's best drafter, at -163"
    hits = _crownings(planted, owners)
    assert hits == [(rank4, 4)], hits


@pytest.mark.repo_parity  # a re-ranked drafter study must not refuse a board build
@pytest.mark.parametrize("name", PROSE)
def test_no_prose_file_crowns_a_non_rank_one_drafter(name):
    path = ROOT / name
    if not path.exists():
        pytest.skip(f"{name} not present")
    owners = _ranking()
    wrong = [
        (o, r)
        for block in _live_paragraphs(path.read_text())
        for o, r in _crownings(block, owners)
        if r != 1
    ]
    assert not wrong, (
        f"{name} calls a non-rank-1 owner the 'best drafter': {wrong}. "
        f"The replay's own drafter_study ranks them there; rank 1 is "
        f"{next(o for o, r in owners.items() if r == 1)}. "
        "See draft/audit/replay_best_drafter_claim_2026-08-18.md."
    )


#: Seat deltas as prose writes them: "-163", "-163.43", "(-163)", "\u2212163".
_NUM = re.compile(r"[-\u2212]\s?(\d{1,3})(?:\.\d+)?")


def _deltas_near_crown(text: str) -> list[int]:
    """Magnitudes of negative numbers quoted within WINDOW of 'best drafter'."""
    out = []
    for m in CROWN.finditer(text):
        near = text[max(0, m.start() - WINDOW) : m.end() + WINDOW]
        out += [int(n) for n in _NUM.findall(near)]
    return out


def _seat_deltas() -> dict[str, float]:
    table = json.loads(TABLE.read_text())
    baseline = table["pooled"]["baseline"]
    return {
        v["owner"]: v["realistic"]["mean_delta"]
        for k, v in baseline.items()
        if k != "_summary"
    }


def test_the_number_detector_can_fire():
    """KNOWN-POSITIVE CONTROL for the unattributed form of the same claim."""
    planted = "the tool ties Cory and loses to the league's best drafter (-163)"
    assert 163 in _deltas_near_crown(planted)


@pytest.mark.repo_parity  # same: the deltas come from a regenerable artifact
@pytest.mark.parametrize("name", PROSE)
def test_no_prose_file_attributes_a_wrong_delta_to_the_best_drafter(name):
    """CLAUDE.md's form names no owner but still asserts whose seat -163 is.

    Dropping the name does not make the claim weaker, only harder to check.
    """
    path = ROOT / name
    if not path.exists():
        pytest.skip(f"{name} not present")
    owners = _ranking()
    deltas = _seat_deltas()
    rank1 = next(o for o, r in owners.items() if r == 1)
    allowed = round(abs(deltas[rank1]))
    quoted = [
        n for block in _live_paragraphs(path.read_text()) for n in _deltas_near_crown(block)
    ]
    # Only judge magnitudes that ARE somebody's seat delta; a stray year or
    # page number near the phrase is not a claim about the table.
    seat_magnitudes = {round(abs(v)) for v in deltas.values()}
    wrong = [n for n in quoted if n in seat_magnitudes and n != allowed]
    assert not wrong, (
        f"{name} quotes {wrong} as the best drafter's seat delta. The rank-1 "
        f"drafter is {rank1} and the tool's delta in that seat is "
        f"{deltas[rank1]:+.1f}. "
        "See draft/audit/replay_best_drafter_claim_2026-08-18.md."
    )


def test_the_exemption_does_not_swallow_a_fresh_claim():
    """KNOWN-POSITIVE CONTROL on the retraction exemption itself.

    A file that retracts the crowning in one paragraph and re-asserts it in
    another is still wrong, and the exemption must not hide the second one.
    """
    owners = _ranking()
    rank4 = next(o for o, r in owners.items() if r == 4)
    text = (
        f"CORRECTED: this used to say {rank4} was the best drafter.\n\n"
        f"The tool loses to {rank4}, the league's best drafter, by -163.\n"
    )
    live = _live_paragraphs(text)
    assert len(live) == 1, live
    assert _crownings(live[0], owners) == [(rank4, 4)]
    assert 163 in _deltas_near_crown(live[0])


def test_the_worst_seat_is_not_the_best_drafter():
    """The measured fact behind the correction, pinned so it cannot drift back."""
    table = json.loads(TABLE.read_text())
    baseline = table["pooled"]["baseline"]
    seats = [v for k, v in baseline.items() if k != "_summary"]
    worst = min(seats, key=lambda s: s["realistic"]["mean_delta"])
    owners = _ranking()
    assert owners[worst["owner"]] != 1, (
        "The worst seat now belongs to the rank-1 drafter — the crowning would "
        "be arithmetically true. Re-read the audit doc before relaxing this: "
        "the objection was that the label was assigned FROM the delta, and a "
        "coincidence does not repair that."
    )
