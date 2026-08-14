/**
 * 구조체 필드 명세 → DDIC `define structure` DDL.
 *
 * `CreateStructure`가 받는 `fields`/`includes`를 실제 DDL로 바꾸는 자리다. 구
 * 엔진의 `engine/src/lib/structureDdl.ts`를 읽어 다시 저작했다.
 *
 * **이 생성기가 존재하는 이유가 거짓 성공이다.** 그 전의 `CreateStructure`는
 * 필수 인자인 `fields`를 버리고 빈 껍데기만 만든 뒤 성공으로 보고했고, 되읽으면
 * 필드가 하나도 없었다. 그래서 여기서는 **명세가 불완전하면 아무것도 만들기
 * 전에 던진다** — 길이 없는 길이형 타입, `data_element`도 `data_type`도 없는
 * 필드, 표현할 수 없는 include suffix. 반쪽 오브젝트를 남기지 않는 것이 요점이다.
 *
 * 머리말은 언제나 `@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE`을 낸다 —
 * 그것이 없으면 DDIC이 구조체를 거부한다.
 */

export interface StructureDdlField {
  readonly name: string;
  readonly data_type?: string;
  readonly length?: number;
  readonly decimals?: number;
  readonly domain?: string;
  readonly data_element?: string;
  readonly structure_ref?: string;
  readonly table_ref?: string;
  readonly description?: string;
  /** CURR 필드: 통화 키를 담은 **이 구조체 안의** CUKY 필드 이름. */
  readonly currency_reference?: string;
  /** QUAN 필드: 단위를 담은 **이 구조체 안의** UNIT 필드 이름. */
  readonly unit_reference?: string;
}

export interface StructureDdlInclude {
  readonly name: string;
  readonly suffix?: string;
}

export interface StructureDdlInput {
  readonly structureName: string;
  readonly description?: string;
  readonly fields?: readonly StructureDdlField[];
  readonly includes?: readonly StructureDdlInclude[];
}

type BuiltinKind = 'len' | 'lendec' | 'none';

/** 길이·소수 자리를 받는지가 종류를 가른다. */
const BUILTIN_TYPES: Readonly<Record<string, { readonly ddl: string; readonly kind: BuiltinKind }>> = {
  CHAR: { ddl: 'abap.char', kind: 'len' },
  NUMC: { ddl: 'abap.numc', kind: 'len' },
  RAW: { ddl: 'abap.raw', kind: 'len' },
  UNIT: { ddl: 'abap.unit', kind: 'len' },
  STRING: { ddl: 'abap.string', kind: 'len' },
  DEC: { ddl: 'abap.dec', kind: 'lendec' },
  CURR: { ddl: 'abap.curr', kind: 'lendec' },
  QUAN: { ddl: 'abap.quan', kind: 'lendec' },
  DATS: { ddl: 'abap.dats', kind: 'none' },
  TIMS: { ddl: 'abap.tims', kind: 'none' },
  CUKY: { ddl: 'abap.cuky', kind: 'none' },
  INT1: { ddl: 'abap.int1', kind: 'none' },
  INT2: { ddl: 'abap.int2', kind: 'none' },
  INT4: { ddl: 'abap.int4', kind: 'none' },
  INT8: { ddl: 'abap.int8', kind: 'none' },
  FLTP: { ddl: 'abap.fltp', kind: 'none' },
};

function isPositiveLength(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** 필드 하나가 내는 줄들. 의미 주석이 있으면 필드 줄 **앞**에 온다. */
function renderField(field: StructureDdlField, structureNameLower: string): string[] {
  const fieldName = field?.name?.trim();
  if (!fieldName) throw new Error('A structure field is missing its required "name".');
  const nameLower = fieldName.toLowerCase();

  // 데이터 엘리먼트가 있으면 그것이 이긴다 — 길이·소수를 보지 않는다.
  const dataElement = field.data_element?.trim();
  if (dataElement) return [`  ${nameLower} : ${dataElement.toLowerCase()};`];

  const dataType = field.data_type?.trim();
  if (!dataType) {
    throw new Error(
      `Field "${fieldName}" cannot be expressed as DDL: provide "data_element" or a built-in ` +
        `"data_type" (with "length"/"decimals" where required). The generator does not infer a ` +
        `type from domain/structure_ref/table_ref.`,
    );
  }

  const key = dataType.toUpperCase();
  const def = BUILTIN_TYPES[key];
  if (!def) {
    throw new Error(
      `Field "${fieldName}": unsupported data_type "${dataType}". Use a data_element, or one of: ${Object.keys(
        BUILTIN_TYPES,
      ).join(', ')}.`,
    );
  }

  let typeExpr: string;
  if (def.kind === 'none') {
    typeExpr = def.ddl;
  } else {
    if (!isPositiveLength(field.length)) {
      throw new Error(`Field "${fieldName}": data_type ${key} requires a positive "length".`);
    }
    typeExpr =
      def.kind === 'lendec' ? `${def.ddl}(${field.length},${field.decimals ?? 0})` : `${def.ddl}(${field.length})`;
  }

  const lines: string[] = [];
  if (key === 'CURR' && field.currency_reference?.trim()) {
    lines.push(
      `  @Semantics.amount.currencyCode : '${structureNameLower}.${field.currency_reference.trim().toLowerCase()}'`,
    );
  } else if (key === 'QUAN' && field.unit_reference?.trim()) {
    lines.push(
      `  @Semantics.quantity.unitOfMeasure : '${structureNameLower}.${field.unit_reference.trim().toLowerCase()}'`,
    );
  }
  lines.push(`  ${nameLower} : ${typeExpr};`);
  return lines;
}

/**
 * 명세를 DDL로 만든다. **불완전하면 던진다** — SAP에 아무것도 만들기 전에.
 */
export function generateStructureDdl(input: StructureDdlInput): string {
  const structureName = input?.structureName?.trim();
  if (!structureName) throw new Error('structureName is required to generate structure DDL.');
  const structureNameLower = structureName.toLowerCase();

  const fields = input.fields ?? [];
  const includes = input.includes ?? [];
  if (fields.length === 0 && includes.length === 0) {
    throw new Error('At least one field or include is required to generate structure DDL.');
  }

  const bodyLines: string[] = [];
  for (const field of fields) bodyLines.push(...renderField(field, structureNameLower));
  for (const include of includes) {
    const includeName = include?.name?.trim();
    if (!includeName) throw new Error('An include entry is missing its required "name".');
    if (include.suffix?.trim()) {
      throw new Error(
        `Include "${includeName}": a "suffix" cannot be expressed in generated DDL; include the structure without a suffix.`,
      );
    }
    bodyLines.push(`  include ${includeName.toLowerCase()};`);
  }

  const header: string[] = [];
  const description = input.description?.trim();
  if (description) header.push(`@EndUserText.label : '${description.replace(/'/g, "''")}'`);
  header.push('@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE');
  header.push(`define structure ${structureNameLower} {`);

  return [...header, ...bodyLines, '}'].join('\n');
}
