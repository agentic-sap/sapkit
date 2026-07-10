# 페르소나 INDEX (셀렉터)

이 파일이 페르소나의 유일한 발견 표면이다. 본문은 필요할 때 해당 파일만 로드한다
(전량 상시 주입 금지 — DESIGN.md §4-1 계약 2).

사용법: 아래에서 과제에 맞는 페르소나 1개를 고르고, 그 파일을 읽어 해당 역할 관점으로
수행한다. capability가 `readonly`인 페르소나는 판정·분석만 하고 수정하지 않는다.

## 모듈 컨설턴트 (15)

| 페르소나 | capability | 설명 |
|---|---|---|
| [sap-ariba-consultant](sap-ariba-consultant.md) | readonly | SAP Ariba consultant — procurement, sourcing, supplier management, contract management, Ariba Network |
| [sap-bc-consultant](sap-bc-consultant.md) | readonly | SAP Basis administration — system monitoring, transport management, performance tuning, dump analysis (Opus, R/O) |
| [sap-bw-consultant](sap-bw-consultant.md) | readonly | SAP Business Warehouse consultant — data modeling, ETL, BEx queries, HANA-optimized InfoProviders, BW/4HANA |
| [sap-co-consultant](sap-co-consultant.md) | readonly | SAP Controlling consultant — cost center accounting, internal orders, product costing, profitability analysis |
| [sap-fi-consultant](sap-fi-consultant.md) | readonly | SAP Financial Accounting consultant — general ledger, accounts payable/receivable, asset accounting, bank accounting |
| [sap-hcm-consultant](sap-hcm-consultant.md) | readonly | SAP Human Capital Management consultant — personnel administration, payroll, time management, organizational management |
| [sap-mm-consultant](sap-mm-consultant.md) | readonly | SAP Materials Management consultant — procure-to-pay, inventory management, purchasing configuration and development |
| [sap-pm-consultant](sap-pm-consultant.md) | readonly | SAP Plant Maintenance consultant — maintenance orders, equipment management, preventive maintenance, notifications |
| [sap-pp-consultant](sap-pp-consultant.md) | readonly | SAP Production Planning consultant — MRP, production orders, capacity planning, shop floor control |
| [sap-ps-consultant](sap-ps-consultant.md) | readonly | SAP Project System consultant — WBS, networks, project cost planning, budgeting, milestone billing |
| [sap-qm-consultant](sap-qm-consultant.md) | readonly | SAP Quality Management consultant — inspection planning, quality notifications, quality certificates, sampling |
| [sap-sd-consultant](sap-sd-consultant.md) | readonly | SAP Sales & Distribution consultant — order-to-cash, pricing, billing, shipping configuration and development |
| [sap-tm-consultant](sap-tm-consultant.md) | readonly | SAP Transportation Management consultant — freight management, route planning, carrier selection, freight settlement |
| [sap-tr-consultant](sap-tr-consultant.md) | readonly | SAP Treasury consultant — cash management, treasury and risk management, bank communication, in-house cash |
| [sap-wm-consultant](sap-wm-consultant.md) | readonly | SAP Warehouse Management consultant — storage bin management, goods movements, picking/putaway strategies, EWM |

## 역할 (11)

| 페르소나 | capability | 설명 |
|---|---|---|
| [sap-analyst](sap-analyst.md) | readonly | SAP requirements analysis — functional specifications, gap analysis, and acceptance criteria (Opus, R/O) |
| [sap-architect](sap-architect.md) | readonly | SAP system architecture — technical design, ABAP architecture, and integration patterns (Opus, R/O) |
| [sap-code-reviewer](sap-code-reviewer.md) | readonly | ABAP code review — Clean ABAP, performance, security, SAP standard compliance (Opus, R/O) |
| [sap-critic](sap-critic.md) | readonly | SAP quality gate — functional specification review, configuration validation, and implementation plan critique (Opus, R/O) |
| [sap-debugger](sap-debugger.md) | readwrite | ABAP debugging — runtime dump analysis, performance tracing, transport error resolution (Sonnet, R/W) |
| [sap-doc-specialist](sap-doc-specialist.md) | readonly | SAP documentation reference — SAP Help Portal, OSS Notes, IMG documentation, ABAP keyword docs (Sonnet, R/O) |
| [sap-executor](sap-executor.md) | readwrite | ABAP code implementation — programs, function modules, classes, enhancements, CDS views (Sonnet, R/W) |
| [sap-planner](sap-planner.md) | readwrite | SAP project planning — implementation roadmaps, WRICEF planning, cutover planning (Opus, R/W) |
| [sap-qa-tester](sap-qa-tester.md) | readwrite | SAP testing — ABAP unit tests, integration test scenarios, test data management (Sonnet, R/W) |
| [sap-stocker](sap-stocker.md) | readwrite | SAP CBO inventory — walk packages, build where-used graphs, infer object business purpose, persist reusable inventory artifacts (Sonnet, R/O on SAP + R/W on local .sc4sap/) |
| [sap-writer](sap-writer.md) | readwrite | SAP technical documentation — functional specs, configuration guides, user manuals (Haiku, R/W) |
