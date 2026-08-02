# SAPKit

**AI 하네스에서 SAP ABAP를 개발·상담하는 플러그인.** 지식 코어 + 컨설턴트 페르소나 +
게이트 달린 절차 + ABAP ADT MCP 서버를 하나로 묶어, Claude Code·Codex CLI에
`설치 → setup` 두 단계로 올라간다.

[![offline-gates](https://github.com/agentic-sap/sapkit/actions/workflows/offline-gates.yml/badge.svg)](https://github.com/agentic-sap/sapkit/actions/workflows/offline-gates.yml)

| 자산 | 규모 |
|---|---|
| 모듈 지식 팩 | **15** (FI/CO/MM/SD… 14 + BC) — SPRO·BAPI·테이블·워크플로 |
| 산업 · 국가 | **14** 산업 · **16** 국가 (한국 부가세·전자세금계산서 포함) |
| 페르소나 | **26** (모듈 컨설턴트·리뷰어·실행자 — INDEX 선택자로 온디맨드) |
| 절차 | **22** (스킬 노출 **17**) — 사람 승인 게이트 + 새-컨텍스트 리뷰 내장 |
| MCP 도구 | **155** (inspection-only) / **186** (SAP 연결 시) — ADT 기반 읽기·DEV 게이트 쓰기 |

## 빠른 시작

전제: Node.js + 해당 CLI. 플러그인 캐시 경로 복사, 수동 MCP 등록, 훅 설치 — 전부 필요 없다.

**Claude Code**

```text
claude plugin marketplace add agentic-sap/sapkit
claude plugin install sapkit@agentic-sap --scope user
# 새 세션 또는 /reload-plugins
/sapkit:setup
```

**Codex CLI**

```text
codex plugin marketplace add agentic-sap/sapkit
codex plugin add sapkit@agentic-sap
# 새 세션
$sapkit:setup
```

`setup`이 SAP 접속 프로파일 뼈대(비밀번호는 직접 입력), 프로젝트 설정, Codex MCP 배선까지
대화로 안내한다. 프로파일 없이도 지식·절차·상담은 바로 쓸 수 있다(inspection-only).

## 무엇을 하나

| 하고 싶은 것 | 스킬 |
|---|---|
| 모듈 컨설턴트에게 운영 질문 | `/sapkit:ask-consultant` |
| ABAP 코드 14차원 리뷰 | `/sapkit:analyze-code` |
| 프로그램 생성 (인터뷰→스펙→구현→리뷰 E2E) | `/sapkit:create-program` |
| 기존 프로그램 → 기능/기술 명세서 역공학 | `/sapkit:program-to-spec` |
| CBO 패키지 → 업무 프로세스 문서 | `/sapkit:package-to-process` |
| 덤프·로그 기반 운영 사고 원인 분석 | `/sapkit:analyze-symptom` |
| 완료 증거 체인 (소스·활성·유닛·ATC) | `/sapkit:vpass` |

품질 모델은 단순하다: **작업 1명 + 새-컨텍스트 리뷰 1명 + SAP 기계 검증**
(CheckSyntax → Activate → ABAP Unit → ATC). 도구가 성공했다고 완료라 부르지 않는다.

## 안전 모델 — 기본이 잠겨 있다

- **도구면은 readonly가 기본.** write 도구는 프로젝트 설정 `"toolSurface": "development"`
  + 활성 프로파일 `SAP_TIER=DEV` 두 조건이 모두 있어야 열린다. QA/PRD·판정 불가는
  전부 readonly로 fail-closed.
- **안전의 정본은 서버 자체 게이트.** QA/PRD write·실행 거부, 테이블 blocklist,
  inspection-only 정직 실패 — 전부 CI가 실기동 호출로 박제한다
  (`conformance-server-gates`). 클라이언트 훅에 의존하지 않는다.
- **실데이터 2종(`GetTableContents`·`GetSqlQuery`)은 자동 승인 금지.** Claude는
  호출별 승인창, Codex는 `disabled_tools` 하드 차단이 배포 기본.
- **훅 6종은 선택 기능.** 기본 미설치 — 확인창·이중 방어가 필요하면
  `install-hooks.mjs` 한 줄로 켠다. ([안내](interactive/adapters/claude/hooks/README.md))

## 구조

```text
marketplace (이 레포)
  └─ interactive/          ← 설치되는 플러그인 전부
       ├─ core/            ← 지식 178문서 · 페르소나 26 · 절차 22 · 정책
       ├─ skills/          ← /sapkit:* 스킬 17
       ├─ server/          ← ABAP ADT MCP 서버 번들 (launch.cjs → server.bundle.cjs)
       ├─ adapters/        ← Claude · Codex · Antigravity 어댑터 + 선택 훅
       └─ scripts/         ← setup-state · doctor · codex-wire-mcp · 게이트
```

`engine/`·`vsp/` 등 나머지는 공방(개발 도구·소스 정본)이며 설치본에 포함되지 않는다.

## 문서 지도

- 제품 개요·설계: [`interactive/README.md`](interactive/README.md) · [`interactive/DESIGN.md`](interactive/DESIGN.md)
- 어댑터별 안내: [Claude Code](interactive/adapters/claude/README.md) · [Codex](interactive/adapters/codex/README.md) · [Antigravity](interactive/adapters/antigravity/README.md)
- 문제 해결: `/sapkit:troubleshooting` (연결 체크리스트 · 프로파일 · blocklist)
- 업데이트: `claude plugin update sapkit@agentic-sap` / Codex는 `marketplace upgrade` 후 재`add`

## 라이선스

MIT. MCP 서버 엔진은 [abap-mcp-adt-powerup](https://github.com/hjaewon/abap-mcp-adt-powerup) 포크를
차용해 레포 내에서 완전 소유·수리한다(vsp 검증기는 MIT 포크 고지 유지).
