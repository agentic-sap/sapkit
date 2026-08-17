# 🇮🇳 India

## Formats
- **Date**: `DD-MM-YYYY`, or with slashes `DD/MM/YYYY`
- **Number / decimal**: `.` separates decimals and `,` the thousands, but **Indian grouping** applies — `12,34,567.89` (lakh/crore)
- **Currency**: INR (₹), carried to 2 decimals
- **Phone**: `+91 XXXXX-XXXXX`, mobile numbers running 10 digits
- **Postal code**: PIN, 6 digits
- **Timezone**: IST (UTC+5:30), DST not observed

## Language & Locale
- SAP language key: `E` (EN) is primary; Hindi (`HI`) and 20+ regional languages are available
- Locale typically used: `en_IN.UTF-8`

## Tax System — GST (Goods and Services Tax, 2017+)
- For intra-state, **CGST** (central) pairs with **SGST/UTGST** (state/UT)
- **IGST** covers inter-state and imports
- Rates: 0%, 5%, 12%, 18%, 28% — plus cess on luxury/sin goods
- **GSTIN** — 15-char, shaped `SSPPPPPPPPPPPPZC` (2 state + 10 PAN + 1 entity + Z + 1 check)
- Goods carry an **HSN code** (4-8 digits), services a **SAC code**

## e-Invoicing / Fiscal Reporting
- **IRN (Invoice Reference Number)** — e-invoicing through the IRP (Invoice Registration Portal) is mandatory; since 2023 it extends to all businesses with turnover ≥ ₹5 crore
- The IRP returns the IRN together with a QR code, and both must appear on the printed invoice
- **GSTR filings** (automated from e-invoice + sales data):
  - GSTR-1 (outward) — monthly/quarterly
  - GSTR-3B (summary + tax payment) — monthly
  - GSTR-2B (auto-populated inward) — monthly
  - GSTR-9 (annual reconciliation), GSTR-9C (audit) if applicable
- **e-Way Bill** — mandatory whenever goods > ₹50,000 are moved (generated on the EWB portal)
- **TDS** (Tax Deducted at Source) and **TCS** (Tax Collected at Source) — challan monthly, return quarterly

## Banking / Payments
- **NEFT / RTGS / IMPS / UPI** — used for domestic transfers, UPI dominant for B2C
- **IFSC** — 11-char bank branch code, mandatory for a transfer
- **Account number**: length varies (9-18)
- IBAN is not used

## Master Data Peculiarities
- **PAN** (Permanent Account Number): 10-char alphanumeric; required for both businesses and individuals; **PII**
- **GSTIN per state** — one legal entity operating in multiple states holds multiple GSTINs
- **State Code** (first 2 digits of GSTIN) — critical to the IGST vs CGST+SGST determination
- **Place of Supply** rules are complex — intra- vs inter-state turns on POS, not on addresses alone
- TAN (Tax deduction Account Number), 10-char, for TDS

## Statutory Reporting
- **GSTR-1**: monthly for turnover > ₹5 cr, or quarterly
- **GSTR-3B**: monthly
- **TDS return (26Q/27Q/24Q)**: quarterly
- **Form 16/16A**: TDS certificates, annual
- **Income Tax return**: annual — by July for companies audited
- **MCA (Ministry of Corporate Affairs)** — annual filings

## SAP Country Version
- **CC IN** — includes:
  - GST tax procedure (condition-based)
  - e-invoicing through SAP DRC or an ASP/GSP (ClearTax, Avalara, IRIS, Taxilla)
  - e-Way Bill integration
  - TDS/TCS configuration
  - HCM-IN payroll (PF, ESI, Professional Tax, Form 16)
- An IDoc & BAPI layer carries the GSP/ASP connection

## Common Customizations
- GSTIN validation, plus the master-data check
- e-invoice / IRN integration per state / per business unit
- e-Way Bill generation on delivery / STO
- TDS determination by section (194C, 194J, 194I, 194Q…) and by threshold
- HSN/SAC mapping on the material / service master
- Reports formatted in lakh/crore

## Pitfalls / Anti-patterns
- Hardcoding Western number grouping (1,234,567) into Indian reports — stakeholders expect lakhs (12,34,567)
- GSTIN missing → IRN cannot be generated
- Wrong state code on the invoice → IGST vs CGST+SGST mismatch → ITC (input tax credit) blocked for buyer
- Skipping the e-Way Bill on goods >₹50,000 movement → truck detention risk
- TDS deducted under the wrong section / rate → notices from Income Tax Dept
- Cross-GSTIN postings inside one legal entity treated as a single entity
