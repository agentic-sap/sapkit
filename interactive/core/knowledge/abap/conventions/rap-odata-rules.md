# RAP & OData Rules — Field-Verified Failure Modes

**Scope.** Companion to the [RAP/EML syntax reference](../reference/references/rap-eml.md) — that file says how to write RAP artifacts; this one lists the ways they fail **silently or misleadingly**. Every rule below was verified on an S/4HANA on-premise system (ABAP 7.57) in real project work; SAP-standard samples are cited where they settled the question. When a rule names an exact checker message, match on the message, not on guesswork.

## BDEF Authoring

**Anchor and masters (7.5x checker set).** The anchor CDS entity of a BDEF must be `define root view entity` — a non-root anchor is rejected at precheck (`... is not a root entity`). Declare `strict ( 2 )`; the checker then **forces** `lock master` and `authorization master ( global )` declarations, and the BIL needs two stubs to activate (`lock`, `get_global_authorizations`). Omitting `strict` activates but raises an ATC Prio-1 (`should be flagged as "strict"`). The warning `W333 READ/SAVER not implemented` does not block activation and may remain.

**Projection BDEF: `use etag` is NOT inherited.** A base BDEF's `etag master <field>` does **not** carry into a projection — the projection must state `use etag` itself (position: the line after `define behavior for <entity> alias <a>`, before the opening `{` — same slot as `etag master` in the base). Omission is completely silent: activation, syntax check, and ATC all pass, but `$metadata` emits `SAP__core.OptimisticConcurrency` as an empty `<Collection/>`, responses carry no `etag`, and If-Match / HTTP 412 optimistic locking never happens. Reference: SAP standard projection BDEF `C_BANKTP` (`use etag` on both entities).

**On-save triggers on a BO that does not expose `create`.** `validation ... on save { update; }` / `determination ... on save { update; }` is rejected (`The trigger "update" is only allowed in combination with "create" here.`). On an edit-only BO, use **field triggers** instead — `{ field f1, f2, ...; }`. Listing every editable field is semantically equivalent to an update trigger, and the handler signature (`FOR VALIDATE ON SAVE`) is independent of the trigger form, so the BIL needs no change.

**`managed ... with additional save` restricts saver hooks.** Only `save_modified` and `cleanup_finalize` can be redefined; redefining `cleanup` is rejected at precheck (`The method "CLEANUP" cannot be redefined ...`). Consequence to state explicitly when using shared handler↔saver buffers (`CLASS-DATA` etc.): `cleanup_finalize` covers only the normal-exit path, so buffer residue on the rollback/abort path is an **unclosable verification gap** in this form — closing it requires `unmanaged` (or `with unmanaged save`).

**Behavior pool identity.** Handler/saver locals derived from `CL_ABAP_BEHAVIOR_HANDLER` / `_SAVER` are only accepted inside a global class whose definition carries `FOR BEHAVIOR OF <bdef>`. A plain class shell — whatever its name — is rejected with `Local classes of "CL_ABAP_BEHAVIOR_HANDLER" can only be derived in ... a global BEHAVIOR class`; repair the class definition itself, don't fight the includes.

## CDS Artifacts

**SRVD accepts no comments.** A `//` line anywhere in a Service Definition fails precheck with `Comments are not supported and will be deleted on save`.

**DDLX (Metadata Extension): `@UI.facet` goes INSIDE the annotate block.** The only annotations allowed at entity level (outside `annotate view <e> with { ... }`) are `headerInfo` and `presentationVariant`. `@UI.facet` — nested or top-level — placed outside the block fails with `Annotation 'UI.facet.*' used at wrong position (wrong scope)`. Its correct slot is inside the block, **before the first element declaration** (SAP standard sample: `C_BANKTP` DDLX in `ODATA_BF_BANK_UI_MANAGE`). Also: an element listed in the block with **no annotation at all** is rejected (`must have at least one annotation`) — use `@UI.hidden: true` when you only need the element named. `annotate view` on a projection view entity is SAP-standard usage. Methodology note: an SAP sample that *lacks* a construct proves nothing about legality — judge a rejection by its error message, not by absence in one sample.

**Never pass conversion-exit fields straight through an OData-exposed view.** A field whose data element's domain carries a conversion exit (e.g. domain `KURSF` → exit `EXCRT`) makes Gateway metadata generation fail (`Do not use conversion exit ... here`, logged in `/IWBEP/ERROR_LOG`). Strip the DDIC reference with `cast( field as abap.dec( n, m ) )` (values are unchanged — verify once with a row-level comparison).

## OData Surface — Filtering and Metadata Judgment

**CHAR(1) flag fields map to `Edm.Boolean` by domain.** Gateway maps fields with domain `XFELD` or `X` to `Edm.Boolean`; a V2 `$filter` comparing them to a string literal (`eq ''`) fails with an Edm.Boolean type error — write `eq false` (blank ≡ false). The mapping is **per-domain, not per-ABAP-type**: another CHAR field whose domain is e.g. `BELNR` stays `Edm.String` and `eq ''` is valid there. Before writing filters, confirm the Edm type from `$metadata` (or the domain from `DD03L`).

**After changing annotations or a BDEF, clear the BACKEND cache before judging `$metadata`.** RAP local endpoints build their model in the backend, so `/IWBEP/CACHE_CLEANUP` is the one that matters — `/IWFND/CACHE_CLEANUP` (hub) alone shows **zero change** even when the fix landed. Run both. Diagnosis order when "$metadata didn't change": ① `DDANNOLOAD` (did the MDE merge?) → ② clear `/IWBEP/` + `/IWFND/` → ③ re-measure → ④ only then suspect the protocol surface. Skipping ② leads to re-suspecting correct code — field experience includes deleting and re-creating a healthy binding because of a stale cache.

**V4 UI annotations exist only under the `/srvd/` flavor — `/srvd_a2x/` omits them by design.** One binding serves two repositories whose URLs differ by a single path token:

```
.../sap/opu/odata4/sap/<srvb>/srvd/sap/<srvd>/0001/$metadata      ← UI flavor: UI.Facets, LineItem, SelectionFields, ... all emitted
.../sap/opu/odata4/sap/<srvb>/srvd_a2x/sap/<srvd>/0001/$metadata  ← A2X/API flavor: UI vocabulary absent (by design)
```

The schema namespace tells you which one you fetched (`...gateway.srvd....` vs `...gateway.srvd_a2x....`). Reading the A2X URL and concluding "annotations are missing" is a false diagnosis — and the observed RAP **V2** surface emits no UI vocabulary either (`sap:visible` absent even with `@UI.hidden` active; Fiori Elements consumption needs V4). When elimination keeps failing, put **"am I observing through the right instrument?"** on the candidate list.

**Binding contract (UI vs Web API) changes the real surface.** A `Web API` binding omits `Update_mc` / `sap:updatable-path` (row-level dynamic edit control), currency/UoM code lists, PDF/xlsx supported-formats, and value-help sets that a `UI` binding emits. The contract is visible as the Binding Type in the ADT header, or `srvb:category` in the binding XML (**0 = UI, 1 = Web API**). A `_UI` name suffix changes nothing. Don't judge publish state from IWSV entries in the package — Web API bindings leave none even when published.

## Publishing On-Premise (V4)

**The ADT publish button is not the only path — and in a Customizing client it is a blocked path.** `CL_RAP_SERVICE_BINDING_V4->publish_locally` refuses when the logon client's `T000-CCCATEGORY = 'C'` (message `RAP_SERVICES_ADT 021`, exception `publishing_in_custom_client`); unpublish is blocked the same way. That check exists **only in the ADT path**. The gateway transaction **`/IWFND/V4_ADMIN` → Publish Service Groups** (service group = the binding name, system alias `LOCAL`) performs the same underlying `publish_group` call without it — and per SAP Note 3101976 records to a customizing transport (ADT local publish creates a non-transportable local catalog entry), so the transaction is the **standard path**, not a workaround. V2 counterpart: `/IWFND/MAINT_SERVICE`. Related facts: a V4 service cannot be queried at all before publish (`/IWBEP/CM_V4_COS 014`); blocks are **layered** — client role is only one gate, an SCC4 change-recording restriction can still fail the publish underneath, so when a publish "is blocked", demand the exact message before concluding anything.
