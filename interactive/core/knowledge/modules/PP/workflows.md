# PP - Production Planning Development Workflows
# PP - 생산 계획 개발 워크플로우

## Workflow 1: Create and Release Production Order via BAPI
### Steps
1. CS_BOM_EXPL_MAT_V2 and BAPI_ROUTING_GET_DETAIL supply the BOM and the routing for the material/plant — read those first
2. Then fill BAPI_PRODORD_CREATE's parameters — material, plant, order type, quantity, and basic dates
3. Issue the BAPI_PRODORD_CREATE call, then look in RETURN for errors
4. Where the call succeeded, pull ORDER_NUMBER out of the return
5. Release the order with a call to BAPI_PRODORD_CHANGE that carries ORDER_STATUS = 'REL'
6. Material availability is a BAPI_MATERIAL_AVAILABILITY check, run over all components
7. Post the components' goods issue through BAPI_GOODSMVT_CREATE under movement type 261
8. Commit the transaction, then read the order status back in CO03

### Required MCP Tools
- `GetFunctionModule` — read BAPI_PRODORD_CREATE interface
- `GetTable` — look through the AUFK, AFKO, AFPO, and RESB structures
- `CreateProgram` — scaffold test program

### Related Config
- Order Types: OPJN / V_T003O
- MRP Controllers: OP43 / V_T024D
- Scheduling Parameters: V_T460S

---

## Workflow 2: Custom MRP User Exit for Special Procurement
### Steps
1. USEREXIT_MD_CHANGE_MRP_DATA sits in include MD_USEREXIT — find it there
2. The logic to write there overrides the procurement type or the lot size for specific materials
3. The alternative route is BAdI MD_PURREQ_CHANGE, for purchase requisition modifications after MRP
4. Inside the exit, read the material attributes (MARC-BESCHR, MARC-DISPO) and apply the business rules
5. The data structures to change are PLSC (planned order) or EBAN (purchase requisition)
6. To test, run MD01 on the affected material and check the results in MD04

### Required MCP Tools
- `GetInclude` — read MD_USEREXIT structure
- `UpdateInclude` — implement user exit
- `GetTable` — go over MARC, PLAF, and EBAN
- `GetClass` — read the BAdI MD_PURREQ_CHANGE interface

### Related Config
- MRP Types: V_T438A
- Special Procurement: V_T460A
- Lot Sizing: V_T439

---

## Workflow 3: Production Order Confirmation with Goods Movement
### Steps
1. Read the production order details with BAPI_PRODORD_GET_DETAIL to get the operation list
2. Single out the operation to confirm — AUFPL + APLZL, taken from AFVC
3. Fill BAPI_PRODORDCONF_CREATE_TT with the order number, the operation, the yield/scrap quantities, and the activities
4. Add GOODSMOVEMENTS so the goods movements post simultaneously (261 for components, 101 for finished goods)
5. Hand every table to BAPI_PRODORDCONF_CREATE_TT and make the call
6. Read RETURN, and commit where it came back successful
7. The stock changes show in MMBE and the confirmation in AFRU (confirmation records) — verify both

### Required MCP Tools
- `GetFunctionModule` — read the interface of the confirmation BAPI
- `GetTable` — look at AFRU, AFVC, and AUFK
- `CreateProgram` — create confirmation program

### Related Config
- Confirmation Parameters: OPJ8 / V_TCO9
- Goods Movement Defaults: V_TCO15
