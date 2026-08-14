/**
 * `dynpro_data` JSON을 ABAP `/ui2/cl_json=>deserialize`가 알아듣게 세운다.
 *
 * 참조 원본: `engine/src/lib/normalizeDynproData.ts:17-130` (다시 저작).
 *
 * ## 왜 필요한가 (구 머리주석 `:1-13`의 실측)
 *
 * ABAP은 JSON 키를 **대문자로** 구조 필드에 맞물린다. 호출자가 `metadata`나
 * `flow_logic` 같은 소문자 키를 보내면 ABAP이 조용히 무시하고, 그러면
 * `HEADER-PROGRAM`이 비어 TRDIR 조회가 실패해 `RPY_DYNPRO_INSERT`가
 * **subrc=3**으로 떨어진다. 그 조용한 실패를 막는 것이 이 손질의 전부다.
 *
 * ## 손질 넷
 *  1. 최상위 키를 정본 이름으로 옮긴다(`metadata`·`header` → `HEADER` …).
 *     표에 없는 키는 **대문자로만** 바꾼다.
 *  2. `HEADER`의 하위 키를 재귀로 전부 대문자로. `HEADER`가 없거나 객체가
 *     아니면 **빈 객체로 만든다** — 그래야 다음 걸음이 채울 자리가 생긴다.
 *  3. `HEADER.PROGRAM`·`HEADER.SCREEN`이 비어 있으면 호출 맥락에서 채운다.
 *  4. `FLOW_LOGIC`은 글이면 줄로 쪼개고, 배열이면 원소를 `{LINE: …}`으로 세운다.
 *
 * **JSON이 아니면 손대지 않고 그대로 돌려준다**(`:84-89`) — 오류 판정은 ABAP에
 * 맡긴다. 구의 선택이며, 여기서 앞질러 거절하면 구가 내던 SAP 쪽 문구가 사라진다.
 */

/** 알려진 별칭 → 정본 ABAP 키. */
const TOP_KEY_MAP: Readonly<Record<string, string>> = {
  header: 'HEADER',
  metadata: 'HEADER',
  containers: 'CONTAINERS',
  fields_to_containers: 'FIELDS_TO_CONTAINERS',
  flow_logic: 'FLOW_LOGIC',
  // 이미 정본인 것은 그대로 지나간다.
  HEADER: 'HEADER',
  CONTAINERS: 'CONTAINERS',
  FIELDS_TO_CONTAINERS: 'FIELDS_TO_CONTAINERS',
  FLOW_LOGIC: 'FLOW_LOGIC',
};

/** 객체·배열의 키를 재귀로 대문자로 바꾼다. */
function uppercaseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(uppercaseKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key.toUpperCase()] = uppercaseKeys(inner);
    }
    return out;
  }
  return value;
}

/** 흐름 로직을 `[{LINE: '…'}]` 모양으로 세운다. */
function normalizeFlowLogic(flowLogic: unknown): Array<{ LINE: string }> {
  if (typeof flowLogic === 'string') {
    return flowLogic.split('\n').map((line) => ({ LINE: line }));
  }
  if (Array.isArray(flowLogic)) {
    return flowLogic.map((entry) => {
      if (typeof entry === 'string') return { LINE: entry };
      if (entry !== null && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        return { LINE: String(record['LINE'] ?? record['line'] ?? record['Line'] ?? '') };
      }
      return { LINE: '' };
    });
  }
  return [];
}

/**
 * @param raw          호출자가 준 JSON 글 (소문자 키일 수 있다)
 * @param programName  `HEADER.PROGRAM`의 기본값 (대문자 프로그램 이름)
 * @param screenNumber `HEADER.SCREEN`의 기본값
 */
export function normalizeDynproData(
  raw: string,
  programName: string,
  screenNumber: string,
): string {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // JSON이 아니면 그대로 보낸다 — 오류 판정은 ABAP 몫이다.
    return raw;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    normalized[TOP_KEY_MAP[key] ?? key.toUpperCase()] = value;
  }

  const header =
    normalized['HEADER'] !== null && typeof normalized['HEADER'] === 'object'
      ? (uppercaseKeys(normalized['HEADER']) as Record<string, unknown>)
      : {};
  if (!header['PROGRAM']) header['PROGRAM'] = programName;
  if (!header['SCREEN']) header['SCREEN'] = screenNumber;
  normalized['HEADER'] = header;

  if (normalized['CONTAINERS']) normalized['CONTAINERS'] = uppercaseKeys(normalized['CONTAINERS']);
  if (normalized['FIELDS_TO_CONTAINERS']) {
    normalized['FIELDS_TO_CONTAINERS'] = uppercaseKeys(normalized['FIELDS_TO_CONTAINERS']);
  }
  if (normalized['FLOW_LOGIC'] !== undefined) {
    normalized['FLOW_LOGIC'] = normalizeFlowLogic(normalized['FLOW_LOGIC']);
  }

  return JSON.stringify(normalized);
}
