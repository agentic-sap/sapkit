# HR / Payroll / Personnel (Infotypes & Clusters)
<!-- tier: minimal -->

Employee master records, payroll results, medical files, family and dependent data, time tracking, bank details. Nothing in an SAP system is more sensitive than this category.

| Table / Pattern | Description | Why |
|-----------------|-------------|-----|
| PA0000 | Actions | Personnel action events |
| PA0001 | Organizational assignment | Position and org-unit PII |
| PA0002 | Personal data | Name, date of birth, gender, nationality |
| PA0006 | Addresses (employee) | Residential address PII |
| PA0007 | Planned working time | Working-time PII |
| PA0008 | Basic pay | **Salary** figures — never extract |
| PA0009 | Bank details (employee) | Personal banking data |
| PA0014 | Recurring payments/deductions | Payroll processing detail |
| PA0015 | Additional payments | Payroll processing detail |
| PA0017 | Travel privileges | Personal travel entitlements |
| PA0019 | Monitoring of dates | Personal milestone dates |
| PA0021 | Family / related persons | Family-member PII |
| PA0023 | Previous employers | Career history data |
| PA0024 | Qualifications | Personal skill records |
| PA0027 | Cost distribution | Payroll processing detail |
| PA0028 | Internal medical service | **Medical records — highly sensitive** |
| PA0033 | Statistics | Statistics per employee |
| PA0040 | Objects on loan | Assets assigned to a person |
| PA0041 | Date specifications | Person-specific dates |
| PA0105 | Communication (user IDs, email, phone) | Contact-channel PII |
| PA0185 | Personal IDs | National ID and passport data |
| PA0267 | One-time payments | Pay outside the regular cycle |
| PA0377 | Miscellaneous plans | Benefit plan data |
| PA2001 | Absences | Sickness and leave PII |
| PA2002 | Attendances | Attendance time records |
| PA2010 | EE remuneration info | Remuneration detail |
| PA2050 | Annual calendar | Personal calendar data |
| PA* (all PA0xxx / PA2xxx / PA4xxx infotypes) | HR Infotypes | Employee PII of every kind |
| HRP1000 | Org object | Organizational structure |
| HRP1001 | Relationships | Links between org objects and persons |
| HRP* (all HRPxxxx infotypes) | OM/PD Infotypes | Personnel and organizational data |
| PCL1 | HR cluster — time | Clusters written by time evaluation |
| PCL2 | HR cluster — **payroll results** | **Payroll result data — NEVER extract** |
| PCL3 | HR cluster — applicant data | PII on job applicants |
| PCL4 | HR cluster — change documents | Audit trail of HR changes |
| PCL5 | HR cluster — travel expense | Payroll side of travel expenses |
| PA9* / PB9* / PD9* | Customer-specific HR infotypes | Customer-built PII extensions |
| T526 | Administrator assignment | Link to the HR administrator |
| T52* (payroll config with values) | Payroll customizing with amounts | Wage type amounts |
