/**
 * CUA(SAP GUI 상태) 자료의 모양·검증 — `UpdateGuiStatus`·`PatchGuiStatus`가 쓴다.
 *
 * 참조 원본: `engine/src/lib/cuaSchema.ts:34-301` (다시 저작).
 *
 * ## 왜 검증이 여기 있나 (구 머리주석 `:5-8`·`:13-17`의 실측)
 *
 * `RS_CUA_INTERNAL_WRITE`는 프로그램의 GUI 상태 정의를 **통째로, 원자적으로**
 * 갈아엎는다 — 표 하나가 빠지면 그 표가 비고, 행의 칸이 빠지면 그 칸이 빈다.
 * 그래서 "반쯤 쓰다 만 JSON을 보내 운영 GUI 상태가 날아가는" 실패가 가능하고,
 * 그것을 **SAP에 나가기 전에** 막는 것이 `validateCuaData`의 존재 이유다.
 *
 * ## 12개 표
 *
 *   ADM(머리) · STA(상태) · FUN(기능코드) · MEN(메뉴) · MTX(메뉴 텍스트) ·
 *   ACT(액션) · BUT(툴바 버튼) · PFK(F키) · SET(설정) · DOC(문서) ·
 *   TIT(제목) · BIV(비활성 버튼)
 *
 * `ADM`만 객체이고 나머지 열하나는 배열이다.
 */

export interface CuaData {
  ADM?: Record<string, unknown>;
  STA?: Array<Record<string, unknown>>;
  FUN?: Array<Record<string, unknown>>;
  MEN?: Array<Record<string, unknown>>;
  MTX?: Array<Record<string, unknown>>;
  ACT?: Array<Record<string, unknown>>;
  BUT?: Array<Record<string, unknown>>;
  PFK?: Array<Record<string, unknown>>;
  SET?: Array<Record<string, unknown>>;
  DOC?: Array<Record<string, unknown>>;
  TIT?: Array<Record<string, unknown>>;
  BIV?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** 배열로 오는 열한 표. `ADM`은 여기 없다. */
const CUA_TABLES = [
  'STA',
  'FUN',
  'MEN',
  'MTX',
  'ACT',
  'BUT',
  'PFK',
  'SET',
  'DOC',
  'TIT',
  'BIV',
] as const;

/**
 * 글이든 객체든 받아 정규화한다.
 *
 * **최상위 키만 대문자로 옮긴다**(`:129-133`) — 행 안의 칸 이름은 그대로 둔다.
 * ABAP `/ui2/cl_json=>deserialize`가 DDIC 칸 이름에 맞물리는 일은 SAP 안에서
 * 일어나므로 여기서 손대면 오히려 어긋난다.
 */
export function normalizeCuaInput(input: unknown): CuaData {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input) as unknown;
    } catch (error) {
      throw new Error(
        `cua_data is a string but is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('cua_data must be a JSON object (or a JSON string of one)');
  }

  const normalized: CuaData = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const upper = key.toUpperCase();
    if (upper === 'ADM') {
      normalized.ADM = (value ?? {}) as Record<string, unknown>;
    } else if ((CUA_TABLES as readonly string[]).includes(upper)) {
      if (!Array.isArray(value)) {
        throw new Error(`cua_data.${upper} must be an array, got ${typeof value}`);
      }
      normalized[upper] = value;
    } else {
      // 모르는 키는 **원문 그대로** 남긴다 — 대문자로 올리지 않는다.
      normalized[key] = value;
    }
  }
  return normalized;
}

export interface CuaValidationProblem {
  readonly table: string;
  readonly rowIndex?: number;
  readonly field?: string;
  readonly message: string;
}

/**
 * 표별 필수 칸 검사 + 상호참조 경고.
 *
 * 필수 칸(`:190-194`): STA.CODE · FUN.CODE · PFK.{CODE,PFNO,FUNCODE} ·
 * BUT.{PFK_CODE,CODE,NO,PFNO} · TIT.CODE.
 *
 * 상호참조 둘(`:196-231`)은 **PFK가 실제로 실렸을 때만** 본다 — PFK를 아예 안
 * 보낸 부분 페이로드에서 없는 참조를 탓하지 않으려는 것이다. 이 둘의 `field`가
 * `PFKCODE`·`PFK_CODE`이고, 도구 계층이 그 이름으로 **경고와 오류를 가른다.**
 */
export function validateCuaData(data: CuaData): CuaValidationProblem[] {
  const problems: CuaValidationProblem[] = [];

  const requireFields = (
    table: string,
    rows: Array<Record<string, unknown>> | undefined,
    fields: readonly string[],
  ): void => {
    if (!rows) return;
    rows.forEach((row, index) => {
      for (const field of fields) {
        const value = (row ?? {})[field];
        if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
          problems.push({
            table,
            rowIndex: index,
            field,
            message: `${table}[${index}] is missing required field "${field}"`,
          });
        }
      }
    });
  };

  requireFields('STA', data.STA, ['CODE']);
  requireFields('FUN', data.FUN, ['CODE']);
  requireFields('PFK', data.PFK, ['CODE', 'PFNO', 'FUNCODE']);
  requireFields('BUT', data.BUT, ['PFK_CODE', 'CODE', 'NO', 'PFNO']);
  requireFields('TIT', data.TIT, ['CODE']);

  if (Array.isArray(data.STA) && Array.isArray(data.PFK) && data.PFK.length > 0) {
    const pfkCodes = new Set(data.PFK.map((row) => row['CODE']));
    data.STA.forEach((row, index) => {
      const code = row['PFKCODE'];
      if (code && !pfkCodes.has(code)) {
        problems.push({
          table: 'STA',
          rowIndex: index,
          field: 'PFKCODE',
          message: `STA[${index}].PFKCODE="${String(code)}" has no matching PFK.CODE row — the F-keys will be empty for status ${String(row['CODE'])}`,
        });
      }
    });
  }

  if (Array.isArray(data.BUT) && Array.isArray(data.PFK) && data.PFK.length > 0) {
    const pfkCodes = new Set(data.PFK.map((row) => row['CODE']));
    data.BUT.forEach((row, index) => {
      if (!pfkCodes.has(row['PFK_CODE'])) {
        problems.push({
          table: 'BUT',
          rowIndex: index,
          field: 'PFK_CODE',
          message: `BUT[${index}].PFK_CODE="${String(row['PFK_CODE'])}" has no matching PFK.CODE — toolbar button will not resolve to a function`,
        });
      }
    });
  }

  return problems;
}

/**
 * 상호참조 경고를 뺀 **막아야 할** 문제들.
 *
 * 구 두 핸들러가 같은 필터를 쓴다(`handleUpdateGuiStatus.ts:110-112` ·
 * `handlePatchGuiStatus.ts:174-176`) — 상호참조는 부분 페이로드에서 흔히
 * 걸리므로 경고로만 남긴다.
 */
export function hardProblems(problems: readonly CuaValidationProblem[]): CuaValidationProblem[] {
  return problems.filter((problem) => problem.field !== 'PFKCODE' && problem.field !== 'PFK_CODE');
}

/**
 * RFC에 실을 글로 접는다.
 *
 * 구가 이 한 겹을 둔 이유(`handleUpdateGuiStatus.ts:166-169`): ABAP은 JSON 글
 * 하나를 받는데, 정규화된 객체를 **여기서** 직렬화해야 호출자가 글을 줬든
 * 객체를 줬든 같은 바이트가 나간다.
 */
export function serializeCuaForRfc(data: CuaData): string {
  return JSON.stringify(data);
}
