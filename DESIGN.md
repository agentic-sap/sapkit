# SAP Agentic Harness — 설계서 v2

> **상태: 설계 확정 (2026-07-09). 구현 미착수.**
>
> 이 문서는 컨텍스트 클리어 후 어떤 세션이든 **이 문서만 읽고** 개발을 시작할 수 있도록 작성된
> 단일 소스다. 설계 근거가 되는 사실은 §15에 파일:라인 단위로 기록했으므로, 구현 세션은
> 의심되는 전제만 재검증하면 된다.
>
> v1 대비 변경: 검증 백엔드 확정(vsp-custom, §3) · repo↔SAP 진실 원천 절 신설(§6) ·
> TDD 2단 구조 신설(§7) · verify 실패 분류 신설(§9) · verify 예시 시그니처 실측 수정(§8) ·
> packs 이중 구조 명시(§12) · MCP Handling을 "원칙"에서 "엔진 불변식"으로 재서술(§5).

## 0. 한 문장 요약

`sap-agentic-harness`는 `final-harness`의 검증/학습 루프(verify 스냅샷, LESSONS→RULES)를
`vsp-custom`의 SAP ADT CLI 실행 능력과 결합해, ABAP/RAP/CDS/AMDP 개발을 안전한 step 기반
에이전틱 엔지니어링 프로세스로 만들고, 실전 실패에서 증류된 규칙을 모듈 지식으로
축적해가는 통합 레이어 레포다.

## 1. 레포 좌표 (Repository Coordinates)

폴더 경로는 바뀔 수 있으므로 **git 레포 URL을 기준으로 추적한다.** 로컬 경로는 2026-07 기준 참고값.

| 역할 | Git 레포 | 로컬 경로 (참고) | 버전 | 라이선스 |
|---|---|---|---|---|
| **하네스 엔진** | `https://github.com/hjaewon/claude-fable-final.git` | `D:\claude-practice\claude-fable-final` | v0.12.1 | 자작 |
| **SAP 검증/배포 백엔드** | `https://github.com/hjaewon/vsp-custom.git` | `D:\claude for SAP\vsp\vsp-custom` | aab1275 (2026-07-07) | MIT — 업스트림 `oisee/vibing-steampunk` |
| 지식 시드 + 대화형 트랙 | `https://github.com/hjaewon/sc4sap-custom.git` | `D:\claude for SAP\sc4sap-custom` | — | MIT — 업스트림 `babamba2/superclaude-for-sap` |
| 비교 검토된 MCP 서버 | `https://github.com/hjaewon/abap-mcp-adt-powerup.git` | `D:\claude for SAP\abap-mcp-adt-powerup` | v4.13.0 | — |
| **본 레포** | 원격 미설정 — Phase 0에서 `hjaewon/sap-agentic-harness` 생성 | `D:\claude for SAP\sap-agentic-harness` | — | — |

네 레포 모두 hjaewon 소유(자작 또는 포크)다. MIT 업스트림이므로 콘텐츠 이식·개작에
법적 제약 없음(저작권 고지 유지).

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
      └── sc4sap-custom ...... 대화형 트랙 (MCP 기반 직접 개발/컨설팅) — 본 레포와 의존 없음
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
| 인터페이스 | **CLI + MCP**(147 tools 또는 1-tool hyperfocused ~200토큰) | MCP 전용 (~190 tools) |
| 하네스 verify로 사용 | ✅ 셸 실행, exit code | ❌ 무인 step에서 MCP 차단됨 |
| 오프라인 동작 | ✅ `lint/parse --file`, embedded standards | ❌ SAP 연결 필수 |
| 패키지 분석 | ✅ health/boundaries/api-surface/slim/changelog | 조회 위주 (PackageTree 등) |
| RAP 아티팩트 생성 폭 | DDLS/BDEF/SRVD/SRVB 배포 지원 | ✅ 더 넓음 (MDE 생성, CDS unit test 포함) |
| 런타임 진단 | 디버거, 프로파일링 | ✅ 덤프 분석/프로파일러 도구셋 |
| abapGit 통합 | ✅ `--feature-abapgit`, `install abapgit`, 158 타입 export | ❌ |
| ABAP 표준/템플릿 내장 | ✅ ListStandards/GetStandard (hjaewon 포크에서 이미 커스텀) | ❌ (sc4sap 플러그인 계층이 담당) |

**권고 운용:** 본 레포는 powerup에 의존하지 않는다. write까지 vsp로 일원화한다
(`vsp copy --deploy`, WriteSource 경유 — §15-V6). powerup이 우위인 영역(RAP 생성 폭,
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
  서버별 `enabled=false`). 따라서 "무인 agent가 MCP로 SAP를 마음대로 바꾸는" 시나리오는
  설계상 원천 불가능하다. 무인 step의 SAP 접점은 verify 명령 속 vsp CLI뿐이다.
- **verify 명령은 시작 시점에 스냅샷으로 고정**되어 세션이 중간에 바꿔치기할 수 없고,
  verify 없는 pending step은 기동이 거부된다.
- verify가 위임하는 리포 내 타겟(package.json scripts, Makefile 등) 변조는 WARN으로
  표면화된다. 단 vsp 바이너리 자체는 리포 밖이므로 이 감사 범위 밖 — vsp 설치본의
  무결성은 사람이 관리한다 (알려진 한계로 SAFETY-PROFILES.md에 명시할 것).
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
   verify 순서만 허용. SAP에서 직접 고친 내용은 다음 drift check에서 검출되어 phase가
   실패한다.
3. **gated phase의 verify에 drift check를 편입한다**: 배포 직후 SAP에서 소스를 다시
   읽어 레포 파일과 비교(예: `vsp lint CLAS ZCL_X`가 SAP에서 fetch하는 경로 활용, 또는
   소스 재취득 후 `git diff --no-index`). 불일치 = verify 실패.

Phase 0에서 `adapters/vsp/VERIFY-PATTERNS.md`에 drift check의 구체 명령을 실측으로
확정한다 (vsp의 소스 fetch/diff 최적 명령이 무엇인지는 미결 — §14).

## 7. TDD 2단 구조 (v2 신설)

**문제.** final-harness의 tdd-guard는 로컬 테스트 러너(테스트 먼저 → red → 구현 → green)를
전제한다. 그러나 ABAP Unit은 SAP 안에서만 실행된다 — `vsp test`는 연결과 **배포된 객체**를
요구하고, 배포는 write gate 뒤에 있다. 오프라인에서 red-green 루프가 성립하지 않는다.

**해법 — 2단 구조:**

| 단계 | 하는 일 | verify |
|---|---|---|
| **offline 단계** | 테스트 클래스 소스를 구현보다 **먼저 작성** (tdd-guard의 "테스트 먼저" 정신 유지). 구현 소스 작성. | `vsp lint --file` + `vsp parse --file` — 문법·스타일 초안 게이트 |
| **gated 단계** | deploy → ABAP Unit 실행 | `vsp copy --deploy` 후 `vsp test` — 여기서 비로소 red/green 판정 |

tdd-guard의 ABAP 파일 처리(테스트 관례 인식 여부, 예외 필요 여부)는 harness-tailor
실행 시점에 결정한다 (§14 미결사항). 원칙: 엔진 수정 없이 tailor/설정으로만 적응한다.

## 8. 실행 모드 3종

### 8.1 Offline Mode — SAP에 쓰지 않고 연결도 불필요

사용처: ABAP/CDS/RAP/AMDP 소스 초안 작성, 표준 규칙 조회, lint/parse, 하네스 step 검증.

verify 예시 (실측 시그니처 — v1의 `vsp --offline lint`는 오기였음, §15-V1):

```json
{
  "name": "write CDS source draft",
  "verify": "vsp lint --file src/zi_sales.ddls.asddls && vsp parse --file src/zi_sales.ddls.asddls"
}
```

**기대치 (중요):** `vsp lint`는 6종 규칙 수준의 스타일 린트다(line_length,
empty_statement, obsolete_statement, max_one_statement, preferred_compare_operator,
naming — §15-V2). **syntax check가 아니다.** `.asddls`는 내부적으로 ABAP으로 근사
매핑되어(§15-V3) CDS 문법 검증이 아니다. 오프라인 verify는 "초안 품질 게이트"이며,
여기 통과한 소스도 SAP에서 활성화 실패할 수 있다. 진짜 검증력은 8.2/8.3에서 나온다.
Phase 1에서 객체 유형별 "오프라인에서 잡히는 것 / 온라인에서만 잡히는 것" 실측 표를
`adapters/vsp/VERIFY-PATTERNS.md`에 작성한다.

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
  "verify": "vsp copy src --deploy $ZDEV && vsp atc DDLS ZI_SALES && vsp test --package $ZDEV"
}
```

(정확한 copy/deploy 시그니처는 Phase 0 실측으로 확정 — §14)

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

대응: `adapters/vsp/VERIFY-PATTERNS.md`에 실패 분류 규약을 둔다 —

- Phase 0에서 vsp의 실패 유형별 exit code/출력 패턴을 실측한다 (연결 실패 vs 검증 실패가
  구분되는지).
- 구분이 안 되면 verify 명령을 래핑한다: 연결성 사전 점검(예: `vsp system info`)을
  `&&`로 선행시켜 환경 실패를 앞 단계에서 분리한다.
- harness-lesson 실행 시(사람 승인 단계) 환경 실패로 표시된 LESSONS는 승격 후보에서
  제외하는 체크를 스킬 지침에 명시한다.

**quality-gate.** ABAP 레포에는 package.json 등 매니페스트가 없어 Stop 게이트가
no-op이 된다(엔진이 WARN은 해줌, §15-F2). harness-tailor로 `.claude/quality-gate.json`을
명시 생성한다. Stop 훅 예산이 300초이므로 빠른 명령 2~3개만:

```json
{ "commands": ["vsp lint --file <변경파일>", "vsp parse --file <변경파일>"] }
```

(`vsp health`는 여기 넣지 않는다 — 느려서 게이트가 조용히 스킵된다.)

## 10. 레포 구조

```text
sap-agentic-harness/
  README.md
  DESIGN.md                      ← 이 문서
  DECISION-GUIDE.md              ← 운용 중 의사결정 기록 (Phase 0에서 생성)
  .harness/                      ← final-harness 설치본 (harness-init이 생성)
  .claude/quality-gate.json      ← harness-tailor가 생성
  adapters/
    vsp/
      COMMANDS.md                ← 실측된 vsp CLI 명령 레퍼런스 (버전 기준 명시)
      VERIFY-PATTERNS.md         ← verify 명령 패턴 + offline/online 커버리지 표 + 실패 분류 규약
      SAFETY-PROFILES.md         ← 모드별 허용 명령, package allowlist, transport 정책,
                                    vsp 바이너리 무결성 한계 명시
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

domain의 RULES.seed는 처음부터 창작하지 않는다 — vsp embedded standards(이미 hjaewon
포크에 내장)와 sc4sap-custom의 `sap-abap` 스킬/abap 디렉토리에서 **선별 이식**한다(MIT).
중복 작성 금지: vsp GetStandard로 조회 가능한 내용은 참조만 남긴다.

## 11. 스킬 방향 — harness-tailor 산출물의 표준화

v1은 sap-harness-init/plan/loop/verify/lesson 5개 스킬 신설을 계획했다. v2는 이를
재정의한다: **final-harness의 기존 스킬(harness-init, harness-plan, harness-loop,
harness-lesson, harness-tailor)을 그대로 쓰고, 본 레포는 tailor의 SAP 산출물을 재사용
가능한 형태로 표준화한다.** 새 스킬은 기존 스킬로 부족함이 실증된 뒤에만 만든다.

- `sap-harness-init` (신설 보류) → harness-init 실행 + 본 레포의 adapters/domain 참조
  안내로 대체 가능한지 Phase 0에서 판단.
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
- 콜드스타트: sc4sap-custom의 26개 컨설턴트 에이전트(FI/CO/MM/SD/PP/PM/QM/PS/TM/TR/WM/
  HCM/BW/Ariba/BC 등)와 abap/ 지식에서 선별 이식. 이후 실전 LESSONS로 독자 진화 —
  이것이 "sc4sap과 같지만 독자적인 것"의 실체다: 기계장치는 final-harness, 차별화는
  이 레포에 축적되는 검증된 규칙.
- 시작 모듈: 실전 프로젝트가 있는 것부터 (FI/CO 우선 권장 — univat 등 세무 도메인과 인접).

## 13. 로드맵 (완료 기준 포함)

### Phase 0: Scaffold
- git init + `hjaewon/sap-agentic-harness` 원격 생성
- final-harness 설치(harness-init) → harness-tailor 실행(quality-gate.json,
  VERIFY-PATTERNS 초안, rule seed)
- `adapters/vsp/` 문서 3종 작성 — COMMANDS.md는 실측으로: lint/parse/atc/test/health/
  copy·deploy/drift check 후보 명령의 정확한 시그니처와 exit code 확인
- vsp 실패 유형별 exit code 실측 (§9)
- **완료 기준**: `.harness/` 존재, quality-gate.json 존재, COMMANDS.md의 모든 명령이
  실제 실행 로그와 함께 기록됨

### Phase 1: Offline ABAP Harness
- ABAP program 1건을 offline 초안 → lint/parse verify 루프로 작성 (테스트 클래스 먼저, §7)
- 객체 유형별(ABAP/CDS/RAP/AMDP) offline 커버리지 실측 표를 VERIFY-PATTERNS.md에 완성
- domain/abap RULES.seed 선별 이식 (vsp standards + sc4sap 참조)
- **완료 기준**: 하네스 run-summary에 성공 step 기록, 커버리지 표 4개 유형 완성

### Phase 1.5: Connected Syntax Verify (v2 신설)
- read-only 연결로 SAP syntax check 급 검증을 verify에 편입 — offline 린트의 깊이
  한계(§8.1)를 메우는 층. `vsp lint <TYPE> <NAME>`(연결 fetch) 및 syntax check 경로 실측
- **완료 기준**: offline에서 통과하나 connected에서 실패하는 케이스 1건 이상을 의도적으로
  만들어 검출됨을 확인

### Phase 2: Online Read-Only Planning
- 기존 package/object context를 계획에 반영, where-used/boundary 분석을 계획 단계에 편입
- **완료 기준**: 실존 패키지 대상 분석 산출물이 phase 계획에 인용됨

### Phase 3: Gated Deploy
- spec 승인 게이트 + package allowlist + transport 정책 (SAFETY-PROFILES.md)
- deploy → activate → **drift check(§6)** → ATC → unit test verify 체인 구축
- 환경 실패 분류 규약 적용 (§9)
- **완료 기준**: 객체 1건이 전체 체인을 통과해 SAP에 존재하고, drift check가 SE80 수동
  변경을 실제로 검출함을 1회 실증

### Phase 4: Domain Packs
- FI/CO부터 이중 구조(§12)로 시작, sc4sap 지식 선별 이식
- **완료 기준**: 팩 1개가 CONSULT 단계에서 실사용되고, LESSONS 유래 규칙 1건이 RULES로 승격

### Phase 5: Hardening
- 반복 실패 유형 RULES 승격, verify 품질 감사, write mode 안전성 리뷰,
  대화형 MCP 허용 범위 재검토

## 14. 미결 사항 (구현 시점에 결정)

| # | 항목 | 결정 시점 |
|---|---|---|
| 1 | tdd-guard의 ABAP 파일 처리 방식 (관례 인식/예외) | Phase 0 harness-tailor 실행 시 |
| 2 | drift check 구체 명령 (vsp 소스 fetch/diff 경로) | Phase 0 실측 |
| 3 | vsp 환경 실패 vs 검증 실패의 exit code 구분 가능 여부 | Phase 0 실측 |
| 4 | `vsp copy --deploy` 정확한 시그니처와 transport 지정 방식 | Phase 0 실측 |
| 5 | offline lint의 CDS/RAP/AMDP 실효 커버리지 | Phase 1 실측 표 |
| 6 | sap-harness-* 전용 스킬 신설 필요 여부 | Phase 1 종료 후 |
| 7 | 첫 파일럿 객체/패키지 선정 | Phase 1 착수 시 |

## 15. 설계 중 실측으로 확인된 사실 (근거 좌표)

구현 세션이 전제를 재검증할 때 사용. 경로는 §1의 로컬 경로 기준.

**final-harness (v0.12.1, README.md):**
- F1. 무인 step 세션은 `--strict-mcp-config`(claude 드라이버, MCP 서버 0개)로 기동,
  codex 드라이버는 서버 열거 후 개별 `enabled=false` — README "v0.12.0 §1 MCP 도구 우회 봉합"
- F2. 매니페스트 미감지 시 Stop 게이트는 no-op + 기동 시 1회 WARN — README "v0.12.0 §3"
- F3. RULES 예산: 규칙 30/40개, 12KB/16KB 임계 — README "v0.12.0 §7"
- F4. harness-tailor 스킬 = 스택별 quality-gate.json 생성 + VERIFY-PATTERNS.md 기록 +
  rule seed, Stop 훅 300초 예산 경고 포함 — `skills/harness-tailor/SKILL.md`
- F5. verify 위임 타겟 감사는 리포 내 타겟만 커버 (vsp 바이너리는 범위 밖) — README "v0.12.1 §1"

**vsp-custom (aab1275):**
- V1. `--offline`은 MCP 서버 모드 플래그 (ListStandards/GetStandard/CheckBoundaries/
  AnalyzeABAPCode 로컬 제공) — `cmd/vsp/main.go:96`
- V2. `vsp lint`는 `--file`/`--stdin`으로 완전 오프라인, 규칙 6종(line_length,
  empty_statement, obsolete_statement, max_one_statement, preferred_compare_operator,
  naming) — `cmd/vsp/cli_extra.go:74-89`; 인자 없이 `<TYPE> <NAME>`이면 SAP에서 fetch —
  `cli_extra.go:509-515`
- V3. `.asddls`는 내부적으로 "abap" 언어로 근사 매핑 — `cmd/vsp/lsp.go:32`
- V4. `vsp parse --file/--stdin` 오프라인 동작 — `cmd/vsp/cli_compile.go:66-78`
- V5. abapGit 통합: `--feature-abapgit auto|on|off`(`main.go:150`), `vsp install abapgit`
  (`devops.go:450+`), abapGit 호환 파일 확장자 지원(`devops.go:362-363`), 158 객체 타입
  export(`devops.go:440`)
- V6. write 표면 존재: `vsp execute`(임의 ABAP 실행, `cli_extra.go:94-108`),
  copy/deploy — DDLS/BDEF/SRVD 등 ADT native 배포(`copy_cmd.go`)
- V7. `vsp atc <type> <name>`, `vsp test`, `vsp health --package`(tests+ATC+boundaries+
  staleness, --report html/md) — `devops.go`, README
- V8. hjaewon 포크 추가분: embedded ABAP standards(ListStandards/GetStandard),
  InstallALVHandlers, `--offline` — README fork notice

**abap-mcp-adt-powerup (v4.13.0):** MCP 전용(~190 tools), RAP 아티팩트 생성 도구 폭·
CDS unit test·런타임 덤프/프로파일러 보유, CLI 없음 — 본 세션 도구 목록 및 package.json

**라이선스:** vsp-custom MIT(oisee 업스트림), sc4sap-custom MIT(babamba2 업스트림) —
각 LICENSE 파일
