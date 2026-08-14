/**
 * 꼬리 **삭제 계열**의 시험 장치.
 *
 * 삭제 서비스(`/sap/bc/adt/deletion/*`)를 타는 12종은 요청 두 개의 모양이 같고
 * **값만** 다르다(오브젝트 URI · 이름 표기 · 전문 배치 · 세션 · 문구). 그 값들을
 * 도구마다 `StandardDeletionSpec`으로 적어 넣고, 공통 판정은 여기서 한 번만 짓는다.
 *
 * **이것은 "닮았으니 한 벌로 뭉뚱그린다"가 아니다.** spec의 값은 전부 종류마다
 * 따로 실측한 것이고(근거는 각 도구 모듈의 머리주석과
 * `../internal/deletion.ts`의 표), 여기 있는 것은 그 값이 실제로 와이어에
 * 나타나는지 보는 판정뿐이다. 값이 하나라도 어긋나면 그 도구의 시험이 깨진다.
 *
 * **기대값은 내 구현이 아니라 구의 실측에서 온다** — 전문 조립기를 여기서 다시
 * 짓는 것도 그래서다(`../internal/deletion.ts`의 것을 가져다 쓰면 구현이 구현을
 * 검사하는 자기확인이 된다).
 *
 * 파일 이름이 `*.test.ts`가 아니므로 jest가 시험으로 고르지 않는다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { DeploymentType } from '../../../contracts';
import type { SapTool, ToolResult } from '../../../server';
import { cleanupTierProbeDirs, probeTier } from '../../__tests__/tierProbe';
import { type WriteHarness, adtException, jsonOf, startWriteHarness, textOf, xml } from './harness';
import { publishedDeclaration, publishedSurfaceOf } from './tableStructurePublication';

export const CHECK_PATH = '/sap/bc/adt/deletion/check';
export const DELETE_PATH = '/sap/bc/adt/deletion/delete';

const M1_TOOLS = path.resolve(__dirname, '../../../../harness/old-surface/m1-tools.json');

/** 채록본의 4개 노출 조건 중 이 도구가 뜨는 것들. */
export function exposureMemberships(name: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(M1_TOOLS, 'utf8')) as {
    exposures: Record<string, { names: string[] }>;
  };
  return Object.entries(parsed.exposures)
    .filter(([, value]) => value.names.includes(name))
    .map(([key]) => key)
    .sort();
}

// ── 삭제 서비스의 응답 모양 ─────────────────────────────────────────────────

/** 삭제 성공. */
export function deletedBody(uri: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
    `<del:object adtcore:uri="${uri}" del:isDeleted="true"/>` +
    '</del:deletionResult>'
  );
}

/** 실패를 **HTTP 200에 실어** 보내는 모양 — 이 계열의 거짓 성공 함정. */
export function notDeletedBody(uri: string, text?: string): string {
  const message = text ? `<del:message><del:text>${text}</del:text></del:message>` : '';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
    `<del:object adtcore:uri="${uri}" del:isDeleted="false">${message}</del:object>` +
    '</del:deletionResult>'
  );
}

// ── 구가 보내던 전문 (여기서 다시 짓는다 — 자기확인 방지) ───────────────────

/** `dist/core/<종류>/delete.js`의 `checkDeletion` 전문. */
export function expectedCheckBody(uri: string, layout: 'standard' | 'compact'): string {
  if (layout === 'compact') {
    return (
      '<?xml version="1.0" encoding="UTF-8"?><del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
      `    <del:object adtcore:uri="${uri}"/>\n` +
      '</del:checkRequest>'
    );
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<del:checkRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
    `  <del:object adtcore:uri="${uri}"/>\n` +
    '</del:checkRequest>'
  );
}

/** `dist/core/<종류>/delete.js`의 `delete*` 전문. */
export function expectedDeleteBody(
  uri: string,
  transportTag: string,
  layout: 'standard' | 'compact',
): string {
  if (layout === 'compact') {
    return (
      '<?xml version="1.0" encoding="UTF-8"?><del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
      `    <del:object adtcore:uri="${uri}">\n` +
      `        ${transportTag}\n` +
      '    </del:object>\n' +
      '</del:deletionRequest>'
    );
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">\n' +
    `  <del:object adtcore:uri="${uri}">\n` +
    `    ${transportTag}\n` +
    '  </del:object>\n' +
    '</del:deletionRequest>'
  );
}

// ── 시험 서버 ───────────────────────────────────────────────────────────────

export interface DeletionOverrides {
  readonly checkStatus?: number;
  readonly checkBody?: string;
  readonly deleteStatus?: number;
  readonly deleteBody?: string;
  /** 삭제 응답의 기본 본문에 실릴 오브젝트 URI. */
  readonly objectUri?: string;
}

export function startDeletionHarness(overrides: DeletionOverrides = {}): Promise<WriteHarness> {
  return startWriteHarness((request, response) => {
    if (request.path === CHECK_PATH) {
      return xml(
        response,
        overrides.checkBody ?? '<del:checkResult/>',
        overrides.checkStatus ?? 200,
      );
    }
    if (request.path === DELETE_PATH) {
      return xml(
        response,
        overrides.deleteBody ?? deletedBody(overrides.objectUri ?? '/x'),
        overrides.deleteStatus ?? 200,
      );
    }
    return xml(response, '<unexpected/>', 500);
  });
}

// ── 공통 시험 한 벌 ─────────────────────────────────────────────────────────

export interface StandardDeletionSpec {
  readonly tool: SapTool;
  /** 발행 이름. */
  readonly name: string;
  /** 최소 인자 — 이름만. */
  readonly args: Record<string, unknown>;
  /** 소문자로 준 같은 인자. URI 대문자 정규화를 보는 자리다. */
  readonly lowerArgs?: Record<string, unknown>;
  /** 삭제 서비스 전문에 실려야 하는 주소. */
  readonly objectUri: string;
  readonly availableIn: readonly DeploymentType[];
  readonly targetNames: readonly unknown[];
  readonly layout: 'standard' | 'compact';
  /** 삭제 걸음이 stateful로 나가야 하는가. */
  readonly stateful: boolean;
  /** 벤더가 거짓 성공 판정 문구 앞에 붙이는 이름. */
  readonly vendorLabel: string;
  /** 겉 핸들러가 404·423 문구에 쓰는 이름. */
  readonly statusLabel: string;
  /** 겉 핸들러의 일반 실패 문구 `Failed to delete <subject>: …`. */
  readonly subject: string;
  /** 이송번호별 성공 응답. */
  readonly successPayload: (transport: string | null) => Record<string, unknown>;
  /** 필수 인자를 뺐을 때의 문구(접두사 포함). */
  readonly missingArgMessage: string;
  /** 필수 인자를 뺀 인자 한 벌. 기본은 빈 객체. */
  readonly missingArgs?: Record<string, unknown>;
}

/**
 * 삭제 서비스 12종의 공통 판정. 각 도구 시험 파일이 자기 spec으로 부른다.
 *
 * 붙잡는 것 넷(절차서 5단계): 발행 계약 · 노출 선언 · 와이어 · 갈래. 여기에
 * 이 묶음의 주 증거인 **안전 음성시험**이 더해진다.
 */
export function describeStandardDeletion(spec: StandardDeletionSpec): void {
  const run = (harness: WriteHarness, args: Record<string, unknown>): Promise<ToolResult> =>
    Promise.resolve(spec.tool.handler(harness.context, args));

  let harness: WriteHarness;
  afterEach(async () => {
    if (harness) await harness.close();
  });
  afterAll(() => {
    cleanupTierProbeDirs();
  });

  describe('발행 계약', () => {
    it('tools/list 선언이 구 번들 채록본과 글자까지 같다', async () => {
      expect(await publishedSurfaceOf(spec.tool)).toEqual(publishedDeclaration(spec.name));
    });

    it('노출 선언과 정책 분류는 구 핸들러의 자리를 그대로 옮겼다', () => {
      expect(spec.tool.definition.sets).toEqual(['high']);
      expect(spec.tool.definition.available_in).toEqual(spec.availableIn);
      expect(spec.tool.definition.kind).toBe('mutation');
      expect(spec.tool.definition.targetNames).toEqual(spec.targetNames);
    });

    it('채록본의 노출 조건 소속과 어긋나지 않는다 — 읽기 표면에는 없다', () => {
      const memberships = exposureMemberships(spec.name);
      expect(memberships).not.toContain('connected_readonly');
      expect(memberships).not.toContain('noProfile_readonly');
      expect(memberships).toContain('connected_default');
      // 채록본의 배포 축과 선언이 어긋나면 여기서 드러난다.
      expect(memberships.includes('noProfile_default')).toBe(spec.availableIn.includes('cloud'));
    });
  });

  describe('와이어 — 검사 → 삭제 두 걸음', () => {
    it('두 요청을 순서대로 보내고 다른 주소는 치지 않는다', async () => {
      harness = await startDeletionHarness({ objectUri: spec.objectUri });
      const result = await run(harness, { ...spec.args });
      expect(result.isError).toBe(false);
      expect(harness.calls().map((call) => `${call.method} ${call.path}`)).toEqual([
        `POST ${CHECK_PATH}`,
        `POST ${DELETE_PATH}`,
      ]);
    });

    it('검사 걸음의 헤더와 전문이 구와 같다', async () => {
      harness = await startDeletionHarness({ objectUri: spec.objectUri });
      await run(harness, { ...spec.args });
      const check = harness.nth(0);
      expect(check.headers['content-type']).toBe(
        'application/vnd.sap.adt.deletion.check.request.v1+xml',
      );
      expect(check.headers['accept']).toBe(
        'application/vnd.sap.adt.deletion.check.response.v1+xml',
      );
      expect(check.body).toBe(expectedCheckBody(spec.objectUri, spec.layout));
    });

    it('삭제 걸음의 헤더와 전문이 구와 같고 이송번호가 실린다', async () => {
      harness = await startDeletionHarness({ objectUri: spec.objectUri });
      await run(harness, { ...spec.args, transport_request: 'E19K905635' });
      const remove = harness.nth(1);
      expect(remove.headers['content-type']).toBe(
        'application/vnd.sap.adt.deletion.request.v1+xml',
      );
      expect(remove.headers['accept']).toBe('application/vnd.sap.adt.deletion.response.v1+xml');
      expect(remove.body).toBe(
        expectedDeleteBody(
          spec.objectUri,
          '<del:transportNumber>E19K905635</del:transportNumber>',
          spec.layout,
        ),
      );
    });

    it('이송번호가 없으면 빈 태그가 나간다', async () => {
      harness = await startDeletionHarness({ objectUri: spec.objectUri });
      await run(harness, { ...spec.args });
      expect(harness.nth(1).body).toBe(
        expectedDeleteBody(spec.objectUri, '<del:transportNumber/>', spec.layout),
      );
    });

    it(
      spec.layout === 'standard'
        ? '공백뿐인 이송번호도 빈 태그다 (구는 trim으로 판정한다)'
        : '공백뿐인 이송번호는 값으로 실린다 (구는 truthy로만 판정한다)',
      async () => {
        harness = await startDeletionHarness({ objectUri: spec.objectUri });
        await run(harness, { ...spec.args, transport_request: '   ' });
        expect(harness.nth(1).body).toBe(
          expectedDeleteBody(
            spec.objectUri,
            spec.layout === 'standard'
              ? '<del:transportNumber/>'
              : '<del:transportNumber>   </del:transportNumber>',
            spec.layout,
          ),
        );
      },
    );

    it(
      spec.stateful
        ? '삭제 걸음만 stateful로 나가고 finally에서 되돌아온다'
        : '두 걸음 모두 stateless로 나간다',
      async () => {
        harness = await startDeletionHarness({ objectUri: spec.objectUri });
        await run(harness, { ...spec.args });
        expect(harness.nth(0).headers['x-sap-adt-sessiontype']).toBeUndefined();
        expect(harness.nth(1).headers['x-sap-adt-sessiontype']).toBe(
          spec.stateful ? 'stateful' : undefined,
        );
        await run(harness, { ...spec.args });
        expect(harness.nth(2).headers['x-sap-adt-sessiontype']).toBeUndefined();
      },
    );

    if (spec.lowerArgs) {
      it('소문자로 줘도 URI에는 구가 보내던 표기로 실린다', async () => {
        harness = await startDeletionHarness({ objectUri: spec.objectUri });
        await run(harness, { ...spec.lowerArgs });
        expect(harness.nth(0).body).toContain(`adtcore:uri="${spec.objectUri}"`);
        expect(harness.nth(1).body).toContain(`adtcore:uri="${spec.objectUri}"`);
      });
    }

    it('성공 응답은 구의 칸 그대로다', async () => {
      harness = await startDeletionHarness({ objectUri: spec.objectUri });
      expect(jsonOf(await run(harness, { ...spec.args, transport_request: 'E19K905635' }))).toEqual(
        spec.successPayload('E19K905635'),
      );
      expect(jsonOf(await run(harness, { ...spec.args }))).toEqual(spec.successPayload(null));
    });
  });

  describe('HTTP 200에 실려 온 삭제 실패를 성공으로 접지 않는다', () => {
    it('isDeleted="false"면 실패다 — 이유 문구를 그대로 싣는다', async () => {
      harness = await startDeletionHarness({
        deleteBody: notDeletedBody(spec.objectUri, 'Object is still used'),
      });
      const result = await run(harness, { ...spec.args });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(
        `Error: Failed to delete ${spec.subject}: ${spec.vendorLabel} deletion failed: Object is still used`,
      );
    });

    it('이유 문구가 없으면 구의 기본 문구로 떨어진다', async () => {
      harness = await startDeletionHarness({ deleteBody: notDeletedBody(spec.objectUri) });
      expect(textOf(await run(harness, { ...spec.args }))).toBe(
        `Error: Failed to delete ${spec.subject}: ${spec.vendorLabel} deletion failed: ` +
          'the deletion service reported isDeleted="false"',
      );
    });

    it('deletionResult를 말하지 않는 본문은 판정하지 않는다 (구와 같은 유보)', async () => {
      harness = await startDeletionHarness({ deleteBody: '<del:somethingElse/>' });
      expect((await run(harness, { ...spec.args })).isError).toBe(false);
    });
  });

  describe('갈래', () => {
    it('필수 인자가 없으면 요청을 하나도 보내지 않는다', async () => {
      harness = await startDeletionHarness({ objectUri: spec.objectUri });
      const result = await run(harness, { ...(spec.missingArgs ?? {}) });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(spec.missingArgMessage);
      expect(harness.calls()).toHaveLength(0);
    });

    it('404는 "이미 지워졌을 수 있다"로 답한다', async () => {
      harness = await startDeletionHarness({ checkStatus: 404, checkBody: '<not-found/>' });
      const name = String(Object.values(spec.args)[0]);
      expect(textOf(await run(harness, { ...spec.args }))).toBe(
        `Error: ${spec.statusLabel} ${name} not found. It may already be deleted.`,
      );
    });

    it('423은 남의 잠금이다', async () => {
      harness = await startDeletionHarness({ deleteStatus: 423, deleteBody: '<locked/>' });
      const name = String(Object.values(spec.args)[0]);
      expect(textOf(await run(harness, { ...spec.args }))).toBe(
        `Error: ${spec.statusLabel} ${name} is locked by another user. Cannot delete.`,
      );
    });

    it('400은 이송번호를 되묻는다 — **예외 XML보다 상태 코드가 먼저다**', async () => {
      harness = await startDeletionHarness({
        deleteStatus: 400,
        deleteBody: adtException('ExceptionResourceNoAccess', 'Transport request required'),
      });
      expect(textOf(await run(harness, { ...spec.args }))).toBe(
        'Error: Bad request. Check if transport request is required and valid.',
      );
    });

    it('그 밖의 상태에서는 예외 XML의 문구를 SAP Error로 싣는다', async () => {
      harness = await startDeletionHarness({
        deleteStatus: 500,
        deleteBody: adtException('ExceptionInternal', 'Deletion service unavailable'),
      });
      expect(textOf(await run(harness, { ...spec.args }))).toBe(
        'Error: SAP Error: Deletion service unavailable',
      );
    });
  });

  describeTierGate(spec.tool, spec.args);
}

/**
 * tier 게이트 음성시험 — **이 묶음의 주 증거.**
 *
 * `isError`만 보면 헛돈다(게이트를 들어내도 접속 공장이 던져서 참이 된다). 판정은
 * **접속 시도 횟수**로 한다 — 게이트가 앞에서 막았다면 0이다.
 */
export function describeTierGate(tool: SapTool, args: Record<string, unknown>): void {
  describe('tier 게이트 (음성시험) — 거부 시 접속 시도 0회', () => {
    it.each(['QA', 'PRD'])('%s tier에서 거부한다', async (tier) => {
      const probe = await probeTier(tool, tier, args);
      expect(probe.isError).toBe(true);
      expect(probe.text).toContain('ERR_READONLY_TIER');
      expect(probe.text).toContain('mutates SAP objects');
      expect(probe.connections).toBe(0);
    });

    it('tier 미해석에서도 거부한다 (fail-closed)', async () => {
      const probe = await probeTier(tool, '', args);
      expect(probe.isError).toBe(true);
      expect(probe.text).toContain('ERR_READONLY_TIER');
      expect(probe.connections).toBe(0);
    });

    it('DEV에서는 게이트를 지나 접속까지 간다 (과수리 역검증)', async () => {
      const probe = await probeTier(tool, 'DEV', args);
      expect(probe.connections).toBe(1);
      expect(probe.text).not.toContain('ERR_READONLY_TIER');
    });
  });
}
