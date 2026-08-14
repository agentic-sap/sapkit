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
| D3 | `GetIncludesList` | 13-13 — `INCLUDE … IF FOUND`의 비실재 객체명 반환 | 수리 | **활성**(아래 「D3 활성화」) |

근거: `HANDOFF.md` §6 항목 13의 하위 13-9·13-11·13-13 · 결정 기록 D-079 ⑤.
대체 기대 시험: D1 = WHERE가 결과에 실제 반영됨을 검증하는 시험(실데이터 도구
작업이 소유). D2는 해당 도구를 짓는 마일스톤에서 활성화한다.

### D3 활성화 — `GetIncludesList`를 지으면서

- **활성화 시점**: 인클루드 묶음(build-plan 순서 5)에서 `GetIncludesList`를 지은 판.
  휴면 규칙이 정한 자리 그대로다 — 도구가 등록점에 오르는 순간 장부도 깨어난다.
- **구 동작(실측)**: `engine/src/handlers/include/readonly/handleGetIncludesList.ts:86-131` —
  노드 구조 응답에서 `OBJECT_TYPE`이 `PROG/I`인 마디의 `OBJECT_NAME`을 **조건 없이**
  걷는다. `INCLUDE <name> IF FOUND.`(고객 확장 슬롯 관용구)로 선언만 돼 있고
  오브젝트는 없는 이름도 그대로 실린다. 실측: `ZUNIVR5120`의 목록에 `ZUNIVI_H011`이
  실렸고 `SearchObject`는 0건(`HANDOFF.md` §6 항목 13-13). 이후 그 이름의 404가
  도구 결함으로 오독됐다 — 404가 실은 정확한 응답이었다.
- **신 동작**: **ADT가 주소(`OBJECT_URI`)를 주지 않은 마디를 실재하는 오브젝트로 보지
  않는다.** 목록에서 빼고, `detailed` 응답에는 뺀 이름을 `unresolved_includes`로 싣는다
  (뺄 것이 없으면 그 키를 만들지 않는다 — 흔한 경우의 모양은 구와 같다).
- **판정 근거**: 구 엔진 자신의 분류다 —
  `engine/src/handlers/system/readonly/handleGetObjectInfo.ts:135-145`가 **같은 노드 구조
  응답**에서 `OBJECT_NAME` + `OBJECT_URI`를 가진 마디만 실물 잎(terminal leaf)으로 보고,
  `OBJECT_URI`가 없는 마디는 주소 없는 묶음 마디(group node)로 가른다. 주소가 없다는
  것은 ADT가 그 이름으로 갈 곳을 모른다는 뜻이다.
- **폴백은 걸러 내기 전 마디 수로 판정한다.** 구는 "PROG/I 이름을 하나도 못 찾으면
  응답 안의 모든 `OBJECT_NAME`을 걷는" 폴백을 갖는다(`:113-125`). 그 조건을 **걸러 낸
  뒤의** 수로 보면, D3가 전부 걸러 낸 순간 폴백이 켜져 같은 이름을 도로 실어 온다.
  그래서 신 엔진은 폴백 판정을 **PROG/I 마디의 존재 여부**로 하고, 폴백 자체는 구
  그대로 둔다.
- **대체 기대 시험**: `sapkit-engine/src/tools/read/__tests__/getIncludesList.test.ts`의
  「장부 D3」 절 5건 + `sapkit-engine/harness/replay/__tests__/divergences.test.ts`의
  「D3 — 주소 없는 인클루드 이름만 빠진다」 절 4건.
- **기계 장부 반영**: 했다. `harness/replay/divergences.ts`의 D3가 `active`이며 `check`를
  들고 있다 — 구가 싣던 이름 중 **빠진 것만** 등재된 차이이고, 이름이 늘거나 공통분이
  어긋나면 `allowlisted-fail`로 떨어진다.
| D2 | `UpdateLocalTypes` | 13-11 — `activate_on_update:true`에서 거짓 성공 | 수리 | **활성** (class 묶음에서 깨움) |
| D3 | `GetIncludesList` | 13-13 — `INCLUDE … IF FOUND`의 비실재 객체명 반환 | 수리 | 휴면(도구 M1 밖) |

근거: `HANDOFF.md` §6 항목 13의 하위 13-9·13-11·13-13 · 결정 기록 D-079 ⑤.
대체 기대 시험: D1 = WHERE가 결과에 실제 반영됨을 검증하는 시험(실데이터 도구
작업이 소유). D3는 `GetIncludesList`를 짓는 마일스톤에서 활성화한다.

### D2 활성화 — `UpdateLocalTypes`를 지으며 (class 묶음)

휴면은 "등재는 지금 하되 대체 기대 시험은 그 도구를 짓는 마일스톤에서
활성화한다"는 뜻이었다. 그 마일스톤이 왔으므로 여기서 깨운다.

- **구 동작(실측)**: `AdtLocalTypes`는 부모 `AdtClass`를 상속하면서 `update()`를
  **재정의**하는데, 그 본문
  (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtLocalTypes.js:156-227`)
  이 `options`에서 읽는 것은 `lockHandle`과 `sourceCode`뿐이다 —
  **`activateOnUpdate`를 한 번도 읽지 않는다.** 부모
  `AdtClass.update()`(`AdtClass.js:253-377`)에는 6단계 활성화가 있지만 재정의가
  그것을 가린다. 그런데 겉 핸들러는 그 플래그를 넘긴 뒤
  (`engine/src/handlers/class/high/handleUpdateLocalTypes.ts:87`) 응답에
  `activated: activate_on_update`를 그대로 실었다(`:132`). 즉
  **활성화 요청이 한 건도 나가지 않은 채 "활성화됨"이라고 답했다.**
- **이것이 우연한 누락이 아니라는 근거**: 형제 재정의
  `AdtLocalTestClass.update()`(`AdtLocalTestClass.js:227-235`)에는 "Step 5:
  Activating parent class"가 있다. 같은 패키지 안에서 한쪽에만 있다.
- **신 동작**: 요청받았으면 해제 뒤에 실제로 활성화하고, **활성화 응답 본문의
  `<chkl:msg>`를 판정한다.** SAP은 활성화 실패도 HTTP 200으로 답하므로 보내기만
  하고 안 읽으면 거짓 성공이 자리만 옮긴다. `E`·`A`·`X`면 실패, `W`만이면 성공.
- **대체 기대 시험**: `sapkit-engine/src/tools/write/__tests__/updateLocalTypes.test.ts`
  의 「D2 — activate_on_update의 거짓 성공을 고쳤다」 절 5건.
- **재생 판정은 이연이다**(기계 장부의 `check`가 null). 재생 대조가 보는 것은
  도구 응답 시퀀스인데 이 차이의 본체는 **활성화 요청이 나갔는가**라는 와이어
  사실이라, 응답만으로는 구와 신을 가를 수 없다(둘 다 `activated:true`를 답할
  수 있다). 판정 자리는 위 계약 시험이고, 재생은 그 단계를 통과가 아니라
  무증거로 센다 — D37과 같은 모양이다.

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
### D51 — `UpdateFunctionModule`이 활성화 응답을 **읽는다** (구: 버린다)

- **분류**: 수리
- **구 동작(실측)**: `engine/src/handlers/function/high/handleUpdateFunctionModule.ts:172-191` —
  `client.getFunctionModule().activate(...)`의 반환값을 **아무 데도 쓰지 않고**
  바로 `activated: shouldActivate`가 박힌 성공 응답을 만든다. 그 호출은
  `@babamba2/mcp-abap-adt-clients/dist/core/functionModule/activation.js:11-17` →
  `utils/activationUtils.js:115-131`로 내려가는데, ADT의 활성화는 **실패도 HTTP
  200으로** 답하고 실패 내용을 본문의 `<chkl:msg type="E">`에 담는다. 즉 활성화가
  실패해도 도구는 `success: true, activated: true`를 보고한다.
- **신 동작**: 응답 본문을 `parseActivationMessages`로 갈라 `E`/`A`/`X` 메시지가
  하나라도 있으면 **실패로 되돌린다**. 문구는 활성 버전이 그대로라는 것과 쓴 소스가
  비활성 버전으로 남아 있다는 것을 함께 말한다.
- **근거**: 활성화되지 않은 것을 활성화됐다고 말하는 것은 거짓 성공이며, 이 레포에는
  CLAS 거짓 성공 실증 이력이 있다(`CLAUDE.md` 안전 규칙 — write 성공 보고를 그대로
  믿지 않는다). 이미 지어진 `UpdateProgram`(`src/tools/write/updateProgram.ts:102-122`)이
  같은 판정을 하고 있으므로, 같은 표면 안에서 도구마다 다르게 답하지 않게 맞춘 것이기도
  하다.
- **범위**: 응답 **키는 늘리지 않았다** — 성공 응답의 모양은 구 그대로이고, 달라지는
  것은 활성화가 실패했을 때 `isError`가 참이 된다는 것뿐이다.
- **대체 기대 시험**:
  `src/tools/write/__tests__/updateFunctionModule.test.ts`의
  「활성화가 200에 오류를 담아 와도 성공으로 접지 않는다 (D51)」 ·
  「activate=true면 해제 뒤에 활성화가 나간다」(깨끗한 응답은 그대로 성공).
- **기계 장부**: **미반영.** 이 과제는 `harness/replay/**` 무접촉이다. 도구 응답의
  `isError`가 갈리므로 **옮겨야 할 항목**이며, 옮기지 않은 채 재생을 켜면 이 갈래가
  가짜 실패로 잡힌다(`ADDING-A-TOOL.md` 부록 A).

### D52 — `CreateFunctionGroup`의 생성 뒤 읽기에서 **404 재시도(5초 대기)를 승계하지 않는다**

- **분류**: 축소 — **해소 마일스톤 = C1 녹화에서 이 404가 실제로 관찰될 때**
- **구 동작(실측)**:
  `@babamba2/mcp-abap-adt-clients/dist/core/functionGroup/AdtFunctionGroup.js:161-189` —
  생성 체인의 마지막 읽기가 404를 받으면 `setTimeout(5000)`으로 5초를 기다렸다가
  **한 번 더** 같은 GET을 보내고, 그것도 실패하면 읽기 결과 없이 넘어간다.
  클라우드의 최종 일관성을 겨눈 장치다.
- **신 동작**: 그 읽기는 그대로 보내되 **404 재시도와 5초 대기를 하지 않는다.**
  실패하면 구의 마지막 갈래와 같이 삼키고 넘어간다.
- **근거**: 그 읽기의 응답을 **아무도 쓰지 않는다.** 구 핸들러
  (`engine/src/handlers/function/high/handleCreateFunctionGroup.ts:237-262`)는
  `create()`의 반환값을 받지 않고 자기 손으로 성공 응답을 조립한다. 즉 재시도가
  성공하든 실패하든 도구 응답은 한 글자도 달라지지 않으며, 남는 것은 **5초의
  정지**뿐이다. 신 엔진에는 도구가 시계를 주입받는 통로도 없어서 그 대기는
  시험에서 그대로 실시간 5초가 된다.
- **범위**: 왕복 **수**가 갈리는 것은 그 읽기가 404를 받는 경우뿐이다. 정상 경로의
  요청 순서·개수는 구와 같다(8단계).
- **대체 기대 시험**:
  `src/tools/write/__tests__/createFunctionGroup.test.ts`의
  「준비 대기·마무리 읽기가 404여도 성공을 막지 않는다」 —
  읽기 둘이 모두 404여도 도구가 성공으로 끝난다는 것, 즉 재시도가 없어도 응답이
  같다는 것을 못 박는다.
- **기계 장부**: **미반영.** 이 과제는 `harness/replay/**` 무접촉이다. 404 갈래에서
  **요청 시퀀스의 길이가 갈리므로** 옮겨야 할 항목이다.
### D56 — 표·구조체 쓰기 4종은 **활성화 실패를 성공으로 답하지 않는다**

- **대상**: `CreateTable` · `UpdateTable` · `CreateStructure` · `UpdateStructure`
- **분류**: 수리
- **구 동작(실측)**: 활성화 응답 본문의 `<chkl:msg>`를 훑되 **종류를 가리지
  않고** 문구로 접어 `activation_warnings`에 담고, 그대로
  `success: true` · `activated: true`로 답한다
  (`engine/src/handlers/table/high/handleUpdateTable.ts:296-345` ·
  `engine/src/handlers/structure/high/handleUpdateStructure.ts:262-313`).
  `type="E"`도 그 배열에 들어갈 뿐이라, **활성화되지 않은 오브젝트가
  "활성화됨"으로 보고된다.** `CreateStructure`는 한 걸음 더 나아가 활성화 응답을
  아예 읽지 않는다(`handleCreateStructure.ts:384-386`).
- **신 동작**: `E`·`A`·`X` 메시지가 하나라도 있으면 실패로 되돌리고, 소스는
  인액티브 버전으로 SAP에 남아 있으며 활성 버전은 그대로라는 사실을 문구에
  함께 싣는다. 경고만 있으면 구와 같이 성공이고 경고는 실려 나간다.
- **근거**: SAP의 활성화는 **오류를 담은 채 HTTP 200으로 답한다**. 상태 코드만
  믿으면 깨진 오브젝트가 활성화 성공으로 보고되며, 이 레포에는 그 CLAS 거짓
  성공 실증 이력이 있다(`CLAUDE.md` 안전 규칙 — "write 성공 보고를 그대로 믿지
  않는다"). 판정 자리는 `src/tools/write/shared.ts`의
  `parseActivationMessages` · `activationErrors`이며, **M1의 쓰기 도구
  (`UpdateProgram` · `UpdateClass` · `UpdateInclude` · `CreateInclude`)가 이미
  같은 판단을 하고 있다** — 이 넷만 예외로 두면 같은 엔진 안에서 활성화 계약이
  둘로 갈린다.
- **대체 기대 시험**:
  `src/tools/write/__tests__/updateTable.test.ts`의 「활성화 응답의 E 메시지는
  실패다」·「경고만 있으면 성공이고 경고는 실려 나간다」 ·
  `src/tools/write/__tests__/updateStructure.test.ts`의 같은 두 건 ·
  `src/tools/write/__tests__/createStructure.test.ts`의 「활성화 실패를 성공으로
  답하지 않는다」.
- **비고 — 기계 장부 미반영**: 이 판의 표·구조체 과제는 `harness/replay/**`가
  무접촉이라 `harness/replay/divergences.ts`에 옮기지 못했다. 도구 **응답**이
  달라지는 차이이므로 기계 장부에도 와야 한다(부록 A의 갈림 기준). 묶음 병합 뒤
  한 번에 옮길 것.
- **선행 항목이 없다는 관찰**: 위에 적은 M1 쓰기 4종의 같은 동작은 이 장부에
  등재돼 있지 않다. 그쪽도 등재 대상으로 보이며, 판단은 그 파일을 소유한
  작업의 몫이다.
### D46 — `GetProgFullCode`가 인클루드 본문을 **실제로 꺼낸다** (구: `data` 키 오타로 빈손)

- **분류**: 수리
- **구 동작(실측)**: `engine/src/handlers/program/readonly/handleGetProgFullCode.ts`는
  인클루드 한 벌을 `handleGetInclude`로 받아 그 응답에서 본문을 꺼낸다. 그런데
  `handleGetInclude`가 싣는 키는 **`text`**인데(`engine/src/handlers/include/readonly/handleGetInclude.ts:45-53`)
  꺼내는 자리 셋 중 둘이 **`data`**를 읽는다:
  - `:93` — `collectIncludes` 안. 코드가 언제나 `null`이 되므로 안쪽 `INCLUDE`를
    한 번도 찾지 못한다. **중첩 인클루드 재귀가 죽어 있다.**
  - `:272` — FUGR 갈래의 코드 수집. **함수그룹 인클루드의 `code`가 언제나 `null`**이다.
  같은 파일의 PROG/P 갈래(`:196`)만 `'text' in c`로 옳게 읽는다 — 한 파일 안에서
  키가 갈리는 것이 오타의 증거다.
- **신 동작**: 세 자리 모두 `text`를 읽는다. 그래서 중첩 인클루드가 트리 순회
  순서로 따라 붙고, FUGR 갈래의 인클루드에도 본문이 실린다.
- **근거**: 이 도구의 선언된 목적이 "전량 코드 내보내기·감사·마이그레이션·백업"인데
  (구 핸들러 머리주석 `:32`), 읽기는 성공했으면서 본문을 못 꺼내는 것은 spec §2.4의
  「구의 오답」 계열이다. 응답 **모양**은 그대로이고 채워지는 값만 달라진다.
- **대체 기대 시험**: `sapkit-engine/src/tools/read/__tests__/getProgFullCode.test.ts` —
  「중첩 인클루드까지 내려간다」 · 「함수그룹의 인클루드에도 코드가 실린다」.
- **비고**: 왕복 수가 는다(중첩 하나마다 두 번 — 구도 인클루드 하나를 두 번 읽었고
  그 왕복 수는 줄이지 않았다).
- **기계 장부 미반영**: `harness/replay/divergences.ts`는 이 과제에서 D3 활성화 외에는
  무접촉이다(여러 묶음이 같은 파일에서 충돌한다). 옮기지 않은 채 재생을 켜면 이
  차이가 결함으로 잡힌다 — 묶음 병합 뒤에 옮겨야 한다.
### D41 — `UpdateLocalTestClass`가 활성화 실패를 성공으로 접지 않는다

- **분류**: 수리
- **구 동작(실측)**: 활성화 요청은 **나갔다**
  (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtLocalTestClass.js:227-235`
  — `options.activateOnUpdate`가 참이면 `this.activate()`를 부른다). 그런데
  **응답 본문을 아무도 읽지 않는다**: `activateObjectInSession`은 응답을 그대로
  돌려주고(`dist/utils/activationUtils.js:116-133`), `AdtClass.activate()`는
  HTTP 4xx에서만 던진다(`dist/core/class/AdtClass.js:436-468`). 그래서 겉
  핸들러는 무조건 `activated: activate_on_update`를 실어 보낸다
  (`engine/src/handlers/class/high/handleUpdateLocalTestClass.ts:149`).
  **SAP은 활성화 실패도 HTTP 200으로 답하며 `<chkl:msg type="E">`를 담으므로**,
  깨진 테스트 클래스가 "활성화됨"으로 보고된다.
- **신 동작**: 활성화 응답 본문의 `<chkl:msg>`를 갈라 `E`·`A`·`X`가 하나라도
  있으면 실패로 되돌린다(줄번호와 문구를 그대로 실어). `W`만 있으면 성공이다 —
  과잉 거부하지 않는다.
- **근거**: 이 레포에 **CLAS 거짓 성공 실증 이력**이 있고(`CLAUDE.md` 안전 규칙
  「write 성공 보고를 그대로 믿지 않는다」), 같은 자리를 이미 지어진
  `UpdateClass`가 같은 방식으로 고쳤다(`src/tools/write/updateClass.ts` 머리주석).
  구를 재현하면 **같은 엔진 안에서 두 도구가 같은 실패에 다르게 답하게** 된다.
  안전 바닥선은 자작을 이유로 낮추지 않는다(spec §2.3).
- **대체 기대 시험**: `sapkit-engine/src/tools/write/__tests__/updateLocalTestClass.test.ts`
  의 「D41 — 활성화 실패를 성공으로 접지 않는다」 절 5건.
- **기계 장부 미반영**: `harness/replay/divergences.ts`에는 아직 옮기지 않았다.
  이 항목을 지은 묶음 과제는 그 파일을 D2 활성화 말고는 건드리지 않기로 걸려
  있었다(여러 묶음이 같은 파일에서 충돌한다). **묶음 병합 뒤 한 번에 옮겨야
  한다** — 옮기지 않은 채 재생을 켜면 이 차이가 결함으로 잡힌다.
- **비고**: 같은 결함이 **`UpdateClass`에도 있었고 그쪽은 이 장부에 등재되지
  않은 채 고쳐졌다.** 이 항목을 옮길 때 그 누락도 함께 다뤄야 한다.

### D98 — `CreateBehaviorDefinition`의 소유자 속성을 **env에서만** 읽는다

- **분류**: 축소 — **해소 마일스톤 = D62와 같다**(시스템 문맥 해석을 서버 기동에
  붙이는 자리). 그 계층이 서면 D62와 함께 닫힌다.
- **구 동작(실측)**: `createAdtClient`가 `getSystemContext()`의 값을
  `AdtBehaviorDefinition`의 `systemContext`로 넘기고
  (`engine/src/lib/clients.ts:20-31`), 생성 페이로드가 그것을
  `adtcore:masterSystem`·`adtcore:responsible`로 싣는다
  (`AdtBehaviorDefinition.js:120-121` → `dist/core/behaviorDefinition/create.js:36-45`).
- **신 동작**: `context.env`의 `SAP_MASTER_SYSTEM` · (`SAP_RESPONSIBLE` ||
  `SAP_USERNAME`)만 읽고, 없으면 **속성 자체를 빼고** 보낸다
  (`src/tools/write/behaviorUri.ts`의 `ownerAttributes`).
- **근거**: D62의 근거를 그대로 따른다 — 구의 해석 순서 셋 중 실제로 관찰되는
  경로는 env 하나뿐이고, 없는 계층을 이 묶음에서 새로 세우는 것은 범위 밖이다.
  **짝인 `CreateBehaviorImplementation`은 이 항목에 해당하지 않는다** — 그쪽은
  벤더가 매 호출마다 `/sap/bc/adt/core/http/systeminformation`을 직접 물어보므로
  그 요청을 그대로 재현했다.
- **대체 기대 시험**: `sapkit-engine/src/tools/write/__tests__/createBehaviorDefinition.test.ts`
  의 「생성 페이로드 — 소유자 속성 (차이 장부 D98)」 절 3건 ·
  `.../createBehaviorImplementation.test.ts`의 「소유자 속성 — **SAP에 물어본다**」
  절 2건(두 사슬이 이 값을 어떻게 다르게 얻는지를 함께 못 박는다).
- **기계 장부 미반영**: 생성 POST의 본문이 달라질 수 있으므로 **와이어 차이**다.
  이 묶음 과제에 `harness/replay/**`가 무접촉으로 걸려 있어 옮기지 못했다.

### D99 — `CreateBehaviorDefinition`·`UpdateBehaviorDefinition`이 활성화 응답을 **읽는다**

- **분류**: 수리
- **구 동작(실측)**: 활성화 요청은 **나간다** —
  `client.getBehaviorDefinition().activate({name})`
  (`handleCreateBehaviorDefinition.ts:153-158` ·
  `handleUpdateBehaviorDefinition.ts:139-144`). 그런데 **반환값을 어디에도 쓰지
  않는다.** 벤더 `activate()`는 응답을 그대로 돌려주고
  (`dist/core/behaviorDefinition/activation.js:26-29` →
  `dist/utils/activationUtils.js:116-133`), 겉 핸들러는 곧장
  `success: true` 응답을 조립한다. **SAP은 활성화 실패도 HTTP 200으로 답하며
  `<chkl:msg type="E">`를 담으므로**, 깨진 BDEF가 "생성/수정하고 활성화했다"로
  보고된다. 이 두 도구는 `UpdateBehaviorImplementation`(D100)과 달리 응답을
  파싱하는 코드조차 없다.
- **신 동작**: 활성화 응답 본문의 `<chkl:msg>`를 갈라 `E`·`A`·`X`가 하나라도
  있으면 실패로 되돌리고, 문구에 모든 실패를 줄번호와 함께 담는다. **오브젝트는
  inactive 판으로 SAP에 남아 있다**는 사실을 함께 알린다. `W`만 있으면 성공이다.
- **근거**: 이 레포에 CLAS 거짓 성공 실증 이력이 있고(`CLAUDE.md` 안전 규칙),
  같은 자리를 이미 지어진 `UpdateClass`·`UpdateInterface`(D73)·`UpdateView`(D66)·
  `UpdateFunctionModule`(D51)이 같은 방식으로 고쳤다. 구를 재현하면 같은 엔진
  안에서 도구마다 같은 실패에 다르게 답하게 된다. 안전 바닥선은 낮출 수 없다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/createBehaviorDefinition.test.ts`의
  「활성화가 E를 담아 200으로 오면 실패로 보고한다 (D99)」·「E가 아닌 활성화
  메시지는 성공을 막지 않는다」 ·
  `.../updateBehaviorDefinition.test.ts`의 같은 이름 두 건(D100 표기).
- **기계 장부 미반영**: 도구 응답이 달라지는 차이다. 위와 같은 이유로 옮기지
  못했다.

### D100 — `UpdateBehaviorImplementation`이 **활성화 실패를 성공으로 접지 않는다**

- **분류**: 수리
- **구 동작(실측)**: 여기는 응답을 **읽기는 한다** — 본문에 `<chkl:messages`가
  있으면 파싱해 모든 `msg`를 `activation_warnings`로 옮긴다
  (`handleUpdateBehaviorImplementation.ts:120-141`). 그런데 **`type="E"`가 섞여
  있어도** `success: true` · `activated: true` · "updated and activated
  successfully"로 답한다(`:159-172`). 즉 실패 메시지를 손에 쥐고도 경고로
  강등한다 — D73(`UpdateInterface`)과 같은 모양이다.
- **신 동작**: `E`·`A`·`X`를 실패로 판정해 오류로 올린다. `E`가 아닌 메시지는
  구대로 `activation_warnings`에 실린다(`W: <문구>` 모양도 그대로).
- **근거**: D73·D99와 같다. 방향이 "성공을 실패로"이므로 없는 권한을 여는
  종류가 아니다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/updateBehaviorImplementation.test.ts`의
  「활성화가 E를 담아 200으로 오면 실패로 보고한다 (D100)」·「E가 아닌 활성화
  메시지는 구대로 activation_warnings에 실린다」.
- **기계 장부 미반영**: 도구 응답이 달라지는 차이다. 같은 이유로 옮기지 못했다.

### D101 — BDEF **잠금 요청에 구의 `asx:abap` 템플릿 본문을 싣지 않는다**

- **분류**: 축소 — **해소 마일스톤 = `AdtClient.lock`의 `LockOptions`에 본문
  통로를 여는 자리.** 한 줄짜리 추가이지만 `src/adt/client.ts`는 이 판에서
  묶음 13개가 동시에 지나가는 공유 파일이라 이 과제의 범위 밖이다.
- **구 동작(실측)**: BDEF 잠금만 본문을 싣는다 —
  `dist/core/behaviorDefinition/lock.js:30-53`이 `<asx:abap>…<IS_LOCAL>X</IS_LOCAL>…`
  한 장을 `data`로 POST 한다. **같은 벤더의 다른 오브젝트 계열은 전부
  `data: null`이다**(`core/class/lock.js:27` · `core/interface/lock.js:25`) —
  BDEF가 그 안에서 예외다.
- **신 동작**: `client.withLock()`이 본문 없이 POST 한다(주소·질의 인자·Accept는
  같다). 영향 범위는 `CreateBehaviorDefinition`·`UpdateBehaviorDefinition` 둘뿐이고,
  **`CreateBehaviorImplementation`·`UpdateBehaviorImplementation`은 클래스 잠금이라
  원래 본문이 없어 영향이 없다.**
- **근거**: 잠금 수명주기를 접속 계층이 소유하는 것이 이 엔진의 계약이고
  (D72의 같은 판단), 그 계약은 잠근 자리와 푸는 자리가 한 통로일 때 성립한다.
  본문 통로를 여는 것은 공유 파일 변경이라 묶음 과제가 단독으로 할 일이 아니다.
  **`IS_LOCAL`은 잠금 응답이 돌려주는 필드이기도 하므로 요청 본문이 잠금 성패를
  가르는지는 이 판에서 실측되지 않았다** — attended 세션에서 확인할 자리다.
- **대체 기대 시험**: 없다. 이 항목은 "덜 보낸다"이므로 다른 쪽이 옳다는 증명이
  아니라 **실기 확인이 필요한 축소**다.
  `sapkit-engine/src/tools/write/__tests__/createBehaviorDefinition.test.ts`의
  「잠금·해제는 **소문자 · 인코딩 없는** URI다」가 주소·질의·Accept가 같음까지는
  못 박는다.
- **기계 장부 미반영**: 요청 본문이 달라지므로 **와이어 차이**다. 같은 이유로
  옮기지 못했다.
### D81 — `CreateTransport`가 만든 이송번호를 **응답에 싣는다** (구: 키 이름 어긋남으로 빈손)

- **분류**: 수리 (구의 거짓 성공을 고침)
- **구 동작(실측)**: 겉 핸들러는 벤더가 돌려준 객체를 `transportInfo`에 담고
  (`engine/src/handlers/transport/high/handleCreateTransport.ts:145-147`) 거기서
  **`transport_number`** 키를 읽는다(`:163, 175`). 그런데 벤더가 채우는 키 이름은
  **`transport_request`**다(`@babamba2/mcp-abap-adt-clients/dist/core/transport/create.js:78`).
  폴백으로 쓰는 지역 변수 `transportNumber`는 `:106`에서 선언만 되고 **값이
  들어가는 자리가 없다.** 그래서 관측되는 성공 응답은 `transport_request` 키가
  통째로 빠진 채(`undefined`는 `JSON.stringify`가 지운다) `message`가
  **"Transport request unknown created successfully"**였다. 벤더 쪽에는 번호가
  살아 있다 — `AdtRequest.create()`가 번호 없는 응답을 오류로 뒤집으므로
  (`@babamba2/mcp-abap-adt-clients/dist/core/transport/AdtRequest.js`의 `create()`)
  성공 경로에서 번호는 **반드시 존재한다.** 구는 알고 있던 값을 버린 것이다.
- **신 동작**: `transport_request`와 `message`에 파싱된 `tm:number`를 싣는다.
  나머지 키·폴백 순서·문구는 구 그대로이며, `task_number`도 구처럼 채우지
  않는다 — 벤더 응답에도 구의 죽은 XML 갈래에도 그 값을 채우는 자리가 없어
  「없다」가 곧 관측값이다.
- **근거**: 이송요청을 만들어 놓고 번호를 못 돌려주면 호출자가 방금 만든 것을
  가리킬 수 없다. 「성공이라고 답하지만 결과가 없다」는 이 레포가 반복해 잡아 온
  모양이고(D46 — `GetProgFullCode`의 `data` 키 오타), 같은 분류로 고친다.
- **대체 기대 시험**: `src/tools/write/__tests__/createTransport.test.ts`의
  「응답 — 구의 키 + 이송번호 수리(D81)」 두 건 — 번호가 실리는지, 그리고 구의
  `unknown created successfully` 모양이 되살아나지 않는지.
- **⚠️ 기계 장부 미반영**: 도구 응답 본문이 달라지므로 **와이어 차이**다.
  `harness/replay/divergences.ts`는 이 묶음 과제에 무접촉으로 걸려 있어 옮기지
  못했다(여러 묶음이 같은 파일에서 충돌한다). **묶음 병합 뒤 한 번에 옮겨야
  한다** — 옮기지 않은 채 재생을 켜면 이 차이가 결함으로 잡힌다.

### D82 — 이송 계열의 사용자·소유자도 **env에서만** 읽는다 (D62의 범위 확장)

- **분류**: 축소 — **해소 마일스톤은 D62와 같다**(시스템 문맥 해석을 서버 기동에
  붙이는 자리).
- **구 동작(실측)**: `ListTransports`는 `args.user || getSystemContext().responsible
  || SAP_USERNAME || ''`로(`handleListTransports.ts:129-133`), `GetTransport`는
  세션 사용자를 같은 식으로(`handleGetTransport.ts:271-273`), `CreateTransport`는
  `config.owner ?? systemContext.responsible`로
  (`@babamba2/mcp-abap-adt-clients/dist/core/transport/AdtRequest.js`의 `create()`)
  값을 구한다. 그 `responsible`의 셋째 갈래가 `getSystemInformation(connection)`이다
  (`engine/src/lib/systemContext.ts:45-86`).
- **신 동작**: `context.env`의 (`SAP_RESPONSIBLE` || `SAP_USERNAME`)만 읽는다.
- **근거**: D62와 같다 — 해석된 프로파일에는 `SAP_USERNAME`이 반드시 있으므로
  (`src/profile/resolve.ts:233-241`) 셋째 갈래는 실사용에서 걸리지 않는다. D62는
  같은 결정을 **생성 페이로드**에 한정해 적었으므로, 이송 계열까지 덮도록 범위만
  넓혀 둔다.
- **대체 기대 시험**: `src/tools/read/__tests__/listTransports.test.ts`의
  「user는 프로파일에서 오고 …」·「user 인자가 프로파일을 이긴다」 ·
  `src/tools/read/__tests__/getTransport.test.ts`의 「owner가 세션 사용자와 같으면
  폴백하지 않는다」 · `src/tools/write/__tests__/createTransport.test.ts`의
  「SAP_RESPONSIBLE이 SAP_USERNAME을 이긴다」.
- **⚠️ 기계 장부 미반영**: 질의 인자(`?user=`)와 생성 본문의 `tm:owner`가 달라질
  수 있으므로 **와이어 차이**다. D81과 같은 이유로 옮기지 못했다.
### D103 — 메타데이터 확장(DDLX) 쓰기 2종이 활성화 **거짓 성공**을 성공으로 접지 않는다

- **분류**: 수리
- **대상**: `UpdateMetadataExtension` · `CreateMetadataExtension`
- **구 동작(실측)**: 이 계열은 활성화 응답을 **누구도 읽지 않는다.** 저수준
  `activate.js:24-27`이 `activateObjectInSession`의 응답을 그대로 돌려주고,
  감싸개 `AdtMetadataExtension.js:372-396`도 판정하지 않으며, 두 구 핸들러
  (`engine/src/handlers/ddlx/high/handleUpdateMetadataExtension.ts:129-139` ·
  `.../handleCreateMetadataExtension.ts:125-149`)도 `await` 뒤 아무 검사 없이
  `success: true` · "…and activated successfully"로 답한다. SAP은 활성화 실패를
  **HTTP 200 + `<chkl:msg type="E">`** 로 돌려주므로, **활성화되지 않은 DDLX가
  "활성화 성공"으로 보고된다.**
- **신 동작**: 활성화 응답의 `E`/`A`/`X` 메시지를 실패로 판정해 오류로 되돌린다.
  문구에 모든 오류를 줄번호와 함께 담고, "소스는 인액티브 버전으로 SAP에 올라가
  있고 활성 버전은 그대로"라는 사실을 함께 적는다. `W`만 있으면 구와 같이
  성공이다 — 과잉 거부하지 않는다.
- **근거**: 사전 등재 D2 · D41 · D56 · D66 · D73과 **같은 계열**이고, 판정 자리는
  이미 `src/tools/write/shared.ts`의 `parseActivationMessages`·`activationErrors`에
  하나로 모여 있다. **이웃한 서비스 정의(SRVD)는 벤더가 이미 막는다** —
  `core/serviceDefinition/activation.js:22-73`이 `chkl:properties`의
  `activationExecuted`·`checkExecuted`를 보고 아니면 던진다. 같은 과제가 지은 두
  계열이 같은 실패에 다르게 답하게 두면 표면 안에서 안전 바닥선이 도구마다
  달라진다. 안전 바닥선은 자작을 이유로 낮추지 않는다(spec §2.3).
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/updateMetadataExtension.test.ts`의
  「D103 — 200에 실려 온 활성화 오류를 성공으로 접지 않는다」 ·
  「경고만 있는 활성화는 성공이다」(구 동작이 유지되는 쪽을 함께 못박는다) ·
  `.../createMetadataExtension.test.ts`의 같은 이름 두 절.
- **해소 마일스톤**: 없음 — 영구 차이(수리)다.
- **기계 장부 미반영**: `harness/replay/divergences.ts`에는 옮기지 않았다. 이
  과제는 `harness/replay/**`가 무접촉으로 걸려 있다(여러 묶음이 같은 파일에서
  충돌한다). **도구 응답이 달라지는 차이이므로 묶음 병합 뒤 한 번에 옮겨야
  한다** — 옮기지 않은 채 재생을 켜면 이 갈래가 가짜 실패로 잡힌다.

### D104 — `CreateMetadataExtension`이 활성화 실패 뒤 **UNLOCK을 두 번 보내지 않는다**

- **분류**: 수리
- **구 동작(실측)**: 구 핸들러의 `try` 블록 안에 **해제와 활성화가 함께** 들어
  있고(`engine/src/handlers/ddlx/high/handleCreateMetadataExtension.ts:110-139`),
  `catch`가 다시 해제를 시도한다(`:128-136`). 그래서 검사·해제가 성공한 뒤
  **활성화가 실패하면 이미 풀린 핸들로 UNLOCK이 한 번 더 나간다.** 그 두 번째
  요청은 SAP이 거절하고, 거절은 `catch` 안에서 로그로 삼켜진 뒤 원래 오류가
  올라간다 — 즉 결과에는 안 보이고 와이어에만 남는 요청이다.
- **신 동작**: 잠금 수명주기를 접속 계층의 `withLock`이 소유하므로 해제는 정확히
  한 번이다. 활성화는 잠금 창 **밖**에서 일어나므로 실패해도 추가 UNLOCK이
  나가지 않는다.
- **근거**: 이미 풀린 핸들로 보내는 UNLOCK은 아무것도 되돌리지 않고 실패만
  한다(구 스스로 그 실패를 삼킨다). 재현하려면 도구가 접속 계층의 잠금 계약을
  다시 짜야 하는데, 그 계층은 이미 지어진 쓰기 도구 전부가 공유한다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/createMetadataExtension.test.ts`의
  「활성화가 실패해도 해제는 한 번뿐이다」 — 요청 순서를 통째로 견준다.
- **해소 마일스톤**: 없음 — 영구 차이(수리)다.
- **기계 장부 미반영**: **와이어(요청 시퀀스) 차이**이므로 병합 뒤
  `harness/replay/divergences.ts`로 옮겨야 한다. 이 과제는 `harness/replay/**`가
  무접촉이다.

### D105 — `CreateServiceBinding`이 활성화 **거짓 성공**을 성공으로 접지 않는다

- **분류**: 수리
- **구 동작(실측)**: 생성 사슬의 활성화 응답을 **누구도 읽지 않는다.** 저수준
  `activateServiceBinding`(`@babamba2/…/core/service/AdtService.js:613-635`)이
  응답을 그대로 돌려주고, 사슬 `create()`(`:190-266`)는 그것을
  `state.activateResult`에 담기만 하며, 구 핸들러
  (`engine/src/handlers/service_binding/high/handleCreateServiceBinding.ts:126-182`)는
  그 값을 아예 보지 않고 `activated: args.activate !== false`로 **인자를 그대로
  메아리친다.** SAP은 활성화 실패를 **HTTP 200 + `<chkl:msg type="E">`** 로
  돌려주므로, 활성화되지 않은 바인딩이 `success: true` · `activated: true`로
  보고된다.
- **신 동작**: 활성화 응답의 `E`/`A`/`X` 메시지를 실패로 판정해 오류로 되돌린다.
  문구에 모든 오류를 줄번호와 함께 담고, "바인딩은 인액티브 판으로 SAP에 남아
  있다"는 사실을 함께 적는다. `W`만 있으면 구와 같이 성공이다.
  **활성화 뒤에 오던 세 요청(활성 판 읽기 · 생성정보 조회 · 활성 판 검사)은 그
  실패로 나가지 않는다** — 실패 경로에서 요청 시퀀스가 구보다 짧아진다.
- **근거**: D2 · D41 · D56 · D66 · D73 · D103과 **같은 계열**이고, 판정 자리는
  `src/tools/write/shared.ts`의 `parseActivationMessages`·`activationErrors`에
  이미 하나로 모여 있다. 같은 과제가 지은 세 계열 중 서비스 정의(SRVD)만 벤더가
  막고 있었으므로(`core/serviceDefinition/activation.js:22-73`), 나머지 둘을
  그대로 두면 한 표면 안에서 안전 바닥선이 도구마다 달라진다. 안전 바닥선은
  자작을 이유로 낮추지 않는다(spec §2.3).
- **함께 보아야 할 것 (고치지 **않은** 자리)**: 같은 사슬의 구문검사
  (`checkServiceBinding` — 인액티브·활성 두 번)는 구가 결과를 **읽지 않고 버린다**
  (`create()`가 `state`에 담기만 한다). 그것은 "활성화됐다"는 주장과 달리 성공을
  참칭하는 자리가 아니므로 **구 그대로 버린다.** 여기까지 손대면 등재되지 않은
  동작 변경이 된다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/createServiceBinding.test.ts`의
  「D105 — 200에 실려 온 활성화 오류를 성공으로 접지 않는다」 ·
  「경고만 있는 활성화는 성공이다」(구 동작이 유지되는 쪽을 함께 못박는다) ·
  「구문검사 결과는 구 그대로 버린다」.
- **해소 마일스톤**: 없음 — 영구 차이(수리)다.
- **기계 장부 미반영**: **도구 응답과 요청 시퀀스 둘 다** 달라지므로 병합 뒤
  `harness/replay/divergences.ts`로 옮겨야 한다. 이 과제는 `harness/replay/**`가
  무접촉이다 — 옮기지 않은 채 재생을 켜면 이 갈래가 가짜 실패로 잡힌다.

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

---

## 제작 중 발견분 (append) — `text-element` · `screen` · `gui-status` 묶음

이 묶음의 16종을 지으며 나온 차이다. 예약 구간은 D91~D97이다. 파일 가운데가
아니라 여기 끝에 붙이는 것은 같은 물결의 다른 묶음 넷이 동시에 append 하고 있어
같은 자리를 물면 전면 충돌이 나기 때문이다(이 파일의 「기계 장부 반영 기록」
절도 같은 이유로 끝에 붙었다).

### D91 — 클라우드(JWT 인증) 거절 갈래를 짓지 않았다
- **분류**: 축소 — **해소 마일스톤 = 인증 확장(Basic 외) 마일스톤. D15·D30과 같은 자리.**
- **구 동작(실측)**: 이 묶음의 구 핸들러 16종이 전부 맨 앞에서
  `isCloudConnection()`을 물어보고 참이면 "Text elements are not available on
  cloud systems (ABAP Cloud)…" 류의 문구로 거절한다(예:
  `engine/src/handlers/text_element/high/handleGetTextElement.ts:70-76` ·
  `engine/src/handlers/screen/readonly/handleReadScreen.ts:49-53` ·
  `engine/src/handlers/gui_status/readonly/handleReadGuiStatus.ts:43-49`).
  그 판정의 정본은 `engine/src/lib/utils.ts:978-1002` — **묻는 것은 배포 축이
  아니라 `authType === 'jwt'`**다.
- **신 동작**: 그 갈래가 없다. 신 엔진의 인증은 Basic 하나뿐이라(`src/contracts.ts:42-48`
  — "M1 인증은 Basic만 다룬다") `authType === 'jwt'`가 될 수 있는 값이 아예 없고,
  16종 전부 `available_in: ['onprem','legacy']`이라 `SAP_SYSTEM_TYPE=cloud`에서는
  애초에 `tools/list`에 뜨지도 않는다(`src/safety/exposition.ts:177-195`).
  **없는 조건을 흉내 내는 분기를 지으면 영영 죽은 코드가 된다.**
- **대체 기대 시험**: 각 도구의 계약 시험이 붙잡는 「노출 선언」 절 —
  `available_in`이 `['onprem','legacy']`라는 것이 이 갈래를 대신하는 바닥선이다.
  (예: `sapkit-engine/src/tools/rfc-read/__tests__/getTextElement.test.ts`)
- **기계 장부 반영**: **안 했다** — 인증 종류는 접속 계층이고 도구 응답 시퀀스에
  나타나지 않는다. JWT 프로파일의 채록분 자체가 없다.

### D92 — `UpdateScreen`이 잠금 없이 화면을 갈아 끼우지 않는다
- **분류**: 강화(안전 바닥선을 올림)
- **구 동작(실측)**: `engine/src/handlers/screen/high/handleUpdateScreen.ts:94-133` —
  잠금 응답에서 `LOCK_HANDLE`을 못 꺼내면 `lockHandle`이 `undefined`인 채로
  **그대로 진행해** `DYNPRO_DELETE` + `DYNPRO_INSERT`를 보낸다. 해제도
  `if (lockHandle)`이라 건너뛴다. 같은 파일 계열의 다른 핸들러
  (`handleUpdateGuiStatus.ts:160-164` · `handleCreateTextElement.ts:161-165`)는
  같은 자리에서 "Failed to obtain lock handle for program …"으로 **던진다** —
  즉 구 엔진 안에서도 이 자리만 갈라져 있다.
- **신 동작**: `client.withLock()`이 소유한다. 잠금 응답에 `LOCK_HANDLE`이 없으면
  `protocol` 오류로 던지고(`src/adt/client.ts:344-354`), 화면 삭제·삽입은 나가지
  않는다. 실패 경로에서도 해제가 보장된다(`:387-406`).
- **판정 근거**: 잠기지 않은 화면을 지웠다 다시 넣는 것은 다른 세션의 편집을
  덮어쓸 수 있는 write다. 구 엔진 자신이 같은 묶음의 형제 핸들러에서 이것을
  실패로 다루므로, 안전한 쪽이 구의 의도이기도 하다.
- **대체 기대 시험**: `sapkit-engine/src/tools/write/__tests__/updateScreen.test.ts`의
  「장부 D92」 절.
- **기계 장부 반영**: **못 했다** — 이 과제는 `harness/replay/**`가 무접촉이다.
  오케스트레이터가 묶음 병합 뒤에 옮길 것. 와이어가 달라지는 차이(요청이 아예
  안 나간다)이므로 **기계 장부에 와야 한다.**

### D93 — 부모 프로그램 활성화의 **거짓 성공**을 접지 않는다 (쓰기 8종)
- **분류**: 수리(구의 거짓 성공을 고침)
- **구 동작(실측)**: 이 묶음의 쓰기 8종은 활성화 요청을 보낸 뒤 **응답을 읽지
  않는다** — `await makeAdtRequestWithTimeout(connection, '/sap/bc/adt/activation', …)`
  한 줄이고 반환값을 버린다(`handleCreateTextElement.ts:223-234` ·
  `handleUpdateTextElement.ts:202-213` · `handleCreateScreen.ts:136-147` ·
  `handleUpdateScreen.ts:163-174` · `handleCreateGuiStatus.ts:152-163` ·
  `handleUpdateGuiStatus.ts:188-199` · `handlePatchGuiStatus.ts:235-246`).
  SAP은 활성화 실패도 **HTTP 200 + 본문의 `<chkl:msg type="E">`** 로 답하므로,
  활성화가 실패해도 응답은 `activated: true`가 된다.
- **신 동작**: 요청 바이트는 구 그대로 두고(한 줄 XML · `encoding="utf-8"` ·
  Accept 미지정 · `long` 타임아웃 — `src/tools/write/internal/programScoped.ts`),
  응답 본문을 `parseActivationMessages`로 갈라 `E`/`A`/`X`가 있으면 실패로
  되돌린다.
- **판정 근거**: 이 레포의 CLAS 거짓 성공 실증 이력과 `CLAUDE.md` 안전 규칙
  ("write 성공 보고를 그대로 믿지 않는다"). 같은 수리가 D41·D51·D56·D66·D73에
  선례로 있다.
- **대체 기대 시험**: 쓰기 8종 각 시험 파일의 「장부 D93」 절
  (`sapkit-engine/src/tools/write/__tests__/createTextElement.test.ts` 외 7종).
- **기계 장부 반영**: **못 했다**(`harness/replay/**` 무접촉). 도구 응답이
  `isError`째로 달라지므로 **기계 장부에 와야 한다.**

### D94 — `WriteTextElementsBulk`의 `text_elements` 최소 길이가 발행 스키마에서 빠진다
- **분류**: 축소 — **해소 마일스톤 = 표면 채록본을 다시 뜨는 판**
- **구 동작(실측)**: 구 핸들러의 `inputSchema`에는 `text_elements.minItems: 1`이
  적혀 있다(`handleWriteTextElementsBulk.ts:58`). 그런데 **구 서버가 발행한
  표면에는 그 키가 없다** — 채록본
  (`harness/old-surface/m1-tools.json`의 `tools.WriteTextElementsBulk`)의
  `text_elements`는 `type`·`items`·`description`뿐이다. 구 서버가 JSON Schema를
  zod로 되돌렸다가 다시 내보내는 길에서 떨어진 것으로 보인다.
- **신 동작**: **채록본을 따른다.** 발행 선언이 채록본과 글자 일치해야 한다는
  것이 이 판의 하드 게이트이므로 `minItems`를 zod로 되살리지 않았다. 빈 배열
  거절은 스키마가 아니라 핸들러가 한다 — 구도 `:143-145`에서 그렇게 한다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/writeTextElementsBulk.test.ts`의
  「빈 배열은 핸들러가 거절한다」 절.
- **기계 장부 반영**: **안 했다** — 발행 선언이 채록본과 같으므로 재생 대조에
  나타날 차이가 아니다. 구 소스와 구 표면이 어긋난다는 기록이다.

### D95 — GUI 상태 쓰기 둘의 `oneOf`가 발행 스키마에서 빠진다
- **분류**: 축소 — **해소 마일스톤 = 표면 채록본을 다시 뜨는 판. D94와 같은 자리.**
- **구 동작(실측)**: `UpdateGuiStatus.cua_data`와 `PatchGuiStatus.changes`의 구
  소스 스키마에는 `oneOf: [{type:'string'},{type:'object'}]`가 적혀 있다
  (`handleUpdateGuiStatus.ts:40-44` · `handlePatchGuiStatus.ts:49-53`). 그런데
  **구 서버가 발행한 표면에는 그 키가 없다** — 채록본의 두 자리는 `description`
  한 줄뿐이다(D94의 `minItems`와 같은 유실 경로로 보인다: 구 서버가 JSON
  Schema를 zod로 되돌렸다가 다시 내보낸다).
- **신 동작**: **채록본을 따른다.** zod `unknown()`으로 선언해 `description`만
  나가게 했다. 글이든 객체든 받는 판정은 스키마가 아니라 핸들러의
  `normalizeCuaInput`이 한다 — 구도 같은 자리에서 같은 판정을 한다
  (`cuaSchema.ts:115-128`).
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/updateGuiStatus.test.ts`의
  「`cua_data`의 발행 스키마에는 `type`도 `oneOf`도 없다」 + 「글로 준 cua_data와
  객체로 준 것이 **같은 바이트**로 나간다」 두 건.
- **기계 장부 반영**: **안 했다** — 발행 선언이 채록본과 같으므로 재생 대조에
  나타날 차이가 아니다.

---

## 기계 장부 반영 기록 — D41~D105 판정 (append)

이 장부는 append-only다. 위 항목들의 본문은 그대로 두고, **어느 항목이
`harness/replay/divergences.ts`(기계가 읽는 형태)로 옮겨졌는지**를 여기 한 번에
적는다. 오브젝트 묶음 13개가 병렬로 돌면서 `harness/replay/**`를 무접촉으로 갖고
있었기 때문에 D41 이후는 이 문서에만 쌓였다 — `ADDING-A-TOOL.md` 부록 A가 열어
둔 통로가 그것이고, **그 일은 끝났다.** (선례: 위쪽 「기계 장부 반영 기록 —
D21~D40 판정」.)

### 이 판이 쓴 가름선 — 「재생 대조가 실제로 보는 표면인가」

부록 A의 기준은 **"와이어나 도구 응답이 달라지면 기계 장부에도 온다"**이다.
그 기준을 이 판에서 적용하며 한 가지를 실측으로 좁혔다.

**픽스처는 도구 호출과 그 응답만 담는다.** 형식 정본
(`harness/recorder/types.ts`의 `SequenceStep`)의 필드는 `index`·`tool`·`args`·
`response`·`isError`·`note`뿐이고, HTTP 요청의 **주소·본문·헤더·개수는 담기지
않는다.** 재생 러너도 그 투영만 견준다(`replay.ts` — `comparableFixture`). 그래서

> **SAP이 다르게 답하지 않는 HTTP 와이어 차이는 재생 대조에 나타나지 않는다.**

이 사실이 판정을 가른다. 그런 항목을 등재하면 두 가지가 동시에 일어난다.
⑴ 발동할 자리가 없어 **아무 일도 하지 않고**, ⑵ 채록 쪽에 그 자리를 가리키는
표식이 없으므로 `applies`가 **도구 이름 전체로 넓어져** 그 도구의 모든 차이를
등재로 삼킨다. ⑵는 기계 장부 머리주석이 명시적으로 금하는 모양이다("등재는
차이가 났을 때만 발동해야 하고, 그 도구의 모든 단계를 대조 밖에 두는 형태가
되면 안 된다").

**그래서 와이어에만 남는 차이는 옮기지 않았다.** 옮기지 않은 결과는 "그 차이가
나면 결함으로 잡힌다"인데, 그 방향이 옳다 — 그 자리들은 전부 *신이 옳다는 증명이
아직 없는* 축소·미실측이기 때문이다(아래 표의 근거 참조).

### 판정표 — D41~D105 전건

| # | 기계 장부 | 근거 한 줄 |
|---|---|---|
| D41 | **옮김** | 활성화 거짓 성공 수리 — 구가 `activated:true`로 답한 자리에서 신이 `isError`로 되돌린다 |
| D46 | **옮김** | `code_objects`의 `code`가 `null`→본문으로 채워지고 중첩 인클루드가 는다 — 응답 본문 |
| D51 | **옮김** | 활성화 거짓 성공 수리 (D41과 같은 계열) |
| D52 | 안 옮김 | 이 문서 D52 본문이 스스로 "재시도가 성공하든 실패하든 **도구 응답은 한 글자도 달라지지 않는다**"고 적었다. 갈리는 것은 왕복 수와 5초의 정지뿐이고, 픽스처는 왕복을 담지 않는다 |
| D56 | **옮김** (3종) | 활성화 거짓 성공 수리. **`CreateTable`은 뺐다** — 그 도구는 활성화를 부르지 않는다(`src/tools/write/createTable.ts` 머리주석). 넣으면 활성화와 무관한 차이까지 덮는다 |
| D61 | **옮김** (이연) | 구 ECC 브리지 갈래는 `path:'ecc-odata-rfc'`를 실은 **성공**이고 신은 거절한다 — 응답이 갈린다. 다만 축소분이 옳다는 것을 재생이 증명할 수 없어 `check: null`(D37과 같은 모양) |
| D62 | 안 옮김 | 생성 POST 본문의 소유자 속성 — 와이어. 게다가 이 문서 D62 본문이 "실제로 관찰되는 경로는 ⑵ 하나"라고 적었으므로 값 자체가 갈리지 않는다 |
| D66 | **옮김** | 활성화 거짓 성공 수리 |
| D71 | 안 옮김 | 생성 페이로드 속성 — D62와 같은 자리 |
| D72 | 안 옮김 | UNLOCK URI 대소문자 — 해제의 실효 열쇠는 `lockHandle`이고(D72 본문) 양쪽 다 해제에 성공하므로 응답이 같다 |
| D73 | **옮김** | 활성화 거짓 성공 수리 |
| D76 | 안 옮김 | GET 본문 유무 — ADT가 읽지도 않는 자리다(D76 본문). 응답이 갈리면 그것은 새 사실이고 결함으로 드러나야 한다 |
| D77 | **옮김** | `type:'json'` → text 그릇 (D36의 같은 규칙). 응답 봉투가 갈린다 |
| D81 | **옮김** | 성공 응답의 `transport_request`와 `message`가 갈린다 |
| D82 | 안 옮김 | `?user=`·`tm:owner` — 이 문서 D82 본문이 "셋째 갈래는 실사용에서 걸리지 않는다"고 적었다. 값이 실제로 갈리면 목록 내용이 달라지는데 신이 옳다는 증명이 없으므로 **결함으로 잡히는 쪽이 옳다** |
| D91 | 안 옮김 | 인증 계층 — JWT 채록분 자체가 없다(D21·D22와 같은 자리). 지목자 판단과 같다 |
| D92 | 안 옮김 | 잠금 핸들 부재라는 **비정상 SAP 상태**에서만 갈리고, 채록 쪽에 그 자리의 표식이 없다. 등재하면 `applies`가 `UpdateScreen` 전체를 덮고 **D93과 겹쳐** 배열 순서가 판정을 정한다(기계 장부 규칙 ①). 지금은 그 갈래가 나면 D93의 대체 기대 시험이 "활성화 실패를 말하지 않는 오류"로 보고 `allowlisted-fail`로 떨어뜨린다 — 삼키지 않고 사람에게 올린다 |
| D93 | **옮김** (7종) | 활성화 거짓 성공 수리. `WriteTextElementsBulk`는 뺐다 — ADT 활성화를 부르지 않고 TPOOL RFC 한 번으로 끝난다 |
| D94 | 안 옮김 | 발행 선언이 채록본과 글자 일치한다. 지목자 판단과 같다 |
| D95 | 안 옮김 | D94와 같은 자리. 지목자 판단과 같다 |
| D98 | 안 옮김 | BDEF 생성 페이로드의 소유자 속성 — D62와 같은 자리 |
| D99 | **옮김** (2종) | 활성화 거짓 성공 수리 |
| D100 | **옮김** | 활성화 거짓 성공 수리 |
| D101 | 안 옮김 | 잠금 요청 본문 — 그 본문이 잠금 성패를 가르는지가 **이 판에서 실측되지 않았다**(D101 본문). 가른다면 도구가 실패하고, 그것은 등재로 덮을 것이 아니라 attended에서 확인할 자리다 |
| D103 | **옮김** (2종) | 활성화 거짓 성공 수리 |
| D104 | 안 옮김 | 이 문서 D104 본문이 스스로 "결과에는 안 보이고 **와이어에만 남는 요청**"이라고 적었다 |
| D105 | **옮김** | 활성화 거짓 성공 수리. 실패 경로에서 짧아지는 요청 시퀀스는 와이어라 대조에 안 나타나고, 응답 쪽만 등재된다 |

**결번**(D42~D45 · D47~D50 · D53~D55 · D57~D60 · D63~D65 · D67~D70 · D74·D75 ·
D78~D80 · D83~D90 · D96·D97 · D102)은 위 「번호 예약」 절이 적은 대로 예약 구간을
다 쓰지 않은 자리다. 차이가 아니므로 판정 대상도 아니다.

### 활성화 거짓 성공 계열을 왜 **한 항목으로 뭉치지도, 도구마다 쪼개지도** 않았나

옮긴 열넷 중 열(D41·D51·D56·D66·D73·D93·D99·D100·D103·D105)이 같은 종류다 —
구가 활성화 실패를 성공으로 접던 것을 신이 되돌린다. 두 극단을 다 버렸다.

- **하나로 뭉치면** `applies`가 "쓰기 도구인데 `activated:true`를 답한 단계 전부"가
  된다. 그러면 **등재된 적 없는 도구까지 덮는다** — 같은 결함을 갖고 있었으나
  장부에 오르지 않은 채 고쳐진 `UpdateClass`와 M1 쓰기 4종이 실제로 그렇다
  (이 문서 D41·D56의 「비고」). 등재는 그 누락을 덮는 것이 아니라 드러내야 한다.
- **도구마다 새 id로 쪼개면** 기계 장부가 이 문서의 **투영이 아니게 된다.**
  `DivergenceEntry.id`의 계약은 "장부의 항목 번호"다.

그래서 **이 문서의 D 번호 하나 = 기계 항목 하나**로 두되, 각 항목의 `applies`가
**그 항목 본문이 이름 붙인 도구 집합만** 든다(`D41_TOOLS` … `D105_TOOLS`).
집합끼리 겹치지 않으므로 배열 순서가 판정을 정하지 않는다(기계 장부 규칙 ①).
집합에서 실제로 뺀 것이 둘 있다 — `CreateTable`(D56)과
`WriteTextElementsBulk`(D93)는 활성화를 부르지 않는다.

### 옮긴 것들이 지키는 것

- **면제가 아니라 재대조다.** 활성화 계열의 공용 검사는 "신이 오류로 답했다"만으로
  통과시키지 않는다 — 잠금 충돌·403·구문검사 실패도 같은 모양이 되기 때문이다.
  신 쪽 문구가 **활성화 실패를 이름으로 말하는지**(`Activation failed: … was not
  activated` — `src/tools/write/shared.ts`를 거친 열여섯 자리의 공통 모양)까지
  본다. 다른 이유로 막혔으면 `allowlisted-fail`이다.
- **`activate=false`로 부른 단계는 등재 밖이다.** 구 응답이 활성화를 주장하지
  않으면 `applies`가 걸리지 않고 그대로 대조된다.
- D46·D81은 **구가 싣던 값이 그대로인지**를 되본다. D46은 `code`가 채워지는 것과
  인클루드가 느는 것만, D81은 `transport_request`·`message`만 등재된 자리다.
  그 밖이 달라지면 `allowlisted-fail`이다.
- **D61만 이연**이다(`check: null`). 축소분이 옳다는 것을 재생이 증명할 수 없어
  판정 자리를 계약 시험에 둔다 — 재생은 그 단계를 통과가 아니라 **무증거**로 센다.

### 아직 비어 있는 자리 (다음 판이 갚을 것)

1. **`UpdateClass`와 M1 쓰기 4종의 같은 수리가 등재되지 않았다.** 이 문서 D41의
   「비고」와 D56의 「선행 항목이 없다는 관찰」이 같은 것을 가리킨다. 등재하려면
   구 동작의 실측(파일·줄)과 새 D 번호가 필요하므로 **이 과제의 범위 밖**이다 —
   지금은 그 차이가 나면 `mismatch`(결함)로 잡힌다.
2. **D92의 잠금 핸들 부재 갈래**는 attended에서 확인할 자리다(위 표 참조).
3. **D101의 BDEF 잠금 본문**이 잠금 성패를 가르는지도 attended 확인 자리다.
4. **D61의 ECC 채록분이 없다.** 등재는 해 뒀으나 `SAP_VERSION=ECC` 시퀀스를
   딴 적이 없어 발동을 실측한 적이 없다.
## 제작 중 발견분 (append) — `tail-read` 묶음 (조회 계열 11종 + `CreatePackage`)

꼬리 묶음 셋이 동시에 도는 중이라 예약 구간이 나뉘어 있다. 이 묶음의 구간은
**D130~D139**이고, 파일 가운데가 아니라 여기 끝에 붙이는 것은 같은 물결의 다른
묶음 둘이 동시에 append 하고 있어 같은 자리를 물면 전면 충돌이 나기 때문이다.

### D130 — `GetObjectNodeFromCache`는 **캐시가 없으므로 언제나 「없다」로 답한다** (D33을 닫는다)

- **분류**: 축소 — **해소 마일스톤 = 도구 사이 캐시의 자리(프로세스 전역이냐
  접속 수명이냐)를 정하고 그것을 채우는 다섯 도구를 함께 고치는 판.**
  D33이 그 판정을 "`GetObjectNodeFromCache`를 짓는 마일스톤"으로 미뤄 두었고,
  **이 항목이 그 자리에서 내린 판정이다.**
- **구 동작(실측)**: `engine/src/lib/getObjectsListCache.ts`는 모듈 수준 싱글턴이고
  다섯 도구가 마지막 결과를 얹는다 — `SearchObject`(`handleSearchObject.ts:139`) ·
  `GetTypeInfo`(`handleGetTypeInfo.ts:232`·`:251`) ·
  `GetWhereUsed`(`handleGetWhereUsed.ts:111`) ·
  `GetObjectsByType`(`handleGetObjectsByType.ts:175`·`:191`·`:254`) ·
  `GetObjectsList`(`handleGetObjectsList.ts:210`). 읽는 것은
  `handleGetObjectNodeFromCache.ts:41` 하나뿐이다.
  **프로세스가 갓 떴을 때의 구 동작을 실측했다**: `getCache()`가 `null`이므로
  `node`가 `null`로 남고(`:41-51`) 곧바로 `isError: true` +
  `Node not found in cache`로 접힌다(`:52-59`). **SAP 호출은 한 발도 나가지
  않는다** — ADT를 부르는 것은 캐시 적중 뒤 `OBJECT_URI` 확장 갈래뿐이다(`:61-98`).
- **신 동작**: 캐시를 만들지 않고, **구의 캐시-빈-상태 갈래를 글자까지 그대로**
  옮겼다. 인자 검증 → `object_type, object_name, tech_name required`,
  그 밖에는 `Node not found in cache`. 접속을 만들지 않는다.
  **`OBJECT_URI` 확장 갈래는 옮기지 않았다** — 도달할 수 없는 코드를 미리 써
  두는 것이 곧 추측이기 때문이다.
- **근거 — 고를 수 있던 길 셋 중 왜 이것인가**:
  ⑴ *캐시를 새로 만들고 `GetObjectsList` 하나만 채운다* — 다섯 중 하나만 채운
  캐시는 "`GetObjectsList`를 먼저 부른 사람에게만 동작하는 도구"를 만든다.
  **D33이 이미 물리쳤다: 절반 찬 캐시는 빈 캐시보다 나쁘다.**
  ⑵ *다섯 도구에 모두 붙인다* — 그중 넷(`SearchObject`·`GetTypeInfo`·
  `GetWhereUsed`·`GetObjectsByType`)이 이 묶음 과제의 **무접촉 구역**이고,
  프로세스 전역 가변 상태를 되살릴지는 도구 묶음 하나가 정할 문제가 아니다.
  ⑶ *구의 빈-캐시 갈래를 그대로 옮긴다* ← 골랐다. **추측이 아니다** — 구도 갓
  뜬 프로세스에서 똑같이 답하므로, 갈라지는 것은 "앞선 도구가 캐시를 채운 뒤"
  하나뿐이고 그 조건은 신 엔진에 존재하지 않는다.
- **⚠ 실사용에 주는 뜻**: 이 도구는 신 엔진에서 **성공 응답을 낼 수 없다.**
  대장에 「증거 있음」으로 잡히더라도 그것은 "빈-캐시 갈래가 구와 같다"는 증거지
  "캐시 조회가 동작한다"는 증거가 아니다. 캐시를 여는 마일스톤이 이 항목을
  닫거나 결함으로 승격한다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/read/__tests__/getObjectNodeFromCache.test.ts` —
  「캐시 없음 갈래」 3건(문구 일치 + **접속 시도 0회**) · 「인자 갈래」 4건.
- **기계 장부 미반영**: 이 묶음 과제는 `harness/replay/**`가 무접촉이라
  `divergences.ts`에 옮기지 못했다. **도구 응답이 달라지는 항목**이다(캐시를
  채우는 도구를 먼저 부른 시퀀스에서 구는 마디를, 신은 오류를 답한다) — 묶음
  병합 뒤 오케스트레이터가 옮긴다. D33 본문은 append-only라 고치지 않았고,
  그 항목의 「안 옮김」 판정(**읽는 도구가 등록점에 없다**)은 **이 커밋으로
  전제가 깨졌다** — 옮길 때 D33이 아니라 이 D130을 옮겨라.

### D131 — `*Low` 두 도구의 세션 복원에서 **`sap-adt-connection-id`를 갈아 끼우지 않는다**

- **분류**: 축소 — **해소 마일스톤 = 접속 계층에 「호출자가 준 세션 ID를 쓰는」
  통로를 여는 자리.** 지금은 그 통로 자체가 없다.
- **적용 도구 2종**: `GetNodeStructureLow` · `GetObjectStructureLow`.
- **구 동작(실측)**: 두 겉 핸들러는 `session_id`와 `session_state`가 **둘 다**
  있을 때 `restoreSessionInConnection`을 부른다
  (`engine/src/handlers/system/low/handleGetNodeStructure.ts:92-101` ·
  `handleGetObjectStructure.ts:80-89`). 그 함수가 하는 일은 둘이다
  (`engine/src/lib/utils.ts:763-788`):
  ⑴ `connection.setSessionId(sessionId)` — 접속의 `sap-adt-connection-id` 헤더
  값을 호출자가 준 문자열로 **바꾼다**
  (`@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:101-104`
  가 필드를 갈고 `:170-173`이 그 값을 헤더에 싣는다).
  ⑵ `connection.setSessionType('stateful')` — 이후 요청에
  `x-sap-adt-sessiontype: stateful`이 붙는다(`:176`).
  **`session_state`의 내용은 읽지 않는다** — 인자 이름이 `_sessionState`이고
  쿠키도 CSRF 토큰도 꺼내 쓰지 않는다.
- **신 동작**: ⑵만 승계한다(`src/tools/read/internal/lowLevelSession.ts`).
  ⑴은 하지 않으므로 `sap-adt-connection-id`에는 접속 계층이 스스로 만든 UUID가
  그대로 실린다.
- **근거**: 신 `AdtClient`의 `connectionId`는 인스턴스 생성 때 정해지고 바꾸는
  공개 통로가 없다(`src/adt/client.ts`). 그것을 여는 일은 **접속 계층을 고치는
  일**이고, 도구 묶음 하나가 자기 도구 둘 때문에 모든 도구가 쓰는 계층의 세션
  식별자 수명을 바꾸는 것은 범위를 넘는다. 게다가 이 통로는 **실사용에서 닿기
  어렵다** — 값을 내주는 `GetSession`이 `session_state`에 언제나 `null`을 싣기
  때문에(`engine/src/handlers/system/readonly/handleGetSession.ts:69`) 두 인자를
  모두 채우려면 사용자가 상태를 손으로 지어내야 한다.
- **대체 기대 시험**: 승계한 절반이 실제로 동작하고 조건이 구와 같은 `&&`인지를
  못 박는다 —
  `sapkit-engine/src/tools/read/__tests__/getNodeStructureLow.test.ts`의
  「세션 복원 갈래」 3건 ·
  `sapkit-engine/src/tools/read/__tests__/getObjectStructureLow.test.ts`의
  같은 절.
- **기계 장부 미반영**: 이 묶음 과제는 `harness/replay/**`가 무접촉이라
  `divergences.ts`에 옮기지 못했다. **요청 헤더 한 줄의 값이 달라지므로 기계
  장부에도 와야 하는 항목**이다 — 묶음 병합 뒤 오케스트레이터가 옮긴다.

### D132 — `GetBadiImplementations`의 **ECC 브리지가 없다** (D61과 같은 결, 통로가 하나뿐이라 더 무겁다)

- **분류**: 축소 — **해소 마일스톤 = `src/rfc`의 OData 통로에 FunctionImport
  `DdicBadi`를 여는 자리.** D61이 여는 DDIC 4종과 같은 작업 묶음이다.
- **구 동작(실측)**: 이 도구의 유일한 통로가 ECC 브리지다. 겉 핸들러가
  `callDdicBadi`를 부르고
  (`engine/src/handlers/enhancement/readonly/handleGetBadiImplementations.ts:100-105`)
  그것은 `engine/src/lib/rfcBackend.ts:123-126`을 거쳐
  `engine/src/lib/odataRfc.ts:511-537`의 `postFunctionImport('DdicBadi', …)`로
  내려간다. 인자는 `IV_BADI_DEFINITION`·`IV_CUSTOMER_ONLY`·`IV_ACTIVE_ONLY`·
  `IV_INCLUDE_METHODS`이고 불리언은 `'X'`/`''`로 실린다. **S/4HANA 경로는 구에도
  없다** — `SAP_VERSION !== 'ECC'`면 겉 핸들러가 안내 문구만 돌려준다(`:83-89`).
- **신 동작**: 갈래를 정직하게 둘로 나눈다.
  ⑴ ECC가 **아니면** 구의 문구를 **글자 그대로** 돌려준다(이 갈래는 구와 완전히
  같다). ⑵ ECC**면** 브리지 부재를 알리고 멈춘다 — 문구가 브리지 함수모듈
  이름과 이 항목 번호(D132)를 지목한다. **어느 갈래에서도 접속을 만들지 않는다.**
- **근거**: 신 엔진의 OData 통로가 가진 FunctionImport는 셋뿐이고
  (`src/rfc/odata.ts:54` — `Dispatch`·`Textpool`·`DdicTablRead`), DDIC 읽기
  능력도 `callDdicTablRead` 하나다(`src/rfc/types.ts:72-78`). `DdicBadi`를 여는
  일은 `src/rfc/**`를 고치는 작업이고 이 묶음 과제의 무접촉 구역이다.
  **조용히 ADT로 흘려보내지 않는 이유**는 D61과 같다 — ECC 커널(BASIS < 7.50)에는
  `datapreview`·`ddic`·`enhsxsb` 엔드포인트가 없어서 그 404가 "BAdI가 없다"로
  읽힌다. 없는 것은 BAdI가 아니라 엔드포인트다.
- **⚠ D61과 다른 점**: 데이터 엘리먼트·도메인은 비-ECC에서 ADT 직통이 **살아
  있지만**, 이 도구는 통로가 브리지 하나뿐이라 **어느 시스템에서도 성공 응답을
  낼 수 없다.** 대장에 「증거 있음」으로 잡히더라도 그것은 "두 거절 갈래가
  옳다"는 증거다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/read/__tests__/getBadiImplementations.test.ts` —
  「ECC가 아닌 갈래」 6건(구 문구 글자 일치 + `' ECC '`가 갈리지 않는 것) ·
  「ECC 갈래」 4건(문구가 `ZMCP_ADT_DDIC_BADI`·`DdicBadi`·`D132`를 지목 +
  **접속 시도 0회**) · 「인자 갈래」 1건.
- **기계 장부 미반영**: 이 묶음 과제는 `harness/replay/**`가 무접촉이라
  `divergences.ts`에 옮기지 못했다. **도구 응답이 달라지는 항목**이다(ECC
  시스템에서 구는 브리지 결과를, 신은 거절을 답한다) — 묶음 병합 뒤
  오케스트레이터가 옮긴다.
## 제작 중 발견분 (append) — `tail-test` 묶음 (단위시험 · CDS 단위시험 · Update 계열)

이 묶음의 12종을 지으며 나온 차이다. 예약 구간은 **D120~D129**다. 파일 가운데가
아니라 여기 끝에 붙이는 것은 꼬리 묶음 셋이 동시에 append 하고 있어 같은 자리를
물면 전면 충돌이 나기 때문이다(앞선 물결의 묶음들도 같은 이유로 끝에 붙였다).

### D120 — `UpdateCdsUnitTest`가 활성화 **거짓 성공**을 성공으로 접지 않는다
- **분류**: 수리(구의 거짓 성공을 고침)
- **구 동작(실측)**: 구 핸들러는 벤더 `AdtCdsUnitTest.update()`를 부르고
  (`engine/src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts:75-79`), 그것이
  `adtLocalTestClass.update(…, { activateOnUpdate: true })`로 넘어가
  (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/unitTest/AdtCdsUnitTest.js:146-171`)
  해제 뒤 활성화 요청을 **보내기는 한다**(`.../core/class/AdtLocalTestClass.js:227-235`).
  그런데 그 **응답 본문을 읽지 않는다** — `activateObjectInSession`이 응답을 그대로
  돌려주고(`.../utils/activationUtils.js:116-133`), `AdtClass.activate()`는 HTTP 4xx
  에서만 던진다(`.../core/class/AdtClass.js:436-468`). **SAP은 활성화 실패도 HTTP
  200으로 답하며 `<chkl:msg type="E">`를 담으므로**, 깨진 시험 클래스가
  `CDS unit test class … updated successfully.`로 보고된다.
- **신 동작**: 요청 바이트는 구 그대로 두고(`?method=activate&preauditRequested=true`
  · `application/vnd.sap.adt.activation+xml` · 해제 **뒤**), 응답 본문을
  `parseActivationMessages`로 갈라 `E`/`A`/`X`가 있으면 실패로 되돌린다. 문구에는
  모든 오류를 줄번호와 함께 담고 "갱신본은 인액티브 버전으로 올라가 있고 활성
  버전은 그대로"라는 사실을 함께 적는다. 경고(`W`)만 있으면 구와 같이 성공이다.
- **판정 근거**: **같은 사슬의 같은 자리**에 선례가 둘 있다 — D2(`UpdateLocalTypes`) ·
  D41(`UpdateLocalTestClass`). 이 도구는 그 둘과 같은 `testclasses` 인클루드 쓰기이며,
  여기만 구를 재현하면 한 엔진 안에서 같은 실패에 세 도구가 다르게 답한다. 게다가
  요구 급이 `계약 시험`이라 **사람 실기로 뒤늦게 잡을 기회가 없다**(D2·D41은 그
  선택지가 있었다). 이 레포의 CLAS 거짓 성공 실증 이력과 `CLAUDE.md` 안전 규칙
  ("write 성공 보고를 그대로 믿지 않는다")이 그 위에 있다.
- **대체 기대 시험**: `sapkit-engine/src/tools/write/__tests__/updateCdsUnitTest.test.ts`의
  「D120」 절 — 활성화가 언제나 나가는가 · 해제 뒤인가 · 200에 실린 `E`를 실패로
  되돌리는가 · `A`도 실패인가 · `W`만 있으면 성공인가(구 동작이 유지되는 쪽을 함께
  못박는다) · 실패해도 PUT은 이미 나갔다는 사실이 문구에 있는가.
- **해소 마일스톤**: 없음 — 영구 차이(수리)다.
- **기계 장부 반영**: **못 했다** — 이 과제는 `harness/replay/**`가 무접촉이다.
  도구 응답이 `isError`째로 달라지므로 **기계 장부에 와야 한다.** 오케스트레이터가
  묶음 병합 뒤에 옮긴다. 옮기기 전에 재생을 켜면 이 갈래가 가짜 실패로 잡힌다.

### D121 — `UpdateLocalDefinitions`가 `activate_on_update:true`의 **거짓 성공**을 고쳤다
- **분류**: 수리(구의 거짓 성공을 고침)
- **구 동작(실측)**: `AdtLocalDefinitions`는 부모 `AdtClass`를 상속하면서 `update()`를
  **재정의**하는데, 그 본문
  (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtLocalDefinitions.js:157-229`)
  이 `options`에서 읽는 것은 `lockHandle`과 `sourceCode`뿐이다 — **`activateOnUpdate`를
  한 번도 읽지 않는다.** 부모 `AdtClass.update()`에는 활성화 단계가 있지만 재정의가
  그것을 가린다. 그런데 겉 핸들러는 그 플래그를 넘긴 뒤
  (`engine/src/handlers/class/high/handleUpdateLocalDefinitions.ts:87`) 응답에
  `activated: activate_on_update`를 그대로 실었다(`:139`). 즉 **활성화 요청이 한 건도
  나가지 않은 채 "활성화됨"** 이라고 답했다.
- **우연한 누락이 아니라는 근거**: 같은 패키지의 **형제 재정의**
  `AdtLocalTestClass.update()`(`AdtLocalTestClass.js:227-235`)에는 "Step 5: Activating
  parent class"가 있다. 한쪽에만 있다.
- **신 동작**: 요청받았으면 해제 뒤에 실제로 활성화하고, **활성화 응답 본문을
  판정한다** — SAP은 활성화 실패도 HTTP 200으로 답하며 `<chkl:msg type="E">`를 담으므로
  보내기만 하고 안 읽으면 거짓 성공이 자리만 옮긴다. 경고(`W`)만 있으면 성공이다.
- **판정 근거**: **같은 사슬의 같은 자리**에 선례가 둘 있다 — D2(`UpdateLocalTypes`) ·
  D41(`UpdateLocalTestClass`). 여기만 구를 재현하면 한 엔진 안에서 같은 실패에 도구마다
  다르게 답한다. 요구 급이 `계약 시험`이라 사람 실기로 뒤늦게 잡을 기회도 없다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/updateLocalDefinitions.test.ts`의 「D121」 절.
- **해소 마일스톤**: 없음 — 영구 차이(수리)다.
- **기계 장부 반영**: **못 했다**(`harness/replay/**` 무접촉). 도구 응답이 `isError`째로
  달라지므로 **기계 장부에 와야 한다.** 오케스트레이터가 묶음 병합 뒤에 옮긴다.

### D122 — `UpdateLocalMacros`가 `activate_on_update:true`의 **거짓 성공**을 고쳤다
- **분류**: 수리(구의 거짓 성공을 고침)
- **구 동작(실측)**: D121과 **같은 모양**이다. `AdtLocalMacros.update()`
  (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/class/AdtLocalMacros.js:158-230`)
  가 `options`에서 읽는 것은 `lockHandle`과 `sourceCode`뿐이고 **`activateOnUpdate`를
  한 번도 읽지 않는다.** 그런데 겉 핸들러는 그 플래그를 넘긴 뒤
  (`engine/src/handlers/class/high/handleUpdateLocalMacros.ts:85`) 응답에
  `activated: activate_on_update`를 그대로 실었다(`:130`).
- **신 동작**: 요청받았으면 해제 뒤에 실제로 활성화하고, 활성화 응답 본문의
  `E`/`A`/`X`를 실패로 판정한다. 경고(`W`)만 있으면 성공이다.
- **판정 근거**: D2 · D41 · D121과 **같은 사슬의 같은 자리**다. 짝인
  `UpdateLocalDefinitions`만 고치고 여기를 두면 인클루드 이름 하나 차이로 안전
  바닥선이 갈린다. 요구 급이 `계약 시험`이라 사람 실기로 뒤늦게 잡을 기회도 없다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/updateLocalMacros.test.ts`의 「D122」 절.
- **해소 마일스톤**: 없음 — 영구 차이(수리)다.
- **기계 장부 반영**: **못 했다**(`harness/replay/**` 무접촉). 도구 응답이 `isError`째로
  달라지므로 **기계 장부에 와야 한다.** 오케스트레이터가 묶음 병합 뒤에 옮긴다.
### D123 — 함수그룹 잠금 응답의 `sap-adt-lm-handle` **헤더** 경로를 승계하지 않는다
- **분류**: 축소 — **해소 마일스톤 = 접속 계층(`src/adt/client.ts`)이 잠금 응답 헤더
  경로를 지원하는 판. 그때까지는 본문 경로만 쓴다.**
- **구 동작(실측)**: 벤더 `lockFunctionGroup`
  (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/functionGroup/lock.js:57-79`)
  은 손잡이를 **응답 헤더 `sap-adt-lm-handle`에서 먼저** 찾고, 없을 때만 본문의
  `asx:abap → asx:values → DATA → LOCK_HANDLE`로 내려간다. **함수그룹만 그렇다** —
  같은 패키지의 도메인·데이터엘리먼트·클래스 잠금(`core/domain/lock.js:57-79` 등)은
  본문만 읽는다.
- **신 동작**: 접속 계층의 `client.withLock()`이 잠금 수명주기를 소유하고, 그 안의
  `parseLockResult`(`src/adt/client.ts:170-186`)는 **본문만** 읽는다. 헤더에만
  손잡이를 싣는 시스템에서는 `protocol` 오류로 던지고 PUT이 나가지 않는다.
- **판정 근거**: ⑴ 벤더 자신이 본문 경로를 폴백으로 갖고 있고 다른 오브젝트 종류는
  전부 본문만 읽는다 — 본문이 ADT의 보편 형태다. ⑵ 헤더 경로를 살리려면 모든 묶음이
  함께 쓰는 `withLock`을 고쳐야 하는데, 이 꼬리 과제가 접속 계층을 건드리는 것은
  범위 밖이고 병렬 묶음들과 충돌한다. ⑶ 실패해도 **fail-closed**다(쓰기가 나가지
  않는다) — 조용히 잘못된 손잡이로 PUT 하는 것보다 낫다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/updateFunctionGroup.test.ts`의 「와이어」 절 —
  본문에 손잡이를 실은 잠금 응답으로 사슬이 끝까지 도는 것을 확인한다(PUT의
  `lockHandle` 질의 인자 대조).
- **기계 장부 반영**: **안 했다** — 채록된 실 SAP 응답은 본문에 손잡이를 싣는
  형태이므로 재생 대조에 이 갈래가 나타나지 않는다. 나타나는 순간(헤더 전용 응답이
  채록되면) 이 항목을 기계 장부로 옮기고 접속 계층을 고쳐야 한다.

### D124 — 함수그룹 콘텐츠 타입 협상 캐시가 `CreateFunctionGroup`과 **공유되지 않는다**
- **분류**: 축소 — **해소 마일스톤 = 함수그룹 두 도구의 협상 캐시를 한 자리로 모으는
  판(생성 쪽 모듈이 협상을 내보내거나, 공용 모듈로 옮기는 정리).**
- **구 동작(실측)**: 협상 결과는 **접속 객체 하나에 한 벌**이고 생성·갱신이 함께
  썼다(`engine/src/lib/adtFunctionGroupContentTypes.ts:109-112`의 `negotiatedCache` —
  "stdio mode reuses one connection for the whole session"). 그래서 한 세션에서
  `CreateFunctionGroup` 뒤에 `UpdateFunctionGroup`을 부르면 `GET /sap/bc/adt/discovery`가
  **한 번만** 나갔다.
- **신 동작**: `src/tools/write/createFunctionGroup.ts`가 협상과 캐시를 모듈 사설로
  갖고 있고 내보내지 않으므로, 갱신 쪽은
  `src/tools/write/functionGroupContentTypes.ts`에 캐시를 하나 더 둔다. 한 세션에서 두
  도구를 이어 부르면 discovery 왕복이 **한 번 더** 나간다. 협상 결과 자체와 PUT에
  실리는 헤더 두 줄은 구와 같다.
- **판정 근거**: 이 꼬리 과제는 **다른 묶음의 도구 파일을 고치지 않는다**는 제약을
  받는다(`createFunctionGroup.ts`는 function-group 묶음 소유). 문서 파싱 두 조각은 그
  모듈이 이미 내보내고 있어 **가져다 쓰되**, 캐시만 갈라진다. 결과가 달라지는 것이
  아니라 왕복 한 번이 더해질 뿐이며, 실패는 양쪽 다 캐시하지 않는다.
- **대체 기대 시험**:
  `sapkit-engine/src/tools/write/__tests__/updateFunctionGroup.test.ts`의
  「콘텐츠 타입 협상」 절 — 광고된 판 고르기 · 다판 중 최고판 · discovery 불가 시 v3
  폴백 · 협상이 잠그기 전이라는 순서까지 붙잡는다.
- **기계 장부 반영**: **못 했다**(`harness/replay/**` 무접촉). 두 도구를 이어 부르는
  시나리오에서는 **요청 수가 달라지므로 기계 장부에 와야 한다.** 오케스트레이터가
  묶음 병합 뒤에 옮긴다.

### D125 — `UpdateDomain`이 활성화 **거짓 성공**을 성공으로 접지 않는다
- **분류**: 수리(구의 거짓 성공을 고침)
- **구 동작(실측)**: 벤더 `activateDomain`은 `activateObjectInSession`의 응답을
  **그대로 돌려주고**
  (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/domain/activation.js:15-17`),
  `AdtDomain.activate()`도 그것을 상태에 담을 뿐 판정하지 않는다
  (`.../core/domain/AdtDomain.js:390-406`). 겉 핸들러 역시 반환값을 버린다
  (`engine/src/handlers/domain/high/handleUpdateDomain.ts:243-245`). **SAP은 활성화
  실패도 HTTP 200으로 답하며 `<chkl:msg type="E">`를 담으므로**, 활성화되지 않은
  도메인이 `Domain … updated and activated successfully` · `status: "active"`로
  보고된다.
- **짝은 이미 옳다**: 같은 물결의 데이터 엘리먼트는 벤더가 판정한다
  (`.../core/dataElement/activation.js:69-72` — `chkl:properties`의
  `activationExecuted`·`checkExecuted`를 읽고 던진다). 두 DDIC 오브젝트에서 한쪽만
  판정하는 것이 벤더의 실측 상태이고, 그래서 `UpdateDataElement`에는 고칠 것이 없었다.
- **신 동작**: 요청 바이트는 구 그대로 두고(`?method=activate&preauditRequested=true` ·
  `application/vnd.sap.adt.activation+xml` · `Accept: application/xml` · 한 줄 XML 본문),
  응답 본문의 `E`/`A`/`X`를 실패로 되돌린다. 경고(`W`)만 있으면 구와 같이 성공이다.
- **왜 짝인 `CreateDomain`은 그대로인가**: 그 도구는 요구 급이 `attended 실기`라 사람이
  실물로 확인하는 관문이 남아 있고, 그 모듈이 그 판단을 머리주석에 적어 두었다(이
  꼬리 과제는 다른 묶음의 도구를 고치지 않는다). **`UpdateDomain`은 요구 급이
  `계약 시험`이라 이 시험이 유일한 증거**이고, 구를 재현하면 "활성화되지 않았는데
  활성화됐다"는 응답이 증거 있음으로 표시된 채 남는다. 선례는 D66(`UpdateView`) —
  그쪽도 짝인 생성은 두고 갱신만 고쳤다.
- **대체 기대 시험**: `sapkit-engine/src/tools/write/__tests__/updateDomain.test.ts`의
  「D125」 절 — 요청 바이트가 구 그대로인가 · 200에 실린 `E`를 실패로 되돌리는가 ·
  `X`도 실패인가 · `W`만 있으면 성공인가 · `activate:false`면 요청 자체가 없는가 ·
  실패해도 PUT은 이미 나갔다는 사실이 문구에 있는가.
- **해소 마일스톤**: 없음 — 영구 차이(수리)다.
- **기계 장부 반영**: **못 했다**(`harness/replay/**` 무접촉). 도구 응답이 `isError`째로
  달라지므로 **기계 장부에 와야 한다.** 오케스트레이터가 묶음 병합 뒤에 옮긴다.
## 제작 중 발견분 (append) — 꼬리 **삭제 계열 25종** 묶음

예약 구간은 **D110~D119**다. 파일 가운데가 아니라 끝에 붙이는 것은 같은 물결의
꼬리 묶음 셋이 동시에 append 하고 있어 같은 자리를 물면 전면 충돌이 나기 때문이다.

> **이 묶음 전체가 지는 한계 — 차이가 아니라 무증거다.**
> 삭제는 **재생 대조가 원리상 불가능하다**(두 번째 실행은 대상이 없어 "없다"로
> 실패한다). 그래서 25종의 요구 증거 급은 `attended 실기`이고, 이 판이 끝나도
> 전부 **「지음 · 증거 대기」**에 머문다. 오프라인 계약 시험이 통과했다는 것은
> "구와 같은 바이트를 보낸다"까지만 증명하며 **"SAP이 그것을 받아 실제로 지운다"는
> 증명하지 않는다.** D22(zrfc)가 같은 모양의 한계를 지고 있다. 이것은 등재할
> 「차이」가 아니므로 아래 항목에 넣지 않고 여기 한 번만 적어 둔다.

### D110 — `DeleteTable`·`DeleteDomain`·`DeleteDataElement`의 **ECC 우회로가 없다**
- **분류**: 축소 — **해소 마일스톤 = RFC 쓰기 브리지를 짓는 판. D61(생성 쪽)과 같은 자리.**
- **구 동작(실측)**: 셋 다 맨 앞에서 `process.env.SAP_VERSION?.toUpperCase() === 'ECC'`를
  묻고 참이면 OData 브리지로 우회한다 —
  `engine/src/handlers/table/high/handleDeleteTable.ts:66-67`·`:145-185`(`callDdicTabl`
  action `DELETE`) · `engine/src/handlers/domain/high/handleDeleteDomain.ts:65-66`·`:148-186` ·
  `engine/src/handlers/data_element/high/handleDeleteDataElement.ts:66-67`·`:152-192`.
  **`DeleteStructure`·`DeleteView`에는 그 갈래가 없다** — 구 안에서도 셋만 갖는다.
- **신 동작**: `SAP_VERSION=ECC`면 **이름 있는 거절**을 돌려주고 요청을 하나도 보내지
  않는다(`src/tools/write/internal/deletion.ts`의 `eccDeleteUnsupported`).
- **왜 짓지 않았나**: 이 엔진의 RFC 통로가 가진 DDIC 능력은 **읽기 브리지 하나**
  (`callDdicTablRead` — `src/rfc/types.ts:72-78`)뿐이고, 쓰기 브리지를 더하는 것은
  `src/rfc/**`를 고치는 일이라 이 묶음의 범위 밖이다. 그냥 ADT로 흘려보내면 **ECC
  커널에 없는 엔드포인트에 삭제를 시도**하게 된다 — 조용한 실패보다 이름 있는
  거절이 낫다는 것이 D61이 이미 정한 방향이다.
- **대체 기대 시험**: 세 도구 시험 파일의 「D110 — ECC」 절
  (`sapkit-engine/src/tools/write/__tests__/deleteTable.test.ts` 외 2종) —
  거절 문구가 나오고 **요청이 0회**인지.
- **기계 장부 반영**: **못 했다**(이 과제는 `harness/replay/**` 무접촉). ECC 프로파일의
  채록분이 있다면 도구 응답이 달라지므로 **기계 장부에 와야 한다.** 오케스트레이터가
  묶음 병합 뒤에 옮길 것.

### D111 — `DeleteLocal*` 넷이 활성화 **거짓 성공**을 성공으로 접지 않는다
- **분류**: 수리(구의 거짓 성공을 고침) — D41·D93·D103·D105의 같은 계열
- **구 동작(실측)**: `DeleteLocalDefinitions`·`DeleteLocalMacros`·
  `DeleteLocalTestClass`·`DeleteLocalTypes` 넷은 `activate_on_delete: true`에서
  `await client.getClass().activate({ className })` 한 줄을 부르고 **반환값을 버린다**
  (`engine/src/handlers/class/high/handleDeleteLocalTestClass.ts:92-94` 외 3곳).
  벤더 `AdtClass.activate()`는 **HTTP 4xx에서만** 던지고
  (`…/dist/core/class/AdtClass.js`), 그 아래
  `activationUtils.js`의 `activateObjectInSession`은 응답을 그대로 돌려줄 뿐이다.
  **SAP은 활성화 실패도 HTTP 200 + 본문의 `<chkl:msg type="E">`로 답하므로**,
  활성화가 실패해도 응답은 `activated: true`가 된다.
- **신 동작**: 요청 바이트는 구 그대로 두고(같은 주소·헤더·전문 —
  `src/tools/write/internal/classIncludeClear.ts`의 `activateParentClass`), 응답 본문을
  `parseActivationMessages`로 갈라 `E`/`A`/`X`가 있으면 실패로 되돌린다. 인클루드는
  이미 비워졌으므로 문구가 그 사실을 함께 말한다("cleared on SAP as an inactive
  version; the active version is unchanged").
- **판정 근거**: 이 레포의 CLAS 거짓 성공 실증 이력과 `CLAUDE.md` 안전 규칙
  ("write 성공 보고를 그대로 믿지 않는다"). **같은 엔진 안에서 `UpdateLocalTestClass`
  (D41)와 `UpdateLocalTypes`(D2)가 이미 같은 자리를 고쳤으므로**, 여기서 구를
  재현하면 같은 실패에 두 도구가 다르게 답하게 된다.
- **대체 기대 시험**: 넷의 시험 파일이 공유하는
  `sapkit-engine/src/tools/write/__tests__/localIncludeClearSupport.ts`의
  「D111」 두 건(오류가 있으면 실패 · **경고만 있으면 성공** — 과수리 역검증).
- **기계 장부 반영**: **못 했다**(`harness/replay/**` 무접촉). 도구 응답이
  `isError`째로 달라지므로 **기계 장부에 와야 한다.**

### D112 — 삭제 4종의 클라우드(JWT) 거절 갈래를 짓지 않았다 (D91의 범위 확장)
- **분류**: 축소 — **해소 마일스톤 = 인증 확장(Basic 외) 마일스톤. D15·D30·D91과 같은 자리.**
- **구 동작(실측)**: `DeleteInclude`·`DeleteGuiStatus`·`DeleteScreen`·
  `DeleteTextElement` 넷이 맨 앞에서 `isCloudConnection()`을 묻고 참이면 거절한다
  (`engine/src/handlers/include/high/handleDeleteInclude.ts:270-276` ·
  `.../gui_status/high/handleDeleteGuiStatus.ts:66-72` ·
  `.../screen/high/handleDeleteScreen.ts:57-61` ·
  `.../text_element/high/handleDeleteTextElement.ts:88-94`). 그 판정의 정본은
  `engine/src/lib/utils.ts:978-1002` — 묻는 것은 배포 축이 아니라 `authType === 'jwt'`다.
- **신 동작**: 그 갈래가 없다. **D91과 같은 근거**다 — 이 엔진의 인증은 Basic
  하나뿐이라 `authType === 'jwt'`가 될 수 있는 값이 아예 없고, 넷 다
  `available_in: ['onprem','legacy']`이라 `SAP_SYSTEM_TYPE=cloud`에서는 애초에
  `tools/list`에 뜨지 않는다. 없는 조건을 흉내 내는 분기는 영영 죽은 코드가 된다.
- **왜 D91에 얹지 않고 새 항목인가**: D91의 본문은 대상을 "이 묶음의 구 핸들러
  16종"으로 못 박아 두었고, 등재 항목의 **본문은 수정하지 않는 것이 이 장부의
  규칙**이다(정정도 새 항목). 그래서 범위 확장을 여기 따로 적는다.
- **대체 기대 시험**: 네 도구의 계약 시험이 붙잡는 「노출 선언」 절 —
  `available_in`이 `['onprem','legacy']`라는 것이 이 갈래를 대신하는 바닥선이다.
- **기계 장부 반영**: **안 했다** — 인증 종류는 접속 계층이고 도구 응답 시퀀스에
  나타나지 않는다(D91과 같다).

### D113 — `DeleteGuiStatus`·`DeleteScreen`이 **잠금 손잡이 없이 진행하지 않는다** (D92의 범위 확장)
- **분류**: 강화(안전 바닥선을 올림)
- **구 동작(실측)**: 둘 다 잠금 응답에서 `LOCK_HANDLE`을 못 꺼내도 `lockHandle`이
  `undefined`인 채로 **그대로 진행해** 대리자 쓰기(`CUA_WRITE` · `DYNPRO_DELETE`)를
  보낸다. 해제도 `if (lockHandle)`이라 건너뛴다
  (`engine/src/handlers/gui_status/high/handleDeleteGuiStatus.ts:86-102`·`:134-141` ·
  `.../screen/high/handleDeleteScreen.ts:76-92`·`:101-109`). **같은 묶음의
  `DeleteTextElement`는 같은 자리에서 "Failed to obtain lock handle for program …"
  으로 던진다**(`handleDeleteTextElement.ts:150-154`) — 구 엔진 안에서도 이 자리만
  갈라져 있다.
- **신 동작**: `client.withLock()`이 소유한다. 잠금 응답에 `LOCK_HANDLE`이 없으면
  `protocol` 오류로 던지고(`src/adt/client.ts`), 대리자 쓰기는 나가지 않는다.
  실패 경로에서도 해제가 보장된다.
- **판정 근거**: 잠기지 않은 프로그램의 GUI 상태·화면을 **지우는** 것은 다른
  세션의 편집을 덮어쓸 수 있는 write다. D92가 `UpdateScreen`에서 이미 같은 방향을
  정했고, 구 엔진 자신이 형제 핸들러에서 이것을 실패로 다룬다.
- **대체 기대 시험**: 두 도구 시험 파일의 「D113」 절 — 잠금 응답에 손잡이가 없으면
  **RFC 호출이 0회**인지.
- **기계 장부 반영**: **못 했다**(`harness/replay/**` 무접촉). 와이어가 달라지는
  차이(요청이 아예 안 나간다)이므로 **기계 장부에 와야 한다.**

### D114 — `DeleteTextElement`의 부모 프로그램 활성화 **거짓 성공**을 접지 않는다 (D93의 범위 확장)
- **분류**: 수리(구의 거짓 성공을 고침)
- **구 동작(실측)**: `activate: true`에서 활성화 요청을 보낸 뒤 **응답을 읽지
  않는다** — `await makeAdtRequestWithTimeout(connection, '/sap/bc/adt/activation', …)`
  한 줄이고 반환값을 버린다(`handleDeleteTextElement.ts:203-216`). SAP은 활성화
  실패도 **HTTP 200 + `<chkl:msg type="E">`** 로 답하므로 응답은 `activated: true`가 된다.
- **신 동작**: 요청 바이트는 구 그대로 두고 응답 본문을 갈라 실패로 되돌린다 —
  D93이 이미 지은 `src/tools/write/internal/programScoped.ts`의 `activateParentProgram`을
  그대로 쓴다.
- **왜 D93에 얹지 않고 새 항목인가**: D93의 본문이 대상을 "쓰기 8종"으로 열거해
  두었고 거기 `DeleteTextElement`는 없다. 본문 수정 금지 규칙에 따라 범위 확장을
  따로 적는다.
- **대체 기대 시험**: `sapkit-engine/src/tools/write/__tests__/deleteTextElement.test.ts`의
  「D114」 절(오류가 있으면 실패 · 경고만 있으면 성공 — 과수리 역검증).
- **기계 장부 반영**: **못 했다**. 도구 응답이 `isError`째로 달라지므로 **기계
  장부에 와야 한다.**

### D115 — `DeleteServiceBinding`이 삭제 응답의 **거짓 성공**을 성공으로 접지 않는다
- **분류**: 수리(구의 거짓 성공을 고침)
- **구 동작(실측)**: 벤더 `deleteServiceBinding()`
  (`engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/service/AdtService.js:585-599`)은
  `POST /sap/bc/adt/deletion/delete`의 응답을 그대로 돌려줄 뿐 **`assertDeletionSucceeded`를
  걸지 않는다.** 같은 주소를 쓰는 다른 12종은 전부 그 판정을 건다
  (`dist/core/<종류>/delete.js`). 삭제 서비스는 실패도 **HTTP 200 +
  `del:isDeleted="false"`** 로 답하므로, 지워지지 않은 바인딩이
  `success: true`로 보고됐다. 겉 핸들러도 상태·본문을 응답에 실어 줄 뿐 판정하지
  않는다(`handleDeleteServiceBinding.ts:60-83`).
- **신 동작**: 다른 12종과 **같은 판정**을 건다 — `assertDeletionSucceeded(body,
  'Service binding')`. 요청 바이트는 구 그대로다(한 줄 전문 · 검사 걸음 없음 ·
  발행취소 사전 걸음 그대로).
- **판정 근거**: 같은 엔진 안에서 한 주소의 같은 응답을 12종은 실패로, 1종은
  성공으로 읽으면 안 된다. `CLAUDE.md` 안전 규칙("write 성공 보고를 그대로 믿지
  않는다")과 D103·D105의 선례가 같은 방향이다. **삭제는 되돌릴 수 없으므로
  "지웠다"는 거짓 보고의 값이 특히 비싸다** — 사용자가 지워진 줄 알고 다음 단계로
  간다.
- **대체 기대 시험**: `sapkit-engine/src/tools/write/__tests__/deleteServiceBinding.test.ts`의
  「D115」 두 건(`isDeleted="false"`면 실패 · `"true"`면 성공 — 과수리 역검증).
- **기계 장부 반영**: **못 했다**(`harness/replay/**` 무접촉). 도구 응답이
  `isError`째로 달라지므로 **기계 장부에 와야 한다.**

---

## 기계 장부 반영 기록 — D110~D132 판정 (append · **마지막 반영**)

이 장부는 append-only다. 위 항목들의 본문은 그대로 두고, **어느 항목이
`harness/replay/divergences.ts`(기계가 읽는 형태)로 옮겨졌는지**를 여기 한 번에
적는다. 꼬리 묶음 셋(삭제 계열 25종 · `tail-test` · `tail-read`)이
`harness/replay/**`를 무접촉으로 갖고 있어 D110 이후는 이 문서에만 쌓였다.
**표면 186종의 제작이 끝났으므로 이것이 마지막 반영이다.** (선례: 위쪽 「기계 장부
반영 기록 — D21~D40 판정」·「— D41~D105 판정」.)

### 가름선 — **2차가 좁혀 둔 규칙을 그대로 썼다. 새 규칙을 만들지 않았다**

2차 반영이 부록 A의 "와이어가 달라지면 온다"를 **「재생 대조가 실제로 보는 표면에
나타나는가」**로 좁혔고, 이 판은 그 규칙을 그대로 적용했다. 픽스처가 담는 것은
`SequenceStep`(`tool`·`args`·`response`·`isError`)뿐이고 HTTP 요청의 주소·본문·
헤더·개수는 담기지 않는다. 그래서 SAP이 다르게 답하지 않는 와이어 차이는

- **발동할 자리가 없고**,
- 채록 쪽에 그 자리를 가리키는 표식이 없어 **`applies`가 도구 이름 전체로
  넓어진다** — 기계 장부 머리주석이 금하는 모양이다.

옮기지 않은 결과는 "그 차이가 나면 결함으로 잡힌다"인데, 그 자리들은 전부 *신이
옳다는 증명이 아직 없는* 축소·미실측이므로 그 방향이 옳다.

### 판정표 — D110~D132 전건

| # | 기계 장부 | 근거 한 줄 |
|---|---|---|
| D110 | **옮김** (3종 · 이연) | 구 ECC 갈래는 `path:'ecc-odata-rfc'`를 실은 **성공**이고 신은 거절한다 — 응답이 갈리고 채록 쪽 표식도 그 키다(D61과 같은 모양). 축소분이 옳다는 것을 재생이 증명할 수 없어 `check: null` |
| D111 | **옮김** (4종) | 활성화 거짓 성공 수리 — 구가 `activated: activate_on_delete`를 실었으므로 `activated:true` 표식이 있다. `isError`째 갈린다 |
| D112 | 안 옮김 | 인증 계층 — JWT 채록분 자체가 없다. **D91과 같은 자리**이고 지목자 판단과 같다 |
| D113 | 안 옮김 | **D92의 범위 확장이고 D92와 같은 판정이다.** 잠금 응답에 `LOCK_HANDLE`이 없다는 것은 비정상 SAP 상태이고, 채록된 구 응답은 그냥 성공이라 그 자리의 표식이 없다. 등재하면 `applies`가 두 도구 전체를 덮는다. 지금은 그 갈래가 나면 걸리는 등재가 없어 `mismatch`(결함)로 사람에게 올라간다 — D92가 고른 방향 그대로다 |
| D114 | **옮김** | 활성화 거짓 성공 수리. **D93의 범위 확장이고 D93과 같은 판정이다** — 그 항목이 열거한 여덟에 `DeleteTextElement`가 없어 새 항목이 되었을 뿐, 표식(`activated:true`)도 검사도 같다. D93의 도구 집합과 **겹치지 않는다** |
| D115 | **옮김** | 삭제 거짓 성공 수리 — 구는 `del:isDeleted="false"`인 본문을 `payload`에 실은 채 `success:true`로 답했다. 그 값이 곧 채록 쪽 표식이고, 신은 `isError`로 되돌린다 |
| D120 | **옮김** | 활성화 거짓 성공 수리. **이 계열에서 유일하게 채록 표식이 없다** — 구 응답에 `activated` 키도 "activated successfully" 문구도 없다(`handleUpdateCdsUnitTest.ts:98-107`). 대신 구 벤더가 `activateOnUpdate: true`를 박아 두어 **활성화를 부르지 않는 성공 갈래가 아예 없으므로**, 이 도구에서는 「구가 성공이라 답했다」가 곧 활성화 주장이다. `applies`가 성공 갈래 전체를 들되 오류 갈래는 그대로 대조된다 (D1·D2·D3·D38·D40이 이미 쓰는 모양) |
| D121 | **옮김** | 활성화 거짓 성공 수리 — 구가 `activated: activate_on_update`를 실었다 |
| D122 | **옮김** | 활성화 거짓 성공 수리 (D121과 같은 모양) |
| D123 | 안 옮김 | 잠금 응답의 **헤더 경로** — 채록된 실 SAP 응답은 본문에 손잡이를 싣는 형태라 이 갈래가 대조에 나타나지 않는다. 지목자 판단과 같다 |
| D124 | 안 옮김 | 협상 캐시 미공유 — 갈리는 것은 **discovery 왕복 한 번**뿐이고 협상 결과와 PUT 헤더는 같다. **D52와 같은 자리**이며 픽스처는 왕복을 담지 않는다 |
| D125 | **옮김** | 활성화 거짓 성공 수리 — 구 문구 `Domain … updated and activated successfully`가 표식이다. `activate:false`면 그 조각이 빠지므로 그 단계는 등재 밖이다 |
| D130 | **옮김** (이연) | 구의 **캐시 적중** 응답(`type:'json'` 마디)이 신에는 존재하지 않는다 — 캐시를 채우는 도구를 먼저 부른 시퀀스에서 구는 마디를, 신은 오류를 답한다. 빈-캐시 갈래는 글자까지 같으므로 등재 밖이고 그대로 대조된다. 축소분이라 `check: null` |
| D131 | 안 옮김 | `sap-adt-connection-id`는 **요청 헤더 값**이다(D62·D72와 같은 요청 쪽 와이어). **지목자는 "기계 장부에도 와야 한다"고 적었으나 이 판은 옮기지 않았다** — 픽스처에 요청 헤더가 없어 발동할 자리가 없고, 채록 쪽 표식도 없어 `applies`가 두 도구 전체로 넓어진다. 값이 실제로 응답을 가른다면 그때 신이 옳다는 증명이 없으므로 **결함으로 잡히는 쪽이 옳다**(D62·D82가 같은 판정을 받았다) |
| D132 | **옮김** (이연) | ECC에서 구는 브리지 결과를, 신은 거절을 답한다 — 응답이 갈리고 표식은 `path:'ecc-odata-rfc'`다(D61·D110과 같은 모양). 비-ECC 갈래는 구와 글자까지 같으므로 등재 밖이다. 축소분이라 `check: null` |

**결번**(D116~D119 · D126~D129 · D133~D139)은 위 「번호 예약」 절이 적은 대로 꼬리
묶음이 예약 구간을 다 쓰지 않은 자리다. 차이가 아니므로 판정 대상도 아니다.

### D33 재판정 — 전제는 깨졌고 판정은 그대로다

D130 본문이 "D33의 「안 옮김」 전제가 이 커밋으로 깨졌다"고 명시했으므로 2차의
판정을 다시 보았다. D33을 옮기지 않은 근거는 둘이었다.

1. 캐시를 **얹는** 다섯 도구의 자기 응답은 그대로다.
2. 그것을 **읽는** `GetObjectNodeFromCache`가 등록점에 없다.

②는 그 도구가 지어지며 깨졌다. 그러나 ①은 그대로이고, **관측되는 결과를 지목한
항목이 D130**이므로 결론은 바뀌지 않는다 — **D33은 여전히 기계 장부 밖이고, 그
자리를 D130이 받는다.** D130 본문이 "옮길 때 D33이 아니라 이 D130을 옮겨라"라고
적은 것과 같은 판단이다. **2차 판정을 뒤집지 않았다.**

### D92·D93 대 D113·D114 — 확장분이 원본과 같은 판정을 받았다

범위 확장 둘이 원본과 갈리지 않는지 따로 확인했다.

| 원본 | 판정 | 확장 | 판정 | 갈리지 않는 이유 |
|---|---|---|---|---|
| D92 (`UpdateScreen` 잠금 손잡이) | 안 옮김 | D113 (`DeleteGuiStatus`·`DeleteScreen`) | **안 옮김** | 둘 다 비정상 SAP 상태에서만 갈리고 채록 쪽 표식이 없다 |
| D93 (쓰기 8종 부모 활성화) | 옮김 | D114 (`DeleteTextElement`) | **옮김** | 둘 다 `activated:true` 표식이 있고 `isError`째 갈린다 |

D92는 "등재하면 D93과 겹친다"는 근거를 함께 들었는데, **D113에는 그 겹침이
없다**(`DeleteGuiStatus`·`DeleteScreen`은 D114의 집합 밖이다). 그래도 판정이 같은
것은 D92의 **첫째** 근거(표식 없음 → `applies`가 도구 전체를 덮는다)만으로 이미
결론이 정해지기 때문이다. 겹침이 없으므로 D113의 갈래가 나면 걸리는 등재가 아예
없어 `mismatch`(결함)로 올라간다 — D92보다 오히려 더 시끄러운 쪽이다.

### 옮긴 것들이 지키는 것

- **면제가 아니라 재대조다.** 활성화 계열 여섯은 2차가 지은 공용 검사를 그대로
  쓴다(신 문구가 `Activation failed: … was not activated`로 활성화 실패를 이름으로
  말하는지까지 본다). D115는 같은 모양의 **삭제** 판정을 따로 둔다 — 신 문구가
  `… deletion failed:`라고 말해야 통과다. 다른 이유로 막혔으면 `allowlisted-fail`이다.
- **D 번호 하나 = 기계 항목 하나**로 두고 `applies`는 **그 항목 본문이 이름 붙인
  도구 집합만** 든다는 2차 방침을 이었다. 집합에서 실제로 뺀 것이 있다 — `DeleteStructure`·
  `DeleteView`는 **구에도 ECC 우회로가 없어** D110의 집합 밖이다.
- **집합끼리 겹치지 않는다.** 표면 186종 × 대표 응답 모양 아홉을 훑어 한 단계에
  두 등재가 걸리는 자리가 없음을 시험이 못박는다
  (`harness/replay/__tests__/divergences.test.ts`의 「과등재 역검증」 절). 새 항목은
  전부 **구가 성공이라 답한 자리**에만 걸리므로 오류 단계 어디에도 걸리지 않는다.
- **D110·D130·D132만 이연**이다(`check: null`). 축소분이 옳다는 것을 재생이 증명할
  수 없어 판정 자리를 계약 시험에 둔다 — 재생은 그 단계를 통과가 아니라 **무증거**로
  센다.

### 아직 비어 있는 자리 (다음 판이 갚을 것)

1. **이연 항목이 다섯으로 늘었다** — D1·D2·D37·D61에 **D110·D130·D132**가 더해졌다
   (`check: null`). 재생은 이 단계들을 무증거로 세고, 판정 자리는 각 계약 시험이다.
2. **D110·D132의 ECC 채록분이 없다.** D61과 같은 자리다 — `SAP_VERSION=ECC` 시퀀스를
   딴 적이 없어 발동을 실측한 적이 없다.
3. **D130은 신 엔진에서 성공 응답을 낼 수 없다.** 대장에 「증거 있음」으로 잡히더라도
   그것은 "빈-캐시 갈래가 구와 같다"는 증거지 "캐시 조회가 동작한다"는 증거가 아니다
   (D130 본문의 ⚠ 그대로).
4. **삭제 계열 25종은 재생 대조가 원리상 불가능하다**(그 묶음 머리말). D111·D114·D115의
   등재는 옳으나, 그 갈래를 실제로 발동시키려면 attended 채록이 필요하다.
5. **D113·D131은 옮기지 않았으므로 그 갈래가 나면 결함으로 잡힌다.** 그것이 이 판의
   의도이며, attended에서 확인할 자리다(D92·D101과 같은 목록에 든다).
