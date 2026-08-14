/**
 * 통로 선택 계약 — 어떤 env 키가 무엇을 고르는가.
 *
 * 실측 원본: `engine/src/lib/rfcBackend.ts:34-48`. 요약하면 규칙은 셋뿐이다.
 *
 *  1. **키는 `SAP_RFC_BACKEND` 하나.** 값 하나가 통로 하나를 고른다.
 *  2. **미설정과 빈 값은 둘 다 기본값 `odata`.** 구 소스가 `|| 'odata'`로 빈
 *     문자열까지 잡아내는 것은 의도다 — `sap.env`의 `SAP_RFC_BACKEND=` 빈 줄이
 *     옛 기본값 `soap`을 조용히 고르지 않게 하려는 것.
 *  3. **알 수 없는 값은 던진다.** 기본값으로 폴백하지 않는다.
 *
 * **폴백 사슬은 없다.** 한 통로가 실패했다고 다음 통로로 넘어가는 경로는 구
 * 엔진에 존재하지 않으며, 여기서도 만들지 않는다. 조용한 대체는 사용자가 고른
 * 통로가 동작한다고 믿게 만드는 거짓 성공이다.
 *
 * 기본값이 `odata`가 된 것은 2026-04-22의 변경이다(구 소스 주석 :8-12 — 강화된
 * Gateway 설치가 `/sap/bc/soap/rfc` ICF 노드를 닫는 일이 늘었고, OData 경로는
 * `S_RFC` 대신 표준 Gateway 권한 `S_SERVICE`를 탄다).
 */

import { RfcError } from './errors';
import type { RfcBackendName } from './types';

/**
 * 다섯 통로 이름.
 *
 * **주의 — 구 엔진의 선택기는 `zrfc`를 받지 않는다.** 구현체
 * (`engine/src/lib/zrfcProxy.ts`)와 설치 안내(`engine/docs/installation/ZRFC_SETUP.md`),
 * 문제해결 절차의 선택 기준표(`interactive/core/procedures/troubleshooting.md:165`),
 * 런처 주석(`engine/src/server/launcher.ts:97`)이 모두 `zrfc`를 유효한 값으로
 * 말하는데, 정작 선택기의 분기와 오류 문구에는 없어서 `SAP_RFC_BACKEND=zrfc`는
 * "알 수 없는 값"으로 거부된다(현행 배포 번들
 * `interactive/server/server.bundle.cjs:112130`에서도 동일). 신 엔진은 결정
 * D-079 ②(5경로 전량 재제작)에 맞춰 `zrfc`를 **유효한 이름으로 인정**한다.
 * M1에서는 아직 짓지 않았다는 사실을 `backend-unsupported`로 알렸고, 오프라인
 * 대량 제작 판이 실동작 구현을 넣어 지금은 그 이름이 실제 통로로 이어진다.
 * **구 엔진(=현행 제품)의 배선 구멍 자체는 그대로 남는다** — 교체 전까지
 * `zrfc`는 제품에서 쓸 수 없다(장부 D9).
 */
export const RFC_BACKEND_NAMES: readonly RfcBackendName[] = [
  'odata',
  'soap',
  'native',
  'gateway',
  'zrfc',
];

/** 키가 없거나 비었을 때의 통로. */
export const DEFAULT_RFC_BACKEND: RfcBackendName = 'odata';

/**
 * 실제로 지은 통로. **지금은 다섯 전량이다.**
 *
 * M1은 `odata` 하나였고, 오프라인 대량 제작 판이 나머지 넷을 지었다. 목록이
 * 전량이 되어 `backend-unsupported` 경로는 지금 도달 불가능하지만 **지우지
 * 않는다** — 여섯째 이름이 `RFC_BACKEND_NAMES`에만 추가되고 구현이 빠지는
 * 순간, 그 이름을 조용히 `odata`로 흘려보내는 대신 정직하게 실패시켜야 하기
 * 때문이다. 이 목록이 그 방어의 유일한 자리다.
 *
 * **주의 — 실행 경로까지 오프라인으로 닫힌 것은 아니다.** 다섯 전부 통로 생성
 * 계약(필수 설정 확인 시점 · 오류 종류 · 타임아웃)까지 시험돼 있으나, 실제
 * 디스패치는 SAP 접속을 요구해 미뤄져 있다. `native`는 그에 더해 네이티브
 * 애드온(`node-rfc`)이 이 머신에 없어 실행 구간이 관찰되지 않았고(장부 D21),
 * `zrfc`는 SAP 측 `ZRFC` 오브젝트를 요구한다(장부 D22).
 */
export const IMPLEMENTED_RFC_BACKENDS: readonly RfcBackendName[] = [
  'odata',
  'soap',
  'native',
  'gateway',
  'zrfc',
];

/** 통로를 고르는 유일한 키. */
export const RFC_BACKEND_ENV_KEY = 'SAP_RFC_BACKEND';

function isBackendName(value: string): value is RfcBackendName {
  return (RFC_BACKEND_NAMES as readonly string[]).includes(value);
}

/**
 * `SAP_RFC_BACKEND` 값 하나를 통로 이름으로 옮긴다.
 *
 * 구 엔진은 이 해석을 **모듈 적재 시각에 `process.env`로부터 한 번만** 한다
 * (그래서 값을 바꾸려면 MCP 서버를 다시 띄워야 한다). 여기서는 순수 함수로
 * 두고 해석 시점을 호출자에게 맡긴다 — 프로파일 계층이 이미 `sap.env`를 읽어
 * 주므로 전역 상태를 거칠 이유가 없고, 시험이 프로세스 env를 흔들지 않아도 된다.
 * **관찰 가능한 계약(어떤 값이 무엇을 고르는가·기본값·거부)은 동일하다.**
 */
export function selectRfcBackend(
  env: Readonly<Record<string, string | undefined>>,
): RfcBackendName {
  const raw = (env[RFC_BACKEND_ENV_KEY] ?? '').trim().toLowerCase();
  if (raw === '') return DEFAULT_RFC_BACKEND;
  if (isBackendName(raw)) return raw;

  const names = RFC_BACKEND_NAMES.map((name) => `'${name}'`).join(' | ');
  throw new RfcError({
    kind: 'config',
    message:
      `${RFC_BACKEND_ENV_KEY} must be ${names} (got '${raw}'). ` +
      `Default is '${DEFAULT_RFC_BACKEND}'. Set it in the active profile's sap.env.`,
  });
}

/**
 * 프로파일 파일의 값과 프로세스 env를 구 런처와 **같은 우선순위**로 합류시킨다.
 *
 * 실측: `engine/src/server/launcher.ts:100-104` — `SAP_RFC_` 접두사를 가진
 * 모든 키를 env 파일에서 `process.env`로 옮기되 `!process.env[key]`일 때만
 * 옮긴다. 즉 **프로세스 env가 비어 있지 않으면 그쪽이 이기고**, 빈 문자열은
 * 없는 것으로 친다. 접두사 통과분만 다루는 것도 구와 같다 — 자격증명은 이
 * 통로로 흐르지 않는다(신 엔진에서는 `ConnectionConfig`가 소유한다).
 *
 * 안전 계층의 blocklist 노브는 반대 우선순위(프로파일이 이김 — 장부 D6)를
 * 쓰는데, 그것은 그쪽 축의 판정이고 여기 RFC 축에는 적용되지 않는다.
 */
export function mergeRfcEnv(
  profileEnv: Readonly<Record<string, string>>,
  processEnv: Readonly<Record<string, string | undefined>> = {},
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(profileEnv)) {
    if (key.startsWith('SAP_RFC_') && value) merged[key] = value;
  }
  for (const [key, value] of Object.entries(processEnv)) {
    if (key.startsWith('SAP_RFC_') && value) merged[key] = value;
  }
  return merged;
}
