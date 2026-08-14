/**
 * `DeleteLocal{Definitions,Macros,TestClass,Types}` 넷의 시험 장치.
 *
 * 넷은 사슬(잠금 → 빈 소스 PUT → 해제 → 선택 활성화)이 같고 **인클루드 이름과
 * 문구만** 다르다. 그 값을 도구마다 spec으로 적고 판정은 여기 한 자리에 둔다.
 *
 * 값은 전부 종류마다 따로 실측했다 — 특히 `DeleteLocalTypes`의 인클루드 이름이
 * `implementations`라는 것은 이름만 보고는 알 수 없다.
 * 기대 바이트는 구의 실측에서 다시 짓는다(구현을 가져다 쓰면 자기확인이 된다).
 *
 * 파일 이름이 `*.test.ts`가 아니므로 jest가 시험으로 고르지 않는다.
 */

import * as http from 'node:http';

import type { SapTool, ToolResult } from '../../../server';
import { describeTierGate, exposureMemberships } from './deletionSupport';
import {
  type WriteHarness,
  activationBody,
  jsonOf,
  lockBody,
  startWriteHarness,
  textOf,
  xml,
} from './harness';
import { publishedDeclaration, publishedSurfaceOf } from './tableStructurePublication';

const ACTIVATION_PATH = '/sap/bc/adt/activation';

/** 벤더 clear 경로가 싣는 본문 — **공백 한 칸**(`includes.js`·`testclasses.js`). */
export const EXPECTED_CLEAR_BODY = ' ';

export interface LocalIncludeClearSpec {
  readonly tool: SapTool;
  readonly name: string;
  /** 부모 클래스 이름. */
  readonly className: string;
  /** 실제로 비워지는 인클루드 — 도구 이름과 어긋날 수 있다. */
  readonly includeType: 'definitions' | 'macros' | 'testclasses' | 'implementations';
  /** 성공 문구의 주어(`… deleted successfully from …`). */
  readonly messageSubject: string;
  /** 일반 실패 문구의 주어(`Failed to delete …`). */
  readonly failureSubject: string;
  /** 404 문구의 주어(`… for <class> not found.`). */
  readonly notFoundSubject: string;
}

interface Overrides {
  readonly putStatus?: number;
  readonly putBody?: string;
  readonly lockStatus?: number;
  readonly lockPayload?: string;
  readonly activation?: string;
}

export function describeLocalIncludeClear(spec: LocalIncludeClearSpec): void {
  const CLASS_URI = `/sap/bc/adt/oo/classes/${spec.className.toLowerCase()}`;
  const INCLUDE_URI = `${CLASS_URI}/includes/${spec.includeType}`;

  function harnessFor(overrides: Overrides = {}): Promise<WriteHarness> {
    return startWriteHarness((request, response: http.ServerResponse) => {
      const action = request.query.get('_action');
      if (action === 'LOCK') {
        return xml(
          response,
          overrides.lockPayload ?? lockBody('LOCK-LOCAL'),
          overrides.lockStatus ?? 200,
        );
      }
      if (action === 'UNLOCK') return xml(response, '');
      if (request.path === INCLUDE_URI && request.method === 'PUT') {
        return xml(response, overrides.putBody ?? '', overrides.putStatus ?? 200);
      }
      if (request.path === ACTIVATION_PATH) {
        return xml(response, overrides.activation ?? activationBody());
      }
      return xml(response, '<unexpected/>', 500);
    });
  }

  let harness: WriteHarness;
  afterEach(async () => {
    if (harness) await harness.close();
  });

  const run = (args: Record<string, unknown>): Promise<ToolResult> =>
    Promise.resolve(spec.tool.handler(harness.context, args));

  describe('발행 계약', () => {
    it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
      expect(await publishedSurfaceOf(spec.tool)).toEqual(publishedDeclaration(spec.name));
    });

    it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
      expect(spec.tool.definition.sets).toEqual(['high']);
      expect(spec.tool.definition.available_in).toEqual(['onprem', 'cloud', 'legacy']);
      expect(spec.tool.definition.kind).toBe('mutation');
      expect(spec.tool.definition.targetNames).toEqual(['class_name']);
    });

    it('채록본의 노출 조건 소속과 어긋나지 않는다', () => {
      expect(exposureMemberships(spec.name)).toEqual(['connected_default', 'noProfile_default']);
    });
  });

  describe('와이어 — 잠금 → **빈 소스 PUT** → 해제', () => {
    it('삭제 서비스를 쓰지 않고 세 요청을 순서대로 보낸다', async () => {
      harness = await harnessFor();
      const result = await run({ class_name: spec.className.toLowerCase() });
      expect(result.isError).toBe(false);

      expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
        `POST ${CLASS_URI}`,
        `PUT ${INCLUDE_URI}`,
        `POST ${CLASS_URI}`,
      ]);
      expect(harness.nth(0).query.get('_action')).toBe('LOCK');
      expect(harness.nth(0).query.get('accessMode')).toBe('MODIFY');
      expect(harness.nth(2).query.get('_action')).toBe('UNLOCK');
      expect(harness.nth(2).query.get('lockHandle')).toBe('LOCK-LOCAL');
    });

    it('PUT 본문은 **공백 한 칸**이다 — 빈 문자열이 아니다', async () => {
      harness = await harnessFor();
      await run({ class_name: spec.className });
      const put = harness.nth(1);
      expect(put.body).toBe(EXPECTED_CLEAR_BODY);
      expect(put.body).not.toBe('');
      expect(put.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(put.headers['accept']).toBe('text/plain');
      expect(put.query.get('lockHandle')).toBe('LOCK-LOCAL');
    });

    it(`인클루드 종류는 ${spec.includeType}다`, async () => {
      harness = await harnessFor();
      await run({ class_name: spec.className });
      expect(harness.nth(1).path).toBe(INCLUDE_URI);
    });

    it('이송번호는 PUT의 corrNr로 실린다', async () => {
      harness = await harnessFor();
      await run({ class_name: spec.className, transport_request: 'E19K905635' });
      expect(harness.nth(1).query.get('corrNr')).toBe('E19K905635');
    });

    it('성공 응답은 구의 다섯 칸 그대로다', async () => {
      harness = await harnessFor();
      expect(jsonOf(await run({ class_name: spec.className }))).toEqual({
        success: true,
        class_name: spec.className,
        transport_request: null,
        activated: false,
        message: `${spec.messageSubject} deleted successfully from ${spec.className}.`,
      });
    });
  });

  describe('활성화', () => {
    it('activate_on_delete를 안 주면 활성화 요청이 나가지 않는다', async () => {
      harness = await harnessFor();
      await run({ class_name: spec.className });
      expect(harness.calls().map((call) => call.path)).not.toContain(ACTIVATION_PATH);
    });

    it('활성화는 **해제 뒤**에 나간다 — 잠긴 채로 활성화하면 SAP이 거부한다', async () => {
      harness = await harnessFor();
      const payload = jsonOf(await run({ class_name: spec.className, activate_on_delete: true }));

      expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
        `POST ${CLASS_URI}`,
        `PUT ${INCLUDE_URI}`,
        `POST ${CLASS_URI}`,
        `POST ${ACTIVATION_PATH}`,
      ]);
      expect(harness.nth(3).query.get('method')).toBe('activate');
      expect(harness.nth(3).query.get('preauditRequested')).toBe('true');
      expect(harness.nth(3).headers['content-type']).toBe('application/vnd.sap.adt.activation+xml');
      expect(harness.nth(3).body).toContain(`adtcore:uri="${CLASS_URI}"`);
      expect(payload.activated).toBe(true);
    });

    it('D111 — 200에 실려 온 활성화 오류를 성공으로 접지 않는다', async () => {
      harness = await harnessFor({
        activation: activationBody([{ type: 'E', text: 'Syntax error in class' }]),
      });
      const result = await run({ class_name: spec.className, activate_on_delete: true });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('Activation failed');
      expect(textOf(result)).toContain('Syntax error in class');
    });

    it('D111 — 경고만 있는 활성화는 성공이다 (과수리 역검증)', async () => {
      harness = await harnessFor({
        activation: activationBody([{ type: 'W', text: 'Obsolete statement' }]),
      });
      const result = await run({ class_name: spec.className, activate_on_delete: true });
      expect(result.isError).toBe(false);
      expect(jsonOf(result).activated).toBe(true);
    });
  });

  describe('갈래', () => {
    it('class_name이 없으면 요청을 하나도 보내지 않는다', async () => {
      harness = await harnessFor();
      const result = await run({});
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe('Error: class_name is required');
      expect(harness.calls()).toHaveLength(0);
    });

    it('404는 인클루드 종류를 지목한다', async () => {
      harness = await harnessFor({ putStatus: 404, putBody: '<not-found/>' });
      expect(textOf(await run({ class_name: spec.className }))).toBe(
        `Error: ${spec.notFoundSubject} for ${spec.className} not found.`,
      );
    });

    it('423은 부모 클래스의 잠금 충돌이다', async () => {
      harness = await harnessFor({ lockStatus: 423, lockPayload: '<locked/>' });
      expect(textOf(await run({ class_name: spec.className }))).toBe(
        `Error: Class ${spec.className} is locked by another user.`,
      );
    });

    it('그 밖의 실패는 일반 문구로 올라온다 — **400 갈래가 없다**', async () => {
      harness = await harnessFor({ putStatus: 400, putBody: '<bad/>' });
      const text = textOf(await run({ class_name: spec.className }));
      expect(text).toContain(`Error: Failed to delete ${spec.failureSubject}: `);
      // 구에 400 전용 갈래가 없으므로 그 문구가 나오면 안 된다.
      expect(text).not.toContain('Bad request. Check if transport request');
    });
  });

  describeTierGate(spec.tool, { class_name: spec.className });
}
