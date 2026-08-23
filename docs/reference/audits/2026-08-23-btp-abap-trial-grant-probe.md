# BTP ABAP trial — 그랜트별 ADT 개방 실측 채록 (2026-08-23 · 판M2-b · D-115)

> **기록이지 권한이 아니다.** 이 문서는 판M2-b가 실 시스템에서 잰 값을 그대로
> 적는다. 판정과 그 근거는 **D-115**(`docs/reference/DECISIONS.md`)와 그 리뷰 회수
> **D-116**에 있고, 그 둘이 직접 통제한다. 이 채록이 그 판정을 바꾸지 않는다.
>
> 남기는 이유: **판M2-b의 산출물은 코드가 아니라 측정인데, 그 측정이 산문으로만
> 남아 재현 불가였다**(독립 리뷰 권고 9). 판M2-c가 실패하면 이 숫자를 다시 떠야 한다.
> 재현 수단은 `sapkit-engine/harness/probe-destination.mjs`(attended 전용 · 게이트 아님).

## 대상

| 항목 | 값 |
|---|---|
| 시스템 | SAP BTP ABAP Environment **trial** · systemid **`TRL`** · client **100** |
| 리전 | `us10` (US East) |
| service key | BTP 콕핏 Service Key · `credential-type: binding-secret` · **`granttype` 선언 없음** |
| 키 위치 | **레포 밖** — `~/.sapkit/default_key.json` (`.gitignore`가 `.sapkit/` 차단) |
| ADT 종단점 | `https://<guid>.abap.us10.hana.ondemand.com` |
| UAA 종단점 | `https://<subdomain>trial.authentication.us10.hana.ondemand.com` |
| 잰 날 | 2026-08-23 |

⚠ **`abap`와 `abap-web`은 다른 호스트다.** service key의 `url`은 **`abap`**(ADT/API)를
가리키고, Fiori 화면은 **`abap-web`**이다. 사람이 브라우저로 로그인되는 쪽은 후자이며,
전자가 열렸다는 뜻이 아니다 — 이 판에서 실제로 혼동이 한 번 있었다.

## 잰 것 ① — 엔진 기동 (제품 번들 1.1.0 · `--mcp=<destination>`)

| Run | 키 | 진단 | `connection` | 도구 | 네트워크 |
|---|---|---|---|---|---|
| **A** | `granttype` 선언 없음 | `MCP_DESTINATION_TOKEN_PENDING` | `none` | 155 | **왕복 0회** |
| **B** | `granttype: client_credentials` | `TOKEN_REQUIRED` → **`CONNECTED`** | **`yes`** | 155 | **실 UAA 왕복 1회 성공** |

- Run A의 진단은 키 파일 경로 · 인가 종단점 · `client_id` · **다음 걸음**(키에
  `granttype` 추가 / Basic 통로)을 모두 말했다 — **D-114 ⓓ(진단 품질)의 실기동 확인**.
- 두 Run 모두 도구 **155종**이다. 접속 유무가 아니라 **`--exposition` 축**이 표면을
  정하고, destination은 tier=UNKNOWN이라 `readonly,high`로 fail-closed된다. 155는
  「무프로파일」 수치가 아니라 **readonly 수치**다.
- Run B에서 `GetSystemInfo` 호출 → **`{"supported":false}`**. 아래 ②가 그 원인이다.

## 잰 것 ② — `client_credentials` 토큰과 ADT (엔진 밖 프로브)

| 단계 | 결과 |
|---|---|
| UAA 토큰 발급 | **200** |
| 토큰의 `user_name` | **없음** |
| 토큰의 `scope` | **`uaa.resource` 1종** |
| `/sap/bc/adt/discovery` | **401** |
| `/sap/bc/adt/core/http/systeminformation` | **401** |
| `/sap/bc/adt/repository/informationsystem/objecttypes` | **401** |
| `/sap/bc/adt/compatibility/graph` | **401** |
| 401 응답 헤더 | `sap-authenticated: false` · `sap-system: TRL` · `sap-server: true` · `www-authenticate: Basic realm="SAP NetWeaver Application Server [TRL/100][alias]"` |
| **Bearer 없이 같은 경로** | **401 · 헤더 동일** |

**Bearer를 실어 보내나 안 보내나 응답이 같다** — 신원 없는 토큰을 ABAP이 사용자로
매핑하지 못해 **익명과 같이** 취급한다. 토큰 자체는 유효한 채로다(UAA가 200을 냈다).
시스템은 살아 있다(`sap-system: TRL`이 응답).

## 잰 것 ③ — `authorization_code` 토큰과 ADT (사람 브라우저 로그인 1회)

| 단계 | 결과 |
|---|---|
| 토큰 교환 | **200** |
| 토큰의 `user_name` | **있음** |
| `refresh_token` | **발급됨** |
| `/sap/bc/adt/discovery` | **200** · `sap-authenticated: true` · ADT service document(BOPF 등 workspace) |
| `/sap/bc/adt/core/http/systeminformation` | **200** · `{"systemID":"TRL","userName":"CB99800008xx","userFullName":"<uuid>","client":"100","language":"EN"}` |
| `/sap/bc/adt/repository/informationsystem/objecttypes` | **200** · `totalItemCount 100` |
| `/sap/bc/adt/compatibility/graph` | **안 쟀다** |

⚠ **3경로만 쟀다** — 401 쪽은 4경로다. 「ADT 전면 개방」이 아니라 **「잰 3경로가 200」**
이 정확한 서술이다(D-116 ⓑ가 이 비대칭을 정정한다).

## 잰 것 ④ — 콜백 주소 (XSUAA 화이트리스트)

| redirect_uri | 결과 |
|---|---|
| `http://localhost:8080/callback` | **콜백 도달 · code 수령** |
| `http://localhost:8123/callback` | **콜백 미도달**(10분 대기 후 종료) |
| `/oauth/authorize` 사전 요청 | 세 변형 모두 **302 → `/login`** — **로그인 전에는 redirect_uri를 검증하지 않는다** |

⚠ **호스트도 설계 입력이다.** 통과가 확인된 것은 **`localhost`**이고, 이 엔진의
`src/auth/callback.ts`는 `DEFAULT_CALLBACK_HOST = '127.0.0.1'`이라 기본 조립 결과가
`http://127.0.0.1:8080/callback`이 된다. **문자열이 다르면 XSUAA가 거부한다** —
포트만 맞추면 여전히 실패한다. 경로는 `DEFAULT_CALLBACK_PATH = '/callback'`으로 일치.

**화이트리스트의 전체 내용은 모른다** — 위 두 점만 실측했다. `127.0.0.1` 갈래는
**코드 기본값과 실측치의 대조**이지 화이트리스트 실측이 아니다.

## 정책 등급

**전 구간 P1 connected-read.** ADT 메타데이터 경로만 GET했고 **행 데이터를 끌어오지
않았다**(P2 0건) · 아무것도 쓰지 않았다(P3 0건) · 이송 없음(P4 0건).

## 비밀 취급

clientid · clientsecret · access token · refresh token은 **어디에도 기록하지 않았다**.
키 파일은 레포 밖(`~/.sapkit/`)에 있고 `.gitignore`가 `.sapkit/`를 차단한다. 이 판이
엔진 저장소 규약 확인을 위해 만들었던 사본 2종(`~/.sapkit/service-keys/`)은 **삭제했다**.
위 표에 남은 `TRL` · `us10` · `binding-secret` · `client 100`은 비밀이 아니다.

## 재현

```bash
# client_credentials — 사람 손 없이 돈다
node sapkit-engine/harness/probe-destination.mjs --key=~/.sapkit/default_key.json

# authorization_code — 브라우저 로그인 1회. 콜백 주소가 화이트리스트에 있어야 한다
node sapkit-engine/harness/probe-destination.mjs --key=~/.sapkit/default_key.json \
  --grant=authorization_code --host=localhost --port=8080
```

⚠ **게이트가 아니다.** 실 UAA·실 SAP로 나가므로 CI에서 돌리지 않고 게이트 목록에도
넣지 않는다(`harness/record-attended.mjs`와 같은 지위).

## 이 채록이 확인하지 못한 것

- **화이트리스트 전체** — 두 점만 실측했다(④).
- **`compatibility/graph`의 `authorization_code` 결과** — 안 쟀다(③).
- **엔진 `AdtClient`가 사용자 토큰으로 도구를 실제로 돌리는지** — 프로브는 원시 HTTP
  왕복만 쟀다. 그 확인은 판M2-c 몫이다.
- **trial 아닌 BTP ABAP 인스턴스에서도 같은가** — trial 하나만 쟀다.
