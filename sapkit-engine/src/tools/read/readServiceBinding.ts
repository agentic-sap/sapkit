/**
 * `ReadServiceBinding` — 서비스 바인딩(SRVB)의 페이로드와 메타데이터.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `ReadServiceBinding` · 구 소스
 * `engine/src/handlers/service_binding/readonly/handleReadServiceBinding.ts:9-24`).
 * 몸통의 대조 원본은 같은 파일 `:26-81`.
 *
 * 짝인 `GetServiceBinding`과 갈리는 자리 셋이다.
 *  - 구 트리에서 이쪽은 `readonly/`에 산다 → `sets: ['readonly']`.
 *  - GET을 **두 번** 보낸다. `readMetadata()`가 자기 안에서 `read()`를 다시 부르기
 *    때문이다(`AdtService.js:309-315`) — 두 요청의 주소·Accept가 **완전히 같다.**
 *    그래서 성공한 응답의 `source_code`와 `metadata`는 같은 문자열이다. 흉내가
 *    아니라 실측이며 도구 응답에 그대로 드러나므로 여기서 접지 않는다.
 *  - 실패를 삼켜 `success: true`에 `null`을 담는다.
 *
 * ## `version`도 `response_format`도 받지 않는다
 *
 * 이 도구의 발행 스키마는 인자가 `service_binding_name` 하나뿐이다. 그래서 두 GET
 * 모두 질의 인자가 없고, 본문은 **파싱하지 않은 원문 문자열**로 실린다 —
 * 짝인 `GetServiceBinding`이 `payload`를 파싱해 담는 것과 갈린다.
 *
 * ## 접속 획득은 두 try 밖이다
 *
 * 구도 그렇다(`handleReadServiceBinding.ts:36`). 안쪽에 넣으면 **접속이 아예 없는
 * 기동에서도 `success:true`가 나간다**.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { messageOf, ok, returnError } from './internal/results';
import { readServiceBinding as fetchServiceBinding } from './internal/serviceBindingRead';

export const readServiceBinding = defineTool(
  {
    name: 'ReadServiceBinding',
    description:
      '[read-only] Read ABAP service binding source/payload and metadata (package, responsible, description, etc.).',
    inputSchema: {
      service_binding_name: z.string().describe('Service binding name (e.g., ZUI_MY_BINDING).'),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/service_binding/readonly/`이고, 채록본 `exposures`의
    // 네 조건 전부에 뜬다.
    sets: ['readonly'],
    kind: 'read',
    targetNames: ['service_binding_name'],
  },
  async (context: ToolContext, args) => {
    try {
      const raw = args.service_binding_name ?? '';
      if (!raw) return returnError(new Error('service_binding_name is required'));

      // 구는 여기서 trim까지 한다(`:37`) — 이 계열만의 규칙이다.
      const name = raw.trim().toUpperCase();

      const client = await context.getConnection();

      let sourceCode: string | null = null;
      try {
        const response = await fetchServiceBinding(client, name);
        if (response && response.body) sourceCode = response.body;
      } catch (error) {
        context.logger.warn(`Could not read source for ${name}: ${messageOf(error)}`);
      }

      let metadata: string | null = null;
      try {
        const response = await fetchServiceBinding(client, name);
        if (response && response.body) metadata = response.body;
      } catch (error) {
        context.logger.warn(`Could not read metadata for ${name}: ${messageOf(error)}`);
      }

      return ok(
        JSON.stringify(
          {
            success: true,
            service_binding_name: name,
            source_code: sourceCode,
            metadata,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return returnError(error);
    }
  },
);
