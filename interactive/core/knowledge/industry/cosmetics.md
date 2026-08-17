# Cosmetics

## Business Characteristics
- **Batch/lot management is mandatory** — it carries the production date, the shelf life, and traceability back to the raw-material lot
- It is a regulated industry, with national cosmetics authorities (e.g., MFDS, FDA), the EU Cosmetics Regulation, and GMP in scope
- Sales run across a wide spread of channels: department stores, Health & Beauty chains, MLM/direct sales, duty-free, online, and export
- Promotions, samples, gift-with-purchase (GWP), and set products all recur frequently
- The product structure runs brand / line / seasonal collection, and Limited Editions appear often
- Overseas OEM/ODM is used extensively, and private label business is common

## Key Processes
- **Formulation / Recipe Management**: formulas are managed under version control
- **Batch Manufacturing**: the characteristics are those of a process industry, and production runs as campaigns
- **QC/QA**: inspection at incoming, in-process, and outgoing points, plus the Certificate of Analysis (CoA)
- **Shelf Life Management**: picking follows First-Expired-First-Out (FEFO)
- The handling of **Sample / Tester / GWP (Gift with Purchase)**
- **Regulatory Reporting**: ingredient filing, country of origin, and import/export duty
- **Channel Pricing**: every channel (department, H&B, duty-free, export) carries its own price and margin structure

## Master Data Specifics
- **Batch (MCH1/MCHA/MCHB)** — mandatory, and carrying batch characteristics: production date, shelf life, test values
- **Material — Shelf Life fields** (MARA-MHDRZ, MHDHB, MHDLP)
- **Recipe (PLPO with RM category)** — used for the process industry
- **Classification**: INCI ingredients and regulatory categories
- **Customer Hierarchy**: built per channel (department / H&B / duty-free / export)

## Module Implications
- **PP-PI (Process Industry)**: the objects involved are Master Recipe, Process Order, and Resource
- **QM**: inspection at GR, in-process, and release; the usage decision; CoA printing
- **MM**: batch management, the vendor batch, and shelf life at goods receipt
- **SD**: batch determination (FEFO), order types for samples and GWP, and channel-based pricing
- **WM/EWM**: batch- and expiry-based picking, and quarantine storage areas
- **EHS**: ingredient regulations and Safety Data Sheets (SDS)

## Common Customizations
- Populating batch characteristics automatically, with the production and expiry dates calculated
- An enhancement to the FEFO strategy — the batch search strategy
- A dedicated order type for samples and testers, kept on separate FI accounts
- Determining GWP automatically, built from Free Goods plus a BAdI
- Generating the CoA automatically out of a Smartform plus the QC results
- Restricting who can see which channel's prices, through authorization plus a BAdI
- Generating the label and ingredient sheet automatically for exports

## SAP Industry Solutions
- **SAP for Consumer Products (IS-CP)**
- The **S/4HANA Consumer Products** industry edition
- **SAP TPM (Trade Promotion Management)**
- **SAP GTS (Global Trade Services)**, for imports and exports

## Pitfalls / Anti-patterns
- Running without batch management → there is no way to track expiry or to run a recall
- Setting the shelf life in MM01 and leaving batch determination unconfigured → FEFO never comes into effect
- Processing samples as regular sales → both the sales figures and the margin come out distorted
- Handling channel pricing through customer pricing procedures alone → management complexity explodes (use Customer Hierarchy)
- Skipping recipe version control → the regulatory audit history cannot be supported
- Treating OEM production as plain subcontracting, with no batch traceability
