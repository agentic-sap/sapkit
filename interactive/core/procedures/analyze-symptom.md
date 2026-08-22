---
name: analyze-symptom
description: Step-by-step root cause analysis for SAP operational errors — inspect dumps, logs, transports, and where-used relations directly via MCP, narrow hypotheses with minimal user questions, and provide SAP Note search keywords
source:
  - sc4sap-custom/skills/analyze-symptom/SKILL.md
  - sc4sap-custom/skills/analyze-symptom/workflow-steps.md
  - sc4sap-custom/skills/analyze-symptom/output-format.md
---

# Analyze Symptom

Structured root cause analysis for SAP operational incidents, carried out by one agent wired to the live SAP system over MCP. Gather evidence on your own from dumps, system state, recent transports, and code call graphs before any question goes to the user.

## Purpose

The first-line triage procedure for SAP production incidents. Instead of burying the user in questions, **go into the SAP system directly through MCP** and pick up the evidence you can gather yourself. Then ask the user only about the gaps MCP cannot fill, narrow the hypotheses down to 2–3 categories, and produce SAP Note search keywords along with recommended next actions.

## Use When

- The user reports a symptom in words like "error", "dump", "failing", "broken", "not working", "timeout", "slow"
- The user holds at least one clue: an error message, a TCode, a program name, a job name, or the affected user/data
- The user is unsure which log or transaction to open (ST22, SM21, SLG1, SU53, SM13, SM58, WE02, etc.)
- The issue has to be classified as custom development or SAP standard
- The root cause of an incident that began after a recent transport or patch has to be traced

## Do Not Use When

- The root cause is already pinned down and only a code fix remains — reach for the `create-program` procedure or the direct MCP `Update*` calls
- A purely static code quality review — reach for the [analyze-code](analyze-code.md) procedure
- A new ABAP object has to be created — reach for the [create-object](create-object.md) procedure
- A conceptual or configuration-guide question — answer from the matching module consultant persona (see [personas INDEX](../personas/INDEX.md))

## Core Principles

- **MCP-first**: Before anything goes to the user, investigate the SAP system directly with MCP. Never re-ask what MCP can answer.
- **Evidence over assumption**: Do not speculate. No "probably" statement stands without MCP or user-provided evidence behind it.
- **Minimal questions**: 3 questions per round at most. Drop any question whose answer MCP already gave you.
- **Hypothesis narrowing**: Cut the candidate causes to 2–3 out of the 8-category framework; each must carry a confidence level and a confirmation path.
- **Actionable output**: Every hypothesis must name the next evidence step (another MCP call, a TCode, or an escalation target).
- **Customization cache first (local, before live MCP) when a Z*/Y* object or customized SAP include appears in the trace**: read `.sapkit/customizations/<MODULE>/{enhancements,extensions}.json` and correlate — a `Z*` class in a dump may be a BAdI impl already on record, a customized `MV45AFZZ`/`ZXRSRU01` may be a recorded form-based exit, a failing field may be a recorded append. Follow [customization-lookup](customization-lookup.md). Where the cache is absent, suggest generating it (`setup customizations` extraction) but do not block the analysis in hand.

## Analysis Framework

Every hypothesis must map onto one of these 8 root cause categories:

| Category | Typical Symptoms | Key Signals |
|----------|------------------|-------------|
| Master / Input data | Only certain data fails, the rest succeeds | Data values, the related master records |
| Authorization | Only certain users fail | SU53, STAUTHTRACE, recent role changes |
| Customizing | Only certain org units are affected | SPRO values, recent customizing transports |
| Interface / RFC / Batch | An external integration fails | SM58, SMQ1/2, SM37, WE02, BD87 |
| Custom development | Z*/Y* objects sit in the call stack | Recent Z* transports, `GetWhereUsed` |
| Standard SAP bug | Only standard objects in the stack; straight after an SP upgrade | SAP Note search, kernel/SP level |
| Performance / Locks / DB | Timeouts, wait times climbing | ST05, SAT, SM12, SQLM |
| Operational procedure | Step order or a prerequisite was violated | Month-end, dependency job status |

Every hypothesis put to the user must declare its **category** explicitly.

## Evidence Collection Matrix

How evidence gets collected — MCP auto-query first, manual TCode guidance as the fallback:

| Symptom Type | MCP Auto-Query | Manual TCode |
|--------------|----------------|--------------|
| Short dump / runtime error | `RuntimeListDumps`, `RuntimeGetDumpById`, `RuntimeAnalyzeDump` | ST22 |
| Performance / long runtime | `RuntimeRunProgramWithProfiling`, `RuntimeAnalyzeProfilerTrace`, `RuntimeListProfilerTraceFiles` | ST05, SAT, SQLM |
| Suspected program/class logic | `ReadClass`/`ReadProgram`, `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetWhereUsed` | SE80, SE24, SE38 |
| Recent change tracking | `ListTransports`, `GetTransport`, `GetObjectInfo` (Author/Changed-by) | SE09, SE10, SE16 → E070 |
| **Z\*/Y\* object or customized SAP include in trace** | Local file read: `.sapkit/customizations/<MODULE>/enhancements.json` (→ `badiImplementations[]`, `cmodProjects[]`, `formBasedExits[]`) and `.sapkit/customizations/<MODULE>/extensions.json` (→ `appendStructures[]`) | n/a — local cache only |
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

**Rule**: Where an item is MCP-supported, never ask the user — query it directly.

## Workflow Steps

### Step 1 — Initial Triage

- **Recorded failure modes first**: where `.sapkit/RULES.md`, `.sapkit/LESSONS.md`, or `.sapkit/knowledge/system.md` exist, grep them for the symptom's key terms (a fragment of the error text, a tool name, a TCode — a bounded grep, not a full read). A matching entry short-circuits the hypothesis space: this system has failed this way before and the verified cause is already written down (a profile-resolution rule, say, explains an authentication error better than any fresh investigation will). Cite the matched `R-`/`L-`/`KS-` id in the diagnosis. Files absent → skip silently. Contract: [knowledge-sourcing](../policies/knowledge-sourcing.md).
- Pull out the clues the user supplied: error text, message class/number, TCode, program/class name, affected user, timing, dump indicators.
- Call `GetSession` to capture the system info (SID, client, release, SP, current user).
- Bundle the structured clue set with the system info and move on to Step 2.

Exit condition: `<CLUES>` and `<SESSION_INFO>` resolved.

### Step 2 — Investigate + Gap + Narrow (one round; repeatable)

Adopt the [sap-debugger](../personas/sap-debugger.md) persona for this step. Run the full root-cause analysis on the reported incident, carrying forward the clues you know, the system info, and the findings of the previous round (empty on the first round).

What you own (ALL of it in one round):

**A. AUTO-INVESTIGATE via MCP — never ask the user, fetch directly:**

- Dump path: `RuntimeListDumps` → `RuntimeGetDumpById` → `RuntimeAnalyzeDump`
- Recent changes: `ListTransports` (last 7d) → `GetTransport` (candidate TRs) → `GetObjectInfo`
- Code path: `ReadClass` / `ReadProgram` / `ReadFunctionModule` → `GetAbapAST` → `GetWhereUsed`
- Enhancement: `GetEnhancements` → `GetEnhancementImpl` / `GetEnhancementSpot`
- Customization: read `.sapkit/customizations/<MODULE>/{enhancements,extensions}.json` (local file)
- Profiler: `RuntimeRunProgramWithProfiling` → `RuntimeAnalyzeProfilerTrace` (when TIME_OUT / slowness)

**B. GAP IDENTIFICATION** — hold the evidence MCP collected apart from the areas MCP cannot reach (SU53 authorization trace, SLG1 app log, SM13 update, SM58 RFC, SM37 jobs, WE02 IDoc, /IWFND/ERROR_LOG OData).

**C. HYPOTHESIS NARROWING** — bring it down to 2–3 candidate causes out of the 8-category framework above. Each hypothesis MUST include:

- category
- confidence: High | Medium | Low
- evidence (a bullet list of the MCP facts behind it)
- confirmation_path (the next probe: an MCP call, a TCode, or a user question)

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
- When a Z*/Y* object or customized SAP include appears in the trace, the reverse-lookup through the local customization cache is MANDATORY, per the Evidence Collection Matrix.
- Where narrowing is impossible because 4+ categories fit equally well, mark the round BLOCKED with the reason, then put one disambiguating question to the user before a new round starts.

### Step 3 — User Questions (round N)

Render the round's result:

```
✅ Confirmed via MCP:
  <mcp_confirmed bullet list>

❓ Need your input (max 3):
  <priority_questions>

🎯 Leading hypotheses (2–3):
  <per-hypothesis: category · confidence · evidence summary>
```

Wait for the user's answers. When answers arrive → re-run Step 2 (round N+1) with the previous findings carried forward. When the user closes the loop ("yes, SU53 dump attached" or "no more input", say), move on to Step 4.

Max 3 questions per round. Any item already sitting in `mcp_confirmed` must NOT come back as a user question.

### Step 4 — SAP Note Keywords

Assemble search strings ready to paste, ordered most-specific → broadest, out of `sap_note_hints` and the user-confirmed evidence:

1. The exact error string in quotes, plus message class and number
2. The dump's runtime error name (e.g., `MESSAGE_TYPE_X`, `ASSERTION_FAILED`)
3. The program / class / function module name
4. Component plus a symptom keyword (`FI-GL open period short dump`)
5. TCode plus a symptom keyword

Suggest the filters: release, SP level, kernel level, component.

### Step 5 — Recommended Actions

Sort the actions by who can carry them out:

- **Immediately actionable**: further MCP queries, local file checks
- **Requires SAP GUI access**: SU53, SM13, SM58, STMS, etc. (the `mcp_unavailable_gaps` items)
- **Escalation**: development team / Basis / module consultant

Draw them straight off each hypothesis's `confirmation_path`.

### Step 6 — Escalation Routing

Once a hypothesis is confirmed, hand off to the right follow-up:

- **Custom code fix** → direct `UpdateClass` / `UpdateProgram` / `UpdateInclude` MCP calls (as the [sap-debugger](../personas/sap-debugger.md) persona in write mode)
- **Code quality review** → the [analyze-code](analyze-code.md) procedure
- **Module-specific configuration deep-dive** → adopt the matching sap-{module}-consultant persona (see [personas INDEX](../personas/INDEX.md))
- **Dump reproduction** → `RuntimeRunClassWithProfiling` / `RuntimeRunProgramWithProfiling`
- **Runtime investigation needing a cross-user auth check** → the user runs SU53 externally

Once a hypothesis is **confirmed**, route what it taught by record — offer it, never assume it, one line each. A single incident can warrant **both**; neither stands in for the other:

- **The verified failure cause and the rule preventing recurrence** → [lesson](lesson.md) (VERIFY + approval gates apply)
- **The independent business or this-system fact the failure exposed** — a legacy table's real grain, a status code's non-obvious meaning here, a customer-specific process rule → [knowledge](knowledge.md)

Before the knowledge half is offered, grep `.sapkit/knowledge/domain.md` and `system.md` for the candidate's key terms (a bounded grep, not a full read) — a fact already on record is not offered again. An unconfirmed hypothesis routes to neither. Nothing newly established → no prompt.

## Question Strategy

**Rule**: max 3 questions per response. Never re-ask what MCP has already answered.

Priority where information is missing:

1. The exact error text plus message class/number — the strongest SAP Note search key
2. The TCode / App / Program / Job the error occurs in
3. The reproduction conditions (always vs intermittent; specific to a user/data/org or not)

Follow-ups tied to the situation:

- **Authorization suspected**: Does the same input succeed for another user? Any SU53 capture to hand?
- **Batch suspected**: Does a manual execution fail too? Any recent change to the variant?
- **Interface suspected**: Does the SM59 Connection Test pass? Which IDoc status code came back (51/52/53/64)?
- **Custom development suspected**: (Run `ListTransports` + `GetWhereUsed` first, then) Does TR candidate X line up with the timing of the incident?
- **Standard bug suspected**: Release/SP is auto-detected via `GetSession`. Does the same symptom reproduce on QAS/DEV?
- **Performance suspected**: How much slower than usual is it? Which resource saturates first — DB / CPU / memory?

## Output Format

### Per-Round Structure

Every analysis round takes this structure:

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

In the final round — nothing left open — produce a consolidated report carrying the final hypothesis, the SAP Note strategy, and the list of recommended actions. Structure:

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

Keep the round number in memory across the conversation. Do not persist it to file — every invocation of this procedure begins at Round 1.

## MCP Tools Used

**Session**

- `GetSession` — system ID, client, release, SP level, current user (the Step 1 intake)

**Dump Analysis**

- `RuntimeListDumps` — the recent dumps
- `RuntimeGetDumpById` — detail on one specific dump
- `RuntimeAnalyzeDump` — automated dump analysis (location, variables, stack)

**Performance Profiling**

- `RuntimeCreateProfilerTraceParameters` — setting the profiler up
- `RuntimeRunProgramWithProfiling` / `RuntimeRunClassWithProfiling` — a reproducible run under the profiler
- `RuntimeListProfilerTraceFiles` / `RuntimeGetProfilerTraceData` / `RuntimeAnalyzeProfilerTrace` — analysis of the trace

**Transport / Change Tracking**

- `ListTransports` — the recent transports
- `GetTransport` — the objects a transport includes
- `GetObjectInfo` — author, last changed by, modification date

**Code Analysis**

- `ReadClass` / `ReadProgram` / `ReadFunctionModule` / `ReadInterface` — the source
- `GetProgFullCode` — the full source, includes and all
- `GetAbapAST` — the parse tree
- `GetAbapSemanticAnalysis` — semantic analysis (activation / type errors)
- `GetWhereUsed` — the caller graph
- `GetInactiveObjects` — any inactive objects still left

**Enhancement**

- `GetEnhancements` — the enhancements attached to a program
- `GetEnhancementImpl` / `GetEnhancementSpot` — implementation and spot detail

**Data Dictionary** (schema only — not row extraction)

- `GetTable` / `GetStructure` / `GetView` / `GetDataElement` / `GetDomain`

**Search**

- `SearchObject` — existence / type check
- `DescribeByList` — batch metadata lookup

## Safety Rails

- Blocklist: `GetTableContents` / `GetSqlQuery` are forbidden in this procedure.
- No speculation: a "probably" statement must be rejected; declare the round BLOCKED instead.
- No re-asking: anything already in `mcp_confirmed` must NOT appear as a user question.

## Common Pitfalls to Avoid

- ❌ Asking the user for information MCP can fetch (system info, program source, recent transports)
- ❌ Firing 4+ questions in one go
- ❌ Diagnosing a root cause without an error message in hand
- ❌ Skipping `RuntimeListDumps` where a dump is suspected, and speculating instead
- ❌ Deflecting with "contact Basis / dev team" without a concrete checklist and evidence
- ❌ Claiming a standard SAP bug before a SAP Note search has been attempted
- ❌ Blaming recent changes without checking the transport history via `ListTransports`
- ❌ Putting up 4+ hypotheses (narrow to 2–3)
