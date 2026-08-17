# Construction / Engineering & Construction (E&C)

## Business Characteristics
- Accounting and operations alike are **project-centric**; PS is required.
- Projects run long — months to years — and billing follows progress.
- **Revenue recognition** follows Percentage-of-Completion (POC) and IFRS 15.
- Material, labor, and equipment are managed at site level.
- Equipment comes in two forms, rented and owned (rental equipment fleet).
- Subcontracting and joint ventures (JV) are both present.
- Gap management covers actual cost against execution budget (EVM).

## Key Processes
- **Project structuring** covers WBS, Network, and Activity.
- **Budgeting / cost planning / release**
- **Progress measurement** uses POC and milestone billing.
- **Subcontractor management** runs on the service PO and the service entry sheet.
- **Site logistics** handles on-site inbound and outbound, and material flow.
- **Claim / variation orders**

## Master Data Specifics
- **Project (PS) / WBS / Network**
- **Cost and revenue planning**, held at the WBS.
- **Service master**, used for external services.
- **Equipment**, covering plant equipment and rentals.

## Module Implications
- **PS (Project System)** is the core module, and every cost and revenue aggregates under the WBS.
- **SD** covers milestone billing, the down payment request, and resource-related billing (DP91).
- **MM** brings project stock, plus the service PO paired with the service entry sheet (ML81N).
- **CO** handles POC results recognition (KKA*) and results analysis.
- **PM** owns equipment management and preventive maintenance.

## Common Customizations
- Enhancements that calculate POC automatically.
- Milestone billing plans generated automatically.
- An on-site mobile app for material flow and attendance.
- Joint Venture accounting, covering JV settlement.
- Dashboards that set execution budget against actual.

## SAP Industry Solutions
- **SAP for Engineering, Construction & Operations (IS-EC&O)**
- **S/4HANA for EC&O**
- **SAP Commercial Project Management (CPM)**
- **SAP Portfolio and Project Management (PPM)**

## Pitfalls / Anti-patterns
- Accounting only by cost center leaves no project-level profitability analysis.
- Calculating POC manually each month produces delays and errors.
- Receiving invoices without service entry sheets leaves the evidence missing.
- Managing on-site material only in the central warehouse view creates a discrepancy with the physical site.
- Handling variation orders outside the contract structures loses cost traceability.
