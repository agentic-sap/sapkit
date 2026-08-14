/**
 * RFC 분배층의 공개 표면.
 *
 * 상위 계층(RFC 경유 도구들)은 **여기서만** 가져다 쓴다. 어느 통로가 골라졌는지
 * 도구가 알 필요는 없고, 알아서도 안 된다 — 통로별 분기가 도구 안으로 새면
 * 나머지 네 경로를 붙일 때마다 도구를 다시 손대야 한다.
 */

import { RfcError } from './errors';
import { createGatewayChannel } from './gateway';
import { createNativeChannel } from './native';
import { createODataChannel } from './odata';
import { IMPLEMENTED_RFC_BACKENDS, selectRfcBackend } from './select';
import { createSoapChannel } from './soap';
import { createZrfcChannel } from './zrfc';
import type { DdicReadChannel, RfcBackendName, RfcChannel } from './types';

export { RfcError, rfcKindFromStatus } from './errors';
export type { RfcErrorInit, RfcErrorKind } from './errors';

export { createODataChannel } from './odata';
export type { ODataChannelOptions } from './odata';

export { createSoapChannel } from './soap';
export type { SoapChannelOptions } from './soap';

export { createNativeChannel } from './native';
export type { NativeChannelOptions } from './native';

export { createGatewayChannel } from './gateway';
export type { GatewayChannelOptions } from './gateway';

export { createZrfcChannel } from './zrfc';
export type { ZrfcChannelOptions } from './zrfc';

export {
  DEFAULT_RFC_BACKEND,
  IMPLEMENTED_RFC_BACKENDS,
  RFC_BACKEND_ENV_KEY,
  RFC_BACKEND_NAMES,
  mergeRfcEnv,
  selectRfcBackend,
} from './select';

export type {
  DdicReadChannel,
  DdicReadResult,
  DdicTablReadParams,
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

  // 이음매(`transport`·`now`)는 **받는 통로에만** 넘긴다. `native`는 HTTP를
  // 타지 않아 둘 다 없고, `gateway`는 토큰 캐시가 없어 시계를 쓰지 않는다.
  // 없는 자리에 스프레드로 밀어 넣으면 exactOptionalPropertyTypes가 잡는다.
  const seam = {
    ...(options.transport ? { transport: options.transport } : {}),
    ...(options.now ? { now: options.now } : {}),
  };

  switch (backend) {
    case 'soap':
      return createSoapChannel({ connection: options.connection, env: options.env, ...seam });
    case 'native':
      return createNativeChannel({ connection: options.connection, env: options.env });
    case 'gateway':
      return createGatewayChannel({
        connection: options.connection,
        env: options.env,
        ...(options.transport ? { transport: options.transport } : {}),
      });
    case 'zrfc':
      return createZrfcChannel({ connection: options.connection, env: options.env, ...seam });
    case 'odata':
      return createODataChannel({ connection: options.connection, env: options.env, ...seam });
  }
}

/**
 * ECC DDIC 읽기 통로를 만들어 준다.
 *
 * `createRfcChannel`과 갈리는 지점 하나: **`odata`만 이 능력을 가진다.**
 * 마일스톤 문제가 아니라 SAP 측 설계다 — 브리지 함수모듈은 OData 서비스의
 * FunctionImport로만 노출돼 있어 나머지 통로에는 닿을 길이 없다. 구 엔진도
 * 같은 자리에서 "SAP_RFC_BACKEND=odata가 필요하다"고 던진다
 * (`engine/src/lib/rfcBackend.ts:94-132` — 이미 정직한 실패다).
 *
 * 그래서 미구현 판정(`backend-unsupported`)보다 이 판정이 **먼저**다.
 * `gateway`를 고른 사람에게 "후속 마일스톤에 온다"고 답하면, 오지 않을 것을
 * 기다리게 된다.
 */
export function createDdicReadChannel(options: RfcChannelOptions): DdicReadChannel {
  const backend = selectRfcBackend(options.env);
  if (backend !== 'odata') {
    throw new RfcError({
      kind: 'config',
      backend,
      message:
        `The ECC DDIC bridge requires SAP_RFC_BACKEND=odata (current='${backend}'). ` +
        `ZMCP_ADT_DDIC_TABL_READ is only exposed through the OData ZMCP_ADT_SRV service, ` +
        `so no other backend can reach it. Set SAP_RFC_BACKEND=odata in the active profile's ` +
        `sap.env, or read this object through the standard ADT endpoints on a non-ECC system.`,
    });
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
