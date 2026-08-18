# TERRITORY: A
"""THE REVIEWER'S SCHEMA MUST BE VALID BEFORE AN API CALL CAN DISCOVER IT ISN'T.

WHAT HAPPENED, so the test is read as a consequence rather than as ceremony.
On 2026-08-14 the reviewer was reported UNAVAILABLE four times running and the
diagnosis chased the GitHub secret boundary through four rounds. The secret was
never the problem past the first round. Once the key resolved, the call came
back in three seconds with:

    BadRequestError: 400 - Invalid schema for response_format
    'independent_review': In context=('properties','critical_findings','items'),
    'required' is required to be supplied and to be an array including every key
    in properties. Missing 'file'.

The key authenticated. OpenAI accepted the request and rejected OUR SCHEMA. The
reviewer had never made a successful call in its life, and the only instrument
that could say so was a paid API round trip.

── THE RULE BEING ENFORCED ────────────────────────────────────────────────────

OpenAI structured outputs in `strict: true` mode require, at EVERY object level:

  * every key in `properties` also appears in `required`
  * `additionalProperties: false`

Optionality is expressed by a NULLABLE TYPE (`["string","null"]`), never by
leaving a key out of `required`. Three fields broke it — `parity_only_claims` at
the root, and `file`/`line` inside `critical_findings.items` — and the API
reports them ONE AT A TIME, so discovering them by dispatch would have cost
three round trips and three waits.

── WHY THIS IS A TEST AND NOT A COMMENT ───────────────────────────────────────

The failure was silent in exactly the way this repository keeps finding: the
schema was well-formed JSON, it passed `json.loads`, it described the right
shape, and `_validate` checked model OUTPUT against it — which never ran,
because there was never any output. Nothing checked the schema ITSELF against
the rules of the mode it is submitted under.

This costs zero API budget and runs in the normal Python suite, so a malformed
schema is now caught before a call is spent rather than by spending one. That
is the same principle as every other instrument in this audit: compute the
aggregate that makes the silent failure loud.

── WHY IT LIVES IN tools/ AND NOT draft/tests/ ────────────────────────────────

It was written into draft/tests/ and test_core_needs_no_reviewer.py went RED,
correctly: draft/** is the product tree, this file imports independent_review
and names reviewer_schema.json, and the guard exists to prove the core carries
no reviewer reference. The guard permits at most ONE excluded file per tree,
deliberately, so exempting a second would have widened the very thing a CONTROL
asserts cannot widen.

Moving it is the structural answer; an exemption would have been a rule someone
has to remember. The reviewer's own test belongs with the reviewer.

── SCOPE ──────────────────────────────────────────────────────────────────────

This validates SHAPE CONFORMANCE ONLY. It cannot tell whether the reviewer asks
good questions, and passing it is not evidence that any review is correct — only
that the request will not be rejected before the model sees it.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "tools" / "reviewer_schema.json"


def _objects(node, path=""):
    """Every object-with-properties in the schema, with its path."""
    if not isinstance(node, dict):
        return
    if node.get("type") == "object" and "properties" in node:
        yield path or "<root>", node
    for key, val in node.items():
        if key == "properties" and isinstance(val, dict):
            for pk, pv in val.items():
                yield from _objects(pv, f"{path}.{pk}")
        elif key == "items":
            yield from _objects(val, f"{path}[]")


def _schema():
    return json.loads(SCHEMA_PATH.read_text())


def test_control_the_schema_loads_and_has_objects_to_check():
    """Without this, every assertion below passes on an empty iteration."""
    found = list(_objects(_schema()))
    assert len(found) >= 2, f"only {len(found)} objects found — the walker is not walking"
    assert any(p.endswith("[]") for p, _ in found), \
        "no array-item object reached; critical_findings.items is where the real bug was"


def test_every_property_is_required_at_every_level():
    """The exact rule the 400 cited. Optionality goes in the TYPE, not here."""
    bad = {}
    for path, node in _objects(_schema()):
        missing = sorted(set(node["properties"]) - set(node.get("required") or []))
        if missing:
            bad[path] = missing
    assert not bad, (
        "strict mode rejects a schema whose `required` omits any property. "
        f"Offenders: {bad}. Make the field nullable (type: [\"x\",\"null\"]) and "
        "add it to `required` — do not drop it from `required` to make it optional."
    )


def test_additional_properties_is_false_at_every_level():
    bad = [p for p, n in _objects(_schema()) if n.get("additionalProperties") is not False]
    assert not bad, f"strict mode requires additionalProperties:false. Offenders: {bad}"


def test_the_fields_that_broke_it_are_nullable_rather_than_absent():
    """A REGRESSION ANCHOR ON THE SPECIFIC BUG, not just the general rule.

    Someone re-reading `file` as mandatory would either force the model to
    invent a path for a finding that has none, or reach for the exact fix that
    caused the outage. Both are worth failing for by name."""
    items = _schema()["properties"]["critical_findings"]["items"]
    for field in ("file", "line"):
        spec = items["properties"][field]
        assert isinstance(spec.get("type"), list) and "null" in spec["type"], (
            f"critical_findings.items.{field} must be NULLABLE — a finding need not "
            f"anchor to one file or line. Got type={spec.get('type')!r}."
        )
        assert field in items["required"], \
            f"{field} is nullable but still must appear in `required` under strict mode"


def test_validate_agrees_with_the_schema_it_is_handed():
    """`_validate` reads schema['required']. If the root `required` grew, the
    validator must still accept a well-formed response — otherwise fixing the
    API error would trade a 400 for a local refusal."""
    import sys
    sys.path.insert(0, str(ROOT / "tools"))
    import independent_review as IR

    schema = _schema()
    ok = {k: [] for k in schema["required"]}
    ok["verdict"] = schema["properties"]["verdict"]["enum"][0]
    ok["reasoning_summary"] = "n/a"
    ok["required_actions"] = ["something"] if ok["verdict"] in (
        "BLOCK", "ACCEPT_WITH_REQUIREMENT") else []
    IR._validate(ok, schema)          # must not raise

    # `_validate` refuses with SystemExit, which is a BaseException and is NOT
    # caught by `except Exception`. Getting that wrong here would have made this
    # arm report a validator failure while the validator was working — the same
    # false-alarm shape the rest of this audit keeps removing.
    missing = {k: v for k, v in ok.items() if k != "critical_findings"}
    try:
        IR._validate(missing, schema)
    except SystemExit:
        pass
    else:
        raise AssertionError("_validate accepted a response missing a required key")
