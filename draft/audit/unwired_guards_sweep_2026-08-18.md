# I FOUND "A GUARD WRITTEN BUT NOT WIRED" TWICE IN A DAY, SO I SWEPT FOR THE REST

**Relay, 2026-08-18. The headline is a NULL, and the interesting part is why the
first count was wrong.**

---

## 1 · WHY

Two rows closed today on the same shape:

- **28** — `proj_ceiling_source` existed to let a consumer tell a measured
  dispersion from a Gaussian fallback. **Nothing read it** until today's 4v fix.
- **35** — `board_input_staleness.js` existed, with 14 tests including a control
  proving it discriminates. **Nothing ran it against the live board.**

Rule 3g asks whether a finding implies another failure nobody has looked for.
Twice is a pattern. So: **which other guards exist and are never invoked?**

---

## 2 · THE FIRST ANSWER WAS WRONG, AND IT WAS WRONG IN A WAY WORTH RECORDING

The obvious sweep — *154 tools in `draft/tools/`, how many are referenced by a
workflow?* — returns a large and alarming number of zeros.

**That number is a category error and I nearly reported it.** Most of
`draft/tools/` is one-off analysis: `barbell_variance_probe`, `boundary_walk`,
`normalisation_probe`, `position_dropoff`. A probe is *supposed* to be run by
hand once and never again. Counting it as an unwired guard manufactures a crisis
out of the tool directory doing its job.

**The narrow question is the real one:** which tools are shaped like GUARDS —
`*check*`, `*verify*`, `*guard*`, `*gate*`, `*parity*` — and are never invoked?

That list is fourteen long, and nine are already wired.

---

## 3 · THE FIVE UNWIRED GUARD-SHAPED TOOLS, AND THE NULL

| tool | workflows | tests | exits non-zero? | ran today |
|---|---|---|---|---|
| `decisions_drift_check.js` | 0 | 0 | **yes (1 path)** | exit 0, **3 flags** |
| `vacuous_check_scan.py` | 0 | 4 | **no** | exit 0 |
| `onesie_history_check.js` | 0 | 1 | **no** | exit 0 |
| `verify_lore.py` | 0 | 0 | **no** | exit 0 |
| `verify_owner_signatures.py` | 0 | 0 | **no** | exit 0 |

**I ran all five. Every one exits 0.** So the pattern does **not** generalise into
a pile of hidden breakage, and saying so plainly matters more than the two rows
that started this — a sweep that finds nothing is a result, not a failure.

**⚠️ AND FOUR OF THE FIVE CANNOT FAIL AT ALL.** Zero non-zero exit paths between
them. They are **REPORTS wearing guard names**. Wiring them into CI would add a
step that is green by construction — a decorative gate, which is worse than no
gate, because it looks like coverage.

**So the naming is the defect here, not the wiring.** `verify_lore.py` and
`verify_owner_signatures.py` do not verify anything in the sense that word
carries everywhere else in this repo, where `*_check` means *fails the build*.
An hour of mine went into treating them as unwired guards. The next reader's
will too.

**One exception worth naming:** `vacuous_check_scan.py`'s own text says *"The
COUNT is the thing to ratchet."* It was **designed** to be ratcheted and has no
exit path to ratchet with. That is a guard that is half-built, not a report.

---

## 4 · THE ONE REAL GUARD, AND IT IS REPORTING RIGHT NOW

`decisions_drift_check.js` has a failure path, is not wired, and today says:

```
3 of 21 entries flagged for manual re-check.
```

- **entry 2** — claims `value ~0.1`; live `MEASURED_WEIGHTS.value` is **1**
- **entry 3** — claims `stack ~0.5` and `value ~0.15`; live are **1** and **1**
- **entry 7** — quotes cron `40 14 * * 0`, **found in no current workflow**

### AND THESE ARE NOT THREE THINGS. THEY ARE ONE, AND I HIT IT FOUR TIMES TODAY.

`stack ~0.5` is not a typo. **It is the pre-ruling value** — the same 0.5 sitting
in `draft/baseline/v1.json`, which is register **5g**. Every instance is the same
mechanism:

> **A weight ruling ships, and the prose that quotes the old number is never
> updated.**

Four instances, today alone:

1. **`CLAUDE.md`** said the `ceiling` weight *"is held at zero through the
   draft"*. It has been **0.45** since `09f94f99`. Corrected.
2. **`A-DRAFT-DAY-DECISIONS.md` C2** said the same. Struck.
3. **`DECISIONS` entries 2 and 3** quote `value ~0.1`, `value ~0.15`,
   `stack ~0.5`. All three superseded.
4. **`draft/baseline/v1.json`** carries `ceiling: 0` and `stack: 0.5` — and the
   war room's restore button is pinned to it, so one tap reverts two rulings
   (**5g**, filed today).

**The cost is not tidiness.** Instance 1 nearly made me file the live 0.45 as a
defect *against the documentation*; the only thing that stopped me was running
`git log -L` on the constant first. **A stale doc that contradicts shipped code
manufactures false findings** — the same shape as the
`nflverse_weekly_points_2022.json` sentence that appeared in three files and was
false in all three.

---

## 5 · WHAT I AM NOT DOING, AND WHY

**Not wiring `decisions_drift_check.js` as-is.** It exits 0 while flagging three
entries, so a CI step would print warnings into a green run — which is precisely
how the `proj_series` PARTIAL warning went unread for eight days. **A guard needs
a ratchet, not an invocation.** The flagged count is the number to baseline, the
same shape `routes_response_check.js` already uses.

**Not wiring the four report tools.** A green-by-construction step is worse than
none.

**Not renaming them either** — four files, their callers and their tests, for a
clarity win, three days before a draft. It goes in the register.

---

## 6 · RULE 3g

**Does this imply another failure we have not looked for?** The sweep says no for
guards — all five pass. But it found a naming convention that is not enforced:
`*_check` means *fails the build* everywhere except these four, and nothing
guarantees that.

**Does it invalidate something we already trust?** No number. It corrects my own
implied claim from rows 28 and 35 — I closed both saying "a guard written but not
wired", and the sweep shows that is **two real instances, not a systemic rot.**
Worth saying, because the alternative was leaving a scarier impression than the
evidence supports.

**Is it routed to the lane that can act?** The weight-propagation mechanism is
filed as its own row; the four instances are already corrected or filed.

---

*Guard-shaped tools swept: 14. Wired: 9. Unwired: 5. Silently failing: 0.*
