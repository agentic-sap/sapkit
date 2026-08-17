# sapkit-engine — 자체 저작 ABAP MCP 엔진 (M1)

`interactive/server/server.bundle.cjs`의 소스인 `engine/` 포크를 대체할 **완전 자체
저작 엔진**. 이 디렉터리는 청사진 사다리 ⑴의 1차 마일스톤(M1) 산출물이며, **제품
교체(swap)는 M1 범위 밖**이다 — 제품은 계속 구 번들로 동작한다.

## 협상 불가 제약

1. **참조-재저작** — `engine/` 소스, `@babamba2/*` 8종, 구 엔진 jest 시험은 **읽기
   전용 참고서**다. 동작·계약을 이해하려 읽는 것은 허용, **복사·붙여넣기 금지**.
   목적은 `engine/LICENSE` 계보 고지의 깔끔한 은퇴다(법적 의무가 아니라 소유권 선택).
2. **구 부품 무접촉** — `engine/`·`interactive/server/`·기존 게이트·CI 기존 잡을
   수정하지 않는다. 기존 제품 게이트 전종 green 유지가 그 기계 증명이다.
3. **도구 이름·인자·응답 형태 불변** — 개명·"개선" 금지. 정본은
   `interactive/server/tool-catalog/`(이름)과 `engine/src/handlers/`(계약 실체).
4. **안전 바닥선 승계** — tier 게이트·테이블 블록리스트·실데이터 2종 상시 게이트를
   동일 계약으로 구현하고 **음성시험**(정말 거부하는지)으로 증명한다.
5. **픽스처 안전** — 커밋되는 모든 픽스처는 자격증명·호스트·접속정보·실데이터 0.

## 디렉터리 계약 (작업이 임의로 바꾸지 않는다)

| 경로 | 내용 |
|---|---|
| `src/adt/` | 자체 저작 ADT 클라이언트 — 접속·인증·세션·CSRF·잠금 수명주기 |
| `src/auth/` | UAA(XSUAA) 토큰 취득과 그 수명 — OAuth2 3방식·loopback 콜백·무상태 캐시. **SAP에는 말을 걸지 않는다**(인가 서버 전용) |
| `src/profile/` | `~/.sapkit` 홈 해석, `sap.env`/`active-profile.txt`, `MCP_ENV_PATH` |
| `src/safety/` | 노출 제어(`--exposition`)·tier 게이트·테이블 블록리스트·실데이터 게이트 |
| `src/server/` | MCP 프로토콜 계층 + stdio 전송 + 도구 등록 프레임 |
| `src/rfc/` | RFC 백엔드 분배층 (5경로 확장 가능, M1은 실사용 통로 1개) |
| `src/tools/read/` | 읽기·검색·반영확인 도구 |
| `src/tools/write/` | 쓰기·활성 도구 |
| `src/tools/rfc-read/` | RFC 경유 읽기 도구 |
| `src/tools/row-data/` | 실데이터 도구 (상시 게이트 결합) |
| `src/tools/registry.ts` | **유일한 도구 등록점.** 도구를 지으면 **그 커밋에서 바로** 배선한다 |
| `harness/recorder/` | 구 번들 채록기 + 정규화·마스킹 필터 |
| `harness/replay/` | 재생 대조 러너 + 의도적 차이 목록 + 커버리지 표 |
| `harness/ledger/` | 진척 대장 계산기 (`TOOL-LEDGER.md` 생성 + `--check` 대조) |
| `gates/` | 신 엔진 자체 적합성 게이트 (`.mjs`) |
| `fixtures/` | 녹화 픽스처 (attended C1 산출물) |
| `evidence/` | 커밋되는 증거 파일 — 재생 판정 · 계약 시험 결과 (형식은 그 README) |
| `TOOL-LEDGER.md` | **생성물.** 손으로 고치지 말 것 — `npm run ledger`로 다시 만든다 |
| `ADDING-A-TOOL.md` | **도구 하나 짓는 절차서.** 남은 167종은 이 순서로 짓는다 |

## 명령

```bash
npm run typecheck   # tsc --noEmit (시험 포함)
npm test            # jest
npm run build       # dist/ 로 CJS 산출
npm run gates       # 신 엔진 자체 게이트 일괄 (표면 · 안전 · 대장)
npm run ledger      # TOOL-LEDGER.md 재생성 (SAP 불필요)
```

**도구를 하나 지으려면 `ADDING-A-TOOL.md`를 따른다** — 참조 원본을 어디까지 읽고,
선언을 무엇에 맞추고, 시험을 어떤 이름으로 쓰고, 등록·대장·커밋을 어떤 순서로
하는지가 거기에 번호로 적혀 있다.

**PowerShell로 실행할 것** — 이 머신에서 Bash로 돌리면 자식 프로세스 수거에서
블록되는 사례가 실측됐다(`HANDOFF.md`).

## M1 범위 밖

제품 교체·`interactive/server/` 배선, HTTP/SSE 전송, 잔여 RFC 4경로, 잔여 도구
167종, 고지 은퇴, npm/레지스트리 발행, 기존 게이트 이관.
