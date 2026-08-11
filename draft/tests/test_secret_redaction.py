"""Nothing that reaches disk or a public log may carry the API key.

WHY THIS EXISTS, AND WHY IT IS NOT JUST market_probe's TEST. On 2026-08-11 an
InvalidURL stringified the full request URL — key included — into
`market_probe.json`, and the workflow COMMITTED it. The redactor added in
response lived in market_probe alone. `market_capture.py` writes
`"refused": str(e)` into `capture_health.json`, which is committed on every run,
and that path never got it. Found auditing history before the repo went public.

THE ASYMMETRY THAT MAKES THIS WORSE THAN A LOG LEAK. GitHub masks `secrets.*` in
Actions logs and does nothing for a file we write ourselves — and nothing at all
for `vars.*`, which is not masked anywhere. On a PUBLIC repo the Actions logs are
world-readable too, so "the log is masked" is only true when the value came from
the Secrets store.
"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "draft", "backtest"))

import market_request as R  # noqa: E402


def test_the_live_key_is_stripped_from_anything_recorded(monkeypatch):
    monkeypatch.setenv("ODDS_API_KEY", "042a07dcTESTVALUE0000")
    out = R.redact("InvalidURL: https://api.x/v4/odds?apiKey=042a07dcTESTVALUE0000&regions=us")
    assert "042a07dcTESTVALUE0000" not in out
    assert "REDACT" in out


def test_a_key_shaped_param_goes_even_when_the_env_var_is_unset(monkeypatch):
    """The original leak arrived through a value nobody expected to be recorded.

    A redactor that only knows the CURRENT process's key cannot catch a URL built
    elsewhere, replayed from a fixture, or carrying a different credential.
    """
    monkeypatch.delenv("ODDS_API_KEY", raising=False)
    for param in ("apiKey", "api_key", "key", "token", "secret"):
        out = R.redact("https://api.x/v4?%s=LIVESECRETVALUE&z=1" % param)
        assert "LIVESECRETVALUE" not in out, param
        assert "z=1" in out, "redaction ate an unrelated parameter (%s)" % param


def test_it_never_throws_on_the_shapes_an_exception_actually_arrives_as():
    """This runs on the failure path. If it raises there, it hides the real error."""
    for v in (None, "", 0, [], {"a": 1}, ValueError("boom")):
        R.redact(v)


def test_BOTH_writers_route_through_the_one_redactor():
    """The defect was a second write path, not a bad redactor.

    Asserted by CALLING market_probe's function and checking it produces the
    shared implementation's output — not by grepping for the word `redact`, which
    a comment would satisfy (rule 11e).
    """
    import market_probe as P
    probe = P._redact("https://api.x/v4?apiKey=SHAREDCHECK")
    assert probe == R.redact("https://api.x/v4?apiKey=SHAREDCHECK")
    assert "SHAREDCHECK" not in probe
