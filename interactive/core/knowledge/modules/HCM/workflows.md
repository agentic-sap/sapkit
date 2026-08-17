# HCM - Human Capital Management Development Workflows
# HCM - 인적 자본 관리 개발 워크플로우

## Workflow 1: Employee Hire Action via BAPI
### Steps
1. Lock the employee record with BAPI_EMPLOYEE_ENQUEUE on the personnel number (or on a fresh number drawn from the number range)
2. Write IT0000 (Actions) through BAPI_PERSDATA_CREATE, passing action type = '01' (Hiring), the reason, and the entry date
3. Write IT0001 (Org Assignment): company code, personnel area, employee group/subgroup, org unit, position
4. Write IT0002 (Personal Data): name, gender, date of birth, nationality
5. Write IT0006 (Addresses): the home address
7. Write IT0007 (Planned Working Time): the work schedule rule
8. Write IT0008 (Basic Pay): wage type, amount, pay scale
9. Drop the lock with BAPI_EMPLOYEE_DEQUEUE, then commit
10. Confirm the result in PA10 (Personnel File)

### Required MCP Tools
- `GetFunctionModule` — brings up the BAPI_PERSDATA_CREATE interface for each infotype
- `GetTable` — reads the PA0001, PA0002, and PA0008 structures
- `CreateProgram` — sets up the hire action interface

### Related Config
- Personnel Actions: OOPA / V_T529A
- Employee Groups: V_T501
- Pay Scale Structure: V_T510

---

## Workflow 2: Custom Payroll Wage Type Calculation (Schema Rule)
### Steps
1. Pin down the payroll schema, using PE01 to view it (e.g., X000 for international, ZXYZ for custom)
2. Build the custom calculation rule in PE02 under the Z-namespace, spelling out the wage type derivation logic
3. Inside the rule, work with the operations ADDWT (add wage type), MULTI (multiply), and LIMIT (apply limits)
4. Hook the rule call into the schema at the right processing point, using a COPY of the relevant schema section
5. Define the Z-wage type in V_512W, giving it processing class 01 (Relevant to payroll) and the evaluation class
6. Test by running a payroll simulation through BAPI_PAYROLL_SIMULATION or PC00_M99_CALC in test mode
7. Read the results with PYXX_READ_PAYROLL_RESULT and confirm the RT table carries the new wage type

### Required MCP Tools
- `GetProgram` — reads the payroll schema program that PE01 generates
- `GetView` — shows V_512W and the wage type definitions in it
- `GetTable` — opens the RT and CRT payroll result structures

### Related Config
- Payroll Schema: PE01
- Calculation Rules: PE02
- Wage Types: OH11 / V_512W

---

## Workflow 3: Absence Quota Accrual Automation
### Steps
1. Set up the quota type in V_T556 (Leave Types) together with its accrual settings
2. Write the BAdI implementation for PT_ARQ00_QUOTA_ACCOUNT that carries the custom accrual calculation
3. Inside the BAdI, read the employee data (IT0001, IT0007) to establish the entitlement from seniority/grade
4. Compute the accrual amount — e.g., 1.5 days a month for employees > 3 years
5. Update IT2006 (Absence Quotas) through BAPI_ABSENCE_CREATE or FM HR_TIME_QUOTA_TRANS_CREATE
6. Put the accrual on a schedule: a monthly background job running program RPTQTA00
7. Watch the quotas in PT63 (Time Account Overview)

### Required MCP Tools
- `GetClass` — shows the BAdI PT_ARQ00_QUOTA_ACCOUNT interface
- `CreateClass` — builds out the quota accrual calculation
- `GetTable` — reads PA2006 (absence quota) and T556 (quota types)
- `GetFunctionModule` — brings up HR_TIME_QUOTA_TRANS_CREATE

### Related Config
- Absence Types: V_T554S
- Work Schedule Rules: V_T508A
- Time Evaluation Schema: V_T52C5
