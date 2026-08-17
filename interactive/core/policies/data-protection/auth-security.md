# Authentication / Authorization / Security
<!-- tier: minimal -->

Logon records, password hashes, authorization profiles, RFC destinations that carry stored credentials, and cryptographic key material. Reading rows out of any of them is a direct credential-disclosure and privilege-escalation risk.

| Table | Description | Why |
|-------|-------------|-----|
| USR02 | User master — logon | **Password hashes** — extraction NEVER permitted |
| USH02 | Password change history | Password hashes from earlier periods |
| USRBF2 | User buffer — auth values | Caches auth values |
| USR01 | User master — runtime | Per-user logon metadata |
| USR04 | User master auth profile buffer | Carries a user's auth profiles |
| USR10 | User auth profiles | Which profiles each user holds |
| USR12 | Auth values | Values behind each auth field |
| USR21 | User → BP/address link | Links a user to a named identity |
| USR22 | Logon data (extra) | More logon detail |
| USR40 | Prohibited passwords | Reveals the security policy |
| USR41 | Multi-logon | Session records |
| USR_CUST | User-specific customizing | One user's personal settings |
| AGR_1251 | Authorization data for roles | Auth field and value combinations |
| AGR_USERS | User-role assignment | Links roles to named users |
| AGR_AGRS | Composite role contents | Role configuration |
| PRGN_CUST | PFCG customizing | Auth system configuration |
| RFCDES | RFC destinations | **RFC passwords and secrets stored inline** |
| RSECACTB / RSECTAB | Secure Store keys | Cryptographic key material |
| SNCSYSACL | SNC access list | Reveals the security policy |
| SSF_PSE_D | PSE / X.509 data | Cryptographic material |

### Related Standard CDS Views

| View | Wraps | Why |
|------|-------|-----|
| I_User | USR02 / USR21 | Exposes user master rows — extraction NOT permitted |
| I_UserAuthorization | AGR_1251 / USR12 | Auth values from the wrapped tables |
| I_UserRole | AGR_USERS | Assigned roles |
| I_UserInfo | USR01 / USR21 | Metadata about users |
