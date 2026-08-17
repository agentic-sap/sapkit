# Protected Business Data
<!-- tier: standard -->
<!-- action: warn -->

These transactional tables carry customer and vendor PII together with commercial data — orders, invoices, accounting. Blocking starts at `standard` and applies to every tier above it.

| Table | Description | Why |
|-------|-------------|-----|
| VBRK | Billing header | Customer invoice PII linkage |
| VBRP | Billing item | Revenue per customer |
| VBAK / VBAP | Sales order header/item | Customer order PII |
| VBPA | Sales document partner | Partner PII in document |
| EKKO / EKPO | Purchase order | Vendor/price PII |
| BKPF / BSEG | Accounting document | Full FI posting with parties |
| ACDOCA | Universal Journal (S/4) | Full FI/CO with party data |
| FAGLFLEXA / FAGLFLEXT | New GL line items / totals | Financial detail |
| CDHDR / CDPOS | Change documents | Any field changes incl. PII |
| STXH / STXL | SAPscript text header / lines | Free-text PII possible |

### Related Standard CDS Views

| View | Wraps | Why |
|------|-------|-----|
| I_JournalEntry | BKPF | FI header with parties |
| I_JournalEntryItem | BSEG / ACDOCA | FI lines with party amounts |
| I_GLAccountLineItem | ACDOCA | GL detail with party |
| I_SalesOrder | VBAK | Sales order header with customer PII |
| I_SalesOrderItem | VBAP | Sales order line |
| I_SalesOrderScheduleLine | VBEP | Schedule with customer PII |
| I_BillingDocument | VBRK | Billing header (revenue per customer) |
| I_BillingDocumentItem | VBRP | Billing line |
| I_PurchaseOrder | EKKO | PO header with vendor + prices |
| I_PurchaseOrderItem | EKPO | PO line with prices |
| I_MaterialDocument | MATDOC / MKPF | Goods movements with party references |
| I_Payable | BSIK / BSAK | Open / cleared vendor items |
| I_Receivable | BSID / BSAD | Open / cleared customer items |
| I_TrialBalance | ACDOCA | Full FI trial balance |

> ⚠️ Tables in this "Protected Business Data" set are **not blocked outright** — extraction may be opened for the user's own company code or sales org scope, and only with party IDs anonymized. Explicit authorization must come from the user for each request; until it is given, the default posture stays **blocked**.
