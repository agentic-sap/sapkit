# `src/rfc/` — RFC 백엔드 분배층 (근거 문서)

세 계열의 MCP 도구(Screen · GUI Status · Text Element)만 ADT HTTPS 채널로 닿지
않는다. 그 셋은 SAP에 **기설치된 RFC 대리자 함수모듈** `ZMCP_ADT_DISPATCH` /
`ZMCP_ADT_TEXTPOOL`을 부르고, "그 함수모듈에 **어떻게** 닿느냐"가 곧 통로(backend)다.

여기에 **ECC 전용 우회로**가 하나 더 얹힌다(§6.1). 평소 ADT로 닿는 도구라도 ECC
커널에 해당 엔드포인트가 없으면 이 층을 탄다 — M1에서는 `GetTable`·`GetStructure`
둘이 그렇다.

이 문서는 **구 엔진의 통로 선택 계약을 실측해 옮겨 적은 것**이다. M1이 짓는
코드보다 이 실측이 먼저였다. 인용은 전부 `engine/`(구 소스, 읽기 전용 참고서)과
제품 문서의 파일·줄이다.

---

## 1. 어떤 키가 통로를 고르는가

**키는 `SAP_RFC_BACKEND` 하나다.** 실측: `engine/src/lib/rfcBackend.ts:34-48`.

```
const v = (process.env.SAP_RFC_BACKEND ?? '').trim().toLowerCase() || 'odata';
```

정규화는 세 단계다 — `?? ''` → `trim()` → `toLowerCase()` → `|| 'odata'`.
그래서:

| 값 | 결과 | 근거 |
|---|---|---|
| 미설정 | `odata` | `?? ''` → `|| 'odata'` (`rfcBackend.ts:37`) |
| 빈 문자열 · 공백만 | `odata` | 같은 줄. 구 소스 주석 `:35-36`이 이것을 **의도**라고 못박는다 — `sap.env`의 `SAP_RFC_BACKEND=` 빈 줄이 옛 기본값 `soap`을 조용히 고르면 안 된다 |
| `NATIVE` · `  native  ` | `native` | `trim().toLowerCase()` |
| `soap` `native` `gateway` `odata` | 그대로 | `rfcBackend.ts:38-41` |
| 그 밖의 값 | **던진다** | `rfcBackend.ts:42-45` |

## 2. 기본값과 폴백 순서

- **기본값은 `odata`다.** 2026-04-22에 `soap`에서 바뀌었다 — 구 소스 주석
  `rfcBackend.ts:8-12`이 이유를 남겼다: 강화된 Gateway 설치가
  `/sap/bc/soap/rfc` ICF 노드를 닫는 일이 늘었고, OData 경로는 `S_RFC` 대신
  표준 Gateway 권한 `S_SERVICE`를 탄다.
- **폴백 사슬은 없다.** 한 통로가 실패하면 다음 통로를 시도하는 경로는 구
  엔진 어디에도 없다. "폴백"이라 부를 만한 것은 ⓐ 값이 비었을 때의 기본값
  하나와, ⓑ ECC용 DDIC 보조 호출이 `odata`가 아닌 통로에서 **실패하는**
  방식뿐이다(`rfcBackend.ts:94-153` — `callDdicTabl` 등 8종은 odata 전용이고,
  다른 통로에서는 "`SAP_RFC_BACKEND=odata`가 필요하다"고 던진다. 이미 정직한
  실패다).
- **해석은 모듈 적재 시각에 한 번**이고 그 뒤 상수로 굳는다
  (`rfcBackend.ts:48`, 구 시험 `src/__tests__/lib/rfcBackend.test.ts:138-144`).
  값을 바꾸려면 MCP 서버를 다시 띄워야 한다.
- **값의 출처 우선순위**: `engine/src/server/launcher.ts:100-104` — 런처가
  프로파일 `sap.env`의 `SAP_RFC_*` 키를 `process.env`로 옮기되
  `!process.env[key]`일 때만 옮긴다. 즉 **프로세스 env가 비어 있지 않으면
  그쪽이 이기고**, 빈 문자열은 없는 것으로 친다. (안전 계층의 blocklist
  노브는 반대로 프로파일이 이긴다 — 장부 D6. 축이 다르다.)

## 3. 각 통로가 SAP 측 무엇을 부르는가

다섯 경로 전부 종착지는 같은 두 함수모듈이다. 다른 것은 그 앞의 전송뿐이다.

| 통로 | 전송 | SAP 측 접점 | 필요한 env | 실측 |
|---|---|---|---|---|
| `odata` (기본) | HTTPS + OData v2 FunctionImport | 서비스 `ZMCP_ADT_SRV`의 `Dispatch`/`Textpool` → `ZMCP_ADT_*` FM. SEGW + Gateway 등록 필요 | `SAP_RFC_ODATA_SERVICE_URL`(필수) · `SAP_RFC_ODATA_CSRF_TTL_SEC`(기본 600·하한 60) | `odataRfc.ts:14-24` |
| `soap` | HTTPS + SOAP 봉투 | ICF 노드 `/sap/bc/soap/rfc`가 FM을 직접 노출 | 추가 없음(ADT 접속 재사용) | `soapRfc.ts:12-14`·`127-152` |
| `native` | TCP + SAP NW RFC SDK(`node-rfc`) | RFC 프로토콜로 FM 직접 호출 | `SAP_RFC_ASHOST`·`SYSNR`·`CLIENT`·`USER`·`PASSWD`·`LANG`·`MSHOST`·`SYSID`·`GROUP` + SNC 4종 | `nativeRfc.ts:9-17` |
| `gateway` | HTTPS/JSON → 중계 미들웨어 | 중계기가 SDK로 FM 호출. `POST /rfc/dispatch`·`/rfc/textpool` | `SAP_RFC_GATEWAY_URL`(필수) · `_TOKEN` · `_TLS_VERIFY` | `gatewayRfc.ts:15-29` |
| `zrfc` | HTTPS/JSON → 커스텀 ICF 핸들러 | `ZCL_MCP_RFC_HTTP_HANDLER`가 `/sap/bc/rest/zmcp_rfc`에서 FM 노출 | `SAP_RFC_ZRFC_BASE_URL`(필수) · `_CSRF_TTL_SEC` | `zrfcProxy.ts:18-28` |

문서 쪽 정본은 `interactive/core/procedures/troubleshooting.md` §3
(`:151` 절머리, `:157-165` 선택 기준표, `:177-183` 통로별 env 키).

> **`engine/.env.example`에는 `SAP_RFC_*` 키가 한 줄도 없다**(grep 0건).
> 이 파일은 통로 선택에 대해 아무 말도 하지 않으므로 판단 근거가 되지 못한다.

### 실측 발견 — 구 엔진의 선택기는 `zrfc`를 받지 않는다

`zrfcProxy.ts`는 **완성된 구현**이고, 설치 안내
(`engine/docs/installation/ZRFC_SETUP.md`) · 선택 기준표
(`troubleshooting.md:165`) · 런처 주석(`launcher.ts:96-97`, "soap|native|gateway|odata|zrfc")이
모두 `zrfc`를 유효한 값으로 말한다. 그런데 선택기
(`rfcBackend.ts:32`의 `RfcBackend` 타입 · `:38-41`의 분기 · `:43`의 오류 문구)에는
`zrfc`가 없다. 그래서 `SAP_RFC_BACKEND=zrfc`를 넣으면
`must be 'soap' | 'native' | 'gateway' | 'odata'`로 **거부된다**.
현행 배포 번들도 같다(`interactive/server/server.bundle.cjs:112130`).

문서가 약속한 통로에 코드가 닿지 않는 **배선 구멍**이다. 거짓 성공은 아니고
(정직하게 던진다) 안내가 틀렸을 뿐이다. 신 엔진의 처리는 §5 참조.

## 4. 소유자 프로파일이 실제로 타는 통로 — `odata`

실접속 없이 설정·문서에서 유도했다.

- `HANDOFF.md:2293` — "IDES-DEV 프로파일 참고: sap.env가 `SAP_RFC_BACKEND=odata`인데
  URL 미설정".
- `HANDOFF.md:2137` (뒤에 붙은 정정) — "HANDOFF §3 `SAP_RFC_BACKEND=odata` 표기
  부정확 — **실물 sap.env에 그 줄 없음(기본값 odata 해석)**, 정정 후보".

두 기록은 "그 줄이 실제로 적혀 있는가"에서 엇갈리지만 **결론은 같다**: 명시돼
있으면 `odata`, 없으면 §1의 기본값이 `odata`. 어느 쪽이든 **소유자 프로파일의
유효 통로는 `odata`**다. 그래서 M1이 짓는 통로는 이 하나다(수요순은 제작
순서에만 적용된다 — 결정 D-079 ②).

같은 기록이 남긴 운영 사실 하나: 그 프로파일에는
`SAP_RFC_ODATA_SERVICE_URL`이 없어서 RFC 디스패치 3계열이 env 오류로 떨어진다.
신 엔진은 이 실패를 **통로를 세우는 시점에** `RfcError('config')`로 알린다
(구는 첫 호출 때 터져 SAP이 거부한 것처럼 보인다).

## 5. 신 엔진이 구현한 것

```
selectRfcBackend(env)         → 통로 이름 (§1·§2의 계약 그대로)
mergeRfcEnv(profile, process) → SAP_RFC_* 키 합류 (§2의 우선순위)
createRfcChannel({...})       → RfcChannel        |  던진다
createDdicReadChannel({...})  → DdicReadChannel   |  던진다  (§6.1 — odata 전용)
```

`RfcChannel`은 통로 하나가 하는 일 전부다 — `callDispatch(action, params)`와
`callTextpool(action, params)`. 나머지 네 경로는 **같은 인터페이스의 다른
구현**으로 후속 마일스톤에 붙는다. 도구 계층은 어느 통로인지 몰라야 한다.

`DdicReadChannel`(= `callDdicTablRead`)은 **일부러 `RfcChannel` 밖에** 뒀다. 그
능력은 마일스톤이 아니라 SAP 측 설계로 갈린다(§6.1) — 통로 인터페이스에 얹으면
나머지 네 구현이 전부 "던지기만 하는 메서드"를 달아야 하고, 그것은 표면이
거짓말을 하는 것이다. `odata` 통로는 두 인터페이스를 모두 구현한다.

**미구현 통로를 고르면 조용히 대체하지 않고 `backend-unsupported`로 던진다.**
다른 통로로 넘어가면 사용자는 자기가 고른 경로가 동작한다고 믿게 되고, 그것이
곧 거짓 성공이다.

**지금 그 방어는 도달 불가능하다 — 다섯 통로가 전부 지어졌기 때문이다.**
그래도 지우지 않는다. 여섯째 이름이 `RFC_BACKEND_NAMES`에만 추가되고 구현이
빠지는 순간, 그 이름을 조용히 `odata`로 흘려보내는 대신 정직하게 실패시켜야
한다. `IMPLEMENTED_RFC_BACKENDS`가 그 방어의 유일한 자리다.

**다만 「지어졌다」가 「실행까지 확인됐다」는 아니다.** 다섯 전부 통로 생성
계약(필수 설정 확인 시점 · 오류 종류 · 타임아웃)까지만 오프라인으로 시험돼
있고, 실제 디스패치는 SAP 접속을 요구해 미뤄져 있다. `native`는 그에 더해
네이티브 애드온이 이 머신에 없어 실행 구간이 관찰되지 않았고(장부 D21),
`zrfc`는 SAP 측 `ZRFC` 오브젝트를 요구한다(장부 D22).

### 구 엔진과 다르게 만든 것

| # | 지점 | 구 | 신 | 왜 |
|---|---|---|---|---|
| ① | `zrfc` 값 | 알 수 없는 값으로 **거부** (`rfcBackend.ts:43`) | 유효한 이름으로 인정 · **실동작 구현까지 지어졌다**(M1에서는 `backend-unsupported`였다) | 결정 D-079 ②가 5경로 전량 승계를 정했고, 문서 3곳이 이미 유효하다고 말한다(§3). 구 엔진의 배선 구멍 자체는 그대로라 교체 전까지 제품에서는 못 쓴다(장부 D9) |
| ② | 해석 시점 | 모듈 적재 시 `process.env`에서 1회 (`rfcBackend.ts:48`) | 순수 함수 — 호출자가 env를 준다 | 프로파일 계층이 이미 `sap.env`를 읽는다. 전역 상태를 거칠 이유가 없고 시험이 프로세스 env를 흔들지 않아도 된다. **관찰 가능한 계약(무엇이 무엇을 고르는가·기본값·거부)은 동일** |
| ③ | 403 CSRF 재시도 | 자기 자신을 재귀 호출 — **상한 없음** (`odataRfc.ts:277`) | **한 번만** 되민 뒤 `csrf` 오류 | 서버가 계속 `required`로 답하면 구는 스택이 찰 때까지 왕복한다. ADT 계층의 "딱 한 번" 규칙(`src/adt/client.ts:284-290`)과도 맞춘다 |
| ④ | 타임아웃 | 60초 하드코딩 (`odataRfc.ts:51`) | `ConnectionConfig.timeouts.long` | 기본값이 60000ms로 **같다**. 프로파일의 `SAP_TIMEOUT_LONG`이 이제 실제로 먹는다 |
| ⑤ | TLS 검증 | 전역 `fetch` — 접속별 방침 없음 | `ConnectionConfig.rejectUnauthorized` | 장부 D4와 같은 판단. 접속마다 달라야 하는 값이다 |
| ⑥ | 필수 env 확인 | 첫 호출 때 (`odataRfc.ts:62-70`) | 통로 생성 시 | 실패가 요청 경로에서 터지면 SAP이 거부한 것처럼 보인다 |
| ⑦ | 오류 형태 | 평범한 `Error` + 문자열 조립 | `RfcError` — `kind`·`subrc`·`sapMessage`·`status` 구조화 | 상위 계층이 메시지를 다시 파싱하지 않게 |
| ⑧ | 쿠키 처리 | 값이 빈 쿠키도 계속 전송 | `CookieJar` — 빈 값을 삭제로 처리 | ADT 계층과 같은 저장소를 쓴다. 장부 D8의 "쿠키 삭제 의미" 항목이 이미 덮는 차이다 |

**일부러 같게 둔 것**: `subrc != 0`일 때의 문구
`ZMCP_ADT_DISPATCH error (action=…, subrc=…): …`는 구 엔진 문자열 그대로다
(`odataRfc.ts:321-323`). 이 문자열은 도구 응답으로 그대로 나가므로 녹화-재생
대조의 대상이다. 반면 전송·HTTP 계층의 진단 문구는 이 레포의 다른 계층과 같은
한국어로 새로 썼다 — 접속 계층이 이미 그렇게 갈라져 있고(`src/adt/errors.ts`),
그쪽은 장부에 차이로 등재되지 않았다.

## 6. SAP 측 무접촉

새 오브젝트 0. 신 엔진도 기설치된 `ZMCP_ADT_DISPATCH` / `ZMCP_ADT_TEXTPOOL` /
`ZMCP_ADT_DDIC_TABL_READ`를 **같은 이름·같은 인자**로 부른다(결정 D-079 ⑥).
자산 원본은 `interactive/server/sap-assets/`(`zmcp_adt_dispatch.abap`,
`zmcp_adt_textpool.abap`, `zmcp_adt_ddic_tabl_read_ecc.abap`).

인자 계약(변경 금지):

- `Dispatch` — `IV_ACTION`, `IV_PARAMS`(JSON 문자열) → `EV_SUBRC`,
  `EV_MESSAGE`, `EV_RESULT`(JSON 문자열)
- `Textpool` — `IV_ACTION`(`READ`|`WRITE`|`WRITE_INACTIVE`), `IV_PROGRAM`,
  `IV_LANGUAGE`, `IV_TEXTPOOL_JSON` → 같은 세 출력
- `DdicTablRead` — `IV_NAME`, `IV_VERSION`(`A`|`I`, 기본 `A`) → 같은 세 출력

### 6.1 ECC DDIC 우회로 — `DdicTablRead`

**M1 도구 19종에는 `ZMCP_ADT_DISPATCH`를 타는 도구가 없다**
(`harness/old-surface/m1-tools.json`의 `m1` 목록 — Screen·GUI Status·Text
Element 계열은 그 안에 없다). M1에서 이 층을 실제로 쓰는 곳은 `GetTable`·
`GetStructure`의 **ECC 우회로** 하나뿐이고, 그것은 `Dispatch`가 아니라 별도
FunctionImport `DdicTablRead`(→ `ZMCP_ADT_DDIC_TABL_READ`)다. 표와 구조가 **같은
FM 하나**를 쓰며 TABCLASS로 갈린다.

- **기본은 ADT 직통이다.** 우회는 `SAP_VERSION`이 `ECC`일 때만 일어난다
  (`engine/src/handlers/table/high/handleGetTable.ts:69` ·
  `.../structure/high/handleGetStructure.ts:60` — ECC 커널(BASIS < 7.50)에는
  `/sap/bc/adt/ddic/tables` 엔드포인트가 없다).
- **`odata` 통로 전용이다.** 브리지 FM은 OData 서비스 `ZMCP_ADT_SRV`의
  FunctionImport로만 노출돼 있어 나머지 네 통로에는 닿을 길이 없다. 구 엔진도
  같은 자리에서 "`SAP_RFC_BACKEND=odata`가 필요하다"고 던진다
  (`engine/src/lib/rfcBackend.ts:94-132`) — 이미 정직한 실패다.
- **문턱이 다르다.** 대리자 두 종은 `subrc != 0`이면 곧 오류지만, DDIC 브리지는
  **`subrc >= 8`일 때만** 던진다(`engine/src/lib/odataRfc.ts:580`). `4`는 "찾지
  못했다" 계열이라 메시지와 함께 정상 반환되고, 그것을 어떻게 표현할지는 도구가
  정한다. 통로가 4를 던지면 도구의 문구가 영영 나오지 않는다.
- 구 엔진의 DDIC 보조는 8종이지만(`rfcBackend.ts:146-153`) M1이 옮긴 것은 이
  하나다. 나머지는 그 도구를 짓는 마일스톤이 가져간다.

`CUA_FETCH`(`handleReadGuiStatus.ts:54`) · `DYNPRO_READ`(`handleReadScreen.ts:58`)를
쓰는 `ReadGuiStatus`·`ReadScreen`은 **M1 도구 집합 밖**이며 후속 마일스톤이다.
