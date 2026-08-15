/**
 * `ReleaseTransport` — 발행 계약 · 와이어 한 발 · 응답 모양 셋 · **tier 게이트**.
 *
 * ## 기대값의 출처 — 구 엔진 **자신의 시험**이 계약 정본이다
 *
 * `engine/src/__tests__/unit/releaseTransport.test.ts`가 이 도구의 계약을 이미
 * 못박아 두었다: ⓐ `POST` ⓑ URL에 `/newreleasejobs`와 이송번호가 들어간다
 * ⓒ 왕복은 **한 번** ⓓ 성공 payload에 `success`·`supported`·`status`
 * ⓔ HTTP 404면 오류가 아니라 `{ supported: false }` + `SE09|SE10|STMS` 힌트.
 * 여기서는 그 다섯을 그대로 승계하고, 구 시험이 안 보던 것(Accept·timeout·
 * 들여쓰기·tier)을 더한다. 픽스처 XML도 구 시험의 것을 따른다.
 *
 * 그 밖의 근거:
 *  - 발행 선언 → 채록본 `harness/old-surface/m1-tools.json`의 `tools`
 *  - 주소·Accept·timeout → `engine/src/handlers/transport/high/handleReleaseTransport.ts:185-198`
 *  - tier      → `engine/src/lib/readonlyGuard.ts:95-123`(읽기로 분류되지 않는다)
 *
 * **SAP에 붙지 않는다.** 시험 서버는 in-process이고 이송번호는 합성값이다.
 */

import { releaseTransport, parseReleaseJobResponse } from '../releaseTransport';
import { invoke, jsonOf, startWriteHarness, textOf, xml } from './harness';
import type { WriteHarness } from './harness';
import { publish, publishedDeclaration } from './classPublication';
import { cleanupTierProbeDirs, probeTier } from '../../__tests__/tierProbe';

const TR = 'DEVK900123';
const RELEASE_PATH = `/sap/bc/adt/cts/transportrequests/${TR}/newreleasejobs`;

/** `handleReleaseTransport.ts:30-31` — `GetTransport`와 같은 두 값짜리 한 줄. */
const ACCEPT =
  'application/vnd.sap.adt.transportorganizer.v1+xml, application/vnd.sap.adt.transportorganizertree.v1+xml';

/** 구 시험의 픽스처 그대로(`engine/src/__tests__/unit/releaseTransport.test.ts:17-23`). */
const RELEASED_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:status="R" tm:status_text="Released">' +
  '<tm:releasereports>' +
  `<tm:releasereport><tm:message>Transport ${TR} released successfully</tm:message></tm:releasereport>` +
  '</tm:releasereports>' +
  '</tm:root>';

const UNKNOWN_XML = '<?xml version="1.0"?><weird:doc xmlns:weird="urn:x"><foo>bar</foo></weird:doc>';

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});
afterAll(() => {
  cleanupTierProbeDirs();
});

describe('parseReleaseJobResponse — 구 시험 셋을 그대로 승계', () => {
  it('release-report 응답에서 상태와 메시지를 뽑는다', () => {
    const parsed = parseReleaseJobResponse(RELEASED_XML);
    expect(parsed.status).toBe('R');
    expect(parsed.statusText).toBe('Released');
    expect(parsed.messages.join(' ')).toContain('released successfully');
  });

  it('알아볼 수 없는 모양은 null 둘 + 원문 발췌 하나', () => {
    const parsed = parseReleaseJobResponse(UNKNOWN_XML);
    expect(parsed.status).toBeNull();
    expect(parsed.statusText).toBeNull();
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]).toContain('weird:doc');
  });

  it('빈 입력에서도 던지지 않는다', () => {
    const parsed = parseReleaseJobResponse('');
    expect(parsed.status).toBeNull();
    expect(parsed.messages).toHaveLength(0);
  });

  it('갱신된 tm:request 노드에서도 상태를 읽는다 (Shape A)', () => {
    const xmlA =
      '<?xml version="1.0"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm">' +
      '<tm:request tm:status="R" tm:status_text="Released"/></tm:root>';
    const parsed = parseReleaseJobResponse(xmlA);
    expect(parsed.status).toBe('R');
    expect(parsed.statusText).toBe('Released');
  });
});

describe('발행 계약 — 채록본과 글자 일치', () => {
  it('tools/list의 네 필드가 구 번들과 같다', async () => {
    const published = await publish(releaseTransport);
    const expected = publishedDeclaration('ReleaseTransport');

    expect(published.name).toBe(expected.name);
    expect(published.description).toBe(expected.description);
    expect(published.inputSchema).toEqual(expected.inputSchema);
    expect(published.execution).toEqual(expected.execution);
  });

  it('sets · available_in · kind · targetNames', () => {
    // 구 경로는 `handlers/transport/high/`이고 채록본 exposures에서도
    // connected_default·noProfile_default 둘에만 뜬다.
    expect(releaseTransport.definition.sets).toEqual(['high']);
    expect(releaseTransport.definition.available_in).toEqual(['onprem', 'cloud']);
    // 구 `readonlyGuard`는 `Release*`를 읽기로 분류하지 않아 QA·PRD에서 막았다.
    expect(releaseTransport.definition.kind).toBe('mutation');
    // 이송번호는 Z·Y 검사가 성립하지 않으므로 **빈 배열이 맞는 선언**이다.
    expect(releaseTransport.definition.targetNames).toEqual([]);
  });
});

describe('와이어 — newreleasejobs POST 한 발', () => {
  it('주소·메서드·Accept·본문 없음', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, RELEASED_XML));
    const result = await invoke(releaseTransport, harness, { transport_number: TR });

    expect(result.isError).toBe(false);
    expect(harness.calls()).toHaveLength(1);
    const sent = harness.nth(0);
    expect(sent.method).toBe('POST');
    expect(sent.path).toBe(RELEASE_PATH);
    expect(sent.query.toString()).toBe('');
    expect(sent.headers.accept).toBe(ACCEPT);
    expect(sent.body).toBe('');
  });

  it('성공 응답은 구의 키 그대로 · 들여쓰기 2칸', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, RELEASED_XML));
    const result = await invoke(releaseTransport, harness, { transport_number: TR });

    expect(jsonOf(result)).toEqual({
      success: true,
      supported: true,
      transport_number: TR,
      status: 'R',
      status_text: 'Released',
      messages: [`Transport ${TR} released successfully`],
      message: `Release action submitted for ${TR} (status: R). Verify final state with GetTransport.`,
    });
    expect(textOf(result)).toContain('\n  "success": true');
  });

  it('상태를 못 읽으면 message의 괄호가 빠진다', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, UNKNOWN_XML));
    const result = await invoke(releaseTransport, harness, { transport_number: TR });

    expect(jsonOf(result).message).toBe(
      `Release action submitted for ${TR}. Verify final state with GetTransport.`,
    );
  });
});

describe('갈래 — 없는 엔드포인트는 오류가 아니다', () => {
  it.each([404, 405])('HTTP %s면 { supported: false }로 접는다', async (status) => {
    harness = await startWriteHarness((_request, response) => xml(response, '<err/>', status));
    const result = await invoke(releaseTransport, harness, { transport_number: TR });

    expect(result.isError).toBe(false);
    const payload = jsonOf(result);
    expect(payload.supported).toBe(false);
    expect(payload.transport_number).toBe(TR);
    expect(String(payload.hint)).toMatch(/SE09|SE10|STMS/);
    // 구는 이 갈래만 들여쓰기 없이 싣는다(`handleReleaseTransport.ts:210`).
    expect(textOf(result)).not.toContain('\n');
  });

  it('그 밖의 실패는 오류다', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, '<boom/>', 500));
    const result = await invoke(releaseTransport, harness, { transport_number: TR });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^Error: /);
  });

  it('transport_number가 비면 요청을 보내지 않는다', async () => {
    harness = await startWriteHarness((_request, response) => xml(response, RELEASED_XML));
    const result = await invoke(releaseTransport, harness, { transport_number: '' });

    expect(result.isError).toBe(true);
    // 구는 `MCP error -32602: Transport number is required`였다 — 접두사가 빠지는
    // 것은 등재된 축소분이다(`harness/DIVERGENCES.md` D34).
    expect(textOf(result)).toBe('Transport number is required');
    expect(harness.calls()).toHaveLength(0);
  });
});

describe('tier 게이트 (음성시험) — 거부 시 접속 시도 0회', () => {
  it.each(['QA', 'PRD'])('%s tier에서 거부한다', async (tier) => {
    const probe = await probeTier(releaseTransport, tier, { transport_number: TR });

    expect(probe.isError).toBe(true);
    expect(probe.text).toContain('ERR_READONLY_TIER');
    expect(probe.text).toContain('mutates SAP objects');
    expect(probe.connections).toBe(0);
  });

  it('tier 미해석에서도 거부한다 (fail-closed)', async () => {
    const probe = await probeTier(releaseTransport, '', { transport_number: TR });

    expect(probe.isError).toBe(true);
    expect(probe.text).toContain('ERR_READONLY_TIER');
    expect(probe.connections).toBe(0);
  });

  it('DEV에서는 게이트를 지나 접속까지 간다 (과수리 역검증)', async () => {
    const probe = await probeTier(releaseTransport, 'DEV', { transport_number: TR });

    expect(probe.connections).toBe(1);
    expect(probe.text).not.toContain('ERR_READONLY_TIER');
  });
});
