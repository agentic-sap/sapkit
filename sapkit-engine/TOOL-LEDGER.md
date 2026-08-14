# TOOL-LEDGER — 진척 대장

> **손으로 고치지 마라.** 이 파일은 등록점·표면 채록본·제작 계획·증거 파일에서 **계산해 생성**한다.
> 손으로 고친 대장은 게이트가 거부한다.
>
> - 재생성: `node harness/render-ledger.mjs` (`sapkit-engine/`에서 · `npm run build` 뒤)
> - 대조: `node harness/render-ledger.mjs --check` — `npm run gates`의 「대장」 게이트가 같은 판정을 한다

도구 186 · **안 지음 95** · **증거 대기 73** · **증거 있음 18**

## 위임형 열을 읽는 법 — 두 수는 단위가 다르다

구 핸들러에서 `@babamba2/*`를 **직접** 쓰는 것은 **161파일**이고, 이 표면 186종 중 **직접 위임하는 도구는 46종**이다. **둘은 단위가 다르다** — 앞은 파일 수, 뒤는 도구 수다. 나머지 115파일은 이 표면 밖 이름이거나 도구 선언이 아예 없는 파일이다.

여기에 **간접 140종**이 더 있다 — 겉 핸들러는 `@babamba2`를 직접 부르지 않지만 `engine/src` 안의 공용 헬퍼를 거쳐 닿는다. 이 열이 존재하는 이유가 그것이다: 재생 대조를 미룬 도구에게는 **참조 원본의 깊이가 유일한 정확성 근거**이고, 간접 위임을 「없음」으로 읽으면 안쪽 패키지를 안 읽고 겉만 보고 짓게 된다.

판정 범위는 `engine/src` 아래 소스 **559파일**이고, 상대 import(`./x`·`../x.js`·`../x/index`)를 거슬러 도달 여부를 본다.

**「없음 0」은 계산이 성긴 탓이 아니다.** 타입 경로로만 닿는 도구는 **0종**이다 — 즉 186종 전부가 `import type`이 아니라 **값으로** `@babamba2`를 부르는 파일에 닿는다. 겉 핸들러만 읽고 지어도 되는 도구는 이 표면에 없다는 뜻이다.

되짚어 보면 방향이 반대다: 핸들러 파일 161개의 `@babamba2` 참조 중 **값 참조는 12개뿐**이고 나머지는 타입이다. **런타임 위임은 겉이 아니라 `engine/src/lib/`에 있다** — 자체 저작으로 갈아탈 때 실제로 갈아엎어야 하는 것은 핸들러가 아니라 그 공용 계층이다.

## 입력 — 이 대장이 무엇을 읽었나

증거 열은 **레포 안의 파일**에서만 나온다. 문서 서술과 옛 콘솔 출력은 입력이 아니다.

| 입력 | 파일 | 지금 |
|---|---|---|
| 도구 전체 목록 | `harness/old-surface/m1-tools.json` | 있음 · 186종 — 구 번들 표면 채록본의 전량 선언 |
| 등록점 (`지음` 판정) | `src/tools/registry.ts` | 있음 · 91종 등재 |
| 제작 계획 (묶음·순서·요구 급) | `harness/build-plan.json` | 있음 · 묶음 29 · 배정된 도구 186종 |
| 재생 판정 파일 | `evidence/replay/*.json` | **없음** · 재생 증거는 전량 「미기록」. 러너가 판정을 이 경로에 쓰도록 배선돼 있고, 채우는 것은 다음 attended 세션이다 |
| 재생 픽스처 | `fixtures/*.json` | 있음 · 7종의 도구를 건드린다 — 픽스처만으로는 증거가 아니다 |
| attended 실기 기록 | `fixtures/attended-only/*.json` | 있음 · 2단계 |
| 계약 시험 결과 | `evidence/contract/results.json` | 있음 · 91종 |
| 계약 시험 파일 | `src/tools/**/__tests__/<도구>.test.ts` | 있음 · 91종에 시험 파일이 있다 — 있음이 곧 통과는 아니다 |
| 대체 기대 시험 | `harness/replay/divergences.ts 의 substituteTest 경로` | 있음 · 7종에 실재하는 시험 파일이 있다 |
| 위임형 판정 | `../engine/src/handlers/**` | 있음 · 소스 559파일을 상대 import까지 따라가 판정 — 직접 46 · 간접 140 · 없음 0 |

## 안 지음 (95)

등록점(`src/tools/registry.ts`)에 없다. 아직 짓지 않은 도구다.

| 도구 | 묶음 | 순서 | 요구 급 | 재생 | 계약 | attended | 대체 | 위임형 |
|---|---|---|---|---|---|---|---|---|
| GetUnitTest | 단위시험 | 12 | 재생 대조 | — | — | — | — | 간접 |
| GetUnitTestResult | 단위시험 | 12 | 재생 대조 | — | — | — | — | 간접 |
| GetUnitTestStatus | 단위시험 | 12 | 재생 대조 | — | — | — | — | 간접 |
| RunUnitTest | 단위시험 | 12 | 재생 대조 | — | — | — | — | 간접 |
| CreateBehaviorDefinition | 동작 정의 (BDEF) | 13 | attended 실기 | — | — | — | — | 직접 |
| GetBehaviorDefinition | 동작 정의 (BDEF) | 13 | 재생 대조 | — | — | — | — | 간접 |
| ReadBehaviorDefinition | 동작 정의 (BDEF) | 13 | 재생 대조 | — | — | — | — | 간접 |
| UpdateBehaviorDefinition | 동작 정의 (BDEF) | 13 | 재생 대조 | — | — | — | — | 직접 |
| CreateServiceBinding | 서비스 바인딩 | 15 | attended 실기 | — | — | — | — | 간접 |
| GetServiceBinding | 서비스 바인딩 | 15 | 재생 대조 | — | — | — | — | 간접 |
| ListServiceBindingTypes | 서비스 바인딩 | 15 | 재생 대조 | — | — | — | — | 간접 |
| ReadServiceBinding | 서비스 바인딩 | 15 | 재생 대조 | — | — | — | — | 간접 |
| UpdateServiceBinding | 서비스 바인딩 | 15 | 재생 대조 | — | — | — | — | 간접 |
| ValidateServiceBinding | 서비스 바인딩 | 15 | 재생 대조 | — | — | — | — | 간접 |
| CreateTransport | 트랜스포트 | 17 | attended 실기 | — | — | — | — | 직접 |
| GetTransport | 트랜스포트 | 17 | 재생 대조 | — | — | — | — | 간접 |
| ListTransports | 트랜스포트 | 17 | 재생 대조 | — | — | — | — | 간접 |
| ReleaseTransport | 트랜스포트 | 17 | 계약 시험 | — | — | — | — | 간접 |
| CreateMetadataExtension | 메타데이터 확장 (DDLX) | 18 | attended 실기 | — | — | — | — | 간접 |
| GetMetadataExtension | 메타데이터 확장 (DDLX) | 18 | 재생 대조 | — | — | — | — | 간접 |
| ReadMetadataExtension | 메타데이터 확장 (DDLX) | 18 | 재생 대조 | — | — | — | — | 간접 |
| UpdateMetadataExtension | 메타데이터 확장 (DDLX) | 18 | 재생 대조 | — | — | — | — | 간접 |
| CreateGuiStatus | GUI 상태 | 19 | attended 실기 | — | — | — | — | 간접 |
| GetGuiStatus | GUI 상태 | 19 | 재생 대조 | — | — | — | — | 간접 |
| GetGuiStatusList | GUI 상태 | 19 | 재생 대조 | — | — | — | — | 간접 |
| PatchGuiStatus | GUI 상태 | 19 | 재생 대조 | — | — | — | — | 간접 |
| ReadGuiStatus | GUI 상태 | 19 | 재생 대조 | — | — | — | — | 간접 |
| UpdateGuiStatus | GUI 상태 | 19 | 계약 시험 | — | — | — | — | 간접 |
| CreateTextElement | 텍스트 엘리먼트 | 20 | attended 실기 | — | — | — | — | 간접 |
| GetTextElement | 텍스트 엘리먼트 | 20 | 재생 대조 | — | — | — | — | 간접 |
| ReadTextElementsBulk | 텍스트 엘리먼트 | 20 | 재생 대조 | — | — | — | — | 간접 |
| UpdateTextElement | 텍스트 엘리먼트 | 20 | 계약 시험 | — | — | — | — | 간접 |
| WriteTextElementsBulk | 텍스트 엘리먼트 | 20 | 재생 대조 | — | — | — | — | 간접 |
| GetAtcFindings | ATC | 21 | 재생 대조 | — | — | — | — | 간접 |
| GetPackage | 패키지 | 22 | 재생 대조 | — | — | — | — | 간접 |
| GetPackageContents | 패키지 | 22 | 재생 대조 | — | — | — | — | 간접 |
| CreateScreen | 화면 | 23 | attended 실기 | — | — | — | — | 간접 |
| GetScreen | 화면 | 23 | 재생 대조 | — | — | — | — | 간접 |
| GetScreensList | 화면 | 23 | 재생 대조 | — | — | — | — | 간접 |
| ReadScreen | 화면 | 23 | 재생 대조 | — | — | — | — | 간접 |
| UpdateScreen | 화면 | 23 | 계약 시험 | — | — | — | — | 간접 |
| CreateServiceDefinition | 서비스 정의 | 24 | attended 실기 | — | — | — | — | 직접 |
| CreateBehaviorImplementation | 동작 구현 (BIMP) | 25 | attended 실기 | — | — | — | — | 직접 |
| GetBehaviorImplementation | 동작 구현 (BIMP) | 25 | 재생 대조 | — | — | — | — | 간접 |
| ReadBehaviorImplementation | 동작 구현 (BIMP) | 25 | 재생 대조 | — | — | — | — | 간접 |
| UpdateBehaviorImplementation | 동작 구현 (BIMP) | 25 | 재생 대조 | — | — | — | — | 직접 |
| CreateCdsUnitTest | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| CreatePackage | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 직접 |
| CreateUnitTest | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteBehaviorDefinition | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteBehaviorImplementation | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteCdsUnitTest | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteClass | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteDataElement | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteDomain | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteFunctionGroup | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteFunctionModule | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteGuiStatus | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteInclude | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 직접 |
| DeleteInterface | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteLocalDefinitions | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteLocalMacros | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteLocalTestClass | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteLocalTypes | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteMetadataExtension | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteProgram | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteScreen | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteServiceBinding | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteServiceDefinition | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteStructure | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteTable | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteTextElement | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteUnitTest | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| DeleteView | 꼬리 — 호출·참조 양쪽 0 | 29 | attended 실기 | — | — | — | — | 간접 |
| GetAdtTypes | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| GetBadiImplementations | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| GetCallGraph | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 직접 |
| GetCdsUnitTest | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| GetCdsUnitTestResult | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| GetCdsUnitTestStatus | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| GetNodeStructureLow | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 직접 |
| GetObjectNodeFromCache | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| GetObjectsList | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 직접 |
| GetObjectStructureLow | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 직접 |
| GetVirtualFoldersLow | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 직접 |
| ReadPackage | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| RuntimeListFeeds | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| RuntimeListSystemMessages | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| UpdateCdsUnitTest | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| UpdateDataElement | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 직접 |
| UpdateDomain | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 직접 |
| UpdateFunctionGroup | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 직접 |
| UpdateLocalDefinitions | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| UpdateLocalMacros | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |
| UpdateUnitTest | 꼬리 — 호출·참조 양쪽 0 | 29 | 계약 시험 | — | — | — | — | 간접 |

## 지음 · 증거 대기 (73)

등록점에 있다. 그러나 **요구 증거 급이 아직 안 찼다** — 다른 급의 증거가 있어도 요구 급을 대신하지 못한다.

| 도구 | 묶음 | 순서 | 요구 급 | 재생 | 계약 | attended | 대체 | 위임형 |
|---|---|---|---|---|---|---|---|---|
| CheckSyntax | 시스템·공통 조회 | 1 | 재생 대조 | 픽스처 있음 · 판정 미기록 | 통과(1) | — | — | 간접 |
| DescribeByList | 시스템·공통 조회 | 1 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetAbapSystemSymbols | 시스템·공통 조회 | 1 | 재생 대조 + 대체 | — | 통과(1) | — | 통과(1) | 간접 |
| GetInactiveObjects | 시스템·공통 조회 | 1 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetInstalledComponents | 시스템·공통 조회 | 1 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| GetObjectStructure | 시스템·공통 조회 | 1 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetSession | 시스템·공통 조회 | 1 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetSqlQuery | 시스템·공통 조회 | 1 | 재생 대조 + 대체 | — | 통과(1) | — | 요구 · 미기록 | 직접 |
| GetSystemInfo | 시스템·공통 조회 | 1 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| GetTransaction | 시스템·공통 조회 | 1 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetTypeInfo | 시스템·공통 조회 | 1 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetWhereUsed | 시스템·공통 조회 | 1 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GrepObjects | 검색 | 2 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| GrepPackages | 검색 | 2 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| SearchObject | 검색 | 2 | 재생 대조 | 픽스처 있음 · 판정 미기록 | 통과(1) | — | — | 직접 |
| ActivateObjects | 공통 편집·활성 | 3 | 재생 대조 | 픽스처 있음 · 판정 미기록 | 통과(1) | — | — | 간접 |
| UpdateSourceByPatch | 공통 편집·활성 | 3 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| ReloadProfile | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 재생 대조 + 대체 | — | 통과(1) | — | 통과(3) | 간접 |
| RuntimeAnalyzeProfilerTrace | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| RuntimeGetGatewayErrorLog | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| RuntimeGetProfilerTraceData | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| RuntimeListDumps | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| RuntimeListProfilerTraceFiles | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| RuntimeRunClassWithProfiling | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| RuntimeRunProgramWithProfiling | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| CreateInclude | 인클루드 | 5 | attended 실기 | — | 통과(1) | — | — | 직접 |
| GetInclude | 인클루드 | 5 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetIncludesList | 인클루드 | 5 | 재생 대조 + 대체 | — | 통과(1) | — | 통과(1) | 간접 |
| UpdateInclude | 인클루드 | 5 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| CreateClass | 클래스 | 6 | attended 실기 | — | 통과(1) | — | — | 직접 |
| GetClass | 클래스 | 6 | 재생 대조 | 픽스처 있음 · 판정 미기록 | 통과(1) | — | — | 간접 |
| GetClassMethod | 클래스 | 6 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetLocalTestClass | 클래스 | 6 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| GetLocalTypes | 클래스 | 6 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| ReadClass | 클래스 | 6 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| UpdateClass | 클래스 | 6 | 재생 대조 | 픽스처 있음 · 판정 미기록 | 통과(1) | — | — | 간접 |
| UpdateClassMethod | 클래스 | 6 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| UpdateLocalTestClass | 클래스 | 6 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| UpdateLocalTypes | 클래스 | 6 | 재생 대조 + 대체 | — | 통과(1) | — | 통과(1) | 간접 |
| CreateTable | 테이블 | 7 | attended 실기 | — | 통과(1) | — | — | 간접 |
| GetTable | 테이블 | 7 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetTableContents | 테이블 | 7 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| ReadTable | 테이블 | 7 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| UpdateTable | 테이블 | 7 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| GetProgFullCode | 프로그램 | 8 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetProgram | 프로그램 | 8 | 재생 대조 | 픽스처 있음 · 판정 미기록 | 통과(1) | 통과(1) | — | 간접 |
| ReadProgram | 프로그램 | 8 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| UpdateProgram | 프로그램 | 8 | 재생 대조 | 픽스처 있음 · 판정 미기록 | 통과(1) | — | — | 간접 |
| CreateFunctionModule | 함수모듈 | 9 | attended 실기 | — | 통과(1) | — | — | 간접 |
| GetFunctionModule | 함수모듈 | 9 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| ReadFunctionModule | 함수모듈 | 9 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| UpdateFunctionModule | 함수모듈 | 9 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| CreateStructure | 구조체 | 10 | attended 실기 | — | 통과(1) | — | — | 직접 |
| GetStructure | 구조체 | 10 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| ReadStructure | 구조체 | 10 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| UpdateStructure | 구조체 | 10 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| CreateView | 뷰 | 11 | attended 실기 | — | 통과(1) | — | — | 간접 |
| GetView | 뷰 | 11 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| ReadView | 뷰 | 11 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| UpdateView | 뷰 | 11 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| CreateDataElement | 데이터 엘리먼트 | 14 | attended 실기 | — | 통과(1) | — | — | 직접 |
| GetDataElement | 데이터 엘리먼트 | 14 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| ReadDataElement | 데이터 엘리먼트 | 14 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| CreateDomain | 도메인 | 16 | attended 실기 | — | 통과(1) | — | — | 직접 |
| GetDomain | 도메인 | 16 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| ReadDomain | 도메인 | 16 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| GetServiceDefinition | 서비스 정의 | 24 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| ReadServiceDefinition | 서비스 정의 | 24 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| UpdateServiceDefinition | 서비스 정의 | 24 | 재생 대조 | — | 통과(1) | — | — | 직접 |
| CreateFunctionGroup | 함수그룹 | 26 | attended 실기 | — | 통과(1) | — | — | 직접 |
| GetFunctionGroup | 함수그룹 | 26 | 재생 대조 | — | 통과(1) | — | — | 간접 |
| CreateInterface | 인터페이스 | 27 | attended 실기 | — | 통과(1) | — | — | 간접 |
| GetInterface | 인터페이스 | 27 | 재생 대조 | — | 통과(1) | — | — | 간접 |

## 증거 있음 (18)

요구 증거 급이 찼다 (부가 요건이 있으면 그것까지).

| 도구 | 묶음 | 순서 | 요구 급 | 재생 | 계약 | attended | 대체 | 위임형 |
|---|---|---|---|---|---|---|---|---|
| GetAbapAST | 시스템·공통 조회 | 1 | 계약 시험 | — | 통과(1) | — | — | 간접 |
| GetAbapSemanticAnalysis | 시스템·공통 조회 | 1 | 계약 시험 | — | 통과(1) | — | — | 간접 |
| GetObjectInfo | 시스템·공통 조회 | 1 | 계약 시험 + 대체 | — | 통과(1) | — | 통과(1) | 간접 |
| GetPackageTree | 시스템·공통 조회 | 1 | 계약 시험 | — | 통과(1) | — | — | 직접 |
| GetObjectsByType | 검색 | 2 | 계약 시험 | — | 통과(1) | — | — | 간접 |
| GetSourceDiff | 공통 편집·활성 | 3 | 계약 시험 | — | 통과(1) | — | — | 간접 |
| RuntimeAnalyzeDump | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 계약 시험 | — | 통과(1) | — | — | 직접 |
| RuntimeCreateProfilerTraceParameters | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 계약 시험 | — | 통과(1) | — | — | 직접 |
| RuntimeGetDumpById | 런타임 — 덤프·프로파일러·시스템 메시지 | 4 | 계약 시험 | — | 통과(1) | — | — | 직접 |
| GetLocalDefinitions | 클래스 | 6 | 계약 시험 | — | 통과(1) | — | — | 간접 |
| GetLocalMacros | 클래스 | 6 | 계약 시험 | — | 통과(1) | — | — | 간접 |
| CreateProgram | 프로그램 | 8 | attended 실기 | — | 통과(1) | 통과(1) | — | 직접 |
| ReadFunctionGroup | 함수그룹 | 26 | 계약 시험 | — | 통과(1) | — | — | 간접 |
| ReadInterface | 인터페이스 | 27 | 계약 시험 | — | 통과(1) | — | — | 간접 |
| UpdateInterface | 인터페이스 | 27 | 계약 시험 | — | 통과(1) | — | — | 직접 |
| GetEnhancementImpl | 인핸스먼트 | 28 | 계약 시험 | — | 통과(1) | — | — | 간접 |
| GetEnhancements | 인핸스먼트 | 28 | 계약 시험 | — | 통과(1) | — | — | 직접 |
| GetEnhancementSpot | 인핸스먼트 | 28 | 계약 시험 | — | 통과(1) | — | — | 간접 |

## 남은 수 요약

- **안 지음 95** — 등록점에 없다
- **증거 대기 73** — 지었으나 요구 증거 급이 아직 안 찼다
- **증거 있음 18** — 요구 급이 찼다

어느 급에서도 통과 증거가 없는 도구 **95종** (요구 급 충족과는 다른 질문이다 — 증거가 있어도 급이 덜 찰 수 있다).

## 칸의 말

| 표기 | 뜻 |
|---|---|
| `미정` | 제작 계획이 아직 이 도구를 배정하지 않았다 |
| `미정(→계약 시험)` | 요구 급 미정 — 계산기 기본값(사다리 3)을 쓴 것이지 정해진 것이 아니다 |
| `픽스처 있음 · 판정 미기록` | 재생 픽스처는 커밋돼 있으나 **커밋된 판정 파일이 없다** — 통과가 아니다 |
| `시험 있음 · 결과 미기록` | 계약 시험 파일은 있으나 **실행 결과 파일이 없다** — 통과가 아니다 |
| `요구 · 미기록` | 차이 장부 등재분이라 대체 기대 시험을 **더** 요구하는데, 그 시험 파일이 아직 없다 |
| 위임형 `직접` | 그 도구의 핸들러 파일이 `@babamba2/*`를 직접 참조한다 |
| 위임형 `간접` | 핸들러는 직접 안 부르지만 `engine/src` 안의 헬퍼를 거쳐 닿는다 — **겉만 읽으면 안 된다** |
| 위임형 `없음` | 어느 경로로도 닿지 않는다 — 겉 핸들러만 읽어도 되는 도구다 |
| 위임형 `미상` | 구 엔진 소스를 읽지 못해 판정하지 않았다. 없다는 뜻이 아니다 |

`통과(n)`·`실패(n)`의 `n`은 그 급에서 이 도구를 건드린 건수다.

