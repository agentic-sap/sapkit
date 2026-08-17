# PM - Plant Maintenance Development Workflows
# PM - 설비 관리 개발 워크플로우

## Workflow 1: Create PM Notification and Work Order via BAPI
### Steps
1. Locate the equipment or functional location in the EQUI or IFLOT tables
2. Create the notification by calling BAPI_ALM_NOTIF_CREATE and passing a notification type (M1=breakdown, M2=maintenance request), the equipment, a description, and a priority
3. Check RETURN, save the notification with BAPI_ALM_NOTIF_SAVE, and commit
4. Convert the notification into an order by filling BAPI_ALM_ORDER_MAINTAIN HEADER with the order type and the notification reference
5. Put the operations into the OPERATION table, giving work center, control key, and planned work
6. Put the components into the COMPONENT table, giving material, quantity, and plant
7. Call BAPI_ALM_ORDER_MAINTAIN with method = 'CREATE'
8. Release the order with a second call that carries HEADER-STATUS = 'REL'
9. Commit, then confirm in IW33

### Required MCP Tools
- `GetFunctionModule` — pull up BAPI_ALM_NOTIF_CREATE and BAPI_ALM_ORDER_MAINTAIN
- `GetTable` — look over how QMEL, AUFK, and EQUI are structured
- `CreateProgram` — scaffold the integration program for PM

### Related Config
- Notification Types: OIYL / V_T351
- Order Types: OIH2 / V_T003O
- Priority Types: V_T356

---

## Workflow 2: Automated Preventive Maintenance Scheduling
### Steps
1. Pull maintenance plan data for strategy-based plans (MPLAN/MPLA) using BAPI_MAINTPLAN_GETDETAIL
2. Take the equipment counter readings out of the measurement documents (MSEG equivalent: IMRG)
3. Implement the scheduling BAdI IP_SCHEDULE_MAINTENANCE_PLAN to drive custom call determination
4. Inside the BAdI, derive the next due date from operating hours/kilometers (counter-based scheduling)
5. Update the measurement documents by handing the new readings to BAPI_MEASUREDOCUMENT_CREATE
6. Trigger scheduling with program RISTRA20 (IP30 equivalent) to have the orders generated automatically
7. Check the generated orders in IW37N (outstanding orders)

### Required MCP Tools
- `GetTable` — look over MPLAN, MPLA, IMRG, and IMPT
- `GetClass` — look over the scheduling BAdI's interface
- `CreateClass` — implement scheduling logic
- `GetProgram` — read RISTRA20 as a reference for the scheduling logic

### Related Config
- Maintenance Strategies: OIM0 / V_T355
- Scheduling Indicators: V_T355I
- Cycle Sets: V_T356C

---

## Workflow 3: Equipment Installation/Dismantling Integration
### Steps
1. Implement either the user exit EXIT_SAPLIPW1_002 (equipment installation) or the BAdI IBAS_EQUI_STATUS
2. Have the exit validate the business rules before installation/dismantling (e.g., open orders check)
3. Take the current equipment installation data from ILOA (location and account assignment)
4. Once the installation is complete, update the custom Z-tables or send an IDoc to the external system
5. Trigger a notification through BAPI_ALM_NOTIF_CREATE to keep the record
6. Commit and write to the application log (BAL_LOG_CREATE / BAL_DSP_LOG_DISPLAY)

### Required MCP Tools
- `GetInclude` — read how the user exit include is structured
- `UpdateInclude` — implement the validation of equipment status
- `GetTable` — look over ILOA, EQUI, and IFLOT
- `CreateClass` — create BAdI implementation

### Related Config
- Equipment Categories: OIB2 / V_T370E
- Functional Location Categories: OIOF / V_T370C
