# AGENTS.md 병합 템플릿 (SAP 프로젝트 루트용)

아래 블록을 대상 SAP 프로젝트의 `AGENTS.md`에 붙여 넣는다. `<LITE>`는 sap-agentic-harness
설치 경로(예: `D:\claude for SAP\sap-agentic-harness`)로 치환.

---

## SAP Development Standards (sap-agentic-harness)

Always-on rules — non-negotiable:

1. Custom objects use `Z`/`Y` prefix. No exceptions.
2. Every change is assigned to a transport request before completion.
3. Objects are activated after create/modify; inactive objects are unfinished work.
4. Check `.sc4sap/config.json` (sapVersion, abapRelease) BEFORE any recommendation or
   code — syntax and table world differ by version (details:
   `<LITE>/core/knowledge/abap/conventions/sap-version-reference.md`).
5. Row-level data reads (`GetTableContents`, `GetSqlQuery`) require explicit human
   consent per call (`<LITE>/core/policies/data-protection/data-extraction-policy.md`).
6. Writes to SAP happen only after a human-approved spec
   (`<LITE>/core/policies/approval-gates.md`).

Working assets:

- Procedures (create-program, analyze-symptom, release, …): `<LITE>/core/procedures/`
- Personas (pick ONE via the index, load on demand): `<LITE>/core/personas/INDEX.md`
- Project runtime state contract: `<LITE>/core/project-context.md`
- Full policy set: `<LITE>/core/policies/`
