# PS - Project System Development Workflows
# PS - 프로젝트 시스템 개발 워크플로우

## Workflow 1: Create Project Structure (Def + WBS + Network) via BAPI
### Steps
1. Make the BAPI_PS_INITIALIZATION call to clear the buffers
2. Fill in the project header (PROJECT_DEFINITION, PROJECT_PROFILE, COMPANY_CODE, CONTROLLING_AREA)
3. Lay out the WBS hierarchy table (levels, POSID, description, responsible person) that BAPI_PROJECT_MAINTAIN takes
4. Call BAPI_PROJECT_MAINTAIN, handing it the method tables I_METHOD_PROJECT and I_METHOD_WBS
5. Call BAPI_PS_PRECOMMIT; read RETURN for errors; roll back if it fails
6. Take the network header + activities + relationships through BAPI_NETWORK_MAINTAIN
7. Run BAPI_PS_PRECOMMIT a second time, then BAPI_TRANSACTION_COMMIT with WAIT = 'X'
8. Confirm the result in CJ20N; look over the PROJ, PRPS, AFKO, AFVC records

### Required MCP Tools
- `GetFunctionModule` — brings up the BAPI_PROJECT_MAINTAIN interface
- `GetTable` — shows PROJ, PRPS, AUFK, AFKO, AFVC
- `CreateProgram` — sets up the test program

### Related Config
- Project Profile: OPSA / V_TCJ41
- Network Profile: OPUU / V_TCNT
- Number Ranges: CJ81 (project def), CJ82 (network)

---

## Workflow 2: WBS Validation Enhancement (CNEX0007 / BAdI)
### Steps
1. Pin down the requirement: a custom field is checked when the WBS is saved (e.g., a billing WBS must carry a responsible person)
2. Create the project in CMOD; assign enhancement CNEX0007 (or write BAdI WORKORDER_UPDATE with filter PS)
3. Inside EXIT_SAPLCJWB_002 (or BAdI method AT_SAVE): read the PRPS internal table and apply the rule
4. Raise a MESSAGE with TYPE 'E' to break off the save, or 'W' to warn instead
5. The modern alternative: implement BAdI BADI_CJWBS for checks at subscreen level
6. Test through save operations in CJ20N and CJ02; confirm the rejection behavior
7. Trace the status change in JEST/JCDS; confirm there are no orphan DB writes

### Required MCP Tools
- `GetInclude` — opens up the CMOD exit includes (ZXCNEU07)
- `UpdateInclude` — puts the validation logic in place
- `GetClass` — reads the BAdI interface IF_EX_WORKORDER_UPDATE
- `GetTable` — PRPS, PROJ, T399A

### Related Config
- CMOD Project Enhancement: SMOD CNEX0007
- Status Profile: OK02 / V_TJ30A

---

## Workflow 3: Milestone Billing Automation
### Steps
1. Pick out the milestone usage that is flagged for billing (TCN21 — usage type 'billing')
2. Once the milestone is confirmed (flag USR01 set in MLST), fire the release of the FPLT billing line that belongs to it
3. Implement BAdI PS_MILESTONE_BILL, method RELEASE_BILLING, to tailor the release logic
4. Read the MLST → FPLT link (FPLT-MLSTN), then set FPLT-FAKSP (blocking reason) to ' '
5. Optionally drive SD billing through BAPI_BILLINGDOC_CREATEMULTIPLE for the release date
6. Test it: confirm the milestone in CNMT, run VF04 against the linked SD order, and check that the invoice is created

### Required MCP Tools
- `GetClass` — lays out the BAdI PS_MILESTONE_BILL definition
- `GetTable` — MLST, FPLA, FPLT, VBAK, VBAP
- `GetFunctionModule` — BAPI_BILLINGDOC_CREATEMULTIPLE

### Related Config
- Milestone Usage: OPT6 / V_TCN21
- Billing Plan Type: OVBO / V_TFPLA_SD

---

## Workflow 4: Project Cost Rollup Report (CDS on S/4HANA)
### Steps
1. Settle the sources: ACDOCA (actual), ACDOCP (plan), BPGE (budget), RPSCO (info DB summary — ECC fallback)
2. Design the CDS view `ZC_PROJECT_COST_ROLLUP` so it joins I_WBSElement to I_JournalEntryItem, filtered on OBJNR category 'PR'
3. Aggregate by project definition (PSPID) and cost element, taking SUM(amount in company code currency)
4. Extend it with ASSOCIATIONs to I_ProjectDefinition to pick up the descriptive fields
5. Expose it as an analytical query through the `@Analytics.query: true` annotation; publish the OData service
6. Build the Fiori Elements list or the Smart Business KPI tile; add the plant and fiscal year variables
7. On ECC, build the ABAP report around an AD-HOC JOIN over COEP + COSP, summarized by PSPNR

### Required MCP Tools
- `CreateView` — makes the CDS view
- `GetTable` — ACDOCA, ACDOCP, BPGE, RPSCO, PRPS, PROJ
- CDS (DDLS) syntax gets validated on the server side at the moment the view is activated through `UpdateView` — there is no standalone pre-check tool (`CheckSyntax` does not cover DDLS)

### Related Config
- CO Area: V_TKA01
- Project Profile: OPSA
- Controlling Version: OKEQ

---

## Workflow 5: Progress Analysis with Custom POC (CNE1 / PROGRESS_CUST)
### Steps
1. Set up the Progress Version and the Measurement Method in OPTV/OPS6
2. Attach the measurement method at WBS/activity level in CJ20N (Progress tab)
3. Implement BAdI PROGRESS_CUST (method CALCULATE_POC) carrying the custom formula (e.g., milestone-weighted POC)
4. Put the progress determination on a schedule through CNE1 (periodic)
5. The results land in table JCDS / COEP (earned value line items)
6. Run CNE5 for the progress analysis report; check the EVP, ACWP, BCWS, BCWP values
7. On S/4HANA: bring in the Event-Based Revenue Recognition integration where revenue has to be recognized per POC

### Required MCP Tools
- `GetClass` — opens up the BAdI PROGRESS_CUST interface
- `GetTable` — COEP/ACDOCA, JCDS, PRPS, RPSCO
- `RunUnitTest` — unit-tests the custom formula class

### Related Config
- Progress Version: OPTV / V_TCJ4T
- Measurement Method: OPS6 / V_T7PEPE
