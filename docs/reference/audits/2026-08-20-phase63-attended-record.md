# 판6.3 실행 기록 — attended 실기 46종 + 꼬리 기준 인하 집행

> **기록이지 권위가 아니다.** 판단의 정본은 `docs/RUN-PLAN.md`(판 큐·브리프) ·
> `docs/reference/DECISIONS.md`(결정) · `sapkit-engine/TOOL-LEDGER.md`(대장 · 기계 생성물)다.
> 이 문서는 그 판단들이 **무엇을 실측하고 나왔는지**를 남긴다.
>
> 접속 정보(호스트·자격증명)는 여기 적지 않는다 — 레포는 PUBLIC이다.

---

## T1 — 착수 기준선 (2026-08-20 · 오프라인 + P1)

### 원격 대조

`git fetch` 후 `main..origin/main` **0건** · `origin/main..main` **0건** — 병렬 줄기 없음.
착수 커밋 `89e8c17`. 작업 가지 `dryforge/phase63-attended`.

### 게이트 네 묶음 + doctor

| 묶음 | 결과 |
|---|---|
| 제품 게이트 9종 | **9/9 exit 0** |
| 제품 음성시험 9종 | **9/9 exit 0** |
| `sapkit-engine` 전종 | **전종 exit 0** — `verify`(jest 4161 pass / 1 skip · 242 suite) · `gates` · `test-gates`(44건) · `stdio-smoke` · `bundle-smoke`(1.0.0 스탬프 일치 · 단일 파일 3.64MiB) · `keyring-fallback-smoke`(12건) · `test-refusal-vocab`(8건) · `render-ledger --check` · `build-plan --check` |
| `sapkit-cli` 전종 | **전종 exit 0** — `verify`(jest 355 pass · 12 suite) · `gates`(코퍼스 47파일 × 표면 3종 · 갈림 0) · `test-corpus-gate`(14건) · `test-compare-baseline`(21건) |
| `doctor` | **exit 1 — FAIL 1 · WARN 4 · SKIP 2 · OK 7** |

**doctor FAIL은 이 판이 만든 것이 아니다** — 착수 시점에 이미 나 있던 **로컬 설치 상태**다:
`Antigravity 호환성 — 설치 1.1.1 ≠ 고정 1.1.4`. doctor는 레포가 아니라 이 머신의 설치본을
읽는다(`doctor.mjs`는 CLAUDE.md 게이트 절에서 「로컬 전용」으로 표시된 유일한 항목).
WARN 4종도 같은 성질이다 — Codex pre-conformance · Claude 설치본 v0.7.0/v0.5.4 ≠ 레포 v0.8.0 ·
Codex legacy 전역 `sap` 그림자. **마감 실측에서 같은 상태면 「차이 없음」이고, 달라지면 그것을 적는다.**

### 대장 착수 수치

```
도구 186 · 안 지음 0 · 증거 대기 126 · 증거 있음 60
요구 급  replay 96 · attended 48 · contract 42     (harness/build-plan.json 실측)
```

### KR-DEV 접속 확인 (P1)

- 프로파일 `~/.sapkit/profiles/KR-DEV/sap.env` **존재** · `SAP_TIER=DEV` **실측 확인**
  (하드게이트 1 — P3 write의 전제).
- `GetSystemInfo` 1회 → `system_id=DEV` · `client=700` · `language=KO` ·
  `adt_stack_type=modern` · 접속 사용자 확인됨.
  같은 머신의 다른 프로파일(`IDEA-JNC`)은 `client=100`이므로 **client로 갈린다** — 지금 붙은
  자리가 KR-DEV다.

### 보호 자산 8종 — 1차 조회 (P1 · 마스크 3종)

`ZSAPKIT*` **6건** · `ZCL_SAPKIT*` **1건** · `Z_SAPKIT*` **1건** = **8건**. spec §3.4 명부와 **완전 일치**.

| 이름 | 타입 | 패키지 |
|---|---|---|
| ZSAPKIT_M1_DEMO | PROG/P | `$TMP` |
| ZSAPKIT_M1_FG | FUGR/F | `$TMP` |
| ZSAPKIT_M1_INC01 | PROG/I | `$TMP` |
| ZSAPKIT_M1_INCMAIN | PROG/P | `$TMP` |
| ZSAPKIT_M1_STR | TABL/DS | `$TMP` |
| ZSAPKIT_M1_TAB | TABL/DT | `$TMP` |
| ZCL_SAPKIT_M1_DEMO | CLAS/OC | `$TMP` |
| Z_SAPKIT_M1_FM | FUGR/FF | `$TMP` |

**연습 이름(`*_63*`) 잔재 0건** — 세 마스크 결과에 `_63`이 들어간 이름이 하나도 없다.
이것이 T7 중간 조회·T10 정리 후 조회가 대조할 **기준선**이다.

### P2 계수

**0건.** `GetTableContents`·`GetSqlQuery` 미사용 — 이 시점까지 호출 0회.
