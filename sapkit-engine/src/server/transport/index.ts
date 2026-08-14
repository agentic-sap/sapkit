/**
 * 전송 계층의 공개 표면.
 *
 * 전송을 하나 더 붙일 때 손대는 곳은 셋이다 — `config.ts`의 선택 분기,
 * 그 전송의 모듈 파일, 그리고 `bootstrap.ts`의 배선 분기. 여기서는 이름만 모은다.
 */

export { isLoopbackHost, resolveTransport } from './config';
export type {
  HttpTransportConfig,
  SseTransportConfig,
  StdioTransportConfig,
  TransportConfig,
  TransportInput,
  TransportKind,
  TransportResolution,
} from './config';

export { openHttpTransport } from './http';
export type { HttpBinding, HttpTransportOptions } from './http';

export { openSseTransport } from './sse';
export type { SseBinding, SseTransportOptions } from './sse';
