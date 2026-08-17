# SD - Sales and Distribution Development Workflows
# SD - 영업 및 유통 개발 워크플로우

## Workflow 1: Create Sales Order via BAPI
### Steps
1. Derive the Sales Area — Sales Org / Distribution Channel / Division — from the customer master (KNA1, KNVV)
2. Pull the material and pricing data through BAPI_MATERIAL_GET_DETAIL
3. Run BAPI_SALESORDER_SIMULATE on the order first, to validate pricing and ATP
4. Populate BAPISDHEAD1 for the header, BAPISDITEM for the items, BAPISDSCHEDULE for the schedule lines, and BAPIPARTNR for the partners
5. Hand the populated tables to BAPI_SALESORDER_CREATEFROMDAT2
6. Inspect the RETURN table — filter TYPE = 'E' for errors, TYPE = 'S' for the success entry carrying SALESDOCUMENT
7. Call BAPI_TRANSACTION_COMMIT when no errors came back; call BAPI_TRANSACTION_ROLLBACK when one did
8. Take the created VBELN — the sales document number — and log it to VBAK

### Required MCP Tools
- `GetFunctionModule` — read BAPI signature
- `GetTable` — inspect the VBAK, VBAP, and KNVV table structures
- `CreateProgram` — scaffold test program
- `UpdateProgram` — iterate on implementation

### Related Config
- Sales Document Types: VOV8 / V_TVAK
- Item Categories: VOV4 / V_TVAPT
- Pricing Procedure: V/08

---

## Workflow 2: Implement Custom Pricing Condition (User Exit)
### Steps
1. Locate the target pricing procedure through transaction V/08 and view V_T683V
2. Create the new condition type in V_T685, giving it an appropriate calculation type
3. Create the access sequence in V_T682, pointing it at the condition tables required
4. Implement the pricing user exit USEREXIT_PRICING_PREPARE_TKOMV — include MV45AFZZ for orders, or RV60AFZZ for billing
5. Alternatively, reach for BAdI SD_CND_ACCESS on modern implementations
6. Inside the user exit, populate the TKOMV structure with the calculated condition amount
7. Activate the condition type in the pricing procedure, adding a requirement or alternative calculation routine if one is needed
8. Test through VA01 (create sales order) and confirm the condition shows up in the pricing analysis (condition tab → Analysis)

### Required MCP Tools
- `GetView` — inspect V_T685, V_T683
- `GetInclude` — read the user exit structure out of MV45AFZZ
- `UpdateInclude` — write the user exit code
- `GetClass` — look into the BAdI implementation class

### Related Config
- Condition Types: V_T685
- Pricing Procedures: V_T683
- Access Sequences: V_T682

---

## Workflow 3: Enhance Sales Order Output (SmartForm/PDF)
### Steps
1. Find the output type in V_TNAPR — BA00 for order confirmation, for instance
2. Review the existing output program and form in transaction NACE
3. Either create an enhancement spot or copy the standard SmartForm (SF_EXAMPLE_01 pattern) into the Z-namespace
4. Add the custom fields by extending the communication structure — an append structure onto KOMKBV1/KOMPBV1
5. Implement USEREXIT_FILL_VBCO3 in MV45AFZZ so the custom fields get populated
6. Assign the new SmartForm to the output type through NACE → Processing routines
7. Test the output through VA02 → Output → Issue output to

### Required MCP Tools
- `GetProgram` — read the standard output driver
- `CreateProgram` — make the Z-copy of the output program
- `GetStructure` — inspect KOMKBV1, KOMPBV1
- `CreateStructure` — declare the append structure for the custom fields
- `UpdateInclude` — implement user exit

### Related Config
- Output Types: V_TNAPR
- Output Condition Tables: V_TNACS
- Partner Output Assignment: V_TNAPN
