# CO - Controlling Development Workflows
# CO - 관리 회계 개발 워크플로우

## Workflow 1: Post Activity Allocation via BAPI
### Steps
1. Pin down the sender cost center together with the activity type (CSKS/CSLA tables)
2. Settle the receiver too: a cost center or an internal order (CSKS/AUFK)
3. Fill the BAPI_ACC_ACTIVITY_ALLOC_POST parameters: the document header and the sender/receiver data
4. Set DOCUMENTHEADER with company code, controlling area, posting date and version
5. Set SENDERACTIVITYALLOC with the sender cost center, the activity type and the quantity
6. For the receiver, set either RECEIVERCOSTCENTER or RECEIVERORDER
7. Make the BAPI_ACC_ACTIVITY_ALLOC_POST call
8. Read the RETURN table; commit when it reports success
9. Confirm the posting in KSB1 (cost center actual line items)

### Required MCP Tools
- `GetFunctionModule` — read out the BAPI interface
- `GetTable` — look into COBK, COEP, CSKS, CSLA
- `CreateProgram` — lay down the skeleton of an allocation test program

### Related Config
- Activity Types: V_CSLT / KL01
- Cost Centers: OKEON / KS01
- Versions: V_TKA09

---

## Workflow 2: Custom Assessment Cycle Enhancements
### Steps
1. Read the standard assessment cycle definition out of KSU1 (T-code) / V_RKAB
2. Work out the sender rules (cost centers) and the receiver tracing factors
3. Build the custom tracing factor: a statistical key figure update program that reads from a custom data source
4. Post the statistical key figures through KB31N, or the BAPI equivalent
5. Reference that statistical key figure as the tracing factor in the assessment cycle sender/receiver rule
6. Run the cycle through KSU5 (single), or as a month-end job through program RKABL000
7. Check the results in S_ALR_87013611 (Actual/Plan/Variance report)

### Required MCP Tools
- `GetTable` — look into RKAB (cycle header), RKAB_SEG (segments)
- `CreateProgram` — author the statistical key figure update report
- `UpdateProgram` — fill in the custom tracing logic

### Related Config
- Assessment Cycles: V_RKAB / KSU1
- Statistical Key Figures: V_TKEV / KB31N

---

## Workflow 3: Implement CO-PA Enhancement for SD Billing Transfer
### Steps
1. Work out the CO-PA transfer structure (V_TKEVS) and which value fields are assigned to the SD conditions
2. Look over the SD-CO-PA assignment in KEI1 (PA transfer structure for SD)
3. Put BAdI COPA_FIELD_FILL in place so that custom CO-PA characteristics get populated during the billing transfer
4. Inside the BAdI method: get at the VBRK/VBRP data, then populate the custom characteristics (e.g., region, sales rep)
5. Set the BAdI implementation active
6. Run the test by creating an SD billing document (VF01), then check the PA line items in KE24

### Required MCP Tools
- `GetClass` — look into the BAdI IF_EX_COPA_FIELD_FILL
- `CreateClass` — stand up the BAdI implementation
- `UpdateClass` — write the characteristic derivation logic
- `GetTable` — look into CE1xxxx (CO-PA actual data table for the operating concern)

### Related Config
- Operating Concern: V_TKE1
- PA Transfer Structure: KEI1
- Characteristic Derivation: KEDR
