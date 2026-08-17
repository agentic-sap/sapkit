# Steel / Metals / Mill Products

## Business Characteristics
- **Characteristic-based inventory**: one and the same material still splits into separately managed stock once the spec differs (thickness / width / length / grade)
- **Catch weight**: it is the actual weight that a transaction is booked on
- Traceability reaching down to **Batch / Heat Number** and Coil Number level
- **Finishing operations**: cut-to-length, slit and shear
- Logistics runs heavy and the transport is special (crane, dedicated vehicles)
- Raw material prices swing (iron ore, scrap, alloys)
- Orders against a customer's own spec are the common case (MTO)

## Key Processes
- **Heat / Melt → Casting → Rolling → Finishing**
- **Coil tracking**: every coil carries its own unique ID together with characteristic values
- **Order-to-mill gap**: allocation matching the ordered spec against the spec held in stock
- **Cut-to-order**: processing down to the length/width the customer specified
- **Remnant management**: the pieces left over

## Master Data Specifics
- **Material + characteristics**: grade, thickness, width, coating and the like
- **Batch with extensive classification**
- Managing **Tolerance** (the allowance on a spec)
- UoM for **Catch weight**

## Module Implications
- **PP-PI / mill-specific**: BOM/Routing driven by characteristics
- **MM/SD**: searching batches by characteristic, allocation
- **WM**: storing coils, managing cranes
- **QM**: testing per heat, Mill Certificate

## Common Customizations
- An allocation engine working off characteristics
- Mapping a Coil ID onto the customer order
- Generating the Mill Certificate (CoA) automatically
- Logic for reusing remnants
- Integration of the weight ticket

## SAP Industry Solutions
- **SAP for Mill Products (IS-Mill)**
- **S/4HANA for Mill Products**

## Pitfalls / Anti-patterns
- Configuring standard only, without IS-Mill → characteristic-based allocation is missing
- Tracking at material level alone, with no coil-level identity → order matching fails
- Leaving catch weight out → weight errors pile up
- Treating remnants as nothing but scrap → the recycling value is lost
