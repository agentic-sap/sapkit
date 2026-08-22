# Data Extraction Policy

**MANDATORY for all sc4sap agents, skills, and direct Claude sessions.** It applies as soon as row-level data is about to be read out of an SAP system.

## Core Rule

Before any call to the MCP tools listed here:

- `GetTableContents`
- `GetSqlQuery`
- `GetTableContents` via composed tools
- Any tool that hands back row data from SAP

You MUST:

1. **Identify every table referenced** in the request (a direct table name, tables sitting inside a JOIN, the underlying tables of a CDS view / SQL query).
2. **Check [`table_exception.md`](table_exception.md)** (it sits in the same folder).
3. Should **any** referenced table match the blocklist — exact name, family pattern such as `PA*`, or a customer-specific Z-pattern — **refuse the extraction**.

## Actions: `deny` vs `warn`

Each blocklist category carries an **action**, defaulting to `deny`:

- **`deny`** — hard block. Refuse the call, show the refusal template below, offer alternatives. The extraction does **not** happen.
- **`warn`** — soft block. The call is allowed to proceed, but you MUST:
  1. Surface a clear warning to the user *before* the data is returned (category + reason)
  2. Recommend the safer alternatives (CDS view, anonymization, aggregates)
  3. Log that the user was informed
  Two sections default to `warn` — **Protected Business Data** (VBAK/BKPF/ACDOCA etc.) and **Customer-Specific PII Patterns** (Z-tables) — because legitimate daily use is common in both.

Let a query touch **any** `deny` table and the entire call is blocked, whatever warn-tier tables are also present.

## Refusal Template

When the call is blocked (deny), answer the user with:

```
❌ Data extraction blocked.

Table(s): {TABLE_NAMES}
Category: {CATEGORY from table_exception.md — e.g., "HR Payroll", "Banking/Payment"}
Reason: {WHY column from table_exception.md}

Allowed alternatives:
- Released CDS view with PII masking (I_*)
- Anonymized test data from QAS/SANDBOX
- Count/aggregate only (COUNT, SUM)
- Explicit one-off approval: write `.sapkit/data-access-approval-{YYYYMMDD}.md`
  with business justification and have the user confirm.
```

Do **not** silently comply. Do **not** debate the policy — put the block in front of the user, offer the alternatives, let the user choose.

## Scope of What's Blocked

- **Row data**: a `SELECT` against a blocked table, whole or partial.
- **Sampling**: blocked even at `UP TO 1 ROWS` or `LIMIT 10`.
- **Joined reads**: where a join/view touches a blocked table, the whole query is blocked — unless what the blocked table contributes is only metadata keys (e.g., counts).
- **Indirect reads**: function modules that `SELECT` from blocked tables internally (e.g., `BAPI_USER_GET_DETAIL` → USR02-family) — the same policy applies.

## Scope of What's Allowed

- **Schema / DDIC metadata**: `GetTable`, `GetStructure`, `GetView` (the structural definition), `GetDataElement`, `GetDomain` — always OK.
- **Existence checks**: `SearchObject` — always OK.
- **Field catalog extraction** through `cl_salv_table=>factory` over a **locally typed** internal table (no SELECT at all) — always OK.

## Reading the Response — the aggregate alternative always reports `truncated: true`

The safe alternative this policy itself recommends (`COUNT` / `SUM` in place of row extraction) walks straight into a `GetSqlQuery` response trap, so take it in here rather than meeting it mid-analysis:

- A **row-collapsing** query — `SUM` / `COUNT` / `AVG` with no `GROUP BY`, and `DISTINCT` just as much — comes back with `truncated: true` **even when the result is complete**. The total the server reports counts the rows `WHERE` matched, not the rows handed back, and `truncated` is derived as `server_total_rows > returned_row_count`. Any population larger than one row therefore trips it permanently, however high `row_number` is set.
- Judge completeness from `returned_row_count` measured against what the query is able to produce (an aggregate is one row by construction). Read the flag as "the total was cut off" and a correct figure turns into a false discrepancy — and a figure obtained under this policy is usually the one a decision rests on.
- `total_rows` still means something on such a query: it is the **population size**, which is often the number you were after anyway.

A related shape: `GetSqlQuery` fails with HTTP 400 once an `OR` chain runs past roughly 6–7 terms. HTTP 400 out of this tool is generic — a missing table, a missing field, and an unsupported aggregate all present identically — so never read one 400 as "the table is blocked" or "the object does not exist". Break the query into prefix `LIKE` scans instead.

The full detail, along with the other tool-response traps: [troubleshooting](../../procedures/troubleshooting.md) § 8.

## ⚠️ The `acknowledge_risk` Parameter — HARD RULE

`GetTableContents` and `GetSqlQuery` both take an `acknowledge_risk: true` parameter, and it bypasses the MCP server's L4 "ask"-tier confirmation gate. **This flag is an audit boundary, not a convenience flag.** Its value goes to stderr in the log and stands as an attestation that the user has granted per-request authorization.

**Agents MUST comply with these rules without exception:**

1. **Never set `acknowledge_risk: true` on the first call.** That first call must leave the flag out (or set it `false`) so the hook/server gets to gate the request.
2. **If the response is `ask` / "user confirmation required"** — STOP. Do not retry. Put the refusal reason in front of the user verbatim, together with the table name and category.
3. **Ask an explicit yes/no question** naming the exact tables and scope, e.g.:
   > ⚠️ `ACDOCA` (Protected Business Data) requires explicit authorization to extract rows. Proceed with `acknowledge_risk=true`? **(yes / no)**
4. **Only retry with `acknowledge_risk: true` after an explicit affirmative keyword has come back** from the user:
   - Accept: `yes`, `y`, `authorize`, `authorized`, `approve`, `approved`, `proceed`, `go ahead`, `confirmed`
   - Reject (NOT authorization): `pull it`, `try it`, `test it`, `grab it`, `just do it`, `I was wrong`, `my mistake`, silence, `why?`, or any ambiguous imperative. What those describe is the *task*, not *consent*.
5. **Authorization is per-request.** It carries across no table, no call, and no session. Each new `ask` requires a new confirmation.
6. When in doubt: **stop and ask**. A user surprised to find their data pulled without consent is a policy failure; one extra question is not.

The `acknowledge_risk` flag exists because some protected data does have legitimate use cases (e.g., an analyst reviewing their own company-code postings). It must not turn into a rubber stamp.

## Authorization Override

A blocked extraction may be authorized per-task where the business need is real and documented. To authorize:

1. Create `.sapkit/data-access-approval-{YYYYMMDD-HHMM}.md` carrying:
   - Tables to be accessed
   - Business justification
   - Data retention / disposal plan
   - User sign-off (name + date)
2. The agent re-reads that file ahead of the specific call and logs the approval ID in its output.

An approval covers **one session and one scope** — it is not a permanent bypass.

## Defense Layers

This policy forms one of four enforcement layers:

1. **L1 (this file)** — the agent/skill instruction level
2. **L2 (`sc4sap/CLAUDE.md`)** — a global directive loaded into every Claude session
3. **L3 (`PreToolUse` hook at `scripts/hooks/block-forbidden-tables.mjs`)** — programmatic interception inside Claude Code
4. **L4 (MCP server upstream)** — the hardcoded blocklist in `mcp-abap-adt` (roadmap)

L3/L4 being in place does not excuse L1: agents MUST still follow it — L1 is what produces the user-facing refusal carrying category and alternatives, and the hook/server cannot produce that cleanly.

## Adapter Support for the Per-Request Gate (P2)

"Policy permits an authorized extraction" and "this adapter mechanically
brokers the per-request gate" are two different statements. Keep them apart:

- **Claude** — the L3 `PreToolUse` hook brokers the `acknowledge_risk` gate;
  per-request approval (P2) is supported.
- **Codex** — `GetTableContents` / `GetSqlQuery` are hard-disabled in the exposition,
  so row-data extraction is **unsupported** rather than "approvable". Do not try to broker
  approval where the tool is disabled.
- **Antigravity** — the `excludeTools` path for these tools is **unverified** on the
  current version, so treat P2 as **unsupported** until it has been measured.

None of this relaxes the row-data blocklist above; it records where the per-request
approval is mechanically available, nothing more. The full adapter matrix is finalized in the
2026-07-16 roadmap S5-B.
