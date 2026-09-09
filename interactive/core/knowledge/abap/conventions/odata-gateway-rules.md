# SEGW / Gateway OData Rules — Code-Declared Models

**Scope.** Service Builder (SEGW) OData services on an on-premise Gateway. This is a different generation from the RAP services covered by [`rap-odata-rules.md`](rap-odata-rules.md) — different model API, different failure messages, different cache. Where the object under work is a Behavior Definition, a Service Definition, or a Service Binding, that file applies and this one does not. Everything below was field-verified in real project work on an on-premise system (2026-09) against a single service; wherever an item rests on one observation or on inference, this file says so.

## The Model Belongs in Code, Not Only in the GUI

**SEGW's Entity Types, Complex Types, Associations, and Navigation Properties can all be declared in ABAP** — the belief that they can only be drawn in the Service Builder GUI is wrong, and it is worth checking rather than assuming, because it decides the shape of the whole work plan. A workable division of labour: create an **empty** project and run *Generate Runtime Objects* in the GUI, then declare the entire model in `DEFINE` of the generated `..._MPC_EXT` class. A service built that way — five complex types, three entity types, two associations, roughly two hundred properties — has been driven end to end, serving `$metadata` and returning real data from a `POST`. The only GUI steps were project creation, *Generate Runtime Objects*, and registration in `/IWFND/MAINT_SERVICE`.

The API surface, read off the interfaces themselves:

- `/IWBEP/IF_MGW_ODATA_MODEL` — `CREATE_ENTITY_TYPE( iv_entity_type_name, iv_def_entity_set )`, `CREATE_COMPLEX_TYPE`, `CREATE_ASSOCIATION`, `CREATE_ASSOCIATION_SET`, `CREATE_ACTION`, `GET_ENTITY_TYPE`, `SET_SCHEMA_NAMESPACE`, `EXTEND_MODEL`, `INCLUDE_MODEL_BY_NAME`
- `/IWBEP/IF_MGW_ODATA_ENTITY_TYP` — `CREATE_PROPERTY`, `CREATE_CMPLX_TYPE_PROPERTY`, `CREATE_ENTITY_SET`, `CREATE_NAVIGATION_PROPERTY`, `BIND_STRUCTURE`, `ADD_AUTO_EXPAND_INCLUDE`
- `/IWBEP/IF_MGW_ODATA_CMPLX_TYPE` — the same shape plus `CREATE_CMPLX_TYPE_PROP`

**The entity-type interface does not include the complex-type interface** (only `ANNOTATABL` and `ITEM`), so a helper meant to serve both has to take the generated `/IWBEP/IF_MGW_ODATA_PROPERTY` as its parameter rather than the owning type.

**Association cardinality is passed as the character literals `'0'` and `'M'`.**

```abap
model->create_association( iv_association_name  = 'ass_item'
                           iv_left_type         = 'head'
                           iv_right_type        = 'item'
                           iv_left_card         = '0'
                           iv_right_card        = 'M'
                           iv_def_assoc_set     = abap_false ).
model->create_association_set( iv_association_set_name  = 'ass_itemSet'
                               iv_left_entity_set_name  = 'headSet'
                               iv_right_entity_set_name = 'itemSet'
                               iv_association_name      = 'ass_item' ).
lo_entity_type->create_navigation_property( iv_property_name    = 'ET_ITEM'
                                            iv_abap_fieldname   = 'ET_ITEM'
                                            iv_association_name = 'ass_item' ).
```

**SEGW's DDIC import is code generation, not runtime expansion.** For every field it emits `create_property( )` + `set_type_edm_*( )` + `set_maxlength( )` + `set_conversion_exit( )` and a handful of `set_*( abap_false )` calls; importing a structure of roughly a hundred fields produces well over a thousand lines. `ADD_AUTO_EXPAND_INCLUDE` exists on the interface but was found unused across every generated artifact inspected — whether it expands a DDIC structure into properties on its own is **untested**.

**Generated model code does not survive being copied verbatim into another class.** It calls `set_label_from_text_element( iv_text_element_symbol = '001' iv_text_element_container = gc_incl_name )`, and both `gc_incl_name` and the text symbols belong to the generating class. The calls only supply labels, so removing them costs nothing functionally.

## Date and Time Properties Must Be Nullable

**Declare every `Edm.DateTime` / `Edm.Time` property with `set_nullable( abap_true )`.** The initial ABAP date `00000000` is not a representable `Edm.DateTime`, so the failure happens while the **response** is being written rather than while the request is being read: `/IWCOR/CX_DS_EDM_FACET_ERROR` out of the EDM writer (`/IWCOR/CL_DS_EP_WRITER_XML`), naming the property, `FACET: nullable=false`, and `VALUE: 00000000`. What SEGW's DDIC import generates is `set_nullable( abap_false )` on every property, so the trap is armed by default. With nullable on, the field goes out as `<d:Field m:null="true"/>`.

**Every date field the request does not carry is a live one.** A deep-entity service returns the whole structure whatever was sent, so a date the caller never touched is exactly the field that brings the response down. Filling an empty date with `sy-datum` to get past this is a workaround, not a fix — nullable is the fix. (Character and numeric initial values — `''`, `0` — are valid values and were left non-nullable without incident. An initial value carrying a **conversion exit** has not been exercised.)

## maxLength Is the External Length After Conversion

**Where `bind_structure( iv_bind_conversions = abap_true )` is in force, `set_maxlength( )` takes the length of the *converted, externally visible* representation — not the DDIC length.** A facet violation reports the same way the date failure does: the EDM writer rejects the property's value against the declared facet. Measured cases — `TIMS` renders as `HH:MM:SS` and needs **8**; a period field renders as `MM/YYYY` and needs **7**; a language field converted through `ISOLA` needs **2**; a field written out through an edit mask needs the mask's length, separators included. Take the length from the converted form, and confirm it against `$metadata` wherever the field has decimal places — the rule for decimal types was inferred from neighbouring fields, not measured.

## Runtime and Cache

**A `GET` against an entity set whose `GET_ENTITYSET` is not implemented raises a 500 short dump** (`/IWBEP/IF_MGW_APPL_SRV_RUNTIME~GET_ENTITYSET`). For a POST-only deep-entity service that is correct behaviour, but it does pollute the error log — expect it rather than chasing it.

**Clear the hub cache after every model change** — `/IWFND/CACHE_CLEANUP`. Skip it and the backend reports `Metadata cache on hub system for current model is outdated`. Note which cache this is: a **RAP** local endpoint builds its model in the backend, so `/IWBEP/CACHE_CLEANUP` is needed there as well — that section says to run both — which is why the two generations have different diagnosis orders; see [`rap-odata-rules.md`](rap-odata-rules.md) § *OData Surface — Filtering and Metadata Judgment*.
