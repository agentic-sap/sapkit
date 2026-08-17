# Banking / Financial Services

## Business Characteristics
- Regulatory intensity is at its highest — BIS, IFRS 9, Basel III, local IFRS variants
- Transaction volume runs very high, the requirements are real-time, and operations are 24/7
- Accounting is product-centric — deposits, loans, cards, investments
- Risk management is critical — credit, market, and operational risk
- Data protection is strict — GDPR and local equivalents

## Key Processes
- **Core banking integration** — SAP ordinarily serves as the complement to a core banking system
- **Financial accounting**: a parallel ledger carrying local IFRS alongside regulatory reporting
- **Treasury**: cash and liquidity, plus hedge accounting
- **Expense management** together with procurement
- **HR / payroll**

## Module Implications
- **FS-CD (Collections & Disbursements)**: AR/AP in its banking-specific form
- **FS-BP (Banking Business Partner)**
- **TRM (Treasury and Risk Management)**
- **FI-AA**: asset management for branches and equipment
- **HCM**

## SAP Industry Solutions
- **SAP for Banking**
- **S/4HANA for Financial Services**
- **SAP Deposits Management, Loans Management, Collateral Management**

## Pitfalls / Anti-patterns
- Putting banking volume through standard FI rather than FS-CD / FS-BP → performance collapse
- The parallel ledger left unconfigured → regulatory and local IFRS reporting cannot be separated
- PII left unmasked → regulatory violations
