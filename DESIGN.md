# SAP Agentic Harness — 설계서 v2.1

> **상태: 설계 확정 (2026-07-09). 구현 미착수. Codex(0.143.0)·Fable 5 독립 이중 리뷰 반영(v2.1).**
>
> 이 문서는 컨텍스트 클리어 후 어떤 세션이든 **이 문서만 읽고** 개발을 시작할 수 있도록 작성된
> 단일 소스다. 설계 근거가 되는 사실은 §15에 파일:라인 단위로 기록했으므로, 구현 세션은
> 의심되는 전제만 재검증하면 된다.
>
> v1 대비 변경: 검증 백엔드 확정(vsp-custom, §3) · repo↔SAP 진실 원천 절 신설(§6) ·
> TDD 2단 구조 신설(§7) · verify 실패 분류 신설(§9) · verify 예시 시그니처 실측 수정(§8) ·
> packs 이중 구조 명시(§12) · MCP Handling을 "원칙"에서 "엔진 불변식"으로 재서술(§5).
>
> v2.1 변경(이중 리뷰 반영): 배포 명령 실측 정정(§3·§8.3·§15-V6) · offline 게이트
> exit 의미론 정정(§8.1) · 자격증명 스코핑 신설(§8.4) · TDD 기계 강제 한계 명시(§7) ·
> drift 정규화 상세화(§6) · verify 실패 마커 규약(§9) · Phase 0을 0a/0b로 분리(§13).

## 0. 한 문장 요약

`sap-agentic-harness`는 `final-harness`의 검증/학습 루프(verify 스냅샷, LESSONS→RULES)를
`vsp-custom`의 SAP ADT CLI 실행 능력과 결합해, ABAP/RAP/CDS/AMDP 개발을 안전한 step 기반
에이전틱 엔지니어링 프로세스로 만들고, 실전 실패에서 증류된 규칙을 모듈 지식으로
축적해가는 통합 레이어 레포다.

## 1. 레포 좌표 (Repository Coordinates)

폴더 경로는 바뀔 수 있으므로 **git 레포 URL을 기준으로 추적한다.** 로컬 경로는 2026-07 기준 참고값.

| 역할 | Git 레포 | 로컬 경로 (참고) | 버전 | 라이선스 |
|---|---|---|---|---|
| **하네스 엔진** | `https://github.com/hjaewon/claude-fable-final.git` | `D:\claude-practice\claude-fable-final` | v0.12.1 (2651854) | 자작 |
| **SAP 검증/배포 백엔드** | `https://github.com/hjaewon/vsp-custom.git` | `D:\claude for SAP\vsp\vsp-custom` | aab1275 (2026-07-07) | MIT — 업스트림 `oisee/vibing-steampunk` |
| 지식 시드 (동결 — 지식 수정 금지, 2026-07-10) | `https://github.com/hjaewon/sc4sap-custom.git` | `D:\claude for SAP\sc4sap-custom` | — | MIT — 업스트림 `babamba2/superclaude-for-sap` |
| **지식 정본 + 3사 대화형 트랙** | 본 레포 `interactive/` (2026-07-10 subtree 병합, 플러그인명 sap-agentic-harness) | `D:\claude for SAP\sap-agentic-harness\interactive` | L5+리뷰 반영 | MIT 승계 — 설계: `interactive/DESIGN.md` |
| 비교 검토된 MCP 서버 | `https://github.com/hjaewon/abap-mcp-adt-powerup.git` | `D:\claude for SAP\abap-mcp-adt-powerup` | v4.13.0 | — |
| **본 레포** | `https://github.com/hjaewon/sap-agentic-harness.git` (main) | `D:\claude for SAP\sap-agentic-harness` | — | — |

위 레포 모두 hjaewon 소유(자작 또는 포크)다. MIT 업스트림이므로 콘텐츠 이식·개작에
법적 제약 없음(저작권 고지 유지). 본 문서의 수치·좌표 검증일: 2026-07-09.

## 2. 목표와 역할 분리

핵심 목표 두 가지:

1. **하네스 기반 SAP 개발** — ABAP, RAP, CDS, AMDP 개발을 계획→실행→검증→실패학습
   루프로 관리한다. 세션의 자기보고를 신뢰하지 않고 하네스가 독립 검증한다.
2. **모듈 전문성 축적** — 모듈 컨설턴트 지식을 정적 문서 복사가 아니라 "실전 실패에서
   증류된 검증 규칙"으로 축적한다 (LESSONS→RULES 메커니즘 활용, §12).

역할 분리 구조 — 이 레포는 아래에서 ★ 하나만 담당한다:

```text
final-harness (범용 하네스 엔진 — 수정하지 않고 그대로 사용)
      │  설치(harness-init) + 적응(harness-tailor)
      ▼
★ sap-agentic-harness (본 레포 = 통합 레이어)
      │   vsp 어댑터 문서, verify 패턴, SAP 도메인 규칙, 모듈 팩
      ├── vsp-custom ......... CLI 검증/배포 백엔드 (하네스 트랙의 유일한 SAP 접점)
      └── interactive/ ........ 대화형 트랙 (MCP 기반 직접 개발/컨설팅, 3사 하네스) — 본 레포 내
                                서브디렉토리, 하네스 엔진과 코드 의존 없음 (sc4sap-custom은 동결 — 이것이 대체)
```

`final-harness`와 `vsp-custom`은 물리적으로 한 코드베이스로 섞지 않는다. 둘 다 독립
레포로 유지하고, 본 레포는 문서·템플릿·스킬·설정만 가진다. 이유: 업스트림 추적 유지,
vsp는 Go / 하네스는 Python+스킬 / 본 레포는 마크다운으로 기술 스택이 다름.

## 3. 백엔드 결정: vsp-custom vs abap-mcp-adt-powerup

두 도구의 목적은 같다(ADT 경유 SAP 개발 도구 표면). **본 레포의 단일 백엔드는 vsp-custom으로
확정한다.**

결정적 이유 하나로 충분하다: **final-harness는 무인 step 세션을 `--strict-mcp-config`
(MCP 서버 0개)로 기동한다** (§15-F1). powerup은 MCP 전용이므로 하네스 무인 스텝에서
구조적으로 사용 불가능하다. vsp는 CLI가 있어 하네스 엔진이 verify 명령으로 직접 실행하고
exit code로 판정할 수 있다. "어느 쪽이 더 파워풀한가"가 아니라 "하네스 계약을 만족하는가"의
문제이며, 만족하는 쪽은 vsp뿐이다.

전체 비교 (실측 기반):

| 기준 | vsp-custom | abap-mcp-adt-powerup v4.13.0 |
|---|---|---|
| 인터페이스 | **CLI + MCP**(147 tools 또는 1-tool hyperfocused ~200토큰) | MCP 전용 (339 tools 문서 기준, 기본 노출은 exposition 설정으로 축소) |
| 하네스 verify로 사용 | ✅ 셸 실행, exit code | ❌ 무인 step에서 MCP 차단됨 |
| 오프라인 동작 | ✅ `lint/parse --file`, embedded standards | ❌ SAP 연결 필수 |
| 패키지 분석 | ✅ health/boundaries/api-surface/slim/changelog | 조회 위주 (PackageTree 등) |
| RAP 아티팩트 생성 폭 | DDLS/BDEF/SRVD/SRVB 배포 지원 | ✅ 더 넓음 (MDE 생성, CDS unit test 포함) |
| 런타임 진단 | 디버거, 프로파일링 | ✅ 덤프 분석/프로파일러 도구셋 |
| abapGit 통합 | ✅ `--feature-abapgit`, `install abapgit`, 158 타입 export | ❌ |
| ABAP 표준/템플릿 내장 | ✅ ListStandards/GetStandard (hjaewon 포크에서 이미 커스텀) | ❌ (sc4sap 플러그인 계층이 담당) |

**권고 운용:** 본 레포는 powerup에 의존하지 않는다. write까지 vsp로 일원화한다 —
단일 파일은 `vsp deploy <file> <package> [--transport]`, ZIP 묶음은
`vsp copy <archive.zip> --to <package>` (§15-V6). 단 class include(테스트클래스 포함)
배포는 vsp 코드에 TODO로 남아 있어 Phase 0b에서 지원 범위 실측이 필요하다.
powerup이 우위인 영역(RAP 생성 폭,
런타임 진단)은 sc4sap-custom 플러그인을 켠 **대화형 세션**에서 보완한다 — 대화형 세션은
사람 소유라 MCP 사용이 하네스 보증과 충돌하지 않는다.

주의: vsp의 MCP 모드는 본 프로젝트에서 사용하지 않는다. 같은 ADT를 두고 MCP 서버가
2개(powerup + vsp) 공존하면 도구 중복과 권한 정책 이원화가 생긴다. vsp = CLI 전용.

## 4. 아키텍처 계층

```text
sap-agentic-harness/
  harness layer      final-harness 설치본(.harness/) — 계획/루프/검증/학습. 엔진 수정 금지
  sap adapter layer  vsp CLI 호출 규약, verify 패턴, 실패 분류, 안전 프로필
  domain layer       ABAP/RAP/CDS/AMDP 규칙 시드, 템플릿, 체크리스트
  packs layer        모듈 컨설턴트 지식팩 (CONSULT 본체 + RULES 정예, §12)
```

## 5. 엔진 불변식 (final-harness가 이미 기계적으로 보증하는 것)

아래는 본 레포가 새로 설계할 원칙이 아니라 **final-harness v0.12.1 엔진에 이미 구현된
불변식**이다. 본 레포는 이를 전제로 설계한다.

- **무인 step 세션은 MCP 서버 0개로 기동된다** (`--strict-mcp-config`, codex 드라이버는
  서버별 `enabled=false`). 따라서 "무인 agent가 MCP로 SAP를 바꾸는" 시나리오는
  봉쇄된다. 단, **이 봉쇄는 MCP에만 해당한다** — 무인 step은 Bash로 vsp CLI를 직접
  호출할 수 있고 final-harness의 block-dangerous-bash는 vsp를 모른다(§15-F7). 이
  경로는 기계 봉쇄가 아니라 자격증명 스코핑(§8.4)과 verify로 방어한다(알려진 한계).
- **verify 명령은 시작 시점에 스냅샷으로 고정**되어 세션이 중간에 바꿔치기할 수 없고,
  verify 없는 pending step은 기동이 거부된다.
- verify가 위임하는 리포 내 타겟(package.json scripts, Makefile 등) 변조는 WARN으로
  표면화된다. 단 vsp 바이너리 자체는 리포 밖이므로 이 감사 범위 밖 — vsp 설치본의
  무결성은 사람이 관리한다 (알려진 한계로 SAFETY-PROFILES.md에 명시할 것).
- **vsp는 작업 디렉토리의 `.env`를 자동 로드한다**(§15-V9). SAP 자격증명이 레포 CWD에
  상주하면 무인 offline step도 SAP에 닿을 수 있다 — 자격증명 주입은 §8.4의 스코핑
  규율을 따른다.
- 실패는 `.harness/LESSONS.md`에 기계적으로 기록되고, 검증된 원인만 사람 승인을 거쳐
  `.harness/RULES.md`로 승격된다. RULES는 모든 무인 step에 하드 주입된다.
- **RULES에는 예산이 있다**: 규칙 30개 경고/40개 상한, 12KB 경고/16KB 상한 (§15-F3).
  → 모듈 지식 전체를 RULES에 넣는 것은 불가능하며 설계상 금지 (§12).
- 드라이버는 claude/codex 이중 지원 — 본 레포도 모델 불가지론을 상속한다.

허용되는 MCP 사용: 사람이 소유한 대화형 세션(계획 수립, CONSULT, 승인된 gated phase의
수동 개입)에서만. 이때도 본 레포 스킬은 MCP 결과를 근거로 step을 completed 처리하지
않는다 — 완료 판정은 항상 하네스의 verify가 한다.

## 6. 진실의 원천: repo ↔ SAP 상태 동기화 (v2 신설 — 최우선 설계 결정)

**문제.** final-harness의 모든 보증(verify 스냅샷, 변조 감지·원복, 하네스 커밋 규율)은
git 레포가 진실의 원천이라는 전제 위에 있다. 그러나 SAP 개발은 배포 순간부터 진실이
SAP 서버로 넘어간다. 누군가 SE80/ADT에서 객체를 고치면 레포와 SAP가 어긋나고, 레포만
보는 하네스의 보증은 형식화된다.

**규율.** 다음 세 가지를 프로젝트 불변식으로 삼는다:

1. **하네스 관리 객체는 abapGit 호환 파일 포맷으로 레포에 존재한다**
   (`.clas.abap`, `.prog.abap`, `.ddls.asddls` 등 — vsp가 이 포맷을 지원, §15-V5).
   레포에 없는 객체는 하네스 관리 대상이 아니다.
2. **SAP 방향 변경은 gated write phase를 통해서만** 일어난다. 레포 파일 → vsp deploy →
   verify 순서만 허용. SAP에서 직접 고친 내용은 해당 객체를 다시 배포하는 gated
   phase의 drift check에서 검출된다 — 재배포가 없는 객체는 미검출이므로(보증 범위
   한계), gated phase 진입 시 하네스 관리 객체 전수 drift sweep으로 보완한다.
3. **gated phase의 verify에 drift check를 편입한다**: 배포 직후 SAP에서 소스를
   export해 레포 파일과 비교하고, 불일치 = verify 실패. 주의: `vsp lint <TYPE> <NAME>`은
   fetch+로컬 린트일 뿐 비교 기능이 없다 — vsp의 소스 fetch 경로를 재활용한 export 후
   `git diff --no-index` 등으로 비교하는 별도 명령 조합이 필요하다.

비교가 성립하려면 객체 타입별 정규화(canonicalization) 규칙이 선행돼야 한다: CLAS는
main+testclasses+locals include 전부를 비교 대상에 포함, pretty-printer·개행(CRLF/LF)
정규화, active/inactive 버전 기준 고정. 이 정규화 설계와 export/비교 명령 실측이
§14-2의 실질 내용이며, Phase 0b에서 `adapters/vsp/VERIFY-PATTERNS.md`에 확정한다.

## 7. TDD 2단 구조 (v2 신설)

**문제.** final-harness의 tdd-guard는 로컬 테스트 러너(테스트 먼저 → red → 구현 → green)를
전제한다. 그러나 ABAP Unit은 SAP 안에서만 실행된다 — `vsp test`는 연결과 **배포된 객체**를
요구하고, 배포는 write gate 뒤에 있다. 오프라인에서 red-green 루프가 성립하지 않는다.

**해법 — 2단 구조:**

| 단계 | 하는 일 | verify |
|---|---|---|
| **offline 단계** | 테스트 클래스 소스를 구현보다 **먼저 작성** (tdd-guard의 "테스트 먼저" 정신 유지). 구현 소스 작성. | `vsp lint --file` + `vsp parse --file` — 문법·스타일 초안 게이트 |
| **gated 단계** | deploy → ABAP Unit 실행 | `vsp deploy <file> <package>` 후 `vsp test` — 여기서 비로소 red/green 판정 |

주의(이중 리뷰 확정 사실): final-harness의 tdd-guard는 지원 언어가 하드코딩되어
있고(JS/TS·Python·Go·Jupyter — §15-F6) ABAP 파일에는 발화하지 않으며, 설정 파일로
확장할 수도 없다. 따라서 "ABAP 테스트 먼저 작성"은 기계 강제가 아니라 **관례 강제**다 —
RULES.md 항목과 harness-plan 체크리스트로 강제하고, 이 한계를 SAFETY-PROFILES.md에
명시한다. §14-1은 "tdd-guard 엔진의 ABAP 확장(업스트림 기여) vs 관례 강제 유지"의
택일 문제다.

## 8. 실행 모드 3종

### 8.1 Offline Mode — SAP에 쓰지 않고 연결도 불필요

사용처: ABAP/CDS/RAP/AMDP 소스 초안 작성, 표준 규칙 조회, lint/parse, 하네스 step 검증.

verify 예시 (실측 시그니처 — v1의 `vsp --offline lint`는 오기였음, §15-V1):

```json
{
  "name": "write CDS source draft",
  "verify": "vsp lint --file src/zi_sales.ddls.asddls"
}
```

**기대치 (중요):** `vsp lint`는 구현 기준 7종 규칙의 스타일 린트다(line_length,
empty_statement, obsolete_statement, max_one_statement, preferred_compare_operator,
colon_missing_space, naming — §15-V2). **syntax check가 아니다.** lint/parse는 파일
확장자를 보지 않고 모든 입력을 ABAP으로 토크나이즈하므로(§15-V3) CDS 문법 검증이
아니다. 오프라인 verify는 "초안 품질 게이트"이며, 여기 통과한 소스도 SAP에서 활성화
실패할 수 있다. 진짜 검증력은 8.2/8.3에서 나온다. Phase 1에서 객체 유형별 "오프라인에서
잡히는 것 / 온라인에서만 잡히는 것" 실측 표를 `adapters/vsp/VERIFY-PATTERNS.md`에
작성한다.

**exit code 의미론 (실측 — §15-V2·V11):** `vsp parse`는 파일 미존재 외 실패 경로가
없어 어떤 입력에도 exit 0이다 — 게이트가 아니라 구조 출력 도구이므로 verify에 넣지
않는다. `vsp lint`는 Error 심각도 이슈에서만 비-0 exit이고 규칙 다수는 Warning만
낸다 — **Warning은 게이트를 통과한다.** 즉 offline 게이트의 실효 차단력은 lint
Error에 국한된다. Warning도 실패로 만드는 `--strict` 옵션의 vsp 포크 추가 여부는
§14-8.

참고: vsp의 `--offline` 플래그는 lint의 옵션이 아니라 **MCP 서버 모드**용이다
(ListStandards/GetStandard/CheckBoundaries/AnalyzeABAPCode만 로컬 제공, §15-V1).
CLI의 `lint`/`parse`는 `--file`/`--stdin` 사용 시 자체로 오프라인이다.

### 8.2 Read-Only Online Mode — 읽되 쓰지 않음

사용처: 기존 객체 탐색, package 구조 파악, where-used/영향도 분석, **연결 기반 syntax
검증**, 모듈 컨설턴트 판단 보강.

정책:

- read/search/query 계열만 허용. 테이블 데이터 row extraction은 별도 승인 없이 금지.
- 계획·분석 phase에 적합. **Phase 1.5(§13)에서 이 모드의 검증 명령을 offline 초안
  게이트 위에 얹는다** — 오프라인 린트의 깊이 한계를 메우는 층이다.

### 8.3 Gated Write Mode — 실제 변경

사용처: 객체 create/update, activation, ATC/unit test, transport, RAP 아티팩트 배포.

정책:

- spec 승인 이후에만 진입. package allowlist + transport 정책 필수.
- write 이후 하네스가 독립 verify: **deploy → activate → drift check(§6) → ATC → unit test**.
- 실패는 LESSONS.md에 기록.

verify 예시:

```json
{
  "name": "deploy and verify RAP artifacts",
  "verify": "vsp deploy src/zi_sales.ddls.asddls $ZDEV && vsp atc DDLS ZI_SALES && vsp test --package $ZDEV"
}
```

(개념 예시. 실전 verify는 §9의 래퍼 `scripts/verify-sap.ps1`를 경유해 실패 마커를
남긴다. 객체 타입별 deploy 지원 범위는 §14-4.)

### 8.4 자격증명 스코핑 (v2.1 신설)

vsp는 CWD의 `.env`를 자동 로드하므로(§15-V9), **자격증명 관리가 곧 write 게이트의
실체다.**

- SAP 자격증명(`.env`/환경변수)은 **gated write phase의 세션 환경에만 주입**한다.
  offline/read-only phase의 무인 세션 환경에서는 제거한다 — 자격증명이 없으면 무인
  step이 Bash로 vsp를 호출해도 SAP에 닿지 못한다.
- 무인 세션에서 쓰는 vsp 설정은 read-only 기본값과 package allowlist를 강제한다.
- SAFETY-PROFILES.md는 서사가 아니라 실행 가능한 수준으로 작성한다: 모드별 허용 명령
  allowlist(차단 대상: `query`, `execute`, `source write/edit`, `install`, `deploy`,
  `copy`, `transport` 계열)와 그 차단이 실제로 동작하는지의 검증 절차를 포함한다.
- `.env`·자격증명 파일은 `.gitignore`에 등록하고 레포에 커밋하지 않는다.

## 9. Verify 패턴과 실패 분류 (v2 신설)

검증 층 (아래로 갈수록 강하고 느림):

1. `vsp lint --file` / `vsp parse --file` — 오프라인, 초안 게이트
2. `vsp lint <TYPE> <NAME>` — 연결, SAP 소스 fetch 후 린트 (drift check 겸용 후보)
3. SAP syntax check / activation — 연결, gated
4. `vsp atc <TYPE> <NAME>` — ATC 검사
5. `vsp test <TYPE> <NAME>` / `vsp test --package` — ABAP Unit
6. `vsp health --package` — tests+ATC+boundaries+staleness 종합 (느림 — step verify보다
   phase 말미 감사용)

**실패 분류 — LESSONS 오염 방지 (중요).** 로컬 테스트와 달리 살아있는 SAP 대상 verify는
코드가 옳아도 실패한다: 연결 끊김, transport lock, 타 개발자 변경, 시스템 점검.
final-harness의 run-summary는 timeout/세션종료/미갱신은 구분하지만 "환경 실패 vs 코드
실패"는 모른다. 방치하면 LESSONS.md가 일시 노이즈로 오염되고 잘못된 교훈이 RULES 승격
후보에 오른다.

대응: SAP verify는 vsp를 직접 호출하지 않고 리포 내 래퍼 스크립트
(`scripts/verify-sap.ps1`)를 경유한다. 래퍼 규약:

- 결과를 안정적 마커로 출력한다: `CODE_FAIL`(코드 결함), `ENV_FAIL`(연결/권한/시스템),
  `LOCK_FAIL`(transport lock 등 일시 충돌). vsp는 모든 오류가 exit 1이라(§15-V10)
  exit code로는 유형 구분이 불가능하고 **출력 패턴 파싱이 유일한 길**이다 — 유형별
  패턴은 Phase 0b에서 실측한다.
- 연결성 사전 점검(`vsp system info`)을 선행시켜 ENV_FAIL을 조기 분리한다.
- harness-lesson 트리아지 시 `ENV_FAIL`/`LOCK_FAIL` 마커가 찍힌 LESSONS는 규칙 승격
  후보에서 제외한다 — 마커 없는 실패만 코드 결함 후보로 조사한다.
- 래퍼는 리포 안(`scripts/`)에 두어 final-harness의 verify 위임 타겟 감사(§15-F5)
  범위에 들어가게 한다.

**quality-gate.** ABAP 레포에는 package.json 등 매니페스트가 없어 Stop 게이트가
no-op이 된다(엔진이 WARN은 해줌, §15-F2). harness-tailor로 `.claude/quality-gate.json`을
명시 생성한다. 주의: stop 게이트는 명령 문자열을 그대로 실행할 뿐 변경 파일 치환
기능이 없다 — `<변경파일>` 같은 플레이스홀더는 동작하지 않는다. git diff로 변경된
`.abap`/`.asddls` 파일을 수집해 각각 `vsp lint --file`을 도는 래퍼 스크립트를 리포에
두고 그것만 등록한다:

```json
{ "commands": ["powershell -File scripts/quality-gate-sap.ps1"] }
```

(Stop 훅 예산 300초 내 완주하도록 lint만 수행 — `vsp health`는 넣지 않는다.)

## 10. 레포 구조

```text
sap-agentic-harness/
  README.md
  DESIGN.md                      ← 이 문서
  DECISION-GUIDE.md              ← 운용 중 의사결정 기록 (Phase 0a에서 생성)
  .harness/                      ← final-harness 설치본 (harness-init이 생성)
  .claude/quality-gate.json      ← harness-tailor가 생성
  adapters/
    vsp/
      COMMANDS.md                ← 실측된 vsp CLI 명령 레퍼런스 (버전 기준 명시)
      VERIFY-PATTERNS.md         ← verify 명령 패턴 + offline/online 커버리지 표 + 실패 분류 규약
      SAFETY-PROFILES.md         ← 모드별 허용 명령 allowlist, package allowlist,
                                    transport 정책, 자격증명 스코핑(§8.4),
                                    vsp 바이너리 무결성 한계 명시
  scripts/
    quality-gate-sap.ps1         ← Stop 게이트용: git diff 변경 파일 수집 → vsp lint (§9)
    verify-sap.ps1               ← verify 래퍼: CODE_FAIL/ENV_FAIL/LOCK_FAIL 마커 (§9)
  domain/
    abap/  RULES.seed.md  CHECKLIST.md  templates/
    cds/   RULES.seed.md  CHECKLIST.md  templates/
    rap/   RULES.seed.md  CHECKLIST.md  templates/
    amdp/  RULES.seed.md  CHECKLIST.md  templates/
  packs/
    modules/
      README.md                  ← 이중 구조 규약 (§12)
  src/                           ← 하네스가 관리하는 ABAP 소스 (abapGit 호환 파일명)
```

정본 규약: verify 패턴의 정본은 `adapters/vsp/VERIFY-PATTERNS.md`다. harness-tailor가
생성하는 `.harness/VERIFY-PATTERNS.md`는 정본으로의 포인터 스텁으로 유지한다
(harness-plan이 참조하는 위치가 `.harness/`이므로 스텁이 필요하다).

domain의 RULES.seed는 처음부터 창작하지 않는다 — vsp embedded standards(이미 hjaewon
포크에 내장)와 본 레포 `interactive/core/knowledge/abap/`에서 **선별 이식**한다(MIT).
중복 작성 금지: vsp GetStandard로 조회 가능한 내용은 참조만 남긴다.

## 11. 스킬 방향 — harness-tailor 산출물의 표준화

v1은 sap-harness-init/plan/loop/verify/lesson 5개 스킬 신설을 계획했다. v2는 이를
재정의한다: **final-harness의 기존 스킬(harness-init, harness-plan, harness-loop,
harness-lesson, harness-tailor)을 그대로 쓰고, 본 레포는 tailor의 SAP 산출물을 재사용
가능한 형태로 표준화한다.** 새 스킬은 기존 스킬로 부족함이 실증된 뒤에만 만든다.

- `sap-harness-init` (신설 보류) → harness-init 실행 + 본 레포의 adapters/domain 참조
  안내로 대체 가능한지 Phase 0a에서 판단.
- `sap-harness-plan` → harness-plan을 그대로 쓰되, 계획 시 결정 항목(대상 객체 유형,
  offline 검증 범위, online read 필요, write gate 필요, package/transport 정책, verify
  명령)을 VERIFY-PATTERNS.md 참조로 강제한다.
- `sap-harness-verify` → 스킬이 아니라 VERIFY-PATTERNS.md 문서가 담당.
- `sap-harness-lesson` → harness-lesson 그대로 + §9의 환경 실패 제외 체크.
- 루프 흐름: `CONSULT → GOAL → PLAN → EXECUTE → VERIFY → RECORD`. CONSULT 단계에서
  packs(§12)와 read-only 모드(§8.2)를 사용한다.

## 12. Domain Packs — 이중 구조 (v2 명시)

RULES 예산(30/40개, 12/16KB — §15-F3) 때문에 모듈 지식 전체를 RULES로 주입하는 것은
불가능하며 시도하지 않는다. 팩은 두 부분으로 나뉜다:

```text
packs/modules/fi/
  CONSULTANT.md    ← CONSULT 본체: 대화형 계획/분석 세션에서만 읽는 지식
  TABLES.md           (테이블, T-code, SPRO 경로, 업무 흐름, 함정 목록)
  TCODES.md
  SPRO.md
  RULES.seed.md    ← RULES 정예 후보: 실패에서 증류된, 무인 step에 강제할 가치가
                      있는 소수 규칙만 (예: "ECC 대상 개발에 S/4 전용 syntax 금지")
```

- **CONSULT 본체**는 무인 step에 주입되지 않는다. 사람 소유 세션의 CONSULT 단계에서만 참조.
- **RULES 정예**는 LESSONS→RULES 승격 게이트(사람 승인)를 통과한 것만 `.harness/RULES.md`에
  들어간다. RULES.seed.md는 후보 풀이지 자동 주입원이 아니다.
- 콜드스타트: 본 레포 `interactive/core/`의 페르소나 26개(FI/CO/MM/SD 등 모듈 컨설턴트 15 +
  analyst/executor 등 역할 11)와 knowledge에서 선별 이식한다(같은 레포 — 커밋 이력이 곧
  provenance). 이후 실전 LESSONS로 독자 진화 —
  이것이 "sc4sap과 같지만 독자적인 것"의 실체다: 기계장치는 final-harness, 차별화는
  이 레포에 축적되는 검증된 규칙.
- 시작 모듈: 실전 프로젝트가 있는 것부터 (FI/CO 우선 권장 — univat 등 세무 도메인과 인접).

## 13. 로드맵 (완료 기준 포함)

**실행 모드 구분:** Phase 0a/0b는 발견·문서화 작업이라 final-harness의 대화형
스킬(harness-init/tailor/loop)로만 진행하고, **무인 step 실행(execute.py)은 verify가
기계 판정 가능해지는 Phase 1부터 투입한다.** 무인 step은 claude 세션을 띄워 API
예산을 소모하므로 투입 전 지출 한도 여유를 확인한다.

### Phase 0a: Scaffold (오프라인 — SAP 연결 불필요)
- **§16 부트스트랩 1·3·4를 먼저 완료** (vsp 빌드, final-harness 플러그인 설치, 파일럿 결정)
- ~~git init + `hjaewon/sap-agentic-harness` 원격 생성~~ ✅ 완료 (2026-07-09, 첫 커밋 ba42645)
- final-harness 설치(harness-init) → harness-tailor 실행(quality-gate.json,
  VERIFY-PATTERNS 스텁, rule seed)
- `scripts/quality-gate-sap.ps1`, `scripts/verify-sap.ps1` 스켈레톤 작성 (§9)
- lint/parse exit code 의미론 재확인으로 §8.1 실측 표 시작
- **완료 기준**: `.harness/` 존재 + quality-gate.json이 래퍼를 가리킴 + 의도적 lint
  Error 파일이 게이트에서 실제 차단됨을 1회 실증

### Phase 0b: Connected Discovery (SAP 연결 필요 — §16-2 선행)
- `adapters/vsp/COMMANDS.md` 작성: 서두에 등재 대상 명령 목록을 먼저 확정해 "모든
  명령"의 범위를 고정한 뒤, lint/atc/test/deploy/copy/transport의 정확한 시그니처와
  실행 로그 기록
- 실패 유형별 출력 패턴 실측 → `verify-sap.ps1` 마커 규약 완성 (§9)
- read-only syntax check 명령 실재 여부 확인 (§14-9) — 없으면 Phase 1.5를 ATC/health
  기반으로 재정의
- drift check용 export/비교 명령과 정규화 규칙 실측 (§14-2)
- **완료 기준**: COMMANDS.md 등재 명령 전부에 실행 로그 존재 + 마커 3종이 실제 유형별
  실패에서 재현됨

### Phase 1: Offline ABAP Harness
- ABAP program 1건을 offline 초안 → lint verify 루프로 작성 (테스트 클래스 먼저, §7)
- 객체 유형별(ABAP/CDS/RAP/AMDP) offline 커버리지 실측 표를 VERIFY-PATTERNS.md에 완성
- domain/abap RULES.seed 선별 이식 (vsp standards + sc4sap 참조)
- **완료 기준**: 하네스 run-summary에 성공 step 기록 + 커버리지 표 4개 유형 완성 +
  의도적 규칙 위반(lint Error) 소스가 offline 게이트에서 차단됨을 1회 실증

### Phase 1.5: Connected Syntax Verify (v2 신설)
- (전제: §14-9의 read-only syntax check 명령이 Phase 0b에서 확인된 경우. 미확인이면
  이 Phase를 ATC/health 기반 online validation으로 재정의한다)
- read-only 연결로 SAP syntax check 급 검증을 verify에 편입 — offline 린트의 깊이
  한계(§8.1)를 메우는 층
- **완료 기준**: offline에서 통과하나 connected에서 실패하는 케이스 1건 이상을 의도적으로
  만들어 검출됨을 확인

### Phase 2: Online Read-Only Planning
- 기존 package/object context를 계획에 반영, where-used/boundary 분석을 계획 단계에 편입
- **완료 기준**: 분석 결과가 계획의 결정(대상 객체 선정 또는 의존 순서)을 실제로
  바꾼 사례 1건이 계획 문서에 기록됨

### Phase 3: Gated Deploy
- spec 승인 게이트 + package allowlist + transport 정책 (SAFETY-PROFILES.md)
- deploy → activate → **drift check(§6)** → ATC → unit test verify 체인 구축
- 환경 실패 분류 규약 적용 (§9)
- **완료 기준**: 객체 1건이 전체 체인을 통과해 SAP에 존재하고, drift check가 SE80 수동
  변경을 실제로 검출함을 1회 실증

### Phase 4: Domain Packs
- FI/CO부터 이중 구조(§12)로 시작, sc4sap 지식 선별 이식
- **완료 기준**: 팩 1개가 CONSULT 단계에서 실사용되고, LESSONS 유래 규칙 1건이 RULES로
  승격(자연 발생 실패가 없으면 의도적 실패 주입으로 대체 가능)

### Phase 5: Hardening
- 반복 실패 유형 RULES 승격, verify 품질 감사, write mode 안전성 리뷰,
  대화형 MCP 허용 범위 재검토

## 14. 미결 사항 (구현 시점에 결정)

| # | 항목 | 결정 시점 |
|---|---|---|
| 1 | tdd-guard 대응: 엔진의 ABAP 확장(업스트림 기여) vs 관례 강제 유지 (§7) | Phase 0a harness-tailor 실행 시 |
| 2 | drift check: 객체 타입별 정규화 규칙 + export/비교 명령 (§6) | Phase 0b 실측 |
| 3 | verify 실패 유형별 출력 패턴 실측 → verify-sap.ps1 마커 완성 (exit code는 일괄 1로 확인 — §15-V10) | Phase 0b 실측 |
| 4 | deploy/copy의 객체 타입별 지원 범위(class include는 TODO — §15-V6)와 src/→SAP 배포 매체(파일별 deploy vs zip copy) | Phase 0b 실측 |
| 5 | offline lint의 CDS/RAP/AMDP 실효 커버리지 | Phase 1 실측 표 |
| 6 | sap-harness-* 전용 스킬 신설 필요 여부 | Phase 1 종료 후 |
| 7 | 첫 파일럿 객체/패키지 선정 | Phase 0a (§16-4) |
| 8 | lint `--strict`(Warning도 실패) 옵션의 vsp 포크 추가 여부 (§8.1) | Phase 1 착수 시 |
| 9 | read-only SAP syntax check 명령의 실재 여부 (없으면 Phase 1.5 재정의) | Phase 0b |

## 15. 설계 중 실측으로 확인된 사실 (근거 좌표)

구현 세션이 전제를 재검증할 때 사용. 경로는 §1의 로컬 경로, 좌표는 §1 표의 버전/커밋
기준이며 검증일은 2026-07-09다.

**final-harness (v0.12.1, README.md):**
- F1. 무인 step 세션은 `--strict-mcp-config`(claude 드라이버, MCP 서버 0개)로 기동,
  codex 드라이버는 서버 열거 후 개별 `enabled=false` — README "v0.12.0 §1 MCP 도구 우회 봉합"
- F2. 매니페스트 미감지 시 Stop 게이트는 no-op + 기동 시 1회 WARN — README "v0.12.0 §3"
- F3. RULES 예산: 규칙 30/40개, 12KB/16KB 임계 — README "v0.12.0 §7"
- F4. harness-tailor 스킬 = 스택별 quality-gate.json 생성 + VERIFY-PATTERNS.md 기록 +
  rule seed, Stop 훅 300초 예산 경고 포함 — `skills/harness-tailor/SKILL.md`
- F5. verify 위임 타겟 감사는 리포 내 타겟만 커버 (vsp 바이너리는 범위 밖) — README "v0.12.1 §1"
- F6. tdd-guard 지원 언어는 하드코딩(JS/TS·Python·Go·ipynb) —
  `skills/harness-init/templates/engine/.claude/hooks/tdd-guard.py:99-105` LANG_RULES.
  ABAP 미발화, 확장은 훅 파일 수정(=엔진 수정)으로만 가능
- F7. block-dangerous-bash는 vsp를 인지하지 못함 — Bash 경유 CLI 호출은 가드 범위 밖
  (README의 "문서화된 한계")

**vsp-custom (aab1275):**
- V1. `--offline`은 MCP 서버 모드 플래그 (ListStandards/GetStandard/CheckBoundaries/
  AnalyzeABAPCode 로컬 제공) — `cmd/vsp/main.go:96`
- V2. `vsp lint`는 `--file`/`--stdin`으로 완전 오프라인 — `cmd/vsp/cli_extra.go:74-89`;
  규칙은 구현 기준 7개(LineLength, EmptyStatement, ObsoleteStatement, MaxOneStatement,
  PreferredCompareOperator, ColonMissingSpace, LocalVariableNames — docstring은 6종만
  나열) — `cli_extra.go:532-549`; **Error 심각도만 비-0 exit, Warning은 exit 0** —
  `cli_extra.go:567-573`; 인자 없이 `<TYPE> <NAME>`이면 SAP에서 fetch —
  `cli_extra.go:509-515`
- V3. lint/parse는 파일 확장자를 보지 않고 모든 입력에 ABAP 토크나이저를 적용 —
  runLint/runParse에 확장자 분기 없음. CDS 전용 문법 검증은 없다. (v2가 인용한
  lsp.go:32는 LSP 설정 샘플 문서라 근거 부적절 — v2.1에서 교체)
- V4. `vsp parse --file/--stdin` 오프라인 동작 — `cmd/vsp/cli_compile.go:66-78`
- V5. abapGit 통합: `--feature-abapgit auto|on|off`(`main.go:150`), `vsp install abapgit`
  (`devops.go:450+`), abapGit 호환 파일 확장자 지원(`devops.go:362-363`), 158 객체 타입
  export(`devops.go:440`)
- V6. write 표면: `vsp execute`(임의 ABAP 실행, `cli_extra.go:94-108`);
  `vsp deploy <file> <package> [--transport]` — `devops.go:357-370`;
  `vsp copy <source.zip> --to <package>`(--to 필수, `--deploy` 플래그 없음, ADT native
  fallback은 PROG/CLAS/INTF/DDLS/BDEF/SRVD) — `copy_cmd.go:23-39`;
  **class include(테스트클래스 등) 배포는 TODO** — `copy_cmd.go:322,328`
- V7. `vsp atc <type> <name>`, `vsp test`, `vsp health --package`(tests+ATC+boundaries+
  staleness, --report html/md) — `devops.go`, README
- V8. hjaewon 포크 추가분: embedded ABAP standards(ListStandards/GetStandard),
  InstallALVHandlers, `--offline` — README fork notice
- V9. CWD의 `.env` 자동 로드 — `cmd/vsp/main.go:89` (`godotenv.Load()`)
- V10. cobra 오류는 일괄 `os.Exit(1)` — `cmd/vsp/main.go:756`. 실패 유형의 exit code
  구분 불가 — 분류는 출력 패턴 파싱으로만 가능
- V11. `vsp parse`는 파일 미존재 외 실패 경로 없음(항상 exit 0) —
  `cmd/vsp/cli_compile.go:239-317` runParse

**abap-mcp-adt-powerup (v4.13.0):** MCP 전용 — 339 tools(`README.md:284`,
AVAILABLE_TOOLS.md 기준; MCP 기본 노출 수는 exposition 설정으로 축소됨), RAP 아티팩트
생성 도구 폭·CDS unit test·런타임 덤프/프로파일러 보유, CLI 없음

**라이선스:** vsp-custom MIT(oisee 업스트림), sc4sap-custom MIT(babamba2 업스트림) —
각 LICENSE 파일

## 16. 구현 착수 부트스트랩 (Phase 0 진입 전 체크리스트)

이 문서는 설계 판단을 담지만, 아래 실행 환경 전제는 문서 밖에 있다. 구현 세션은
**이 체크리스트부터** 수행한다. (2026-07-09 실측: vsp 미빌드, Go 1.26.4 설치됨)

1. **vsp 빌드** — 로컬에 빌드된 바이너리가 없다. vsp-custom 클론 후:
   ```
   cd <vsp-custom 클론 경로>
   go build -o vsp.exe ./cmd/vsp     # Makefile 타겟이 있으면 그쪽 우선
   ```
   PATH 등록 또는 verify 명령에서 절대경로 사용. `vsp.exe --help`로 확인.
2. **vsp SAP 연결 설정** — 연결 방법(설정 파일/환경변수)은 vsp-custom의 README.md와
   MANUAL.ko.md 참조. 접속 정보(호스트/클라이언트/자격증명)는 **본 레포에 커밋 금지**.
   `vsp system info`가 성공하면 연결 완료. `.env` 사용 시 반드시 `.gitignore` 등록(§8.4).
   Phase 0a는 연결 없이 완료 가능하며, Phase 0b부터 연결이 필요하다.
3. **final-harness 플러그인 설치** — final-harness README "설치" 절 기준:
   ```
   /plugin marketplace add <claude-fable-final 클론 경로>
   /plugin install final-harness@final-harness-marketplace
   ```
   설치 후 본 레포에서 "하네스 이식해줘" → harness-init이 `.harness/`를 배치한다.
   이어서 harness-tailor 실행 (§9의 quality-gate, §14-1의 tdd-guard 결정 포함).
4. **첫 파일럿 대상 결정** — 실측에 쓸 SAP 시스템(DEV)과 패키지, 파일럿 객체(§14-7)를
   사람이 정한다. 권장: 부담 없는 `$TMP` 또는 전용 Z패키지.

체크리스트 완료 판정: `vsp.exe --help` 동작 + `.harness/` 존재 + quality-gate.json 존재.
이후 §13 Phase 0a의 나머지 → Phase 0b(연결 실측)로 진행한다.
