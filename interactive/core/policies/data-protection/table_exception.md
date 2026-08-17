# Prohibited Tables — Data Extraction Blocklist (Index)

A table named in any of the per-section files below **MUST NOT** be read through `GetTableContents`, `GetSqlQuery`, or any other MCP data-extraction path.

What those tables hold is personally identifiable information (PII), credentials, payroll, banking, pricing/commercial terms, or data otherwise protected in law or in ethics. Their schema and field metadata (`GetTable` for the DDIC structure) stays retrievable — **only row-level data extraction is forbidden**.

> What you are reading is the **index**. The table lists themselves sit in the per-section files below, which keeps each one short and easy to maintain. The `PreToolUse` hook (`scripts/hooks/block-forbidden-tables.mjs`) parses **every `*.md` in this folder except this index**, then merges them.

## Scope Profiles

Every section file carries a tier tag (`<!-- tier: minimal | standard | strict -->`), and may carry an action tag as well (`<!-- action: deny | warn -->`, default `deny`). Which profile is active comes from `blocklistProfile` in `.sapkit/config.json`:

- `minimal` — PII, credentials, and pricing (Banking, Master PII, Addresses, Auth, HR, Tax, Pricing)
- `standard` — everything in minimal **+** Protected Business Data (the transactional tables)
- `strict` — everything in standard **+** Audit/Security Logs, Workflow/Communication (the recommended default)
- `custom` — the built-in entries are ignored; only `.sapkit/blocklist-custom.txt` applies

Whichever profile is active, `.sapkit/blocklist-extend.txt` (one table name or pattern per line) also takes effect when that file exists.

## Enforcement

- Every sc4sap agent and skill MUST consult this list before calling `GetTableContents` / `GetSqlQuery`.
- When a user request needs data out of a blocked table: **refuse the extraction, name the category that applies (e.g., "PII — bank master"), and offer alternatives** (aggregated CDS views, anonymized test data, or a consultant analysis that uses no raw rows).
- A SELECT over joined views / CDS views that draws on a blocked table falls under the same rule.

## Section Files

| Tier | File | Category |
|------|------|----------|
| minimal | [banking-payment.md](banking-payment.md) | Banking / Payment (credentials, payment runs, cards) |
| minimal | [master-data-pii.md](master-data-pii.md) | Customer / Vendor / BP Master PII |
| minimal | [addresses-communication.md](addresses-communication.md) | Addresses / Communication (ADR*) |
| minimal | [auth-security.md](auth-security.md) | Authentication / Authorization / Security |
| minimal | [hr-payroll.md](hr-payroll.md) | HR / Payroll / Personnel (infotypes & clusters) |
| minimal | [tax-government-ids.md](tax-government-ids.md) | Tax / Government IDs |
| minimal | [pricing-conditions.md](pricing-conditions.md) | Pricing / Conditions / Rebates |
| minimal | [custom-patterns.md](custom-patterns.md) | Customer-specific `Z*` PII patterns |
| standard | [protected-business-data.md](protected-business-data.md) | Protected Business Data (transactional tables) |
| strict | [audit-security-logs.md](audit-security-logs.md) | Audit / Security Logs |
| strict | [communication-workflow.md](communication-workflow.md) | Communication & Workflow (mail, work items) |

## CDS Views in Section Files

A released standard S/4HANA CDS view (`I_*`, `A_*`, `C_*`, `P_*`) that wraps a blocked table is listed in the **same section file as the underlying table** (so `I_Customer` sits with KNA1 in `master-data-pii.md`, and `I_BankAccount` with BNKA in `banking-payment.md`). Aliases across view families (`I_Customer` ↔ `C_Customer`) carry the same tier — register explicit aliases through `.sapkit/blocklist-extend.txt` as your project turns them up. A custom Z-view inherits the tier of whichever table it joins.

## Pattern Syntax (inside section files)

- `TABLE_NAME` — matched exactly, in uppercase
- `TABLE*` — wildcard, standing for `[A-Z0-9_]*` (e.g., `HRP*` → HRP1000, HRP1001, …)
- `TABLExxx` — the same wildcard as `*` (legacy spelling, kept for backward compat)
- `A###` — digit wildcard; each `#` stands for `[0-9]` in exactly one position (e.g., `A###` → A001..A999)
- Several names on one row: separate them with `/` or `,` (e.g., `KNB1 / KNB5`)
- A section header (H2) resets the tier/action defaults; each file may keep its own `<!-- tier: -->` and `<!-- action: -->` comments directly beneath that H2.

## Allowed Alternatives

When a legitimate use case needs data that touches blocked tables, reach first for:

1. **Aggregated CDS views** built for analytics (e.g., released `I_*` views that mask PII)
2. **Anonymized test data** taken from quality/sandbox systems
3. **Synthetic data** that the consultant agent generates out of schema metadata
4. **Counts / aggregates only** — `SELECT COUNT(*)` or `SUM(...)` through `GetSqlQuery`, with no personal or rate field in the SELECT list
5. **User authorization workflow** — a one-off approval, stated explicitly and written down in `.sapkit/program/{PROG}/data-access-approval.md`

Never route around the block in silence. Always surface the reason to the user.

## Adding / Modifying Entries

1. Find the section file this entry belongs in (or start a new one).
2. Add the row to that markdown table, written in the pattern syntax above.
3. Run the smoke test again:
   ```bash
   echo '{"tool_name":"`GetTableContents`","tool_input":{"table_name":"YOUR_TABLE"}}' \
     | node scripts/hooks/block-forbidden-tables.mjs
   ```
   The `hookSpecificOutput` should come back carrying `"permissionDecision":"deny"`.
4. If a new file was added, commit that section file together with this index.
