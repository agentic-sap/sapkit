---
name: ask-consultant
description: Direct operational Q&A as a SAP module consultant. Determine the question's module, load the matching consultant persona from the personas INDEX, and answer against the configured SAP environment (version, industry, country, active modules).
source:
  - sc4sap-custom/skills/ask-consultant/SKILL.md
---

# Ask Consultant

Single entrypoint for answering an operational SAP question **as a module consultant**. Determine the right consultant persona(s) from the question text + project config, honor the configured SAP environment, and return a faithful answer — no code generation, no object creation, just the consultant's judgment.

## Purpose

This is the "ask a human consultant" button. Users hit it when they need SPRO guidance, business-process advice, configuration walkthroughs, integration touchpoints, localization rules, or BAdI / CMOD / append decisions — the kind of question normally answered by an SD / MM / FI / CO / PP / PS / PM / QM / TR / HCM / WM / TM / BW / Ariba / Basis consultant. The procedure does NOT write code or change the SAP system; it reads config + adopts the consultant persona + returns the answer.

## When to Use

- User says "ask consultant", "ask {module}", "consultant", "SD 컨설턴트", "MM 컨설턴트", "물어봐", "자문", "consult", etc.
- User has an operational / configuration question that does NOT require code generation or MCP writes.
- User needs cross-module advice that spans 2–3 consultant perspectives.
- User wants to sanity-check a config choice before running `create-program`.

## When NOT to Use

- User wants to create code / objects — use `create-program` or `create-object`.
- User wants to analyze a runtime error — use `analyze-symptom`.
- User wants to review existing code quality — use `analyze-code`.
- User wants IMG customizing table data extraction — refuse per [data-extraction-policy](../policies/data-protection/data-extraction-policy.md).

## Environment Context

**MANDATORY — the consultant answers against the project's configured SAP environment, not generic best-practice.** Before answering, load (see [project-context](../project-context.md)):

- `.sc4sap/config.json` → `sapVersion` (ECC / S4 On-Prem / S4 Cloud Public / S4 Cloud Private), `abapRelease`, `industry`, `country`, `activeModules`
- `.sc4sap/sap.env` (via the active profile) → `SAP_URL`, `SAP_CLIENT`, `SAP_LANGUAGE`, `SAP_INDUSTRY`, `SAP_COUNTRY`, `SAP_ACTIVE_MODULES` (as fallback)

Keep these values in view while answering so the answer reflects the actual landscape. If any key is missing, ask the user before answering — do NOT invent assumptions.

Baseline references to consult while answering:
- [spro-lookup](spro-lookup.md) — how to resolve SAP Customizing / IMG questions
- [customization-lookup](customization-lookup.md) — how to look up enhancements / customizations
- [active-modules](../knowledge/modules/common/active-modules.md) — cross-module integration matrix
- `../knowledge/modules/{MODULE}/` — per-module reference docs (`spro.md`, `tcodes.md`, `tables.md`, `bapi.md`, `enhancements.md`, `workflows.md`)
- `../knowledge/industry/<industry>.md` and `../knowledge/country/<iso>.md` — when `industry` / `country` are set, load the matching file and reflect it in the answer

## Module → Persona Routing

Map the user's question to the target module(s). Priority:

1. **Explicit mention**: "MM 물어봐" / "ask SD" / "FI 컨설턴트" → that module directly.
2. **Keyword inference**: use the routing table below.
3. **Multi-module**: if 2–3 modules match with similar signal strength, answer from each perspective in turn (see Step 4). Example: "MM PO가 FI에 어떻게 전기되는지" → MM + FI perspectives, then compose.
4. **Unclear**: ask the user which module first — one question, one round.

Pick the persona from [INDEX](../personas/INDEX.md) and load only the selected file(s):

| Module | Keyword signals (examples) | Consultant persona |
|---|---|---|
| MM | PO, purchase order, EKKO, EBELN, purchasing, inventory | [sap-mm-consultant](../personas/sap-mm-consultant.md) |
| FI | invoice, BKPF, BSEG, posting, general ledger, AP/AR | [sap-fi-consultant](../personas/sap-fi-consultant.md) |
| SD | sales order, VBAK, pricing, billing, shipping | [sap-sd-consultant](../personas/sap-sd-consultant.md) |
| CO | cost center, KOSTL, internal order, product costing | [sap-co-consultant](../personas/sap-co-consultant.md) |
| PP | MRP, production order, AFKO, capacity planning | [sap-pp-consultant](../personas/sap-pp-consultant.md) |
| PS | WBS, PROJ, network, project budgeting | [sap-ps-consultant](../personas/sap-ps-consultant.md) |
| PM | maintenance order, equipment, notification | [sap-pm-consultant](../personas/sap-pm-consultant.md) |
| QM | inspection lot, quality notification, certificate | [sap-qm-consultant](../personas/sap-qm-consultant.md) |
| TR | cash management, treasury, bank communication | [sap-tr-consultant](../personas/sap-tr-consultant.md) |
| HCM | payroll, infotype, time management | [sap-hcm-consultant](../personas/sap-hcm-consultant.md) |
| WM | warehouse, storage bin, picking, putaway, EWM | [sap-wm-consultant](../personas/sap-wm-consultant.md) |
| TM | freight order, route planning, carrier | [sap-tm-consultant](../personas/sap-tm-consultant.md) |
| BW | InfoObject, DataSource, BEx, InfoProvider | [sap-bw-consultant](../personas/sap-bw-consultant.md) |
| Ariba | sourcing, supplier management, Ariba Network | [sap-ariba-consultant](../personas/sap-ariba-consultant.md) |
| BC (Basis) | dump, transport, kernel, system monitoring | [sap-bc-consultant](../personas/sap-bc-consultant.md) |

## Workflow Steps

1. **Environment load** — read `.sc4sap/config.json` + `sap.env`; surface resolved values on the FIRST turn only (one line: `SAP: <version> · <industry> · <country> · active: <modules>`). If keys needed for the answer are missing, ask.
2. **Module routing** — apply § Module → Persona Routing. If ambiguous, ask one question and stop.
3. **Persona load** — open [INDEX](../personas/INDEX.md), select the matching consultant persona file, read it, and adopt it. Consultant personas are `readonly` — judge and advise only, never modify.
4. **Answer** — as the adopted consultant, answer the question against the loaded environment context (sapVersion / abapRelease / industry / country / activeModules). Consult `../knowledge/modules/{MODULE}/` docs and [spro-lookup](spro-lookup.md) / [customization-lookup](customization-lookup.md) as needed; use read-only MCP calls (`SearchObject`, `GetTable`, `GetPackage`, `GetWhereUsed`, …) to check the actual system where the answer depends on it.
   - **Multi-module questions**: answer from each module's perspective **sequentially** — adopt consultant persona A, write its answer; then adopt consultant persona B, write its answer; and so on.
5. **Synthesis (only when ≥ 2 module perspectives were produced)** — compose a cross-module summary from the per-module answers: identify shared points, flag disagreements (with a one-line "WHY they differ" note). Do NOT re-answer the question — only compose from the perspectives already written. Single-module case: skip this step entirely and present the consultant's answer directly.
6. **Return & follow-up** — present the final answer (single module: verbatim; multi-module: synthesis as the body + one subsection per module perspective). Offer follow-up paths: `create-program` (if the answer leads to a new build), [program-to-spec](program-to-spec.md) (if user wants the existing asset documented), `analyze-code` (if quality review needed).

**No writes**: this procedure never calls `Create*` / `Update*` / `Delete*` / `Activate*` / `CreateTransport`. If the answer suggests a change, the user must run a separate creation / modification procedure.

**No row extraction**: `GetTableContents` and `GetSqlQuery` are NOT used. Schema / DDIC reads are fine (`GetTable`, `GetStructure`, `GetDataElement`, `GetDomain`, `SearchObject`).

## Output Format

Return the consultant's answer, prefixed with the consultant identity and the environment context it used:

```
🧭 Consultant: sap-<module>-consultant
🌐 Environment: <sapVersion> · <industry or "—"> · <country or "—"> · active modules: <list>

<consultant's faithful answer>

---
💡 Next steps (optional):
- create-program — if this leads to a new build
- program-to-spec — to document an existing asset
- analyze-code — to review existing code
```

For multi-module questions, the `🧭 Consultant` line lists all persona names, the body leads with the synthesis — shared points, disagreements, cross-module summary — followed by one subsection per module perspective.

## Backend Tools Used

- `SearchObject`, `GetObjectInfo` — existence checks as the consultant works
- `GetPackage`, `GetPackageContents` — CBO scope confirmation
- `GetTable`, `GetStructure`, `GetDataElement`, `GetDomain`, `GetView` — DDIC metadata
- `GetWhereUsed` — call-graph queries
- NEVER: `GetTableContents`, `GetSqlQuery`, any `Create*` / `Update*` / `Delete*` / `Activate*`

## Related Procedures

- [deep-interview](deep-interview.md) — use before ask-consultant if the question is too vague to route.
- [compare-programs](compare-programs.md) — complementary when the consultant's answer references existing variants.
- [analyze-cbo-obj](analyze-cbo-obj.md) — complementary when the consultant's answer depends on knowing what custom assets already exist.
