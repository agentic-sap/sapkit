/**
 * RFC 통로 오류의 **단일 정규화 타입**.
 *
 * 구 엔진은 다섯 통로가 저마다 평범한 `Error`를 문자열로 조립해 던진다
 * (`engine/src/lib/odataRfc.ts:166`·`:280`·`:321` 등). 그래서 상위 계층이
 * "이게 설정 문제인가, 권한 문제인가, SAP이 답한 업무 오류인가"를 알려면
 * 메시지를 다시 파싱하는 수밖에 없다. 여기서는 한 번만 분류한다.
 *
 * 분류 축은 ADT 계층(`src/adt/errors.ts`)과 같은 모양을 쓰되, RFC 특유의 두
 * 가지를 더한다: `config`(설정이 통로를 세울 수 없음)와 `sap`(대리자
 * 함수모듈이 `subrc != 0`으로 답함 — 전송은 성공했다).
 */

import type { RfcBackendName } from './types';

export type RfcErrorKind =
  /** 필수 env 누락, 알 수 없는 통로 이름 — 요청을 보내기도 전에 막힌다. */
  | 'config'
  /** 이름은 유효하지만 이 마일스톤에 구현이 없다. **조용한 대체 대신 이 오류.** */
  | 'backend-unsupported'
  /** 응답을 받기 전에 시간이 다 됐다. */
  | 'timeout'
  /** 연결·DNS·TLS 실패 — 응답 자체가 없다. */
  | 'network'
  /** 401 — 자격증명. */
  | 'auth'
  /** 403 — 권한 거부(CSRF가 아닌). */
  | 'forbidden'
  /** CSRF 토큰이 재취득 후에도 거부됐다. */
  | 'csrf'
  /** 404 — 서비스·엔드포인트 없음. */
  | 'not-found'
  /** 5xx. */
  | 'server'
  /** 그 밖의 HTTP 실패. */
  | 'http'
  /** 응답은 성공인데 기대한 모양이 아니다(토큰 헤더 없음·봉투 없음·비JSON). */
  | 'protocol'
  /** 대리자 함수모듈이 `subrc != 0`으로 답했다. 전송은 성공했다. */
  | 'sap';

export interface RfcErrorInit {
  readonly kind: RfcErrorKind;
  readonly message: string;
  readonly backend?: RfcBackendName;
  readonly status?: number;
  readonly method?: string;
  readonly url?: string;
  /** `EV_SUBRC` — kind가 `sap`일 때만 있다. */
  readonly subrc?: number;
  /** `EV_MESSAGE` 원문 — 정규화된 `message`와 별도로 보존한다. */
  readonly sapMessage?: string;
  /** 디스패치 동작 이름(`CUA_FETCH` 등) 또는 텍스트풀 동작. */
  readonly action?: string;
  /** 호출한 대리자 함수모듈 이름. */
  readonly functionModule?: string;
  /** 진단용 원문 응답 본문(절단됨). 분류는 여기 의존하지 않는다. */
  readonly rawBody?: string;
  readonly cause?: unknown;
}

export class RfcError extends Error {
  readonly kind: RfcErrorKind;
  readonly backend?: RfcBackendName;
  readonly status?: number;
  readonly method?: string;
  readonly url?: string;
  readonly subrc?: number;
  readonly sapMessage?: string;
  readonly action?: string;
  readonly functionModule?: string;
  readonly rawBody?: string;

  constructor(init: RfcErrorInit) {
    super(init.message, { cause: init.cause });
    this.name = 'RfcError';
    this.kind = init.kind;
    this.backend = init.backend;
    this.status = init.status;
    this.method = init.method;
    this.url = init.url;
    this.subrc = init.subrc;
    this.sapMessage = init.sapMessage;
    this.action = init.action;
    this.functionModule = init.functionModule;
    this.rawBody = init.rawBody;
  }
}

/**
 * HTTP 상태 하나를 오류 종류로 옮긴다. 403은 CSRF 재취득 신호를 먼저 본 뒤에만
 * 여기 도달하므로 여기서는 늘 `forbidden`이다.
 */
export function rfcKindFromStatus(status: number): RfcErrorKind {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status >= 500) return 'server';
  return 'http';
}

/** 진단 문구에 실을 만큼만 본문을 자른다 — 구 엔진과 같은 256자. */
export function truncateBody(body: string): string {
  return body.substring(0, 256);
}
