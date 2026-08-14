/**
 * 화면(dynpro) 읽기의 공통 조각 — `GetScreen`·`ReadScreen`이 함께 쓴다.
 *
 * ## 두 도구는 **같은 요청**을 보낸다 (실측)
 *
 * `engine/src/handlers/screen/high/handleGetScreen.ts:57-60`과
 * `engine/src/handlers/screen/readonly/handleReadScreen.ts:58-61`은 글자까지 같다:
 *
 * ```ts
 * await callDispatch(connection, 'DYNPRO_READ', { program: programName, dynpro: args.screen_number });
 * ```
 *
 * 와이어 정본은 `engine/src/lib/odataRfc.ts:288-327` —
 * `POST {service}/Dispatch?IV_ACTION='DYNPRO_READ'&IV_PARAMS='{"program":"…","dynpro":"…"}'`
 * 이고, `IV_PARAMS`는 **인자 객체를 그대로 JSON.stringify** 한 것이라 **키 순서가
 * 요청 바이트에 그대로 실린다**(`program` → `dynpro`).
 *
 * **화면 번호는 대문자로 올리지 않는다** — 프로그램 이름만 올린다. 구 두 핸들러
 * 모두 `args.screen_number`를 손대지 않고 넘긴다.
 *
 * ## 갈리는 것은 응답 조립뿐이다
 *
 * | | `GetScreen` | `ReadScreen` |
 * |---|---|---|
 * | 노출 집합 | `high` | `readonly` |
 * | 인자 검증 문구 | `Missing required parameters: program_name and screen_number` | `program_name and screen_number are required` |
 * | 응답의 여분 필드 | `type: 'DYNP'` · `steps_completed` | 없음 |
 * | 실패 문구 | `Failed to get screen: …` | 원문 그대로 |
 *
 * 이름을 바꾸지 않는다는 규약 때문에 둘 다 그대로 짓는다. 응답 필드의 **순서**가
 * 다르므로(구는 `type`을 `screen_number` 바로 뒤에 끼운다) 응답 객체는 각 도구가
 * 자기 자리에서 조립한다 — 여기서 합치면 직렬화 바이트가 달라진다.
 */

import type { RfcChannel } from '../../rfc';

/** `/ui2/cl_json=>serialize`는 필드 이름을 대문자로 남긴다. 소문자 갈래는 구의 방어다. */
function pick(result: unknown, upper: string, lower: string): unknown {
  const record = (result ?? {}) as Record<string, unknown>;
  return record[upper] ?? record[lower];
}

/** `DYNPRO_READ` 한 번. 인자 키 순서(`program` → `dynpro`)가 계약의 일부다. */
export function dispatchDynproRead(
  channel: RfcChannel,
  programName: string,
  screenNumber: string,
): ReturnType<RfcChannel['callDispatch']> {
  return channel.callDispatch('DYNPRO_READ', { program: programName, dynpro: screenNumber });
}

/**
 * 흐름 로직 줄들을 한 덩이 글로 접는다. 배열이 아니면 `null`이다 —
 * 빈 문자열이 아니라 `null`인 것이 구의 선택이다.
 */
export function flowLogicOf(result: unknown): string | null {
  const lines = pick(result, 'FLOW_LOGIC', 'flow_logic');
  if (!Array.isArray(lines)) return null;
  return lines
    .map((line) => {
      const record = (line ?? {}) as Record<string, unknown>;
      return String(record['LINE'] ?? record['line'] ?? '');
    })
    .join('\n');
}

/** 화면 머리 정보. 없으면 `null`. */
export function metadataOf(result: unknown): unknown {
  return pick(result, 'HEADER', 'header') ?? null;
}

/** 컨테이너 목록. 없으면 빈 배열. */
export function containersOf(result: unknown): unknown {
  return pick(result, 'CONTAINERS', 'containers') ?? [];
}

/** 필드↔컨테이너 대응. 없으면 빈 배열. */
export function fieldsToContainersOf(result: unknown): unknown {
  return pick(result, 'FIELDS_TO_CONTAINERS', 'fields_to_containers') ?? [];
}
