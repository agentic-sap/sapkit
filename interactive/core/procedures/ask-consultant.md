---
name: ask-consultant
description: Direct operational Q&A as a SAP module consultant. Determine the question's module, load the matching consultant persona from the personas INDEX, and answer against the configured SAP environment (version, industry, country, active modules).
source:
  - sc4sap-custom/skills/ask-consultant/SKILL.md
---

# Ask Consultant

One entrypoint for answering an operational SAP question **as a module consultant**. Work out the right consultant persona(s) from the question text + project config, honor the configured SAP environment, and return a faithful answer — no code generation, no object creation, just the consultant's judgment.

## Purpose

This is the "ask a human consultant" button. People reach for it when what they need is SPRO guidance, business-process advice, a configuration walkthrough, integration touchpoints, localization rules, or a BAdI / CMOD / append decision — the sort of question an SD / MM / FI / CO / PP / PS / PM / QM / TR / HCM / WM / TM / BW / Ariba / Basis consultant normally fields. The procedure does NOT write code or change the SAP system; it reads config, adopts the consultant persona, and returns the answer.

## When to Use

- The user says "ask consultant", "ask {module}", "consultant", "SD 컨설턴트", "MM 컨설턴트", "물어봐", "자문", "consult", etc.
- The user brings an operational / configuration question that does NOT require code generation or MCP writes.
- The user needs cross-module advice spanning 2–3 consultant perspectives.
- The user wants to sanity-check a config choice before running `create-program`.

## When NOT to Use

- The user wants code / objects created — use `create-program` or `create-object`.
- The user wants a runtime error analyzed — use `analyze-symptom`.
- The user wants existing code quality reviewed — use `analyze-code`.
- User wants a **bulk dump of IMG customizing tables** — not this procedure, and never something you run yourself. A targeted customizing read goes through [spro-lookup](spro-lookup.md) Step 3 (name the tables, get per-call approval); a full cache is generated **by the user** with `tools/extract/extract-spro.mjs` (spro-lookup → "Generating the cache"). Under either route the [data-extraction-policy](../policies/data-protection/data-extraction-policy.md) blocklist floor still applies, and anything beyond customizing metadata is refused per that policy.

## Environment Context

**MANDATORY — the consultant answers against the project's configured SAP environment, not generic best-practice.** Load the following before answering (see [project-context](../project-context.md)):

- `.sapkit/config.json` → `sapVersion` (ECC / S4 On-Prem / S4 Cloud Public / S4 Cloud Private), `abapRelease`, `industry`, `country`, `activeModules`
- `.sapkit/sap.env` (via the active profile) → `SAP_URL`, `SAP_CLIENT`, `SAP_LANGUAGE`, `SAP_INDUSTRY`, `SAP_COUNTRY`, `SAP_ACTIVE_MODULES` (as fallback)

Hold these values in view as you answer, so the answer reflects the actual landscape. Where a key is missing, ask the user before answering — do NOT invent assumptions.

Baseline references to consult as you answer:
- [spro-lookup](spro-lookup.md) — how to resolve SAP Customizing / IMG questions
- [customization-lookup](customization-lookup.md) — how to look up enhancements / customizations
- [active-modules](../knowledge/modules/common/active-modules.md) — cross-module integration matrix
- `../knowledge/modules/{MODULE}/` — per-module reference docs (`spro.md`, `tcodes.md`, `tables.md`, `bapi.md`, `enhancements.md`, `workflows.md`)
- `../knowledge/industry/<industry>.md` and `../knowledge/country/<iso>.md` — when `industry` / `country` are set, load the matching file and reflect it in the answer

## Reference Libraries (optional, D-050)

If `config.json` has a `referenceLibraries` array (see
[project-context](../project-context.md)), consult it **before** answering from
bundled generic knowledge — these are the user's own distilled best practices
from real implementations, and they outrank generic advice on "how it is
actually done":

1. For each registered library, match the question's keywords against filenames
   (glob), then grep contents for the strongest terms.
2. Read **at most 2–3 matching docs per library** — never bulk-load a vault.
3. Cite provenance in the answer when used: `참조: {name}/{file}`.
4. Field absent, path unreadable, or no match → skip silently; the answer is
   composed exactly as before. Never copy vault content into any committed or
   distributed artifact.

## Module → Persona Routing

Map the user's question onto the target module(s). Priority:

1. **Explicit mention**: "MM 물어봐" / "ask SD" / "FI 컨설턴트" → that module directly.
2. **Keyword inference**: read it off the routing table below.
3. **Multi-module**: when 2–3 modules match at similar signal strength, answer from each perspective in turn (see Step 4). Example: "MM PO가 FI에 어떻게 전기되는지" → MM + FI perspectives, then compose.
4. **Unclear**: ask the user which module first — one question, one round.

Take the persona from [INDEX](../personas/INDEX.md) and load only the selected file(s):

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

1. **Environment load** — read `.sapkit/config.json` + `sap.env`; surface the resolved values on the FIRST turn only (one line: `SAP: <version> · <industry> · <country> · active: <modules>`). Where keys the answer needs are missing, ask.
2. **Module routing** — apply § Module → Persona Routing. On ambiguity, ask one question and stop.
3. **Persona load** — open [INDEX](../personas/INDEX.md), pick the matching consultant persona file, read it, and adopt it. Consultant personas are `readonly` — they judge and advise only, never modify.
4. **Answer** — as the adopted consultant, answer the question against the loaded environment context (sapVersion / abapRelease / industry / country / activeModules). Source per the [knowledge-sourcing](../policies/knowledge-sourcing.md) ladder: project-learned state first (`.sapkit/RULES.md` scope-matched rules bind; `knowledge/` KD/KS atoms are established context — cite ids), then registered vaults (§ Reference Libraries below) for practice questions, then `../knowledge/modules/{MODULE}/` docs and [spro-lookup](spro-lookup.md) / [customization-lookup](customization-lookup.md) as needed; use read-only MCP calls (`SearchObject`, `GetTable`, `GetPackage`, `GetWhereUsed`, …) to check the actual system where the answer depends on it.
   - **Multi-module questions**: work each module's perspective **sequentially** — adopt consultant persona A and write its answer; then adopt consultant persona B and write its answer; and so on.
5. **Synthesis (only when ≥ 2 module perspectives were produced)** — build a cross-module summary out of the per-module answers: name the shared points, flag the disagreements (each with a one-line "WHY they differ" note). Do NOT re-answer the question — compose only from the perspectives already written. Single-module case: skip this step entirely and present the consultant's answer directly.
6. **Return & follow-up** — deliver the final answer (single module: verbatim; multi-module: synthesis as the body + one subsection per module perspective). Offer follow-up paths: `create-program` (if the answer leads to a new build), [program-to-spec](program-to-spec.md) (if user wants the existing asset documented), `analyze-code` (if quality review needed). If answering required establishing a business or this-system fact that the shipped module knowledge did **not** already cover — typically something the user or the live system told you — grep `.sapkit/knowledge/domain.md` and `system.md` for its key terms (a bounded grep, not a full read), and only if it is not already recorded offer one line: *"Record `<fact>` to project knowledge? (yes/no)"*, following [knowledge](knowledge.md) on `yes`. An answer composed purely from shipped knowledge accumulates nothing, and a fact already recorded is not re-offered; either way, no prompt.

**No writes**: this procedure never calls `Create*` / `Update*` / `Delete*` / `Activate*` / `CreateTransport`. Where the answer points to a change, the user must run a separate creation / modification procedure.

**No row extraction**: `GetTableContents` and `GetSqlQuery` are NOT used here. Schema / DDIC reads are fine (`GetTable`, `GetStructure`, `GetDataElement`, `GetDomain`, `SearchObject`).

## Output Format

Return the consultant's answer, prefixed with the consultant identity and the environment context it worked from:

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

For a multi-module question the `🧭 Consultant` line lists every persona name, the body leads with the synthesis — shared points, disagreements, cross-module summary — and one subsection per module perspective follows.

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
