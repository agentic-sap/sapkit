# vsp-custom 사용 매뉴얼

> 이 문서는 커스텀 포크(vsp-custom)의 **사용법** 안내다. 원본 대비 무엇이 왜 바뀌었는지의
> 상세 이력은 [CUSTOMIZATIONS.md](CUSTOMIZATIONS.md), 원본 기능 전반은 [README.md](README.md) 참고.

---

## 1. 원본 vsp와 달라진 점 (한눈에)

| 기능 | 구분 | 설명 |
|------|------|------|
| **ABAP 개발 표준 38종 내장** | 신규 | 네이밍 규칙, Clean ABAP, 필드 타이핑, 프로그램 골격 템플릿, 리뷰 체크리스트가 바이너리에 포함 — AI가 표준을 조회하고 따르며 개발 |
| **표준 조회 도구** | 신규 | `ListStandards` / `GetStandard` (focused·expert), `SAP(action="standards")` (기본 모드), `vsp://standards/*` 리소스 |
| **`InstallALVHandlers`** | 신규 | 재사용 ALV/Tree OOP 핸들러 클래스 7종(`ZCL_S4SAP_CM_*`)을 SAP에 원클릭 설치 |
| **`--offline` 모드** | 신규 | SAP 연결 없이 MCP 서버 기동 — 폐쇄망에서 로컬 ABAP 프로젝트 개발 |
| **HTTP 423 픽스** | 수정 | 소스 쓰기 시 `InvalidLockHandle` 오류 해결 (issue #88) |

원본의 모든 기능(ADT CRUD, 디버깅, ATC, 트랜스포트 등)은 그대로 유지된다.

---

## 2. 설치

```bash
# 빌드 (Go 1.25+, C 컴파일러 불필요)
cd vibing-steampunk
CGO_ENABLED=0 go build ./cmd/vsp        # → vsp.exe 생성
```

SAP 개발 프로젝트의 `.mcp.json`이 이 `vsp.exe`를 가리키게 한다.

**온라인 (SAP 연결):**
```json
{
  "mcpServers": {
    "abap": {
      "command": "D:/Claude for SAP/vsp/vibing-steampunk/vsp.exe",
      "env": {
        "SAP_URL": "https://your-sap-host:44300",
        "SAP_USER": "username",
        "SAP_PASSWORD": "password"
      }
    }
  }
}
```

**오프라인 (폐쇄망):**
```json
{
  "mcpServers": {
    "abap-offline": {
      "command": "D:/Claude for SAP/vsp/vibing-steampunk/vsp.exe",
      "args": ["--offline"]
    }
  }
}
```

---

## 3. 온라인 개발 — 표준 기반 워크플로우

기본 모드(hyperfocused)에서는 `SAP` 도구 하나로 모든 작업을 한다.
AI 에이전트에게 권장되는 개발 순서:

```
# 1. 개발 전: 적용할 표준 확인
SAP(action="standards")                                          → 표준 목록
SAP(action="standards", target="rules/naming-conventions.md")    → 네이밍 규칙
SAP(action="standards", target="templates/procedural/main-program.abap")  → 골격

# 2. (ALV 프로그램인 경우) 재사용 핸들러 설치 — 시스템당 1회
SAP(action="system", params={"type": "install_alv_handlers", "check_only": true})  → 사전 점검
SAP(action="system", params={"type": "install_alv_handlers"})                      → 설치

# 3. 템플릿을 미러링하여 코드 생성·활성화 (기존 vsp 도구 그대로)
SAP(action="create", ...) / SAP(action="edit", ...)

# 4. 개발 후: 체크리스트로 검증
SAP(action="standards", target="quality/phase6-review.md")
```

- 도움말: `SAP(action="help", target="standards")`
- focused/expert 모드에서는 독립 도구 사용: `ListStandards`, `GetStandard(path)`,
  `InstallALVHandlers(package, check_only)`

**주요 표준 문서 목록**

| 경로 | 내용 |
|------|------|
| `rules/naming-conventions.md`, `rules/naming-conventions-objects.md` | 프로그램/오브젝트 네이밍 규칙 |
| `rules/clean-code.md` (+`-oop`, `-procedural`) | Clean ABAP 표준 |
| `rules/field-typing-rule.md` | 데이터엘리먼트 우선 필드 타이핑 |
| `rules/include-structure.md`, `rules/ok-code-pattern.md` | 인클루드 구조, 화면 OK_CODE 패턴 |
| `rules/abap-release-reference.md` (+`-examples`) | 릴리스별 허용 문법 (740~758) |
| `rules/data-extraction-policy.md` | PII/민감 테이블 추출 차단 정책 |
| `templates/oop/`, `templates/procedural/`, `templates/alv/`, `templates/ecc/` | 프로그램 골격 정본 |
| `quality/phase6-review.md`, `quality/analysis-dimensions.md` | 12섹션 리뷰 체크리스트, 14차원 루브릭 |

**`InstallALVHandlers` 참고**: 기본 로컬 패키지 `$ZS4SAP_CM`에 인터페이스 1 + 예외클래스 1 +
핸들러 5를 의존성 순서로 배포한다. 메시지클래스 `S_UNIFIED_CON`이 시스템에 없어도
**활성화는 성공**하며, 없으면 런타임 예외 텍스트만 비므로 필요 시 SE91로 생성하면 된다.

---

## 4. 오프라인 개발 — 폐쇄망에서 abapGit 프로젝트 작업

보안 정책상 SAP에 MCP를 연결할 수 없는 환경에서, abapGit으로 내려받은
로컬 소스를 개발하는 시나리오.

### `--offline`은 언제 쓰나

| 상황 | 설정 |
|------|------|
| SAP에 연결 가능한 개발 환경 | 온라인(기본) — `--offline` 없이 `SAP_URL`/인증 설정 |
| 폐쇄망 등 SAP 접근 불가, 로컬 소스만 개발 | `--offline` |
| SAP 계정 없이 표준 조회·린트만 필요 | `--offline` |

### 켜고 끄는 방법 — 실행 중 전환이 아니라 "서버 시작 옵션"

`--offline`은 MCP 서버가 **시작될 때** 결정되는 모드다. MCP 서버는 Claude Code가
세션을 시작할 때 `.mcp.json`에 적힌 대로 자동 실행되므로,
**켜고 끄기 = `.mcp.json`을 바꾸고 Claude Code를 재시작(또는 `/mcp`에서 재연결)**
하는 것이다. 실행 중인 서버를 토글하는 스위치는 없다.

방법은 세 가지:

1. **환경(프로젝트)별로 분리 — 권장.** 폐쇄망 PC의 프로젝트에는 오프라인 설정만,
   SAP 연결 가능한 환경의 프로젝트에는 온라인 설정만 둔다. 전환할 일 자체가 없어진다.
2. **한 항목에서 전환.** 같은 `.mcp.json`에서 `"args": ["--offline"]`을 추가/삭제하고
   Claude Code를 재시작한다. (`args` 대신 `"env": {"SAP_OFFLINE": "true"}`도 동일)
3. **둘 다 등록.** `abap`(온라인)과 `abap-offline` 두 항목을 함께 두면 도구가
   서버별 이름으로 둘 다 노출된다. 단, SAP에 닿지 않는 환경에서는 온라인 항목이
   시작 실패로 표시되므로, 폐쇄망에서는 오프라인 항목만 남기는 게 깔끔하다.

터미널에서 동작을 바로 확인하려면: `vsp.exe --offline` — SAP 환경변수 없이
서버가 뜨면 정상이다 (온라인 모드라면 `SAP URL is required` 오류가 난다).

**구성 요소 3가지:**

1. **오프라인 MCP** (`vsp --offline`) — SAP 접속정보 없이 기동. 도구 4개만 등록:

   | 도구 | 용도 |
   |------|------|
   | `ListStandards` / `GetStandard` | 내장 표준 38종 조회 (완전 오프라인) |
   | `AnalyzeABAPCode` (`source` 전달) | 로컬 파서 기반 린트 — 13개 규칙 |
   | `CheckBoundaries` (`source` 전달) | 패키지 경계 위반 분석 |

   에이전트는 Claude Code 자체 파일 도구로 `.abap` 파일을 읽고 쓰면서,
   표준 조회와 코드 검증만 MCP로 수행한다.

2. **오프라인 CLI** — 원본부터 지원되던 기능:
   ```bash
   vsp lint --file zcl_my_class.clas.abap    # 오프라인 린터
   vsp parse --file ...                       # 구문 파싱
   ```

3. **LSP** — `.claude/settings.json`에 등록하면 `.abap` 편집 시 자동 진단.
   SAP_URL이 없으면 자동으로 오프라인 모드(로컬 진단만)로 동작한다:
   ```json
   { "lsp": { "abap": { "command": "path/to/vsp.exe", "args": ["lsp", "--stdio"] } } }
   ```

**오프라인 제한사항**: 활성화, 서버 측 구문검사(SyntaxCheck), 유닛테스트, ATC 등
SAP 시스템이 필요한 작업은 불가 — 로컬 린트/파싱으로 1차 검증하고, 망 연결
환경으로 소스를 가져가 최종 활성화·테스트한다.

---

## 5. 원본(upstream) 업데이트 받기

이 포크는 원본과 연결이 유지되어 있다:

```bash
git fetch upstream
git merge upstream/main    # 충돌 시 CUSTOMIZATIONS.md의 변경 파일 목록 참고
CGO_ENABLED=0 go build ./cmd/vsp && go test ./embedded/... ./internal/...
```

---

## 6. FAQ

**Q. 기본 모드가 뭐지?**
`--mode` 기본값은 hyperfocused(단일 `SAP` 도구)다. 개별 도구를 쓰려면 `--mode focused` 또는 `expert`.

**Q. 표준 문서를 우리 팀 규칙으로 바꾸고 싶다.**
`embedded/standards/rules/`의 마크다운을 수정하거나 새 `.md`를 추가하고 재빌드하면
자동으로 목록·리소스에 반영된다 (별도 등록 코드 불필요).

**Q. ALV 핸들러 클래스를 추가/교체하고 싶다.**
`embedded/alvhandlers/`에 `.abap` 추가 후 `embed.go`의 `GetObjects()`에 배포 순서를
지켜 등록하고 재빌드.

**Q. 오프라인 모드인데 온라인 도구를 부르면?**
아예 등록되지 않으므로 도구 목록에 나타나지 않는다 (오류가 아니라 미노출).

**Q. `SAP URL is required` 오류가 난다.**
온라인 모드에는 `SAP_URL`(+인증)이 필수다. SAP 없이 쓰려면 `--offline`을 붙인다.
