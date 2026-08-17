# Tire

## Business Characteristics
- **Mixed manufacturing**: Process (compound mixing) combined with Discrete (building) and Repetitive (curing/finishing)
- Raw materials — natural rubber, synthetic rubber, carbon black, steel cord — carry highly volatile prices
- Two business models here differ fundamentally:
  - **OE (Original Equipment)**: supplied to automotive OEMs — JIT/JIS, long-term scheduling agreements, long-term agreements (LTA)
  - **RE (Replacement / Aftermarket)**: dealers, tire shops, online — driven by brand/marketing, with promotions
- Product variants span Size × Pattern × Load Index × Speed Rating × Season (Summer/Winter/All-Season)
- On regulations/certifications: DOT, ECE, EU Tyre Label, recall management
- A retreading business exists, and warranty claims are handled

## Key Processes
- **Mixing (Process)**: blending of the rubber compound, by batch/lot
- **Component Prep**: calendering, extrusion, bead, and ply
- **Building (Discrete)**: assembly of the green tire
- **Curing (Repetitive)**: vulcanization, with per-mold capacity
- **Finishing/QC**: X-ray, uniformity, and balance
- **OE Supply**: JIT/JIS delivery, sequenced delivery, and EDI
- **RE Distribution**: dealer network, consignment, and promotion
- **Warranty/Claim**: warranty by mileage/age, plus return analysis

## Master Data Specifics
- **Material** — either separated or flagged for OE vs RE
- **Variant Configuration** or Classification, used for specs
- **Mold** — held as Equipment/Resource, and it drives capacity
- **Batch** — compound lot, with cure lot traceability (recall)
- **Scheduling Agreement (LPA/LPB)** — the supply contract held with OE customers

## Module Implications
- **PP / PP-PI mixed**: the compound sits in PP-PI, while building/curing sits in REM (Repetitive) or PP
- **SD**: OE runs on Scheduling Agreement + JIT Call-off (VA31/SA), whereas RE runs on normal orders
- **MM**: volatility in raw material prices (Moving Avg or Standard + Variance), and LTAs
- **QM**: test results at batch level, and recall batch traceability
- **EHS**: management of chemical substances, with some Dangerous Goods
- **WM/EWM**: tires are bulky and bring loading constraints; dedicated racks

## Common Customizations
- EDI for the OE Scheduling Agreement (DELFOR/DELJIT → production plan)
- Sequenced call-off processing for Just-in-Sequence (JIS)
- A warranty claim system (Notification + Credit Memo)
- An enhancement for mold capacity planning
- A dealer portal (order/claim/inventory)
- Genealogy for compound batches (for recalls)
- Automatic generation of the EU Tyre Label

## SAP Industry Solutions
- No dedicated IS exists — the typical combination is IS-Auto (OE side) + IS-Mill Products (selective) + standard PP/PP-PI
- **SAP Direct Procurement for Automotive** (from the OE parts perspective)
- **SAP EWM**, for the logistics of bulky products

## Pitfalls / Anti-patterns
- Putting OE and RE under one sales org / pricing → pricing, margin, and promotion chaos
- Shaping compounds into discrete BOMs → batch / yield control fails
- Keeping molds only as Work Centers, with no Equipment Master → no preventive maintenance or availability tracking
- Leaving recalls without a batch genealogy design → months of reactive work later
- Handling OE Scheduling Agreements as if they were regular POs → no EDI automation or forecast integration
- Letting raw material prices swing without updating standard cost → distorted margins
