# TM - Transportation Management Development Workflows
# TM - 운송 관리 개발 워크플로우

## Workflow 1: Freight Unit Building and Freight Order Creation
### Steps
1. Freight unit building starts from an SD delivery (LIKP/LIPS) by way of the TM integration
2. Read the delivery data with BAPI_OUTB_DELIVERY_GET_DETAIL for quantities, weights, and destination
3. Create the freight unit through /SCMTMS/CL_FU_BAPI=>CREATE, handing it the delivery reference, weight, volume, and locations
4. Run the planning: /SCMTMS/PLN_WKBK, or a programmatic call into the VSR optimizer
5. The optimizer places the freight units onto freight orders by route, capacity, and time window
6. Create the freight order through /SCMTMS/CL_FO_BAPI=>CREATE, carrying carrier, vehicle, and planned route
7. Run the tendering when the carrier is not pre-assigned: /SCMTMS/CL_TEND_BAPI=>EXECUTE
8. Once the carrier accepts: confirm the freight order; produce the output (CMR, Bill of Lading)
9. Post the tracking events as the shipment moves along: /SCMTMS/CL_TTE_BAPI=>POST_EVENT

### Required MCP Tools
- `GetClass` — brings up the /SCMTMS/CL_FO_BAPI class interface
- `GetTable` — shows /SCMTMS/D_FO (freight order) and /SCMTMS/D_FU (freight unit)
- `CreateProgram` — sets up the TM integration program

### Related Config
- Freight Order Types: V_TMFOT
- Freight Unit Building Rules: V_TMFUB
- Transportation Lanes: V_TMLANE

---

## Workflow 2: Carrier Tendering and Rate Comparison
### Steps
1. Find the freight order that still needs a carrier assigned: /SCMTMS/CL_FO_BAPI=>GET_LIST filtered on status "needs carrier"
2. Work out which carriers are eligible from the transportation lane: /SCMTMS/CL_LANE_BAPI=>GET_LIST
3. Calculate the freight charges carrier by carrier: /SCMTMS/CL_FCC_BAPI=>CALCULATE for each carrier/agreement
4. Start the tendering process: /SCMTMS/CL_TEND_BAPI=>EXECUTE — sends the RFQ out to the carriers
5. Implement BAdI /SCMTMS/IF_EX_TEND to carry the custom carrier ranking logic (cheapest + preferred carrier)
6. Take in the carrier response (manual or automated over XML/IDoc)
7. Accept the best offer: /SCMTMS/CL_TEND_BAPI=>ACCEPT
8. Write the selected carrier onto the freight order; trigger the booking confirmation

### Required MCP Tools
- `GetClass` — reads the /SCMTMS/IF_EX_TEND BAdI interface
- `CreateClass` — builds the carrier ranking BAdI
- `GetTable` — lays out /SCMTMS/D_TEND (tendering) and /SCMTMS/D_FRG_AGR (freight agreements)

### Related Config
- Freight Agreement Types: V_TMFAG
- Carrier Profiles: V_TMCAR
- Tendering Settings: V_TMTEND

---

## Workflow 3: Real-Time Tracking Integration (GPS/Telematics)
### Steps
1. Take in the GPS update from the telematics provider over an RFC or REST API call
2. Parse the tracking message: pull out the freight order/shipment ID, the current location (lat/long), the timestamp, and the status
3. Work out which TM location sits closest to the GPS coordinates using /SCMTMS/CL_LOC_BAPI=>GET_DETAIL
4. Post the tracking event: /SCMTMS/CL_TTE_BAPI=>POST_EVENT carrying the event type (departure, arrival, delay), location, and time
5. Compare it against the expected events (V_TMEE): flag the delays or missed checkpoints
6. Fire the alert workflow when a delay is detected: SAP Workflow, or a custom notification through BCS
7. Correct the freight order ETA: /SCMTMS/CL_FO_BAPI=>CHANGE, passing the revised arrival time
8. Expose the visibility data to customers through an OData service

### Required MCP Tools
- `GetClass` — opens up the /SCMTMS/CL_TTE_BAPI event posting interface
- `CreateProgram` — puts together the GPS event receiver and processor
- `CreateServiceDefinition` — publishes the tracking OData service
- `GetTable` — reads out /SCMTMS/D_TTE (tracking events)

### Related Config
- TM-EM Integration: V_TMEM
- Tracking Events: V_TMTTE
- Expected Events: V_TMEE
