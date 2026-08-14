# 의도적 차이 장부 (divergence ledger)

신 엔진이 구 엔진과 **일부러 다르게** 동작하는 지점의 유일한 등재부다. spec §2.4:

> **의도적 차이 목록(divergence allowlist)**: 기본 공집합. 등재 항목만 동등성
> 비교에서 제외되며, **각 항목은 근거 문서 + 대체 기대 시험**(올바른 동작을
> 검증하는 시험)을 반드시 동반한다.

등재되지 않은 차이는 **결함**이다. 여기 없는데 재생 대조가 어긋나면 신 엔진을
고친다. 재생 러너의 allowlist 기제는 이 문서를 기계가 읽는 형태로 옮긴 것이며,
**이 문서가 사람용 정본**이다.

## 등재 규칙

1. **근거 문서** — 왜 다른지, 어디서 실측했는지(파일·줄).
2. **대체 기대 시험** — 다르게 동작하는 쪽이 *옳다*는 것을 증명하는 시험 경로.
   비교에서 빼는 것이 곧 무증거가 되지 않게 하는 조건이다.
3. **분류** — `수리`(구 엔진의 오답·거짓 성공을 고침) / `강화`(안전 바닥선을
   올림) / `축소`(구 기능을 M1에서 아직 안 지음 — 후속 마일스톤에서 해소).
4. `축소` 항목은 **해소 마일스톤을 명시**한다. 영구 차이가 아니다.

## M1 사전 등재 (spec §2.4 — 착수 시점에 이미 정해진 3건)

| # | 도구 | 구 엔진 결함 | 분류 | M1 활성 |
|---|---|---|---|---|
| D1 | `GetSqlQuery` | 13-9 — wide-SELECT에서 WHERE 절이 통째로 무시됨 | 수리 | **활성** |
| D2 | `UpdateLocalTypes` | 13-11 — `activate_on_update:true`에서 거짓 성공 | 수리 | 휴면(도구 M1 밖) |
| D3 | `GetIncludesList` | 13-13 — `INCLUDE … IF FOUND`의 비실재 객체명 반환 | 수리 | 휴면(도구 M1 밖) |

근거: `HANDOFF.md` §6 항목 13의 하위 13-9·13-11·13-13 · 결정 기록 D-079 ⑤.
대체 기대 시험: D1 = WHERE가 결과에 실제 반영됨을 검증하는 시험(실데이터 도구
작업이 소유). D2·D3는 해당 도구를 짓는 마일스톤에서 활성화한다.

## 제작 중 발견분

### D4 — TLS 인증서 검증이 기본으로 **켜진다** (구: 꺼짐)
- **분류**: 강화
- **구 동작(실측)**: `engine/node_modules/@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:553-555` —
  `rejectUnauthorized`는 `NODE_TLS_REJECT_UNAUTHORIZED === '1'`(또는
  `TLS_REJECT_UNAUTHORIZED === '1'` 이면서 `NODE_…!== '0'`)일 때만 참이다. 즉
  **아무것도 설정하지 않으면 검증이 꺼진 채**로 동작한다. `engine/.env.example`은
  `TLS_REJECT_UNAUTHORIZED=0`을 "자기서명 허용" 스위치로 설명하지만, 실제로는
  0이든 없든 결과가 같아 **문서가 말하는 대로 동작하지 않는다**.
- **신 동작**: `TLS_REJECT_UNAUTHORIZED=0`일 때만 검증을 끈다. 없으면 켠다.
- **근거**: 문서화된 스위치가 실제로는 아무 일도 하지 않는 것은 "거짓 성공" 계열
  이며(spec §2.4의 분류 기준), 조용히 검증을 끄는 기본값은 안전 바닥선을 낮춘다
  (spec §2.3 — 자작은 바닥선을 낮추는 근거가 되지 않는다).
- **대체 기대 시험**: 프로파일 계층 — `TLS_REJECT_UNAUTHORIZED` 미설정/`1`/`0`
  각각이 `rejectUnauthorized`를 참/참/거짓으로 만드는지.
- **운영 주의**: 자기서명 인증서를 쓰는 DEV 시스템은 프로파일에
  `TLS_REJECT_UNAUTHORIZED=0`이 **필요**하다. 접속 계층은 인증서 오류를 이 한
  줄을 지목하는 문구로 정규화한다.

### D5 — `--exposition` 값이 전부 알 수 없는 토큰이면 **표면을 열지 않는다** (구: 기본값으로 폴백)
- **분류**: 강화
- **구 동작(실측)**: `engine/src/lib/config/ServerConfigManager.ts:166-177`·`:113` —
  토큰을 `readonly|high|low|compact`로 거른 뒤 **전부 걸러지면 기본값
  `readonly,high`로 폴백**한다. 즉 `--exposition=bogus` 같은 오타 하나가 write를
  포함한 155종 표면을 연다(fail-open).
- **신 동작**: 걸러진 토큰만으로 표면을 구성하고, 무엇이 왜 걸러졌는지 진단을
  올린다. 열리지 않는다(fail-closed). 진단은 stderr에 직접 쓰지 않고 반환값으로
  올라간다.
- **근거**: 오타가 write 표면을 여는 것은 안전 바닥선에 반한다(spec §2.3).
- **대체 기대 시험**: 안전 계층 — 알 수 없는 토큰만 준 경우 표면이 열리지 않고
  진단이 나오는지 / 정상 토큰은 그대로 동작하는지.
- **같은 파서의 부수 차이 2건**(함께 등재):
  - 구는 요청 토큰을 `readonly|high|low|compact` 넷으로만 거른다. 신은
    `system`·`search`도 요청 토큰으로 받는다. 셰임은 `readonly` 또는
    `readonly,high`만 넘기므로 실사용 경로에서는 발동하지 않는다.
  - 구는 쉼표로만 쪼갠다. 신은 공백으로도 쪼갠다(`--exposition="readonly high"`가
    구에서는 전부 걸러져 폴백, 신에서는 두 집합으로 해석된다).

### D6 — blocklist 노브가 **서버 프로세스 env로도 전달된다** (구: 프로파일 파일만)
- **분류**: 수리
- **구 동작(실측)**: `interactive/scripts/conformance-server-gates.mjs:53-59` (GAP-2) —
  기동 시 `MCP_BLOCKLIST_PROFILE`·`MCP_BLOCKLIST_EXTEND`·`MCP_ALLOW_TABLE`를
  `process.env`에서 지운 뒤 프로파일 파일의 값만 채운다. MCP 서버 정의(`.mcp.json`의
  `env`)나 셸 export로 준 값은 **조용히 무시된다**.
- **신 동작**: 두 통로를 모두 받고 **프로파일이 이긴다**.
- **근거**: 설정한 값이 조용히 무시되는 것은 거짓 성공 계열이다. 레포의 적합성
  러너 자신이 이 수리를 `want` 값으로 기록하고 "개선을 회귀로 취급하지 않는다"는
  판정 규칙을 두고 있다(같은 파일 37-41행).
- **대체 기대 시험**: 안전 계층 — 프로세스 env 통로가 실제로 먹는지 / 프로파일이
  주어지면 프로파일이 이기는지 / 배포 기본값은 여전히 잠긴 채인지.

### D7 — `SAP_SYSTEM_TYPE=legacy`를 독자 축으로 해석한다
- **분류**: 수리(스캐폴드 계약의 구멍을 메운 것 — 사실상 구 동작 복원)
- **경위**: 스캐폴드가 배포 축을 `onprem|cloud` 둘로 열어 `legacy`가 `cloud`로
  접혔다. 구 엔진은 `legacy`를 독자 값으로 계산하고(`engine/src/server/BaseMcpServer.ts:481-494`)
  핸들러 332개가 `available_in`에 그것을 선언한다 — 접으면 노출 이름 집합이
  어긋난다. `sapkit-engine/src/contracts.ts`를 고쳐 복원했다.
- **대체 기대 시험**: 프로파일·안전 계층 — `legacy` 프로파일에서 `legacy` 선언
  도구만 보이고 `['onprem','cloud']` 전용 도구는 숨는지.
- **비고**: 복원이므로 재생 대조에서 **제외 대상이 아니다**. 기록만 남긴다.

### D8 — 잔존 축소분 (M1에서 아직 안 지은 구 기능)
- **분류**: 축소 — **해소 마일스톤 = M2 이후, 늦어도 교체 판 이전**
- 접속 계층에서 M1이 승계하지 않은 구 계층의 복원 경로:
  - `406`/`415`에 대한 Accept/Content-Type 자동 재협상
  - `/sap/bc/adt/discovery` 외의 추가 폴백 경로 및 리다이렉트 추종
  - 구의 `skipSessionType`(BASIS 7.40 우회) 옵션
- **근거**: 셋 다 실사용 실측에서 발동 기록이 없고, 발동 조건이 특정 BASIS 판
  이나 비정상 협상에 묶여 있다. attended 녹화(C1)에서 발동이 관찰되면 그때
  승계한다.
- **대체 기대 시험**: 없음(축소). **C1 녹화에서 해당 상황이 관찰되는지**가
  판정 자리다. 관찰되면 이 항목은 결함으로 승격된다.
- **비고**: 쿠키 삭제 의미(구: 빈 값 쿠키를 맨이름으로 계속 전송 / 신: 삭제로
  처리)도 여기 둔다 — 신 쪽이 표준에 맞지만 와이어에서 관찰 가능한 차이다.

### D9 — RFC 통로 이름 `zrfc`를 유효한 값으로 인정한다
- **분류**: 수리
- **구 동작(실측)**: `engine/src/lib/rfcBackend.ts:34-48`의 선택기 분기·타입·오류
  문구에 `zrfc`가 **없다**. 그래서 `SAP_RFC_BACKEND=zrfc`는 "알 수 없는 값"으로
  거부된다. 그런데 `engine/src/lib/zrfcProxy.ts`는 완성된 구현이고,
  `ZRFC_SETUP.md`·`interactive/core/procedures/troubleshooting.md:165`·
  `engine/src/server/launcher.ts:96-97`이 모두 유효한 값이라고 말한다.
  **현행 배포 번들도 동일**(`interactive/server/server.bundle.cjs:112130`).
- **신 동작**: `zrfc`를 유효한 이름으로 인정하되 M1에서는 미구현이므로 **정직하게
  실패**한다(`backend-unsupported`). 문서가 약속한 통로에 코드가 닿지 않는 배선
  구멍을 메우는 방향이다.
- **근거**: 결정 기록 D-079 ② — RFC 백엔드 5경로 전량 승계. 구·신 모두 오류를
  내므로 실동작 변화는 **오류 문구뿐**이다.
- **대체 기대 시험**: RFC 계층 — `zrfc`가 이름으로는 통과하고 미구현으로 실패하는지.
- **별건 백로그**: 구 엔진(=현행 제품)의 이 배선 구멍 자체는 신 엔진과 무관하게
  존재한다. 교체 전까지 `zrfc`는 제품에서 쓸 수 없다.

### D10 — OData 통로의 403 CSRF 재시도에 상한이 생겼다
- **분류**: 수리
- **구 동작(실측)**: `engine/src/lib/odataRfc.ts:277` — 403을 만나면 자기 자신을
  **재귀 호출**한다. 상한이 없어 서버가 계속 403을 주면 멈추지 않는다.
- **신 동작**: 한 번만 되민 뒤 `csrf` 오류로 끝낸다. ADT 계층의 "재취득 후 1회"
  규칙과 같은 모양이다.
- **대체 기대 시험**: RFC 계층 — 403이 반복돼도 요청 발송이 2회를 넘지 않는지.

### D11 — `SAP_TIMEOUT_LONG`이 RFC 통로에도 실제로 먹는다
- **분류**: 수리
- **구 동작(실측)**: OData 통로는 60초가 하드코딩돼 있어 문서화된
  `SAP_TIMEOUT_LONG` 노브가 이 경로에서 아무 일도 하지 않는다.
- **신 동작**: `ConnectionConfig.timeouts.long`을 쓴다. 기본값이 60000ms로 같아
  **설정을 안 건드리면 동작은 동일**하다.
- **대체 기대 시험**: RFC 계층 — 설정한 타임아웃이 실제로 적용되는지 / 미설정 시
  구와 같은 60초인지.

### D12 — RFC 통로의 필수 설정을 **통로 생성 시점**에 확인한다
- **분류**: 강화
- **구 동작**: 첫 호출에서 확인 → 설정이 빠졌다는 사실이 실제 SAP 호출 시점에야
  드러난다.
- **신 동작**: 통로를 만들 때 확인해 `config` 오류로 즉시 알린다.
- **대체 기대 시험**: RFC 계층 — 필수 키가 없으면 생성 시점에 실패하는지.

### D13 — 엔진 자체 저작 **진단 문구**는 구와 다르다
- **분류**: 강화 (문구 한정)
- **경위**: 접속·전송·설정 계층의 오류 문구를 이 레포의 다른 계층과 같은 결로 새로
  썼다(`src/adt/errors.ts` · `src/rfc/errors.ts`). 구 엔진의 영어 진단 문장과
  글자가 다르다.
- **엄격히 지키는 경계**: **SAP이 돌려준 메시지 텍스트와, 구 엔진이 조립해 도구
  응답에 실어 보내던 계약성 문구는 글자 그대로 보존한다.** 예:
  `ZMCP_ADT_DISPATCH error (action=…, subrc=…): …`는 구 문자열 그대로다.
  달라지는 것은 **엔진이 스스로 지어내는 진단 산문**뿐이다.
- **재생 대조에 주는 지시**: 오류 응답은 **오류 종류(kind)와 SAP 유래 텍스트로
  엄격 대조**하고, 엔진 자체 진단 산문은 비결정 토큰과 같은 취급으로 정규화한다.
  **이 정규화가 적용된 건은 커버리지 표에 반드시 드러나야 한다** — 조용히 넘어가면
  오류 경로 전체가 무증거가 된다.
- **대체 기대 시험**: 각 계층의 오류 정규화 시험(오류 종류가 구별되는지 · SAP 유래
  텍스트가 보존되는지 · 원문 body가 진단용으로 남는지).

### D14 — `MCP_SKIP_AUTO_START`가 실제로 동작한다
- **분류**: 수리
- **구 동작(실측)**: `engine/src/lib/utils.ts:1344`의 **도움말 문자열에만** 있고
  코드 어디서도 읽지 않는다(레포 전체 grep: 그 한 줄과 번들의 같은 문자열뿐).
  즉 문서가 약속하는 노브가 아무 일도 하지 않는다.
- **신 동작**: 값이 참이면 자동 기동을 **건너뛴다**. 시험이 빌드 산출물을
  `require()`해 stdio를 잡지 않은 채 검사할 수 있게 하는 용도다.
- **근거**: 문서화된 노브가 동작하지 않는 것은 거짓 성공 계열이다(spec §2.4 분류).
  이 노브는 **기동을 막기만** 하며 무엇도 열지 않아 바닥선과 무관하다.
- **대체 기대 시험**: 서버 코어 — 이 값이 참일 때 stdio를 잡지 않고, 거짓/미설정일
  때는 평소대로 기동하는지.

### D15 — `--mcp=<destination>` · `--env=<name>` 통로는 M1에서 미구현이다
- **분류**: 축소 — **해소 마일스톤 = 인증 확장(Basic 외) 마일스톤**
- **구 동작**: 접속 브로커가 destination/service-key 기반 인증을 받는다. 셰임은
  `--mcp`가 있으면 **일부러 `MCP_ENV_PATH`를 세팅하지 않고** 번들이 그 인자를
  스스로 처리하기를 기대한다(`interactive/server/launch.cjs:344-347`).
- **신 동작**: M1은 Basic 인증만 다룬다(spec §3 M1-a). `--mcp`를 **인식은 하되**
  이름 있는 진단(`MCP_DESTINATION_UNSUPPORTED`)과 함께 inspection-only로 기동한다
  — 조용한 무접속이 아니라 이유를 말하는 실패다.
- **대체 기대 시험**: 서버 코어 — `--mcp`가 주어졌을 때 진단이 나오고
  inspection-only가 되는지. **접속된 척하지 않는지.**
- **비고**: destination 인증을 쓰는 등록은 M1 신 엔진으로 교체하면 접속을 잃는다.
  **교체 판 전에 반드시 해소해야 한다.**

### D16 — cwd `.env` 폴백이 "아무것도 해석되지 않았을 때"로만 좁혀졌다
- **분류**: 강화
- **구 동작(실측)**: `SAPKIT_HOME_DIR`가 깨졌거나(ENV_INVALID) 활성 프로파일
  포인터가 허상일 때(PROFILE_NOT_FOUND), 셰임은 `MCP_ENV_PATH`를 세팅하지 않고
  "접속 없이 시작한다"는 문구를 낸다. **그런데 번들이 그 말을 듣지 않는다** —
  `engine/src/lib/config/ArgumentsParser.ts:170-176`이 cwd의 `.env`를 주워
  접속을 만든다. 즉 운영자가 고정한 홈이 깨졌을 때 **의도하지 않은 프로젝트
  로컬 파일로 흘러내려 접속**했다.
- **신 동작**: 그 상태에서는 폴백하지 않는다. 접속 없이 기동한다.
- **근거**: 셰임이 그 자리에 fail-closed를 의도해 두었는데 번들이 그것을 무력화한
  것이다(`interactive/server/launch.cjs`의 ENV_INVALID 조항). 운영자가 고르지
  않은 시스템에 붙는 것은 안전 바닥선 문제다(spec §2.3).
- **대체 기대 시험**: 서버 코어 — 깨진 홈 고정 / 허상 포인터 각각에서 cwd `.env`가
  있어도 접속이 생기지 않는지.

### D17 — destination·브로커 통로가 있으면 cwd `.env` 폴백을 잠근다
- **분류**: 수리(구 동작 복원 + 통로 하나 보강)
- **경위**: 신 구현이 처음에는 `--mcp`가 있어도 cwd `.env`로 흘러내려, **"접속
  없이 시작한다"고 진단해 놓고 실제로는 딴 시스템에 붙었다**. 구 파서는 이
  폴백을 `else if (!result.mcp)`로 잠근다(`ArgumentsParser.ts:170`). 리뷰가
  잡아 고쳤다.
- **보강 1건(신 동작이 구보다 넓게 잠근다)**: 구는 브로커 선택을
  `hasFlag('--auth-broker') || process.env.MCP_USE_AUTH_BROKER === 'true'`로
  합치고 Variant 3이 그 합에 대해 잠근다(`ArgumentsParser.ts:182-183` ·
  `brokerFactory.ts:185`). 신 구현이 처음에는 인자만 봐서 **환경변수로 브로커를
  켠 기동이 cwd `.env`에 붙었다** — 같은 종류의 구멍이라 함께 막았다. 이건
  차이가 아니라 구 계약 복원이다.
- **`--env=<경로처럼 생긴 값>`은 진짜 차이다**: 구
  (`engine/src/lib/config/envResolver.ts:45-48`)는 `--env=./foo.env`를 하위
  호환으로 **경로처럼** 다뤘다. 신은 비어 있지 않은 `--env`를 전부 미구현
  destination으로 진단하고 접속을 만들지 않는다. 보수적 방향이며 D15와 같은 결이다.
- **대체 기대 시험**: 서버 코어 — `--mcp`/`--env`/`MCP_USE_AUTH_BROKER=true`
  각각 + cwd `.env`가 함께 있을 때 접속이 생기지 않는지 / 아무 통로도 없을 때
  폴백이 여전히 사는지 / `--env-path`가 `--env`로 오탐되지 않는지.

### D18 — 무접속 거부 어휘가 다르다 (**교체 판 전 적합성 러너 갱신 필요**)
- **분류**: 강화 (문구 한정) — D13의 특수 사례지만 **기계가 소비하므로** 따로 둔다
- **구 동작(실측)**: 프로파일이 없을 때 구 번들이 내는 문구는
  `Basic authentication requires SAP_CLIENT to be provided`이고,
  `interactive/scripts/conformance-server-gates.mjs:315`가 이 문자열을 grep해
  `NO_CONNECTION`으로 분류한다.
- **신 동작**: `ERR_NO_CONNECTION: …`.
- **왜 구 문구에 맞추지 않았나**: 구 문구는 "프로파일이 없다"를 "SAP_CLIENT가
  없다"로 잘못 말한다 — 진단으로서 틀렸다.
- **반드시 할 일**: **교체 판에서 적합성 러너의 분류 어휘를 갱신해야 한다.**
  하지 않으면 신 엔진의 정상 거부가 `OTHER`로 떨어져 게이트 판정이 어긋난다.
  (지금은 러너가 구 번들만 검사하므로 영향 없다.)

### D19 — 키체인에 저장된 **빈 문자열**을 "없음"으로 다룬다
- **분류**: 강화
- **구 동작(실측)**: `engine/src/lib/secrets.ts:121` — `getPassword()`가 `null`일
  때만 `KeychainEntryNotFoundError`를 던진다. **빈 문자열은 비밀번호로 그대로
  돌려준다.**
- **신 동작**: `src/profile/secrets.ts` — `null`과 `''`를 똑같이 "쓸 수 없는
  항목"으로 보고 `KEYCHAIN_ENTRY_NOT_FOUND`를 던진다.
- **근거**: 빈 비밀번호로 Basic 로그온을 시도하는 것은 **실패 로그온을 한 건
  쌓는 것 말고 아무 일도 하지 않는다.** 계정 잠금 사고(2026-08-11, D-080)가
  실패 로그온 누적으로 일어났으므로, 성공 가능성이 0인 시도를 보내지 않는 것이
  안전 바닥선이다(spec §2.3).
- **대체 기대 시험**: 프로파일 계층 — 저장값이 `null`/`''` 각각에서
  `KEYCHAIN_ENTRY_NOT_FOUND`가 나오고 접속이 만들어지지 않는지
  (`src/profile/__tests__/secrets.test.ts`).

### D20 — 자격증명 해석 실패가 **기동을 죽이지 않고** inspection-only로 강등한다
- **분류**: 강화
- **구 동작(실측)**: `engine/src/lib/profile.ts:243-246` — `resolveSecret`을
  `try` 없이 부른다. 해석이 실패하면 예외가 프로파일 활성화 경로 밖으로 나간다.
- **신 동작**: `src/profile/resolve.ts` — 잡아서 이름 있는 진단
  (`KEYCHAIN_REF_INVALID`·`KEYCHAIN_UNAVAILABLE`·`KEYCHAIN_ENTRY_NOT_FOUND`)을
  남기고 `connection: null` · `tier: 'UNKNOWN'`으로 기동한다.
- **근거**: 이 레포의 프로파일 계층이 이미 그 규약으로 서 있다 — 홈 고정이
  깨졌을 때도, 활성 프로파일이 허상일 때도, `sap.env`가 불완전할 때도 전부
  "접속 없이 뜨고 이유를 말한다"이다(`resolve.ts` 헤더). 자격증명 해석만
  예외로 두면 같은 종류의 실패가 두 가지 결말을 갖는다.
- **대체 기대 시험**: 프로파일 계층 — 어긋난 참조·해석 불가 참조 각각에서
  `connection`이 `null`이고 참조 문자열이 비밀번호 자리에 없는지
  (`src/profile/__tests__/resolve.test.ts`).
- **비고**: D16·D17과 같은 결의 기동 계층 차이라 도구 응답 시퀀스에 나타나지
  않는다 — `replay/divergences.ts`로 옮기지 않는다.

### D21 — `native` 통로의 실행 경로는 **오프라인으로 닫히지 않는다** (+ 그로 인한 차이 3건)
- **분류**: 축소 — **해소 자리 = SAP NW RFC SDK가 설치된 머신에서의 실행 확인.
  교체(swap) 판정 전까지.**
- **왜 닫히지 않나**: `native` 통로의 전송은 **컴파일된 네이티브 애드온**
  `node-rfc`이고, 그것은 유료 배포물인 SAP NW RFC SDK 7.50+를 함께 요구한다.
  구 엔진에서도 **선택적 의존**이며(`engine/package.json`의
  `optionalDependencies`에 `node-rfc: ^3.3.1`), 이 머신의 `engine/node_modules`에
  실제로 설치돼 있지 않다. 신 엔진의 의존성에는 아예 없고 이 판에서 추가하지
  않는다. 위임형이 아니라는 것도 확인했다 — `engine/node_modules/@babamba2/**`
  전체에 `node-rfc`·`RfcLibError` 문자열이 **0건**이라 구 엔진의 native 통로는
  자기 파일 안에서 애드온을 직접 `require`한다(`engine/src/lib/nativeRfc.ts:51`).
- **그래서 무엇까지 지었나**: 통로 생성 계약 · 접속 인자 조립 · 요청 조립 ·
  오류 종류 · 타임아웃. `src/rfc/native.ts`는 `createPool` 이음매를 공개해
  네이티브 런타임을 주입받는다 — `odata` 통로의 `transport` 주입과 같은 자리이며
  **다른 통로로 넘어가는 대체 경로가 아니다**(폴백 금지는 `src/rfc/select.ts`
  머리주석이 정본). 실제 디스패치(애드온이 SAP과 주고받는 구간)만 미확인이다.
- **대체 기대 시험**: `src/rfc/__tests__/native.test.ts` 39건 — 생성 시점 필수
  설정 확인(D12) · 접속 인자 조립의 구 대조 · 요청 조립의 구 대조 · 오류 종류
  넷의 구별 · 타임아웃 노브(D11). 실물 `node-rfc`가 없을 때 정직하게 `config`
  오류로 끝나는 것도 시험이 못박는다(설치된 머신에서는 전제가 깨지므로 건너뛴다).

이 통로에서만 갈리는 세 가지를 함께 등재한다.

- **㉮ 호출 타임아웃이 새로 생겼다** — 구 native 통로에는 **호출 상한이 아예
  없다**(`engine/src/lib/nativeRfc.ts:63-66`의 `poolOptions.idleTimeout: 300`은
  유휴 연결 회수 주기이지 호출 상한이 아니다). 다른 네 통로가 전부 60초 상한을
  갖는 것과도 어긋난다(`odataRfc.ts:51`·`gatewayRfc.ts:35`·`zrfcProxy.ts:33`).
  신은 `ConnectionConfig.timeouts.long`(미설정 기본 60000ms — `src/profile/resolve.ts:38`)을
  **연결 획득 + 호출 전체 하나의 예산**으로 건다. D11의 `native` 갈래이며, 구가
  0이던 자리에 상한이 생기는 것이므로 D11 본문("기본값이 같아 동작 동일")보다
  **강한 변화**다. **부작용**: 예산이 끝나면 되돌려 받은 클라이언트를 풀에
  반납하지만 애드온 쪽 호출은 아직 진행 중일 수 있다. 실기 확인 항목이다.
- **㉯ 애드온이 던진 것을 전부 `network`으로 받는다** — 구는 이 자리에서 아무
  분류도 하지 않고 애드온의 오류를 그대로 흘린다(`nativeRfc.ts:140-158`).
  `RFC_LOGON_FAILURE`를 `auth`로 가르는 등의 세분은 `node-rfc` 고유 오류 어휘를
  읽어야 가능한데 그 패키지가 이 레포에 없어 오프라인으로 확인할 수 없다 —
  확인하지 못한 어휘로 종류를 주장하지 않고 "응답을 받지 못했다"까지만 말한다.
  원문 메시지와 `cause`는 보존한다. SDK가 붙는 머신에서 세분 여부를 정한다.
- **㉰ 필수 설정 확인이 통로 생성 시점으로 앞당겨졌다(D12의 native 갈래)** —
  구는 첫 호출의 `getPool()` 안에서 조립한다(`nativeRfc.ts:44-61`). 신은 생성자에서
  조립해 `config` 오류로 즉시 알린다. **런타임 적재만은 여전히 첫 호출 때다** —
  통로 객체 하나 만드는 일이 컴파일된 애드온을 끌어오는 부작용을 내면 안 되고,
  D12가 앞당긴 것은 설정 확인이지 적재가 아니다. 적재 실패는 구와 같이 기억해
  두 번째 호출이 같은 오류로 즉시 끝난다(`nativeRfc.ts:46`·`:53`·`:68`).

**일부러 같게 둔 것**: `SAP_RFC_*` 키 이름·기본값(`LANG`=`EN`·`GROUP`=`PUBLIC`)·
`ASHOST`/`MSHOST` 배타 규칙·풀 크기(`low 0`·`high 3`·`idleTimeout 300`)·
`ZMCP_ADT_DISPATCH error (action=…, subrc=…): …` 문구·필수 키 오류의 앞머리
`<KEY> is required for SAP_RFC_BACKEND=native but not set in sap.env`.
**자격증명이 `ConnectionConfig`에서 오지 않는 것도 구 그대로다** — 구 native
통로는 ADT와 다른 기술 사용자로 로그온하도록 `SAP_RFC_USER`/`_PASSWD`만 읽으며
(`nativeRfc.ts:78-108`), 그 분리를 깨는 것은 승계가 아니라 새 설계다.
### D22 — `zrfc` 통로의 **동작 확인은 이 판에서 불가능하다** (attended 세션 몫)

- **분류**: 축소 — **해소 자리 = attended 세션(실 SAP 접속)**. 코드는 이 판에서
  다 지었고, 비어 있는 것은 **증거**다.
- **무엇이 불가능한가**: `zrfc`는 SAP 측에 **오브젝트 2종**이 설치돼 있어야만
  대답한다 — ICF 핸들러 클래스 `ZCL_MCP_RFC_HTTP_HANDLER`와 그것을 다는 SICF
  노드 `/sap/bc/rest/zmcp_rfc`다(`engine/docs/installation/ZRFC_SETUP.md:17-46`).
  소유자 프로파일은 `odata`를 타므로 그 둘이 설치돼 있지 않고, **설치 자체가
  P3/P4 구간**(클래스 생성·활성화 + SICF 설정 + 이송)이다. 그래서 이 통로는
  **한 번도 실제로 왕복해 본 적이 없다.** 재생 대조에도 채록분이 없다.
- **그래서 무엇으로 대신했나**: 구 `engine/src/lib/zrfcProxy.ts`를 **실제로
  실행해** 전역 `fetch`를 가로채고, 같은 입력에 대해 신 통로가 주입 전송으로
  조립한 요청과 **바이트 대조**했다(메서드·URL·헤더·본문·반환값·`subrc != 0`
  문구 8건 전부 일치. 헤더는 이름 소문자화 + 키 정렬만 정규화 — 신 전송이
  `Authorization`을 맨 뒤에 붙이는 순서 차이는 HTTP에서 의미가 없다).
  **이 조립 대조가 이 통로의 정확성 근거 전부다.**
- **attended 세션이 확인할 것** (이 목록이 곧 미완의 증거다):
  1. CSRF 악수가 실기에서 실제로 토큰 + `zrfc_csrf` 쿠키를 돌려주는가.
  2. `/dispatch`·`/textpool` 왕복이 `subrc=0`으로 끝나는가.
  3. **오브젝트 부재 시의 실패 종류**가 이 판이 못박은 대로인가 —
     SICF 노드 없음 → `not-found`(404) · 핸들러 클래스 비활성 → `protocol`
     (토큰 헤더 없음) · 대리자 FM 없음 → `server`(500). 증상표
     (`ZRFC_SETUP.md:127-134`)를 오류 종류로 옮긴 것이라 실기에서만 확정된다.
  4. 핸들러의 deny list 403이 CSRF 403과 **구별되는가**(전자는
     `X-CSRF-Token: Required` 헤더가 없어 `forbidden`, 후자는 `csrf`).
- **대체 기대 시험**: `src/rfc/__tests__/zrfc.test.ts` — 조립 대조 · 통로 생성
  시점 설정 확인 · 타임아웃 노브 · 403 되밀기 상한 · **오브젝트 부재 상황의
  오류 종류**. 40건. 다만 위 목록이 남는 한 이 시험들은 "구와 같은 것을 보낸다"
  까지만 증명하고 "SAP이 그것을 받아들인다"는 증명하지 못한다.
- **이 통로가 함께 지고 가는 기등재 차이**(각 항목의 본문은 그대로 적용된다):
  D10(403 되밀기 상한 1회 — 구는 무한 재귀 `zrfcProxy.ts:213-219`) ·
  D11(`SAP_TIMEOUT_LONG`이 먹는다 — 구는 60초 하드코딩 `:33`) ·
  D12(필수 설정을 통로 생성 시점에 확인 — 구는 매 호출 `:105`·`:183`) ·
  D13(엔진 자체 진단 문구는 한국어. **`ZMCP_ADT_DISPATCH error (action=…,
  subrc=…): …`는 구 글자 그대로 보존**).
- **자격증명 출처**(차이가 아니라 구조 승계 기록): 구 `zrfcProxy`는 `connection`
  인자를 받고도 **쓰지 않고** `process.env`의 `SAP_USERNAME`/`SAP_PASSWORD`/
  `SAP_CLIENT`로 Basic 헤더를 짓는다(`:65-76`·`:246-249`) — 접속 계층·인증
  브로커(`engine/src/lib/clients.ts`·`src/lib/auth/`)를 아예 타지 않는다. 신
  통로는 `ConnectionConfig`에서 같은 세 값을 받는다. 값이 같으므로 와이어는
  동일하고, 구 `odata` 통로도 같은 모양이다.
- **별건 백로그**: D9가 적은 배선 구멍(구 선택기가 `zrfc`를 안 받는다)은 그대로
  남는다. 이 판이 고친 것은 **신 엔진 쪽**이다.
### D23 — destination 이름은 **이름이지 경로가 아니다** (구: 검사 없이 합친다)
- **분류**: 강화
- **구 동작(실측)**: `--mcp=<destination>`은 검사 없이
  `path.join(serviceKeysDir, `${destination}.json`)`으로 합쳐진다
  (`engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/stores/abap/AbapServiceKeyStore.js:85-86`).
  `--env=<name>`도 `path.join(sessionsDir, normalizeEnvFileName(name))`으로
  합쳐지고, 그 앞에 `isLikelyPath`가 **경로처럼 생긴 값을 경로로 승격**한다
  (`engine/src/lib/config/envResolver.ts:45-48`). 어느 쪽도 `..`를 막지 않아
  `--mcp=../../x`가 저장소 밖 파일을 읽었다.
- **신 동작**: 두 인자 모두 값이 경로처럼 생기면(구분자 포함 · `.`/`~` 시작 ·
  절대경로 · 드라이브 문자) **파일을 찾기 전에** 거부하고 이름 있는 진단
  (`MCP_DESTINATION_INVALID` · `ENV_DESTINATION_INVALID`)을 남긴다. 접속은
  만들지 않는다.
- **근거**: 이름 하나가 저장소 밖 임의 파일로 접속을 만드는 것은 운영자가
  고르지 않은 시스템에 붙는 것과 같은 부류다(spec §2.3 · D16·D17이 지키는 자리).
  **D17의 「`--env=./foo.env`를 경로로 다루지 않는다」 조항은 통로를 구현한
  뒤에도 그대로 산다** — 되돌리지 않았다.
- **대체 기대 시험**: 프로파일 계층 `src/profile/__tests__/destination.test.ts`
  (`checkDestinationName` 9종) + 서버 코어 `src/server/__tests__/startup.test.ts`
  — `--env=./foo.env`가 cwd의 그 파일로 붙지 않는지 / `--mcp=../DEST1`이
  거부되는지.

### D24 — `--mcp`가 있으면 **다른 통로로 대신 붙지 않는다** (구: 프로파일을 함께 적용)
- **분류**: 강화
- **구 동작(실측)**: `engine/src/server/launcher.ts:227-239`이 `--mcp` 여부와
  무관하게 `activateProfile()`을 먼저 돌려 활성 프로파일의 `SAP_*`(tier·안전
  노브 포함)를 `process.env`에 덮어쓴다. 접속은 브로커 Variant 1이 service key로
  만든다(`brokerFactory.ts:146-164`). 즉 **tier는 프로파일 A에서, 접속은 시스템
  B에서** 온다.
- **신 동작**: `--mcp`가 있으면 프로파일 해석을 아예 하지 않는다.
  `connection: null` · `tier: 'UNKNOWN'`(fail-closed) · 안전 노브는 프로세스 env의
  잠긴 기본값. `MCP_ENV_PATH`·활성 프로파일·cwd `.env` 어느 쪽으로도 대신 붙지
  않는다.
- **근거**: 한 시스템의 등급으로 다른 시스템에 대한 write 판정을 내리는 것은
  안전 바닥선 문제다. 구 파서가 이 폴백을 잠근 것과 같은 방향이며
  (`ArgumentsParser.ts:170`), D17이 이미 그 방향을 명문화했다.
- **대체 기대 시험**: 서버 코어 — `--mcp` + `MCP_ENV_PATH` / `--mcp` + 활성
  프로파일 / `--mcp` + cwd `.env` 각각에서 접속이 생기지 않는지.
- **비고**: 이 판은 service key로 **설정 조립까지만** 짓는다(토큰 취득 = 실접속 =
  범위 밖). 조립 성공은 `MCP_DESTINATION_TOKEN_PENDING` 진단으로 밝힌다 —
  D15가 말하는 "접속된 척하지 않는다"를 그대로 지킨다.

### D25 — `AUTH_BROKER_PATH`를 **플랫폼 구분자 하나로만** 쪼갠다 (구: `:`와 `;` 양쪽)
- **분류**: 수리
- **구 동작(실측)**: `engine/src/lib/stores/platformPaths.ts:66` — `split(/[:;]/)`.
  주석은 "Unix는 콜론, Windows는 세미콜론"이라고 적어 두었지만 실제로는 양쪽을
  모두 쪼개므로, Windows의 `C:\keys`가 `C`와 `\keys` **두 경로**로 부서진다.
  문서가 약속하는 대로 동작하지 않는 노브다.
- **신 동작**: `win32`는 `;`, 그 외는 `:`로만 쪼갠다.
- **근거**: 문서화된 노브가 실제로 다르게 동작하는 것은 거짓 성공 계열이다
  (spec §2.4 분류). 무엇도 열지 않으므로 바닥선과 무관하다.
- **대체 기대 시험**: 프로파일 계층 — 드라이브 문자를 가진 win32
  `AUTH_BROKER_PATH`가 쪼개지지 않는지 / posix 콜론 목록이 그대로 쪼개지는지
  (`src/profile/__tests__/destination.test.ts`).
### D26 — HTTP 전송의 DNS 리바인딩 보호가 **기본으로 켜진다** (구: 노브가 배선되지 않아 항상 꺼짐)
- **분류**: 수리 + 강화
- **구 동작(실측)**: 구는 `--http-allowed-hosts`·`--http-allowed-origins`·
  `--http-enable-dns-protection`(그리고 SSE 짝)을 파싱해 설정 객체까지 담는다
  (`engine/src/lib/config/ArgumentsParser.ts:227-239`). 그런데 전송을 만들 때
  넘기는 것은 `sessionIdGenerator`와 `enableJsonResponse` **둘뿐이다**
  (`engine/src/server/StreamableHttpServer.ts:186-189`). 즉 **문서화된 세 노브가
  아무 일도 하지 않는다** — 무엇을 넣든 보호는 꺼진 채다.
- **신 동작**: 셋을 실제로 SDK 전송에 배선하고 **기본으로 켠다**. 허용 Host의
  기본값은 바인딩 대상에서 유도하고(`localhost:P`·`127.0.0.1:P`·`[::1]:P`),
  허용 Origin의 기본값은 같은 포트의 로컬 두 출처다. 운영자가 목록을 주면
  그것이 이긴다. 끄면 그 사실이 진단(`HTTP_DNS_PROTECTION_OFF`)으로 남는다.
- **근거**: 문서화된 노브가 동작하지 않는 것은 거짓 성공 계열이다(D14·D9와 같은
  분류). 그리고 자작이 안전 바닥선을 낮추는 근거가 되지 않는다(spec §2.3) —
  HTTP는 네트워크 표면을 여는 일이므로 기본값이 헐거우면 그 자체가 바닥선
  저하다.
- **대체 기대 시험**: 서버 전송 계층
  (`src/server/__tests__/transport.test.ts`) — 기본값이 켬이고 허용 Host가
  바인딩에서 유도되는지 / 허용 목록 밖의 Host 헤더가 403으로 막히는지.
- **함께 등재하는 부수 차이 1건**: `GET /mcp/health` 응답에 **판 번호를 싣지
  않는다**(구는 `version`을 실었다 — `StreamableHttpServer.ts:228-235`). 인증
  없이 열린 창이므로 알리는 것을 최소로 둔다. 나머지 필드(`status`·`uptime`·
  `transport`)는 구와 같다. 또 health에도 같은 Host 판정을 적용한다 — SDK의
  검사는 MCP 경로 안에서만 돌아 그대로 두면 보호가 걸리지 않은 창이 하나 남는다.

### D27 — 비루프백 바인딩은 **명시 옵트인**을 요구한다 (구: 조건 없이 허용)
- **분류**: 강화
- **구 동작(실측)**: 기본 호스트는 `127.0.0.1`이지만
  (`ArgumentsParser.ts:220-221`), `--http-host=0.0.0.0`·`MCP_HTTP_HOST`는 아무
  조건 없이 받아들여지고 도움말이 그것을 권하기까지 한다
  (`engine/src/lib/utils.ts:1348`·`1422`). 구 HTTP 전송에는 **MCP 클라이언트
  인증이 없다** — 요청이 요구하는 것은 SAP 접속 맥락뿐이고
  (`StreamableHttpServer.ts:130-163`), 기본 destination이 설정돼 있으면 포트에
  닿는 누구나 노출된 도구 표면 전체를 쓴다.
- **신 동작**: 루프백이 아닌 주소로 바인딩하려면
  `--http-allow-remote`(`MCP_HTTP_ALLOW_REMOTE=true`)를 **명시해야** 한다. 없으면
  `ERR_HTTP_NON_LOOPBACK`으로 기동을 거부한다. 옵트인해도 "클라이언트 인증이
  없다"는 경고(`HTTP_REMOTE_BIND`)가 남고, 기동 진단은 언제나 `client-auth=none`을
  적는다.
- **근거**: spec §2.3 — 자작이 바닥선을 낮추는 근거가 되지 않는다. 인증이 없는
  상태에서 전 인터페이스 바인딩은 도구 표면 전체를 무인증으로 여는 일이다.
  **기능을 없앤 것이 아니라 명시를 요구한 것**이므로 축소가 아니다.
- **대체 기대 시험**: 서버 전송 계층 — 옵트인 없는 `0.0.0.0`이 거부되는지 /
  옵트인하면 열리되 경고가 남는지.
- **함께 등재하는 부수 차이 1건**: **전송 설정은 프로파일 파일(`sap.env`)에서
  오지 않는다.** 구는 활성 프로파일의 모든 키를 `process.env`에 부으므로
  (`engine/src/lib/profile.ts:271-277` `applyProfile`) 프로파일 파일에 적힌
  `MCP_TRANSPORT=http` 한 줄이 포트를 열 수 있었다. 신 엔진의 전송 해석은
  **argv와 프로세스 env만** 본다.

### D28 — `--http-json-response` 노브가 **실제로 끌 수 있다** (구: 실효값 참에 갇힘)
- **분류**: 수리
- **구 동작(실측)**: 파서의 기본값은 거짓인데(`ArgumentsParser.ts:222-226`)
  런처가 `parsed.httpJsonResponse || undefined`로 넘겨(`launcher.ts:439`) 거짓이
  `undefined`로 접히고, 전송이 `opts?.enableJsonResponse ?? true`로 받는다
  (`StreamableHttpServer.ts:89`). 결과적으로 **무엇을 주든 항상 참**이다 — 노브가
  값을 하나만 낼 수 있다.
- **신 동작**: 실효 기본값(참)은 그대로 승계하고, 노브가 실제로 거짓을 낼 수 있게
  한다. **설정을 안 건드리면 동작은 구와 같다.**
- **대체 기대 시험**: 서버 전송 계층 — 해석된 설정의 기본값이 참인지(전송 선택
  시험이 기본 설정 전체를 단언한다).

### D29 — `--transport=sse`는 아직 없다
- **분류**: 축소 — **해소 마일스톤 = SSE 전송 과제(같은 물결)**
- **구 동작**: `sse`는 유효한 값이고 `SseServer`가 뜬다(`launcher.ts:420-433`).
- **신 동작**: 이름은 인식하되 이름 있는 진단(`TRANSPORT_SSE_UNSUPPORTED`)을 남기고
  **stdio로 닫는다.** 포트를 열지 않는다. 알 수 없는 전송 값도 같다
  (`TRANSPORT_UNSUPPORTED`) — 구도 알 수 없는 값에서는 stdio로 떨어졌으므로
  (`ServerConfigManager.ts:138-152`) 그쪽은 진단 문구만 는 것이다.
- **근거**: 오타 하나가 네트워크 표면을 여는 일이 없어야 한다(D5와 같은 fail-closed
  방향). 조용히 떨어지지 않고 이유를 말하는 것은 이 레포의 기동 계층 규약이다.
- **대체 기대 시험**: 서버 전송 계층 — `sse`·알 수 없는 값 각각에서 stdio로 닫히고
  진단이 나오는지.

### D30 — HTTP 요청 헤더로 SAP 접속을 고르는 통로가 없다
- **분류**: 축소 — **해소 마일스톤 = 인증 확장(Basic 외) 마일스톤. D15와 같은 자리.**
- **구 동작(실측)**: 요청마다 `x-mcp-destination` → `x-sap-url`+`x-sap-jwt-token`
  또는 `x-sap-login`/`x-sap-password` → 기본 destination 순으로 SAP 접속 맥락을
  고르고, 아무것도 없으면 **요청 자체를 400으로 거절**한다
  (`StreamableHttpServer.ts:130-163`·`304-314`).
- **신 동작**: 접속은 프로파일(또는 `--env-path`)에서만 온다 — stdio와 같다. 요청
  헤더로 접속을 고르지 않으므로 400 갈래도 없고, 접속이 없으면 **도구를 부를 때**
  `ERR_NO_CONNECTION`으로 정직하게 실패한다(D18과 같은 어휘).
- **근거**: M1은 Basic 인증만 다룬다(spec §3 M1-a). 요청 헤더로 자격증명을 받는
  통로는 인증 확장과 같은 자리에서 함께 설계해야 한다 — 그 전에 반쯤 지으면
  자격증명이 요청 로그에 실리는 경로만 먼저 생긴다.
- **대체 기대 시험**: 없음(축소). 접속 없는 HTTP 기동이 inspection-only로 정상
  동작하는지는 기동 스모크(`gates/http-smoke.mjs`)가 본다.

### D31 — SSE 전송의 바인딩 잠금이 **HTTP와 같은 자리**에서 판정된다 (구: SSE 짝 노브가 죽어 있었다)
- **분류**: 수리 + 강화
- **구 동작(실측)**: 구는 SSE 짝 노브를 **파싱만 한다.**
  `--sse-port`(문서상 기본 3001)·`--sse-host`·`--sse-allowed-hosts`·
  `--sse-allowed-origins`·`--sse-enable-dns-protection`이
  `ArgumentsParser.ts:240-257`에서 값까지 담기지만, 설정을 조립하는 자리는
  `--host`/`--port`와 **HTTP 짝**만 읽고(`ServerConfigManager.ts:115-116`),
  런처가 `SseServer`에 넘기는 것은 `host`·`port`·`ssePath`·`postPath`·
  `defaultDestination`·`logger`뿐이다(`launcher.ts:420-433`). 그래서
  ⓐ SSE는 실제로 `--port`/`--http-port`/`MCP_HTTP_PORT`(기본 3000)에 붙었고
  문서가 말한 3001은 한 번도 쓰이지 않았으며, ⓑ SSE의 DNS 리바인딩 보호·허용
  목록은 **항상 꺼진 채**였다(D26이 HTTP에서 잡은 것과 같은 결함이 SSE에도 있다).
  살아 있던 SSE 전용 노브는 경로 둘(`--sse-path` 기본 `/sse` · `--post-path`
  기본 `/messages`)뿐이다.
- **신 동작**: 바인딩 잠금 셋(비루프백 명시 옵트인 D27 · DNS 리바인딩 보호 기본
  켬 D26 · 포트 값 검증)을 **HTTP와 같은 코드 자리**에서 판정한다
  (`src/server/transport/config.ts`). 죽어 있던 SSE 짝 이름은 되살리되
  **HTTP 이름 앞에 두는 별칭**으로 둔다 — 안 주면 구의 실효값(호스트 127.0.0.1 ·
  포트 3000)이 그대로 나오고, 주면 그때만 이긴다. 경로 둘은 구 이름·구 기본값
  그대로다. 기동 진단은 HTTP와 같은 어휘로 `client-auth=none`을 적는다.
- **근거**: 전송마다 잠금이 갈라지면 **한쪽이 다른 쪽의 뒷문**이 된다 — HTTP에서
  비루프백 바인딩을 막아 놓고 `--transport=sse`로 같은 표면을 무조건 열 수 있으면
  D27은 아무것도 막지 못한다. 자작이 안전 바닥선을 낮추는 근거가 되지 않는다
  (spec §2.3). 문서화된 노브가 아무 일도 하지 않는 것은 거짓 성공 계열이므로
  D26·D28과 같은 분류로 고친다.
- **대체 기대 시험**: 서버 전송 계층(`src/server/__tests__/transport.test.ts`) —
  `--transport=sse`의 기본값이 구 실효값과 같은지 / 비루프백이 옵트인 없이
  거부되는지(인자·환경변수 양쪽) / DNS 보호 기본값이 켬인지 / 쓸 수 없는 포트가
  거부되는지 / SSE 이름이 HTTP 이름보다 앞서되 없으면 HTTP 이름이 그대로 사는지.
  기동 스모크는 `gates/sse-smoke.mjs`.
- **함께 등재하는 부수 차이 3건**:
  ① **DNS 리바인딩 보호를 모든 경로에 건다.** SDK의 검사는 `handlePostMessage`
    안에서만 돌고 스트림을 여는 `start()`는 검사하지 않는다
    (`@modelcontextprotocol/sdk/server/sse.js`). 그대로 두면 보호가 걸리지 않은
    창이 둘(스트림 GET · health) 남으므로 전송 모듈이 같은 판정을 한 번 더 한다.
    Origin은 SDK와 같은 규칙(헤더가 있을 때만)으로 본다.
  ② **`GET /mcp/health`에 판 번호도 세션 수도 싣지 않는다.** 구는 `version`과
    `activeSessions`를 실었다(`SseServer.ts:108-116`). 무인증으로 열린 창이므로
    알리는 것을 최소로 둔다 — D26의 부수 차이와 같은 자리이고, 남는 필드
    (`status`·`uptime`·`transport`)는 구와 같다.
  ③ **요청 헤더로 SAP 접속을 고르는 통로가 SSE에도 없다.** 구는 SSE GET에서
    `x-mcp-destination`/`x-sap-*`/기본 destination 순으로 접속 맥락을 고르고 없으면
    **400으로 거절**했다(`SseServer.ts:190-224`). 신은 stdio·HTTP와 같이 프로파일
    에서만 접속을 얻으므로 그 400 갈래가 없다 — **D30과 같은 판단이고 해소
    마일스톤도 같다**(인증 확장). 접속이 없으면 도구를 부를 때
    `ERR_NO_CONNECTION`으로 실패한다.
### D32 — 브로커 스위치는 **저장소 재료까지만** 조립하고, 그 통로로는 접속이 서지 않는다
- **분류**: 축소 — **해소 마일스톤 = 인증 확장(Basic 외) 마일스톤. D15·D30과 같은 자리.**
- **구 동작(실측)**: `--auth-broker` · `MCP_USE_AUTH_BROKER=true`가 하는 일은 둘뿐이다.
  ⓐ 인자와 환경변수를 하나로 합쳐(`engine/src/lib/config/ArgumentsParser.ts:182-183`)
  Variant 3(cwd `.env`)을 잠근다(`engine/src/lib/auth/brokerFactory.ts:185`).
  ⓑ **기본 브로커를 만들지 않는다** — Variant 1(`--mcp`)·2(`--env`)에 걸리지
  않으면 `DEFAULT_BROKER_NOT_CREATED`로 끝나고(`brokerFactory.ts:283-296`),
  접속 맥락은 destination이 **지목될 때** 저장소에서 그때그때 만들어진다
  (`brokerFactory.ts:336-372`). 지목하는 통로는 `--mcp`이거나 HTTP 요청 헤더
  `x-mcp-destination`이며, 토큰은 그 위에서 `AuthBroker.getToken`이 **브라우저
  OAuth2 로그인**으로 받아 온다
  (`engine/node_modules/@babamba2/mcp-abap-adt-auth-broker/dist/AuthBroker.js:373-464`
  → `…/mcp-abap-adt-auth-providers/dist/providers/AuthorizationCodeProvider.js:76-90`).
- **신 동작**: ⓐ는 그대로 지킨다(D17이 이미 못 박은 자리 — 인자·환경변수 양쪽).
  ⓑ에 대해서는 저장소 재료(`service-keys`·`sessions` 디렉터리 + 그 안의
  destination 이름)까지 조립해 `startup.destination.channel === 'broker'`로 싣고
  **접속은 만들지 않는다.** 이유는 이름 있는 진단으로 말한다 — 이름이 지목되지
  않았으면 `AUTH_BROKER_NO_DESTINATION`, 접속을 이미 딴 통로가 소유했으면
  `AUTH_BROKER_IGNORED`. 구는 이 자리를 `logger?.debug`로만 남겨 DEBUG 변수가
  없으면 **아무 말도 하지 않는다**(`brokerFactory.ts:284-292`).
- **곁딸린 차이 1건(강화)**: 구는 `--unsafe`에서 세션 저장소를 파일 기반으로
  세우고 그 생성자가 디렉터리를 **없으면 만든다**
  (`engine/node_modules/@babamba2/mcp-abap-adt-auth-stores/dist/stores/abap/AbapSessionStore.js:71-74`).
  신은 경로를 재료로 실어 나르기만 하고 **만들지 않는다** — 기동만으로 운영자
  디스크에 폴더가 생기지 않는다. service key도 이름만 세고 열지 않으므로 재료에
  비밀이 실릴 자리가 없다.
- **왜 여기까지인가**: 그다음이 전부 실접속이다. destination을 지목하는 통로는
  `--mcp`(D15 — 토큰 취득 미구현)와 HTTP 헤더(D30 — 통로 자체가 없음) 둘뿐이고,
  토큰은 브라우저 로그인 왕복이다. 이 판은 실접속 성공을 범위 밖으로 둔다.
- **대체 기대 시험**: 서버 코어 `src/server/__tests__/startup.test.ts`
  「브로커 통로 — --auth-broker / MCP_USE_AUTH_BROKER」 10건 — 인자·환경변수 양쪽
  인식 · 재료 조립 · 스위치 없으면 통로 미개방 · 접속 미생성과 그 이유 ·
  cwd `.env` 잠금 유지(D17 보강분) · 저장소 부재에서도 기동 생존(D20) · 진단에
  비밀 미유출 · `--mcp`/`--env`가 앞이라는 순서 · **브로커를 켜도
  `MCP_ENV_PATH`·`--env-path`·활성 프로파일이 그대로 붙는다는 회귀 0**. 재료
  계층은 `src/profile/__tests__/destination.test.ts`의 `resolveBrokerStores` 4건.
- **비고**: D16·D17·D20·D24와 같은 결의 **기동 계층** 차이라 도구 응답 시퀀스에
  나타나지 않는다 — `replay/divergences.ts`로 옮기지 않는다.

### D33 — 도구 사이의 프로세스 전역 캐시(`objectsListCache`)를 승계하지 않는다
- **분류**: 축소 — **해소 마일스톤 = `GetObjectNodeFromCache`를 짓는 마일스톤**
- **구 동작(실측)**: `engine/src/lib/getObjectsListCache.ts`는 모듈 수준 싱글턴이고,
  **여섯 도구가 여기에 마지막 결과를 얹는다** — `GetObjectsByType`
  (`handleGetObjectsByType.ts:175`·`:191`·`:254`) · `GetObjectsList`(`:210`) ·
  `SearchObject`(`handleSearchObject.ts:139`) · `GetTypeInfo`(`:232`·`:251`) ·
  `GetWhereUsed`(`:111`). 그것을 **읽는** 유일한 도구가
  `handleGetObjectNodeFromCache.ts:41`이다.
- **신 동작**: 얹지 않는다. 지금 등록된 도구 중 이 캐시를 **읽는 것이 없으므로**
  얹어 봐야 아무도 보지 않는 전역 가변 상태만 늘어난다.
- **근거**: 캐시를 읽는 도구를 짓는 마일스톤이 캐시의 자리(프로세스 전역이냐
  접속 수명이냐)를 함께 정하는 것이 옳다. 지금 얹으면 그 결정이 이미 내려진 것이
  된다. 또 이 판의 검색 묶음 밖에서 `SearchObject`가 **이미** 얹지 않고 있어,
  캐시를 절반만 채우는 상태가 만들어진다 — 절반 찬 캐시는 빈 캐시보다 나쁘다.
- **대체 기대 시험**: 없음(축소). 판정 자리는 `GetObjectNodeFromCache`를 짓는
  마일스톤이다 — 그때 이 항목이 닫히거나 결함으로 승격된다.
- **비고**: 도구 자신의 응답에는 나타나지 않는다(캐시는 다음 도구가 읽을 때만
  보인다). 그래서 `replay/divergences.ts`로 옮기지 않는다.

### D34 — 인자 검증 실패 문구에서 구의 `MCP error -32602: ` 접두사가 빠진다
- **분류**: 축소 — **해소 마일스톤 = 재생 대조 판(C2 이후) · 도구가 프로토콜 오류
  코드를 고르는 통로를 되살릴지 정하는 자리**
- **구 동작(실측)**: 구 핸들러는 인자 오류를 `McpError(ErrorCode.InvalidParams, …)`로
  던져 자기 `catch`에서 접었다(예:
  `engine/src/handlers/search/readonly/handleGrepPackages.ts:104-113` ·
  `handleGetObjectsByType.ts:120-153`). SDK의 `McpError`는 생성자에서 메시지 앞에
  `MCP error <코드>: `를 직접 붙이므로
  (`@modelcontextprotocol/sdk/dist/cjs/types.js:2054-2060`), `error.message`에도
  `String(error)`에도 **JSON-RPC 코드 `-32602`가 문자열로 박혀** 나간다.
- **신 동작**: 같은 문장을 그대로 두고 접두사만 없다. 도구가 프로토콜 오류 코드를
  고르는 통로를 신 엔진이 내주지 않기 때문이다(`src/server/toolDefinition.ts`의
  `ToolResult`는 `isError`뿐이고, 코드는 서버 코어가 고른다 —
  `src/tools/read/internal/results.ts`의 `ToolArgumentError` 주석이 그 결정의 자리).
- **범위**: 이미 지어진 `GrepObjects`·`SearchObject`도 같은 모양이다. 이 항목은
  그 선례를 뒤늦게 등재하는 것이며 새로 만든 차이가 아니다.
- **대체 기대 시험**: 없음(축소). 문장 자체가 글자 그대로 보존되는지는 각 도구의
  계약 시험이 본다(예:
  `src/tools/read/__tests__/getObjectsByType.test.ts` 「갈래」 ·
  `src/tools/read/__tests__/grepPackages.test.ts` 「갈래」).
- **⚠️ 재생 대조에 주는 경고**: 이 차이는 **D13의 산문 정규화로 흡수되지 않는다.**
  `harness/replay/errorSignature.ts`의 `DEFAULT_CODE_RULES`가 `-32\d{3}`을 **엄격
  신호**로 잡기 때문에, 오류 단계를 재생하면 `error-kind` 불일치로 떨어진다.
  기계용 장부(`harness/replay/divergences.ts`)에 이 항목을 옮기는 일은 그 파일을
  소유한 작업의 몫이다 — 이 판의 검색 묶음 작업은 그 파일을 건드리지 않았다.
### D35 — `GetObjectInfo`의 `enrich`가 **실제로 동작한다** (구: 언제나 빈손)

- **분류**: 수리
- **구 동작(실측)**: `engine/src/handlers/system/readonly/handleGetObjectInfo.ts:83-87`이
  `handleSearchObject(context, { query: objectName, object_type, maxResults: 1 })`로
  부르는데, 그 핸들러는 인자를
  `const { object_name, object_type, maxResults } = args`로 받는다
  (`engine/src/handlers/search/readonly/handleSearchObject.ts:56`). 즉 이름이
  **`query`가 아니라 `object_name`**이라 값이 `undefined`가 되고, 바로 다음 줄의
  `if (!object_name) throw new McpError(...)`(`:57-59`)에 걸린다. 그 예외는
  `handleSearchObject` 자신의 catch가 `{ isError: true }`로 접어 돌려주므로
  (`:149-160`), 호출부의 `if (!searchResult.isError && …)`(`handleGetObjectInfo.ts:88`)
  가 **언제나 거짓**이 된다. 결과적으로 `enrichNodeWithSearchObject`는 늘
  `{ packageName: undefined, description: undefined, type: objectType }`을 돌려주고,
  `OBJECT_DESCRIPTION`·`OBJECT_PACKAGE`는 `undefined`라 `JSON.stringify`에서 통째로
  사라진다. **기본값이 `enrich=true`인 인자가 아무 일도 하지 않는다.**
- **신 동작**: 인자 이름을 맞춰(`object_name`) 실제로 `SearchObject`를 부르고,
  이름이 대소문자 무시하고 정확히 일치하는 참조에서 `description`·`packageName`·
  `type`을 가져와 채운다. 대조 조건은 구가 쓰려던 것과 같다
  (`handleGetObjectInfo.ts:106-117`). 검색 실패는 구처럼 삼키고 트리는 그대로 낸다.
- **근거**: 발행 설명이 "Enrich each node with description and package via
  SearchObject if enrich=true"라고 약속하는데 그 갈래가 한 번도 실행되지 않는 것은
  거짓 성공 계열이다(spec §2.4의 분류 기준). 인자 이름 오타 하나가 원인이며,
  고치는 쪽이 선언·문서·의도 셋 모두와 맞는다.
- **대체 기대 시험**: `src/tools/read/__tests__/getObjectInfo.test.ts`의
  「enrich가 실제로 채운다」 절 4건 — 기본값에서 `SearchObject`를 한 번 부르고
  설명·패키지를 채우는지 / `enrich:false`면 아예 부르지 않는지 / 이름이 다르면
  채우지 않는지 / 검색이 실패해도 트리는 나오는지.
- **비용**: `buildTree`가 불리는 노드마다(뿌리 + 재귀한 묶음 노드) 검색 왕복이
  하나씩 는다. 말단 잎에는 붙지 않으므로 증가는 깊이에 비례하지 잎 수에 비례하지
  않는다. 구가 의도했던 왕복 수와 같다.

### D36 — `type: 'json'` 콘텐츠 블록을 **규약대로 text로** 싣는다

- **분류**: 수리
- **구 동작(실측)**: 이 묶음의 다섯 도구가 성공 응답을 `{ type: 'json', json: … }`로
  실었다 — `GetTypeInfo`(`handleGetTypeInfo.ts:230`·`:249`) ·
  `GetWhereUsed`(`handleGetWhereUsed.ts:102-110`) ·
  `GetObjectInfo`(`handleGetObjectInfo.ts:285-293`) ·
  `GetTransaction`(`handleGetTransaction.ts:73-76`) ·
  `GetAbapSystemSymbols`(`handleGetAbapSystemSymbols.ts`의 성공 반환).
  **`json`은 MCP 규약의 콘텐츠 종류가 아니다** — 규약이 정한 것은 `text`·`image`·
  `audio`·`resource`(+`resource_link`)뿐이라, 이 블록을 받은 클라이언트는 본문을
  꺼낼 표준 통로가 없다.
- **신 동작**: 같은 객체를 `JSON.stringify`한 문자열을 `type: 'text'` 블록 하나에
  싣는다. **필드 이름·구조·값은 그대로**이고 담는 그릇만 규약에 맞춘다.
- **근거**: 신 엔진의 도구 반환 계약(`src/server/toolDefinition.ts`의
  `ToolTextContent`)에는 `text`뿐이라 구의 모양을 표현할 통로 자체가 없다. 규약 밖
  블록을 되살리려면 계약을 넓혀야 하는데, 그것은 "규약을 지키지 않는 쪽으로"
  넓히는 일이다. 같은 묶음의 `DescribeByList`는 구도 `type: 'text'`를 썼으므로
  이 항목에 해당하지 않는다.
- **대체 기대 시험**: 각 도구의 계약 시험이 응답 본문을 `JSON.parse`해 필드를
  대조한다 — `src/tools/read/__tests__/getTypeInfo.test.ts` ·
  `getWhereUsed.test.ts` · `getObjectInfo.test.ts` · `getTransaction.test.ts` ·
  `getAbapSystemSymbols.test.ts`. 구조가 보존됐다는 것이 그 대조의 내용이다.
- **비고**: 도구 응답 시퀀스에 나타나는 차이이므로 재생 대조 대상이다.
  **`harness/replay/divergences.ts`(기계가 읽는 형태)에는 아직 옮기지 않았다** —
  이 과제의 작업 범위가 그 파일을 제외했다. D33도 같다. 재생을 켜기 전에 두
  항목을 그쪽에 옮겨야 한다.

### D37 — `GetAbapSystemSymbols`의 **인터페이스 보강**이 아직 없다

- **분류**: 축소
- **구 동작(실측)**: 심볼 종류가 `interface`이면
  `engine/src/handlers/system/readonly/handleGetAbapSystemSymbols.ts:646-710`이
  `handleGetInterface`(`handlers/interface/high/`)를 부른다. 성공하면
  `{ exists: true, objectType: 'INTF', description: …, package: … }`인데,
  `GetInterface`가 싣는 필드는 `success`·`interface_name`·`version`·`source_code`·
  `status`·`status_text`뿐이라(구 `handleGetInterface.ts:108-114`)
  `description`·`packageName`은 **언제나 폴백**(`ABAP Interface {이름}` ·
  `Unknown`)이다. 즉 이 갈래가 실제로 알아내는 것은 **"그 인터페이스를 읽을 수
  있었다"** 하나뿐이다.
- **신 동작**: SAP에 묻지 않고
  `{ exists: false, objectType: 'INTF', error: 'Interface resolution is not
  available yet: this engine does not implement GetInterface. …' }`를 돌려준다.
  나머지 종류(클래스·함수·그 밖)는 구와 같다.
- **근거**: `GetInterface`는 **아직 신 엔진에 없는 도구**이고 이 묶음(system·common)의
  범위 밖이다. 그 도구의 와이어를 이 모듈 안에서 새로 지으면 나중에 진짜
  `GetInterface`가 지어질 때 **두 벌이 갈린다** — 같은 오브젝트를 읽는 경로가
  둘이 되는 것은 이 판이 피하려는 바로 그 모양이다. 추측으로 짓지 않고 무엇이
  없는지 밝히는 쪽을 골랐다.
- **대체 기대 시험**: `src/tools/read/__tests__/getAbapSystemSymbols.test.ts`의
  「인터페이스 보강 — 이 판에서 축소됐다」 절 — SAP에 묻지 않는다는 것과 문구를
  붙잡는다. 클래스·함수·그 밖 갈래가 구와 같다는 것은 같은 파일의 나머지 절이 본다.
- **해소 마일스톤**: **`GetInterface`를 짓는 판.** 그 도구가 등록되면
  `resolveInterfaceSymbol`을 구와 같은 모양(`exists`만 실질적으로 의미 있는)으로
  되살리고 이 항목을 닫는다. 그때 위의 "폴백이 언제나 나간다"는 실측도 함께
  옮겨 적어야 한다 — 되살린다고 해서 설명·패키지가 채워지지는 않는다.

### D38 — `ReloadProfile`이 실패해도 **옛 프로파일로 되돌아가지 않는다**

- **분류**: 강화
- **구 동작(실측)**: `activateProfile()`은 `loadActiveProfile()` → `applyProfile()`
  순서이고, **던지는 자리가 `applyProfile` 앞**이다
  (`engine/src/lib/profile.ts:301-305`). 포인터가 없는 프로파일을 가리키면
  `loadActiveProfile`이 `Active profile "x" points to a missing env file: …`로
  던지고(`:213-217`), `resolveHomeDir`는 `PROFILE_NOT_FOUND`/`ENV_INVALID`
  `ProfilePathError`로 던진다(`:160-181`). 그 예외는 핸들러의 `catch`가
  `return_error`로 접고(`handleReloadProfile.ts:78-81`), **모듈 캐시 `activeTier`도
  `process.env.SAP_*`도 접속 캐시도 그대로 남는다** — 즉 재적재에 실패한 서버는
  옛 프로파일의 권한과 옛 접속을 계속 쓴다.
- **신 동작**: 실패는 상태다. `ProfileSession.reload()`가 **접속을 먼저 버리고**
  다시 해석하며, 프로파일 계층이 못 찾으면 그 결과가 곧 새 상태가 된다 —
  무접속 · `tier=UNKNOWN` · `sourcePath=null`, 이유는 `diagnostics`로. 해석기가
  예외로 끝나면 `sealedStartup`이 거기에 **잠긴 blocklist**(`readBlocklistConfig({})`)
  까지 얹어 봉인하고, 도구는 그 사실을 오류로 알린다.
- **근거**: 이 도구는 기동 뒤 tier를 바꿀 수 있는 유일한 통로다. 운영자가
  프로파일을 바꾸려다 실패했을 때 **옛 권한이 조용히 유지되는 쪽**과 **아무것도
  못 하는 쪽** 중 안전 바닥선은 후자다. 앞쪽은 "PRD로 옮겼다고 믿는 사람이
  DEV에 쓰는" 자리이자 D16·D17이 막아 둔 사고(운영자가 고르지 않은 시스템에
  붙는 것)의 되돌이다.
- **대체 기대 시험**: `src/server/__tests__/session.test.ts`의
  「재적재 실패는 옛 상태로 조용히 되돌아가지 않는다」 2건 ·
  `src/tools/runtime/__tests__/reloadProfile.test.ts`의
  「가리킨 프로파일이 없으면 무접속·UNKNOWN을 **이유와 함께** 보고한다」.
- **⚠️ 재생 대조에 주는 경고**: 실패 갈래의 응답 모양이 구와 다르다(구는 오류,
  신은 `ok:true` + `tier:UNKNOWN`). 기계용 장부(`harness/replay/divergences.ts`)에
  옮기는 일은 **그 파일을 소유한 작업의 몫**이다 — 이 판의 T32b 작업은 그 파일을
  건드리지 않았다(D34가 같은 이유로 남긴 선례).

### D39 — `restartRequired`가 가리키는 제약이 바뀌었다 (구: 접속을 못 되살림 → 신: 도구 목록이 낡음)

- **분류**: 수리
- **구 동작(실측)**: 무접속 기동에서 런처가 mock 브로커를 만들고 `global`에
  `__mcpAbapAdtInspectionOnly = true`를 찍는다
  (`engine/src/server/launcher.ts:380-403`). 그 브로커를 `StdioServer`가 프로세스
  수명 내내 붙잡으므로 **`ReloadProfile`은 접속을 되살릴 수 없고**, 그래서
  `restartRequired: true` + 재시동 안내를 낸다
  (`handleReloadProfile.ts:42,66-72`). 구 시험이 그 정직함을 못박고 있다
  (`engine/src/__tests__/handlers/system/handleReloadProfile.test.ts`).
- **신 동작**: 그 제약이 없다. 접속은 `ProfileSession.getConnection()`이 게으르게
  만들고 재적재가 캐시를 버리므로, 무접속으로 뜬 서버도 재적재 한 번으로 접속을
  얻는다. 대신 이 프로세스가 **정말로 못 고치는 것 하나**를 그 자리에 보고한다 —
  `tools/list`는 기동 시점의 배포 축(`SAP_SYSTEM_TYPE`)으로 지어져 전송에 붙기
  전에 확정되므로, 재적재가 다른 축의 프로파일을 물어 오면 목록이 낡는다.
  그때 `restartRequired: true` + `note`가 나간다. tier·blocklist·접속은 이미
  새 값으로 발효돼 있고, 낡은 것은 목록뿐이라는 것도 `note`가 밝힌다.
- **근거**: 구의 조건을 글자대로 옮기면 **없는 제약을 보고**해 불필요한 재시동을
  시킨다. 반대로 이 필드를 항상 `false`로 두면 진짜 재시동이 필요한 유일한
  경우가 침묵한다. 발행 `description`은 채록본 글자 그대로 두었으므로(하드 게이트 3)
  그 문장의 조건절과 실제 발동 조건이 어긋난다 — 그것이 이 항목을 등재하는
  이유다.
- **대체 기대 시험**: `src/tools/runtime/__tests__/reloadProfile.test.ts`의
  「배포 축이 바뀌면 restartRequired=true와 그 이유를 싣는다」 ·
  `src/server/__tests__/session.test.ts`의
  「배포 축이 바뀌어도 `tools/list`는 기동 시점 그대로다」.
- **해소 자리**: 발행 `description`을 손댈 수 있는 판(= 채록본 자체를 다시 뜨는
  판). 그전에는 문장이 정본이고 이 항목이 그 각주다.

### D40 — `ReloadProfile` 응답에 `diagnostics`를 싣는다

- **분류**: 강화
- **구 동작(실측)**: 구는 "왜 이 상태인가"를 **예외로만** 알렸다 —
  `loadActiveProfile`이 던진 문구가 `return_error`로 접혀 나가고, 성공 응답에는
  이유를 담을 자리가 없다(`handleReloadProfile.ts:54-77`의 키 목록).
- **신 동작**: 성공 응답에 `diagnostics: string[]`(= `profile.diagnostics`)을
  더한다. 나머지 키는 구 그대로다.
- **근거**: 신 엔진의 프로파일 계층은 **던지지 않는다** — 못 찾음·읽기 실패·
  자격증명 부족·tier 미해석이 전부 `connection: null` + 진단 문구로 끝난다
  (`src/profile/resolve.ts` 머리주석). 그 문구를 싣지 않으면 재적재가 조용히
  아무것도 아닌 상태로 끝나는 것처럼 보이고, D38이 일부러 만든 "실패는
  상태다"라는 계약이 응답에서 사라진다.
- **대체 기대 시험**: `src/tools/runtime/__tests__/reloadProfile.test.ts`의
  「구가 싣던 키를 그대로 싣는다」(정상 경로에서 빈 배열) ·
  「가리킨 프로파일이 없으면 무접속·UNKNOWN을 **이유와 함께** 보고한다」.
- **비고**: 키가 하나 **느는** 방향이므로 구의 키를 읽던 소비자는 그대로 돈다.
  기계용 장부로 옮기는 일은 D38과 같은 이유로 그 파일을 소유한 작업의 몫이다.

### D76 — 인핸스먼트 묶음의 GET에 **본문을 싣지 않는다** (구: `{"Accept":…}` JSON 본문)

- **분류**: 수리
- **구 동작(실측)**: 인핸스먼트 세 핸들러는 `Accept` 헤더를 주려고
  `{ Accept: '…' }`를 넘기는데, **그 자리가 헤더 자리가 아니다.**
  `makeAdtRequestWithTimeout`의 시그니처는
  `(connection, url, method, timeoutType, data, params, headers)`이므로
  (`engine/src/lib/utils.ts:902-910`) 다섯째 인자는 `data`다. 어긋난 호출 다섯:
  - `handleGetEnhancements.ts:171-179`(클래스 판별 · `…oo.classes.v4+xml`)
  - `handleGetEnhancements.ts:196-204`(프로그램 판별 · `…programs.v3+xml`)
  - `handleGetEnhancements.ts:220-228`(인클루드 판별 · `…programs.includes.v2+xml`)
  - `handleGetEnhancementSpot.ts:150-158`(스팟 · `…enhancements.v1+xml`)
  - `handleGetEnhancementImpl.ts:174-182`(스팟 폴백 · `…enhancements.v1+xml`)

  **구 트리 전체에서 이 어긋남은 이 다섯뿐이다.** 헤더를 제대로 넘기는 호출은
  `undefined, undefined`를 끼워 일곱째에 놓는다(예:
  `engine/src/handlers/atc/readonly/handleGetAtcFindings.ts:107-117`·`:138-146`).
  그래서 구가 실제로 보낸 것은 둘이다 —
  ⑴ `Accept`는 접속 계층 기본값(`@babamba2/mcp-abap-connection/dist/connection/
  AbstractAbapConnection.js:160-165` — 호출자가 안 주면 붙는 값), ⑵ **GET인데
  `requestConfig.data`가 채워진다**(`:217-219`는 메서드를 보지 않는다). axios는
  평범한 객체를 JSON으로 직렬화하므로 `{"Accept":"application/vnd.sap.adt.…"}`가
  GET 본문으로 나간다.
- **신 동작**: ⑴은 **그대로 둔다** — 신 엔진의 `DEFAULT_ACCEPT`
  (`src/adt/client.ts:51`)가 구 기본값과 같은 문자열이라 와이어가 일치한다.
  ⑵만 하지 않는다. 다섯 요청 전부 본문 없이 나간다.
- **근거**: 소스에 적힌 vnd `Accept`를 **되살리는** 쪽은 이식이 아니라 새 기능이다
  (`GetTransaction`의 주석 처리된 구현을 되살리지 않은 것과 같은 판단). 그 헤더가
  실제로 나갔을 때 SAP이 무엇을 돌려주는지 이 판은 확인할 근거가 없고, 릴리스가
  그 표현을 모르면 구는 200이던 자리에서 신은 406이 된다. 반대로 GET 본문은
  **되살릴 이유가 없다** — 구가 의도한 적 없는 부작용이고, 서버·프록시가 거부할
  수 있으며, ADT가 읽지도 않는다.
- **대체 기대 시험**: 세 도구의 계약 시험이 「D76」으로 이름 붙은 절을 갖는다 —
  `src/tools/read/__tests__/getEnhancementSpot.test.ts`(2건: 기본 Accept가 나가고
  vnd가 아니다 / 본문·Content-Type이 없다) ·
  `getEnhancementImpl.test.ts`(2건: 본선·폴백 각각) ·
  `getEnhancements.test.ts`(1건: 판별 왕복 셋 전부).
- **⚠️ 기계 장부 미반영**: 요청 본문이 달라지므로 재생 대조에 나타난다 →
  `harness/replay/divergences.ts`에 와야 한다. 이 과제의 범위가 그 파일을
  제외해(묶음 8개 동시 제작) **옮기지 못했다.** 재생을 켜기 전에 옮겨야 한다.

### D77 — 인핸스먼트 두 도구의 `type: 'json'` 블록을 **규약대로 text로** (D36의 같은 규칙)

- **분류**: 수리
- **구 동작(실측)**: `GetEnhancementSpot`(`handleGetEnhancementSpot.ts:169-177`)과
  `GetEnhancementImpl`(`handleGetEnhancementImpl.ts:153-161`·`:194-208`)이 성공
  응답을 `{ type: 'json', json: … }`로 실었다. 같은 묶음의 `GetEnhancements`는
  구도 `type: 'text'`였다(`handleGetEnhancements.ts:662-670`) — 이 항목 밖이다.
- **신 동작**: 같은 객체를 `JSON.stringify`한 문자열을 `type: 'text'` 블록 하나에
  싣는다. 필드 이름·구조·값은 그대로다.
- **근거**: D36과 **같은 규칙의 새 적용**이다 — `json`은 MCP 규약의 콘텐츠 종류가
  아니고(`text`·`image`·`audio`·`resource`뿐), 신 엔진의 `ToolTextContent`에는
  그것을 표현할 통로가 없다. D36 본문은 append-only라 고치지 않고 여기 새로 적는다.
- **대체 기대 시험**: `src/tools/read/__tests__/getEnhancementSpot.test.ts`의
  「D36 — 구의 `type: json` 블록을 규약대로 text 하나에 싣는다」 ·
  `getEnhancementImpl.test.ts`의 「소스 꺼내기」·「폴백」 절 전량(응답 본문을
  `JSON.parse`해 구의 필드와 대조한다).
- **⚠️ 기계 장부 미반영**: D36과 같은 이유로 재생 대조 대상이지만, 이 과제의
  범위가 `harness/replay/**`를 제외했다.
### D66 — `UpdateView`가 활성화 **거짓 성공**을 성공으로 접지 않는다

- **분류**: 수리
- **구 동작(실측)**: SAP은 활성화 실패도 **HTTP 200**으로 답하며 본문의
  `<chkl:msg type="E">`에 이유를 담는다. 구 핸들러는 그 메시지를
  `activationWarnings` 배열에 담기만 하고 `success: true` · `activated: true`로
  응답한다(`engine/src/handlers/view/high/handleUpdateView.ts:184-213` — `msg`를
  `type: text` 문자열로 접는 자리에 오류/경고 구분이 없다). 즉 **활성화되지 않은
  뷰가 "updated and activated successfully"로 보고된다.**
- **신 동작**: 활성화 응답의 `E`/`A`/`X` 메시지를 실패로 판정해 오류로 되돌린다.
  문구에 모든 오류를 줄번호와 함께 담고, "DDL 소스는 인액티브 버전으로 SAP에
  올라가 있고 활성 버전은 그대로"라는 사실을 함께 적는다. 경고만 있으면 구와
  같이 성공이고 `activation_warnings`도 구와 같은 `"<type>: <text>"` 모양이다.
- **근거**: 사전 등재 D2(`UpdateLocalTypes` — `activate_on_update:true`에서 거짓
  성공)와 **같은 계열**이며, 이 레포의 CLAS 거짓 성공 실증 이력이 근거다. 판정
  자리는 이미 `src/tools/write/shared.ts`의 `parseActivationMessages` ·
  `activationErrors`에 하나로 모여 있고, `UpdateProgram`이 같은 판정을 한다 —
  뷰만 예외로 두면 같은 표면 안에서 안전 바닥선이 도구마다 달라진다.
- **대체 기대 시험**: `src/tools/write/__tests__/updateView.test.ts`의
  「D66 — 200에 실려 온 활성화 오류를 성공으로 접지 않는다」 ·
  「경고만 있는 활성화는 성공이고 문구가 그대로 실린다」(구 동작이 유지되는
  쪽을 함께 못박는다) · 「활성화 왕복 자체가 실패하면 구의 계약 문구로
  올라간다」.
- **해소 마일스톤**: 없음 — 영구 차이(수리)다.
- **비고 (기계 장부 미반영)**: 이 항목은 **와이어가 아니라 도구 응답**이
  달라지므로 `harness/replay/divergences.ts`에도 와야 한다. 뷰 묶음 과제는
  `harness/replay/**`가 무접촉이라 옮기지 못했다 — 묶음 병합 뒤 오케스트레이터가
  한 번에 옮긴다. 옮기기 전에 재생을 켜면 이 갈래가 가짜 실패로 잡힌다.
### D71 — 생성 페이로드에 `adtcore:masterSystem`·`adtcore:responsible`을 싣지 않는다

- **분류**: 축소 — **해소 마일스톤 = 시스템 컨텍스트(마스터 시스템·담당자) 계층을
  짓는 판**
- **구 동작(실측)**: `create.js:36-48`이 두 속성을 조건부로 붙이고, 값은
  `AdtClient`의 `systemContext`에서 온다(`clients/AdtClient.js:91-93` ←
  `engine/src/lib/clients.ts:20-24`). 그 컨텍스트는 stdio 기동에서 접속마다 실제로
  해석되며(`engine/src/server/BaseMcpServer.ts:146` · `:324`),
  `responsible`은 `SAP_RESPONSIBLE || SAP_USERNAME`으로 떨어지므로
  (`engine/src/lib/systemContext.ts:64-66`) **실전에서는 거의 언제나 채워진
  채로 나갔다.**
- **신 동작**: 두 속성 없이 보낸다. 신 엔진에는 그 컨텍스트 계층 자체가 없다.
- **근거**: 시스템 컨텍스트는 도구 하나의 문제가 아니라 접속 계층의 기능이고,
  이 묶음 안에서 새로 지으면 나중에 진짜 계층이 생길 때 두 벌이 갈린다. 추측으로
  값을 지어내는 대신 무엇이 없는지를 밝히는 쪽을 골랐다.
- **대체 기대 시험**: `src/tools/write/__tests__/createInterface.test.ts`의
  「로그온 언어를 물어본 뒤 생성 POST를 보내고 껍데기를 검사한다」 — 페이로드
  전문을 글자로 견주므로 **무엇을 보내고 무엇을 안 보내는지가 그 한 줄에
  드러난다.**
- **비고**: 이미 지어진 `CreateProgram`·`CreateInclude`도 같은 구멍을 갖고 있고
  (`src/tools/write/createProgram.ts`의 페이로드 조립) 등재된 적이 없다. 이
  항목이 그 구멍의 첫 등재이며, 해소는 세 도구를 함께 본다.
- **기계 장부**: **미반영** — 이 과제는 `harness/replay/**`가 무접촉이다.
  와이어(요청 본문) 차이이므로 묶음 병합 뒤 옮겨야 한다.

### D72 — `UpdateInterface`의 UNLOCK을 **잠근 자리와 같은 URI로** 보낸다

- **분류**: 수리
- **구 동작(실측)**: 인터페이스 계열은 단계마다 URI 대소문자 규칙이 다르다.
  LOCK은 `/sap/bc/adt/oo/interfaces/{encodeSapObjectName(이름).toLowerCase()}`
  (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/interface/lock.js:16`),
  UNLOCK은 소문자화 없이 `{encodeSapObjectName(이름)}`
  (`core/interface/unlock.js:14`)이다. 핸들러가 이름을 대문자로 올려 두므로
  (`engine/src/handlers/interface/high/handleUpdateInterface.ts:88`) 구는 **소문자
  URI에 걸고 대문자 URI에서 푼다.** 클래스 계열은 두 자리 모두 소문자라
  (`core/class/lock.js:19` · `core/class/unlock.js:17`) 이 갈라짐은 인터페이스
  고유다.
- **신 동작**: 잠금 수명주기는 접속 계층이 소유한다(`src/adt/client.ts`의
  `withLock`/`lock`/`unlock`). 그 계약은 실패 경로에서도 해제를 보장하고 미해제
  잠금을 `activeLocks()`로 드러내는데, 그러려면 **잠근 자리와 푸는 자리가 같은
  문자열**이라야 한다. 그래서 UNLOCK도 소문자 URI로 나간다. **PUT은 구대로
  대문자 URI를 그대로 쓴다**(`core/interface/update.js:16`) — 여섯 자리 중 이
  하나만 다르다.
- **근거**: 잠금 대장의 키를 URI로 두는 것이 누수 탐지의 근거이고, 그것을
  단계별 대소문자 규칙에 맞춰 흔들면 `activeLocks()`가 영원히 비지 않는다 —
  해제에 성공해도 대장에서 지워지지 않기 때문이다. ADT는 오브젝트 이름 구간의
  대소문자를 가리지 않으며(구 엔진이 두 규칙을 섞어 쓰고도 동작했다), 해제의
  실효 열쇠는 URI가 아니라 `lockHandle`이다.
- **대체 기대 시험**: `src/tools/write/__tests__/updateInterface.test.ts`의
  「잠금 → 사전검사 → PUT → 해제 → 사후검사 순으로 나간다」(다섯 요청의 경로를
  대소문자까지 글자로 못박는다) · 「사전검사가 실패하면 PUT을 보내지 않고 잠금을
  푼다」(실패 경로의 해제와 `activeLocks()` 0).
- **기계 장부**: **미반영.** 이 과제는 `harness/replay/**`가 무접촉이다.
  와이어(요청 주소) 차이이므로 묶음 병합 뒤 옮겨야 한다.

### D73 — `UpdateInterface`가 **활성화 실패를 성공으로 접지 않는다**

- **분류**: 수리
- **구 동작(실측)**: 활성화 응답을 파싱해 `<chkl:msg>`를 전부
  `activation_warnings`로 옮기고(`handleUpdateInterface.ts:232-253`), **`type="E"`가
  섞여 있어도** `success: true` · `activated: true`로 답한다(`:271-282`). SAP은
  활성화 실패도 HTTP 200으로 돌려주므로(응답 본문에 `E` 메시지) 이 갈래는
  "깨진 인터페이스가 「활성화됨」으로 보고되는" 자리다.
- **신 동작**: 활성화 응답의 `E`/`A`/`X`를 실패로 판정해 오류로 올린다. 문구에
  모든 실패를 줄번호와 함께 담고, **소스는 inactive 판으로 SAP에 올라가 있으며
  active 판은 그대로**라는 사실을 함께 알린다. `E`가 아닌 메시지는 구대로
  `activation_warnings`에 실린다.
- **근거**: 이 레포에는 같은 모양의 CLAS 거짓 성공 실증 이력이 있고, 그래서
  `src/tools/write/shared.ts`가 활성화 응답 판정을 한 자리에 모아 두었다.
  안전 바닥선은 낮출 수 없다(하드 게이트 4). 방향도 "성공을 실패로" 쪽이라
  없는 권한을 여는 종류가 아니다.
- **대체 기대 시험**: `src/tools/write/__tests__/updateInterface.test.ts`의
  「활성화가 E를 담아 200으로 오면 실패로 보고한다 (D73)」 ·
  「활성화 경고(E가 아닌 것)는 activation_warnings로 실린다」(구 갈래가 살아
  있는지를 함께 본다).
- **기계 장부**: **미반영** — D72와 같은 이유. 도구 응답이 달라지는 차이다.
### D61 — 데이터 엘리먼트·도메인의 **ECC OData 우회로가 없다** (조용히 ADT로 흘리지 않고 거절한다)

- **분류**: 축소 — **해소 마일스톤 = `src/rfc`에 DDIC FunctionImport 4종을 여는
  마일스톤**(테이블 묶음이 이미 연 `callDdicTablRead`와 같은 자리). 그 넷이 열리면
  이 항목은 닫힌다.
- **적용 도구 4종**: `GetDataElement` · `GetDomain` · `CreateDataElement` ·
  `CreateDomain`. (`ReadDataElement`·`ReadDomain`은 구에도 우회로가 없어 해당 없음.)
- **구 동작(실측)**: 네 핸들러 모두 `process.env.SAP_VERSION?.toUpperCase() === 'ECC'`
  하나로 갈라져 OData 브리지를 탄다 —
  `engine/src/handlers/data_element/high/handleGetDataElement.ts:70-100` ·
  `handleCreateDataElement.ts:180-182,348-436` ·
  `engine/src/handlers/domain/high/handleGetDomain.ts:69-97` ·
  `handleCreateDomain.ts:167-169,356-433`. ECC 커널(BASIS < 7.50)에는
  `/sap/bc/adt/ddic/dataelements`·`/sap/bc/adt/ddic/domains` 엔드포인트가 **아예
  없기** 때문이다. 브리지가 부르는 것은 FunctionImport `DdicDtelRead` ·
  `DdicDomaRead` · `DdicDtel` · `DdicDoma`(+ `DdicActivate`)이고, 그 정의는
  `engine/src/lib/odataRfc.ts:390-460,601-660` · 선택기는
  `engine/src/lib/rfcBackend.ts:107-153`에 있다.
- **신 동작**: `SAP_VERSION=ECC`면 **접속을 만들기 전에 거절한다.** 문구가 빠진
  브리지 함수모듈 이름과 이 항목 번호(D61)를 지목한다.
- **근거**: 신 엔진의 RFC 분배층이 지금 갖고 있는 DDIC 능력은
  `callDdicTablRead` 하나뿐이다(`src/rfc/types.ts:62-78` — 그 인터페이스가 왜
  `RfcChannel`이 아닌 별도 능력인지까지 적혀 있다). 나머지 넷을 여는 일은
  `src/rfc/**`를 고치는 작업이고 이 묶음 과제의 무접촉 구역이다.
  **조용히 ADT로 흘려보내지 않는 이유**: ECC에서는 그 요청이 404가 되는데, 그
  404는 "오브젝트가 없다"로 읽힌다 — 없는 것은 오브젝트가 아니라 엔드포인트다.
  `Create*` 쪽은 한술 더 떠 **없는 엔드포인트에 쓰기를 시도**하게 된다.
  틀린 답보다 못 한다는 말이 낫다.
- **대체 기대 시험**: 거절이 실제로 일어나고 **SAP 호출이 하나도 나가지 않는지**를
  네 도구가 각각 못 박는다 —
  `src/tools/read/__tests__/getDataElement.test.ts`의 「ECC 갈림」 ·
  `src/tools/read/__tests__/getDomain.test.ts`의 「ECC 갈림」 ·
  `src/tools/write/__tests__/createDataElement.test.ts`의 「갈래」 ·
  `src/tools/write/__tests__/createDomain.test.ts`의 「갈래」.
  갈림 판정이 구와 같이 **trim 하지 않는다**는 것(`' ECC '`는 갈리지 않는다)도
  같은 절이 잡는다.
- **기계 장부 미반영**: 이 묶음 과제는 `harness/replay/**`가 무접촉이라
  `divergences.ts`에 옮기지 못했다. **와이어와 도구 응답이 둘 다 달라지므로 기계
  장부에도 와야 하는 항목**이다 — 묶음 병합 뒤 오케스트레이터가 옮긴다.

### D62 — 생성 페이로드의 `masterSystem`·`responsible`을 **env에서만** 읽는다

- **분류**: 축소 — **해소 마일스톤 = 시스템 문맥 해석을 서버 기동에 붙이는 자리**
  (지금은 그럴 계층 자체가 없다).
- **구 동작(실측)**: 구는 기동 때 `resolveSystemContext`로 한 번 풀어 캐시하고
  (`engine/src/server/BaseMcpServer.ts:146,324`), 그 값을 `createAdtClient`가
  생성 페이로드에 실어 준다(`engine/src/lib/clients.ts:20-31`). 해석 순서는
  ⑴ HTTP 헤더 override ⑵ `SAP_MASTER_SYSTEM` / (`SAP_RESPONSIBLE` ||
  `SAP_USERNAME`) ⑶ 그래도 없으면 `getSystemInformation(connection)`의
  `systemID`·`userName`이다(`engine/src/lib/systemContext.ts:45-86`).
- **신 동작**: ⑵만 짓는다 — `context.env`에서 `SAP_MASTER_SYSTEM` ·
  (`SAP_RESPONSIBLE` || `SAP_USERNAME`)을 읽고, 없으면 빈 값이다
  (`src/tools/write/dataElementDomainCreate.ts`의 `systemContextOf`).
- **근거**: ⑴은 HTTP 전송의 헤더 통로에 묶여 있고(그 통로 자체가 D30으로 이미
  축소돼 있다), ⑶은 해석된 프로파일에 `SAP_USERNAME`이 반드시 있으므로 실사용에서
  걸리지 않는다 — 즉 실제로 관찰되는 경로는 ⑵ 하나다. 없는 계층을 이 묶음에서
  새로 세우는 것은 범위 밖이다.
- **대체 기대 시험**: 두 사슬이 이 값을 **어떻게 다르게 싣는지**를 못 박는다 —
  `src/tools/write/__tests__/createDataElement.test.ts`의
  「`adtcore:responsible`은 값이 없어도 빈 속성으로 실린다」·「SAP_USERNAME이
  있으면 responsible에 실린다」 ·
  `src/tools/write/__tests__/createDomain.test.ts`의
  「`adtcore:responsible`은 값이 없으면 **속성 자체가 빠진다**」.
- **기계 장부 미반영**: 생성 POST의 본문이 달라질 수 있으므로 **와이어 차이**다.
  위와 같은 이유로 옮기지 못했다.

## 등재하지 않고 **구 동작에 맞춘 것** (해소 완료 — 기록만)

리뷰에서 차이로 잡혔지만 **유지할 이유가 없어** 구 동작으로 되돌린 것들.
여기 남기는 이유는 "왜 등재가 아닌가"와 "무엇을 이미 확인했는가"를 남기기
위해서다. 전부 물결 1에서 해소됐고 각 항목에 못박는 시험이 붙어 있다.

- **클라이언트 번호 전달 통로** — `X-SAP-Client` 헤더 + 응답마다
  `sap-usercontext`를 `sap-client=<client>`로 고정
  (`AbstractAbapConnection.js:131`·`532-537`). 쿠키 고정이 없으면 SAP이 기본
  클라이언트로 라우팅해 **write가 403**이 된다는 실증 주석이 구 소스에 달려 있다.
- **`sap-language`를 ADT 요청에 싣지 않는다** — 구는 보내지 않는다. 보내면
  메시지 텍스트 언어가 달라져 정규화 후에도 차이가 남는다.
- **CSRF 취득의 폴백 엔드포인트·유한 재시도·"토큰 없이 보내고 403에서 회복"** —
  `/sap/bc/adt/core/discovery`가 없는 구형 시스템(BASIS 7.52 미만)에서 구는
  성공하고 신은 실패했다.
- **`GET` 401에서 쿠키 회수 후 1회 재시도.**
- **stateful 동반 헤더** `sap-adt-request-id`(요청마다 새 값)·
  `X-sap-adt-profiling: server-time`.
- **CSRF 취득 요청에는 `x-sap-adt-sessiontype`을 싣지 않는다.**
- **사전 CSRF 취득 대상은 POST/PUT/DELETE만** — PATCH는 403 재시도로만 회복.
- **집계 전용(aggregate-only) 판정은 원문으로** — 주석을 지운 뒤 판정하면
  `SELECT COUNT(*) /*x*/ FROM KNA1`이 차단에서 빠진다(느슨해지는 방향).
- **마스킹의 실데이터 판정이 구 번들의 실제 응답 형태를 본다** — 구는 행 데이터를
  배열 노드가 아니라 **text 콘텐츠 안의 pretty-print JSON**으로 돌려준다
  (`engine/src/handlers/table/readonly/handleGetTableContents.ts:91-99`).
  배열 노드만 보면 하드 게이트 4의 유일한 기계 방어선이 정확히 그 2종 도구에
  대해 눈이 멀었다.

## C1(attended 녹화)에서 확인할 것

기계로는 여기까지가 한계인 항목들. 실 SAP 접속이 붙는 자리에서 확인한다.

- **잠금 보유 중 CSRF 재취득이 stateless로 나가는 것** — 구 동작을 그대로
  승계했지만, 잠금과 세션 사이의 상호작용은 실기에서만 확정된다.
- **D8의 축소분 3종**(406/415 재협상 · 추가 폴백·리다이렉트 · `skipSessionType`)이
  실제로 발동하지 않는지.
- **클라이언트 쿠키 고정이 실제 write 경로에서 403을 막는지** — 구 소스 주석이
  근거이고, 재현은 아직 없다.

## 채록하지 않기로 한 경로 (커버리지 공백 — **차이가 아니다**)

등재 항목이 아니다. 여기 있는 것은 "신 엔진이 다르게 동작한다"가 아니라 **"그
경로에 증거가 없다"**이며, 위 표의 분류(수리·강화·축소) 어디에도 속하지 않는다.
D번호를 주지 않는 이유가 그것이다. 그래도 장부에 두는 이유는, 재생이 전부
`pass`인 것을 보고 **표면 전체가 증명됐다고 오해하는 것**을 막을 자리가 여기뿐이기
때문이다.

### `transport_request` 경로 — 이송 가능 패키지의 write

- **무엇이 비었나**: C1 write 시나리오는 **`$TMP`(로컬 오브젝트)** 안에서만 돈다.
  `$TMP`는 `transport_request`를 요구하지 않으므로, 그 인자가 실제로 실려 나가는
  갈래는 **한 번도 채록되지 않는다.** 해당 도구 6종: `CreateProgram`
  `CreateInclude` `UpdateProgram` `UpdateInclude` `UpdateClass`
  `UpdateSourceByPatch`.
- **왜 그렇게 정했나**: 이송 가능 패키지에 쓰려면 전용 DEV 연습 패키지와 이송
  권한이 선행돼야 하고, 그 자체가 P4(이송) 구간이다. `$TMP`는 그 선행 조건 없이
  P3 write 표면 전체를 열어 준다 — 구 번들 선언 자신이 명시한 길이다
  (`old-surface/m1-tools.json` — `CreateInclude.transport_request`: "Optional for
  local (`$TMP`) objects").
- **무엇을 잃는가**: 신 엔진이 `transport_request`를 구 엔진과 같은 방식으로
  전달·해석하는지는 재생 대조가 보증하지 못한다. 커버리지 표는 이 6종을 "증거
  있음"으로 셀 것이므로 — 단계 자체는 통과했으니 — **표만 봐서는 이 공백이
  드러나지 않는다.** 그것이 이 절이 있는 이유다.
- **해소 자리**: 교체(swap) 판정 전. 연습 패키지가 정해지면 같은 시나리오를
  `package_name`+`transport_request`로 한 벌 더 채록하는 것으로 닫힌다.

## 후속 정리 대기 (차이가 아니라 미완의 손질)

- **CSRF 재시도 값이 하나로 통일됐다** — 구는 사전 취득·401 경로에 (3회, 1초),
  403 이후 재취득에 (5회, 2초) 두 벌을 쓴다. 신은 (3회, 1초) 하나다. 최악의 경우
  도달 불가 호스트에서 대기 시간이 구와 다르게 쌓일 수 있다. 상한 검토 대상.
- **마스킹 위반 보고의 값 경로에 키 이름이 남는다** — 키 자리 위반은 `<key#N>`으로
  가리지만, 키가 비밀이면서 그 값도 위반을 내면 값 쪽 경로에 키가 남는다.
  범위 밖이라 손대지 않았다.

## 기계 장부 반영 기록 — D21~D40 판정 (append)

이 장부는 append-only다. 위 항목들의 본문은 그대로 두고, **어느 항목이
`harness/replay/divergences.ts`(기계가 읽는 형태)로 옮겨졌는지**를 여기 한 번에
적는다. D34·D36·D38·D40의 본문이 "옮기는 일은 그 파일을 소유한 작업의 몫"이라고
남긴 통로(`ADDING-A-TOOL.md` 부록 A)가 이것이고, **그 일은 끝났다.**

가름선: **와이어(요청 주소·전문·헤더)나 도구 응답이 달라지면 기계 장부에도 온다.**
진단 문구·내부 캐시·아직 안 지은 기능은 이 문서에만 남는다. 오류 문구 중
`MCP error -32602:` 같은 프로토콜 코드 조각은 예외다 —
`harness/replay/errorSignature.ts`의 `DEFAULT_CODE_RULES`가 `-32\d{3}`을 강한
신호로 쓰므로 **문구 차이가 아니라 와이어 차이**다.

| # | 기계 장부 | 근거 한 줄 |
|---|---|---|
| D21 | 안 옮김 | `native` RFC 통로 계층 — 통로 선택은 기동 설정이고 채록분 자체가 없다 |
| D22 | 안 옮김 | `zrfc` RFC 통로 계층 — 같은 이유. 실기 왕복 기록이 아직 없다 |
| D23 | 안 옮김 | destination 이름 검사 = 기동 계층. 도구 응답에는 접속 유무로만 비친다 |
| D24 | 안 옮김 | `--mcp` 폴백 잠금 = 기동 계층 |
| D25 | 안 옮김 | `AUTH_BROKER_PATH` 쪼개기 = 프로파일 계층 |
| D26 | 안 옮김 | HTTP 전송 계층. 채록·재생은 stdio로 돈다. `/mcp/health`는 도구 응답이 아니다 |
| D27 | 안 옮김 | 비루프백 바인딩 = 전송·기동 계층 |
| D28 | 안 옮김 | `--http-json-response` = 전송 계층 |
| D29 | 안 옮김 | `--transport=sse` 부재 = 기동 계층 |
| D30 | 안 옮김 | HTTP 헤더 접속 통로 부재 = 전송 계층. 도구 쪽 결과는 D18 어휘로 이미 등재됨 |
| D31 | 안 옮김 | SSE 바인딩 잠금 = 전송 계층 |
| D32 | 안 옮김 | 브로커 스위치 = 기동 계층. 이 문서 D32 본문이 이미 그렇게 적었다 |
| D33 | 안 옮김 | 캐시는 얹는 도구의 응답에 안 나타나고, 읽는 `GetObjectNodeFromCache`는 등록점에 없다 |
| D34 | **옮김** | 오류 문구의 `-32602`가 `errorSignature`의 엄격 신호라 `error-kind`로 떨어진다 |
| D35 | **옮김** | `enrich`가 실제로 채우므로 응답에 `OBJECT_DESCRIPTION`·`OBJECT_PACKAGE`가 는다 |
| D36 | **옮김** | 콘텐츠 블록의 그릇이 `json` → `text`로 바뀐다 (네 도구 · `GetObjectInfo`는 D35가 맡는다) |
| D37 | **옮김** | 인터페이스 심볼의 `systemInfo`가 `exists:true`에서 `exists:false`로 바뀐다 |
| D38 | **옮김** | 재적재 실패 갈래의 `isError`와 본문이 바뀐다 |
| D39 | **옮김** | 성공 응답의 `restartRequired` 값이 바뀐다 |
| D40 | **옮김** | 성공 응답에 `diagnostics` 키가 는다 |

**옮긴 일곱이 지키는 것**(정본은 `harness/replay/divergences.ts` 머리주석):

- `applies`는 서로 겹치지 않는다 — 러너는 첫 활성 항목 하나만 판정에 쓰므로,
  겹치면 배열 순서가 판정을 정하게 된다.
- 면제가 아니라 **재대조**다 — D34·D35·D36·D38·D39·D40은 대체 기대 시험 본체를
  들고 있고, 그 검사가 "등재된 자리 말고는 전부 같은가"를 다시 본다. 등재 밖의
  값이 달라지면 `allowlisted-fail`이다.
- D37만 **이연**이다(`check: null`). 축소분이 옳다는 것을 재생이 증명할 수는 없어
  판정 자리를 계약 시험에 둔다 — 재생은 그 단계를 통과가 아니라 **무증거**로 센다.

**아직 비어 있는 자리**(다음 판이 갚을 것): D34·D35·D36의 등재는 재생 대조가
증명하는 것이 "그릇과 등재된 자리 말고는 같다"까지다. 그 차이가 **옳다**는 증명은
각 도구의 계약 시험이 소유하고, 그 시험들은 이미 실재한다. 반면 **`ReloadProfile`은
성공 응답이 언제나 `diagnostics`만큼 달라지므로 요구 급 `재생 대조`를 원리상
채울 수 없다** — 그 도구의 요구 급을 다시 볼 자리는 제작 계획(`harness/build-plan.json`)
이고 이 과제의 범위 밖이다.

---

## 번호 예약 — 병렬 제작 구간 (기록)

오브젝트 묶음 13개를 병렬로 지으면서, 각 과제에 **D 번호 구간을 미리 나눠 줬다.**
같은 물결의 과제들이 동시에 append 하면 매번 같은 번호를 집어 병합 때마다 재번호가
필요했기 때문이다(D21·D31이 실제로 그렇게 겹쳤다).

그래서 **이 아래로는 번호에 빈칸이 있다.** 예약 구간을 다 쓰지 않은 과제가 남긴
자리이며, 결번은 누락이 아니다. 장부는 append-only이므로 나중에 당겨 메우지 않는다.

| 과제 | 예약 구간 |
|---|---|
| class | D41~D45 |
| program · include | D46~D50 |
| function-module · function-group | D51~D55 |
| table · structure | D56~D60 |
| data-element · domain | D61~D65 |
| view | D66~D70 |
| interface | D71~D75 |
| enhancement | D76~D80 |
| package · transport | D81~D85 |
| unit-test · atc | D86~D90 |
| text-element · screen · gui-status | D91~D97 |
| behavior-definition · behavior-implementation | D98~D102 |
| service-definition · service-binding · metadata-extension | D103~D108 |
