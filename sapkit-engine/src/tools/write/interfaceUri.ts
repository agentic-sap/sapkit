/**
 * 인터페이스 오브젝트의 ADT URI — **세 벌이다.**
 *
 * 합치고 싶어지는 자리지만 합치면 안 된다. 구 엔진의 인터페이스 계열은 같은
 * 오브젝트를 **단계마다 다른 규칙으로** 주소지정했고, 이름에 슬래시가 들어가는
 * 순간(`/NS/ZIF_X`) 세 규칙이 서로 다른 문자열을 만든다. 여기서 하나로 접으면
 * 구와 다른 URL을 보내게 된다.
 *
 * 실측(읽기 전용 참조 — `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist`):
 *
 * | 단계 | 규칙 | 근거 |
 * |---|---|---|
 * | LOCK | `encodeURIComponent(이름).toLowerCase()` | `core/interface/lock.js:16` |
 * | 사전 구문검사(inline) | 같음 | `engine/src/lib/preCheckBeforeActivation.ts:224` |
 * | 활성화 대상 URI | 같음 | `core/interface/activation.js:13` |
 * | 사후 구문검사(stored) | `encodeURIComponent(이름.toLowerCase())` | `utils/checkRun.js:20,26` |
 * | 소스 PUT | `encodeURIComponent(이름)` — **소문자화 없음** | `core/interface/update.js:16` |
 * | UNLOCK | 같음(소문자화 없음) | `core/interface/unlock.js:14` |
 *
 * 클래스 계열은 여섯 자리 전부가 소문자다(`core/class/{lock,unlock,update,
 * activation}.js`). **인터페이스만 PUT·UNLOCK이 갈라진다** — 같다고 가정하지
 * 않고 실측해서 얻은 결과이며, 그래서 이 표가 여기 있다.
 *
 * 이름 인코딩 자체는 벤더 `encodeSapObjectName`(= `encodeURIComponent` 한 겹,
 * `utils/internalUtils.js:19-21`)이고 `./shared`의 `encodeObjectName`과 같다.
 */

import { encodeObjectName } from './shared';

const INTERFACE_ROOT = '/sap/bc/adt/oo/interfaces';

/**
 * 표준 오브젝트 URI — **인코딩한 뒤** 소문자로 만든다
 * (`encodeSapObjectName(name).toLowerCase()`). 잠금·사전검사·활성화가 이 자리를
 * 쓰고, `CreateInterface`가 응답에 싣는 `uri`도 같은 문자열이다
 * (`handleCreateInterface.ts:148`).
 */
export function interfaceObjectUri(name: string): string {
  return `${INTERFACE_ROOT}/${encodeObjectName(name).toLowerCase()}`;
}

/**
 * 저장본 구문검사가 쓰는 자리 — **소문자로 만든 뒤** 인코딩한다
 * (`encodeSapObjectName(name.toLowerCase())`).
 */
export function interfaceStoredCheckUri(name: string): string {
  return `${INTERFACE_ROOT}/${encodeObjectName(name.toLowerCase())}`;
}

/**
 * 소스 PUT·UNLOCK이 쓰는 자리 — 이름을 **그대로** 인코딩한다. 호출자가 이미
 * 대문자로 올려 두므로 실제로 나가는 URL도 대문자다.
 */
export function interfaceRawUri(name: string): string {
  return `${INTERFACE_ROOT}/${encodeObjectName(name)}`;
}
