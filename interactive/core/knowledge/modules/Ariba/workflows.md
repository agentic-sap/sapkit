# Ariba - SAP Ariba Integration Development Workflows
# Ariba - SAP Ariba 통합 개발 워크플로우

## Workflow 1: Purchase Order Transfer from SAP to Ariba Network
### Steps
1. A PO is raised in SAP through ME21N or BAPI_PO_CREATE1 against an Ariba-enabled vendor, one whose LFA1-ANID is filled in
2. The output condition fires and an ORDERS05 IDoc is generated (message type ORDERS, basic type ORDERS05)
3. The IDoc is handed to the Ariba middleware (SAP PI/PO or CIG), which turns it into a cXML PurchaseOrderRequest
4. Ariba Network passes the cXML on to the supplier; the supplier confirms with an OrderConfirmation cXML
5. That confirmation comes back into SAP as an ORDERSP IDoc, which drives the PO confirmation update in EKKO/EKPO
6. Build the enhancement: BAdI ME_PROCESS_PO_CUST puts the custom fields onto the PO IDoc before it is dispatched
7. Watch the IDoc flow: the IDoc status shows in WE02/WE05, the PI/PO message status in SXMB_MONI

### Required MCP Tools
- `GetClass` — opens up the BAdI ME_PROCESS_PO_CUST interface
- `CreateClass` — writes the PO enhancement for the Ariba custom fields
- `GetTable` — shows EKKO, EKPO, and NAST (message control)
- `GetFunctionModule` — brings up IDOC_OUTPUT_ORDCHG for the PO change IDoc

### Related Config
- IDoc Message Types: V_ARIBA_IDT
- Partner Profiles: WE20
- Ports: WE21

---

## Workflow 2: Ariba e-Invoice Processing in SAP (LIV Integration)
### Steps
1. The supplier files the invoice through Ariba Network, and the cXML InvoiceRequest lands on the Ariba side
2. Ariba checks that invoice against the PO (3-way match: PO, GR, invoice)
3. Once approved, the invoice moves on to SAP as an INVOIC02 IDoc through the CIG/PI middleware
4. Inbound IDoc processing runs through IDOC_INPUT_INVOIC, which in turn calls BAPI_INCOMINGINVOICE_CREATE
5. Build the enhancement: user exit EXIT_SAPLMRM_IVC carries the custom invoice validation
6. Run the tolerance check against V_ARIBA_TOL: block the invoice where the price/qty variance goes past the limit
7. Invoices that match post automatically (an FI document is created), while exceptions go to MRBR for manual release
8. F110 (automatic payment run) executes the payment, and the remittance advice is returned to Ariba

### Required MCP Tools
- `GetFunctionModule` — pulls up IDOC_INPUT_INVOIC and BAPI_INCOMINGINVOICE_CREATE
- `GetInclude` — opens the user exit EXIT_SAPLMRM_IVC
- `UpdateInclude` — puts the invoice validation logic in place
- `GetTable` — lays out RBKP and RSEG (invoice posting tables)

### Related Config
- Invoice Transfer: V_ARIBA_EINV
- Three-Way Match: V_ARIBA_3WM
- Tolerance Settings: V_ARIBA_TOL

---

## Workflow 3: Supplier Onboarding Automation (Ariba SLP → SAP Vendor)
### Steps
1. A new supplier comes through registration and qualification in Ariba SLP (Supplier Lifecycle and Performance)
2. Approval of that qualification fires the outbound message, which carries the supplier master data over to SAP
3. Take the supplier data in by IDoc or web service, then map the Ariba supplier fields onto SAP LFA1/LFB1/LFM1
4. Build the custom FM/class for creating the vendor: it calls BAPI_VENDOR_CREATE with the mapped data
5. Attach the vendor to the purchasing organization: BAPI_VENDOR_CHANGE adds the LFM1 record
6. Keep the Ariba Network ID (ANID) mapped to the SAP vendor in a custom Z-table for later PO routing
7. Fire the confirmation back to Ariba: the vendor number goes across as the external reference
8. Watch the vendor sync in SLG1 (application log) through a custom log object

### Required MCP Tools
- `GetFunctionModule` — spells out the BAPI_VENDOR_CREATE interface
- `GetTable` — looks over the LFA1, LFB1, and LFM1 structures
- `CreateProgram` — stands up the supplier onboarding integration program
- `CreateTable` — makes the Z-table that holds the ANID→vendor mapping

### Related Config
- Supplier Master Data Sync: V_ARIBA_VEN
- Vendor Account Groups: V_T077K_ARB
- Ariba Network ID Mapping: V_ARIBA_ANID
