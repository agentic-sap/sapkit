# Utilities (Electricity / Gas / Water / District Heating)

## Business Characteristics
- **Millions of consumer accounts**, with meter reading and billing running on a periodic cycle
- Operations are device-centric — the devices are meters, and they move through installation / removal / replacement cycles
- Regulated industry, subject to tariff approvals; tariff structures are complex — time-of-use, seasonal, tiered
- Arrears and collections, dunning, disconnection
- The network asset base is huge — distribution / pipeline / substation
- Renewables and the smart grid are both growing
- Integration with the Customer Interaction Center (CIC) is tight

## Key Processes
- **Device Management** — install / remove / replace, and meter reading (MR)
- **Billing** — the chain runs meter reading → bill calculation → invoice
- **Collection / Dunning** — runs on FI-CA
- **Move-in / Move-out** — tenant in and tenant out
- **Outage / Disconnection**
- **Regulatory reporting**

## Master Data Specifics
- **Business Partner (BP)** paired with the Contract Account (FI-CA)
- **Contract** — product / tariff
- **Installation / Connection Object / Device Location**
- **Device (Equipment)**

## Module Implications
- **IS-U Core** — device, billing, invoicing
- **FI-CA (Contract Accounting)** — the dedicated AR module, built for high-volume processing
- **CRM (IC-WebClient)** — call center
- **PM** — asset maintenance

## Common Customizations
- Integration with Smart Meter / AMI
- Tariff rate changes, arriving as mass updates when regulation changes
- Mobile field service — workforce management
- Portals for self-service

## SAP Industry Solutions
- **SAP for Utilities (IS-U)**
- **S/4HANA Utilities**
- **SAP Cloud for Utilities**
- **SAP FI-CA** (Contract Accounting)

## Pitfalls / Anti-patterns
- Standard FI AR is used → open items collapse under millions of consumers (FI-CA is required)
- Device history is not tracked → replacement / maintenance records missing
- Tariff changes are managed only in custom Z-tables → regulatory audit failures
- Move-in / move-out is processed manually → settlement gaps
