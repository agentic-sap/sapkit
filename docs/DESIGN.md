# SAP Agentic Harness — 설계서 v2.5

> ⚠ **현행성**: renew 1차 판(2026-08-10 · D-071~D-077) **이전** 문서다. 트랙 A 실행
> 설비(Engine attended 축의 구현물)는 그 판에서 레포에서 제거됐다 — **구조·백엔드
> 결정의 근거**로 읽고, 실행 설비의 존재를 전제한 서술은 현행으로 취급하지 말 것.
> 현행 게이트·완료 의미론은 `CLAUDE.md`, 상태는 `HANDOFF.md`, 재구성 계획은
> `docs/BLUEPRINT.md`.
>
> ⚠ **검증 백엔드 은퇴 (2026-08-15)**: 이 문서가 §1·§3·§16에서 **검증/배포 백엔드**로
> 지목하는 `vsp`(Go 포크)와 그 lock·프로파일 문서는 **레포에서 삭제됐다.** 그 자리에서
> 로컬 오프라인 검사를 맡는 것은 자체 저작 검사기(`sapkit-cli/` → 동봉
> `interactive/checker/`)이고, SAP에 닿는 적용 경로는 트랙 B MCP·사람이 모는 CLI·
> 사용자 abapGit이다(정책 등급과 관문은 경로와 무관하게 같다 — `AGENTS.md`).
> **이 문서에서 `vsp`를 이름으로 부르는 모든 서술은 그 결정 당시의 기록으로만 읽고
> 실행 지시로 읽지 말 것.** 설계 판단의 근거(왜 오프라인 검증 백엔드가 필요한가,
> 어떤 계약을 요구했는가)는 그대로 유효하다.
>
> ⚠ **MCP 엔진 교체 (2026-08-19)**: 이 문서가 §3 백엔드 비교에서 후보로 부르는
> `abap-mcp-adt-powerup`(v4.13.0 · 「339 tools」 등)은 **판7-b에서 자체 저작
> `sapkit-engine`으로 교체됐다**(D-095). §3의 비교는 **그 결정 당시의 평가 기록**이고,
> 거기 적힌 도구 수·버전을 **현행 제품 서버의 성질로 읽지 말 것** — 현행은
> `sapkit-engine`이고 표면은 186종이다. **버전·바이트·소스 핀의 정본은 `HANDOFF.md`
> 📌표다**(여기 복제하지 않는다 — 한때 적혀 있던 1.1.0은 그 사이 여러 번 올랐다).
>
> ⚠ **HANDOFF 절단 (2026-08-24 · 판B)**: 이 문서 본문의 「HANDOFF §5-11」·「HANDOFF 보조
> 머신 줄기」 같은 인용은 `HANDOFF.md`가 아니라
> **`docs/reference/handoff-archive/HANDOFF-archive-2026-08.md`**에서 풀린다 — § 번호·
> 절 이름은 보존된 채 이사됐다. `HANDOFF.md`는 이제 **재개점만** 든다.

> **상태: 주/보조 머신 분기 통합 완료(2026-07-19) — 이 v2.4 3축(Direct/Guided/Engine
> attended) 틀이 트랙 A 설계 정본(통합 결정 ⑴, 아래 v2.5 주). 초기 설계는
> Codex(0.143.0)·Fable 5 독립 이중 리뷰를 반영했고, 통합 기반 실행순서는 v2.4 운용
> 정정과 D-027을 따른다.**
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
>
> v2.2 변경(2026-07-13, 무인 리뷰 게이트 — HANDOFF §5-11 해소 설계): gated write
> 체인에 새-컨텍스트 리뷰 게이트 편입 — plan-레벨 리뷰 스텝 + 스텝 자신의 verify가
> verdict 검사(필수 3조항). §8.3 정책 추가 · §13 Phase 3 선결 해소·완료 기준 확장 ·
> 에스코트 조항. 스펙 정본: `docs/reference/designs/2026-07-13-unattended-review-gate.md`.
>
> v2.3 변경(2026-07-13, Domain Packs 구현 노트 — Phase 4 착수): §12에 thin+pointer
> 시작 형태 + 챕터 분리 트리거 명시. 규약 정본 = `packs/modules/README.md`.
>
> v2.4 운용 정정(2026-07-16, D-027): D-025의 실행 구조×SAP Policy는 유지한다. 다만
> 이 문서의 `candidate=6de63ba` 고정과 기존 Phase 5·§16 실행순서는 역사 근거로만
> 보존하며 실행하지 않는다. 현재 실행순서 정본은
> `docs/reference/designs/2026-07-16-integration-hardening-roadmap.md`다.
>
> v2.5 통합 반영(2026-07-19, 주/보조 머신 6일 분기 통합 — 정본
> `docs/reference/audits/2026-07-19-branch-divergence-assessment.md`): 병합 베이스 =
> 원격 재기준 줄기. 이 v2.4 **3축(Direct/Guided/Engine attended) 틀**을 트랙 A 설계
> 정본으로 확정(통합 결정 ⑴ — attended 중심 + 무인은 §7 U-gate 통과로 틀 안에서 사용
> 가능; 무인 조건부 개방은 D-034[구 로컬 D-023]로 재기술, 재기술 전 실사용 보류).
> 보조 머신 줄기의 설계 진전을 사실로 편입: Phase 1~4 완료 기준 충족 실측 · Phase 3
> 리뷰 게이트 캡슐 스펙(`docs/reference/designs/2026-07-17-phase3-review-gate.md`, D-032)
> · §13/§14 갱신분. **리뷰 게이트 역할 분담(통합 결정 ⑵ — §13 Phase 3 주 참조)**: 원격
> run-scoped 골격(D-021) = 공통, 무인 경로 SAP write에만 로컬 캡슐 밀봉(D-032)을 관문
> 부품으로 편입(상세 배선은 후속 소규모 설계). vsp-custom 편입 확정(D-030, 통합 직후 —
> D-018 vsp 조항 supersede). 로컬 §8.4 자격증명 스코핑은 원격 §5 N3(frozen authority)·
> §10 SAFETY-PROFILES·§8 escort 모델에 포섭돼 별도 절 미유지(설계 의도 보존, 상위 모델로
> 재배치). D-번호 인용은 통합 결정 ⑶ 재번호(로컬 D-020~023 = D-031~034).

## 0. 한 문장 요약

`sap-agentic-harness`는 `final-harness`의 검증/학습 루프(verify 스냅샷, LESSONS→RULES)를
`vsp-custom`의 SAP ADT CLI 실행 능력과 결합해, ABAP/RAP/CDS/AMDP 개발을 안전한 step 기반
에이전틱 엔지니어링 프로세스로 만들고, 실전 실패에서 증류된 규칙을 모듈 지식으로
축적해가는 통합 레이어 레포다.

## 1. 레포 좌표 (Repository Coordinates)

폴더 경로는 바뀔 수 있으므로 **git 레포 URL을 기준으로 추적한다.** 로컬 경로는 2026-07 기준 참고값.

| 역할 | Git 레포 | 로컬 경로 (참고) | 버전 | 라이선스 |
|---|---|---|---|---|
| **하네스 엔진** | `https://github.com/hjaewon/claude-fable-final.git` | `D:\claude-practice\claude-fable-final` | 검증 lock: `adapters/final-harness.lock.json` (v0.17.1 cf42b64, §15-F 재검증 2026-07-11) | 자작 |
| **SAP 검증/배포 백엔드** | 레포 내 `vsp/` (D-030 편입 — 원천 `hjaewon/vsp-custom` HEAD `5a8bedb`의 git archive 스냅샷, 히스토리 비이식·D-037) | `vsp/` (본 레포 서브트리) | 빌드·명령 계약·provenance: `adapters/vsp/vsp.lock.json` (원천 v2.38.1-94-g5a8bedb, 바이너리 비커밋) | MIT — 업스트림 `oisee/vibing-steampunk` |
| 지식 시드 (동결 — 지식 수정 금지, 2026-07-10) | `https://github.com/hjaewon/sc4sap-custom.git` | `D:\claude for SAP\sc4sap-custom` | — | MIT — 업스트림 `babamba2/superclaude-for-sap` |
| **지식 정본 + 3사 대화형 트랙** | 본 레포 `interactive/` (2026-07-10 subtree 병합, 플러그인명 sapkit — D-041 개명) | `D:\claude for SAP\sap-agentic-harness\interactive` | L5+리뷰 반영 | MIT 승계 — 설계: `interactive/DESIGN.md` |
| 비교 검토된 MCP 서버 | `https://github.com/hjaewon/abap-mcp-adt-powerup.git` | `D:\claude for SAP\abap-mcp-adt-powerup` | v4.13.0 | — |
| **본 레포** | `https://github.com/agentic-sap/sapkit.git` (main — D-041 개명·조직 이전, 구 `hjaewon/sap-agentic-harness`는 리다이렉트) | `D:\claude for SAP\sap-agentic-harness` (로컬 폴더명은 미변경) | — | — |

위 레포 모두 hjaewon 소유(자작 또는 포크)다. MIT 업스트림이므로 콘텐츠 이식·개작에
법적 제약 없음(저작권 고지 유지). 본 문서의 수치·좌표 검증일: 2026-07-09.

> **엔진 델타 주 (2026-07-10, v0.12.1 → v0.16.0, 28커밋)**: 마크다운 계층에
> **요청 라우팅 4갈래**(바로 답변 / 대화 루프 / 무인 phase / 멈추고 질문) +
> **request-weight triage** + **harness-design 인터뷰 루프·대안 비교**가 추가됐다 —
> 본 설계의 "대화형 세션(Phase 0a/0b·CONSULT) + 무인 step" 겸용 구조를 하네스가
> 스킬 차원에서 공식 지원하게 된 것으로, **설계 구조 변경은 불요**(유리한 변화).
> 단 엔진 계층도 변경됨(execute.py 대폭 수정 + 테스트 신설, run.lock 레이스 수리 등)
> → §15-F1~F7은 v0.12.1 실측 → **v0.17.1(cf42b64)에서 재검증 완료(2026-07-11): 전량
> 유지, 설계 영향 변경 0건.** 검증 lock: `adapters/final-harness.lock.json`
> (당시 lock 기록; 현 candidate 계약은 §15-F·§16, D-018)

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
      ├── vsp-custom ......... Engine 실행 백엔드·적용 경로와 독립인 완료 증거 백엔드(CLI)
      └── interactive/ ........ Direct/Guided 사람의 MCP 적용·컨설팅 트랙(3사 하네스) — 본 레포 내
                                서브디렉토리, 하네스 엔진과 코드 의존 없음 (sc4sap-custom은 동결 — 이것이 대체)
```

사람 소유 Direct/Guided의 SAP 적용 경로는 **트랙 B MCP | 사람 셸의
vsp CLI | 사용자 abapGit**이다. Engine attended worker는 headless 계약 안에서
vsp CLI만 쓴다. 어느 경로로 적용했든 Track A 완료 증거는 동일 source의
vsp CLI read-back·syntax/activation·unit/ATC 체인이다. 적용 도구의 success
응답을 완료 증거로 바꾸지 않는다(D-025, 재기준 v2 §0·§4·§5).

`vsp-custom`은 D-030으로 레포 내 `vsp/`에 **편입**됐다(소스 정본 = in-repo 서브트리 —
원천 `hjaewon/vsp-custom` HEAD `5a8bedb`의 git archive 스냅샷, 히스토리 비이식·D-037).
사용 계약은 **검증 중심**(파서·lint·parse·test·source read)으로 보증하고 write 계열은
기존 안전 장치(write 프로파일 게이트·SAFETY-PROFILES·R-003)를 그대로 유지한다(D-036).
바이너리는 **비커밋**이며 빌드는 머신/CI 몫이다 — `adapters/vsp/vsp.lock.json`의
`binary.build_command`(`CGO_ENABLED=0 -trimpath`, BuildDate를 원천 커밋 시각으로 고정한
재현 빌드)가 재현 기준이고, CI `vsp-build` 잡이 매번 빌드해 명령 계약을 assert한다.
`final-harness`만 **D-018 취지의 분리 + 버전 lock**을 유지한다 — 본 레포는 그 엔진을
문서·템플릿·스킬·설정으로 소비하며 소스를 섞지 않는다(승격 절차 §16). vsp 편입 판단의
근거·대안 기각·불변 조건은 DECISIONS D-018→D-030→D-036→D-037이 보존한다.

## 3. 백엔드 결정: vsp-custom vs abap-mcp-adt-powerup

두 도구의 목적은 같다(ADT 경유 SAP 개발 도구 표면). **Track A의 Engine
실행·완료 증거 백엔드는 vsp-custom CLI로 확정한다.** 이 배타성은
사람 소유 Direct/Guided의 SAP mutation path까지 독점한다는 뜻이 아니다.

결정적 이유는 **Engine attended의 headless child**에 한정된다. candidate
`6de63ba`의 Claude child는 `--strict-mcp-config`, Codex child는 성공적으로
열거된 named MCP 서버를 `enabled=false`로 기동한다(§15-F1). 따라서 MCP
전용 도구는 **Engine headless step의** 실행·verify backend가 될 수 없고, exit
code로 판정할 CLI가 있는 vsp가 필요하다. Direct/Guided는 현재 사람이
소유한 대화 세션이므로 이 headless MCP 차단 범위 밖이다.

전체 비교 (실측 기반):

| 기준 | vsp-custom | abap-mcp-adt-powerup v4.13.0 |
|---|---|---|
| 인터페이스 | **CLI + MCP**(147 tools 또는 1-tool hyperfocused ~200토큰) | MCP 전용 (339 tools 문서 기준, 기본 노출은 exposition 설정으로 축소) |
| Engine/Track A 완료 verify로 사용 | ✅ 셸 실행, exit code | ❌ Engine headless step에서 MCP 차단됨 |
| 오프라인 동작 | ✅ `lint/parse --file`, embedded standards | ❌ SAP 연결 필수 |
| 패키지 분석 | ✅ health/boundaries/api-surface/slim/changelog | 조회 위주 (PackageTree 등) |
| RAP 아티팩트 생성 폭 | DDLS/BDEF/SRVD/SRVB 배포 지원 | ✅ 더 넓음 (MDE 생성, CDS unit test 포함) |
| 런타임 진단 | 디버거, 프로파일링 | ✅ 덤프 분석/프로파일러 도구셋 |
| abapGit 통합 | ✅ `--feature-abapgit`, `install abapgit`, 158 타입 export | ❌ |
| ABAP 표준/템플릿 내장 | ✅ ListStandards/GetStandard (hjaewon 포크에서 이미 커스텀) | ❌ (sc4sap 플러그인 계층이 담당) |

**권고 운용:** Engine-P3/P4 worker는 vsp CLI만 쓴다. Direct/Guided의 사람은
트랙 B MCP write, 사람 셸 vsp CLI, 사용자 abapGit 중 적용 경로를 고를 수 있다.
P4에서 vsp worker 할당은 `vsp deploy <file> <package> --transport <req>`만
지원하며 `copy`에 transport flag가 있다고 가정하지 않는다. 사람 적용 경로와
무관하게 완료 도장은 vsp CLI 증거로만 찍는다. powerup이 우위인 영역(RAP
생성 폭, 런타임 진단)은 트랙 B MCP를 켠 **대화형 세션**에서 보완한다 —
대화형 세션은 사람 소유라 MCP 사용이 하네스 보증과 충돌하지 않는다.

주의(현행으로 갱신): **SAP 접점을 이원화하지 않는다**는 것이 이 절이 지키는 원리다.
같은 ADT를 두고 MCP 서버가 2개 공존하면 도구가 겹치고 권한 정책이 갈라진다 — 그래서
어떤 로컬 도구도 온라인(SAP 접속) MCP 모드로 기동하지 않는다. **SAP 무접속 로컬
검사**는 이 근거가 성립하지 않아 금지 밖이고(D-049), 지금 그 자리는 **자체 저작
검사기**가 맡는다: 소스 정본 `sapkit-cli/`, 제품에 동봉된 번들
`interactive/checker/sapkit-checker.bundle.cjs`이며 **접속·MCP 모드가 코드에 없다**.
트랙 B가 abapGit 로컬 소스 흐름의 사전 검사로 훅 배선해 쓴다(경고 전용, 서버
CheckSyntax와 반영 확인 절차의 권위 불변). 이 절의 나머지 비교표는 백엔드 결정 당시의
기록이다.

## 4. 아키텍처 계층

```text
sap-agentic-harness/
  harness layer      final-harness 설치본(.harness/) — 계획/루프/검증/학습. 엔진 수정 금지
  sap adapter layer  vsp CLI 호출 규약, verify 패턴, 실패 분류, 안전 프로필
  domain layer       ABAP/RAP/CDS/AMDP 규칙 시드, 템플릿, 체크리스트
  packs layer        모듈 컨설턴트 지식팩 (CONSULT 본체 + RULES 정예, §12)
```

## 5. 엔진 불변식 (final-harness가 이미 기계적으로 보증하는 것)

정본은 재기준 v2 §9의 F1~F7·N1~N8 표다. 아래는 candidate
`6de63ba` 계약의 Track A 소비 정의이며, verified lock 승격 선언이 아니다.
근거 좌표·candidate 변경 표면은 §15-F에 둔다.

| ID | `6de63ba` 계약 | Track A 소비 |
|---|---|---|
| F1 | Claude headless는 strict MCP, Codex는 열거된 named MCP를 disable. Codex 성공+빈 stdout과 Bridge는 예외 | MCP 차단은 Engine child에만 적용. Direct/Guided 사람 MCP는 허용 |
| F2 | Direct/Guided에서 router no-op, Engine에서만 Stop gate. no-manifest WARN은 Engine 기동 1회 | Direct는 하네스 흔적 0, Engine만 계약 소비 |
| F3 | audit `>=30 rules`/`>=12KB`; Engine `>40 rules` WARN, `>16KB` 기동 거부 | 감사 임계와 hard gate를 합치지 않음 |
| F4 | tailor의 quality-gate·VERIFY-PATTERNS·rule seed 계약 유지; installer와 learning copy는 별개 | installer가 RULES/LESSONS/PROTOCOL을 복사한다고 쓰지 않음 |
| F5 | repo 내 verify 위임 타겟만 감사 | 외부 vsp 바이너리는 별도 lock/hash로 검증 |
| F6 | TDD guard는 Engine edit에만 발화하고 ABAP은 미발화 | ABAP review/TDD는 프로젝트 계약이 담당 |
| F7 | dangerous-bash와 authority-gate는 병렬이며 둘 다 vsp를 인지하지 못함 | `historical_rv4_classifier=open`, 사람 write 금지 근거로 오용 금지 |
| N1 | normalized approval hash와 runtime byte freeze는 별개 | 둘 다 증거에 기록 |
| N2 | authority envelope는 `run_id`가 있는 new-style run에만 강제 | wrapper가 legacy/no-run-id를 기본 거부 |
| N3 | CLI child 권한은 parent가 동결한 authority JSON | credential 이름·network·deploy 범위 최소화 |
| N4 | fresh Bridge lease가 있으면 malformed context fail-closed | Bridge는 attended만, write MCP worker 금지 |
| N5 | 실제 create/modify/delete/rename을 write paths에 재대조·복구 | 범위 밖 파일 gate 실증 |
| N6 | unattended의 보안 경계는 외부 container/VM | 현재 `unattended=sealed` |
| N7 | native post-run review는 **default off**이고 실행해도 non-gate | 별도 run-scoped own-verify만 R-PASS |
| N8 | `--allow-no-verify`는 legacy 전용이고 new-style run은 거부 | wrapper는 legacy 자체를 거부 |

candidate installer의 managed runtime에서 제품 test 4개가 retired됐고
(`6de63ba:skills/harness-init/templates/engine/install_engine.py:31-55`), 이전
manifest가 소유하고 byte가 같은 파일만 `removed_obsolete`로 삭제한다
(`6de63ba:skills/harness-init/templates/engine/install_engine.py:337-385`). 현 target의
staging 기대값은 `scripts/test_execute.py`·`scripts/test_hooks.py` 정확히 2개이며,
나머지 2개는 target에 없다. 이는 실제 삭제 완료가 아니라 §12 staging gate의
예상값이다.

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

## 8. 실행 구조 × SAP Policy — 3×5 매핑 포인터

구 Offline/Read-Only/Gated Write는 실행 모드가 아니다. action마다
**실행 구조** 하나와 직교하는 **SAP Policy 프로필** 하나를 고른다. 전체
15칸 소유권·경로·종결 조건의 단일 정본은
`docs/reference/designs/2026-07-15-track-a-rebase-v2.md` §3~§4이며, v2와 D-025가
직접 통제한다(하위 프로필 문서가 이를 고쳐 적거나 완화할 수 없다).

| 실행 구조 | 선택 규칙 |
|---|---|
| **Direct** | 현재 사람 세션의 기본값. run 흔적 없음 |
| **Guided** | SAP 코드 완료, Direct-P3 종결, pause/resume, fresh review·지속 증거가 필요할 때 명시 승격. `.harness/runs/<run-id>/` 전용 |
| **Engine attended** | 승인된 new-style contract/manifest의 bounded step·retry·seed·batch. `scripts/run-track-a.ps1`만 진입점 |

| Policy | 최고 효과 | 구 라벨과의 관계 |
|---|---|---|
| **P0 offline** | SAP 연결 없음 | Offline |
| **P1 connected-read** | metadata/source/ATC/health; row data·mutation 없음 | Read의 비-row 부분 |
| **P2 real-data extraction** | `GetTableContents`/`GetSqlQuery` 및 SAP 행 데이터를 끌어오는 **모든 경로**(로컬 CLI·스크립트·직접 질의) | Read에서 분리된 실데이터 호출 |
| **P3 write/execute** | SAP 상태·코드 변경 또는 실행 | Gated Write의 write/execute 부분 |
| **P4 transport** | package/request 생성·할당·release·import | Gated Write에서 소유권을 별도 정의한 상위 효과 |

라우팅은 파일·step 수가 아니라 action 소유자로 정하고, Policy는
`P4 > P3 > P2 > P1 > P0` 중 최고 효과로 정한다. P2와 P3를 한 action에
합치지 않는다. P2는 **매 호출 전** 범위·필드·row 상한을 보여 사람
승인을 받고 batch·subagent·자동 승인을 금지한다.

Direct/Guided-P3의 사람 적용 경로는 MCP·사람이 모는 CLI·abapGit 모두 정당하다.
Direct SAP code는 `DRAFT`, Direct-P3는 `PROVISIONAL_WRITE`이며, 완료는
**기계 확인**(`interactive/core/procedures/verify-applied.md`) **+ Guided-P3
exact-subject `R-PASS`** 둘 다가 필요하다(도장 의식 폐지 — D-075). Engine-P3/P4 worker는
vsp CLI만 쓰고, Engine-P2는 pause 후 Guided-P2 사람 호출로 넘긴다. Direct-P4는
지원 진입점이 없으며 재기준 v2 §4.2의 Guided/Engine 소유권을 따른다.

**에스코트는 별도 축이나 모드가 아니라 Guided-P3/P4 또는
Engine-P3/P4 안의 credential-owner 실행 형태**다. reviewer는 P0/P1만 수행하되
transport read를 포함한 모든 transport 동작을 금지한다. 지원 상태는
`attended-only`, `unattended=sealed`, `historical_rv4_classifier=open`,
`sap_mutation_boundary=unverified`(reviewer + all attended child)다.


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
      SAFETY-PROFILES.md         ← P0~P4 효과 allowlist, package allowlist,
                                    transport·credential 소유권(재기준 v2 §4),
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
  vsp/                           ← SAP 검증/배포 백엔드 소스 (D-030 편입 — 원천 스냅샷,
                                    히스토리 비이식·D-037; 바이너리 build/vsp[.exe]는
                                    비커밋, lock build_command로 빌드)
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
  packs(§12)와 P1 connected-read(§8)를 사용한다.

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

**구현 노트 (결정 2026-07-13)**: 위 구조는 완전형(목표 형태)이다. 실제 구현은
**thin+pointer**로 시작한다 — 지식 정본이 이미 `interactive/core/knowledge/
modules/<MOD>/`에 있으므로 복사하지 않고 `CONSULTANT.md`가 링크로 가리키기만
하며, TABLES.md/TCODES.md/SPRO.md 등 개별 챕터 파일은 아직 만들지 않는다.
**챕터 분리 트리거**: CONSULT 세션이 특정 챕터를 반복적으로 개별 참조하게 되면
그때 해당 챕터를 분리한다. 이 규약의 정본은 `packs/modules/README.md`.

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

Phase 0a~4는 2026-07-09~14의 **역사 완료 로드맵**이며 현재 라우팅
권위가 아니다. 기존 `phases/`는 byte를 보존하고 기본 비활성하며 raw
`scripts/execute.py`로 재실행하지 않는다. 현재 작업은 아래 **Phase 5 재기준
신판**이다. 실행 구조×Policy 라우팅은 §8과 재기준 v2 §3~§4를 따른다.

### Phase 0a: Scaffold (오프라인 — SAP 연결 불필요)
- **당시 부트스트랩 선결 완료** (vsp 빌드, final-harness 플러그인 설치, 파일럿 결정; 역사 상세는 HANDOFF)
- ~~git init + `hjaewon/sap-agentic-harness` 원격 생성~~ ✅ 완료 (2026-07-09, 첫 커밋 ba42645)
- final-harness 설치(harness-init) → harness-tailor 실행(quality-gate.json,
  VERIFY-PATTERNS 스텁, rule seed)
- `scripts/quality-gate-sap.ps1`, `scripts/verify-sap.ps1` 스켈레톤 작성 (§9)
- lint/parse exit code 의미론 재확인으로 `adapters/vsp/VERIFY-PATTERNS.md` 실측 표 시작
- **완료 기준**: `.harness/` 존재 + quality-gate.json이 래퍼를 가리킴 + 의도적 lint
  Error 파일이 게이트에서 실제 차단됨을 1회 실증

### Phase 0b: Connected Discovery (SAP 연결 필요; 역사 완료)
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

### Phase 1.5: Connected Online Validation (v2 신설 — 2026-07-11 Phase 0b 실측으로 재정의)
- §14-9 판정: read-only syntax check **부재 확정**(문법 검사는 쓰기 경로에만 결합 —
  adapters/vsp/COMMANDS.md §11) → 예정대로 **ATC/health 기반 online validation으로 재정의**.
  단 atc/health는 findings가 있어도 exit 0이므로 verify는 출력 파싱 규약
  (adapters/vsp/VERIFY-PATTERNS.md) 경유가 필수다.
- 보조 후보: $TMP 스테이징 deploy가 서버 문법 검사를 겸한다(단 오류 객체도 생성되는
  부작용 실측 — 채택 여부는 Phase 1에서 결정).
- **완료 기준**: offline에서 통과하나 connected에서 실패하는 케이스 1건 이상을 의도적으로
  만들어 검출됨을 확인

### Phase 2: Online Read-Only Planning
- 기존 package/object context를 계획에 반영, where-used/boundary 분석을 계획 단계에 편입
- **완료 기준**: 분석 결과가 계획의 결정(대상 객체 선정 또는 의존 순서)을 실제로
  바꾼 사례 1건이 계획 문서에 기록됨

### Phase 3: Gated Deploy
- spec 승인 게이트 + package allowlist + transport 정책 (SAFETY-PROFILES.md)
- **새-컨텍스트 리뷰 게이트 — 역할 분담 (통합 결정 ⑵, 2026-07-19)**: 공통 골격 =
  원격 run-scoped verdict 리뷰 스텝(현 정본: 재기준 v2 §5 · plan-레벨 자기-verify
  게이트 + 필수 3조항 · 검사기 `scripts/check-review-verdict.ps1`; 역사 스펙
  `docs/reference/designs/2026-07-13-unattended-review-gate.md`). **무인 경로의 SAP
  write에 한해** 로컬 캡슐 밀봉(write 직전 별도 리뷰 스텝·엔진 무수정·캡슐 해시
  바인딩·캡슐본 배포 = TOCTOU 제거; 스펙 정본
  `docs/reference/designs/2026-07-17-phase3-review-gate.md`[D-032] · 구현
  `scripts/review-gate/`)을 관문 부품으로 편입해 배포물 봉인을 보증한다. 양쪽 phase
  산출물은 이력 보존. 두 방식의 상세 배선 설계는 통합 후 소규모 후속 작업이다.
- deploy → activate → **drift check(§6)** → ATC → unit test verify 체인 구축 — 리뷰
  게이트 구현(리뷰 스텝 관례·검사기·체크리스트 이식)은 이 Phase 작업에 포함
- 환경 실패 분류 규약 적용 (§9)
- 선결 3건(HANDOFF §5-11) 전부 해소됨: 0b 마커 실측(§14-3 ✅ 2026-07-11) · drift
  실측(§14-2 ✅ 2026-07-11) · 리뷰 게이트(위 설계로 해소, 구현은 본 Phase)
- **완료 기준**: 객체 1건이 전체 체인을 통과해 SAP에 존재하고, drift check가 SE80 수동
  변경을 실제로 검출함을 1회 실증하며, **리뷰 게이트가 씨앗 시맨틱 결함(INNER vs LEFT
  JOIN 급 — 기계 4층 검증을 통과한 실제 결함)을 실제 차단함을 1회 실증**
- **보조 머신 실증 (사실 기록, 2026-07-19 통합)**: Phase 3 완료 기준 ①②③ 전부 실측
  충족(리뷰 PASS 객체 전 write 체인 통과 · SE80 drift 검출 · 씨앗 시맨틱 결함 차단) —
  상세는 HANDOFF 보조 머신 줄기. 무인 상시 write 개방은 D-034(구 로컬 D-023)로 조건부
  재기술($TMP·DEV tier·리뷰 게이트 경유)되며 재기술 전 실사용 보류(⑴).
- **drift 실증기의 채널**: out-of-band 변경을 모사하는 도구(하네스 밖 변경 실증용)는
  비-vsp 채널을 정당하게 쓴다 — vsp 단일 접점 원칙(PRD 비목표)은 하네스 **자신**의
  작업·검증 경로에 한정되며, out-of-band 모사는 정의상 그 경로 밖이어야 실증이
  성립한다 (실측 채널: MCP `UpdateProgram`+`ActivateObjects` — D-033,
  phases/4-gated-deploy/state/drift-evidence.json)
- **에스코트 재판정**: 과거 차단 실증은 역사 증거다. 현재 에스코트는
  Guided/Engine-P3/P4 안의 사람 credential-owner 실행 형태이며, 실증 완료가
  unattended 전환을 의미하지 않는다. `unattended=sealed` (해제는 §7 U-gate + 별도
  사용자 D-결정 필요 — 통합 결정 ⑴).

### Phase 4: Domain Packs
- FI/CO부터 이중 구조(§12)로 시작, sc4sap 지식 선별 이식
- **완료 기준**: 팩 1개가 CONSULT 단계에서 실사용되고, LESSONS 유래 규칙 1건이 RULES로
  승격(자연 발생 실패가 없으면 의도적 실패 주입으로 대체 가능)

### Phase 5: Track A 재기준 v2 (D-025)

> **D-027 supersede (2026-07-16):** 아래 `6de63ba` 순서는 당시 계획의 역사 기록이다.
> 현재 작업 지시로 사용하지 않는다. Track B 안전 봉인과 clean v0.20.x candidate 선정부터
> 시작하는 최신 순서는 `docs/reference/designs/2026-07-16-integration-hardening-roadmap.md`를
> 따른다.

1. 재기준 v2 §11의 문서·Policy·legacy 연쇄를 표 단위로 집행한다.
2. lock v2에 현 `verified=8f7f13b` 스냅샷을 보존하고
   `candidate=6de63ba,state=selected`를 별도로 둔다. wrapper/legacy deny 계약을
   먼저 구현한다.
3. clean detached `6de63ba`에서 upstream 전체 test를 실행한 뒤 disposable
   staging migration/install을 수행한다. §12 G1~G5·G11을 포함한 staging
   합격 전에는 `candidate.state=staged`로 바꾸지 않는다.
4. §12 G1~G14, Guided-P3 파일럿 A, Engine attended-P3 파일럿 B,
   P4 T1~T5(`READY_FOR_RELEASE`, release 안 함)를 exact candidate SHA 증거로 통과한다.
5. 위 조건이 모두 PASS일 때만 원자적 PROMOTE로 `verified`를 candidate로
   교체하고 이전 verified를 `history`에 보존하며 `candidate=null`로 비운다.

Phase 5 완료에 unattended 해제는 포함되지 않는다. §7 U-gate와 별도 사용자
D-결정 전까지 `attended-only / unattended=sealed`다. 실제 delivery를
주장하는 run만 사람 T6 release·T7 STMS import를 추가한다.

## 14. 미결 사항 (구현 시점에 결정)

| # | 항목 | 결정 시점 |
|---|---|---|
| 1 | tdd-guard 대응: 엔진의 ABAP 확장(업스트림 기여) vs 관례 강제 유지 (§7) | ✅ 관례 강제 유지 확정 (§7): tdd-guard가 ABAP 미발화·설정 확장 불가 → RULES.seed/CHECKLIST + harness-plan 관례 강제. 엔진 ABAP 확장(업스트림 기여)은 본 레포 스코프 밖(스윕 제외) |
| 2 | drift check: 객체 타입별 정규화 규칙 + export/비교 명령 (§6) | ✅ 0b 실측(2026-07-11): `vsp source read` 객체 단위 왕복 확인. export는 WebSocket 403 결함으로 보류 (COMMANDS.md §7). 타입별 정규화 규칙은 Phase 1에서 대상 타입 확장 시 |
| 3 | verify 실패 유형별 출력 패턴 실측 → verify-sap.ps1 마커 완성 (exit code는 일괄 1로 확인 — §15-V10) | ✅ 0b 완료(2026-07-11): ENV 4계열·CODE 2계열·LOCK 실재현 → verify-sap.ps1 반영, 4마커 재현 검증 (VERIFY-PATTERNS.md) |
| 4 | deploy/copy의 객체 타입별 지원 범위(class include는 TODO — §15-V6)와 src/→SAP 배포 매체(파일별 deploy vs zip copy) | 부분 판정 갱신(2026-07-12 수리 3 완료): **PROG·CLAS 모두 deploy/copy 동작** — Phase 2 채점에서 발견된 CLAS 결함 3건(deploy NoModification 오탐 가드+잠금 누수, copy 거짓 성공)을 당일 수리·라이브 검증 (vsp v2.38.1-89, COMMANDS.md ⑤-6/7). ✅ 2026-07-19 실측: class include(테스트클래스) 배포도 v2.38.1-94에서 지원 확인(ADR-002 Addendum) — 테스트 재배치는 사용자 결정 대기. 나머지 타입은 Phase 3에서 계속 |
| 5 | offline lint의 CDS/RAP/AMDP 실효 커버리지 | ✅ Phase 1 실측(2026-07-11): VERIFY-PATTERNS.md "객체 유형별 offline 커버리지" 표 — ABAP 리포트/클래스만 Error 4종, CDS/BDEF/AMDP 구조 검증 전무 (§15-V3 확인) |
| 6 | sap-harness-* 전용 스킬 신설 필요 여부 | ✅ 신설 보류 유지 (§11): 기존 final-harness 스킬 재사용, Phase 1까지 부족 실증 없음(E2E create-program 완주) → sap-harness-* 신설 불요 |
| 7 | 재기준 파일럿 객체/패키지 exact 선정 | Phase 5 파일럿 직전(재기준 v2 §12.2). 참고: Phase 1 첫 파일럿은 ZSAH1_WORKDAYS(PROG, $TMP)로 완료(보조 머신 — VERIFY-PATTERNS Phase 1.5 red/green 실증, phases/1-workdays-util/; E2E는 ZR_FI_GL_LIST) |
| 8 | lint `--strict`(Warning도 실패) 옵션의 vsp 포크 추가 여부 (§15-V2) | ✅ 외부 vsp-custom 포크 결정이라 유보(스프린트 제외 규칙: 외부 레포 업스트림 기여 제외) |
| 9 | read-only SAP syntax check 명령의 실재 여부 (없으면 Phase 1.5 재정의) | ✅ 0b 판정(2026-07-11): 부재 — Phase 1.5를 ATC/health 기반으로 재정의 (§13) |

## 15. 설계 중 실측으로 확인된 사실 (근거 좌표)

구현 세션이 전제를 재검증할 때 사용한다. final-harness F/N은 candidate
`6de63bac860723ff1bfd50a940a75e46c6e87d99` blob 계약이며 verified 승격
전이다. vsp V1~V11은 아래의 별도 고정 버전 실측이다.

**final-harness candidate `6de63ba` — F1~F7:**

| ID | candidate 계약 | Track A 소비 |
|---|---|---|
| F1 | Claude headless strict MCP; Codex named MCP disable. 성공+빈 stdout·Bridge 예외 | Engine은 MCP를 SAP 경로로 쓰지 않음. Direct/Guided 사람 MCP 허용 |
| F2 | Direct/Guided router no-op, Engine Stop gate. no-manifest WARN은 Engine 기동 1회 | Direct zero-footprint·hook no-op 실증 |
| F3 | audit `>=30 rules`/`>=12KB`; Engine `>40 rules` WARN, `>16KB` hard fail | proactive audit와 기동 gate 분리 |
| F4 | tailor 산출 계약 유지; installer와 learning copy 주체 분리 | RULES/LESSONS/PROTOCOL installer 복사 주장 금지 |
| F5 | repo 내 verify 위임 타겟만 감사 | 외부 vsp는 별도 lock/hash |
| F6 | TDD guard는 Engine edit에만, ABAP 미발화 | ABAP review/TDD는 project 계약 |
| F7 | dangerous-bash·authority-gate 병렬, vsp 미인지 | RV4 open, 사람 write 금지 근거로 오용 금지 |

**final-harness candidate `6de63ba` — N1~N8:**

| ID | 불변식 | Track A 조치 |
|---|---|---|
| N1 | normalized approval hash·runtime byte freeze 분리 | 둘 다 증거 기록 |
| N2 | authority envelope는 new-style run만 | wrapper가 no-run-id 기본 거부 |
| N3 | child 권한은 parent의 frozen authority JSON | 권한 범위 최소화 |
| N4 | fresh Bridge lease에서 malformed context fail-closed | Bridge attended-only, write MCP worker 금지 |
| N5 | 실제 변경을 write paths에 재대조·복구 | 범위 밖 파일 gate |
| N6 | unattended 보안 경계는 외부 container/VM | §7 전 `sealed` |
| N7 | native post-run review는 **default off·non-gate** | run-scoped own-verify만 R-PASS |
| N8 | `--allow-no-verify`는 legacy 전용, new-style run 거부 | wrapper가 legacy 자체 거부 |

[실측 재사용] F1~F7의 의미는 `929685a..6de63ba` 허용 델타에서
변경 없음(보존 분석 `docs/reference/designs/2026-07-14-v019-engine-analysis.md:14`).
F1~F7의 최종 `6de63ba` file:line 재채록은 PROMOTE gate 전 **미확인**이며 구
v0.17 좌표를 재사용하지 않는다. candidate에서 변경된 exact 좌표는 다음과 같다.

- N7 default-off/non-gate:
  `skills/harness-init/templates/engine/scripts/execute.py:3442-3447`,
  `skills/harness-init/templates/engine/scripts/execute.py:3524-3533`
- N8 new-style `--allow-no-verify` 거부:
  `skills/harness-init/templates/engine/scripts/execute.py:1415-1424`
- retired managed/test 표면·소유/byte 일치 삭제:
  `skills/harness-init/templates/engine/install_engine.py:31-55`,
  `skills/harness-init/templates/engine/install_engine.py:337-385`

위 좌표의 commit은 모두 `6de63bac860723ff1bfd50a940a75e46c6e87d99`다. 현
target의 staging 예상 `removed_obsolete`는 `scripts/test_execute.py`·
`scripts/test_hooks.py` 2개이고 나머지 retired test 2개는 target에 없다.

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

## 16. 재기준 부트스트랩·lock 승격 순서

> **D-027 supersede (2026-07-16):** 이 절의 `6de63ba` 승격 절차는 역사 보존 상태이며
> 실행 금지다. 현행 S0~S6 순서와 candidate 선정 게이트는
> `docs/reference/designs/2026-07-16-integration-hardening-roadmap.md`가 대체한다.

구 Phase 0 부트스트랩은 완료된 역사다. 현재는 D-018 분리를 유지하면서
final-harness candidate를 다음 순서로만 승격한다(정본: 재기준 v2 §10·§12).

1. **lock v2 candidate 등록** — `adapters/final-harness.lock.json`을 schema v2로
   변환하되, 현 verified `8f7f13b` 스냅샷·source-lock 해시·plugin·F1~F7을
   exact 보존한다. candidate는 `6de63bac860723ff1bfd50a940a75e46c6e87d99`,
   version `v0.19.3`, 초기 `state=selected`로 별도 기록한다. top-level
   `safety_state`의 `operation_mode=attended-only`, `unattended=sealed`,
   `historical_rv4_classifier=open`, `sap_mutation_boundary=unverified`, scope=
   reviewer + all attended child를 PROMOTE/REJECT에서도 보존한다.
2. **wrapper·legacy deny 선행** — `scripts/run-track-a.ps1`를 유일한 지원
   Engine 진입점으로 두고, no-run-id·deny catalog·잘못된 contract/manifest를 exit 64
   `LEGACY_PHASE_DENY`로 거부한다. raw `python scripts/execute.py <phase>`는
   지원하지 않는다. candidate 실행은 4번 통과 후 `state=staged`+명시
   `-Candidate`에서만 허용한다.
3. **clean detached test** — dirty 상류 worktree를 사용하지 않고 exact
   `6de63ba` detached checkout에서 plugin blob=`0.19.3`을 확인한다. Windows
   Python 3.9·3.12 각각 upstream `tests` + engine template 전체를 exit 0으로 통과한다.
4. **disposable staging install/migration** — 복제 target에 candidate installer를
   먼저 실행한다. 합격값은 `skipped_modified=[]`, `skipped_user_owned=[]`,
   `removed_obsolete` 정확히 `{scripts/test_execute.py,scripts/test_hooks.py}`,
   new-style example contract/manifest 2개, `phases/**`·`interactive/**` byte diff 0이다.
   트랙 B hook 3개의 matcher+command 동일성·실발화와 Direct 양 driver 흔적 0도
   검사한다. 이 staging gate가 모두 PASS일 때만 `state=staged`다.
5. **attended install·pilot·gate** — staging 후에만 주 머신에 candidate를
   설치하고, wrapper의 `-Candidate`로 Guided 파일럿 A·Engine attended 파일럿 B와
   §12 G1~G14·P4 T1~T5를 수행한다. native `--review`는 R-PASS가 아니다.
6. **PROMOTE** — 모든 evidence가 exact candidate SHA와 해시로 묶이고 PASS일
   때만 원자적 전이를 적용한다. 이전 verified는 `history.outcome=superseded`로
   보존하고 candidate 값으로 새 `verified`를 만든 뒤 `candidate=null`로 비운다.

최종 SHA가 한 글자라도 달라지면 증거를 상속하지 않고 델타·test·migration·
pilot·gate를 전부 재실행한다. verified 승격과 unattended 해제는 다른 상태다.
§7 U-gate와 별도 D-결정 전까지 `unattended=sealed`다.
