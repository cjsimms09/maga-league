# TERRITORY: A
"""LOG's env-var override — built 2026-08-15 for draft-night-sync.yml's dry_run.

The workflow needs to verify its own polling/exit mechanics against a REAL
draft_id on real GitHub Actions runners (Sleeper is blocked from this sandbox,
see test_pick_log_rehearsal.py's header) without ever writing to the real
draft_pick_log_2026.jsonl. This is the one, narrow thing that makes that
possible: LOG's default is unchanged for every existing caller, and an env var
can redirect it BEFORE the module is imported (module-load-time, matching how
a subprocess environment actually works — the workflow sets the env var, then
invokes `python3 log_draft_picks.py` fresh).

Deliberately a SEPARATE test from test_pick_log_rehearsal.py's `log` fixture,
which monkeypatches the already-imported module's LOG attribute directly — a
different mechanism, proving a different thing. That fixture proves the
rehearsal never touches the real file; this proves the actual override path
draft-night-sync.yml's dry_run relies on.

Run: python -m pytest draft/tests/test_log_draft_picks_path_override.py -q
"""
from __future__ import annotations

import importlib
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_default_LOG_is_unchanged_when_the_env_var_is_absent():
    # A fresh subprocess, not a re-import in this process — os.environ.get()
    # is read once at module load, so a stale import in THIS process (already
    # loaded by another test file, possibly with a different env) would prove
    # nothing about a real cold start.
    out = subprocess.run(
        [sys.executable, "-c",
         "import sys; sys.path.insert(0, 'draft'); import log_draft_picks as L; print(L.LOG)"],
        cwd=str(ROOT), capture_output=True, text=True, timeout=15,
    )
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip().endswith("draft/data/draft_pick_log_2026.jsonl"), out.stdout


def test_LOG_follows_DRAFT_PICK_LOG_PATH_when_set(tmp_path):
    target = str(tmp_path / "dry_run_log.jsonl")
    out = subprocess.run(
        [sys.executable, "-c",
         "import sys; sys.path.insert(0, 'draft'); import log_draft_picks as L; print(L.LOG)"],
        cwd=str(ROOT), capture_output=True, text=True, timeout=15,
        env={**__import__("os").environ, "DRAFT_PICK_LOG_PATH": target},
    )
    assert out.returncode == 0, out.stderr
    assert out.stdout.strip() == target, out.stdout


def test_status_and_sync_both_read_write_through_the_overridden_path(tmp_path, monkeypatch):
    # THE ACTUAL GUARANTEE draft-night-sync.yml's dry_run depends on: every
    # read/write in the module goes through the SAME LOG reference, so
    # redirecting it once redirects both --status and --sync consistently —
    # not a partial override that silently still touches the real file for
    # one of the two.
    sys.path.insert(0, str(ROOT / "draft"))
    if "log_draft_picks" in sys.modules:
        importlib.reload(sys.modules["log_draft_picks"])
    import log_draft_picks as L

    p = tmp_path / "override_target.jsonl"
    monkeypatch.setattr(L, "LOG", p)

    assert L._rows() == []  # nothing written yet, reads through LOG cleanly
    assert not p.exists()  # _rows() must not create the file as a side effect
