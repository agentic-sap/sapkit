/**
 * 텍스트풀(TPOOL) 행의 모양 — 쓰기 3종이 함께 쓴다.
 *
 * `ZMCP_ADT_TEXTPOOL`의 WRITE는 **언제나 전량 교체**다(`INSERT TEXTPOOL`).
 * 그래서 한 행을 더하거나 고치려면 먼저 READ로 전량을 읽어 손본 뒤 전량을 도로
 * 써야 한다 — 구 핸들러 셋이 모두 그 모양이다
 * (`engine/src/handlers/text_element/high/handleCreateTextElement.ts:167-209` ·
 * `handleUpdateTextElement.ts:156-189` · `handleWriteTextElementsBulk.ts:220-249`).
 *
 * 필드 이름을 대문자로 세우는 것은 `/ui2/cl_json=>deserialize`가 대문자 키만
 * ABAP 구조 필드에 맞물리기 때문이다. 소문자 갈래(`r.id` …)를 함께 보는 것은
 * 구의 방어이며 그대로 옮긴다.
 */

/** 최대 텍스트 길이 — 구 세 핸들러의 `MAX_ENTRY_LEN`. */
export const MAX_ENTRY_LEN = 132;

export interface TpoolRow {
  ID: string;
  KEY: string;
  ENTRY: string;
  LENGTH: number;
}

/** READ가 돌려준 것을 대문자 필드의 행 배열로 세운다. 배열이 아니면 빈 배열이다. */
export function normalizeTpoolRows(fetched: unknown): TpoolRow[] {
  const rows = Array.isArray(fetched) ? fetched : [];
  return rows.map((raw) => {
    const record = (raw ?? {}) as Record<string, unknown>;
    return {
      ID: String(record['ID'] ?? record['id'] ?? '').toUpperCase(),
      KEY: String(record['KEY'] ?? record['key'] ?? ''),
      ENTRY: String(record['ENTRY'] ?? record['entry'] ?? ''),
      LENGTH: Number(record['LENGTH'] ?? record['length'] ?? 0),
    };
  });
}

/** 구 `keyMatches` — 양끝 공백을 떼고 대문자로 견준다. */
export function keyMatches(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}
