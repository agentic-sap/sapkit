/**
 * 텍스트풀(TPOOL) 행의 모양 — 쓰기 3종이 함께 쓴다.
 *
 * `ZSAPKIT_ADT_TEXTPOOL`의 WRITE는 **언제나 전량 교체**다(`INSERT TEXTPOOL`).
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

/**
 * 쓰기 셋(`WriteTextElementsBulk`·`CreateTextElement`·`UpdateTextElement`)의 설명 덧말 — D-152
 * (`harness/old-surface/amendments.json`과 글자까지 같아야 한다). 근거는 `harness/DIVERGENCES.md`
 * D160·D161이다.
 *
 * ① 기본 `odata` 통로는 풀 전체를 URL에 싣는다 — 한국어 수십 행이면 414(실사용 L-007).
 * ② 선택 텍스트(S)의 `ENTRY` 앞 8자는 SAP의 예약 영역이다(1자째 `D` = 사전 참조, 라벨은 9자째부터).
 *    엔진도 FM `ZSAPKIT_ADT_TEXTPOOL`도 `ENTRY`를 손대지 않으므로(`text` → `ENTRY` 그대로 ·
 *    `LENGTH = text.length` · `/ui2/cl_json=>deserialize` → `INSERT TEXTPOOL`) 그 8자는 호출자가
 *    넣어야 한다. 자동으로 채우지 않는다 — 동작 변경은 후보로만 둔다(D161).
 */
export const TEXT_POOL_WRITE_AMENDMENT =
  ' With the default OData RFC backend the whole text pool is sent in the request URL, so a pool with a few dozen non-ASCII (e.g. Korean) entries fails with HTTP 414 (URI too long); every write rewrites the whole pool, so splitting it into smaller calls does not help — write large pools through the abapGit ZIP (program XML: TPOOL, I18N_TPOOL) or a body-carrying RFC backend (soap, native, gateway, zrfc).' +
  " Selection texts (S) are stored exactly as sent: the first 8 characters of the text are SAP's reserved area (8 spaces for a plain label, or 'D' plus 7 spaces to take the text from the dictionary) and the label starts at position 9 — nothing is added for you, and the 132-character limit includes those 8 (in abapGit XML the area is the separate SPLIT field instead).";

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
