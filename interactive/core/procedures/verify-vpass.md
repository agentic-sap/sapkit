---
name: verify-vpass
description: Run the V-PASS completion-evidence chain (source read-back · active-state · unit · ATC) with tools/vpass/vpass.mjs against an object already applied to SAP, and report the verdict in plain language — the completion stamp behind "V-PASS", "검증해줘", "완료 도장 찍어줘", "완료 확인", "verify object", "completion stamp" requests. An MCP write success alone is only PROVISIONAL_WRITE (D-025); V-PASS is the machine-verified half of COMPLETE, and still needs a separate R-PASS review.
---

# Verify (V-PASS)

Human-usable front door to [tools/vpass/vpass.mjs](../../tools/vpass/vpass.mjs).
The raw invocation is a long node command with flags the user should not have
to type or remember — this procedure assembles it, runs it, and translates the
verdict record into a plain-language report.

## Purpose

The applying tool's success response is not completion evidence: an MCP
`Create*`/`Update*` call succeeding, `ActivateObjects` returning ACTIVE, or an
empty `GetInactiveObjects` all mean the object is `PROVISIONAL_WRITE`, not done
(D-025 Track A Policy contract — see `AGENTS.md` and the "Completion state"
sections of [create-program](create-program.md#phase-8--completion-report),
[create-object](create-object.md), [modify-object](modify-object.md)). V-PASS
is one of the two stamps completion needs: an independent oracle (the `vsp`
CLI) reads the object back out of SAP and re-derives evidence — source
read-back, an active-state concordance inference, ABAP Unit, and ATC — instead
of trusting the applying side's own report. It never writes to SAP.

## Use When

- User says "V-PASS", "검증해줘", "완료 도장 찍어줘", "완료 확인", "verify
  object", "verify this program/class", "completion stamp", "is this done".
- An object was just created or modified this session (via MCP, human `vsp
  deploy`, or user-operated abapGit) and its completion state needs checking.
- Following up after `create-program` / `create-object` / `modify-object` left
  an object at `PROVISIONAL_WRITE`.

## Do Not Use When

- Nothing has been applied to SAP yet — this procedure only reads back what
  already exists; route to [create-object](create-object.md),
  [create-program](create-program.md), or [modify-object](modify-object.md)
  first.
- The user wants the *other* completion stamp, the exact-subject fresh-context
  review (`R-PASS`) — that is a Guided run / `review-checklist.md` concern,
  not this procedure.
- Real row/business data is needed — out of scope; this chain never reads
  table contents.

## Policy

- **Read-back / active-state / ATC are P1 connected-read** (AGENTS.md) — no
  per-call approval needed, an agent may run them for the user.
- **The unit step is P3** (ABAP Unit executes code) — DEV tier only. The
  runner itself resolves the tier and fails that one step closed on anything
  else; nothing extra to enforce here.
- **Fresh-context reviewer session → always pass `--skip-unit`**, keeping the
  run purely P1 (matches the runner's own reviewer-profile exclusion).
- **Zero writes to SAP.** The runner exports `SAP_READ_ONLY=true` into every
  child process it spawns; the only thing this procedure writes locally is the
  verdict record under `.sapkit/vpass/`.
- **Trust the runner's own policy header and verdict logic** — do not
  re-interpret or override its tier/classification decisions.

## Procedure

① **Determine the target — never guess.** If the invocation names an object
   (TYPE + NAME, or a name the type can be inferred from), use it. Otherwise
   look for candidates, in order: the object just created/modified earlier in
   this conversation; `.sapkit/program/{PROG}/state.json` and
   `review-request.json` (`objects[]` — map SAP ADT notation to vpass TYPE
   codes: `PROG/P`→`PROG`, `PROG/I`→`INCL`, `CLAS`→`CLAS`, `INTF`→`INTF`,
   `FUGR`→`FUGR`; `DYNP`/`CUAD`/text elements have no vpass coverage — say so,
   do not silently drop them); an existing `.sapkit/vpass/` record's target,
   for a "verify again" request. **Present the candidate(s) and get an
   explicit confirmation before running** — even with exactly one candidate —
   because this run makes a live SAP connection and takes real time.

② **Determine `--source-dir`.** Tell the user plainly: without it, the runner
   has nothing to compare the SAP-served source against, and the verdict caps
   at `INCOMPLETE` — it can never reach `V-PASS`. Look for a local source
   folder near the object's other artifacts (an abapGit-style checkout, a
   workspace directory the user mentioned) before asking. If none exists (a
   session that only ever used MCP against SAP directly has no local copy),
   say so and ask the user to either point at a source folder or accept the
   `INCOMPLETE` cap before proceeding — do not run silently under that cap.

③ **Resolve the tool and run.** Prefer
   `$CLAUDE_PLUGIN_ROOT/tools/vpass/vpass.mjs`; if the installed plugin cache
   does not ship `tools/`, fall back to the in-repo path
   `interactive/tools/vpass/vpass.mjs`; if neither exists, downgrade to
   guidance — tell the user plainly and give them the command to run by hand
   (same downgrade pattern as [setup](setup.md#step-3--permission-template-claude-code-only)
   Step 3). Then run:

   ```
   node "<resolved-path>" --source-dir <dir> <TYPE> <NAME> [<TYPE> <NAME> ...]
   ```

   Chain additional `<TYPE> <NAME>` pairs for more than one object (or a
   `--manifest` file per `--help` — the common case is one object). Add
   `--skip-unit` per the Policy section above when acting as/for a
   fresh-context reviewer. Never add anything else — there is no write flag to
   add.

④ **Report the result in plain language, localized to the user's
   conversation language.** Read the newest file the run just wrote under
   `.sapkit/vpass/`. For each object:
   - Headline verdict — `V-PASS` / `V-FAIL` / `INCOMPLETE` / `ENV_BLOCKED` —
     stated plainly (e.g. "검증 통과", "검증 실패", "증거 불완전", "SAP 접속
     문제로 확인 못 함").
   - One line per step (source read-back, active-state, unit, ATC): what it
     checked and whether it passed, skipped, or failed — no jargon dump of the
     raw JSON.
   - If not `V-PASS`: name the failure class in plain terms — `LOCK` ("다른
     세션이 잠그고 있음, 나중에 재시도"), `ENV` ("연결/환경 문제, 코드 결함
     아님"), `TOOL` ("이 도구가 이 객체 유형을 다루지 못함"), `CODE` ("실제
     코드/객체 문제로 확인됨") — plus the concrete next action.
   - Summarize `limits[]` in 1–2 lines as "이 도장이 보증하지 않는 것":
     syntax/activation evidence is indirect (a concordance inference, not a
     fresh check) and the result is a point-in-time snapshot, not a live
     guarantee. Do not enumerate every item verbatim.

⑤ **Even a `V-PASS` is not the whole story.** Close by stating that completion
   still needs the separate exact-subject fresh-context review (`R-PASS`) —
   this procedure never substitutes for it (see the "Completion state"
   sections linked in Purpose above).
