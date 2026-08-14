/**
 * `DeleteMetadataExtension` — 발행 계약 · **삭제 서비스를 쓰지 않는 와이어**
 * (DELETE 한 방) · 갈래 · tier 게이트 음성시험.
 *
 * 기대값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteMetadataExtension`
 *  - 겉 핸들러: `engine/src/handlers/metadata_extension/high/handleDeleteMetadataExtension.ts:17-137`
 *  - 사슬: `.../dist/core/metadataExtension/AdtMetadataExtension.js` delete —
 *    벤더 주석 "no lock/unlock, no deletion check for metadata extensions"
 *  - 저수준: `.../dist/core/metadataExtension/delete.js:24-35`
 *
 * 겉 핸들러의 주석은 "includes deletion check"라고 적지만 **본문에 그 걸음이 없다.**
 * 주석이 아니라 본문이 계약이라는 것을 검사 주소가 안 불린다는 단언으로 못 박는다.
 */

import * as http from 'node:http';

import { deleteMetadataExtension } from '../deleteMetadataExtension';
import { CHECK_PATH, DELETE_PATH, describeTierGate, exposureMemberships } from './deletionSupport';
import { type WriteHarness, adtException, jsonOf, startWriteHarness, textOf, xml } from './harness';
import { publishedDeclaration, publishedSurfaceOf } from './tableStructurePublication';

const NAME = 'ZSAPKIT_DDLX';
const URI = `/sap/bc/adt/ddic/ddlx/sources/${NAME.toLowerCase()}`;

let harness: WriteHarness;
afterEach(async () => {
  if (harness) await harness.close();
});

function harnessFor(status = 200, body = ''): Promise<WriteHarness> {
  return startWriteHarness((request: { path: string }, response: http.ServerResponse) => {
    if (request.path === URI) return xml(response, body, status);
    return xml(response, '<unexpected/>', 500);
  });
}

const run = (args: Record<string, unknown>) =>
  Promise.resolve(deleteMetadataExtension.handler(harness.context, args));

describe('발행 계약', () => {
  it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
    expect(await publishedSurfaceOf(deleteMetadataExtension)).toEqual(
      publishedDeclaration('DeleteMetadataExtension'),
    );
  });

  it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
    expect(deleteMetadataExtension.definition.sets).toEqual(['high']);
    expect(deleteMetadataExtension.definition.available_in).toEqual(['onprem', 'cloud']);
    expect(deleteMetadataExtension.definition.kind).toBe('mutation');
    expect(deleteMetadataExtension.definition.targetNames).toEqual(['metadata_extension_name']);
  });

  it('채록본의 노출 조건 소속과 어긋나지 않는다', () => {
    expect(exposureMemberships('DeleteMetadataExtension')).toEqual([
      'connected_default',
      'noProfile_default',
    ]);
  });
});

describe('와이어 — DELETE 한 방 (삭제 서비스를 쓰지 않는다)', () => {
  it('요청은 하나이고 메서드가 DELETE다 · 이름은 소문자 · 인코딩 없음', async () => {
    harness = await harnessFor();
    const result = await run({ metadata_extension_name: NAME });
    expect(result.isError).toBe(false);

    expect(harness.calls()).toHaveLength(1);
    expect(harness.nth(0).method).toBe('DELETE');
    expect(harness.nth(0).path).toBe(URI);
    expect(harness.nth(0).headers['accept']).toBe('application/xml');
    // 본문이 없다 — 다른 12종은 XML 전문을 싣는다.
    expect(harness.nth(0).body).toBe('');
  });

  it('**삭제 서비스 두 주소를 치지 않는다** — 겉 주석의 "deletion check"는 본문에 없다', async () => {
    harness = await harnessFor();
    await run({ metadata_extension_name: NAME });
    const paths = harness.calls().map((call) => call.path);
    expect(paths).not.toContain(CHECK_PATH);
    expect(paths).not.toContain(DELETE_PATH);
  });

  it('이송번호는 전문이 아니라 **질의 인자 corrNr**로 실린다', async () => {
    harness = await harnessFor();
    await run({ metadata_extension_name: NAME, transport_request: 'E19K905635' });
    expect(harness.nth(0).query.get('corrNr')).toBe('E19K905635');
  });

  it('이송번호가 없으면 corrNr를 붙이지 않는다', async () => {
    harness = await harnessFor();
    await run({ metadata_extension_name: NAME });
    expect(harness.nth(0).query.get('corrNr')).toBeNull();
  });

  it('성공 응답은 구의 네 칸 그대로다', async () => {
    harness = await harnessFor();
    expect(jsonOf(await run({ metadata_extension_name: NAME.toLowerCase() }))).toEqual({
      success: true,
      metadata_extension_name: NAME,
      transport_request: null,
      message: `MetadataExtension ${NAME} deleted successfully.`,
    });
  });
});

describe('갈래', () => {
  it('이름이 없으면 요청을 하나도 보내지 않는다', async () => {
    harness = await harnessFor();
    const result = await run({});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Error: metadata_extension_name is required');
    expect(harness.calls()).toHaveLength(0);
  });

  it('404는 "이미 지워졌을 수 있다"로 답한다', async () => {
    harness = await harnessFor(404, '<not-found/>');
    expect(textOf(await run({ metadata_extension_name: NAME }))).toBe(
      `Error: MetadataExtension ${NAME} not found. It may already be deleted.`,
    );
  });

  it('423은 남의 잠금이다', async () => {
    harness = await harnessFor(423, '<locked/>');
    expect(textOf(await run({ metadata_extension_name: NAME }))).toBe(
      `Error: MetadataExtension ${NAME} is locked by another user. Cannot delete.`,
    );
  });

  it('400은 이송번호를 되묻는다 — 예외 XML보다 상태 코드가 먼저다', async () => {
    harness = await harnessFor(400, adtException('ExceptionResourceNoAccess', 'TR required'));
    expect(textOf(await run({ metadata_extension_name: NAME }))).toBe(
      'Error: Bad request. Check if transport request is required and valid.',
    );
  });

  it('그 밖의 상태에서는 예외 XML의 문구를 SAP Error로 싣는다', async () => {
    harness = await harnessFor(500, adtException('ExceptionInternal', 'DDLX service down'));
    expect(textOf(await run({ metadata_extension_name: NAME }))).toBe(
      'Error: SAP Error: DDLX service down',
    );
  });
});

describeTierGate(deleteMetadataExtension, { metadata_extension_name: NAME });
