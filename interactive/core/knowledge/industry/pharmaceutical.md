# Pharmaceutical

## Business Characteristics
- **GxP-regulated** — GMP, GDP, GLP, FDA 21 CFR Part 11, and EU Annex 11 apply
- **Electronic signature and audit trail** are mandatory, and computer system validation (CSV) is required
- **Serialization / Track & Trace** — DSCSA, EU FMD, and country-specific schemes
- Full traceability of batch/lot, together with shelf life and stability studies
- The product lifecycle is long, but patent expiry / generics still bring strong competition
- Cold chain handling for some biologics, plus controlled substances (narcotics)
- Clinical trial supply is carried on separate processes

## Key Processes
- **Process Manufacturing**: Master Recipe, with production organized as campaigns
- **QM Release Strategy**: nothing ships until QA release has happened
- **Serialization**: numbering at unit level plus aggregation (carton / pallet)
- **eCTD / regulatory submission**
- **Recall / Withdrawal**
- **Sample / Clinical Supply** kept as streams of their own

## Master Data Specifics
- **Batch** is mandatory, together with **Batch Status Management** (Released / Restricted / Blocked)
- **Classification** — values for potency, assay, and content test
- **Recipe Version** — kept per regulatory filing
- **Material** — carries a controlled substance flag and a serialization-relevant flag

## Module Implications
- **PP-PI**: where Master Recipe, process instructions, and the Electronic Batch Record (EBR) sit
- **QM**: inspection is mandatory, plus usage decision and stability
- **MM/SD**: a batch is transactable only when it is available (released)
- **WM/EWM**: quarantine, and storage types split by release status
- **EHS**: Dangerous Goods together with controlled substances
- **GTS**: regulations on import/export

## Common Customizations
- An electronic signature UI placed on every change transaction
- An audit trail enhanced with change documents plus a custom log
- Serialization numbering and aggregation carried out through integration with an external L4 system
- A batch genealogy report
- Sample and retention sample management

## SAP Industry Solutions
- **SAP for Life Sciences (IS-ADEC / IS-Pharma family)**
- **S/4HANA for Life Sciences**
- **SAP Advanced Track and Trace for Pharmaceuticals (ATTP)**

## Pitfalls / Anti-patterns
- Letting sales through without QM release → regulatory violation
- Batch Status Management left disabled → quarantine stock counts as available
- Electronic signature missing → CSV audit failure
- Serialization handled by CRM/SD barcoding alone → aggregation impossible
- Batch genealogy absent → recall back-trace fails
