# TOOL-LEDGER — 진척 대장

> **손으로 고치지 마라.** 이 파일은 등록점·표면 채록본·제작 계획·증거 파일에서 **계산해 생성**한다.
> 손으로 고친 대장은 게이트가 거부한다.
>
> - 재생성: `node harness/render-ledger.mjs` (`sapkit-engine/`에서 · `npm run build` 뒤)
> - 대조: `node harness/render-ledger.mjs --check` — `npm run gates`의 「대장」 게이트가 같은 판정을 한다

도구 186 · **안 지음 167** · **증거 대기 19** · **증거 있음 0**

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
| 등록점 (`지음` 판정) | `src/tools/registry.ts` | 있음 · 19종 등재 |
| 제작 계획 (묶음·순서·요구 급) | `harness/build-plan.json` | **없음** · 묶음·순서·요구 급을 「미정」으로 낸다 (요구 급은 계산기 기본값 = 계약 시험) |
| 재생 판정 파일 | `evidence/replay/*.json` | **없음** · 재생 증거는 전량 「미기록」. 러너가 판정을 이 경로에 쓰도록 배선돼 있고, 채우는 것은 다음 attended 세션이다 |
| 재생 픽스처 | `fixtures/*.json` | 있음 · 7종의 도구를 건드린다 — 픽스처만으로는 증거가 아니다 |
| attended 실기 기록 | `fixtures/attended-only/*.json` | 있음 · 2단계 |
| 계약 시험 결과 | `evidence/contract/results.json` | **없음** · 계약 증거는 전량 「미기록」. `npm run test:report` → `npm run evidence:contract` 로 만든다 |
| 계약 시험 파일 | `src/tools/**/__tests__/<도구>.test.ts` | 있음 · 19종에 시험 파일이 있다 — 있음이 곧 통과는 아니다 |
| 대체 기대 시험 | `harness/replay/divergences.ts 의 substituteTest 경로` | **없음** · 도구 단위 등재분(D1·D2·D3)의 대체 기대 시험은 아직 산문뿐이다 |
| 위임형 판정 | `../engine/src/handlers/**` | 있음 · 소스 559파일을 상대 import까지 따라가 판정 — 직접 46 · 간접 140 · 없음 0 |

## 안 지음 (167)

등록점(`src/tools/registry.ts`)에 없다. 아직 짓지 않은 도구다.

| 도구 | 묶음 | 순서 | 요구 급 | 재생 | 계약 | attended | 대체 | 위임형 |
|---|---|---|---|---|---|---|---|---|
| CreateBehaviorDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| CreateBehaviorImplementation | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| CreateCdsUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| CreateClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| CreateDataElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| CreateDomain | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| CreateFunctionGroup | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| CreateFunctionModule | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| CreateGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| CreateInterface | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| CreateMetadataExtension | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| CreatePackage | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| CreateScreen | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| CreateServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| CreateServiceDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| CreateStructure | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| CreateTable | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| CreateTextElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| CreateTransport | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| CreateUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| CreateView | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteBehaviorDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteBehaviorImplementation | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteCdsUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteDataElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteDomain | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteFunctionGroup | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteFunctionModule | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteInclude | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| DeleteInterface | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteLocalDefinitions | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteLocalMacros | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteLocalTestClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteLocalTypes | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteMetadataExtension | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteProgram | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteScreen | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteServiceDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteStructure | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteTable | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteTextElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DeleteView | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| DescribeByList | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetAbapAST | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetAbapSemanticAnalysis | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetAbapSystemSymbols | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetAdtTypes | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetAtcFindings | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetBadiImplementations | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetBehaviorDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetBehaviorImplementation | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetCallGraph | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| GetCdsUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetCdsUnitTestResult | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetCdsUnitTestStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetClassMethod | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetDataElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetDomain | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetEnhancementImpl | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetEnhancements | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| GetEnhancementSpot | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetFunctionGroup | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetGuiStatusList | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetIncludesList | 미정 | 미정 | 미정(→계약 시험) + 대체 | — | — | — | 요구 · 미기록 | 간접 |
| GetInstalledComponents | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| GetInterface | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetLocalDefinitions | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetLocalMacros | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetLocalTestClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| GetLocalTypes | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetMetadataExtension | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetNodeStructureLow | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| GetObjectInfo | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetObjectNodeFromCache | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetObjectsByType | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetObjectsList | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| GetObjectStructure | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetObjectStructureLow | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| GetPackage | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetPackageContents | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetPackageTree | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| GetProgFullCode | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetScreen | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetScreensList | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetServiceDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetSession | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetSystemInfo | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| GetTableContents | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetTextElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetTransaction | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetTransport | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetTypeInfo | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetUnitTestResult | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetUnitTestStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetView | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GetVirtualFoldersLow | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| GetWhereUsed | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| GrepPackages | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| ListServiceBindingTypes | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ListTransports | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| PatchGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadBehaviorDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadBehaviorImplementation | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadDataElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadDomain | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadFunctionGroup | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadFunctionModule | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadInterface | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadMetadataExtension | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadPackage | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadProgram | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadScreen | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadServiceDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadStructure | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadTable | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadTextElementsBulk | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReadView | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReleaseTransport | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ReloadProfile | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| RuntimeAnalyzeDump | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| RuntimeAnalyzeProfilerTrace | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| RuntimeCreateProfilerTraceParameters | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| RuntimeGetDumpById | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| RuntimeGetGatewayErrorLog | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| RuntimeGetProfilerTraceData | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| RuntimeListDumps | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| RuntimeListFeeds | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| RuntimeListProfilerTraceFiles | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| RuntimeListSystemMessages | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| RuntimeRunClassWithProfiling | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| RuntimeRunProgramWithProfiling | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| RunUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateBehaviorDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| UpdateBehaviorImplementation | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| UpdateCdsUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateClassMethod | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateDataElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| UpdateDomain | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| UpdateFunctionGroup | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| UpdateFunctionModule | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| UpdateGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateInterface | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| UpdateLocalDefinitions | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateLocalMacros | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateLocalTestClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateLocalTypes | 미정 | 미정 | 미정(→계약 시험) + 대체 | — | — | — | 요구 · 미기록 | 간접 |
| UpdateMetadataExtension | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateScreen | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateServiceDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| UpdateStructure | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| UpdateTable | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 직접 |
| UpdateTextElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| UpdateView | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| ValidateServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |
| WriteTextElementsBulk | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 간접 |

## 지음 · 증거 대기 (19)

등록점에 있다. 그러나 **요구 증거 급이 아직 안 찼다** — 다른 급의 증거가 있어도 요구 급을 대신하지 못한다.

| 도구 | 묶음 | 순서 | 요구 급 | 재생 | 계약 | attended | 대체 | 위임형 |
|---|---|---|---|---|---|---|---|---|
| ActivateObjects | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 간접 |
| CheckSyntax | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 간접 |
| CreateInclude | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 직접 |
| CreateProgram | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | 통과(1) | — | 직접 |
| GetClass | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 간접 |
| GetFunctionModule | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 간접 |
| GetInactiveObjects | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 간접 |
| GetInclude | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 간접 |
| GetProgram | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | 통과(1) | — | 간접 |
| GetSourceDiff | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 간접 |
| GetSqlQuery | 미정 | 미정 | 미정(→계약 시험) + 대체 | — | 시험 있음 · 결과 미기록 | — | 요구 · 미기록 | 직접 |
| GetStructure | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 간접 |
| GetTable | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 간접 |
| GrepObjects | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 직접 |
| SearchObject | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 직접 |
| UpdateClass | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 간접 |
| UpdateInclude | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 간접 |
| UpdateProgram | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 간접 |
| UpdateSourceByPatch | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 간접 |

## 증거 있음 (0)

요구 증거 급이 찼다 (부가 요건이 있으면 그것까지).

없다.

## 남은 수 요약

- **안 지음 167** — 등록점에 없다
- **증거 대기 19** — 지었으나 요구 증거 급이 아직 안 찼다
- **증거 있음 0** — 요구 급이 찼다

어느 급에서도 통과 증거가 없는 도구 **184종** (요구 급 충족과는 다른 질문이다 — 증거가 있어도 급이 덜 찰 수 있다).

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

