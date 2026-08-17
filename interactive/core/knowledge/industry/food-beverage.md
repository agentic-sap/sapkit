# Food & Beverage

## Business Characteristics
- **Short shelf life**: expiration dates and mandatory FEFO
- **Catch weight**: actual weight against nominal weight, for variable-weight items
- HACCP, FSSC 22000, and Halal / Kosher certifications
- Raw material prices are highly volatile: agricultural products, oil, sugar, and so on
- Seasonality, heavy dependence on promotions, and Trade Promotion Management (TPM)
- Hygiene and cold chain management
- Private label and co-packers (OEM) are used heavily

## Key Processes
- **Process Manufacturing + Packaging**
- **Batch / Expiry Management**, with picking by FEFO
- **Trade Promotion**: rebates, allowances, and deductions
- **Catch Weight Sales**: weight varies from case to case
- **Route Settlement**: truck settlement for Direct Store Delivery (DSD)

## Master Data Specifics
- **Batch** carrying a shelf life expiration date
- The **Material — Catch Weight** indicator
- **Units of Measure**: UoM at multiple levels (base / sales / issue)
- **Recipe** (PP-PI)

## Module Implications
- **PP-PI**: batch manufacturing, and campaign planning that accounts for Cleaning (CIP)
- **QM**: inspection of raw materials and microbial testing
- **SD/MM**: batch determination by FEFO, catch-weight UoM
- **WM/EWM**: putaway driven by expiry, cold storage
- **FI/CO**: accrual for promotions, deduction management

## Common Customizations
- Catch weight processing: actual weight against invoiced weight
- Blocking automatically on remaining shelf life
- Automating TPM accruals
- Route settlement for DSD
- Auto-matching of deductions in AR

## SAP Industry Solutions
- **SAP for Consumer Products (IS-CP)**
- **S/4HANA Consumer Products**
- **SAP TPM (Trade Promotion Management)**
- **SAP Agricultural Contract Management (ACM)** for raw materials

## Pitfalls / Anti-patterns
- Skipping catch weight → invoicing and inventory weights diverge
- Leaving shelf life blocking off → near-expiry stock gets shipped
- Reducing promotions to pricing conditions alone → accounting accruals go missing
- Counting out-of-temperature cold-chain stock as normal stock
