# Fashion / Apparel

## Business Characteristics
- **Variant-centric**: Style × Color × Size, with SKU combinations running from the thousands into the tens of thousands
- Seasons (SS/FW) set the pace, product turnover is rapid, and selling windows are short
- Planning works off the lookbook / collection, within MOQ constraints
- Global sourcing (OEM/ODM) carries long lead times of 3–6 months against demand that is highly uncertain
- Markdown is leaned on heavily; at end-of-season the move is to outlet / clearance
- A mix of Wholesale (B2B), Retail (B2C), and E-commerce

## Key Processes
- **Collection / Season Management**: a chain of pre-season planning → buying → allocation → in-season replenishment → end-of-season
- **Pre-pack / Solid Pack / Assortment Pack**: orders bundled according to a size ratio
- **Size Curve / Grading**: the ratio of sales carried by each size
- **Allocation & Replenishment**: distribution down to store level, driven by the size curve
- **Sourcing**: global vendors, plus Letters of Credit (LC) and import duty
- **Sample Management**: the order/approval process for samples

## Master Data Specifics
- **Generic Article + Variants**: Color/Size variants linked beneath one generic parent
- **Characteristic (CT04)**: color, size, fit, and the like
- **Grid (Size/Color)**: order entry and inventory views presented as a matrix
- **Seasonality Attributes**: the season code, the collection, the theme
- **RFID tagging** grows more common as a way to improve store inventory accuracy

## Module Implications
- **SD**: Matrix order entry over the size/color grid, pre-pack orders, drop shipment
- **MM**: global vendors, LC/trade, POs with long lead times, sample POs kept separate
- **PP**: lot-based, with subcontracting (OEM) and Cut-Make-Trim (CMT)
- **WM/EWM**: hanging garment and flat pack held in separate storage, pick-by-variant
- **FI/CO**: COGS/margin analysis at season level, markdown reserve

## Common Customizations
- An allocation engine driven by the size curve
- A markdown cascade running regular → sale → outlet → write-off
- Expansion of the pre-pack BOM (Enhancement: VA01 BAdI)
- A Grid UI on Fiori / WebDynpro
- Classification of returns (defect / remorse / exchange), plus a restocking fee

## SAP Industry Solutions
- **SAP AFS (Apparel and Footwear Solution)** — legacy, built on ECC
- **SAP Fashion Management Solution (FMS)** — the successor on S/4HANA
- **S/4HANA for Fashion and Vertical Business** — the currently recommended offering
- **SAP CAR** plus the Fashion extensions

## Pitfalls / Anti-patterns
- Registering every variant as its own material → SKU explosion, and planning/analysis that can no longer be managed
- Allocation that disregards the size curve → stockout and overstock arising at size level at the same time
- Keeping the season code in the material description alone while leaving classification unused
- Handling a pre-pack as an ordinary sales BOM → inventory at variant level comes out wrong
- Leaving the landed cost (freight/duty) of global sourcing out of the standard cost
