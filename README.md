<p align="center">
  English | <a href="README.ko.md">한국어</a>
</p>

# SAPKIT

An AI plugin for SAP ABAP development and consulting. Install it and the AI connects to your
SAP system directly — reading source, writing code, digging through dumps, and producing specs.

It works the same way in Claude Code, Codex CLI, and Antigravity.

## What it does

**Building**

- `/sapkit:create-program` — a report, an ALV, a batch program: it starts from a requirements
  interview, writes the spec, and puts code into SAP **only after a human approves**. It builds
  in Main+Include structure, and once it is done a separate session reviews it.
- `/sapkit:create-object` · `/sapkit:modify-object` — create or change a single object such as
  a class, a table, or a CDS view. For a small edit the latter is lighter.

**Reading and understanding**

- `/sapkit:program-to-spec` — reads someone else's ABAP program backwards into a
  functional/technical spec. Comes out as Markdown or Excel.
- `/sapkit:package-to-process` — walks a whole CBO package and recovers the business flow
  (purchase requisition → purchase order → goods receipt → invoice, that kind of thing), and
  draws the process map for you as well.
- `/sapkit:compare-programs` — compares two or three programs that do similar work and shows
  what differs about them in business terms. The MM version and the CO version, the Korean
  version and the European version, that sort of thing.
- `/sapkit:analyze-code` — code review. It looks from 14 angles and rates each finding by
  severity.

**When something goes wrong**

- `/sapkit:analyze-symptom` — digs through dumps, logs, transport history, and where-used to
  narrow down the cause. It asks only what it needs and gives you SAP Note search keywords too.
- `/sapkit:ask-consultant` — ask it the way you would ask a module consultant. It answers
  against your system's version, industry, and country settings.

**Wrapping up**

- `/sapkit:release` — transport request release. It checks the pre-release conditions and hands
  it over.
- `/sapkit:handoff` — writes down how far you got today into the project folder. The next
  session reads that and carries on.

Type `/sapkit:` for the full list.

## Install

**Claude Code**

```text
claude plugin marketplace add agentic-sap/sapkit
claude plugin install sapkit@agentic-sap --scope user
```

Open a new session or run `/reload-plugins`, then run `/sapkit:setup`.

**Codex CLI**

```text
codex plugin marketplace add agentic-sap/sapkit
codex plugin add sapkit@agentic-sap
```

Then `$sapkit:setup` in a new session.

`setup` walks you through the SAP connection settings in conversation. You put the password
into the file yourself, and the plugin does not record that value anywhere. **Even without a
connection**, the knowledge and consulting features work right away.

The MCP server that connects to SAP is inside the plugin. There is nothing to download or
register separately.

## Safety by default

SAP is hard to undo once you get it wrong. So the following are not settings — they are the
**default behavior**.

- **Writes go to DEV systems only.** If your connection settings say QA or production, create,
  update, and activate requests are refused at the server. If the tier cannot be determined,
  they are blocked as well.
- **Table data reads are approved one at a time.** Protected tables are refused by the server
  first, and that floor opens only when you write it into your connection settings file
  yourself. There is no open path for running them in a batch or handing them to a subagent.
- **A "saved" response is not taken at face value.** After anything is written to SAP, the
  source is read back and compared against what was sent. It counts as done only once that
  comparison and a separate session's review are **both** finished.
- If a transport request is needed somewhere and it is missing, you are told.

An offline ABAP checker is included too, so you can check code locally without connecting
to SAP.

## Picking up where you left off

SAP work does not finish in a day. Run `/sapkit:handoff` and it leaves `HANDOFF.md` (where
things stand) and `RUN-PLAN.md` (what to do in what order) in the project folder. For each
object it writes down **what was only sent to SAP** separately from **what was read back and
confirmed**, so the next session knows how far it can trust things.

If you already keep files by those names, there is nothing to worry about. sapkit touches only
the files it set up itself, and a file without that mark is neither read nor changed.
Conversely, remove that mark and it stops touching the file from then on.

## Update

```text
claude plugin marketplace update agentic-sap
claude plugin update sapkit@agentic-sap
```

For Codex, run `codex plugin marketplace upgrade agentic-sap` and then `codex plugin add`
again. Either way, a restart is needed for it to take effect.

## When something is wrong

`/sapkit:troubleshooting` walks you through connection problems step by step. If that still
does not do it, run `node "<plugin path>/scripts/doctor.mjs"` and file what it prints as an
issue.

## More

- [Plugin guide](interactive/README.md) — structure and design
- Per-harness guides:
  [Claude Code](interactive/adapters/claude/README.md) ·
  [Codex](interactive/adapters/codex/README.md) ·
  [Antigravity](interactive/adapters/antigravity/README.md)

## Acknowledgments

SAPKIT started from [superclaude-for-sap](https://github.com/babamba2/superclaude-for-sap)
by Paek Seunghyun (babamba2). The knowledge base, the personas, the procedures, and the
philosophy that a human approves and SAP verifies all began there. Most of it has since been
re-authored, but the structure is still the one that project laid down.

The MCP server is built on [abap-mcp-adt-powerup](https://github.com/hjaewon/abap-mcp-adt-powerup),
our fork of Paek Seunghyun's customized server, and underneath it on the ADT-over-MCP work of
[mcp-abap-adt](https://github.com/fr0ster/mcp-abap-adt) by fr0ster, which itself descends from
mario-andreschak's original. The engine shipped today
was written from scratch, but which tools exist and what each one exchanges with SAP was
settled by those two projects first.

The offline ABAP checker inherits its rules and verdicts from
[vibing-steampunk](https://github.com/oisee/vibing-steampunk) by Alice Vinogradova and,
through it, from [abaplint](https://github.com/abaplint/abaplint) by Lars Hvam Petersen.

The superclaude-for-sap notice is kept in [`interactive/LICENSE`](interactive/LICENSE). What was
inherited from each project and what was rewritten, together with their licenses, is recorded in
[THIRD_PARTY_NOTICES](interactive/THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE) © 2026 Hong Jaewon
