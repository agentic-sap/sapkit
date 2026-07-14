# 트랙 A 실행 모델 재기준 설계서 — v0.19 3축 (Direct/Guided/Engine attended)

> 정본 결정: D-023(방향)·D-024(Codex 정정). 사실 기반: 단계 1 분석
> [`2026-07-14-v019-engine-analysis.md`](2026-07-14-v019-engine-analysis.md)
> (Codex, 커밋 929685a=v0.19.2 blob). 본 설계서는 **모드 매핑의 단일 정본** —
> 단계 4 문서 연쇄 갱신은 이 매핑을 각 문서에 적용하는 작업이다.
> 작성 2026-07-14. 상태: 초안(사용자 검토 대기).

---

## 0. 이 설계서가 확정하는 것

D-024는 방향·정정·5단계 계획을 담았지만, **"트랙 A가 v0.19 밑에서 구체적으로 어떤
모습인가"**는 미설계였다. 상류 아키텍처 문서(architecture-v0.19)는 일반론이라 SAP
고유 관심사(vsp verify·에스코트·실데이터 게이트·리뷰 게이트·트랙 B 훅)를 다루지
않는다. 본 설계서가 그 SAP 매핑을 확정한다:

1. 트랙 A 활동 → Direct/Guided/Engine 축 매핑 (§2)
2. AGENTS.md 라우팅 재작성안 (§3)
3. RV4 기계 경계 설계 (§4)
4. legacy catalog 설계 (§5)
5. F-불변식 재정의 요약 + 문서 연쇄 변경 목록 (§6)
6. pin 결정 + 파일럿·게이트 (§7)

## 1. 대상 상태 한 줄

> 트랙 A = **Direct 기본**(하네스 흔적 0) · 구조 필요 SAP 작업 = **Guided**(작업별
> run 계약) · 씨앗 규칙-승격 실험·배치 = **Engine attended**(신규 phase는 run 계약 +
> 권한 봉투). Unattended(사람 없이 자율)는 container/VM 격리 + 배포-불능 SAP principal
> 이 실증되기 전까지 **봉인**. vsp CLI = 유일 SAP 접점·verify 백엔드(불변).

핵심 정정(D-024): "Guided 기본"이 아니라 **"Direct 기본 + Guided 명시 승격"**.
상류가 Guided always-on을 명시적으로 기각(analysis N-표·architecture §Rejected).

## 2. 모드 매핑 (트랙 A 활동 → 축)

| 트랙 A 활동 | 축 | 근거 |
|---|---|---|
| ABAP/CDS 소스 초안, offline lint, 표준 조회 | **Direct** | SAP 무접촉·저위험·현 세션. 흔적 0 |
| CONSULT 답사, where-used·영향도 분석(read-only online) | **Direct** (다단계면 Guided) | 분석 작업, 되돌리기 쉬움 |
| 문서·CI·메타 작업(오늘 한 것 류) | **Direct** | 루프 강제 대상 아님 (기존 마찰의 근원) |
| 프로그램 생성 등 사람 주도 SAP 개발(MCP 탐색 + vsp verify + 새-컨텍스트 리뷰 → 에스코트) | **Guided** | 성공 기준 정리·중단재개·강화 리뷰가 유용. **대부분의 실 SAP 개발이 여기** |
| 씨앗 결함 주입 → 규칙 승격 실험(3a/4a 류) | **Engine attended** | fresh 세션 + bounded retry + **기계 verdict 게이트**가 존재 이유 |
| 배치 규모 반복 작업 | **Engine attended** | 다수 독립 step 오케스트레이션 |
| 에스코트 배포(deploy→drift→atc→unit) | **사람(부모 step)** | 자격증명 필요·비가역. 축 밖 — Guided/Engine phase의 수동 마무리 |

**Phase 4 소급 재분류**: 4a/4b는 "무인"이 아니라 **Engine attended**였다(사용자 참관·
에스코트 수동). 재기준 후에도 이 방식은 그대로 유지 — 다음 씨앗 phase·배치는 동일하게
`execute.py`로 돈다. **없애는 것 없음**(§ D-024 불변 재확인).

**품질 모델(D-019)의 축별 적용**:
- Engine attended: 리뷰 게이트 = `check-review-verdict.ps1`(기계 verdict 차단, 엔진
  review는 비게이트 N7이므로 이 스크립트가 유일 차단기 — 유지).
- Guided: 새-컨텍스트 리뷰 = 사람이 호출(서브에이전트/fresh 세션), D-019 3요소
  (1워커+1리뷰+기계검증). 기계 verdict ps1은 선택.
- Direct: 리뷰 강제 없음. **단 SAP 코드/write는 새-컨텍스트 리뷰 대상**(사소한 문서·
  분석은 비강제) — 이 경계를 문서에 명시.

## 3. AGENTS.md 라우팅 재작성안

현행 AGENTS.md는 "모든 실질 작업 → CONSULT→GOAL→VERIFY 루프"를 강제한다(싱글톤
GOAL/STATE 기반). 이는 v0.19가 "넓은 하네스 문제의 재현"으로 기각한 패턴이고, 실사용
마찰이 실재(문서·CI 작업에 루프 무용). 재작성 골자:

```
## 실행 모드 (v0.19 3축 — Direct 기본)

작업을 시작하기 전 크기를 가늠한다. 기본은 Direct다 — 더 강한 축은 그 작업에서
구조가 실제 실패를 줄일 때만 명시적으로 제안하고 승인을 받는다.

- Direct (기본): 요구가 명확하고 현 세션에서 검증 가능. .harness/ 미접촉,
  훅 없음. offline 초안·조회·분석·문서·메타 작업.
- Guided (SAP 개발 다수): 성공 기준 정리·중단재개·강화 리뷰가 유용한 사람 주도
  SAP 작업. .harness/runs/<run-id>/ 계약(contract+manifest)만 생성. 명시 요청이
  모드 승인. → harness-loop 스킬.
- Engine attended: 씨앗 규칙-승격 실험·배치. 신규 phase는 run 계약+권한 봉투 필수.
  python scripts/execute.py <phase>. Unattended는 격리 실증 전 봉인.

SAP 안전 규칙(실데이터 게이트·tier·에스코트)은 모드와 독립인 Policy다 — 어느
축에서도 적용된다(§ SAFETY-PROFILES). 싱글톤 GOAL.md/STATE.md는 legacy —
새 작업은 만들지 않는다(§ legacy catalog).

CONSULT(RULES.md 매칭 하드 제약)는 모드 무관 유지 — SAP write·씨앗 작업 전 필수.
```

정확한 문안은 단계 4에서 상류 AGENTS-snippet·harness-loop 관례와 정합 확인 후 확정.

## 4. RV4 기계 경계 설계 (안전 — 확정)

**사실(analysis §3)**: authority-gate.py는 vsp를 어느 분류(deploy/network/external
write)에도 인식하지 않는다 → `permissions.deploy=false`여도 `vsp deploy`는 실행 전
deny되지 않는다. config로 추가 불가(분류 목록이 소스 지역 literal). 리뷰 세션은
Bash를 의도적으로 허용(빌드 명령용)하므로 자격증명이 있으면 vsp deploy 실행 가능.

**설계 = 자격증명 스코핑 (기존 DESIGN §8.4의 v0.19 강화)**, 층위:

1. **worker/review/Guided/Direct 세션은 credential-free** — SAP 프로파일은 **에스코트
   step(사람·부모)에서만** 로드(`vsp-env.ps1`). 4a/4b 실증 관행 그대로. 이것이 1차·
   주 경계다(attended에서 견고).
2. **manifest.secrets에 SAP 자격증명 이름을 넣지 않는다** — v0.19 신형 CLI worker는
   `PASSWORD|SECRET|TOKEN|...` env를 manifest.secrets에 없으면 필터링(analysis §3.6-1).
   부모 verify는 무필터 os.environ. → 부모 에스코트만 자격증명 보유(방어심도 2차).
3. **주의(방어심도의 한계)**: `vsp-env.ps1`은 Windows Credential Manager에서 비번을
   해석한다 — 자식이 스스로 vsp-env.ps1을 실행하면 env 필터를 우회 가능. 따라서 env
   필터만으로는 불완전. **truly-unattended 경로는 배포-불능 SAP principal 실증 전까지
   봉인**(D-024). attended에서는 1(프로파일 미로드)이 주 경계라 실효.
4. **Bridge worker는 SAP write 금지** — MCP-0 보증 대상 아님(analysis F1) + 상류가
   write MCP 연결 세션의 worker 사용 금지 명시.
5. **선택(belt-and-suspenders)**: upstream `_deploy` map에 `vsp`/`vsp.exe` 추가 패치
   (authority-gate.py:306-328). 하면 `deploy=false`에서 기계 deny 성립. 단 소스 패치 =
   engine/ 편입 아닌 vsp 계약과 무관한 상류 기여라 별건. 1~4로 attended 경계가 서면
   필수는 아님 — 재론 트리거로 보류.

**기록 규율**: RV4는 "닫힘"으로 적지 않는다. "attended에서 자격증명 스코핑으로 실효
차단, unattended는 봉인"으로 정직 기록(SAFETY-PROFILES §⑥·§⑦ 개정).

## 5. Legacy catalog 설계

**사실(analysis §2.5·§2.7)**: install_engine.py는 GOAL.md/STATE.md를 건드리지 않고,
RULES/LESSONS/PROTOCOL는 없을 때만 복사. 기존 phases/는 byte 불변(예제만 없으면 생성).
따라서 마이그레이션은 자동 삭제 없음 — **명시적 봉인 목록**을 우리가 만든다.

`docs/reference/LEGACY-CATALOG.md`(신설) 내용:
- **싱글톤 GOAL.md/STATE.md**: legacy 데이터로 보존. 새 Guided/Engine 작업은 미생성
  (run별 계약 사용). 재개점·attempts 이력은 참조용 보존, 신규 기입 금지.
- **phases/ 현황**(top index 불일치 정정 포함 — analysis가 지적한 3b completed인데
  index pending 등): 각 phase를 [완료 / 씨앗봉인(feat 브랜치 미병합) / 예제 / 재실행
  금지]로 분류. 씨앗 phase(3a·4a)는 브랜치 봉인 = 재실행 금지 명시.
- **기본 비활성**: legacy phase(run_id 없음)는 v0.19에서 구 의미로 실행 가능하나
  (analysis N2 — authority context 없어 gate 통과), 신규 실행 대상 아님을 명시.
- 신형 계약 phase만 권한 봉투 강제 대상.

## 6. F-불변식 재정의 + 문서 연쇄 변경

**F-불변식 재정의**(analysis 산출물 1 요약 — DESIGN §15-F 교체):
- F1: 엔진은 headless claude/codex의 **MCP만** 차단, Bridge 제외. 엔진에 vsp/ABAP
  식별자 0개 → **엔진은 vsp를 모름**(MCP 차단 ≠ vsp 차단). vsp 경계는 §4가 담당.
- F2/F6/F7: router 경유로 변경. Direct/Guided 완전 no-op. tdd-guard ABAP 미발화(유지).
- F3: 감사선(30/12KB) vs Engine 경계(>40 WARN·>16KB 거부) 분리.
- F4/F5: 유지. vsp는 F5 감사 범위 밖.
- **N1~N7 신규**(트랙 A가 새로 의존): 계약 SHA 동결·재검사 / 권한 봉투(**신형 run만**) /
  frozen env JSON / bridge lease fail-closed / 실제-delta 재매칭+원복 / unattended=
  container/VM / **N7: 엔진 review는 비게이트 → check-review-verdict.ps1 유지 필수**.

**문서 연쇄 변경 목록**(단계 4 — analysis가 범위 확장 지적):
| 문서 | 변경 |
|---|---|
| `AGENTS.md` | §3 라우팅으로 재작성 (루프 강제 → 3축) |
| `CLAUDE.md` | 트랙 A "무인 하네스(미착수)" → "v0.19 3축, Engine attended" 정정 |
| `DESIGN.md` | §2 역할분리·§3 백엔드(불변 재확인)·§5 F-불변식(§6 재정의)·§8 실행모드(3축 + §8.4 RV4 강화)·§13 Phase 5(재기준이 흡수)·§15-F·§16 부트스트랩 |
| `docs/PRD.md`·`docs/ARCHITECTURE.md` | Engine 중심 소비구조·낡은 phase 상태 갱신 |
| `adapters/vsp/SAFETY-PROFILES.md` | §⑥·§⑦에 RV4 정직 기록·모드독립 Policy 명시 |
| `docs/reference/LEGACY-CATALOG.md` | 신설 (§5) |

## 7. Pin 결정 + 파일럿·게이트

**Pin**: **후보 = 929685a(v0.19.2)** — 단계 1 분석이 이 blob 기준. 상류는 이미
v0.19.3(fd86ba0)으로 이동했고 v0.19.3은 retired 파일 삭제 로직을 추가(0.19.2엔 없음).
**최종 lock은 파일럿+게이트 통과 후**, 그 시점 최신과 재대조(D-024). 지금은 후보 pin —
929685a를 moving master 아닌 정확 SHA로 고정.

**파일럿 2건 + 기술 게이트**(단계 5 = 완료 기준):
- 파일럿 A (Guided): 실 SAP 작업 1건 — contract→구현→새-컨텍스트 리뷰→에스코트.
- 파일럿 B (Engine attended): 신형 계약 phase 1건 — 권한 봉투 하 4b급 재현.
- 기술 게이트: ① Direct 무개입(diff 0) ② 계약/manifest 변조 시 Engine 중단
  ③ 범위밖 파일 차단 ④ **deploy=false에서 vsp deploy 음성시험**(현 v0.19.2에선 통과
  =미차단 예상 → §4 자격증명 스코핑이 실효 경계임을 확인, upstream 패치는 선택)
  ⑤ 트랙 B MCP 훅 3개 smoke(마이그레이션 후 동작).
- 이 게이트+파일럿 통과 후에만 `verified_commit`·"신판 Phase 5 완료" 선언.

## 8. 열린 항목 / 리스크

- **R1**: v0.19.2 vs 0.19.3 pin 선택 — 후보는 0.19.2(분석 완료), 최종 lock 시 재대조.
  0.19.3 retired 삭제는 우리 test_execute.py·test_hooks.py를 지움 → 어느 쪽이든 그
  테스트의 실행 위치를 상류 pinned checkout으로 재유도 필요(analysis §2.3).
- **R2**: 상류가 계속 이동 중(당일 0.19.0→.3) — 후보 pin 고정 없이 진행하면 표적 이동
  재연. 단계 1에서 정확 SHA 고정 필수.
- **R3**: settings.json 재직렬화(analysis §2.4) — 트랙 B 훅 값 보존 확인됨(node,
  비충돌)이나 바이트는 아님. 복제본 마이그레이션에서 3개 훅 matcher·command 문자열
  불변 실측(단계 3 합격 기준).
- **R4**: 자격증명 스코핑의 Credential Manager 우회(§4-3) — attended 경계로 실효,
  unattended 봉인으로 대응. 완전 봉합은 배포-불능 SAP principal(향후).
