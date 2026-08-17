# TR - Treasury Development Workflows
# TR - 재무부(자금) 개발 워크플로우

## Workflow 1: Electronic Bank Statement Processing Enhancement
### Steps
1. Go over the EBS format configuration already in place under SPRO → TR → Cash Management → EBS
2. Find which bank statement format (MT940, CAMT.053, BAI2) the house bank sends
3. Build the custom interpretation algorithm: take a Z-copy of the standard FM FEBC_INTERPRET_STATEMENT
4. Map the external transaction codes onto the internal planning levels (V_T036K) and the posting rules
5. Implement BAdI BANK_STATEMENT_POST to carry the custom posting logic for unmatched items
6. Test it: import the test file through FEBAN (EBS posting), then check the G/L postings and the cash position in FF7A

### Required MCP Tools
- `GetFunctionModule` — brings up FEBC_IMPORT_BANK_STATEMENT and FEBC_POST_BANK_STATEMENT
- `GetTable` — shows FEBKO and FEBEP (bank statement header/items)
- `CreateClass` — builds the BAdI BANK_STATEMENT_POST implementation
- `GetClass` — opens up the BAdI interface IF_EX_BANK_STATEMENT_POST

### Related Config
- Planning Levels: OT55 / V_T036
- Account Symbols: V_T036I
- Transaction Types (EBS): V_T036K

---

## Workflow 2: Cash Position Report Enhancement
### Steps
1. Work through the standard cash position structure: FF7A reads its planning levels out of FLQITEM/FLQDB
2. Build the custom data source: an FM that reads the uncommitted/expected cash flows out of custom Z-tables
3. Extend the planning level hierarchy by adding the custom sub-levels in V_T036G
4. Implement BAdI CASH_PLANNING_ITEM to feed the custom items into the liquidity forecast
5. Fill the FLQITEM structure with the custom planning group, amount, currency, and value date
6. Test it: run FF7B and confirm the custom items show up in the liquidity forecast drilldown

### Required MCP Tools
- `GetTable` — lays out the FLQITEM and FLQDB structure
- `GetClass` — reads the BAdI CASH_PLANNING_ITEM interface
- `CreateClass` — writes the cash flow injection
- `CreateProgram` — puts together the custom cash flow data upload

### Related Config
- Planning Groups: V_T036G
- Cash Concentration: V_T036C

---

## Workflow 3: Treasury Deal Confirmation via IDoc/BAPIs
### Steps
1. Create the financial transaction: BAPI_FINTRANS_CREATE, handing it the product type (money market/FX), amount, counterparty, and dates
2. Check the counterparty limit with TR_COUNTERPARTY_LIMIT_CHECK before the deal is created
3. Commit, then produce the confirmation: read the deal data and create the correspondence through the TRM correspondence FM
4. Send the confirmation to the counterparty: either through BCS (Business Communication Services), or as output over SAPScript/SmartForm
5. Post the settlement: BAPI_FINTRANS_CHANGE writes the settlement status; TBB1 makes the accounting entries
6. Reconcile: match it against the EBS entries with FEBAN

### Required MCP Tools
- `GetFunctionModule` — reads out the BAPI_FINTRANS_CREATE interface
- `GetTable` — opens up VDBI and VDBJHD (TRM deal tables)
- `CreateProgram` — sets up the deal booking interface program

### Related Config
- Transaction Types: OT29 / V_TZF0
- Product Types: V_TVTFT
- Counterparty Limits: V_TZPG
