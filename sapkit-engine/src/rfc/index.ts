/**
 * RFC 분배층의 공개 표면.
 *
 * 상위 계층(RFC 경유 도구들)은 **여기서만** 가져다 쓴다. 어느 통로가 골라졌는지
 * 도구가 알 필요는 없고, 알아서도 안 된다 — 통로별 분기가 도구 안으로 새면
 * 나머지 네 경로를 붙일 때마다 도구를 다시 손대야 한다.
 */

import { RfcError } from './errors';
import { createODataChannel } from './odata';
import { IMPLEMENTED_RFC_BACKENDS, selectRfcBackend } from './select';
import type { RfcBackendName, RfcChannel } from './types';

export { RfcError, rfcKindFromStatus } from './errors';
export type { RfcErrorInit, RfcErrorKind } from './errors';

export { createODataChannel } from './odata';
export type { ODataChannelOptions } from './odata';

export {
  DEFAULT_RFC_BACKEND,
  IMPLEMENTED_RFC_BACKENDS,
  RFC_BACKEND_ENV_KEY,
  RFC_BACKEND_NAMES,
  mergeRfcEnv,
  selectRfcBackend,
} from './select';

export type {
  DispatchResult,
  RfcBackendName,
  RfcCallResult,
  RfcChannel,
  TextpoolAction,
  TextpoolParams,
  TextpoolResult,
} from './types';

export interface RfcChannelOptions {
  readonly connection: import('../contracts').ConnectionConfig;
  /** `SAP_RFC_*` 키들 — `mergeRfcEnv`의 산물. */
  readonly env: Readonly<Record<string, string>>;
  /** 전송 계층 교체점(시험·기록/재생용). */
  readonly transport?: import('../adt/http').HttpTransport;
  /** 토큰 캐시 수명 판정용 시계. */
  readonly now?: () => number;
}

/**
 * 프로파일이 고른 통로를 만들어 준다.
 *
 * **조용한 대체는 없다.** 이름은 유효하지만 이 마일스톤에 구현이 없는 통로를
 * 골랐다면 `backend-unsupported`로 던진다 — 다른 통로로 넘어가면 사용자는
 * 자기가 고른 경로가 동작한다고 믿게 되고, 그것이 곧 거짓 성공이다. 미구현
 * 판정은 통로별 설정 검사보다 **먼저** 한다: `SAP_RFC_GATEWAY_URL`을 채우면
 * 될 것처럼 보이는 오류를 내면 원인을 바꿔치기하는 셈이 된다.
 */
export function createRfcChannel(options: RfcChannelOptions): RfcChannel {
  const backend = selectRfcBackend(options.env);
  if (!IMPLEMENTED_RFC_BACKENDS.includes(backend)) {
    throw unsupported(backend);
  }
  return createODataChannel({
    connection: options.connection,
    env: options.env,
    ...(options.transport ? { transport: options.transport } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}

function unsupported(backend: RfcBackendName): RfcError {
  const implemented = IMPLEMENTED_RFC_BACKENDS.join(', ');
  return new RfcError({
    kind: 'backend-unsupported',
    backend,
    message:
      `SAP_RFC_BACKEND='${backend}' is a valid backend name but is not implemented in this ` +
      `engine yet (implemented: ${implemented}). It is scheduled for a later milestone. ` +
      `Refusing to fall back to another backend — set SAP_RFC_BACKEND=odata in the active ` +
      `profile's sap.env, or keep using the shipped engine for '${backend}'.`,
  });
}
