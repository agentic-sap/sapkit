# PLANNING — 3-review-gate (Phase 3 선결: 리뷰 게이트 구현)

> 스펙 정본: `docs/reference/designs/2026-07-17-phase3-review-gate.md` (D-021,
> Codex B15 반영 v2 — 이하 "스펙"). 이 phase는 게이트 도구 일식을 구현하고
> 라이브 스파이크 2건으로 핵심 가정을 실증한다. **SAP write 0** — 무인 write
> 금지(HANDOFF 5-11)는 이 phase 내내 유효하다.

## 1. 계획 결정 (근거 포함)

1. **런타임 = Node 24 내장만** (`node:test`, `node:crypto`, `node:child_process`).
   의존성 설치 0. 근거: 레포 도구 관례(interactive/scripts/*.mjs), JSON 스키마
   소비, 프로세스 스폰·클린 env 제어가 표준 라이브러리로 충분.
2. **스키마 검증 = 자체 최소 검증기** (required/타입/enum 수준, 사용 필드만).
   외부 ajv 등 설치 금지 — 의존성 0 원칙. 트랙 B 스키마 JSON은 이식(복사)해
   두고 그 required/enum 정의를 소비한다.
3. **mock-first**: 스텝 0~4는 전부 offline(mock 리뷰어·mock 배포 명령).
   라이브(실 리뷰어 스폰·실 vsp)는 스텝 5 스파이크만.
4. **엔진 형식 = lock v0.17.3 실물 준수**: `phases/<dir>/index.json`
   (step/name/status/verify) + stepN.md. 공사 중인 상류 스킬 문서의
   `.harness/runs/` manifest 구조는 이 엔진(scripts/execute.py)에 존재하지
   않음을 grep으로 확인 — 미적용.

## 2. 권한 봉투 (이 run의 계약)

| 항목 | 값 |
|---|---|
| supervision / driver | attended / **bridge** (이 머신, 관찰 하) |
| 쓰기 허용 | `scripts/review-gate/**` · `phases/3-review-gate/**` 만 |
| 무접촉 | `src/**` · `engine/**` · `interactive/**` · `.harness/**` · 엔진 파일 |
| SAP | read-only 조회만. write성 시도는 스텝 5의 **거부 기대 1회**뿐(§스텝 5의 비상 절차 참조) |
| 네트워크 | claude CLI(리뷰어 스폰) · vsp(SAP) 만. 패키지 설치 금지 |
| git | 커밋 = 엔진 규율(스텝 child는 커밋 금지), push 금지 |
| 사후 리뷰 | advisory 리뷰 opus급 (관례) |
| RULES 대조 | R-002(vsp CLI 전용) · R-003(비-dev write 금지) · R-005(자격증명 로그·커밋 금지) |

## 3. 공유 계약 — 모든 스텝이 따른다 (스텝 간 인터페이스 정본)

### 3.1 exit code 체계 (스펙 §4.3 오류 6분류의 기계 표현)

| exit | 의미 |
|---|---|
| 0 | PASS (게이트) / 배포 수행 (배포 래퍼) |
| 1 | FAIL — MAJOR 이상 발견 ≥1, 또는 배포 래퍼의 바인딩 불일치(NO_PASS_RECORD / CAPSULE_TAMPERED / WORKTREE_DRIFT) |
| 2 | MALFORMED — 스키마 위반·빈 출력·파싱 오류·verdict/발견 목록 불일치·미지 심각도 |
| 3 | INSUFFICIENT_CONTEXT — 리뷰어의 컨텍스트 부족 선언 |
| 4 | TIMEOUT — 리뷰어 시간 초과 |
| 5 | INFRA_ERROR — 스폰 실패·CLI 오류 등 인프라 |
| 6 | INTERNAL_ERROR — catch-all (래퍼 예외·해시 실패·상태 파일 손상 등) |
| 7 | BLOCKED — 수정 revision 한도 도달(이후 호출도 즉시 7) |

전부 비0 = write 차단 (fail-closed). 인프라 계열(4·5·6)은 revision 불산입.

### 3.2 파일 배치 (`scripts/review-gate/`)

```
scripts/review-gate/
├── config.json          # 설정값 (3.3)
├── capsule.mjs          # 캡슐 생성·검증 (스텝 0)
├── verdict.mjs          # 스키마 검증 + 결정적 판정 (스텝 1)
├── state.mjs            # 캐시·revision·PASS 레코드·BLOCKED (스텝 2)
├── reviewer.mjs         # 리뷰어 스폰 — 클린 env (스텝 3)
├── review-gate.mjs      # 게이트 메인 CLI (스텝 3)
├── deploy-gate.mjs      # 배포 래퍼 CLI (스텝 4)
├── schemas/             # 트랙 B review-request/result 이식본 (스텝 1)
└── tests/               # node:test 테스트 + mocks/ + spike.mjs
```

### 3.3 config.json 형태 (초기값 — 스텝 5가 실측으로 reviewer.command 확정)

```json
{
  "policy_version": "1.0",
  "schema_version": "trackB-review-result-v1",
  "reviewer": { "command": ["node", "tests/mocks/reviewer-pass.mjs"],
                "model": "opus", "timeout_ms": 600000 },
  "limits": { "revision_limit": 3, "infra_retry_limit": 2 },
  "env_allowlist": ["PATH", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE",
                    "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "COMSPEC"]
}
```

### 3.4 캡슐 manifest와 캡슐 해시 (스펙 §4.0)

manifest.json = `{ unit_id, files: [{path, sha256}...], spec_path, spec_sha256,
verification_path|null, verification_sha256|null, policy_version,
schema_version, reviewer_model, target_system }`.
**캡슐 해시** = manifest의 canonical JSON(키 정렬·LF·UTF-8)의 sha256 소문자
hex. 파일 누락·빈 파일·읽기 실패 = INCOMPLETE 오류(캡슐 미생성).

### 3.5 상태 파일 (state.json — 호출자가 지정한 stateDir 소재, run-scoped)

`{ verdicts: { "<capsule_hash>": {classification, at} },
   fail_revisions: ["<hash>"...],  // 고유 FAIL 해시 순서 목록 — 길이가 revision 수
   infra_retries: 0, blocked: false,
   pass_records: { "<hash>": {verdict_file, model, policy_version,
                              schema_version, duration_ms, at} } }`
쓰기는 원자적(tmp 파일 + rename). 파싱 불능 손상 = INTERNAL_ERROR(6).

### 3.6 심각도 서열과 판정 (스펙 §4.1-5)

BLOCKER > MAJOR > MINOR > INFO. **판정은 발견 목록의 최고 심각도에서 래퍼가
결정적으로 계산** — MAJOR 이상 ≥1 = FAIL, 그 외 = PASS. 리뷰어의 상위 verdict
필드는 참고이며 계산 결과와 불일치 = MALFORMED. 미지 심각도 = MALFORMED.

## 4. 스텝 맵

| # | 이름 | 산출물 | verify |
|---|---|---|---|
| 0 | capsule | config.json·capsule.mjs·테스트 | `node --test scripts/review-gate/tests/capsule.test.mjs` |
| 1 | verdict | schemas/ 이식·verdict.mjs·테스트 | `node --test scripts/review-gate/tests/verdict.test.mjs` |
| 2 | state | state.mjs·테스트 | `node --test scripts/review-gate/tests/state.test.mjs` |
| 3 | gate-assembly | reviewer.mjs·review-gate.mjs·mocks·E2E | `node --test scripts/review-gate/tests/gate-e2e.test.mjs` |
| 4 | deploy-gate | deploy-gate.mjs·테스트 | `node --test scripts/review-gate/tests/deploy-gate.test.mjs` |
| 5 | live-spike | 실 리뷰어 왕복 + vsp 거부 실측 + 증거 | `node scripts/review-gate/tests/spike.mjs --check phases/3-review-gate/spike-evidence.json` |

스펙 AC 대응: AC-12→스텝 0, AC-1·2·3·11→스텝 1, AC-5·6·9·13→스텝 2,
AC-7(env)→스텝 3, AC-4→스텝 4, AC-10+가정 2·4→스텝 5. AC-8(실제 결함 차단
실증)은 이 phase 밖 — Phase 3 본 운용에서 충족.
