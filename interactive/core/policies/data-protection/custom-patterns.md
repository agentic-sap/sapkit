# Customer-Specific PII Patterns
<!-- tier: minimal -->
<!-- action: warn -->

Customer extension tables in the `Z*`/`Y*` namespace commonly hold PII or sensitive business data. Which ones actually do must be assessed project by project; record the concrete Z-table names in `.sapkit/blocklist-extend.txt` or in this file.

| Pattern | Description | Why |
|---------|-------------|-----|
| `Z*` / `Y*` with PII content | Customer/partner Z-tables storing PII | Must be listed here case by case |
| `ZHR_*`, `ZPA_*` | Typical customer HR extensions | Employee PII |
| `ZCUST_*`, `ZKNA_*` | Customer-master extensions | Customer PII |
| `ZLFA_*`, `ZVEND_*` | Vendor-master extensions | Vendor PII |

> Whenever a new Z-table appears, the developer/consultant MUST judge whether it belongs on this blocklist and append it there before anything is extracted.
