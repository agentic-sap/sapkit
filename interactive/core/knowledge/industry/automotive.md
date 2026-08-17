# Automotive

## Business Characteristics
- Supply is structured in tiers: OEM → Tier 1 → Tier 2 → Tier 3 (raw materials)
- Delivery turns on **JIT/JIS**, and the risk of a line stop is severe
- Long-term agreements (LTA) are obligatory, and so is EDI (VDA, ANSI X12, Odette)
- On the quality side: IATF 16949, PPAP, APQP, FMEA, 8D Report
- Model Year, vehicle option, and Engineering Change (ECO/ECN) occur frequently
- Serialization (VIN) applies, and traceability is required (recall)
- Warranty/recall costs run very high

## Key Processes
- **Scheduling Agreement + Release**: LZ/LPA together with DELFOR (forecast) / DELJIT (JIT call)
- **JIT/JIS Call-off**: delivery sequenced to the line side
- **Consignment Stock at Customer (VMI)**
- **Engineering Change**: ECM (ECR/ECO) and BOM versioning
- **Quality — PPAP/APQP**, inspection, and CoC
- **Warranty processing** and recall management

## Master Data Specifics
- **Material** — split into OE/AM, with the internal part number mapped to the customer part number
- **Customer Material Info Record (KNMT)** — part numbers specific to the OEM
- **BOM (CS01)** — ECM version and effectivity (date/serial)
- **Serial Number Profile**
- **Scheduling Agreement (SA)** — forecast plus JIT horizon

## Module Implications
- **SD**: Scheduling Agreement (VA31/VA32), JIT Outbound (VJ01), and Self-Billing (ERS)
- **MM**: Vendor Scheduling Agreement, Consignment, and Kanban
- **PP**: Repetitive Manufacturing, REM backflush, and line balancing
- **QM**: PPAP, inspection plan, and Q-Info Record
- **LE/EWM**: Handling Unit and sequence-based picking
- **FI**: Self-Billing (ERS) and customer consignment billing

## Common Customizations
- Mapping for EDI (DELFOR/DELJIT/DELINS → SA release)
- Sequence processing for JIS (line sequence ↔ pick sequence)
- Customer part number ↔ internal material mapping
- Mass-change programs for ECN
- A warranty claim system (Notification + Credit)
- Integration with IMDS (International Material Data System)

## SAP Industry Solutions
- **SAP for Automotive (IS-Auto)** — based on ECC
- **S/4HANA Automotive**
- **SAP Extended Warehouse Management (EWM)**
- **SAP Manufacturing Integration and Intelligence (MII)**

## Pitfalls / Anti-patterns
- Failing to separate the Scheduling Agreement forecast from JIT → MRP / production planning confusion
- Running without a customer part number mapping → EDI failures
- Driving ECN effectivity from the BOM date alone → serial-based validity impossible
- Skipping self-billing reflection → large AR open items left unbilled
- Booking Tier-to-Tier consignment as regular stock → ownership / valuation errors
