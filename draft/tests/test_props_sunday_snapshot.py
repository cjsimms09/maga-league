# TERRITORY: relay
"""The Sunday closing-line props snapshot (P289's input) is a SEPARATE file.

The arm and the Tuesday grader read `weekly_props_<season>_w<week>.json` —
the Wed/Thu pre-kickoff lines the emission actually used. The Sunday run
writes `..._w<week>_sun.json` via PROPS_SNAPSHOT_SUFFIX and must never be
able to reach the arm's file: a grader that graded the arm on lines it did
not see would be measuring the wrong thing (ROUTES relay → C, 2026-09-02)."""
import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "draft"))
sys.path.insert(0, str(ROOT / "draft" / "tools"))
from weekly_props_arm import props_snapshot_path, load_props_arm  # noqa: E402


def test_the_arm_path_is_unsuffixed_and_the_sunday_path_is_a_sibling(tmp_path):
    assert props_snapshot_path(tmp_path, 2026, 3).name == "weekly_props_2026_w3.json"
    assert props_snapshot_path(tmp_path, 2026, 3, "_sun").name == "weekly_props_2026_w3_sun.json"
    assert props_snapshot_path(tmp_path, 2026, 3) != props_snapshot_path(tmp_path, 2026, 3, "_sun")


def test_the_arm_loader_ignores_a_sunday_sibling(tmp_path):
    """KNOWN NEGATIVE: only the _sun file exists → the arm sees no snapshot.
    KNOWN POSITIVE: the unsuffixed file exists → the arm loads it."""
    sun = props_snapshot_path(tmp_path, 2026, 3, "_sun")
    sun.write_text('{"season": 2026, "week": 3, "players": {"1": {"points": 9.5}}}')
    assert load_props_arm(tmp_path, 2026, 3) is None
    arm = props_snapshot_path(tmp_path, 2026, 3)
    arm.write_text('{"season": 2026, "week": 3, "players": {"1": {"points": 12.0}}}')
    loaded = load_props_arm(tmp_path, 2026, 3)
    assert loaded and abs(float(loaded["1"]) - 12.0) < 1e-9


def test_the_writer_refuses_a_malformed_suffix_before_writing(monkeypatch, tmp_path):
    """The env var is the only way to point the writer at a sibling; a suffix
    that could escape the pattern (a path, a space, the empty-but-set case)
    is refused before any network call."""
    spec = importlib.util.spec_from_file_location("fetch_free_props", ROOT / "draft" / "tools" / "fetch_free_props.py")
    F = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(F)
    src = (ROOT / "draft" / "tools" / "fetch_free_props.py").read_text()
    assert 'os.environ.get("PROPS_SNAPSHOT_SUFFIX", "")' in src
    assert 're.fullmatch(r"_[a-z]{1,8}", suffix)' in src


def test_the_workflow_writes_the_sunday_file_under_a_suffix_and_never_the_arm_file():
    wf = (ROOT / ".github" / "workflows" / "free-props-writer.yml").read_text()
    assert "- cron: '30 15 * * 0'" in wf                      # Sunday 15:30Z
    assert "export PROPS_SNAPSHOT_SUFFIX=_sun" in wf
    assert "- cron: '30 19 * * 3'" in wf and "- cron: '20 12 * * 4'" in wf   # the arm's runs stay
