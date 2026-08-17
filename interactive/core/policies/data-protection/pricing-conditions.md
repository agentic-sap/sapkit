# Pricing / Conditions / Rebates
<!-- tier: minimal -->

Pricing data carries **top-tier commercial risk**. A leak hands over discounts specific to one customer, the margin structure, rebate agreements, and list prices settled by negotiation — competitive intelligence on its own, and leverage the next time terms are negotiated. The default posture is **deny**, enforced at `minimal` tier without exception.

| Table | Description | Why |
|-------|-------------|-----|
| KONH | Conditions header (master) | Condition keys that point to the item data |
| KONP | Conditions item (master) | **Actual prices / discounts / surcharges per condition record** |
| KONM | Conditions — quantity scales | Tiered pricing detail |
| KONW | Conditions — value scales | Value-based scales |
| KONA | Rebate agreements | **Customer-specific rebate %/rates** |
| KOTE* | Rebate condition tables | Rebate access paths with rates |
| KONV | Conditions — transaction data (ECC) | Per-document prices incl. negotiated margin (huge) |
| PRCD_ELEMENT | Pricing conditions (S/4 simplified — takes the place of KONV on S/4 sales docs) | Same sensitivity as KONV |
| PRCD_ELEMENTS | Legacy name of PRCD_ELEMENT | Same |
| PRCD_COND_HEAD | S/4 condition header (new pricing) | Header of pricing record |
| PRCD_COND | S/4 condition item (new pricing) | Item prices |
| A### | Condition access (dynamic tables A001–A999) | Price lookup records — **these hold the actual rates** (wildcard: `#` = single digit) |
| KONPR | Promotion conditions (Retail / IS-Retail) | Retail promotion pricing |
| KONDD | Bonus buy conditions (Retail) | Promotional bundle pricing |
| KONPAE | Archived conditions | Historical prices |

### Related Standard CDS Views

| View | Wraps | Why |
|------|-------|-----|
| I_PriceCondition | KONP / PRCD_ELEMENT | Condition records with rates |
| I_PricingProcedure | T683 + KONP | Procedure + rates |
| I_SalesPricingCondition | PRCD_ELEMENT | Sales-document pricing |
| I_PurchasingPricingCondition | PRCD_ELEMENT | Purchasing pricing |
| I_RebateAgreement | KONA | Rebate agreements |
| I_RebateCondition | KOTE* | Rebate access records |
| I_SalesContractPrice | VBKD / PRCD_ELEMENT | Contracted customer prices |
| I_PurchaseContractPrice | EKPO / PRCD_ELEMENT | Contracted vendor prices |
| I_SalesOrderItemPrice | VBAP + PRCD_ELEMENT | Per-line sales prices |
| I_BillingDocItemPrice | VBRP + PRCD_ELEMENT | Billed per-line prices |

> What is allowed instead: `GetTable` to read the schema; `GetSqlQuery` limited to `COUNT(*)` aggregates, with no rate columns in the SELECT; anonymized/synthetic pricing data when testing. Raw extraction is never permitted for `KBETR`, `KWERT`, `KPEIN`, `KMEIN`, or any rate/amount column in these tables.
