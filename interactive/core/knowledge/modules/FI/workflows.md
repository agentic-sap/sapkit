# FI - Financial Accounting Development Workflows
# FI - 재무 회계 개발 워크플로우

## Workflow 1: Post FI Document via BAPI_ACC_DOCUMENT_POST
### Steps
1. Settle the company code, posting date, and fiscal year period with FI_PERIOD_DETERMINE
2. Fill DOCUMENTHEADER with the company code, document type (SA/KR/DR), posting date, and reference
3. Load the G/L line items into the ACCOUNTGL table: G/L account, amount, debit/credit indicator, cost center
4. Put the subledger items into ACCOUNTRECEIVABLE or ACCOUNTPAYABLE
5. Fill CURRENCYAMOUNT with the currency and the amount in document, local, and group currency
6. Make the BAPI_ACC_DOCUMENT_POST call
7. Read RETURN for errors (TYPE = 'E'); commit once it succeeds
8. Keep the OBJECTKEY that comes back (= company code + document number + fiscal year, concatenated)

### Required MCP Tools
- `GetFunctionModule` — brings up the BAPI_ACC_DOCUMENT_POST interface
- `GetTable` — reads the BKPF and BSEG structures
- `CreateProgram` — sets up a test posting program

### Related Config
- Document Types: V_T003
- Posting Keys: OB41
- Field Status Groups: V_T004F

---

## Workflow 2: Automatic Payment Run Enhancement (User Exit)
### Steps
1. Decide which user exit the requirement calls for: EXIT_SAPFF110_001 (payment method selection) or BAdI FI_PAYMENT_PROGRAM
2. Write the implementation for BAdI FI_PAYMENT_PROGRAM, method IF_FI_PAYMENT_PROGRAM~CHANGE_PAYMENT_DATA
3. Inside that implementation, read the payment proposal out of the REGUH/REGUP tables
4. Apply the custom logic: adjust bank details, split payments, switch the payment method
5. Activate the implementation in SE19 for a classic BAdI, or in SPRO for a new BAdI
6. Test in F110 along the chain: create payment run → payment proposal → display → execute

### Required MCP Tools
- `GetClass` — reads the BAdI interface IF_FI_PAYMENT_PROGRAM
- `CreateClass` — makes the BAdI implementation class
- `UpdateClass` — fills in the BAdI methods
- `GetTable` — shows the REGUH and REGUP structures

### Related Config
- Payment Methods: V_T042Z
- House Banks: V_T012
- Bank Accounts: V_T012K

---

## Workflow 3: Custom Dunning Letter (SAPscript/SmartForm)
### Steps
1. Go over the dunning procedure configuration in V_T047 and the dunning levels in V_T047S
2. Find which dunning form the level carries (MHNK-MFORMULAR)
3. Copy the standard dunning program SAPF150D into the Z-namespace
4. Copy or create the SmartForm for the dunning letter, carrying the company-specific layout
5. Add the custom fields, reading the open items out of BSID (AR open items) and BSID_VARI
6. Attach the Z-form to the dunning level in FBMP (dunning procedure maintenance)
7. Test it in F150: create dunning run → print dunning notices

### Required MCP Tools
- `GetProgram` — reads the structure of SAPF150D
- `CreateProgram` — makes the Z-copy
- `GetTable` — opens up the MHNK and BSID structures
- `UpdateProgram` — adds the custom logic

### Related Config
- Dunning Procedures: V_T047
- Dunning Levels: V_T047S
