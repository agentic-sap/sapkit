# Fable 5 구현 코드리뷰 대응 기록 (2026-07-10)

리뷰: L0~L5 산출물 전체 (지적 26건 — 치명 2·높음 7·중간 9·낮음 8). 대응 커밋 6개
(review-fix 1/6~6/6, 71530e9→d7f7850).

## 반영 완료 (즉시 수정 필수 9건 전부)

| # | 지적 | 대응 | 실증 |
|---|---|---|---|
| 1 | [치명] block-forbidden-tables가 lite에서 fail-open | EXCEPTIONS_DIR → core/policies/data-protection, 정책문서 파싱 제외 | PA0008(급여) deny / T001 pass 기능 테스트 |
| 2 | [치명] install-hooks 경로 전멸 | sc4sap-lite 마켓플레이스 후보 + fallback 교정 + `--project <path>` 인자 | node --check |
| +α | (리뷰 미발견) 훅 lib 임포트 파손 | hooks/lib → adapters/claude/lib 이동 | 기능 테스트로 발견·해소 |
| 3 | [높음] 승인 키워드 3원 모순 | 스키마 enum을 정본으로 통일(승인/approve/approved/ok/proceed/go ahead/confirmed), 정책 문구 정정 | grep 대조 |
| 4 | [높음] verify-engine 경로 FAIL | engine/→server/ 교정 | 실행 OK (4.13.0 해시 일치) |
| 5 | [높음] LICENSE 부재 | 업스트림 고지 승계 LICENSE + THIRD_PARTY_NOTICES.md | — |
| 6 | [높음] 페르소나 배선 잔재 | transform-personas 전면 개정(모델·디스패치·phase banner·bare 파일명·capability 정규식) + 26종 재생성 | 잔재 grep 0 + 링크 0 |
| 7 | [높음] 카탈로그-live 불일치 (155 vs 168) | gen-permissions를 live tools/list 기반으로 전환(153 허용), tool-catalog에 스테일 경고 README | 실행 로그 |
| 8 | [중간] verification-policy ↔ schema 불일치 | 기록 절을 스키마 실물에 정렬, "schema pending" 2곳 삭제 | grep 0 |
| 9 | [중간] 매니페스트 미이행·L2 기준 미반영 | deferred(L6+) 상태 6행 갱신, DESIGN L2 각주·상태 헤더·README 현행화 | 커버리지 PASS |

추가 반영: core 전체 `/sc4sap:*` 참조 0화(6-2), project-context 3곳 정정(6-4),
절차 표제 통일(1-5), 훅 메시지 lite 경로화(3-4).

## 의도적 보류 (사유 명시)

- **4-3 / 카탈로그 재생성**: 연결 상태 tools/list 실측이 선행 — L3 E2E에 편입 (tool-catalog/README.md에 판정 절차 명시).
- **2-3 링크체커 앵커 검증 / 2-4 커버리지 목적지 존재 검사 / 2-5 스모크 exposition 인자**: [낮음] 개선 — L6 도구 정비에서.
- **3-5 Codex/agy 등록이 개발 레포 절대경로**: [낮음] 수용 — 로컬 단일 사용자 전제, 배포 시 재검토.

## 게이트 최종 상태

커버리지 미분류 0 · 링크 474개 0 깨짐 · 안전훅 기능 테스트 통과 · verify-engine OK ·
페르소나 잔재 grep 0 · "schema pending" 0 · `/sc4sap:` 참조 0.
