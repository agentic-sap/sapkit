# sapkit-engine — 자체 저작 ABAP MCP 엔진 (제품)

`interactive/server/server.bundle.cjs`의 소스. 2026-08-19 **판7-b에서 `engine/` 포크
번들을 대체했다**(D-095) — 제품이 지금 돌리는 엔진이 여기다. 청사진 사다리 ⑴의 교체
관문(BLUEPRINT §3.2 「검증 기준」 1~4)을 통과한 뒤의 상태다.

`engine/`은 **되돌릴 자리**로 레포에 남아 있다(검증 기준 5 — 은퇴는 판7.5). 그러므로
"구 엔진"을 고쳐야 할 이유는 롤백 말고는 없다.

## 협상 불가 제약

1. **참조-재저작** — `engine/` 소스, `@babamba2/*` 8종, 구 엔진 jest 시험은 **읽기
   전용 참고서**다. 동작·계약을 이해하려 읽는 것은 허용, **복사·붙여넣기 금지**.
   목적은 `engine/LICENSE` 계보 고지의 깔끔한 은퇴다(법적 의무가 아니라 소유권 선택).
2. **`engine/` 무접촉** — 구 엔진 소스는 롤백 자산이므로 고치지 않는다.
   ⚠ 이 조항은 원래 `interactive/server/`·기존 게이트·CI 기존 잡까지 덮었고, 그때의
   목적은 **병행 제작 기간에 구 부품을 흔들리지 않는 대조군으로 두는 것**이었다.
   판7-b의 교체가 그 기간을 끝냈다 — 이제 `interactive/server/`는 이 엔진의 산출물을
   싣는 자리이고, 제품 게이트는 이 엔진을 겨눈다. **남은 무접촉 대상은 `engine/` 뿐이다.**
3. **도구 이름·인자·응답 형태 불변** — 개명·"개선" 금지. 정본은
   `interactive/server/tool-catalog/`(이름)과 `harness/old-surface/m1-tools.json`
   (기계 판독 채록본). `engine/src/handlers/`는 계약 실체의 **참고서**로 남는다 —
   교체 뒤에는 그것을 다시 뜰 수 없으므로 채록본이 유일한 기계 정본이다.
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
| `tools/bundle.mjs` | **번들러.** `dist/server.bundle.cjs` 단일 파일 산출 — 제품에 실리는 것이 이것이다 |
| `TOOL-LEDGER.md` | **생성물.** 손으로 고치지 말 것 — `npm run ledger`로 다시 만든다 |
| `ADDING-A-TOOL.md` | **도구 하나 짓는 절차서.** 증거 대기분은 이 순서로 채운다 |

## 명령

```bash
npm run typecheck    # tsc --noEmit (시험 포함)
npm test             # jest
npm run build        # dist/ 로 CJS 산출 (tsc)
npm run bundle       # dist/server.bundle.cjs 단일 파일 (esbuild)
npm run build:bundle # build && bundle — 소스를 고쳤으면 반드시 이쪽
npm run verify       # build:bundle && typecheck && test
npm run gates        # 자체 게이트 일괄 (표면 · 안전 · 대장 · HTTP/SSE 기동)
npm run ledger       # TOOL-LEDGER.md 재생성 (SAP 불필요)
```

⚠ **`npm run bundle` 단독은 소스 변경을 반영하지 않는다.** 번들 엔트리가
`dist/src/server/entry.js` = tsc 산출물이기 때문이다. 구 엔진이 2026-08-02에 이
함정으로 수리 빠진 번들을 냈고 jest는 소스를 보므로 초록이었다 — 반영 확인의
가장 싼 방법은 `grep -c <신규 식별자> dist/server.bundle.cjs`다.

제품 번들 갱신(번들 → `interactive/server/`)의 절차 정본은
[`../interactive/server/UPDATE-RUNBOOK.md`](../interactive/server/UPDATE-RUNBOOK.md)다.

**도구를 하나 지으려면 `ADDING-A-TOOL.md`를 따른다** — 참조 원본을 어디까지 읽고,
선언을 무엇에 맞추고, 시험을 어떤 이름으로 쓰고, 등록·대장·커밋을 어떤 순서로
하는지가 거기에 번호로 적혀 있다.

**PowerShell로 실행할 것** — 이 머신에서 Bash로 돌리면 자식 프로세스 수거에서
블록되는 사례가 실측됐다(`HANDOFF.md`).

## 아직 남은 것

- **SAP 증거** — 대장(`TOOL-LEDGER.md`)의 `증거 대기` 칸. 교체의 관문은 검증 기준
  1~4였지 대장 소진이 아니다(D-093 ⓐ) — 그 칸은 교체 뒤에도 실사용으로 줄어든다.
- **`engine/` 은퇴 + `engine/LICENSE` 고지 은퇴** — 판7.5. 교체가 실사용에서
  안정됐다는 판단이 전제다.
- **npm/레지스트리 발행** — 하지 않는다(D-095). 제품은 단일 파일 번들로 동봉되므로
  설치가 완전 오프라인이고, 레지스트리를 끼우면 그 성질이 깨진다. `private: true`.
