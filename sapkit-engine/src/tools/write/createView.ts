/**
 * CreateView — 뷰(DDLS) 껍데기를 만든다. DDL 소스는 넣지 않는다(UpdateView의 몫).
 *
 * 구 핸들러: `engine/src/handlers/view/high/handleCreateView.ts`.
 * 와이어 근거는 `./internal/view.ts` 머리주석에 파일·줄로 모아 두었다.
 *
 * 순서는 **이름 검증 → 로그온 언어 조회 → 생성** 셋이고, 그것으로 끝난다.
 *
 * ## 생성 뒤 구문검사가 **없는** 것이 의도다
 *
 * 클래스·프로그램과 달리 여기서는 생성 후 검사를 돌리지 않는다. 벤더의 create가
 * 남기는 빈 DDL 껍데기는 구문상 유효하지 않아서("DDIC source code does not
 * contain a valid definition") 검사가 **언제나** 실패하기 때문이다 — 구 소스에
 * 그 근거가 주석으로 박혀 있다(`handleCreateView.ts:107-112`). 진짜 검증은
 * UpdateView의 쓰기 전 검사가 한다. 여기에 검사를 더하면 정상 생성이 통째로
 * 막힌다.
 *
 * ## 이름 검증의 **응답 본문은 읽지 않는다** (구 실측)
 *
 * `POST /sap/bc/adt/ddic/ddl/validation`을 부르지만 구 핸들러는 그 응답을 받아
 * 두기만 하고 판정하지 않는다(`handleCreateView.ts:80-85` — `await` 뒤 아무
 * 검사 없음). 즉 이 왕복은 **HTTP 오류일 때만** 생성을 막는다. `CreateProgram`이
 * `CHECK_RESULT`/`SEVERITY`를 파싱하는 것과 갈리는 자리이므로, 여기서 파싱을
 * 더하면 그것이 구와의 차이가 된다.
 *
 * ## 마스터 언어를 EN으로 박지 않는다
 *
 * DDLS create 서비스는 `masterLanguage`가 로그온 언어와 다르면 T100
 * `DDIC_ADT_DDLS/016`으로 **하드 거부**한다(HTTP 400 — 구 주석의 실측:
 * `create.js:29-36`, `handleCreateView.ts:87-93`). 그래서 생성 직전에 시스템의
 * 로그온 언어를 조회해 페이로드에 싣고, 조회가 안 되면 역사적 기본값 `EN`으로
 * 떨어진다. 조회 실패가 생성 실패가 되어서는 안 된다.
 *
 * ## 전송요청 검증은 구에서도 **아무 일도 하지 않는다**
 *
 * 구 핸들러가 부르는 `validateTransportRequest`는 본문이 비어 있는 no-op이다
 * (`engine/src/utils/transportValidation.ts:10-18` — "No strict validation").
 * 그래서 옮길 동작이 없다. 실제 판정은 SAP이 한다.
 */

import * as z from 'zod';

import type { AdtClient } from '../../adt';
import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import {
  ACCEPT_VALIDATION,
  describeFailure,
  errorResult,
  limitDescription,
  okResult,
} from './shared';
import { ACCEPT_VIEW, CT_VIEW, VIEW_ROOT, viewWriteUri } from './internal/view';

const SYSTEMINFO_PATH = '/sap/bc/adt/core/http/systeminformation';
const SYSTEMINFO_ACCEPT = 'application/vnd.sap.adt.core.http.systeminformation.v1+json';
const DEFAULT_MASTER_LANGUAGE = 'EN';

/**
 * 접속된 시스템의 로그온/마스터 언어. 구 `resolveLogonLanguage`
 * (`engine/src/lib/adtLogonLanguage.ts:47-73`)와 같은 엔드포인트·같은 Accept·같은
 * 폴백이다. 구는 접속 객체마다 캐시했지만 여기서는 캐시하지 않는다 — 생성은
 * 드물고, 캐시를 두면 도구 사이에 프로세스 전역 상태가 생긴다(D33이 그 계열을
 * 승계하지 않기로 한 자리다).
 */
async function resolveMasterLanguage(client: AdtClient): Promise<string> {
  try {
    const response = await client.request({
      method: 'GET',
      path: SYSTEMINFO_PATH,
      accept: SYSTEMINFO_ACCEPT,
    });
    const parsed = JSON.parse(response.body) as { language?: unknown };
    const language = typeof parsed.language === 'string' ? parsed.language.trim().toUpperCase() : '';
    // ADT 언어 코드는 1~3자다(E / EN / CS …). 모양이 다르면 쓰지 않는다.
    if (/^[A-Z]{1,3}$/.test(language)) return language;
  } catch {
    // 조회 불가 — 기본값으로.
  }
  return DEFAULT_MASTER_LANGUAGE;
}

export const createView = defineTool(
  {
    name: 'CreateView',
    description:
      'Create CDS View or Classic View in SAP. Creates the view object in initial state. Use UpdateView to set DDL source code afterwards.',
    inputSchema: {
      view_name: z.string().describe('View name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW).'),
      package_name: z
        .string()
        .describe('Package name (e.g., ZOK_LAB, $TMP for local objects)'),
      transport_request: z
        .string()
        .describe('Transport request number (required for transportable packages).')
        .optional(),
      description: z
        .string()
        .describe('Optional description (defaults to view_name).')
        .optional(),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    // 구 경로는 `handlers/view/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['view_name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.view_name || !args.package_name) {
      return errorResult('Missing required parameters: view_name and package_name');
    }

    const viewName = args.view_name.toUpperCase();
    const packageName = args.package_name;
    // 검증 왕복에 실리는 설명은 **자르지 않은 원문**이다. 60자 제한은 생성
    // 페이로드에서만 걸린다(`create.js:15` vs `validation.js:30`).
    const rawDescription = args.description || viewName;
    logger.info(`Starting view creation: ${viewName}`);

    try {
      const client = await context.getConnection();

      logger.debug(`Validating view: ${viewName}`);
      await client.request({
        method: 'POST',
        path: '/sap/bc/adt/ddic/ddl/validation',
        params: {
          objtype: 'ddls',
          objname: viewName,
          packagename: packageName,
          description: rawDescription,
        },
        accept: ACCEPT_VALIDATION,
      });
      logger.debug(`View validation passed: ${viewName}`);

      const masterLanguage = await resolveMasterLanguage(client);
      const description = limitDescription(rawDescription);

      // 구는 전송요청을 **trim 한 뒤 비어 있지 않을 때만** `corrNr`을 붙인다
      // (`create.js:18-20`). 공백만 든 값이 질의 인자로 새 나가지 않게 하는
      // 자리이므로 그대로 옮긴다.
      const transportRequest = args.transport_request?.trim();
      const corrNr = transportRequest && transportRequest.length > 0 ? transportRequest : undefined;

      const metadata =
        `<?xml version="1.0" encoding="UTF-8"?><ddl:ddlSource xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources" ` +
        `xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" ` +
        `adtcore:language="${masterLanguage}" adtcore:name="${viewName}" adtcore:type="DDLS/DF" ` +
        `adtcore:masterLanguage="${masterLanguage}">\n` +
        `  <adtcore:packageRef adtcore:name="${packageName}"/>\n` +
        `</ddl:ddlSource>`;

      logger.debug(`Creating view: ${viewName}`);
      await client.request({
        method: 'POST',
        path: VIEW_ROOT,
        params: { corrNr },
        body: metadata,
        contentType: CT_VIEW,
        accept: ACCEPT_VIEW,
      });
      logger.info(`View created: ${viewName}`);

      return okResult({
        success: true,
        view_name: viewName,
        package_name: packageName,
        transport_request: args.transport_request || null,
        type: 'DDLS',
        message: `View ${viewName} created successfully. Use UpdateView to set DDL source code.`,
        uri: viewWriteUri(viewName),
        steps_completed: ['validate', 'create'],
      });
    } catch (error) {
      // 구는 여기서 ADT 예외 본문을 뽑고 `[HTTP <status>]`를 덧붙였다. 신
      // 엔진은 같은 재료를 `describeFailure`의 결로 싣는다(D13 — 엔진 자체
      // 진단 문구). **SAP이 돌려준 문장 자체는 그대로 보존된다.**
      const message = describeFailure(error);
      logger.error(`Error creating view ${viewName}: ${message}`);
      return errorResult(message);
    }
  },
);
