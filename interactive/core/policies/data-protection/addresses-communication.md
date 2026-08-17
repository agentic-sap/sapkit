# Addresses / Communication
<!-- tier: minimal -->

The ADR* tables belong to Central Address Management: home and work addresses, phone and fax numbers, email addresses, and URLs. All of it is PII.

| Table | Description | Why |
|-------|-------------|-----|
| ADRC | Address master | Street, city and postal code — PII |
| ADRP | Person master | Name, title and birth date of an individual |
| ADR2 | Telephone numbers | Phone numbers — PII |
| ADR3 | Fax numbers | Contact details — PII |
| ADR6 | Email addresses | Email addresses — PII |
| ADR7 | Teletex numbers | Contact details — PII |
| ADR9 | Communication types (misc) | Contact details — PII |
| ADR11 | Print data | Contact information |
| ADR12 | URLs (WWW) | Websites belonging to an individual |
| ADR13 | Pager numbers | Contact details — PII |
| ADRT | Communication data — text | Free-text notes on communication |
| ADRCT | Address text (notes) | Free-form text — PII |

### Related Standard CDS Views

| View | Wraps | Why |
|------|-------|-----|
| I_Address | ADRC | Complete address |
| I_AddressEmailAddress | ADR6 | Email addresses — PII |
| I_AddressPhoneNumber | ADR2 | Phone numbers — PII |
| I_AddressFaxNumber | ADR3 | Fax numbers — PII |
| I_AddressWebAddress | ADR12 | Web addresses |
| I_BusinessPartnerAddress | BUT020 + ADRC | Business partner address |
| I_BusinessPartnerEmailAddress | BUT020 + ADR6 | Business partner email address |
| I_BusinessPartnerPhoneNumber | BUT020 + ADR2 | Business partner phone number |
| I_PersonName | ADRP | Name, title and date of birth of a person |
