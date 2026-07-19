# Data Extraction Policy

**MANDATORY for all AI agents and direct sessions.** Applies whenever row-level data is about to be read from an SAP system.

## Core Rule

Before calling any of the following MCP tools:

- `GetTableContents`
- `RunQuery`
- Any tool that returns row data from SAP

You MUST:

1. **Identify every table referenced** in the request (direct table name, tables inside a JOIN, underlying tables of a CDS view / SQL query).
2. **Check the blocked-table categories below** (plus any project-specific blocklist the user maintains).
3. If **any** referenced table matches a blocked category (exact name, family pattern like `PA*`, or customer-specific Z-pattern): **refuse the extraction**.

## Blocked-Table Categories

Each category has an **action** (default `deny`):

| Category | Examples | Action |
|----------|----------|--------|
| HR / Payroll | `PA*` (PA0002, PA0008, PA0009), `HRP*`, payroll clusters | deny |
| Credentials / Authentication | `USR*` (USR02), `USH*` | deny |
| Banking / Payment | `BNKA`, `LFBK`, `KNBK`, `REGUH`, `REGUP` | deny |
| Tax / National IDs | Tax-ID bearing master data fields | deny |
| Protected Business Data | `VBAK`, `BKPF`, `ACDOCA` (full-row extraction) | warn |
| Customer-Specific PII Patterns | Z-tables holding personal data | warn |

- **`deny`** — hard block. Refuse the call, show the refusal template below, offer alternatives. Extraction does **not** happen.
- **`warn`** — soft block. The call may proceed, but you MUST:
  1. Surface a clear warning to the user *before* returning the data (category + reason)
  2. Recommend the safer alternatives (CDS view, anonymization, aggregates)
  3. Log that the user was informed

  Protected Business Data and Customer-Specific PII Patterns default to `warn` because legitimate daily use is common there.

If a query touches **any** `deny` table, the entire call is blocked regardless of warn-tier tables present.

## Refusal Template

When blocked (deny), respond to the user with:

```
❌ Data extraction blocked.

Table(s): {TABLE_NAMES}
Category: {CATEGORY — e.g., "HR Payroll", "Banking/Payment"}
Reason: {why this table is protected}

Allowed alternatives:
- Released CDS view with PII masking (I_*)
- Anonymized test data from QAS/SANDBOX
- Count/aggregate only (COUNT, SUM)
- Explicit one-off approval: write a data-access-approval note
  with business justification and have the user confirm.
```

Do **not** silently comply. Do **not** argue policy — surface the block, offer alternatives, let the user choose.

## Scope of What's Blocked

- **Row data**: full or partial `SELECT` against a blocked table.
- **Sampling**: even `UP TO 1 ROWS` or `LIMIT 10` is blocked.
- **Joined reads**: if a join/view touches a blocked table, the whole query is blocked unless the blocked table contributes only metadata keys (e.g., counts).
- **Indirect reads**: function modules that internally `SELECT` from blocked tables (e.g., `BAPI_USER_GET_DETAIL` → USR02-family) — same policy.

## Scope of What's Allowed

- **Schema / DDIC metadata**: `GetTable` and other structural-definition reads — always OK.
- **Existence checks**: `SearchObject` — always OK.
- **Field catalog extraction** via `cl_salv_table=>factory` on a **locally typed** internal table (no SELECT at all) — always OK.

## ⚠️ Risk Acknowledgement / Confirmation Gates — HARD RULE

If the MCP server or a hook exposes a risk-acknowledgement parameter or an "ask"-tier confirmation gate for row-data reads, that gate **is an audit boundary, not a convenience flag**. Setting it represents an attestation that the user has granted per-request authorization.

**Agents MUST follow these rules without exception:**

1. **Never pre-acknowledge risk on the first call.** The initial call must go through the gate so the request can be reviewed.
2. **If the response is `ask` / "user confirmation required"** — STOP. Do not retry. Surface the refusal reason verbatim to the user with the table name and category.
3. **Ask an explicit yes/no question** with the exact tables and scope, e.g.:
   > ⚠️ `ACDOCA` (Protected Business Data) requires explicit authorization to extract rows. Proceed? **(yes / no)**
4. **Only retry with acknowledgement after receiving an explicit affirmative keyword** from the user:
   - Accept: `yes`, `y`, `authorize`, `authorized`, `approve`, `approved`, `proceed`, `go ahead`, `confirmed`
   - Reject (NOT authorization): `pull it`, `try it`, `test it`, `grab it`, `just do it`, `I was wrong`, `my mistake`, silence, `why?`, or any ambiguous imperative. These describe the *task*, not *consent*.
5. **Authorization is per-request.** It does not carry across tables, calls, or sessions. Each new `ask` requires a new confirmation.
6. When in doubt: **stop and ask**. A surprised user whose data was pulled without consent is a policy failure; asking one extra question is not.

Confirmation gates exist because some protected data has legitimate use cases (e.g., analyst reviewing their own company-code postings). They must not become a rubber stamp.

## Authorization Override

A blocked extraction may be authorized per-task when the business need is real and documented. To authorize:

1. Create a `data-access-approval-{YYYYMMDD-HHMM}.md` note in the project with:
   - Tables to be accessed
   - Business justification
   - Data retention / disposal plan
   - User sign-off (name + date)
2. Agent re-reads this file before the specific call and logs the approval ID in its output.

Approval applies to **one session and one scope** — not a permanent bypass.

## Defense Layers

This policy is the instruction-level layer. Server-side protections (read-only mode, package restrictions, safety flags) may add enforcement, but agents MUST still follow this policy — it provides the user-facing refusal with category and alternatives, which server-side blocks cannot produce cleanly.
