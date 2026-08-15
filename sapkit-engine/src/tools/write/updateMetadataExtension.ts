/**
 * `UpdateMetadataExtension` — 메타데이터 확장(DDLX)의 소스를 갈아 끼운다.
 *
 * 선언은 구 번들의 발행 계약 그대로다(`harness/old-surface/m1-tools.json`의
 * `UpdateMetadataExtension` · 구 소스
 * `engine/src/handlers/ddlx/high/handleUpdateMetadataExtension.ts:16-49`).
 * 몸통의 대조 원본은 같은 파일 `:59-162`. 와이어 근거는
 * `./internal/metadataExtension` 머리주석에 파일·줄로 모아 두었다.
 *
 * 시퀀스는 **(잠금) → PUT → 쓰기 뒤 구문검사 → (해제) → (활성화)**다. 검사가 PUT
 * 뒤인 것은 구가 벤더의 저수준 `update(…, { lockHandle })`만 부르고
 * `runSyntaxCheck({ kind: 'metadataExtension' })`로 **서버에 올라간 인액티브 판**을
 * 컴파일하기 때문이다 — 인라인 소스 검사가 아니라 PUT 앞에 놓을 수 없다.
 *
 * ## `lock_handle`을 받으면 잠그지도 풀지도 않는다
 *
 * 구는 `lockedByUs = !args.lock_handle`로 갈라, 남이 준 핸들이면 **해제를 하지
 * 않는다**(`:74-75`·`:113-126`). 잠금 수명주기가 호출자에게 있다는 계약이므로
 * 그대로 옮긴다. 그래서 이 도구만 `client.withLock`을 쓰지 않는 갈래를 갖는다.
 *
 * ## 활성화 거짓 성공을 고친다 (차이 — `harness/DIVERGENCES.md` D103)
 *
 * 구는 활성화 응답을 **아무도 읽지 않고** `success: true`로 답한다. SAP은 활성화
 * 실패를 HTTP 200 + `<chkl:msg type="E">`로 돌려주므로 활성화되지 않은 것이
 * 활성화됐다고 보고된다. 여기서는 실패로 되돌린다 — `UpdateView`의 D66과 같은
 * 계열이다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 우리가 잠근 경우의 해제 실패는 여기서 오류가 된다. 구는 `finally`에서 경고로
 * 삼켰다. 잠금 수명주기는 이 판에서 접속 계층(`withLock`)이 소유한다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import type { ToolContext } from '../../server/toolDefinition';
import { isAlreadyCheckedMessage, messageOf } from './dataElementDomainCreate';
import {
  CT_ACTIVATION,
  SourceCheckFailure,
  activationErrors,
  assertNoCheckErrors,
  errorResult,
  okResult,
  parseActivationMessages,
  putSource,
} from './shared';
import {
  adtErrorMessage,
  checkStagedMetadataExtension,
  metadataExtensionCheckUri,
  metadataExtensionWriteUri,
} from './internal/metadataExtension';

export const updateMetadataExtension = defineTool(
  {
    name: 'UpdateMetadataExtension',
    description:
      'Update source code of an ABAP Metadata Extension (DDLX). Modifies Fiori UI annotations, field labels, search help, and list/object page layout for CDS views.',
    inputSchema: {
      name: z.string().describe('Metadata Extension name'),
      source_code: z.string().describe('New source code'),
      lock_handle: z
        .string()
        .describe('Lock handle from LockObject. If not provided, will attempt to lock internally.')
        .optional(),
      transport_request: z
        .string()
        .describe('Transport request number (required for transportable packages).')
        .optional(),
      activate: z.boolean().describe('Activate after update. Default: true').optional(),
    },
    available_in: ['onprem', 'cloud'],
    // 구 경로는 `handlers/ddlx/high/`이고, 채록본 `exposures`에서
    // connected_default·noProfile_default 둘에만 뜬다.
    sets: ['high'],
    kind: 'mutation',
    targetNames: ['name'],
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.name || !args.source_code) {
      return errorResult('Error: Missing required parameters');
    }

    const name = args.name.toUpperCase();
    const uri = metadataExtensionWriteUri(name);
    const shouldActivate = args.activate !== false;
    const sourceCode = args.source_code;

    try {
      const client = await context.getConnection();

      const write = async (lockHandle: string): Promise<void> => {
        await putSource(client, uri, lockHandle, sourceCode, args.transport_request);
        logger.debug(`DDLX source uploaded: ${name}`);

        // 구 `runRawCheckRun`은 "이미 검사됨"만 조용한 성공으로 접는다.
        let check;
        try {
          check = await checkStagedMetadataExtension(client, metadataExtensionCheckUri(name));
        } catch (error) {
          if (!isAlreadyCheckedMessage(messageOf(error))) throw error;
          logger.debug(`${name} was already checked - continuing`);
          check = undefined;
        }
        if (check) assertNoCheckErrors(check, 'Metadata Extension', name);
      };

      if (args.lock_handle) {
        // 남이 준 핸들이면 잠그지도 풀지도 않는다(머리주석 참조).
        await write(args.lock_handle);
      } else {
        await client.withLock(uri, (lock) => write(lock.handle));
      }
      logger.info(`DDLX updated: ${name}`);

      if (shouldActivate) {
        const activation = await client.request({
          method: 'POST',
          path: '/sap/bc/adt/activation',
          params: { method: 'activate', preauditRequested: 'true' },
          body:
            `<?xml version="1.0" encoding="UTF-8"?>\n` +
            `<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">\n` +
            `  <adtcore:objectReference adtcore:uri="${uri}" adtcore:name="${name}"/>\n` +
            `</adtcore:objectReferences>`,
          contentType: CT_ACTIVATION,
          accept: 'application/xml',
        });

        // D103 — 구는 이 응답을 읽지 않고 success:true를 돌려줬다.
        const failures = activationErrors(parseActivationMessages(activation.body));
        if (failures.length > 0) {
          throw new SourceCheckFailure(
            `Activation failed: metadata extension ${name} was not activated (${
              failures.length
            } error${failures.length === 1 ? '' : 's'}): ${failures
              .map((entry) => `${entry.line ? `[L${entry.line}] ` : ''}${entry.text}`)
              .join(' | ')}. The DDLX source is on SAP as an inactive version; the active version is unchanged.`,
            failures,
          );
        }
        logger.info(`DDLX activated: ${name}`);
      }

      return okResult({
        success: true,
        name,
        message: shouldActivate
          ? `Metadata Extension ${name} updated and activated successfully`
          : `Metadata Extension ${name} updated successfully`,
      });
    } catch (error) {
      // 구문검사·활성화 실패는 진단을 그대로 실어 올린다(접두사 없음 — 구 `:151-154`).
      if (error instanceof SourceCheckFailure) {
        logger.error(`Error updating DDLX ${name}: ${error.message}`);
        return errorResult(`Error: ${error.message}`);
      }
      const detail = adtErrorMessage(error, `Failed to update metadata extension ${name}`);
      logger.error(`Error updating DDLX ${name}: ${detail}`);
      return errorResult(`Error: ${detail}`);
    }
  },
);
