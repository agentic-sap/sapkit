/**
 * CreateInclude — 진짜 PROG/I 인클루드를 만들고 메인 프로그램에 물린다.
 *
 * 구 핸들러는 `engine/src/handlers/include/high/handleCreateInclude.ts`.
 * CreateProgram으로 `program_type=include`를 만들면 PROG/**P** 껍데기가 나온다 —
 * 이 도구만 PROG/**I**를 만든다.
 *
 * 생성만으로는 인클루드가 쓰이지 않는다. 그래서 기본값으로 메인 프로그램 소스에
 * `INCLUDE <name>.` 한 줄을 넣고 메인을 활성화한다. 서로를 참조하는 인클루드를
 * 무더기로 만들 때는 그 활성화가 **반드시 실패**하므로(형제가 아직 없다),
 * `activate_main_program=false` + `skip_program_tree_check=true`로 미뤄 두고
 * 마지막에 ActivateObjects 한 번으로 묶는다.
 *
 * 되돌릴 수 없는 자리가 있다: 프로그램 트리 검사는 **생성과 메인 수정이 이미
 * 서버에 반영된 뒤**에 돈다. 실패해도 롤백하지 않으며, 그 사실을 문구에 적어
 * 호출자가 DeleteInclude로 되돌릴 수 있게 한다.
 */

import * as z from 'zod';

import { AdtError } from '../../adt';
import type { AdtClient } from '../../adt';
import { defineTool } from '../../server';
import type { ToolContext, ToolLogger } from '../../server';
import {
  ACCEPT_INCLUDE,
  CT_ACTIVATION_REQUEST,
  CT_INCLUDE,
  type CheckMessage,
  SourceCheckFailure,
  activateOne,
  activationErrors,
  assertNoCheckErrors,
  checkStored,
  describeFailure,
  encodeObjectName,
  errorResult,
  includeUri,
  limitDescription,
  okResult,
  parseActivationMessages,
  programUri,
  putSource,
} from './shared';

/**
 * 메인 프로그램 조작에 쓰는 URI — 구는 여기만 **대문자**를 쓴다
 * (`contextUri`·`containerRef`는 소문자). 규칙이 갈리는 자리라 따로 둔다.
 */
function mainProgramWriteUri(name: string): string {
  return `/sap/bc/adt/programs/programs/${encodeObjectName(name)}`;
}

interface InsertOutcome {
  readonly newSource: string;
  readonly inserted: boolean;
  readonly alreadyPresent: boolean;
}

/**
 * `INCLUDE <name>.`을 메인 소스에 끼워 넣는다. 마지막 INCLUDE 줄 뒤가 1순위,
 * 없으면 REPORT/PROGRAM 줄 뒤, 그것도 없으면 맨 앞이다. 주석 줄은 판정에서
 * 빠진다 — 주석 안의 INCLUDE를 실제 문장으로 오인하면 삽입 위치가 어긋난다.
 */
export function insertIncludeStatement(mainSource: string, includeName: string): InsertOutcome {
  const lowerInclude = includeName.toLowerCase();
  const newline = mainSource.includes('\r\n') ? '\r\n' : '\n';
  const lines = mainSource.split(/\r?\n/);

  const isComment = (line: string): boolean => {
    const trimmed = line.trimStart();
    return trimmed.startsWith('*') || trimmed.startsWith('"');
  };

  const alreadyRegex = new RegExp(`^\\s*INCLUDE\\s+${lowerInclude}\\s*\\.`, 'i');
  for (const line of lines) {
    if (isComment(line)) continue;
    if (alreadyRegex.test(line)) {
      return { newSource: mainSource, inserted: false, alreadyPresent: true };
    }
  }

  let lastIncludeIdx = -1;
  const existingIncludeRegex = /^\s*INCLUDE\s+\w+/i;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (isComment(line)) continue;
    if (existingIncludeRegex.test(line)) lastIncludeIdx = index;
  }

  const statement = `INCLUDE ${lowerInclude}.`;
  if (lastIncludeIdx >= 0) {
    lines.splice(lastIncludeIdx + 1, 0, statement);
  } else {
    let reportIdx = -1;
    const reportRegex = /^\s*(REPORT|PROGRAM)\s+/i;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (isComment(line)) continue;
      if (reportRegex.test(line)) {
        reportIdx = index;
        break;
      }
    }
    if (reportIdx >= 0) lines.splice(reportIdx + 1, 0, '', statement);
    else lines.unshift(statement);
  }

  return { newSource: lines.join(newline), inserted: true, alreadyPresent: false };
}

/** 메인 프로그램 소스를 읽고 → INCLUDE 문을 넣고 → 되쓰고 → (활성화). */
async function insertIntoMainProgram(
  client: AdtClient,
  logger: ToolLogger,
  options: {
    readonly mainProgram: string;
    readonly includeName: string;
    readonly transportRequest?: string;
    readonly activateMainProgram: boolean;
    readonly stepsCompleted: string[];
  },
): Promise<string> {
  const { mainProgram, includeName, stepsCompleted } = options;
  const baseUri = mainProgramWriteUri(mainProgram);

  const read = await client.request({ method: 'GET', path: `${baseUri}/source/main` });
  const currentSource = read.body;
  if (!currentSource) throw new Error('Main program source is empty or unreadable');

  const outcome = insertIncludeStatement(currentSource, includeName);
  if (outcome.alreadyPresent) {
    stepsCompleted.push('skip_insert_already_present');
    const note = `INCLUDE ${includeName} already present in ${mainProgram} — skipped insert.`;
    logger.info(note);
    return note;
  }
  if (!outcome.inserted) return `Insert into ${mainProgram} skipped (no change).`;

  await client.withLock(baseUri, async (lock) => {
    await putSource(client, baseUri, lock.handle, outcome.newSource, options.transportRequest);
    stepsCompleted.push('insert_into_main');
  });
  logger.info(`Inserted INCLUDE ${includeName} statement into ${mainProgram}`);

  if (!options.activateMainProgram) {
    stepsCompleted.push('skip_activate_main');
    return `INCLUDE ${includeName}. inserted into ${mainProgram}. Main program left inactive — call ActivateObjects to activate.`;
  }

  // 메인 활성화는 최선 노력이다(서로 참조하는 인클루드 무더기에서는 실패가
  // 정상이다). 다만 **삼키지는 않는다** — 실패 사실을 note에 적어 올린다.
  try {
    const body = await activateOne(client, baseUri, mainProgram, {
      contentType: CT_ACTIVATION_REQUEST,
      timeout: 'long',
    });
    const failures = activationErrors(parseActivationMessages(body));
    if (failures.length > 0) {
      return `INCLUDE ${includeName}. inserted into ${mainProgram}, but the main program did not activate: ${failures
        .map((entry) => entry.text)
        .join(' | ')}`;
    }
    stepsCompleted.push('activate_main');
    logger.info(`Main program ${mainProgram} activated`);
  } catch (error) {
    return `INCLUDE ${includeName}. inserted into ${mainProgram}, but main program activation failed: ${describeFailure(error)}`;
  }

  return `INCLUDE ${includeName}. inserted into ${mainProgram}.`;
}

export const createInclude = defineTool(
  {
    name: 'CreateInclude',
    description:
      'Create a new ABAP Include program (Type I, PROG/I) in SAP system. Creates the include object and registers it under the main program in D010INC. By default also auto-inserts an `INCLUDE <name>.` statement into the main program source so the include is actually used. Use UpdateInclude to set source code afterwards. Unlike CreateProgram with program_type=include (which creates PROG/P), this creates a proper PROG/I include. For mass-activation scenarios (many cross-referencing includes) pass source_code inline, set activate_main_program=false and skip_program_tree_check=true, then call ActivateObjects once with the full set.',
    inputSchema: {
      include_name: z
        .string()
        .describe(
          'Include program name (e.g., ZPAEK_TEST_INC01). Must follow SAP naming conventions (start with Z or Y).',
        ),
      main_program: z
        .string()
        .describe(
          'Name of the main/master program that will contain this include (e.g., ZPAEK_TEST003). Required for proper include registration and activation.',
        ),
      description: z
        .string()
        .describe('Include description (max 60 chars). If not provided, include_name will be used.')
        .optional(),
      package_name: z.string().describe('Package name (e.g., ZOK_LAB, $TMP for local objects).'),
      transport_request: z
        .string()
        .describe(
          'Transport request number (e.g., S4HK904224). Required for transportable packages. Optional for local ($TMP) objects.',
        )
        .optional(),
      insert_into_main: z
        .boolean()
        .describe(
          'Auto-insert `INCLUDE <name>.` statement into the main program source. Default: true. Set false to skip main-program modification.',
        )
        .optional(),
      source_code: z
        .string()
        .describe(
          'Optional include body. When provided, the handler also locks, writes the source, and unlocks the new include in a single call. Never activates — caller must run a separate activation (ActivateObjects for batch scenarios).',
        )
        .optional(),
      activate_main_program: z
        .boolean()
        .describe(
          'When inserting INCLUDE statement into the main program, also activate the main program afterwards. Default: true (existing behavior). Set false when batching many includes so that activation is deferred to a single ActivateObjects call.',
        )
        .optional(),
      skip_program_tree_check: z
        .boolean()
        .describe(
          'Skip the post-create program-tree syntax check. Default: false (existing behavior). Set true when batching many cross-referencing includes — an intermediate include in a cycle will necessarily fail the tree check while its siblings are still missing.',
        )
        .optional(),
    },
    available_in: ['onprem', 'legacy'],
    sets: ['high'],
    kind: 'mutation',
  },
  async (context: ToolContext, args) => {
    const { logger } = context;

    if (!args.include_name || !args.main_program || !args.package_name) {
      return errorResult(
        'Missing required parameters: include_name, main_program, and package_name',
      );
    }

    const includeName = args.include_name.toUpperCase();
    const mainProgram = args.main_program.toUpperCase();
    const description = limitDescription(args.description || includeName);
    const mainProgramUri = programUri(mainProgram);
    const baseUri = includeUri(includeName);
    const shouldInsertIntoMain = args.insert_into_main !== false;
    const activateMainProgram = args.activate_main_program !== false;
    const skipProgramTreeCheck = args.skip_program_tree_check === true;
    const inlineSourceCode =
      typeof args.source_code === 'string' && args.source_code.length > 0
        ? args.source_code
        : undefined;

    logger.info(`Starting include creation: ${includeName} (main program: ${mainProgram})`);

    const stepsCompleted: string[] = [];
    let insertNote: string | undefined;
    let inlineSourceNote: string | undefined;
    let checkWarnings: CheckMessage[] = [];

    try {
      const client = await context.getConnection();

      const metadata =
        `<?xml version="1.0" encoding="UTF-8"?><include:abapInclude xmlns:include="http://www.sap.com/adt/programs/includes" ` +
        `xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" adtcore:language="EN" ` +
        `adtcore:name="${includeName}" adtcore:type="PROG/I" adtcore:masterLanguage="EN">\n` +
        `  <adtcore:packageRef adtcore:name="${args.package_name}"/>\n` +
        `  <adtcore:containerRef adtcore:uri="${mainProgramUri}" adtcore:type="PROG/P" adtcore:name="${mainProgram}"/>\n` +
        `</include:abapInclude>`;

      await client.request({
        method: 'POST',
        path: '/sap/bc/adt/programs/includes',
        params: { corrNr: args.transport_request, contextUri: mainProgramUri },
        body: metadata,
        contentType: CT_INCLUDE,
        accept: ACCEPT_INCLUDE,
      });
      stepsCompleted.push('create');
      logger.info(`Include created: ${includeName}`);

      if (shouldInsertIntoMain) {
        try {
          insertNote = await insertIntoMainProgram(client, logger, {
            mainProgram,
            includeName,
            transportRequest: args.transport_request,
            activateMainProgram,
            stepsCompleted,
          });
        } catch (error) {
          // 인클루드는 이미 만들어졌다. 삽입 실패는 그 사실을 지우지 않으므로
          // 연성 오류로 알린다.
          insertNote = `Include created, but insert into main program failed: ${describeFailure(error)}`;
          logger.warn(insertNote);
        }
      }

      if (inlineSourceCode !== undefined) {
        try {
          await client.withLock(baseUri, async (lock) => {
            await putSource(
              client,
              baseUri,
              lock.handle,
              inlineSourceCode,
              args.transport_request,
            );
            stepsCompleted.push('inline_source');
          });
          inlineSourceNote = `Inline source_code (${inlineSourceCode.length} bytes) written — not yet activated.`;
        } catch (error) {
          inlineSourceNote = `Include created, but inline source_code write failed: ${describeFailure(error)}. Use UpdateInclude to retry.`;
          logger.warn(inlineSourceNote);
        }
      }

      if (skipProgramTreeCheck) {
        stepsCompleted.push('skip_program_tree_check');
      } else {
        try {
          // 프로그램 URI 하나만 실어 보내면 SAP이 트리 전체(메인 + 인클루드)를
          // 한 번에 컴파일한다. 인클루드 URI를 함께 넣으면 개별 검사로 갈라지며
          // 교차 참조 오류가 조용히 빠진다 — 넣지 않는다.
          const check = await checkStored(client, mainProgramUri, 'inactive');
          assertNoCheckErrors(check, 'Program tree', mainProgram);
          checkWarnings = [...check.warnings];
          stepsCompleted.push('check_new_code');
        } catch (error) {
          if (error instanceof SourceCheckFailure) {
            throw new SourceCheckFailure(
              `Include ${includeName} was created and main program ${mainProgram} was modified, but the resulting program tree has syntax errors. ${error.message}. Fix the main program or call DeleteInclude to roll back.`,
              error.checkErrors,
              error.checkWarnings,
            );
          }
          throw error;
        }
      }

      const notes = [insertNote, inlineSourceNote].filter(Boolean).join(' ');
      return okResult({
        success: true,
        include_name: includeName,
        main_program: mainProgram,
        package_name: args.package_name,
        transport_request: args.transport_request || null,
        type: 'PROG/I',
        source_written: inlineSourceCode !== undefined,
        activated: false,
        message: notes
          ? `Include ${includeName} created. ${notes}`
          : `Include ${includeName} created successfully under main program ${mainProgram}. Use UpdateInclude to set source code.`,
        uri: baseUri.toLowerCase(),
        steps_completed: stepsCompleted,
        insert_note: insertNote || null,
        inline_source_note: inlineSourceNote || null,
        check_warnings: checkWarnings.length > 0 ? checkWarnings : undefined,
      });
    } catch (error) {
      if (error instanceof SourceCheckFailure) {
        logger.error(`Error creating include ${includeName}: ${error.message}`);
        return errorResult(error.message);
      }

      let message = describeFailure(error);
      if (error instanceof AdtError && !error.adtMessage) {
        // SAP이 본문에 이유를 안 담아 준 흔한 두 경우만 사람 말로 바꾼다.
        if (error.status === 409) message = `Include ${includeName} already exists.`;
        else if (error.status === 400) {
          message = 'Bad request (400). Check include name, package name, and transport request.';
        }
      }
      logger.error(`Error creating include ${includeName}: ${message}`);
      return errorResult(`Failed to create include ${includeName}: ${message}`);
    }
  },
);
