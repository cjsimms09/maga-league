# TERRITORY: A
"""THE ONE IRREVERSIBLE ACTION HAD TO BE REHEARSABLE.

`freeze_pre_draft.py`'s own header calls it "the only irreversible item in the
plan": the board is rebuilt nightly and overwritten, so if draft night passes
without a freeze, 2026 produces zero learning signal and 2027 starts where 2026
started.

The committed freeze (2026-08-14) predates 14 fields the freezer now declares, so
the draft-day action is "delete the stale freeze, re-run the freezer". Until
2026-08-17 the ONLY way to find out whether that command worked was to DELETE THE
REAL ARTIFACT AND RUN IT — on draft day, on the clock, with nothing to fall back
to if it failed. The single file in this repo that most needed a dress rehearsal
was the one file that could not have one.

`PRE_DRAFT_FREEZE_PATH` fixes that, the same way `DRAFT_PICK_LOG_PATH` (added
2026-08-15) let draft-night-sync.yml exercise its polling for real without ever
touching the live pick log. Rehearsed the same day it was added: a fresh take
wrote 682 players x 12 picks and carried all 44 declared fields, 0 missing.

WHAT THIS FILE GUARDS: that the override works in BOTH directions, that it does
not weaken the write-once refusal, and that `--verify` reads through the same
reference the writer used — a partial override would verify one file while having
written another, which is the failure this kind of indirection invites.

Run: python3 -m pytest draft/tests/test_freeze_path_override.py
"""
from __future__ import annotations

import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "draft"))


import pytest


@pytest.fixture(autouse=True)
def _restore_module_state():
    """PUT THE MODULE BACK. Caught the moment this file was written: these tests
    `importlib.reload` freeze_pre_draft under a patched environment, and a reload
    mutates the module object for the WHOLE pytest process. Without this
    teardown, three tests in test_pick_log_rehearsal.py failed with a KeyError —
    they import the same module and were inheriting an OUT pointing at a
    tmp_path that no longer existed.

    Green in isolation, red after this file ran first: exactly the order-
    dependent failure that makes a suite untrustworthy, and it was introduced by
    a test file whose subject is not leaking state onto the real artifact.
    """
    yield
    os.environ.pop("PRE_DRAFT_FREEZE_PATH", None)
    import freeze_pre_draft as FZ
    importlib.reload(FZ)


def _reload(monkeypatch, value):
    """The path is read at import, so the override has to be re-imported."""
    if value is None:
        monkeypatch.delenv("PRE_DRAFT_FREEZE_PATH", raising=False)
    else:
        monkeypatch.setenv("PRE_DRAFT_FREEZE_PATH", str(value))
    import freeze_pre_draft as FZ
    return importlib.reload(FZ)


def test_the_default_is_completely_unchanged_when_unset(monkeypatch):
    """Every normal caller must be unaffected. An override that quietly moves the
    default would put the real freeze somewhere nobody looks for it."""
    FZ = _reload(monkeypatch, None)
    assert FZ.OUT == FZ._DEFAULT_OUT
    assert FZ.OUT.name == "pre_draft_freeze_2026.json"
    assert str(FZ.OUT).endswith(os.path.join("draft", "data",
                                             "pre_draft_freeze_2026.json"))


def test_the_override_is_honoured_when_set(monkeypatch, tmp_path):
    target = tmp_path / "rehearsal.json"
    FZ = _reload(monkeypatch, target)
    assert FZ.OUT == target
    assert FZ.OUT != FZ._DEFAULT_OUT


def test_verify_reads_through_the_same_reference_the_writer_used(monkeypatch, tmp_path):
    """A PARTIAL override is the trap this kind of indirection sets: writing to
    the rehearsal path while verifying the real one would report a green
    rehearsal that proved nothing about the file just written."""
    target = tmp_path / "rehearsal.json"
    FZ = _reload(monkeypatch, target)
    assert FZ.verify() == 1                      # nothing there yet

    payload = {"players": [{"player_id": "1"}], "my_picks": [1],
               "source_artifact_built_at": "2026-08-17T00:00:00Z"}
    payload["_sha256_of_payload"] = FZ._sha(payload)
    target.write_text(json.dumps(payload))
    assert FZ.verify() == 0                      # and now it reads THIS file


def test_verify_still_detects_alteration_under_the_override(monkeypatch, tmp_path):
    """CONTROL. If verify() returned 0 for anything the override pointed at, the
    test above would pass for the wrong reason."""
    target = tmp_path / "rehearsal.json"
    FZ = _reload(monkeypatch, target)
    payload = {"players": [{"player_id": "1"}], "my_picks": [1],
               "source_artifact_built_at": "2026-08-17T00:00:00Z"}
    payload["_sha256_of_payload"] = FZ._sha(payload)
    doc = dict(payload)
    doc["players"] = [{"player_id": "TAMPERED"}]
    target.write_text(json.dumps(doc))
    assert FZ.verify() == 1


def test_the_write_once_refusal_applies_to_the_override_path_too(monkeypatch, tmp_path):
    """This makes the rehearsal possible, NOT the overwrite easy. If the override
    bypassed the refusal it would become the --force flag the freezer
    deliberately does not have — 'a flag that exists is a flag a cron eventually
    passes'."""
    target = tmp_path / "rehearsal.json"
    FZ = _reload(monkeypatch, target)
    target.write_text("{}")
    monkeypatch.setattr(sys, "argv", ["freeze_pre_draft.py"])
    assert FZ.main() == 2                        # refuses rather than overwrites
    assert target.read_text() == "{}"            # and did not touch it


def test_no_force_flag_was_introduced_alongside_the_override(monkeypatch):
    """The freezer's refusal comment explains why there is no --force. An
    override is not a licence to add one later."""
    src = open(os.path.join(ROOT, "draft", "freeze_pre_draft.py"),
               encoding="utf8").read()
    assert "--force" not in src.split("# NO --force")[1] if "# NO --force" in src \
        else "--force" not in src
