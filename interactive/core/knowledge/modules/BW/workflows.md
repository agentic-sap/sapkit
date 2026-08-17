# BW - Business Warehouse Development Workflows
# BW - 비즈니스 웨어하우스 개발 워크플로우

## Workflow 1: Custom DataSource Creation and Delta Load Setup
### Steps
1. Locate the source data in ERP: settle which source tables hold it (e.g., VBAK for SD orders, BSEG for FI line items)
2. Create the Generic DataSource in RSA6: take either the table/view or the function module extraction method
3. For delta capability: build the FM-based extraction around a delta pointer (ROIS delta queue or timestamp)
4. Create the extraction FM: it picks up the records changed since the last delta, going by AEDАТ/AEZEIT or by the change document
5. In RSA1: replicate the DataSource out of the source system, then create the InfoSource and the transformation
6. Create the DSO as the staging layer: lay out key fields and data fields that line up with the DataSource structure
7. Create the DTP: set its extraction mode (delta/full) and lay down the filter conditions
8. Create the InfoPackage: schedule its delta load through a process chain
9. Create the process chain in RSPC: the sequence runs InfoPackage → DTP to DSO → DTP to InfoCube → rollup aggregates

### Required MCP Tools
- `CreateFunctionGroup` — makes the extraction function group
- `CreateFunctionModule` — stands up the delta extraction FM
- `GetTable` — shows the source tables (VBAK, BSEG, etc.)
- `UpdateFunctionModule` — fills in the delta selection logic

### Related Config
- DataSources: ROOSOURCE / RSA6
- Process Chains: RSPC
- InfoPackages: RSA1

---

## Workflow 2: Custom BEx Query with Calculated and Restricted Key Figures
### Steps
1. Open BEx Query Designer — or the RSA1 → Queries node — on the target InfoProvider (InfoCube/CompositeProvider)
2. Create the Restricted Key Figure: drag the measure in (e.g., Revenue 0NET_VAL_S) + restrict it by a characteristic (e.g., 0CALMONTH = current month variable)
3. Create the Calculated Key Figure: write the formula, e.g., (Current Month Revenue - Prior Month Revenue) / Prior Month Revenue * 100 for growth %
4. Define the Selection Variables: a replacement path variable for the prior month, a user input variable for the sales org
5. Create the exception (traffic light): set the thresholds on growth % (green > 5%, yellow 0-5%, red < 0%)
6. Add the conditions: top/bottom N customers by revenue
7. Test the query: RSRT (Query Monitor) → run it against test data
8. Publish: assign it to a role for the Business Explorer portal, or activate it for a Fiori Analytical app

### Required MCP Tools
- `GetTable` — opens up RSZCOMPDIR (query components) and RSZGLOBV (variables)
- `GetProgram` — brings up the standard BW query program for debugging

### Related Config
- Variables: RSZV
- Query Monitor: RSRT
- BW Authorizations: RSECADMIN

---

## Workflow 3: Enhance Standard BW Extractor (Enhancement Spot / Customer Exit)
### Steps
1. Pick out the standard SAP DataSource that is to be enhanced (e.g., 2LIS_11_VAHDR for SD order header)
2. Find the enhancement spot: transaction CMOD → the project that holds the DataSource exits (e.g., RSAP0001)
3. Write the user exit — EXIT_SAPLRSAP_001 (header) or EXIT_SAPLRSAP_002 (item)
4. Inside the exit: add the custom fields to the ZFIELDS append structure of the extraction structure (e.g., ZZ_CUSTOM_FIELD)
5. Add the field to the DataSource field list in RSA6: ZZ_CUSTOM_FIELD goes in with its type, description, and delta-relevant flag
6. Map the field in the BW transformation: put the field into the DSO/InfoCube structure, then create the transformation rule
7. Test through RSA3: check that the custom field comes out filled in the extraction preview
8. Replicate the DataSource in RSA1, adjust the transformation, and reload the historical data (full init)

### Required MCP Tools
- `GetInclude` — opens the structure of the EXIT_SAPLRSAP_001 user exit
- `UpdateInclude` — puts the custom field population logic in place
- `CreateStructure` — attaches the ZZ append structure to the extraction structure
- `GetTable` — lays out the extraction structure (e.g., MC11VA0HDR for 2LIS_11_VAHDR)

### Related Config
- DataSource Maintenance: RSA6
- InfoObject for Custom Field: RSD1
- Transformation Rules: RSA1 → Transformations
