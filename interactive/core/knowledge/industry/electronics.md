# Electronics / High-Tech

## Business Characteristics
- Product lifecycles are short, obsolescence is rapid, and inventory carries write-down risk
- **Configure-to-Order (CTO)** / **Make-to-Order (MTO)** hold a high share
- Serial number / IMEI tracking; after-sales service
- A global supply chain, with component shortage risk
- Contract manufacturers (EMS/ODM) are used heavily
- A multi-tier channel (Distributor → Reseller → End-user), with complex rebate programs
- Revenue recognition is complex — bundles of hardware + software + services

## Key Processes
- **Variant Configuration (LO-VC)** or **Advanced Variant Configuration (AVC)**
- **Serial number management**
- **Channel incentive / rebate / price protection**
- **RMA (Return Material Authorization)**, plus repair orders
- **Software license management**
- **Contract manufacturing** — subcontracting with the components supplied in full

## Master Data Specifics
- **Configurable Material (KMAT)**, with characteristics, class, and object dependencies
- **Serial Number Profile**
- **Equipment (ERP master)** — the installed product
- **Customer Hierarchy** — distributor / reseller

## Module Implications
- **SD**: order entry on a VC basis, contract (outline agreement), rebate agreements
- **PP**: planning strategies for MTO/CTO (20/25/50/82), and assembly orders
- **MM**: subcontracting, VMI, and consignment (for component supply)
- **CS/Service**: warranty, repair, and the installed base
- **FI**: revenue recognition over multiple elements (SD-RR or SAP RAR)

## Common Customizations
- A configurator UI (Fiori / external)
- Enhancements to rebate calculation, for conditions that are complex
- Price protection — compensation when prices drop on stock already shipped
- The RMA → repair → return workflow
- Software license issuance, and its integration

## SAP Industry Solutions
- **SAP for High Tech**
- **S/4HANA for High Tech** (includes AVC)
- **SAP Revenue Accounting and Reporting (RAR)**
- **SAP Commissions (Callidus)**

## Pitfalls / Anti-patterns
- Thousands of SKUs registered without Variant Configuration → master data that cannot be managed
- The Serial Number Profile changed after go-live → split history on serials that already exist
- Rebates treated as plain discounts → neither accrual nor settlement is controlled
- Revenue recognized by billing date alone → complex-contract rules (VSOE / ASC 606) are violated
- EMS subcontracting component stock not captured in your books → inventory does not match
