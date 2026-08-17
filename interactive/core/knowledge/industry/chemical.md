# Chemical

## Business Characteristics
- Chemical is a classic **process industry**: production is continuous or batch, and campaign production carries a high changeover cost
- Dangerous Goods, REACH, GHS, and SDS management are required
- By-products and co-products occur frequently, and yield varies
- Prices are linked to crude and feedstock, and pricing is formula-based (indexed prices)
- Bulk transport uses tank truck, rail car, ship, and pipeline
- Container management covers drum / IBC / ISO tank, which are returnable and require cleaning

## Key Processes
- **Process Manufacturing** works from the Master Recipe and runs continuous / campaign
- **Blending** and **Tolling (toll manufacturing)**
- **Tank / Silo inventory** together with bulk movement
- **Dangerous Goods shipping**, which covers DG classification and placarding
- **Formula Pricing**, where prices are tied to external indices (e.g., Platts)

## Master Data Specifics
- **Batch**, held together with the tank/silo storage location
- **Material — DG info**, carrying the UN number and hazard class
- **Characteristics** for concentration, purity, viscosity, and other specs
- **Recipe with Co-/By-Product**
- **Vendor/Customer — DG qualifications / licenses**

## Module Implications
- **PP-PI** covers the continuous process, tank level, and co-/by-product handling
- **EHS** handles SDS, DG, REACH, and product safety
- **SD/MM** sees DG checks, container return, and formula pricing
- **WM** manages tanks and silos
- **QM** brings tank sampling and CoA

## Common Customizations
- A formula pricing engine wired into external index feeds
- DG documents generated automatically
- A tank level interface carrying PI → SAP
- Container deposit / return handling for returnable packaging
- Goods receipt and valuation of co-/by-products performed automatically

## SAP Industry Solutions
- **SAP for Chemicals (IS-Chem)**
- **S/4HANA Chemicals**
- **SAP EHS Management**
- **SAP Global Batch Traceability (GBT)**

## Pitfalls / Anti-patterns
- Recording co-/by-products as goods receipts of their own while leaving them out of the recipe → costing comes out distorted
- Letting DG info live only on the material master, with no EHS integration → shipping documents go missing
- Following tank inventory by storage location alone → a mismatch against actual levels
- Updating formula pricing by hand each day → errors and delays
- Leaving container returns unmanaged → losses that grow significant over time
