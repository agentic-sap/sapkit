# TOOL-LEDGER — 진척 대장

> **손으로 고치지 마라.** 이 파일은 등록점·표면 채록본·제작 계획·증거 파일에서 **계산해 생성**한다.
> 손으로 고친 대장은 게이트가 거부한다.
>
> - 재생성: `node harness/render-ledger.mjs` (`sapkit-engine/`에서 · `npm run build` 뒤)
> - 대조: `node harness/render-ledger.mjs --check` — `npm run gates`의 「대장」 게이트가 같은 판정을 한다

도구 186 · **안 지음 167** · **증거 대기 19** · **증거 있음 0**

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
| 위임형 판정 | `../engine/src/handlers/**` | 있음 · 구 핸들러 339종 중 이 표면의 46종이 `@babamba2/*`를 참조한다 |

## 안 지음 (167)

등록점(`src/tools/registry.ts`)에 없다. 아직 짓지 않은 도구다.

| 도구 | 묶음 | 순서 | 요구 급 | 재생 | 계약 | attended | 대체 | 위임형 |
|---|---|---|---|---|---|---|---|---|
| CreateBehaviorDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| CreateBehaviorImplementation | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| CreateCdsUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| CreateClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| CreateDataElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| CreateDomain | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| CreateFunctionGroup | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| CreateFunctionModule | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| CreateGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| CreateInterface | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| CreateMetadataExtension | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| CreatePackage | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| CreateScreen | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| CreateServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| CreateServiceDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| CreateStructure | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| CreateTable | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| CreateTextElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| CreateTransport | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| CreateUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| CreateView | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteBehaviorDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteBehaviorImplementation | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteCdsUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteDataElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteDomain | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteFunctionGroup | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteFunctionModule | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteInclude | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| DeleteInterface | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteLocalDefinitions | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteLocalMacros | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteLocalTestClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteLocalTypes | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteMetadataExtension | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteProgram | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteScreen | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteServiceDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteStructure | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteTable | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteTextElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DeleteView | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| DescribeByList | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetAbapAST | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetAbapSemanticAnalysis | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetAbapSystemSymbols | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetAdtTypes | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetAtcFindings | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetBadiImplementations | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetBehaviorDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetBehaviorImplementation | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetCallGraph | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| GetCdsUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetCdsUnitTestResult | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetCdsUnitTestStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetClassMethod | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetDataElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetDomain | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetEnhancementImpl | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetEnhancements | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| GetEnhancementSpot | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetFunctionGroup | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetGuiStatusList | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetIncludesList | 미정 | 미정 | 미정(→계약 시험) + 대체 | — | — | — | 요구 · 미기록 | 자립 |
| GetInstalledComponents | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| GetInterface | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetLocalDefinitions | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetLocalMacros | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetLocalTestClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| GetLocalTypes | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetMetadataExtension | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetNodeStructureLow | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| GetObjectInfo | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetObjectNodeFromCache | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetObjectsByType | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetObjectsList | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| GetObjectStructure | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetObjectStructureLow | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| GetPackage | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetPackageContents | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetPackageTree | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| GetProgFullCode | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetScreen | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetScreensList | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetServiceDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetSession | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetSystemInfo | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| GetTableContents | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetTextElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetTransaction | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetTransport | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetTypeInfo | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetUnitTestResult | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetUnitTestStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetView | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GetVirtualFoldersLow | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| GetWhereUsed | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| GrepPackages | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| ListServiceBindingTypes | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ListTransports | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| PatchGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadBehaviorDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadBehaviorImplementation | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadDataElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadDomain | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadFunctionGroup | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadFunctionModule | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadInterface | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadMetadataExtension | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadPackage | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadProgram | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadScreen | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadServiceDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadStructure | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadTable | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadTextElementsBulk | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReadView | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReleaseTransport | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ReloadProfile | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| RuntimeAnalyzeDump | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| RuntimeAnalyzeProfilerTrace | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| RuntimeCreateProfilerTraceParameters | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| RuntimeGetDumpById | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| RuntimeGetGatewayErrorLog | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| RuntimeGetProfilerTraceData | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| RuntimeListDumps | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| RuntimeListFeeds | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| RuntimeListProfilerTraceFiles | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| RuntimeListSystemMessages | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| RuntimeRunClassWithProfiling | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| RuntimeRunProgramWithProfiling | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| RunUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateBehaviorDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| UpdateBehaviorImplementation | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| UpdateCdsUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateClassMethod | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateDataElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| UpdateDomain | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| UpdateFunctionGroup | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| UpdateFunctionModule | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| UpdateGuiStatus | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateInterface | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| UpdateLocalDefinitions | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateLocalMacros | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateLocalTestClass | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateLocalTypes | 미정 | 미정 | 미정(→계약 시험) + 대체 | — | — | — | 요구 · 미기록 | 자립 |
| UpdateMetadataExtension | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateScreen | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateServiceDefinition | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| UpdateStructure | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| UpdateTable | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 위임 |
| UpdateTextElement | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateUnitTest | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| UpdateView | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| ValidateServiceBinding | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |
| WriteTextElementsBulk | 미정 | 미정 | 미정(→계약 시험) | — | — | — | — | 자립 |

## 지음 · 증거 대기 (19)

등록점에 있다. 그러나 **요구 증거 급이 아직 안 찼다** — 다른 급의 증거가 있어도 요구 급을 대신하지 못한다.

| 도구 | 묶음 | 순서 | 요구 급 | 재생 | 계약 | attended | 대체 | 위임형 |
|---|---|---|---|---|---|---|---|---|
| ActivateObjects | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 자립 |
| CheckSyntax | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 자립 |
| CreateInclude | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 위임 |
| CreateProgram | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | 통과(1) | — | 위임 |
| GetClass | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 자립 |
| GetFunctionModule | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 자립 |
| GetInactiveObjects | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 자립 |
| GetInclude | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 자립 |
| GetProgram | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | 통과(1) | — | 자립 |
| GetSourceDiff | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 자립 |
| GetSqlQuery | 미정 | 미정 | 미정(→계약 시험) + 대체 | — | 시험 있음 · 결과 미기록 | — | 요구 · 미기록 | 위임 |
| GetStructure | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 자립 |
| GetTable | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 자립 |
| GrepObjects | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 위임 |
| SearchObject | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 위임 |
| UpdateClass | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 자립 |
| UpdateInclude | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 자립 |
| UpdateProgram | 미정 | 미정 | 미정(→계약 시험) | 픽스처 있음 · 판정 미기록 | 시험 있음 · 결과 미기록 | — | — | 자립 |
| UpdateSourceByPatch | 미정 | 미정 | 미정(→계약 시험) | — | 시험 있음 · 결과 미기록 | — | — | 자립 |

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
| `위임` / `자립` | 구 핸들러가 `@babamba2/*`를 참조하는가 — 자체 저작으로 갈아탈 때의 무게다 |
| `미상` | 구 엔진 소스를 읽지 못해 판정하지 않았다. 없다는 뜻이 아니다 |

`통과(n)`·`실패(n)`의 `n`은 그 급에서 이 도구를 건드린 건수다.

