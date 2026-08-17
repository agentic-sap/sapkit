# Banking / Payment — Customer & Vendor Financial Credentials
<!-- tier: minimal -->

Bank accounts, payment runs, cheque and card data — these rows expose financial credentials directly.

| Table | Description | Why |
|-------|-------------|-----|
| BNKA | Bank master data | Customer/vendor bank account credentials |
| KNBK | Bank details of the customer | The customer's bank account numbers |
| LFBK | Bank details of the vendor | The vendor's bank account numbers |
| BUT0BK | Bank details of the Business Partner (S/4) | Bank account numbers held under a BP |
| T012K | House banks and their bank account details | The company's own banking credentials |
| REGUH | Settlement data produced by the payment program | Detail of outgoing payments |
| REGUP | Items the payment program processed | Line items behind each payment |
| PAYR | Payment medium file | Cheque and payment numbers |
| FPLT | Dates in the billing plan | Payment data linked to the plan |
| FPLTC | Payment cards in the billing plan | Tokenized credit card data |
| CCARD | Payment cards (no longer used) | Credit card numbers |
| TCRCO | Credit card organizations | Credentials of the card processor |
| BSEGC | Payment card segment of the FI document | Data on the card transaction |
| FPAYH / FPAYHX / FPAYP / FPAYPX | Payment medium data | Contents of the payment file |

### Related Standard CDS Views

| View | Wraps | Why |
|------|-------|-----|
| I_BankAccount | BNKA / T012K | Bank master together with house-bank accounts |
| I_Bank | BNKA | Bank master |
| I_BusinessPartnerBankDetails | BUT0BK | Bank accounts of the Business Partner |
| I_CustomerBankDetails | KNBK | Bank accounts of the customer |
| I_SupplierBankDetails | LFBK | Bank accounts of the vendor |
| I_HouseBankAccount | T012K | House bank of the company code |
| I_PaymentMediumMT940 | FEBKO / FEBEP | Lines of the bank statement |
| I_PaymentCard | CCARD / FPLTC | Tokens for payment cards |
