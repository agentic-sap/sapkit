# MM - Materials Management Development Workflows
# MM - 자재 관리 개발 워크플로우

## Workflow 1: Create Purchase Order via BAPI
### Steps
1. Collect the vendor data (LFA1/LFM1), the material data (MARA/MARC), and the purchasing org data
2. Fill POHEADER with doc type NB, purchasing org, purchasing group, and company code
3. Fill the POITEM table with material, plant, quantity, delivery date, and price unit
4. Fill POACCOUNT for the account assignment if it is cost center or project based
5. Fill POSCHEDULE for the delivery schedule lines
6. Call BAPI_PO_CREATE1, handing it every table you populated
7. Look through the RETURN table for errors (TYPE = 'E')
8. On success issue BAPI_TRANSACTION_COMMIT; on error issue BAPI_TRANSACTION_ROLLBACK
9. Keep the PURCHASEORDER number that POHEADER_EXP carries

### Required MCP Tools
- `GetFunctionModule` — to see the BAPI_PO_CREATE1 signature
- `GetTable` — to look over the EKKO, EKPO, and LFA1 structures
- `CreateProgram` — to scaffold a test program
- `UpdateProgram` — to keep revising the implementation

### Related Config
- PO Document Types: V_T161
- Item Categories: V_T163
- Account Assignment Categories: V_T163K

---

## Workflow 2: Post Goods Receipt with BAPI_GOODSMVT_CREATE
### Steps
1. Pin down the reference document (PO number EBELN, PO item EBELP) from EKKO/EKPO
2. Fill GOODSMVT_HEADER with posting date, document date, and reference
3. Fill GOODSMVT_ITEM with movement type (101 for GR against PO), plant, storage location, and quantity
4. Set GM_CODE = '01', which marks GR for purchase order
5. Call BAPI_GOODSMVT_CREATE
6. Walk RETURN for errors; where the call succeeded, read MATERIALDOCUMENT and MATDOCUMENTYEAR
7. Commit the transaction; confirm the stock update in MARD (storage location stock) and MKPF/MSEG (material document)

### Required MCP Tools
- `GetTable` — to look over MKPF, MSEG, and MARD
- `GetFunctionModule` — to see the BAPI_GOODSMVT_CREATE signature
- `CreateProgram` — to build a test posting program

### Related Config
- Movement Types: V_156 / OMJJ
- Storage Locations: V_T001L

---

## Workflow 3: Extend Material Master to New Plant
### Steps
1. Read the existing material views out of MARA (general), MARC (plant), and MARD (storage loc)
2. Get CLIENTDATA (basic data), PLANTDATA (MRP, purchasing, storage), and STORAGELOCATIONDATA ready
3. Call BAPI_MATERIAL_SAVEDATA with HEADDATA naming the material and the views to extend
4. For the new views, set HEADDATA-IND_SECTOR and HEADDATA-MATL_TYPE
5. Inspect the RETURN table; commit where it succeeded
6. Confirm the extension in MM03, or by reading MARC for the new plant entry

### Required MCP Tools
- `GetFunctionModule` — to look over the BAPI_MATERIAL_SAVEDATA parameters
- `GetTable` — to pull the MARA, MARC, and MARD structure
- `GetView` — to see V_T134 for the material type config

### Related Config
- Material Types: V_T134 / OMS2
- Plant Configuration: V_T001W
