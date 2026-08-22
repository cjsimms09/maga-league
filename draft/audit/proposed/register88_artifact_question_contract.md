# REGISTER 88 — what each artifact should say about itself, and the guard that enforces it

**Session D, 2026-08-22.** Answers A's ask: *"what should each artifact say
about itself so this cannot recur?"* — after `replay_league_table.json`
(Cory −9.39) and `engine_seat_replay.json` (−188.35) were read as the same
measurement in `CLAUDE.md`, `OWNERS.md` and two `ROUTES.md` entries, for days.

**Built and wired:** `draft/tests/test_artifact_questions.py` (7/7), which runs
inside the existing `pytest draft/tests` gate — no workflow change needed.
**Proposed, and NOT applied:** the two field additions below live in A's
producers (`replay_all_seats.py`, `replay_seats_grade.py`) and are A's to make.

---

## 1 · NOT `supersedes` — and this was checked, not assumed

A's instinct was *"a single `supersedes` / `answers_question` field on each."*
The second half is right. **The first half is wrong for this pair**, and the
evidence is in the artifacts:

* `replay_league_table.policy_tested` — *"BPA-by-VORP, caps QB2/RB7/WR7/TE2,
  starter-feasibility rail … own_v6_nomarket"* — a **hand-written selection
  policy over projections**.
* `engine_seat_replay.board_arms` / `_note` — *"the shipped
  engine.js/survival.js (MEASURED_WEIGHTS)"* — **the tool itself**.

Different objects. **Neither replaces the other**, so a `supersedes` edge would
license deleting the proxy, or reading −188.35 as a *correction* of −9.39. It
corrects nothing. It measures something else.

**The asymmetry is what actually did the damage, and it is worth stating:**
`engine_seat_replay` already carries `proxy_context_quoted` — it knew about the
proxy. The proxy pointed nowhere. **And the proxy is the one `CLAUDE.md` read.**
Any rule satisfied by one side would not have caught this.

## 2 · THE CONTRACT — three fields, one required

| field | meaning |
|---|---|
| `_answers` | a short normalized key for the **question**, never the method. Sharing a key is a claim to answer the same thing. |
| `_measures` | **the object measured.** This field alone would have stopped the misread. |
| `_not_the_same_as` | `{other_artifact: why}` — required from **every** member of a shared-key group, naming **every** other member. `_superseded_by` satisfies it for the case where one artifact really does replace another. |

**Opt-in by design:** an artifact with no `_answers` is ignored, so this cannot
become a tax on every JSON in the repo.

## 3 · VERIFIED ON THE REAL PAIR, not only on fixtures

| state | violations |
|---|---|
| both declare `_answers`, neither links — **register 88's exact state** | **2** |
| both carry `_not_the_same_as` per §4 | **0** |

The checker also has six fixture controls, including the **one-sided** case
(the real shape: engine names proxy, proxy names nothing) which must still fail
— a rule satisfied by one side is not a rule.

⚠️ **The live test is INERT until A applies §4.** No artifact declares
`_answers` today, so `test_no_two_LIVE_artifacts_answer_the_same_question_in_silence`
passes vacuously. Saying so plainly, because a guard that passes for want of
subjects is exactly the thing this project keeps catching.

## 4 · THE PROPOSED ADDITIONS

Both keys go in the producing tools, so a regeneration keeps them.

**`replay_all_seats.py` → `replay_league_table.json`:**

```json
"_answers": "does our drafting beat the league's owners, in their own seats",
"_measures": "a HAND-WRITTEN selection policy (BPA-by-VORP, caps QB2/RB7/WR7/TE2, starter-feasibility rail) over own_v6_nomarket projections — NOT engine.js",
"_not_the_same_as": {
  "engine_seat_replay.json": "that one measures the SHIPPED engine.js at MEASURED_WEIGHTS; this one measures a proxy policy over projections. Neither supersedes the other and the numbers are not comparable: this file's realistic arm reports Cory -9.39, that file's preregistered primary reports -188.35. Quoting this one as 'the tool' is register 88."
}
```

**`replay_seats_grade.py` → `engine_seat_replay.json`:**

```json
"_answers": "does our drafting beat the league's owners, in their own seats",
"_measures": "the SHIPPED engine.js/survival.js at MEASURED_WEIGHTS, era-appropriate bundles",
"_not_the_same_as": {
  "replay_league_table.json": "that one measures a hand-written BPA-by-VORP proxy policy over own_v6_nomarket projections, not the shipped engine. Its -9.39 is not a weaker version of this file's -188.35; it is a different estimand."
}
```

## 5 · WHAT THIS DOES AND DOES NOT FIX

**Does:** the next reader who opens either file is told, in the file, that a
second artifact answers the same English question and why the numbers differ.
The next *fourth copy* of the misquote fails the build instead of shipping.

**Does not:** it cannot stop a document quoting a number without opening the
artifact at all — which is how this one travelled. That is a prose problem and
the register is the place for it.

`SEND BACK` is a complete answer if the key should be phrased differently — the
wording of `_answers` is the one part I would expect A to change, since A owns
both producers.
