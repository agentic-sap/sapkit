/**
 * RFC 대리자 통로의 도구쪽 접근점 — `ZMCP_ADT_DISPATCH` · `ZMCP_ADT_TEXTPOOL`.
 *
 * ## 왜 여기 있나
 *
 * 구 엔진은 이 두 대리자를 **모듈 전역**(`engine/src/lib/rfcBackend.ts:76-77`의
 * `callDispatch`·`callTextpool`)으로 노출했고, 핸들러는 성격(읽기·쓰기)과
 * 무관하게 그 하나를 불렀다. 신 엔진의 통로는 `src/rfc`가 소유하지만 **통로
 * 하나를 어디에 두고 몇 번 세우느냐**는 도구 계층의 문제다. 그래서 그 결정만
 * 여기 한 자리에 모은다 — 텍스트풀·화면·GUI 상태 묶음의 읽기 6종이 이 폴더에
 * 살고, 같은 대리자를 쓰는 쓰기 8종(`../write/`)이 여기서 가져다 쓴다.
 * (폴더를 가로지르는 import는 이 트리의 선례다 —
 * `src/tools/write/tableStructureWrite.ts`가 `../read/internal/adt`를 가져온다.)
 *
 * ## 통로를 컨텍스트당 하나만 세우는 이유
 *
 * `odata` 통로는 첫 호출에서 `$metadata`로 CSRF 토큰을 긁어 와 캐시한다. 통로를
 * 호출마다 새로 세우면 그 악수가 호출마다 한 번씩 더 붙는다. 구 엔진은 같은
 * 캐시를 모듈 전역에 두었다(`engine/src/lib/odataRfc.ts`의 `cachedSession`).
 * 컨텍스트는 서버 하나당 하나이므로(`src/server/core.ts:220-221`) 이 WeakMap이
 * 구의 전역 캐시와 같은 수명을 준다 — 전역 상태를 만들지 않으면서.
 * `src/tools/rfc-read/ddicRead.ts`의 `bridges`가 같은 이유로 같은 모양이다.
 */

import type { ConnectionConfig } from '../../contracts';
import { createRfcChannel, mergeRfcEnv } from '../../rfc';
import type { RfcChannel } from '../../rfc';
import type { ToolContext } from '../../server/toolDefinition';

const channels = new WeakMap<ToolContext, RfcChannel>();

/**
 * RFC 통로가 쓸 접속 설정.
 *
 * 무프로파일 기동에서는 `getConnection()`이 **정본 오류**(`ERR_NO_CONNECTION`)로
 * 던진다. 그 문구는 서버 코어가 소유하므로 여기서 다시 지어내지 않는다 — 뒤의
 * throw는 그 계약이 깨졌을 때를 위한 방어이고, 조용히 성공하지 않기 위한 것이다.
 */
export async function requireConnection(context: ToolContext): Promise<ConnectionConfig> {
  const connection = context.profile.connection;
  if (connection) return connection;
  await context.getConnection();
  throw new Error('ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured.');
}

/** 이 컨텍스트의 RFC 통로. 처음 부를 때 세우고 그 뒤로는 같은 것을 준다. */
export async function rfcChannelFor(context: ToolContext): Promise<RfcChannel> {
  const cached = channels.get(context);
  if (cached) return cached;
  const connection = await requireConnection(context);
  // 통로 선택·필수 env 확인은 여기서 끝난다. 실패하면 캐시하지 않는다.
  const channel = createRfcChannel({ connection, env: mergeRfcEnv({}, context.env) });
  channels.set(context, channel);
  return channel;
}
