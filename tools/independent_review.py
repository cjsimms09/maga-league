# TERRITORY: A
"""INDEPENDENT ADVERSARIAL REVIEW — a second opinion that is not mine.

Every guard in this repository was written by the lane whose work it checks.
That is the structural limit this harness exists to relieve: a reviewer sharing
my assumptions cannot see the assumption. Today alone I published a positional
finding whose threshold sat inside its own null band and was two commits from
main with it; the thing that caught it was another lane, not another test.

── WHAT IT IS AND IS NOT ───────────────────────────────────────────────────

READ-ONLY, and structurally so rather than by promise. This module writes ONE
file, the path it is given. It runs no git command that mutates, calls no
review-approval API, and hands the model no tools. In v1 the verdict does not
fail the job — we look at how it behaves before it gates anything.

THE KEY IS NEVER PLACED IN A STRUCTURE THAT IS SERIALISED. It is read from the
environment inside `_client()` and handed straight to the SDK. It is not a
parameter, not in the payload, not in the prompt, not in the output. There is no
code path that can print it, because it is never bound to a name the printers
can reach.

── THE SEPARATION THAT MATTERS ────────────────────────────────────────────

The payload has two top-level sections and the prompt is told which is which:

    repository_facts   diff, changed files, raw test output and exit codes
    claude_claims      the narrative: what ran, what came back, what it proves,
                       what it does NOT prove, uncertainty, next step

The narrative is an ASSERTION UNDER TEST. A reviewer handed a claim and a diff
in one undifferentiated blob will anchor on the claim — which is the same defect
as a test that reads its own documentation and passes.

── TRUNCATION IS DECLARED, NOT SILENT ─────────────────────────────────────

A diff trimmed to fit a context window without saying so lets a reviewer report
"no issue found" about code it never saw. `diff_truncated` and the omitted byte
count travel in the payload, and the prompt routes unseen code to `unknown`.

── THE REVIEWER IS OPTIONAL AND THE PIPELINE MUST NOT DEPEND ON IT ────────

Cory, 2026-08-14: "this process needs to be able to work still if my openai
money runs out."

A correctness requirement, not a convenience. The delegation protocol says to
obtain an independent verdict before committing a substantive model change, so
an unreachable reviewer would BLOCK model work entirely on a billing event days
before a draft. A review step that can halt the pipeline it reviews is a worse
defect than any it could catch.

So unavailability is a first-class outcome: exit 0, an artifact whose `status`
is UNAVAILABLE and which carries NO `verdict` key at all, and a named kind
(BILLING / AUTH / MODEL / TRANSIENT / CONFIG / UNKNOWN) because the human
response differs for each. The fallback is not a weaker model — it is that I do
the adversarial pass myself and say so.

Verify that path in one line, no key and no network needed:

    OPENAI_API_KEY= python3 tools/independent_review.py --self-test --out /tmp/u.json
    # -> exit 0, status UNAVAILABLE, .get("verdict") is None

Usage:
    python3 tools/independent_review.py --base origin/main --head HEAD \\
        --claim claim.md --out review.json
    python3 tools/independent_review.py --self-test --out selftest.json
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPT = ROOT / "tools" / "reviewer_prompt.md"
SCHEMA = ROOT / "tools" / "reviewer_schema.json"

#: Overridable, because a hard-coded model is an obsolete model eventually. If
#: the API rejects it we FAIL LOUDLY rather than falling back — a silent
#: downgrade to a weaker model would produce confident, worse reviews and
#: nothing would say so.
DEFAULT_MODEL = "gpt-5"

#: WHICH INDEPENDENT REVIEWER, OR NONE AT ALL.
#:
#: Cory, 2026-08-14: "We should be able to disable the OpenAI reviewer
#: completely and run the entire project from the repository's existing
#: deterministic/data-driven machinery."
#:
#: `disabled` is a supported, first-class setting -- not a broken state. It
#: records `status: UNAVAILABLE, kind: DISABLED` and exits 0, so turning the
#: reviewer off changes nothing about whether the football system runs. It also
#: means the budget can be protected by a config change rather than by letting
#: calls fail.
#:
#: The provider is a seam, not an abstraction layer: one function returns a
#: review dict. Another provider or a local model fills the same slot without
#: the football system knowing a provider exists at all.
PROVIDERS = ("openai", "disabled")

#: Bytes of diff we are willing to send. Truncation is declared in the payload.
MAX_DIFF_BYTES = 400_000


def _run(cmd: list[str], *, cwd: Path = ROOT) -> tuple[int, str]:
    """Run and capture. Never raises on a non-zero exit: a red suite is EVIDENCE
    the reviewer must see, not a reason to abandon the review."""
    p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


# ── REPOSITORY FACTS ────────────────────────────────────────────────────────
def collect_repo_facts(base: str, head: str, *, run_tests: bool) -> dict:
    rc_d, diff = _run(["git", "diff", f"{base}...{head}"])
    rc_n, names = _run(["git", "diff", "--numstat", f"{base}...{head}"])

    raw_len = len(diff.encode())
    truncated = raw_len > MAX_DIFF_BYTES
    if truncated:
        diff = diff.encode()[:MAX_DIFF_BYTES].decode(errors="ignore")

    files = []
    for line in names.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            files.append({"added": parts[0], "deleted": parts[1], "path": parts[2]})

    facts = {
        "base_ref": base,
        "head_ref": head,
        "base_sha": _run(["git", "rev-parse", base])[1].strip(),
        "head_sha": _run(["git", "rev-parse", head])[1].strip(),
        "changed_files": files,
        "changed_file_count": len(files),
        "diff": diff,
        "diff_truncated": truncated,
        "diff_omitted_bytes": max(0, raw_len - MAX_DIFF_BYTES),
        "diff_command_exit": rc_d or rc_n,
    }

    if run_tests:
        rc_py, out_py = _run(["python", "-m", "pytest", "draft/tests", "-q"])
        facts["python_tests"] = {
            "command": "python -m pytest draft/tests -q",
            "exit_code": rc_py,
            # Tail only: pytest's dot-progress is thousands of characters of no
            # information, and the failures are at the end.
            "output_tail": out_py[-20_000:],
        }
        rc_js, out_js = _run(["bash", "scripts/js-sweep.sh", "--quiet"])
        facts["js_tests"] = {
            "command": "bash scripts/js-sweep.sh --quiet",
            "exit_code": rc_js,
            "output_tail": out_js[-20_000:],
        }
    else:
        # STATED, NOT OMITTED. A missing key would read as "no tests exist";
        # this says the reviewer was given no test evidence, so any claim
        # resting on tests belongs in `not_proven`.
        facts["python_tests"] = {"skipped": True,
                                 "why": "tests not run for this invocation"}
        facts["js_tests"] = {"skipped": True,
                             "why": "tests not run for this invocation"}
    return facts


def load_claims(path: str | None) -> dict:
    if not path:
        return {"claim": None,
                "note": "No claim file supplied. With no stated claim there is "
                        "nothing to test the evidence AGAINST; review the diff "
                        "on its own terms and say so in reasoning_summary."}
    return {"raw_markdown": Path(path).read_text(),
            "note": "WRITTEN BY THE AGENT UNDER REVIEW. An assertion to be "
                    "tested against repository_facts, never treated as fact."}


# ── THE CALL ────────────────────────────────────────────────────────────────
class Unavailable(Exception):
    """THE REVIEWER IS OPTIONAL AND MUST STAY OPTIONAL.

    Cory, 2026-08-14: "this process needs to be able to work still if my openai
    money runs out."

    That is a correctness requirement, not a convenience one. The delegation
    protocol says to obtain an independent verdict before committing a
    substantive model change — so an unreachable reviewer would BLOCK model work
    entirely, three days before a draft, on a billing event. A review step that
    can halt the pipeline it reviews is a worse defect than any it could catch.

    So unavailability is a FIRST-CLASS OUTCOME, distinct from every verdict:

      * it exits 0 — the change is not rejected, it is UNREVIEWED, and those are
        different claims;
      * it writes an artifact whose `status` is UNAVAILABLE and which carries NO
        `verdict` key at all, so nothing downstream can mistake it for ACCEPT.
        An absence of review must never read as approval — that is this repo's
        oldest failure mode wearing yet another costume;
      * it names WHICH kind of unavailability, because the human response
        differs: a billing stop means "carry on without it", a bad key means
        "fix the setup", a transient 5xx means "re-run".

    The fallback is not a weaker reviewer. There is no automatic second model,
    because a review from something nobody chose is not a second opinion. The
    fallback is: I do the adversarial pass myself and say plainly that I did.
    """


#: Substrings that mean "the account cannot pay", as opposed to "the setup is
#: wrong". Matched case-insensitively against the exception text, because the
#: SDK's typed errors do not distinguish billing from other 429s reliably.
_BILLING = ("insufficient_quota", "exceeded your current quota", "billing",
            "payment required", "account is not active", "credit balance")
_TRANSIENT = ("rate limit", "429", "500", "502", "503", "504", "timeout",
              "timed out", "connection", "overloaded")


def _classify(e: Exception) -> tuple[str, str]:
    """(kind, what to do about it). Kept separate from the call so the mapping
    is readable and testable rather than buried in an except block."""
    t = f"{type(e).__name__}: {e}".lower()
    if any(s in t for s in _BILLING):
        return ("BILLING", "The OpenAI account cannot fund this call. Nothing "
                "is wrong with the change or the repository. Proceed WITHOUT "
                "the reviewer and say so in the report; do not treat the "
                "missing review as approval.")
    if any(s in t for s in ("401", "invalid_api_key", "unauthorized",
                            "authentication")):
        return ("AUTH", "The key was present but rejected. This is a setup "
                "problem, not a funding one — check the secret's value.")
    if "model" in t and ("not found" in t or "does not exist" in t
                         or "unsupported" in t):
        return ("MODEL", "The configured model is unavailable. Set REVIEW_MODEL "
                "to a current reasoning model. There is deliberately no "
                "automatic fallback: a review from a model nobody chose is not "
                "a second opinion.")
    if any(s in t for s in _TRANSIENT):
        return ("TRANSIENT", "A transient API failure. Re-running is a "
                "legitimate response here, in a way it never is for a verdict.")
    return ("UNKNOWN", "The call failed for a reason this does not classify. "
            "Read the message before deciding whether to proceed unreviewed.")


def _client():
    """The key is read here and handed straight to the SDK. It is never bound to
    a module global, a payload field, or an argument, so no printer can reach
    it."""
    key = os.environ.get("OPENAI_API_KEY", "")
    if not key.strip():
        # UNAVAILABLE, not a hard exit. A missing key must not halt the work it
        # was meant to review; it must be RECORDED as unreviewed.
        raise Unavailable(
            "CONFIG: OPENAI_API_KEY is empty.\n"
            "  This repository has hit the silent-empty-secret failure twice, so\n"
            "  the three causes are named rather than left to be guessed:\n"
            "    1. the job does not declare `environment: Review_ChatGPT` —\n"
            "       an Environment secret is INVISIBLE to a job that does not\n"
            "       name its environment, with no error anywhere;\n"
            "    2. the environment has a branch restriction and this run is\n"
            "       not on an allowed branch;\n"
            "    3. the value was added under Variables rather than Secrets,\n"
            "       which leaves `secrets.*` empty and silent.\n"
            "  Recording this as UNREVIEWED beats reporting a verdict.")
    try:
        from openai import OpenAI
    except ImportError:
        raise Unavailable("CONFIG: the openai SDK is not installed. "
                          "`pip install openai` — it is not a repo dependency.")
    return OpenAI(api_key=key)


def review(payload: dict, *, model: str, provider: str = "openai") -> dict:
    if provider == "disabled":
        raise Unavailable(
            "DISABLED: REVIEW_PROVIDER=disabled. The independent reviewer is "
            "switched off by configuration.\n  This is a supported state, not "
            "a fault: the core model, board, freeze, pick logger and every "
            "production decision path run with zero reviewer access. Nothing "
            "downstream is waiting on this.")
    if provider != "openai":
        raise Unavailable(
            f"PROVIDER: REVIEW_PROVIDER={provider!r} is not implemented. "
            f"Known: {', '.join(PROVIDERS)}.\n  Refusing beats silently using "
            "a provider nobody asked for.")
    return _review_openai(payload, model=model)


def _review_openai(payload: dict, *, model: str) -> dict:
    schema = json.loads(SCHEMA.read_text())
    # `additionalProperties: false` and full `required` are what the strict
    # structured-output mode needs; the schema is authored that way already.
    strict_schema = {k: v for k, v in schema.items() if not k.startswith(("$", "_"))}

    client = _client()
    try:
        resp = client.responses.create(
            model=model,
            reasoning={"effort": os.environ.get("REVIEW_EFFORT", "high")},
            input=[
                {"role": "system", "content": PROMPT.read_text()},
                {"role": "user", "content":
                    "Review this change. `repository_facts` is evidence; "
                    "`claude_claims` is an assertion under test.\n\n"
                    + json.dumps(payload, indent=1)},
            ],
            text={"format": {"type": "json_schema", "name": "independent_review",
                             "schema": strict_schema, "strict": True}},
        )
    except Exception as e:
        # NO SILENT FALLBACK TO ANOTHER MODEL. A quietly downgraded reviewer
        # produces confident, weaker verdicts and nothing says so.
        kind, advice = _classify(e)
        raise Unavailable(f"{kind}: the Responses API call failed for model "
                          f"{model!r}.\n  {type(e).__name__}: {e}\n  {advice}")

    text = getattr(resp, "output_text", None)
    if not text:
        raise Unavailable("EMPTY: the API returned no output text.")
    out = json.loads(text)
    _validate(out, schema)
    return out


def _validate(out: dict, schema: dict) -> None:
    """Check the shape OURSELVES. 'The API enforced it' is an assumption, and
    this repo has been wrong about that class of assumption."""
    missing = [k for k in schema["required"] if k not in out]
    if missing:
        raise SystemExit(f"REFUSING: reviewer output missing {missing}")
    allowed = schema["properties"]["verdict"]["enum"]
    if out["verdict"] not in allowed:
        raise SystemExit(f"REFUSING: verdict {out['verdict']!r} not in {allowed}")
    if out["verdict"] in ("BLOCK", "ACCEPT_WITH_REQUIREMENT") and not out["required_actions"]:
        raise SystemExit(
            f"REFUSING: verdict {out['verdict']} with an EMPTY required_actions. "
            "A block with nothing to do is a block nobody can clear.")


# ── SELF-TEST ───────────────────────────────────────────────────────────────
SELF_TEST_DIFF = """\
diff --git a/lab_positional.py b/lab_positional.py
+++ b/lab_positional.py
@@
+# Does the market rank QBs earlier than our board? Threshold: -9.7 slots.
+SUPERFLEX_THRESHOLD = -9.7
+
+def qb_delta(market_rank, board_rank, players):
+    qbs = [p for p in players if p.position == 'QB']
+    return median(market_rank[p] - board_rank[p] for p in qbs)
+
+def test_superflex_contamination_is_present():
+    d = qb_delta(MARKET, BOARD, PLAYERS)     # observed -13.0, n=25
+    assert d < SUPERFLEX_THRESHOLD           # passes
"""

SELF_TEST_CLAIM = """\
CLAIM: superflex contamination is present in the market ADP feed.
WHAT RAN: qb_delta over 25 quarterbacks on the shared population.
WHAT CAME BACK: -13.0 slots, clearing the -9.7 threshold.
WHAT IT PROVES: the market ranks QBs materially earlier than our board, which is
the signature of 2QB leagues in the pool.
WHAT IT DOES NOT PROVE: the exact size of the contamination.
UNCERTAINTY: none material; the test passes and n=25 is adequate.
NEXT STEP: apply a -13 slot correction to QB ADP.
"""


def self_test_payload() -> dict:
    """A KNOWN-NULL CHANGE, so the harness can be graded rather than merely run.

    This is a compressed version of a real finding I published and retracted on
    2026-08-14. The board's positional composition is not uniform — QBs sit late
    — so a market ranking every player AT RANDOM returns a QB delta near -4 with
    a 5th percentile of -33. The -9.7 threshold lies INSIDE that null band, so
    "clearing" it is not evidence of anything, and there is no null in the code.

    A reviewer that returns ACCEPT here is not detecting the failure mode it
    exists for, and its verdicts elsewhere are unvalidated output.
    """
    return {
        "repository_facts": {
            "base_ref": "SELF-TEST (no repository state involved)",
            "head_ref": "SELF-TEST",
            "changed_files": [{"added": "9", "deleted": "0",
                               "path": "lab_positional.py"}],
            "changed_file_count": 1,
            "diff": SELF_TEST_DIFF,
            "diff_truncated": False,
            "diff_omitted_bytes": 0,
            "python_tests": {"command": "pytest lab_positional.py",
                             "exit_code": 0,
                             "output_tail": "1 passed in 0.02s"},
            "js_tests": {"skipped": True, "why": "not applicable"},
        },
        "claude_claims": {"raw_markdown": SELF_TEST_CLAIM,
                          "note": "WRITTEN BY THE AGENT UNDER REVIEW."},
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="origin/main")
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--claim", default=None)
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-tests", action="store_true")
    ap.add_argument("--self-test", action="store_true",
                    help="grade the reviewer against a known-null change; "
                         "exits non-zero unless it BLOCKs")
    a = ap.parse_args()
    model = os.environ.get("REVIEW_MODEL", DEFAULT_MODEL)
    provider = os.environ.get("REVIEW_PROVIDER", "openai").strip().lower()

    if a.self_test:
        payload = self_test_payload()
    else:
        facts = collect_repo_facts(a.base, a.head, run_tests=not a.no_tests)
        # ── AN EMPTY DIFF IS NOT A CLEAN CHANGE ─────────────────────────────
        # Found on the first dry run: `origin/main...HEAD` was empty because the
        # branch had just been merged. The harness would have sent a claim, no
        # code, and passing tests — and got back a confident ACCEPT about
        # nothing. That is precisely the "internally consistent, conceptually
        # wrong" shape this reviewer exists to catch, reproduced in the reviewer
        # itself on the day it was written.
        #
        # A shallow clone produces the same empty diff, which is why the
        # workflow fetches full history and why this names both causes.
        if facts["changed_file_count"] == 0:
            raise SystemExit(
                f"REFUSING: {a.base}...{a.head} contains no changes.\n"
                "  A review of an empty diff returns a verdict about nothing and\n"
                "  reads exactly like a review of clean code. Either the refs are\n"
                "  wrong, the branch is already merged, or the checkout is\n"
                "  shallow (fetch-depth: 0 is required to see origin/main).")
        payload = {"repository_facts": facts, "claude_claims": load_claims(a.claim)}

    try:
        out = review(payload, model=model, provider=provider)
    except Unavailable as u:
        # ── THE DEGRADED PATH. Recorded, never silent, never mistaken for a
        #    verdict. NO `verdict` KEY IS WRITTEN AT ALL: a consumer that reads
        #    `.get("verdict") == "ACCEPT"` gets None, not approval.
        kind = str(u).split(":", 1)[0]
        rec = {
            "status": "UNAVAILABLE",
            "unavailable_kind": kind,
            "detail": str(u),
            "_model": model,
            "_provider": provider,
            "_self_test": bool(a.self_test),
            "what_this_is_not":
                "This is NOT a verdict and NOT an approval. The change was not "
                "reviewed. Absence of review is absence of evidence.",
            "how_to_proceed":
                "The reviewer is advisory and the pipeline does not depend on "
                "it. Continue the work, perform the adversarial pass manually, "
                "and state in the report that the independent review was "
                "UNAVAILABLE and why.",
        }
        # ⚠️ THE SELF-TEST IS THE ONE PLACE UNAVAILABILITY MUST FAIL.
        #
        # Cory: "API/config unavailability must make the self-test fail, because
        # an unrun self-test cannot establish reviewer validity."
        #
        # Exactly right, and the distinction is the whole architecture. A NORMAL
        # review that cannot run is non-blocking: the change is unreviewed, the
        # football system does not care, exit 0. A SELF-TEST that cannot run is
        # different in kind — its only purpose is to answer "is this reviewer
        # worth listening to", and an unrun one answers nothing while looking
        # like a completed step. Reporting success there would let an
        # unvalidated reviewer be promoted on the strength of a run that never
        # happened.
        rec["self_test_conclusive"] = False
        if a.self_test:
            rec["why_this_fails"] = (
                "A self-test that did not run cannot establish reviewer "
                "validity. This exits non-zero so it cannot be mistaken for a "
                "passed validation. Normal reviewer unavailability remains "
                "non-blocking; only the validation run is gated.")
        Path(a.out).write_text(json.dumps(rec, indent=1))
        print("=" * 66)
        print(f"INDEPENDENT REVIEW UNAVAILABLE  ({kind})")
        print("=" * 66)
        print(str(u))
        print("\nThis is not a rejection and not an approval — the change is "
              "UNREVIEWED.\nThe pipeline does not depend on the reviewer: "
              "carry on and do the\nadversarial pass by hand, saying so in the "
              "report.")
        # EXIT 0 FOR A NORMAL REVIEW, ON PURPOSE: a billing stop is not a defect
        # in the change, and a red job would halt model work on an unrelated
        # funding event -- the single point of failure this must not become.
        # NON-ZERO FOR A SELF-TEST, for the reason above.
        return 1 if a.self_test else 0

    out["_model"] = model            # WHICH reviewer said this. Never the key.
    out["_provider"] = provider
    out["_self_test"] = bool(a.self_test)
    out["status"] = "REVIEWED"
    Path(a.out).write_text(json.dumps(out, indent=1))

    print(f"verdict: {out['verdict']}   (model {model})")
    print(f"critical findings: {len(out['critical_findings'])}")
    for f in out["critical_findings"][:8]:
        print(f"  [{f['severity']}/{f['audit']}] {f['finding']}")
    for k in ("proven", "not_proven", "contradicted", "unknown"):
        print(f"{k}: {len(out.get(k) or [])}")

    if a.self_test:
        ok = out["verdict"] == "BLOCK"
        print("\nSELF-TEST: " + ("PASS — the reviewer caught the null." if ok else
              "FAIL — the reviewer ACCEPTED a finding whose threshold sits inside "
              "its own null band. It is not detecting the failure mode it exists "
              "for, and its verdicts elsewhere are unvalidated output."))
        return 0 if ok else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
