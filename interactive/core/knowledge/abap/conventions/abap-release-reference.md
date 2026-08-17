# ABAP Release Reference

The configured ABAP release is a hard ceiling on the syntax an agent may emit. Agents MUST NOT emit features newer than the configured `ABAP_RELEASE` in `.sapkit/config.json` (or `sap.env`) — crossing that ceiling causes activation failures on the target system.

This file is the inventory behind that ceiling: where the release value comes from, what each release band may reach for, which release first carried a given feature, and what to write instead when a feature sits above the ceiling.

---

## 1. Resolve the release before writing anything

The release value is the input to every other section here, so it comes first.

- Read the configured ABAP release — `ABAP_RELEASE` in `.sapkit/config.json` (or `sap.env`); the same setting appears in project context as `abapRelease`.
- If `ABAP_RELEASE` is unset, fail safe: do not guess a release and do not generate code. Ask the user to run the profile setup ([troubleshooting](../../../procedures/troubleshooting.md)) first.

---

## 2. Decision rules — what each release band allows

With the release in hand, this table is the operational answer for most code. Pick the row the configured release falls into.

| Target release | Use | Avoid |
|----------------|-----|-------|
| `< 740` | `DATA` declarations up front, `CREATE OBJECT`, `MOVE-CORRESPONDING`, classic `READ TABLE` | Any inline declaration or constructor expression |
| `= 740 … 749` | Inline declarations, `VALUE`/`NEW`/`CORRESPONDING`, table expressions, string templates | `FOR`/`FILTER`, Open SQL expressions, RAP |
| `= 750 … 753` | All of above + Open SQL expressions, CDS views, `GROUP BY` on itab | RAP/EML, `FINAL` classes |
| `= 754 … 755` | All of above + RAP (managed/unmanaged), `FINAL`, EML | ABAP Cloud-only restrictions |
| `≥ 756` on-prem | Full modern syntax | — |
| `≥ 756` cloud (ABAP Cloud) | Only released APIs, CDS, and BAdIs (C1 tier) | Any unreleased table/FM/BAPI |

Aim at the top of the band, not the bottom: always prefer the most modern syntax allowed by the target release, and do not downgrade working modern code for stylistic reasons.

---

## 3. Feature matrix — the release each feature arrives in

Reach for this when the band table is not specific enough about one feature. Read every entry in one direction: the feature is off limits whenever the configured release is lower than the number beside it.

**Floor marker** — at **702 (7.02)**, `READ TABLE ... ASSIGNING FIELD-SYMBOL(<fs>)` is not yet available.

### 3.1 Core language and expressions

| Feature | Available from |
|---------|----------------|
| Inline declarations (`DATA(lv_x)`, `FIELD-SYMBOL(<fs>)`) | 740 |
| Constructor expressions (`NEW`, `VALUE`, `CORRESPONDING`, `CONV`, `CAST`, `REF`, `EXACT`, `COND`, `SWITCH`) | 740 |
| Table expressions (`itab[ key ]`) | 740 |
| String templates (`\|{ var }\|`) | 740 |
| Chained method calls | 740 |
| `FOR` expressions in VALUE/REDUCE | 741 |
| `FILTER` | 741 |
| Meshes | 741 |
| `MOVE-CORRESPONDING` for deep structures | 741 |
| `ASSERT` with boolean expressions | 741 |
| `RANGES` via `VALUE FOR` | 750 |
| `ENUM` types | 751 |
| `GROUP BY` in internal tables | 751 |
| `LOOP AT ... GROUP BY` | 751 |
| `CORRESPONDING` with mapping | 752 |
| Virtual sorting of itab | 752 |
| `FINAL` classes | 754 |
| `ABAP_BOOL`→`ABAP_BOOLEAN` | 756 |

### 3.2 ABAP SQL

| Feature | Available from |
|---------|----------------|
| Open SQL expressions (CASE, CAST, COALESCE in SELECT) | 750 |
| ABAP SQL `LITERAL` | 755 |
| Local ABAP types in ABAP SQL | 756 |
| ABAP SQL `CROSS JOIN` | 757 |
| `INNER/LEFT OUTER MANY TO MANY` | 757 |
| ABAP SQL `REPLACE` | 758 |
| `INITCAP` | 758 |
| New aggregate functions | 758 |

### 3.3 CDS

| Feature | Available from |
|---------|----------------|
| CDS view annotations | 750 |
| CDS view extensions | 751 |
| Virtual elements in CDS | 751 |
| CDS access control (DCL) | 752 |
| CDS metadata extensions (DDLX) | 752 |
| ABAP CDS table functions (AMDP) | 753 |
| `@Environment.systemField` in CDS | 755 |
| Virtual elements with managed calculations | 755 |
| Stricter CDS syntax | 756 |

### 3.4 RAP and EML

| Feature | Available from |
|---------|----------------|
| `READ ENTITIES` (RAP preview) | 753 |
| **ABAP RESTful Application Programming (RAP)** — behavior definitions | 754 |
| EML (`MODIFY ENTITIES`, `READ ENTITIES`) | 754 |
| RAP managed/unmanaged scenarios | 755 |
| Draft handling | 755 |
| RAP side effects | 757 |
| Privileged mode in RAP | 757 |
| RAP late numbering | 758 |
| Background processing in RAP | 758 |

### 3.5 Platform, APIs, and tooling

| Feature | Available from |
|---------|----------------|
| ABAP Channels (AMC/APC) | 750 |
| Released APIs (whitelist) | 753 |
| ABAP unit test `CL_ABAP_TESTDOUBLE` enhancements | 753 |
| **ABAP Cloud Development Model** | 756 |
| Tier-1/tier-2 APIs | 756 |

---

## 4. When a feature sits above the ceiling

Do not drop the requirement — swap the idiom. Concrete before/after code for each release feature, modern form paired with its pre-release rewrite, lives in the companion file **[abap-release-examples.md](abap-release-examples.md)** (subsections 2.1 – 2.9). Go there whenever the matrix puts a feature out of reach, and whenever choosing between a modern and a legacy idiom for a given `ABAP_RELEASE`.

---

## 5. Checklist before emitting ABAP

1. Have I read `ABAP_RELEASE` from config? If not → stop and ask the user.
2. Is any feature I am about to emit newer than `ABAP_RELEASE`? If yes → rewrite it to the older idiom in [abap-release-examples.md](abap-release-examples.md).
3. Is `SAP_SYSTEM_TYPE=cloud`? If yes → every `SELECT`/`CALL FUNCTION`/`CALL METHOD` must target a **released** API (check `GetPackage` or released annotations).
4. Have I put a `TRY...CATCH` around operations that raise class-based exceptions? (RAP, CDS read, reference conversion.)
5. Have I avoided `SELECT *` in favor of named fields?
