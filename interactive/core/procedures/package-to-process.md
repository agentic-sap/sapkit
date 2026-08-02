---
name: package-to-process
description: Reverse-engineer one CBO package into an End-to-End Business Process document — walk its programs and FMs, recover the business-document flow (PR→PO→GR→IR style), and emit a consultant-facing Markdown narrative with rendered process-map and sequence-diagram images plus per-step tables.
source:
  - babamba2/superclaude-for-sap@78b5c2f:skills/package-to-process/SKILL.md
  - babamba2/superclaude-for-sap@78b5c2f:skills/package-to-process/workflow.md
  - babamba2/superclaude-for-sap@78b5c2f:skills/package-to-process/dispatch-stocker.md
  - babamba2/superclaude-for-sap@78b5c2f:skills/package-to-process/dispatch-analyst.md
  - babamba2/superclaude-for-sap@78b5c2f:skills/package-to-process/dispatch-writer.md
  - babamba2/superclaude-for-sap@78b5c2f:skills/package-to-process/document-template.md
---

# Package → End-to-End Business Process

Read ONE CBO package, classify its programs and function modules into **business
document flows** (`PR → PO → GR → IR`, `SO → DN → Billing`, …), and write a
Markdown narrative aimed at **functional consultants**.

Three procedures look at custom code; they answer different questions:

| Procedure | Unit | Question answered |
|---|---|---|
| [analyze-cbo-obj](analyze-cbo-obj.md) | one package, object-level | *What reusable Z elements exist here?* |
| [program-to-spec](program-to-spec.md) | one program, vertical | *What does this one program do, in spec form?* |
| **package-to-process** | one package, process-level | *How do these programs cooperate to run the business flow?* |

## Purpose

After a project accumulates dozens of CBO programs, no document explains how they
cooperate. AMS engineers, a consultant taking over a module, and Fit/Gap reviewers
all need the process-level map: *which programs form the PR→PO→GR→IR backbone,
which one fires which, and where does it cross into FI/CO?* This procedure answers
that once per package and leaves a reviewable artifact behind.

## When to Use

- User says "package to process", "패키지 프로세스 분석", "E2E 업무 흐름 문서화",
  "reverse-engineer the process from this package", or equivalent
- AMS / handover preparation — need a process map of an unfamiliar Z-package
- Fit/Gap review — need to see how the customer's CBO implements a business
  process before judging gaps
- Onboarding a consultant or developer onto an existing module

## When NOT to Use

- User wants only the reusable-object catalog → [analyze-cbo-obj](analyze-cbo-obj.md)
- User wants ONE program's spec → [program-to-spec](program-to-spec.md)
- User wants 2–5 programs side-by-side → [compare-programs](compare-programs.md)
- User wants a code-quality review → [analyze-code](analyze-code.md)
- The package contains no PROG and no FUGR — a process narrative over zero entry
  points is meaningless. Say so and stop.

## Ownership and policy profile

- **The main context owns all seven steps.** There is no worker dispatch. Where a
  step needs a different stance, **adopt the persona** and do the work in place:
  [sap-stocker](../personas/sap-stocker.md) for the inventory walk (Step 2),
  [sap-analyst](../personas/sap-analyst.md) for grouping and narrative (Steps 4–5),
  [sap-writer](../personas/sap-writer.md) for the render (Step 6).
- **Profile: P0/P1 (offline + connected-read).** Metadata, source, where-used and
  transaction reads only. No SAP write, no execution, no transport — this
  procedure never creates or touches a transport request.
- **Row data is out of bounds.** `GetTableContents` and `GetSqlQuery` are
  forbidden here (see § Safety Rails).
- Announce each step as it begins with a one-line header
  (`Step 3/7 — Entry-point detection`) so a multi-minute Step 4/5 is not silent.
  When a step is skipped, still print its line with `(skipped — <reason>)`.

**Output location**

```
.sapkit/processes/<MODULE>/<PACKAGE>/process-<YYYYMMDD>-<lang>.md
.sapkit/processes/<MODULE>/<PACKAGE>/_assets/process-<YYYYMMDD>-<lang>/{macro.png,seq-<N>.png}
.sapkit/processes/<MODULE>/<PACKAGE>/_img/process-images.json
```

`<MODULE>` uppercase module key · `<PACKAGE>` uppercase package name ·
`<lang>` ISO 639-1 from Step 1. A file already at that path is overwritten, but
the new file carries a `> Regenerated from <old generated_at>` line under its H1.

## Workflow Steps

Seven steps, in order.

**Step 1 — Intake (Socratic)**

Ask one question at a time; do not batch them.

1. **Package** (exactly one question, skip if the invocation already named it)
   > "Which CBO package should I analyze for its end-to-end business process?
   > (e.g. `ZSD_MAIN`, `ZMM_CORE`). A prefix like `ZMM*` is fine — I'll search."

   - Prefix → `SearchObject(objectType='DEVC', query=<prefix>)`, list matches, re-ask.
   - Verify the final name with `GetPackage(<name>)`. Not found → report and stop.
2. **Module** (exactly one question, constrained list)
   > "Which SAP module does this package belong to? Pick one of:
   > SD / MM / PP / PM / QM / WM / TM / TR / FI / CO / HCM / BW / PS / Ariba."

   - Valid values = the folders under `../knowledge/modules/`. Normalize to
     uppercase and verify `../knowledge/modules/<MODULE>/` exists; reject and re-ask otherwise.
   - `BC` is deliberately absent from the flow dictionary — see
     [document-flows](../knowledge/modules/common/document-flows.md) § Scope note.
3. **Output language** (exactly one question)
   > "Which language should the document be written in? 한국어(ko) / English(en) /
   > 日本語(ja) / other (give the ISO 639-1 code). Default = the language we're
   > speaking now."

   Section titles and body text follow this choice. Frontmatter keys stay English;
   diagram syntax is language-neutral, only node labels translate.
4. **Project context** — read `.sapkit/config.json` (`sapVersion`, `abapRelease`,
   `industry`, `country`) and `.sapkit/sap.env` (`SAP_ACTIVE_MODULES`) per
   [project-context](../project-context.md). If industry or country is unset, ask
   once — do not silently proceed on defaults, because Step 5's business phrasing
   and the cross-module checks depend on them.
5. **Learned layers** — per [knowledge-sourcing](../policies/knowledge-sourcing.md):
   read `.sapkit/knowledge/domain.md` / `system.md` if present (KD atoms are
   established process facts — cite ids in the narrative; KS atoms only when
   `scope:` matches). If `config.json` registers `referenceLibraries` vaults,
   keyword-match the package's business domain against them (2–3 docs per vault
   max) — a user vault distilled from a real E2E implementation is the strongest
   available guide for Step 5's document-flow recovery and business phrasing.
   Cite `참조: {name}/{file}`. Absent → skip silently.

State after Step 1: `{package, module, sapVersion, abapRelease, industry, country,
activeModules, language}`.

**Step 2 — Ensure the CBO inventory exists**

1. Look for `.sapkit/cbo/<MODULE>/<PACKAGE>/inventory.json`.
2. **Present** → load it into state, print `(skipped — inventory found at <path>)`.
3. **Missing** → run the inventory walk yourself now, adopting the
   [sap-stocker](../personas/sap-stocker.md) persona and following
   [analyze-cbo-obj](analyze-cbo-obj.md) § Inventory walk. Then load the result.
4. If the walk cannot complete (package unreadable, connection refused), **stop**
   and surface the reason. Do not attempt the process narrative without an
   inventory — every later step reads `objects[]` and `key_programs[]`.

**Step 3 — Entry-point detection**

1. Collect all PROG objects from `inventory.json`.
2. For each, find how a user reaches it:
   - `SearchObject(objectType='TRAN', query='<prog_name>')` → TCodes launching it
   - cross-check `../knowledge/modules/<MODULE>/tcodes.md` for documented Z-TCodes
3. Build candidates `{prog, tcodes[], short_text}`. A program with no TCode is
   still a candidate when `inventory.json → key_programs[]` lists it as flagship —
   that is the user's own signal and outranks the absence of a TCode.
4. Present the candidate list and ask the user to confirm it: which to keep, which
   to drop as batch-only/utility, and which known entry program is missing. One
   question, one round.
5. Empty result → **stop and ask**:
   > "No interactive entry points were found. Should I treat the largest program
   > `<X>` as the entry point, or stop here?"

   Wait for the answer. Do not guess an entry point.

State: `entry_points[]`.

**Step 4 — Process grouping**

Adopt the [sap-analyst](../personas/sap-analyst.md) persona.

1. Read [document-flows](../knowledge/modules/common/document-flows.md) and run its
   § Clustering algorithm steps 1–7 over the confirmed entry points:
   `GetWhereUsed` for the 1-hop in-package neighborhood, core-table sets from
   source plus `GetAbapSemanticAnalysis`, Jaccard ≥ 0.35 to cluster, dictionary
   match ≥ 60% for the canonical label, confidence score, residue group.
2. Hold the result as:

```json
{
  "processes": [
    { "label": "PR → PO → GR → IR",
      "members": ["ZMM_PR_CREATE", "ZMM_PO_RELEASE"],
      "shared_tables": ["EBAN", "EKKO", "EKPO", "MSEG"],
      "anchor_dictionary_match": "MM:PR→PO→GR→IR",
      "confidence": 0.82,
      "is_cross_module": false }
  ],
  "residue": ["ZMM_UTIL_LOG_PURGE"],
  "open_questions": ["Is ZMM_PRICE_OVERRIDE still used? No callers detected."]
}
```

3. **Present the groups to the user with their rationale and confidence**, and ask
   for one of: approve as-is · merge two groups · split a group (user says which
   members go where) · rename a label. Apply and re-present.
4. **Cap the loop at 3 rounds.** Still not approved on the third → stop looping and
   ask the user how they want to proceed. Do not keep regrouping silently.
5. Zero groups produced → ask the user to define at least one group by hand, then
   go straight to Step 5. Do not retry the automatic pass a second time.

State: `processes[] = [{label, members[], rationale, confidence}]`.

**Step 5 — Per-process narrative**

Still as [sap-analyst](../personas/sap-analyst.md). Work through the approved list
in one continuous pass so cross-process observations stay coherent.

Read on demand — `GetProgFullCode` / `GetFunctionModule` / `GetClass` for grounded
claims (prefer a semantic summary over a full read), `GetWhereUsed` for the 1-hop
boundary, `../knowledge/modules/<MODULE>/{spro,bapi}.md` for boundary
classification, `../knowledge/industry/<INDUSTRY>.md` and
`../knowledge/country/<COUNTRY>.md` for business phrasing.

For each process produce:

1. **overview** — 3–6 sentences in business voice, not technical narration.
2. **representative_sequence** — ONE end-to-end scenario: actors (human) and
   participants (programs, FMs, DB), the calls between them, returns, and any
   alternative branch worth showing. This becomes the sequence diagram in Step 6.
3. **step_table** — rows `{step, actor, cbo_object, tables, trigger, output}`,
   at most 12 rows.
4. **external_boundary** — rows `{direction, external_object, type, called_from,
   purpose}`; `type` ∈ {Std BAPI, Std FM, CDS, Other Z package, Enhancement, …}.
   **Boundary depth is exactly one hop.** Do not walk further; the second hop is
   where this document would turn into a system trace nobody reads.
5. **cross_module_notes** — only when the process touches a second *active* module
   per [active-modules](../knowledge/modules/common/active-modules.md). Otherwise
   an empty list. If a boundary looks strong enough to warrant module expertise
   (say MM ↔ FI through `BAPI_ACC_DOC_POST`), consult the matching
   `sap-<module>-consultant` persona via [INDEX](../personas/INDEX.md) for that
   section only.

Also collect, at package level: `package_level_cross_module[]`,
`sensitive_objects[]` (from `inventory.json → objects[].sensitive`), and
`open_questions[]`.

**Step 6 — Render the document**

Adopt the [sap-writer](../personas/sap-writer.md) persona. Render from the state
collected so far — this step reads no further SAP data.

1. **Assemble the diagram spec** from Step 5 and save it to
   `.sapkit/processes/<MODULE>/<PACKAGE>/_img/process-images.json`:

```json
{ "lang": "<lang>",
  "macroTitle": "<package> macro flow",
  "macro":  { "nodes": [{ "id": "p1", "num": 1, "label": "…" }],
              "edges": [{ "from": "p1", "to": "p2" }] },
  "processes": [
    { "slug": "1", "title": "<process label>",
      "seq": { "actors": [{ "id": "req", "label": "요청자", "kind": "actor" },
                          { "id": "z1",  "label": "ZMM_PR", "kind": "participant" }],
               "items":  [{ "m": ["req", "z1"], "t": "구매요청 입력" },
                          { "m": ["z1", "req"], "t": "결과", "r": true },
                          { "note": "…", "over": ["z1"] },
                          { "alt": "금액 > 1,000만원" }, { "elselbl": "그 외" }, { "end": true }] } }
  ] }
```

   `kind: "actor"` = human, `"participant"` = system/object. In `items`:
   `{m:[from,to],t}` = call · `+ r:true` = return · `{note,over}` = note box ·
   `{alt|opt|loop}` … `{end}` = frame, with `{elselbl}` as its divider.

2. **Render the images** with [render-process-images.mjs](../../tools/spec/render-process-images.mjs):

```bash
node tools/spec/render-process-images.mjs \
  .sapkit/processes/<MODULE>/<PACKAGE>/_img/process-images.json \
  .sapkit/processes/<MODULE>/<PACKAGE>/_assets/process-<YYYYMMDD>-<lang>/
```

   It writes `macro.png` plus `seq-<slug>.png` per process and prints a manifest.
   A `null` slot means no headless browser was found — that diagram then ships as
   the fallback text block only, which is a degraded document, not a failed run.

3. **Write the Markdown** per § Document skeleton, honoring § Renderer constraints,
   to `.sapkit/processes/<MODULE>/<PACKAGE>/process-<YYYYMMDD>-<lang>.md`. Create
   parent directories as needed.

> **Not in scope: the BPML deliverable.** Upstream also renders a BPML workbook
> (L1–L5 rows, one flow sheet per L1 group). sapkit deliberately did not port it
> (D-053 ②). Re-open the question when ⓐ a recipient of a real process document
> asks for the Excel table, or ⓑ the first full dogfooding run completes —
> whichever comes first.

**Step 7 — Validation + handoff**

1. Verify, and report each check by name:
   - the file exists at the expected path
   - its YAML frontmatter parses and carries `package`, `module`, `industry`,
     `country`, `generated_at`, `entry_points`, `process_count`
   - every `## <N>. Process:` section has a representative-scenario diagram
     (rendered PNG **or** the text fallback) and a Step Table
   - §0 carries the macro diagram (PNG or fallback)
   - `process_count` equals the number of process sections
   - no row data leaked into the document
2. Print the summary: file path, process count, diagram count, external-boundary
   row count.
3. Offer the follow-ups — [program-to-spec](program-to-spec.md) to drill into one
   program, [compare-programs](compare-programs.md) when two members look alike,
   [ask-consultant](ask-consultant.md) for the open questions. Offer; do not run.
4. **A failed check is reported, not repaired.** Leave the file in place, state
   which check failed, and wait — never silently regenerate.

## Document skeleton

Frontmatter (all keys required):

```yaml
---
package: <PACKAGE>
module: <MODULE>
sap_version: <S4|ECC>
abap_release: <e.g. 758>
industry: <from config.json>
country: <iso, from config.json>
active_modules: [<list>]
generated_at: <ISO-8601>
generator: sapkit:package-to-process
entry_points: [<PROG1>, <PROG2>]
process_count: <N>
language: <ko|en|ja|…>
---
```

Body outline. Two constructs are written in a **placeholder notation** so this
procedure file stays free of literal link syntax — expand them to ordinary
Markdown when rendering:

- `TOC{title}{#anchor}` → a Table-of-Contents list item linking `title` to `#anchor`
- `IMG{alt}{path}` → an image embed with alt text `alt` and source `path`
- `FALLBACK{…}` → a collapsible `<details>` block whose body is the fenced
  diagram source (`mermaid` `flowchart LR` for the macro map, `sequenceDiagram`
  for a process scenario)

```markdown
# 📋 <PACKAGE> — End-to-End Business Process

> Industry: <industry> · Country: <country> · Modules: <active_modules>

## Table of Contents
- TOC{0. Overview}{#0-overview}
- TOC{1. Process: <label1>}{#1-process-<slug1>}
- TOC{Cross-Module Notes}{#cross-module-notes}
- TOC{External Boundary Index}{#external-boundary-index}
- TOC{Sensitive Objects}{#sensitive-objects}
- TOC{Open Questions}{#open-questions}

## 0. Overview
<2–4 sentences: what this package does from 30,000 ft.>

### Macro Flow
IMG{<PACKAGE> macro process flow}{_assets/process-<YYYYMMDD>-<lang>/macro.png}
FALLBACK{flowchart LR source — PR --> PO --> GR --> IR}

### Entry Points
| TCode | Program | Short text | Typical persona |
|---|---|---|---|

## <N>. Process: <Canonical Flow Label>
> Confidence: <0.0–1.0> · Members: <count> programs / <count> FMs

### <N>.1 Overview
### <N>.2 Representative Scenario
IMG{Process <N> representative scenario}{_assets/process-<YYYYMMDD>-<lang>/seq-<N>.png}
FALLBACK{sequenceDiagram source for this process}

### <N>.3 Step Table
| # | Step | Actor | CBO Object | Tables | Trigger | Output |
|---|---|---|---|---|---|---|

### <N>.4 External Boundary (1-hop)
| Direction | External Object | Type | Called From | Purpose |
|---|---|---|---|---|

### <N>.5 Cross-Module Notes   ← only when the process crosses modules

## Cross-Module Notes (Package-level)
| Module Pair | Where it appears | Standard touchpoint | CBO override? |
|---|---|---|---|

## External Boundary Index
| Object | Type | Direction | Caller / Callee in package | Used by Process # |
|---|---|---|---|---|

## Sensitive Objects
| Object | Type | Sensitivity Reason |
|---|---|---|

## Open Questions
- [ ] <question>
```

## Renderer constraints

1. **Frontmatter is mandatory.** A missing key is a failure, not a warning.
2. **TOC anchors** are kebab-case slugs of the section titles, generated at render
   time — never hand-edited afterwards.
3. **Images first, text fallback second.** One macro process-map at §0 and one
   sequence diagram per process, each followed by a collapsible block holding the
   diagram source. A `null` manifest slot → keep the source block alone.
4. **`process_count` must equal the number of process sections.** Mismatch = fail.
5. **Step Table column order is fixed**: `# · Step · Actor · CBO Object · Tables ·
   Trigger · Output`. Reordering is a failure.
6. **No row-level data anywhere.** If any row values crept into the state,
   replace them with `<sample omitted — see data-extraction-policy>`.
7. **Cross-Module Notes** inside a process is conditional — render the heading
   only when that process genuinely crosses modules.
8. **Sensitive Objects renders even when empty** ("No sensitive objects flagged.")
   so a reviewer can see the question was asked.
9. **Regeneration banner** — when overwriting, prepend
   `> Regenerated from <previous generated_at>` directly under the H1.
10. **Length** — past ~2000 lines, warn the user and offer a per-process appendix
    split. Never split without approval.

## Failure handling

- Inventory unavailable (Step 2) → stop, surface the reason. No fallback path.
- Zero entry points (Step 3) → ask; never invent one.
- Zero groups (Step 4) → ask the user for one manual group, then continue to
  Step 5. No second automatic attempt.
- Narrative output missing required fields (Step 5) → fix it once in place; if it
  is still incomplete, stop and ask rather than shipping a half-filled template.
- Image rendering returns nulls (Step 6) → continue with text fallbacks and say so
  in the handoff. This is degradation, not failure.
- Any Step 7 check fails → report it, keep the file, wait for instructions.

## Safety Rails

- **Blocklist**: `GetTableContents` and `GetSqlQuery` are **forbidden** in this
  procedure. Source, DDIC metadata, where-used and transaction metadata are enough
  to describe a process. If the user asks for sample rows to illustrate a flow,
  refuse per [data-extraction-policy](../policies/data-protection/data-extraction-policy.md)
  and record the request in the document's `Open Questions` section instead.
- **Sensitive objects** are listed by name and reason only, sourced from the
  inventory's flags — listing is not access.
- **Read-only**: no object is created, changed or activated; no transport is
  created, assigned or released.
- **Module activation**: respect
  [active-modules](../knowledge/modules/common/active-modules.md) — when a module
  is inactive in this landscape, mark the observation instead of claiming an
  integration.
- **Dictionary matches are hints.** A canonical label from
  [document-flows](../knowledge/modules/common/document-flows.md) is a naming aid;
  the evidence is the measured table set and the reference graph. Never present a
  dictionary label as a verified statement about the customer's process.

## Related Procedures

- [analyze-cbo-obj](analyze-cbo-obj.md) — produces the `inventory.json` this
  procedure consumes (run automatically in Step 2 when missing)
- [program-to-spec](program-to-spec.md) — drill into ONE program of a process
- [compare-programs](compare-programs.md) — when two members of a process look
  like duplicates
- [ask-consultant](ask-consultant.md) — resolve the Open Questions
- [knowledge](knowledge.md) — file durable business/system facts learned here
