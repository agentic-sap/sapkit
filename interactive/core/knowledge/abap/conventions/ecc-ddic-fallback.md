# ECC DDIC Fallback

**Scope.** A shared rule, not a skill-local one. It binds every SAPKIT flow whose pipeline can reach the creation of a Dictionary object, and it covers exactly three object types: **Table**, **Data Element**, and **Domain**.

Flows that consume it today:

- [create-object](../../../procedures/create-object.md)
- [create-program](../../../procedures/create-program.md)

Any other flow that creates — or may create — one of the three types is bound by this rule as well, whether or not it is listed above.

## 1. Does the fallback branch trigger?

Both conditions must hold:

1. `SAP_VERSION` — read from `.sapkit/config.json` or `sap.env` — equals `ECC`.
2. The flow needs to create an object of type **Table**, **Data Element**, or **Domain**.

Anything outside that intersection stays on the normal path:

- **Other object types on ECC** — Class, Program, Function Module, Structure, CDS View, and the rest — go through the standard MCP create flow, unchanged.
- **S/4HANA** — always the standard flow, for every object type including the three above.

## 2. Why the branch exists

On ECC the ADT REST API exposes no DDIC object endpoints; there is no source-based DDIC representation. `CreateTable`, `CreateDataElement`, and `CreateDomain` therefore fail outright.

What replaces it is a **program-generation fallback**. Instead of creating the DDIC object, the agent writes an executable ABAP report into `$TMP`. When the user runs that report in SE38, the report creates the DDIC object by calling the SAP-internal `DDIF_*_PUT` function modules. Those write the **inactive version only**. Activation and transport assignment stay with the user, done by hand in SE11.

So the agent's deliverable is a generator, and the DDIC object itself remains uncreated until the user acts.

## 3. Naming the helper program

The generator carries a **Y** prefix on purpose: it keeps helper generators visibly distinct from the `Z*` objects they target.

| DDIC target | Generator program |
|---|---|
| Table `Z<NAME>` | `YCREATE_<NAME>` |
| Data Element `Z<NAME>` | `YCREATE_DTEL_<NAME>` |
| Domain `Z<NAME>` | `YCREATE_DOMA_<NAME>` |

If the assembled name runs past **30 characters**, shorten the `<NAME>` segment only. The prefix and the type tag stay intact.

## 4. Generating the source (strict)

Each of the three target types has one reference template, and the generated report must mirror it one-to-one:

| Target type | Template |
|---|---|
| Table | [table_create_sample.abap](../templates/ecc/table_create_sample.abap) |
| Domain | [domain_create_sample.abap](../templates/ecc/domain_create_sample.abap) |
| Data Element | [element_create_sample.abap](../templates/ecc/element_create_sample.abap) |

"Mirror one-to-one" means the generated report keeps all of the following from its template:

- the same header block,
- the same `p_dryrun` checkbox with default `'X'`,
- the same `DEFINE ... END-OF-DEFINITION` helper macros,
- the same preview / `WRITE` section,
- the same `DDIF_*_PUT` exception list,
- the same closing line, `Next steps: open SE11 -> activate -> assign to transport.`

**Read the matching template with `Read` on every run.** Then substitute only these three things:

1. the target object name,
2. the DDIC field list / fixed values / label texts,
3. the `ddtext` description.

Do not refactor the skeleton.

## 5. Hard limits on the generated program

- **Package is `$TMP`, always.** The helper is a one-shot developer utility, not a deliverable.
- **Never assign it to a transport.**
- **Never let the program activate the DDIC object.** It performs the PUT and stops: no `DDIF_*_ACTIVATE` call, no `TR_OBJECTS_INSERT` call.

## 6. Reporting back

When this fallback triggers, the completion message is mandatory and takes this form:

```
⚠ ECC detected — DDIC {Table|Data Element|Domain} cannot be created via MCP.
Helper program generated instead:
  Program : <HELPER_NAME>           (package $TMP, activated)
  Target  : <DDIC_OBJECT_NAME>      ({type})

Next steps (manual, in ECC):
  1. SE38 → run <HELPER_NAME>                 (dry-run previews field layout)
  2. Uncheck p_dryrun → re-run                (writes inactive DDIC version)
  3. SE11 → open <DDIC_OBJECT_NAME>           (activate, assign package + transport)
```

Two prohibitions go with it:

- **Do not claim the DDIC object is created.** It is not, and it will not be until the user completes step 3.
- **Do not propose follow-up automation** until the user confirms activation in SE11.
