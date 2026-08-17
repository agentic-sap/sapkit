# Audit / Security Logs
<!-- tier: strict -->

This category covers application logs, system and workload monitoring, short dumps, and table-change audit. Message variables in such records frequently carry PII inline, so extraction is blocked under the `strict` profile.

| Table | Description | Why |
|-------|-------------|-----|
| BALDAT / BALHDR | Application log data | Message variables can hold PII |
| SLG1 / SLGD | Application log (transaction) | Same message-variable exposure |
| RSAU_BUF_DATA | Security audit log buffer | Security event records |
| SNAP | ABAP short dumps | Captures user actions and variable contents |
| SMONI | System monitoring | Performance figures alongside user data |
| SWNCMONI / SWNCT* | Workload monitor | Per-user activity |
| STAD / STATTRACE | Statistical records | Trace of user activity |
| DBTABLOG | Table change logs | Audit of changes down to the field |
