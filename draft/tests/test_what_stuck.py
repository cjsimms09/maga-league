# TERRITORY: A
"""WHAT-STUCK.md is Cory's plain-English page. Every entry cites the register
or ledger row that holds its numbers; a citation that resolves to nothing is a
story, and this fails on it. It also fails if the page has no STUCK section —
a page with nothing on it is the loop quietly ending."""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _ids(kind, text):
    return set(re.findall(r"^\| " + kind + r"(\d+) \|", text, re.M))


def test_every_cited_row_exists():
    page = (ROOT / "WHAT-STUCK.md").read_text()
    reg = _ids("", (ROOT / "DEFECT-REGISTER.md").read_text())
    led = _ids("P", (ROOT / "PREDICTION-LEDGER.md").read_text())
    asks = set(re.findall(r"^\| (A\d+) \|", (ROOT / "CORY-ASKS.md").read_text(), re.M))
    cited_reg = set(re.findall(r"registers? (\d+(?:, \d+)*)", page))
    cited_reg = {x for grp in cited_reg for x in grp.split(", ")}
    cited_led = set(re.findall(r"\bP(\d{2,3})\b", page))
    cited_asks = set(re.findall(r"CORY-ASKS (A\d+)", page))
    assert cited_reg and cited_led
    assert cited_reg <= reg, sorted(cited_reg - reg)
    assert cited_led <= led, sorted(cited_led - led)
    assert cited_asks <= asks, sorted(cited_asks - asks)


def test_the_page_has_stuck_and_running_sections():
    page = (ROOT / "WHAT-STUCK.md").read_text()
    assert "## ✅ STUCK" in page and "## ❌ DID NOT STICK" in page and "## ⏳ STILL RUNNING" in page
    assert page.count("### ") >= 5
