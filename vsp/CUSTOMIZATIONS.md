# vsp-custom 커스터마이징 내역

> 이 문서는 [oisee/vibing-steampunk](https://github.com/oisee/vibing-steampunk) (MIT) 원본 대비
> 이 포크(`hjaewon/vsp-custom`)에서 수정·추가한 내용을 정리한 것이다.
> 작성일: 2026-07-07

## 목적

vsp는 SAP ADT에 대한 CRUD 도구를 제공하지만, ABAP 코드 생성 시 따를 **업계 표준
템플릿·네이밍 컨벤션·개발 방법론**이 없어 결과물이 LLM의 일반 지식에만 의존하는
한계가 있었다. 이 포크는 SuperClaude for SAP(sc4sap)의 개발 표준 자산을 vsp 바이너리에
내장하여, AI 에이전트가 **표준 규칙 조회 → 골격 템플릿 미러링 → 재사용 클래스 활용 →
리뷰 체크리스트 검증**의 체인을 따라 ABAP을 개발하도록 만든다.

## 저장소 구성

| 원격 | 주소 | 용도 |
|------|------|------|
| `origin` | github.com/hjaewon/vsp-custom (비공개) | 커스텀 버전 저장 |
| `upstream` | github.com/oisee/vibing-steampunk | 원본 업데이트 수신 (`git fetch upstream && git merge upstream/main`) |

## 변경 내역 (커밋순)

### 1. `642c03c` — fix: HTTP 423 InvalidLockHandle (issue #88)

원본 미수정 버그의 로컬 픽스. CLI로 ABAP 소스를 쓸 때 lock → syntax check → write
순서에서 `SyntaxCheck`가 stateless로 실행되어 lock 세션이 롤백되고 HTTP 423이
발생하던 문제.

| 파일 | 변경 |
|------|------|
| `pkg/adt/devtools.go` | `SyntaxCheck` HTTP 호출을 `Stateful: true`로 변경 (+1줄) |
| `cmd/vsp/cli.go` | `getClient`가 `SAP_ALLOW_TRANSPORTABLE_EDITS` / `SAP_ENABLE_TRANSPORTS` 환경변수를 인식하도록 추가 (+7줄) |

### 2. `f18490a` — feat: ABAP 개발 표준 내장 (48개 파일, +3,903줄)

sc4sap-custom의 개발 표준 자산 38종을 `embedded/standards/`에 큐레이션하여 내장.
원본 문서의 sc4sap MCP 도구명은 vsp 도구명으로 치환했고, sc4sap 전용 오케스트레이션
참조(에이전트명, 스킬 경로, config)는 제거·중립화했다.

**내장 자산 (`embedded/standards/`)**

| 카테고리 | 수량 | 내용 |
|----------|------|------|
| `rules/` | 20 | 네이밍 규칙(+오브젝트별 상세표), Clean ABAP 3종(공통/OOP/Procedural), 필드 타이핑(DE-First), 인클루드 구조, OK_CODE 패턴, OOP 2-클래스 패턴, ALV 규칙, FORM 네이밍, 상수/텍스트요소/FM 규칙, 릴리스별 문법 매트릭스+예제, SAP 버전/Cloud 제약, ECC DDIC 폴백, 데이터 추출 보안 정책 |
| `templates/` | 16 | OOP 2-클래스 프로그램 골격 11파일(`templates/oop/`), Procedural 정본(`templates/procedural/`), ALV 필드카탈로그 가이드(`templates/alv/`), ECC DDIC 생성 헬퍼 3종(`templates/ecc/`) |
| `quality/` | 2 | 12섹션 코드리뷰 체크리스트(`phase6-review.md`), 14차원 분석 루브릭(`analysis-dimensions.md`) |

**새 코드**

| 파일 | 역할 |
|------|------|
| `embedded/standards/embed.go` | `//go:embed` 파일시스템 + `List()`/`Read()` (베어 파일명·대소문자 허용 조회) |
| `embedded/standards/embed_test.go` | 카테고리 존재·경로/베어명 조회·미존재 오류 검증 4건 |
| `internal/mcp/handlers_standards.go` | `ListStandards`/`GetStandard` 핸들러 + `vsp://standards/*` 리소스 등록 (원본에서 선언만 되고 미사용이던 MCP resources 표면 최초 활용) |
| `internal/mcp/tools_register.go` | `registerStandardsTools` 등록 |
| `internal/mcp/tools_focused.go` | focused 화이트리스트 추가 |
| `internal/mcp/handlers_universal.go` | hyperfocused 단일 `SAP` 도구에 `standards` 액션 추가 |
| `internal/mcp/handlers_help.go` | 내장 help의 액션 목록·베스트프랙티스에 standards 반영 |
| `internal/mcp/server.go` | 서버 기동 시 리소스 등록 호출 |
| `MCP_USAGE.md` / `README.md` | 표준 우선 워크플로우 안내 / 포크 고지 |

### 3. `ae2ef85` — feat: InstallALVHandlers (15개 파일, +3,947줄)

표준 템플릿이 참조하는 재사용 ALV/Tree OOP 핸들러 클래스를 내장하고, 기존
`InstallZADTVSP` 패턴을 따라 SAP 시스템에 원클릭 배포하는 도구를 추가.

**내장 자산 (`embedded/alvhandlers/`)** — 원본(`sc4sap-custom/abap/alv-oop-handlers/`)과
SHA256 바이트 일치, 의존성 배포 순서로 정렬:

1. `ZIF_S4SAP_CM` (인터페이스) → 2. `ZCX_S4SAP_EXCP` (예외) → 3. `ZCL_S4SAP_CM_OALV` →
4. `ZCL_S4SAP_CM_OTREE` → 5. `ZCL_S4SAP_CM_ALV_EVENT` → 6. `ZCL_S4SAP_CM_TREE_EVENT` →
7. `ZCL_S4SAP_CM_ALV` (메인 래퍼, 1,922줄)

**새 코드**:

- `embedded/alvhandlers/embed.go` — `GetObjects()`로 배포 순서·오브젝트 메타데이터를
  정의하는 곳. **핸들러 클래스를 추가/교체하려면 이 파일부터 수정**한다. (+`embed_test.go`)
- `internal/mcp/handlers_install_alv.go` — `handleInstallALVHandlers`: 패키지 생성 →
  `WriteSource` upsert 순회 → 결과 집계. 기본 패키지 `$ZS4SAP_CM`, `check_only` 지원.
- 등록 4곳: `tools_register.go`, `tools_focused.go`, `tools_groups.go`의 `I` 그룹,
  hyperfocused 라우트(`handlers_install.go`의 `case "install_alv_handlers"`) + help 텍스트.

### 4. `1e909a6` — fix: Codex 외부 리뷰 반영 (4개 파일)

커밋 f18490a에 대한 Codex CLI 리뷰(MINOR 3건, CRITICAL/MAJOR 0건) 반영:

1. `ListStandards` 출력·오류 문구가 hyperfocused 모드에 존재하지 않는 도구명을 안내하던 문제 → 모드 중립 문구로 수정
2. `SAP(action="help", target="standards")` 전용 help 토픽 추가
3. `MCP_USAGE.md` 모드 다이어그램의 낡은 도구 수 표기 제거

### 5. `a56a1ea` — feat: `--offline` 모드 (SAP 연결 없는 MCP 서버)

폐쇄망(보안망 분리) 환경에서 abapGit으로 체크아웃한 로컬 ABAP 프로젝트를 개발할 수
있도록, SAP 접속정보 없이 MCP 서버를 기동하는 모드. 참고로 CLI(`vsp lint/parse`)와
LSP(`vsp lsp --stdio`, SAP_URL 없으면 자동 오프라인)는 원본부터 오프라인을 지원했고,
MCP 서버 모드만 SAP_URL 필수였다.

- `--offline` 플래그 (또는 `SAP_OFFLINE` 환경변수): SAP URL·인증 검증을 건너뛰고 기동.
  `--mode`보다 우선하며, ADT 클라이언트/feature prober/keep-alive를 생성하지 않는다.
- 등록 도구는 오프라인 안전 4종만: `ListStandards`, `GetStandard`,
  `CheckBoundaries`(source 모드), `AnalyzeABAPCode`(source 모드) + `vsp://standards/*` 리소스
- `AnalyzeABAPCode`에 nil 클라이언트 가드 추가: source가 있으면 로컬 분석 함수
  (`adt.AnalyzeABAPSource`)를 직접 호출, 없으면 명확한 오프라인 오류 반환
  (가드 없이 nil receiver로 호출하면 `checkSafety`에서 패닉)
- URL 없이 기동 실패 시 오류 메시지에 `--offline` 힌트 추가

| 파일 | 변경 |
|------|------|
| `cmd/vsp/main.go` | `--offline` 플래그·env 해석, 검증 스킵, 인증 처리 3종 가드 |
| `internal/mcp/server.go` | `Config.Offline`, `NewServer` 오프라인 조기 분기 |
| `internal/mcp/tools_register.go` | `registerOfflineTools()` — 4개 도구만 등록 |
| `internal/mcp/handlers_codeanalysis.go` | nil 클라이언트 가드 + 로컬 분석 직접 호출 |
| `README.md` / `MCP_USAGE.md` | 오프라인 모드 안내 추가 |

## 새로 추가된 MCP 표면 요약

| 모드 | 접근 방법 |
|------|-----------|
| hyperfocused (기본) | `SAP(action="standards")` 목록 / `SAP(action="standards", target="rules/naming-conventions.md")` 조회 / `SAP(action="system", params={"type": "install_alv_handlers"})` 설치 |
| focused / expert | `ListStandards`, `GetStandard(path)`, `InstallALVHandlers(package, check_only)` |
| 모든 모드 | MCP 리소스 `vsp://standards/*` 38종 |
| `--offline` (SAP 연결 없음) | `ListStandards`, `GetStandard`, `CheckBoundaries(source)`, `AnalyzeABAPCode(source)` + 리소스 38종 |

## 에이전트 권장 워크플로우

```
1. ListStandards                                → 적용할 규칙·템플릿 파악
2. GetStandard("rules/naming-conventions.md")   → 규칙 로드
   GetStandard("templates/oop/zrsc4sap_oop_ex.prog.abap" 등) → 골격 미러링
3. (ALV 필요 시) InstallALVHandlers             → ZCL_S4SAP_CM_* 재사용 클래스 설치
4. 코드 생성·활성화 후 GetStandard("quality/phase6-review.md")로 검증
```

## 자산 출처 및 라이선스

- 원본 vsp: MIT (Alice Vinogradova and contributors) — `LICENSE` 유지
- 내장 표준·템플릿·ALV 핸들러: sc4sap-custom (MIT, Copyright (c) 2026.04.14 paek seunghyun)에서 이식
- sc4sap의 GPL-3.0 자산(`skills/sap-abap` 언어 레퍼런스 28종 + 인덱스 1)은 라이선스 사유로 **제외**
- 저장소를 public으로 전환할 경우: sc4sap 출처 고지 파일을 `embedded/standards/`에 추가할 것,
  그리고 내장 표준 문서가 조직 내부 표준 성격인지 공개 적합성을 먼저 판단할 것

## 빌드 및 배포

```bash
# 빌드 (Go 1.25+, CGO 불필요)
CGO_ENABLED=0 go build ./cmd/vsp

# 검증
go vet ./internal/mcp/ ./embedded/...
go test ./embedded/... ./internal/...
```

빌드된 `vsp.exe`를 SAP 개발 프로젝트의 `.mcp.json`이 가리키는 경로에 배치해야
새 기능이 반영된다.

## 알려진 사항

- **기본 모드는 hyperfocused** (`cmd/vsp/main.go`의 `--mode` 기본값): 단일 `SAP` 도구만
  노출되므로 표준 접근은 `standards` 액션 경유. focused/expert에서만 독립 도구 등장.
- **`S_UNIFIED_CON` 메시지클래스**: `ZCX_S4SAP_EXCP`가 상수 리터럴로만 참조하므로 대상
  시스템에 없어도 활성화는 성공한다. 없으면 런타임 예외 텍스트만 누락 — 필요 시 SE91로
  생성 (도구 출력에 안내 포함).
- **템플릿 오브젝트명 유지**: `ZRSC4SAP_*`, `ZCL_S4SAP_CM_*` 네이밍은 규칙 문서와의
  상호 참조 때문에 원본 그대로 유지했다.
