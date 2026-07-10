---
name: analyze-symptom
description: Step-by-step root cause analysis for SAP operational errors — inspect dumps, logs, transports, and where-used relations directly via MCP, narrow hypotheses with minimal user questions, and provide SAP Note search keywords
source:
  - sc4sap-custom/skills/analyze-symptom/SKILL.md
  - sc4sap-custom/skills/analyze-symptom/workflow-steps.md
  - sc4sap-custom/skills/analyze-symptom/output-format.md
---

# Analyze Symptom

Structured root cause analysis for SAP operational incidents, performed by a single agent connected to the live SAP system through MCP. Auto-collect evidence from dumps, system state, recent transports, and code call graphs before asking the user any question.

## Purpose

This is the first-line triage procedure for SAP production incidents. Rather than bombarding the user with questions, **directly investigate the SAP system through MCP** to gather evidence you can collect on your own. Then ask the user only about gaps that MCP cannot fill, narrow hypotheses to 2–3 categories, and produce SAP Note search keywords plus recommended next actions.

## Use When

- User reports a symptom using words like "error", "dump", "failing", "broken", "not working", "timeout", "slow"
- User has at least one clue: error message, TCode, program name, job name, or affected user/data
- User is unsure which log or transaction to inspect (ST22, SM21, SLG1, SU53, SM13, SM58, WE02, etc.)
- Need to classify whether the issue is custom development vs SAP standard
- Need to trace root cause of an incident that started after a recent transport or patch

## Do Not Use When

- Root cause is already identified and only a code fix is needed — use the `create-program` procedure or direct MCP `Update*` calls
- Pure static code quality review — use the [analyze-code](analyze-code.md) procedure
- Need to create a new ABAP object — use the [create-object](create-object.md) procedure
- Conceptual or configuration-guide question — answer from the matching module consultant persona (see [personas INDEX](../personas/INDEX.md))

## Core Principles

- **MCP-first**: Before asking the user, investigate the SAP system directly with MCP. Never re-ask what MCP can answer.
- **Evidence over assumption**: Do not speculate. No "probably" statements without supporting MCP or user-provided evidence.
- **Minimal questions**: At most 3 questions per round. Skip any question whose answer is already known via MCP.
- **Hypothesis narrowing**: Reduce candidate causes to 2–3 from the 8-category framework; each must carry a confidence level and a confirmation path.
- **Actionable output**: Every hypothesis must include the next evidence step (another MCP call, a TCode, or an escalation target).
- **Customization cache first (local, before live MCP) when a Z*/Y* object or customized SAP include appears in the trace**: read `.sc4sap/customizations/<MODULE>/{enhancements,extensions}.json` and correlate — a `Z*` class in a dump may be a known BAdI impl, a customized `MV45AFZZ`/`ZXRSRU01` may be a recorded form-based exit, a failing field may be a recorded append. Follow [customization-lookup](customization-lookup.md). If the cache is absent, suggest generating it (`setup customizations` extraction) but do not block the current analysis.

## Analysis Framework

All hypotheses must map to one of these 8 root cause categories:

| Category | Typical Symptoms | Key Signals |
|----------|------------------|-------------|
| Master / Input data | Only specific data fails, others succeed | Data values, related master records |
| Authorization | Only specific users fail | SU53, STAUTHTRACE, recent role changes |
| Customizing | Only specific org units affected | SPRO values, recent customizing transports |
| Interface / RFC / Batch | External integration fails | SM58, SMQ1/2, SM37, WE02, BD87 |
| Custom development | Z*/Y* objects in call stack | Recent Z* transports, `GetWhereUsed` |
| Standard SAP bug | Only standard objects in stack; right after SP upgrade | SAP Note search, kernel/SP level |
| Performance / Locks / DB | Timeouts, increased wait times | ST05, SAT, SM12, SQLM |
| Operational procedure | Step order or prerequisite violated | Month-end, dependency job status |

Every hypothesis presented to the user must declare its **category** explicitly.

## Evidence Collection Matrix

Evidence collection strategy — prefer MCP auto-query, fall back to manual TCode guidance:

| Symptom Type | MCP Auto-Query | Manual TCode |
|--------------|----------------|--------------|
| Short dump / runtime error | `RuntimeListDumps`, `RuntimeGetDumpById`, `RuntimeAnalyzeDump` | ST22 |
| Performance / long runtime | `RuntimeRunProgramWithProfiling`, `RuntimeAnalyzeProfilerTrace`, `RuntimeListProfilerTraceFiles` | ST05, SAT, SQLM |
| Suspect program/class logic | `ReadClass`/`ReadProgram`, `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetWhereUsed` | SE80, SE24, SE38 |
| Recent change tracking | `ListTransports`, `GetTransport`, `GetObjectInfo` (Author/Changed-by) | SE09, SE10, SE16 → E070 |
| **Z\*/Y\* object or customized SAP include in trace** | Local file read: `.sc4sap/customizations/<MODULE>/enhancements.json` (→ `badiImplementations[]`, `cmodProjects[]`, `formBasedExits[]`) and `.sc4sap/customizations/<MODULE>/extensions.json` (→ `appendStructures[]`) | n/a — local cache only |
| Enhancement / BAdI | `GetEnhancements`, `GetEnhancementImpl`, `GetEnhancementSpot` | SE18, SE19, SMOD, CMOD |
| System / session info | `GetSession` | /n (status), /o SM04 |
| Table schema (not rows) | `GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain` | SE11 |
| Unit test results | `GetUnitTestResult`, `RunUnitTest` | SE80 → test class |
| Authorization error | (MCP not supported) | SU53, STAUTHTRACE |
| Application log | (MCP not supported) | SLG1 |
| System log | (MCP not supported) | SM21 |
| Update error | (MCP not supported) | SM13 |
| RFC / tRFC / qRFC | (MCP not supported) | SM58, SMQ1, SMQ2 |
| Background job | (MCP not supported) | SM37 |
| IDoc | (MCP not supported) | WE02, WE05, BD87 |
| OData / Fiori | (MCP not supported) | /IWFND/ERROR_LOG, /IWBEP/ERROR_LOG |

**Rule**: For any MCP-supported item, never ask the user — query it directly.

## Workflow Steps

### Step 1 — Initial Triage

- Extract user-supplied clues: error text, message class/number, TCode, program/class name, affected user, timing, dump indicators.
- Call `GetSession` to capture system info (SID, client, release, SP, current user).
- Package the structured clue set + system info and proceed to Step 2.

Exit condition: `<CLUES>` + `<SESSION_INFO>` resolved.

### Step 2 — Investigate + Gap + Narrow (one round; repeatable)

Adopt the [sap-debugger](../personas/sap-debugger.md) persona for this step. Perform full root-cause analysis for the reported incident, carrying forward: the known clues, the system info, and previous-round findings (empty on the first round).

Your responsibilities (ALL in one round):

**A. AUTO-INVESTIGATE via MCP — never ask the user, fetch directly:**

- Dump path: `RuntimeListDumps` → `RuntimeGetDumpById` → `RuntimeAnalyzeDump`
- Recent changes: `ListTransports` (last 7d) → `GetTransport` (candidate TRs) → `GetObjectInfo`
- Code path: `ReadClass` / `ReadProgram` / `ReadFunctionModule` → `GetAbapAST` → `GetWhereUsed`
- Enhancement: `GetEnhancements` → `GetEnhancementImpl` / `GetEnhancementSpot`
- Customization: read `.sc4sap/customizations/<MODULE>/{enhancements,extensions}.json` (local file)
- Profiler: `RuntimeRunProgramWithProfiling` → `RuntimeAnalyzeProfilerTrace` (when TIME_OUT / slowness)

**B. GAP IDENTIFICATION** — separate evidence collected via MCP from areas MCP cannot reach (SU53 authorization trace, SLG1 app log, SM13 update, SM58 RFC, SM37 jobs, WE02 IDoc, /IWFND/ERROR_LOG OData).

**C. HYPOTHESIS NARROWING** — reduce to 2–3 candidate causes from the 8-category framework above. Each hypothesis MUST include:

- category
- confidence: High | Medium | Low
- evidence (bullet list of MCP facts supporting it)
- confirmation_path (next probe: MCP call, TCode, or user question)

**D. ROUND RESULT STRUCTURE** (JSON-like):

```
{
  "mcp_confirmed"        : [ "System: S4H / client 100 / 756", "3 recent dumps at ...", ... ],
  "mcp_unavailable_gaps" : [ "SU53 — MCP can't fetch", ... ],
  "hypotheses"           : [ { category, confidence, evidence, confirmation_path }, ... ],   // 2–3 items
  "priority_questions"   : [ "Q1 ...", "Q2 ...", "Q3 ..." ],                                 // max 3, targets mcp_unavailable_gaps
  "sap_note_hints"       : [ "MESSAGE_TYPE_X + ZCL_SD_ORDER", ... ]                          // candidate search keywords
}
```

Rules:

- Never call `GetTableContents` / `GetSqlQuery`.
- Never speculate without evidence ("probably" statements are forbidden).
- When a Z*/Y* object or customized SAP include appears in the trace, MANDATORY reverse-lookup via the local customization cache per the Evidence Collection Matrix.
- If narrowing is impossible because 4+ categories fit equally, mark the round BLOCKED with the reason, then ask the user one disambiguating question before starting a new round.

### Step 3 — User Questions (round N)

Render the round result:

```
✅ Confirmed via MCP:
  <mcp_confirmed bullet list>

❓ Need your input (max 3):
  <priority_questions>

🎯 Leading hypotheses (2–3):
  <per-hypothesis: category · confidence · evidence summary>
```

Wait for user answers. If answers arrive → re-run Step 2 (round N+1) with previous findings carried forward. If the user closes the loop (e.g., "yes, SU53 dump attached" or "no more input"), proceed to Step 4.

Max 3 questions per round. Any item already in `mcp_confirmed` must NOT appear as a user question.

### Step 4 — SAP Note Keywords

Assemble copy-paste-ready search strings, ordered most-specific → broadest, from `sap_note_hints` + user-confirmed evidence:

1. Exact error string in quotes + message class + number
2. Dump runtime error name (e.g., `MESSAGE_TYPE_X`, `ASSERTION_FAILED`)
3. Program / class / function module name
4. Component + symptom keyword (`FI-GL open period short dump`)
5. TCode + symptom keyword

Suggest filters: release, SP level, kernel level, component.

### Step 5 — Recommended Actions

Classify actions by who can execute them:

- **Immediately actionable**: additional MCP queries, local file checks
- **Requires SAP GUI access**: SU53, SM13, SM58, STMS, etc. (the `mcp_unavailable_gaps` items)
- **Escalation**: development team / Basis / module consultant

Draw directly from each hypothesis's `confirmation_path`.

### Step 6 — Escalation Routing

After hypothesis confirmation, hand off to the correct follow-up:

- **Custom code fix** → direct `UpdateClass` / `UpdateProgram` / `UpdateInclude` MCP calls (as the [sap-debugger](../personas/sap-debugger.md) persona in write mode)
- **Code quality review** → the [analyze-code](analyze-code.md) procedure
- **Module-specific configuration deep-dive** → adopt the matching sap-{module}-consultant persona (see [personas INDEX](../personas/INDEX.md))
- **Dump reproduction** → `RuntimeRunClassWithProfiling` / `RuntimeRunProgramWithProfiling`
- **Runtime investigation needing cross-user auth check** → user does SU53 externally

## Question Strategy

**Rule**: max 3 questions per response. Never re-ask what MCP already answered.

Priority when information is missing:

1. Exact error text + message class/number — the strongest SAP Note search key
2. TCode / App / Program / Job where the error occurs
3. Reproduction conditions (always vs intermittent; user/data/org specificity)

Situation-specific follow-ups:

- **Authorization suspected**: Does another user succeed with the same input? Any SU53 capture?
- **Batch suspected**: Does manual execution also fail? Any recent variant change?
- **Interface suspected**: Does SM59 Connection Test succeed? What is the IDoc status code (51/52/53/64)?
- **Custom development suspected**: (First run `ListTransports` + `GetWhereUsed`, then) Does TR candidate X match the timing of the incident?
- **Standard bug suspected**: Release/SP auto-detected via `GetSession`. Does the same symptom reproduce on QAS/DEV?
- **Performance suspected**: How much slower than usual? Which resource saturates first — DB / CPU / memory?

## Output Format

### Per-Round Structure

Each analysis round follows this structure:

```
## 📊 Symptom Analysis — Round N

### ✅ Evidence Collected via MCP
- **System**: {SID} / {client} / {release} / {SP} / {user}
- **Findings**:
  - {Finding 1 — MCP tool used}
  - {Finding 2 — MCP tool used}
  - ...

### 🎯 Current Hypotheses (by confidence)
1. **[Category] {Hypothesis summary}** — Confidence: High / Medium / Low
   - Evidence: {MCP findings / user answers}
   - Confirmation: {next verification step}
2. **[Category] ...** — Confidence: ...
3. ...

### ❓ Questions for You (max 3)
1. {Question 1}
2. {Question 2}

### 🔍 SAP Note Search Keywords (priority-ordered)
- "{exact error message}"
- {message class} {message number}
- {program / class name}
- {component} {keyword}

### 👉 Next Steps
- ✅ Can do now: {additional MCP queries / local actions}
- ⏳ After your input: {what requires the user's answers}
- 🚨 Escalation candidates: {target} — reason: {why}
```

### Final Round

In the final round (no open questions), produce a consolidated report with final hypothesis, SAP Note strategy, and recommended action list. Structure:

```
## 🏁 Final Analysis — {symptom summary}

### Root Cause
- **Category**: {one of 8 framework categories}
- **Confirmed evidence**: {list}
- **Confidence**: High / Medium / Low

### SAP Note Search Strategy
- Primary keywords: {ordered list}
- Recommended Notes portal queries: {2–3 concrete search strings}

### Recommended Actions
1. {action 1 — owner, urgency}
2. {action 2}
3. ...

### Escalation (if any)
- Target: {Basis / Development / SAP Support / Functional}
- Reason: {why}
- Artifacts to attach: {dump ID, TR number, screenshot refs}
```

### Round Counter

Track the round number in memory across the conversation. Do not persist to file — each invocation of this procedure starts at Round 1.

## MCP Tools Used

**Session**

- `GetSession` — system ID, client, release, SP level, current user (Step 1 intake)

**Dump Analysis**

- `RuntimeListDumps` — recent dumps
- `RuntimeGetDumpById` — specific dump detail
- `RuntimeAnalyzeDump` — automated dump analysis (location, variables, stack)

**Performance Profiling**

- `RuntimeCreateProfilerTraceParameters` — profiler setup
- `RuntimeRunProgramWithProfiling` / `RuntimeRunClassWithProfiling` — reproducible run with profiler
- `RuntimeListProfilerTraceFiles` / `RuntimeGetProfilerTraceData` / `RuntimeAnalyzeProfilerTrace` — trace analysis

**Transport / Change Tracking**

- `ListTransports` — recent transports
- `GetTransport` — objects included in a transport
- `GetObjectInfo` — author, last changed by, modification date

**Code Analysis**

- `ReadClass` / `ReadProgram` / `ReadFunctionModule` / `ReadInterface` — source
- `GetProgFullCode` — full source including includes
- `GetAbapAST` — parse tree
- `GetAbapSemanticAnalysis` — semantic analysis (activation / type errors)
- `GetWhereUsed` — caller graph
- `GetInactiveObjects` — any inactive objects remaining

**Enhancement**

- `GetEnhancements` — enhancements attached to program
- `GetEnhancementImpl` / `GetEnhancementSpot` — implementation and spot detail

**Data Dictionary** (schema only — not row extraction)

- `GetTable` / `GetStructure` / `GetView` / `GetDataElement` / `GetDomain`

**Search**

- `SearchObject` — existence / type check
- `DescribeByList` — batch metadata lookup

## Safety Rails

- Blocklist: `GetTableContents` / `GetSqlQuery` are forbidden in this procedure.
- No speculation: "probably" statements must be rejected; declare the round BLOCKED instead.
- No re-asking: any item already in `mcp_confirmed` must NOT appear as a user question.

## Common Pitfalls to Avoid

- ❌ Asking the user for information MCP can retrieve (system info, program source, recent transports)
- ❌ Firing 4+ questions at once
- ❌ Diagnosing a root cause without an error message in hand
- ❌ Skipping `RuntimeListDumps` when a dump is suspected and speculating instead
- ❌ Deflecting with "contact Basis / dev team" without a concrete checklist and evidence
- ❌ Claiming a standard SAP bug before attempting a SAP Note search
- ❌ Blaming recent changes without inspecting transport history via `ListTransports`
- ❌ Listing 4+ hypotheses (narrow to 2–3)
