"""TWO ARTIFACTS MAY NOT ANSWER THE SAME QUESTION IN SILENCE — register 88.

`replay_league_table.json` says Cory −9.39. `engine_seat_replay.json` says
−188.35 on its preregistered primary. Both are correct. They answer the same
question in ENGLISH and different questions in fact:

  * the proxy measures a hand-written selection policy (BPA-by-VORP, caps
    QB2/RB7/WR7/TE2, starter-feasibility rail) over `own_v6_nomarket`
    projections;
  * the engine replay measures the SHIPPED `engine.js` at `MEASURED_WEIGHTS`.

`CLAUDE.md`, `OWNERS.md` and two `ROUTES.md` entries quoted the first as "the
tool" for days while the second sat committed and unread. A's ask (register 88):
*what should each artifact say about itself so this cannot recur?*

⚠️ NOT `supersedes`, which was the instinct and is WRONG HERE — checked before
answering. Neither artifact replaces the other: `policy_tested` and
`board_arms` describe different objects, so a `supersedes` edge would license
deleting the proxy or reading −188.35 as a correction of −9.39. It is a
correction of nothing; it is a different measurement.

THE CONTRACT, three fields, and only the first is ever required:

  _answers            a short normalized key for the QUESTION, not the method.
                      Artifacts sharing a key are claiming to answer the same
                      thing and must disambiguate.
  _measures           the object measured. This is the field that would have
                      stopped the misread on its own.
  _not_the_same_as    {other_artifact: why} — REQUIRED from every member of a
                      shared-key group, naming every other member. A
                      `_superseded_by` entry satisfies it too, for the case
                      where one artifact really does replace another.

An artifact with no `_answers` is ignored: this is opt-in, so it cannot become
a tax on every JSON in the repo.

Run: python3 -m pytest draft/tests/test_artifact_questions.py -q
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCAN_DIRS = (ROOT / "draft" / "data", ROOT / "draft" / "backtest")


def _declarations(docs: dict) -> dict:
    """{question_key: {artifact: doc}} over artifacts that declare `_answers`."""
    groups: dict = defaultdict(dict)
    for name, doc in docs.items():
        if isinstance(doc, dict) and isinstance(doc.get("_answers"), str):
            groups[doc["_answers"].strip().lower()][name] = doc
    return groups


def undisambiguated(docs: dict) -> list:
    """Every (question, artifact, missing_peer) that shares a question key and
    does not name the peer. This is the whole rule."""
    bad = []
    for question, members in _declarations(docs).items():
        if len(members) < 2:
            continue
        for name, doc in members.items():
            named = set(doc.get("_not_the_same_as") or {})
            named |= set(doc.get("_superseded_by") or {})
            if isinstance(doc.get("_superseded_by"), str):
                named.add(doc["_superseded_by"])
            for peer in members:
                if peer != name and peer not in named:
                    bad.append((question, name, peer))
    return bad


# ── CONTROLS: the checker must fire, and must not fire ────────────────────

def test_KNOWN_POSITIVE_two_artifacts_sharing_a_question_in_silence_FAIL():
    docs = {"a.json": {"_answers": "does the tool beat owners"},
            "b.json": {"_answers": "does the tool beat owners"}}
    bad = undisambiguated(docs)
    assert len(bad) == 2, bad          # each must name the other


def test_KNOWN_NEGATIVE_the_same_pair_WITH_disambiguation_passes():
    docs = {"a.json": {"_answers": "q", "_not_the_same_as": {"b.json": "different object"}},
            "b.json": {"_answers": "q", "_not_the_same_as": {"a.json": "different object"}}}
    assert undisambiguated(docs) == []


def test_a_ONE_SIDED_link_still_fails_which_is_register_88s_actual_shape():
    """The real defect was asymmetric: engine_seat_replay quoted the proxy's
    numbers and the proxy pointed nowhere — and the proxy is the one CLAUDE.md
    read. A rule satisfied by one side would not have caught it."""
    docs = {"proxy.json": {"_answers": "q"},
            "engine.json": {"_answers": "q", "_not_the_same_as": {"proxy.json": "why"}}}
    bad = undisambiguated(docs)
    assert [b[1] for b in bad] == ["proxy.json"], bad


def test_supersedes_ALSO_satisfies_it_for_the_case_where_one_really_replaces():
    docs = {"old.json": {"_answers": "q", "_superseded_by": "new.json"},
            "new.json": {"_answers": "q", "_not_the_same_as": {"old.json": "replaces it"}}}
    assert undisambiguated(docs) == []


def test_an_artifact_with_NO_answers_key_is_ignored_so_this_is_opt_in():
    docs = {"a.json": {"_answers": "q"}, "b.json": {"_note": "unrelated"}}
    assert undisambiguated(docs) == []


def test_a_LONE_declaration_is_fine():
    assert undisambiguated({"a.json": {"_answers": "q"}}) == []


# ── the live repo ─────────────────────────────────────────────────────────

def _load_live() -> dict:
    docs = {}
    for d in SCAN_DIRS:
        if not d.exists():
            continue
        for f in sorted(d.glob("*.json")):
            if f.stat().st_size > 40_000_000:
                continue
            try:
                docs[f.name] = json.loads(f.read_text())
            except Exception:
                continue
    return docs


def test_no_two_LIVE_artifacts_answer_the_same_question_in_silence():
    bad = undisambiguated(_load_live())
    assert not bad, "\n".join(
        f"{a} shares question {q!r} with {peer} and does not name it"
        for q, a, peer in bad)
