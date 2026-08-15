/**
 * 런타임 응답 본문을 JSON으로 접는 자리.
 *
 * ## 와이어 근거
 *
 * 구 엔진의 런타임 핸들러 7종이 `response.data`를 그대로
 * `parseRuntimePayloadToJson`에 넘긴다
 * (`engine/src/handlers/system/readonly/runtimePayloadParser.ts:1-27`). 그 함수는
 * **문자열이면서 `<`로 시작할 때만** XML로 파싱하고, 그 밖에는 받은 값을 그대로
 * 돌려준다. XML 파서 설정도 그 파일의 실측값 그대로다 — `attributeNamePrefix`가
 * **빈 문자열**이라 속성이 접두사 없이 형제 키로 올라오고, `removeNSPrefix`를
 * 켜지 않아 `trc:`·`dump:` 같은 네임스페이스 접두사가 키에 **남는다**. 둘 다
 * 응답 모양의 일부이므로 "정리"하지 않는다.
 *
 * ## 구와 다른 것 (차이가 아니다) — 파싱 진입점
 *
 * 구는 axios가 응답을 먼저 만졌다. axios의 기본 `transformResponse`는
 * `forcedJSONParsing`이 참이라 **본문이 문자열이고 비어 있지 않으면 무조건
 * `JSON.parse`를 시도**하고, 성공하면 그 결과를 `response.data`로 넘긴다
 * (`@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:210-235`
 * 는 `responseType`도 `transformResponse`도 덮어쓰지 않는다 — 즉 axios 기본값이다).
 * 그래서 구의 `parseRuntimePayloadToJson`은 **JSON이 이미 객체로 접힌 뒤**의 값을
 * 받았다.
 *
 * 신 엔진의 `AdtClient.request()`는 본문을 항상 문자열로 넘긴다. 그래서
 * {@link parseRuntimePayload}가 axios가 하던 그 한 걸음(비지 않은 문자열에
 * `JSON.parse` 시도, 실패하면 문자열 그대로)을 먼저 밟고 나서 구와 같은 함수에
 * 넘긴다. 진입점이 다를 뿐 **결과 값은 같다** — 등재할 차이가 아니다.
 *
 * 이 계열이 실제로 요청하는 `Accept`는 `application/xml` ·
 * `application/atom+xml;type=feed` · `text/html` · `text/plain` 넷뿐이라
 * JSON 응답은 실전에서 오지 않는다. 그래도 이 한 걸음을 두는 이유는, 없으면
 * "구는 객체, 신은 문자열"이 되는 갈래가 조용히 열려 있기 때문이다.
 */

import { XMLParser } from 'fast-xml-parser';

/** 구 `runtimePayloadParser.ts:3-6`의 설정 그대로. */
const runtimeXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

/**
 * ADT XML 본문을 JSON 객체로 바꾼다. XML 텍스트가 아니면 받은 값 그대로.
 * 구 `parseRuntimePayloadToJson`과 같은 판단이다.
 */
export function parseRuntimePayloadToJson(payload: unknown): unknown {
  if (typeof payload !== 'string') return payload;

  const trimmed = payload.trim();
  if (!trimmed.startsWith('<')) return payload;

  try {
    return runtimeXmlParser.parse(trimmed);
  } catch {
    return payload;
  }
}

/**
 * 응답 본문 문자열을 구가 `response.data`로 받던 값과 같게 만든 뒤 접는다.
 *
 * 첫 걸음이 axios의 몫이었다 — 모듈 머리주석 참조.
 */
export function parseRuntimePayload(body: string): unknown {
  let data: unknown = body;
  if (body.length > 0) {
    try {
      data = JSON.parse(body) as unknown;
    } catch {
      data = body;
    }
  }
  return parseRuntimePayloadToJson(data);
}
