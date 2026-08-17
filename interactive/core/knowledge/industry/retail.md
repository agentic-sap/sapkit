# Retail

## Business Characteristics
- SKU count is very large (tens to hundreds of thousands), product lifecycle is short, seasonality is strong
- Multiple channels are in play at once — brick-and-mortar stores, online, mobile, omnichannel
- Sales and inventory are managed at store level; pricing is driven by promotions and discounts
- POS integration carrying tens of millions of transactions a day
- Vendor power is not uniform, and the direct-buy, consignment, and concession models coexist

## Key Processes
- **Merchandising** covers Assortment Planning, Listing, Allocation, and Replenishment
- **Pricing & Promotion** spans pricing specific to a store or channel, plus promotions, coupons, and loyalty
- **Store Operations** comprises POS, store inventory, store-to-store transfers, and returns
- **Distribution Center** work is cross-docking, flow-through, and pick-by-line
- **Season Management** deals with in-season and out-of-season, markdown, and clearance
- **Vendor Management** runs across direct buy, consignment, and concession

## Master Data Specifics
- **Article (MARA)** — Retail calls it Article rather than Material, and it carries a Generic/Variant structure
- **Site (T001W)** — a store and a DC are distinct site types
- **Assortment** — it lists the articles a site carries
- **Listing Conditions** — they say which article is sold or stocked in which site
- **Merchandise Category Hierarchy** — the hierarchy that classifies articles (MC)

## Module Implications
- **SD** works from channel and POS rather than from the customer; concession stores use consignment sales
- **MM** brings high-volume POs, vendor management, EDI, and auto-replenishment
- **WM/EWM** carries cross-docking, wave management, and put-to-store
- **FI/CO** works with a store-level profit center, a daily close, and inventory valuation (FIFO/Moving Avg)
- **BW/CAR** delivers real-time store sales and inventory analytics through CAR (Customer Activity Repository)

## Common Customizations
- POS interfacing (POSDM, SAP POS DM)
- Automation of markdown and clearance
- Calculation of vendor commission (concession / consignment)
- Replenishment logic for stores (BAdI: `MB_DOCUMENT_BADI`)
- Order and invoice over EDI (IDOC: `ORDERS05`, `INVOIC02`)

## SAP Industry Solutions
- **IS-Retail** on ECC
- **S/4HANA for Retail**, which extends into Fashion & Vertical Business
- **SAP CAR (Customer Activity Repository)** — analytics on POS and inventory in real time
- **SAP Customer Checkout** and **SAP Omnichannel Promotion Pricing (OPP)**

## Pitfalls / Anti-patterns
- Treating Article as Material — the Article structure is what Retail requires
- Taking customer-based pricing over as-is, with no redesign around store or channel
- Putting consignment purchases through as regular POs, which produces errors in ownership and revenue recognition
- Aggregating FI postings with no allowance for POS volume, which brings on performance issues
- Modeling season and markdown pricing as plain conditions rather than reaching for Promotion Pricing
