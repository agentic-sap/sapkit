/**
 * DeleteServiceBinding — 서비스 바인딩(SRVB)을 SAP에서 **지운다.** 발행 중이면
 * 먼저 발행을 내린다.
 *
 * **오프라인 계약 시험은 「실제로 지운다」의 증거가 아니다.** 요구 증거 급이
 * `attended 실기`이고 이 판이 끝나도 **「지음 · 증거 대기」**에 머문다.
 *
 * ## 삭제 서비스를 쓰지만 **검사 걸음이 없다** (실측)
 *
 * 겉: `engine/src/handlers/service_binding/high/handleDeleteServiceBinding.ts:41-86`.
 * 사슬: `…/dist/core/service/AdtService.js`의 `delete()`.
 *
 * ```
 * (최선 노력) 발행취소 사전 걸음
 *   ⓐ GET  /sap/bc/adt/businessservices/bindings/{소문자}?version=active
 *   ⓑ 상태가 published && allowedAction=UNPUBLISH 이고 통로·이름을 알면
 *      ⓒ GET  같은 주소를 **한 번 더** (updateServiceBinding이 스스로 다시 읽는다)
 *      ⓓ POST /sap/bc/adt/businessservices/{odatav2|odatav4}/unpublishjobs
 *              ?servicename=…&serviceversion=…      (long 타임아웃)
 *   ⓔ 이 블록의 실패는 **통째로 삼킨다** — 구가 `catch {}`로 비워 두었다.
 * 본 삭제
 *   ① POST /sap/bc/adt/deletion/delete   (한 줄 XML · **검사 걸음 없음**)
 * ```
 *
 * 다른 12종이 `POST /deletion/check`를 먼저 치는 것과 **여기서 갈린다.** 전문도
 * 한 줄이고, 이송번호는 값이 없어도 **빈 값 태그**로 언제나 실린다
 * (`AdtService.js:59-63` — `transportRequest ?? ''`). 표준 배치가 값이 없을 때
 * `<del:transportNumber/>`를 쓰는 것과 다르다.
 *
 * 이름 표기는 `encodeURIComponent(이름.toLowerCase())` — SRVD·DDLX와 같은 규칙이며
 * `../read/internal/serviceBindingRead.ts`의 `serviceBindingUri`가 정본이다.
 * **`DeleteServiceDefinition`(SRVD)의 대문자 주소와 갈리는 자리다.**
 *
 * ## 잠금이 없다 — 벤더가 막아 둔다
 *
 * `AdtService.js:430-435`의 `lock()`/`unlock()`은 곧바로 "Lock is not supported for
 * service bindings via ADT API"를 던진다. 그래서 이 도구에 잠금 창이 없다.
 *
 * ## 구와 다른 것 — 차이 장부 **D115**
 *
 * 벤더 `deleteServiceBinding()`은 응답에 `assertDeletionSucceeded`를 걸지 **않는다.**
 * 삭제 서비스는 실패도 HTTP 200 + `del:isDeleted="false"`로 답하므로, 구는 지워지지
 * 않은 것을 `success: true`로 보고했다. 여기서는 다른 12종과 같은 판정을 건다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import {
  parseServiceBindingPayload,
  readServiceBinding,
  type ServiceBindingResponseFormat,
} from '../read/internal/serviceBindingRead';
import { serviceBindingUri } from '../read/internal/serviceBindingRead';
import {
  ACCEPT_DELETION,
  CT_DELETION,
  DELETION_DELETE_PATH,
  assertDeletionSucceeded,
} from './internal/deletion';
import {
  parseServiceBindingState,
  publicationJob,
  returnErrorText,
} from './internal/serviceBinding';
import { errorResult, okResult } from './shared';
import type { AdtClient } from '../../adt';

/** 벤더 `buildDeletionXml`(`AdtService.js:59-63`) — **한 줄 · 언제나 값 태그**. */
export function buildServiceBindingDeletionXml(
  bindingName: string,
  transportRequest?: string,
): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">' +
    `<del:object adtcore:uri="${serviceBindingUri(bindingName)}">` +
    `<del:transportNumber>${transportRequest ?? ''}</del:transportNumber>` +
    '</del:object></del:deletionRequest>'
  );
}

/**
 * 발행 중이면 내린다. **실패는 통째로 삼킨다** — 구가 `catch {}`로 비워 두었고,
 * 발행 상태를 못 읽었다고 삭제 자체를 막지는 않는다.
 */
async function unpublishIfNeeded(client: AdtClient, bindingName: string): Promise<void> {
  try {
    const active = await readServiceBinding(client, bindingName, 'active');
    const current = parseServiceBindingState(active?.body ?? '');
    if (!current.published || current.allowedAction !== 'UNPUBLISH') return;
    if (!current.serviceType || !current.serviceName) return;

    // 벤더 `updateServiceBinding`은 상태를 **다시 읽고** 판정한다. 그 왕복까지 옮긴다.
    const recheckResponse = await readServiceBinding(client, bindingName, 'active');
    const recheck = parseServiceBindingState(recheckResponse?.body ?? '');
    if (recheck.allowedAction !== 'UNPUBLISH') {
      throw new Error(
        `Invalid state transition: cannot unpublish service binding ${bindingName}. allowedAction=${
          recheck.allowedAction ?? 'UNKNOWN'
        }`,
      );
    }

    await publicationJob(
      client,
      'unpublish',
      current.serviceType,
      bindingName,
      current.serviceName,
      current.serviceVersion,
    );
  } catch {
    // best-effort: 읽기·발행취소가 실패하면 그냥 삭제를 시도한다(구 그대로).
  }
}

export const deleteServiceBinding = defineTool(
  {
    name: 'DeleteServiceBinding',
    description: 'Delete ABAP service binding via ADT Business Services endpoint.',
    inputSchema: {
      service_binding_name: z.string().describe('Service binding name to delete.'),
      transport_request: z
        .string()
        .describe('Optional transport request for deletion transport flow.')
        .optional(),
      response_format: z.enum(['xml', 'json', 'plain']).default('xml'),
    },
    available_in: ['onprem', 'cloud'],
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['service_binding_name'],
  },
  async (context, args) => {
    if (!args.service_binding_name) {
      return errorResult('Error: service_binding_name is required');
    }

    // 구는 여기서 **trim까지** 한다 — 다른 삭제 도구는 대문자화만 한다.
    const bindingName = args.service_binding_name.trim().toUpperCase();
    const responseFormat = (args.response_format ?? 'xml') as ServiceBindingResponseFormat;
    context.logger.info(`Deleting service binding: ${bindingName}`);

    try {
      const client = await context.getConnection();
      await unpublishIfNeeded(client, bindingName);

      const response = await client.request({
        method: 'POST',
        path: DELETION_DELETE_PATH,
        body: buildServiceBindingDeletionXml(bindingName, args.transport_request),
        contentType: CT_DELETION,
        accept: ACCEPT_DELETION,
        timeout: 'default',
      });
      // 장부 D115 — 구는 이 판정을 걸지 않아 거짓 성공을 보고했다.
      assertDeletionSucceeded(response.body, 'Service binding');

      context.logger.info(`DeleteServiceBinding completed successfully: ${bindingName}`);
      return okResult({
        success: true,
        service_binding_name: bindingName,
        response_format: responseFormat,
        status: response.status,
        payload: parseServiceBindingPayload(response.body, responseFormat),
      });
    } catch (error) {
      const message = returnErrorText(error);
      context.logger.error(`Error deleting service binding: ${message}`);
      return errorResult(`Error: ${message}`);
    }
  },
);
