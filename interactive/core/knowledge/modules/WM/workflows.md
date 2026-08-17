# WM - Warehouse Management Development Workflows
# WM - 창고 관리 개발 워크플로우

## Workflow 1: Automated Goods Receipt and Putaway (TO Creation)
### Steps
1. A goods receipt posted in MM (MIGO/BAPI_GOODSMVT_CREATE with mvt 101) raises a WM transfer requirement
2. Read the TR that came out of it: BAPI_WHSE_TR_GETDETAIL, keyed by the LTBK number taken from MKPF
3. Settle the putaway strategy out of V_T334 (open storage, fixed bin, and so on)
4. Turn the TR into a TO: BAPI_WHSE_TO_CREATE_TOREQ with source storage type = GR area (902), destination left to the strategy
5. Print the TO for the warehouse worker by way of the TO print program
6. Once the physical putaway is done, confirm the TO: BAPI_WHSE_TO_CONFIRM carrying the actual bin and quantity
7. Check that stock is updated in LS26 (bin stock) and MMBE (plant stock)

### Required MCP Tools
- `GetFunctionModule` — brings up the BAPI_WHSE_TO_CREATE_TOREQ interface
- `GetTable` — reads LTAK, LTAP, LTBK, LTBP, LGPLA, LQUA
- `CreateProgram` — sets up the GR-to-putaway automation program

### Related Config
- Putaway Strategies: V_T334
- Movement Types (WM): V_T333 / OMBO
- Storage Types: OMLT / V_T301

---

## Workflow 2: RF-Based Picking Enhancement
### Steps
1. A delivery created in SD (VL01N) generates the WM transfer order on its own
2. Build the custom RF transaction on the LM00 framework, or as a BSP application
3. Read the picker's open TOs: BAPI_WHSE_TO_GETLIST, narrowed by storage type (picking area) and open status
4. Put the TO items on the RF device, showing source bin, material, and quantity
5. Scan the bin barcode and check it against LGPLA (bin master); look to LQUA for the stock
6. Confirm the TO one item at a time: BAPI_WHSE_TO_CONFIRM carrying the scanned quantities
7. Deal with short picks by creating a TO for the partial quantity and flagging the remainder as a short pick exception
8. The final confirmation sets off the goods issue in IM (MM) and the delivery update in SD

### Required MCP Tools
- `GetFunctionModule` — brings up L_TO_CONFIRM_ONE_TE for item-level confirmation
- `GetTable` — reads LTBK, LTBP, LQUA, LGPLA
- `CreateProgram` — puts together the RF picking program
- `CreateInterface` — lays out the RF screen interface

### Related Config
- Picking Strategies: V_T335
- Confirmation Requirements: V_T333K
- Picking Areas: V_T304

---

## Workflow 3: Bin-to-Bin Transfer with Custom Strategy
### Steps
1. Spot the replenishment need: read the fixed picking bins (V_T311 fixed bin) that sit low on stock in LQUA
2. Work out the source bulk storage bin by applying the FIFO strategy (read the oldest quant from LQUA-EINDT)
3. Create the ad-hoc TO: BAPI_WHSE_TO_CREATE_STOCK, naming the source bin, the destination fixed bin, the material, and the quantity
4. Print the TO or push it to the RF device for execution
5. The worker confirms it: BAPI_WHSE_TO_CONFIRM
6. Set it up as a background job: schedule the Z-replenishment report hourly across the shift

### Required MCP Tools
- `GetTable` — reads LQUA, LGPLA, T311 (fixed bin config)
- `GetFunctionModule` — brings up BAPI_WHSE_TO_CREATE_STOCK
- `CreateProgram` — makes the replenishment control report

### Related Config
- Stock Removal Strategy: V_T336
- Bin Search Strategy: V_T311
- Storage Bin Types: V_T303
