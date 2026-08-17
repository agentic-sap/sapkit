# QM - Quality Management Development Workflows
# QM - 품질 관리 개발 워크플로우

## Workflow 1: Automatic Inspection Lot Processing Interface
### Steps
1. Pin down the inspection type from the material QM view (MARC-QPMAT, MARA-QKZGR)
2. Read the inspection plan with BAPI_INSPPLAN_GETDETAIL for the material/plant/usage
3. Create the inspection lot through BAPI_INSPLOT_CREATE, handing it material, plant, inspection type, quantity, and batch
4. Read RETURN; pick up the INSPECTIONLOT number
5. Record the results with BAPI_INSPOPER_RECRESULTS for each characteristic, carrying the measured values
6. Evaluate: work out whether the results pass or fail against the specification limits
7. Record the usage decision with BAPI_INSPLOT_USAGE_DECISION, passing the UD code and the stock posting decision
8. Commit; confirm the lot status in QA03

### Required MCP Tools
- `GetFunctionModule` — brings up BAPI_INSPLOT_CREATE and BAPI_INSPOPER_RECRESULTS
- `GetTable` — shows the QALS, QAVE, and QAMV structures
- `CreateProgram` — sets up the automatic result recording program

### Related Config
- Inspection Types: OQI1 / V_T161_QM
- Sampling Procedures: OQB1 / V_T708
- Usage Decision Catalog: OQL1 / V_T1006

---

## Workflow 2: Customer Complaint (Q1 Notification) Process Enhancement
### Steps
1. Implement BAdI QISR_SUBSCREEN so the custom fields land on the Q1 notification screen
2. Create the notification through BAPI_QUALNOT_CREATE: type Q1, sold-to party, material, quantity, and defect description
3. Add the defect items: fill NOTIFITMCHANGE with the defect codes from the catalog (T705/T705B)
4. Add the tasks: fill NOTIFTASKCHANGE with the corrective action tasks and the responsible partner
5. Save with BAPI_QUALNOT_SAVE; commit
6. Implement the 8D workflow: a custom status sequence built on Enhancement Spot QMEL_HEADER_CHANGE
7. Send the email notification: use BCS (Business Communication Services) or a workflow task
8. Monitor it in QM50 (timeline) and QM10 (list processing)

### Required MCP Tools
- `GetFunctionModule` — reads out the BAPI_QUALNOT_CREATE interface
- `GetClass` — opens up BAdI QISR_SUBSCREEN
- `CreateClass` — builds the customer complaint enhancements
- `GetTable` — lays out the QMEL, QMFE, and QMMA structures

### Related Config
- QM Notification Types: OIYL / V_T351_QM
- Catalog Profiles: V_T352B_QM
- 8D Report Settings: V_T351_8D

---

## Workflow 3: Statistical Process Control (SPC) Data Collection
### Steps
1. Define the control chart characteristics in the inspection plan (QP01): characteristic type = variable, carrying the control chart indicator
2. Implement the custom results recording: read the measurement data out of an external source (scale, sensor via RFC)
3. Hand BAPI_INSPOPER_RECRESULTS the measured values for each sample
4. Trigger the SPC calculation: FM QCC_CONTROL_CHART_CALCULATE, once the results are posted
5. Look over the control chart signals: scan QCCR (control chart results) for rule violations
6. If a violation is detected: create the internal quality notification (Q3) automatically through BAPI_QUALNOT_CREATE
7. Send the alert to the responsible person; track the corrective actions

### Required MCP Tools
- `GetTable` — shows QCCR, QAMV, QASBS
- `GetFunctionModule` — opens up QCC_CONTROL_CHART_CALCULATE
- `CreateProgram` — makes the SPC data collection report
- `UpdateProgram` — puts the sensor data read and posting in place

### Related Config
- Inspection Methods: V_T706
- Sampling Procedures: V_T708
- Dynamic Modification Rules: V_T713
