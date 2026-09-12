# AGENTS.md 병합 템플릿 (SAP 프로젝트 루트용)

아래 블록을 대상 SAP 프로젝트의 `AGENTS.md`에 붙여 넣는다. `<LITE>`는 sapkit
설치 캐시 안의 플러그인 루트(`core/`·`server/`가 있는 디렉터리)로 치환.
개발 저장소 루트 경로를 넣지 않는다.

---

## SAP Development Standards (sapkit)

Always-on rules — non-negotiable:

1. Custom objects use `Z`/`Y` prefix. No exceptions.
2. Every change is assigned to a transport request before completion.
3. Objects are activated after create/modify; inactive objects are unfinished work.
4. Check `.sapkit/config.json` (sapVersion, abapRelease) BEFORE any recommendation or
   code — syntax and table world differ by version (details:
   `<LITE>/core/knowledge/abap/conventions/sap-version-reference.md`).
5. Row-level data reads (`GetTableContents`, `GetSqlQuery`) require explicit human
   consent per call (`<LITE>/core/policies/data-protection/data-extraction-policy.md`).
6. Writes to SAP happen only after a human-approved spec
   (`<LITE>/core/policies/approval-gates.md`).
7. If this project root holds a `HANDOFF.md` that carries sapkit's marker
   (`<!-- sapkit:continuity -->` on line 1 — scan the first 20 lines), read it at the
   start of the session, and at session end bring it and `RUN-PLAN.md` beside it up to
   date through the `handoff` skill (`<LITE>/core/procedures/handoff.md`). A same-named
   file without that marker is out of scope: neither create nor update it.

Working assets:

- Procedures (create-program, analyze-symptom, release, …): `<LITE>/core/procedures/`
- Personas (pick ONE via the index, load on demand): `<LITE>/core/personas/INDEX.md`
- Project runtime state contract: `<LITE>/core/project-context.md`
- Full policy set: `<LITE>/core/policies/`
