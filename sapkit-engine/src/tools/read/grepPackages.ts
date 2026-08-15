/**
 * GrepPackages — 패키지 통째로 소스를 정규식으로 훑는다.
 *
 * `GrepObjects`가 "이 오브젝트들을 훑어라"라면 이쪽은 "이 패키지 안의 것을 전부
 * 훑어라"다. 그래서 훑기 **전에 목록을 만드는 단계**가 하나 더 있다
 * (`internal/packageContents.ts`).
 *
 * ## 참조 원본 (읽은 자취)
 *  - 겉: `engine/src/handlers/search/readonly/handleGrepPackages.ts`
 *  - 목록 만들기: `@babamba2/mcp-abap-adt-clients/dist/core/shared/packageContentsList.js:103-237`
 *    → 같은 패키지 `dist/core/shared/nodeStructure.js:29-56` (POST 와이어)
 *  - 소스 읽기: `engine/src/lib/objectSourceFetch.ts` (두 Grep 도구의 공용 분배기)
 *  - 훑기: `engine/src/lib/sourceGrep.ts`
 *
 * ## `GrepObjects`와 무엇이 다른가 — 실측
 *
 * | 자리 | GrepObjects | GrepPackages |
 * |---|---|---|
 * | 대상 지정 | `objects[]`(타입+이름) 1–50 | `packages[]`(이름) 1–10 |
 * | 목록 만들기 | 없음 — 준 것만 읽는다 | 패키지마다 노드 구조 왕복 `1 + 종류수` |
 * | `max_results` 기본값 | 100 | **200** |
 * | 예산 소진 뒤 | **이미 다 받아 온 뒤** 훑기만 건너뛴다 | **가져오지도 않는다** (`capReached`) |
 * | 소스 없는 타입 | `skipped`에 이유를 남긴다 | 목록 단계에서 **조용히 뺀다** |
 * | 함수모듈(FUNC) | `skipped`에 긴 이유를 남긴다 | 목록 단계에서 **조용히 뺀다** |
 * | 응답 필드 | 4개 | 4개 + `packages_scanned`·`objects_scanned`·`objects_skipped` |
 * | 훑기 순서 | 입력 순서대로 순차 집계 | 동시 5벌, 완료 순서대로 집계 |
 *
 * 「조용히 뺀다」가 특히 중요하다. 패키지 하나에는 테이블·도메인·함수모듈이
 * 수십 벌씩 들어 있고, 그것을 전부 `skipped`에 적으면 답이 건너뛴 것들의 목록이
 * 된다. 구가 그렇게 지은 이유가 겉 핸들러 `:148-151`의 주석에 적혀 있다.
 *
 * 예산 소진의 차이도 실동작이 갈리는 자리다. `GrepObjects`는 소스를 **먼저 전부**
 * 받아 두고 순수 집계 함수(`aggregateGrepResults`)에 넘기므로 `max_results`가
 * 작아도 왕복 수가 줄지 않는다. `GrepPackages`는 훑으면서 예산을 세고, 바닥나면
 * 남은 오브젝트를 **가져오지 않는다** — 발행 설명의 "Once reached, remaining
 * objects are not fetched"가 그 뜻이다.
 */

import * as z from 'zod';

import { defineTool } from '../../server/toolDefinition';
import {
  MAX_LINES_PER_OBJECT,
  compileGrepRegex,
  grepText,
  runWithConcurrency,
  type ObjectGrepResult,
} from './internal/grep';
import { classifySourceType, fetchObjectSource, type SourceObjectCode } from './internal/objectSource';
import { getPackageContentsList } from './internal/packageContents';
import { failure, messageOf, ok } from './internal/results';

const MAX_PACKAGES = 10;
const FETCH_CONCURRENCY = 5;

interface Candidate {
  readonly object_type: SourceObjectCode;
  readonly object_name: string;
}

export const grepPackages = defineTool(
  {
    name: 'GrepPackages',
    description:
      "[read-only] Search ABAP source code for a regex pattern across every object in one or more packages, in a single call — finds matching lines (with optional context) instead of listing then reading objects one by one. Scans CLAS, PROG, INTF, INCL, and FUGR (function group) objects; other repository object types (tables, data elements, domains, etc.) are skipped since they carry no source text. Optionally recurses into subpackages and can filter to specific object types (e.g. ['CLAS','PROG']).",
    inputSchema: {
      packages: z.array(z.string()).describe('Package names to search (1-10 entries).'),
      pattern: z
        .string()
        .describe('JavaScript regular expression source to search for (e.g. "SELECT\\\\s+\\\\*").'),
      case_insensitive: z
        .boolean()
        .optional()
        .describe('Case-insensitive match. Default: false.'),
      context_lines: z
        .number()
        .default(0)
        .describe('Number of lines of context before/after each match (0-5). Default: 0.'),
      max_results: z
        .number()
        .default(200)
        .describe(
          'Maximum total matches to return across all objects. Once reached, remaining objects are not fetched. Default: 200.',
        ),
      include_subpackages: z
        .boolean()
        .optional()
        .describe('Recurse into subpackages. Default: false.'),
      object_types: z
        .array(z.string())
        .optional()
        .describe(
          "Optional filter to only scan these object types (e.g. ['CLAS','PROG']). Allowed: CLAS, PROG, INTF, INCL, FUGR. If omitted, all source-bearing types are scanned.",
        ),
    },
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
    // 응답에 **오브젝트 원본 소스가 실린다** — `GrepObjects`와 같은 이유로
    // 대상을 고객 네임스페이스로 묶는다. `packages`의 원소는 객체가 아니라
    // 문자열이라 원소 키가 없다: 추출기는 키를 못 찾으면 원소 자체를 이름으로
    // 본다(`harness/targetGuard.ts:61-66`).
    targetNames: [{ arg: 'packages', element: 'name' }],
  },
  async (context, args) => {
    try {
      const requested = args.packages;
      if (!Array.isArray(requested) || requested.length === 0) {
        throw new Error('packages must be a non-empty array (1-10 entries)');
      }
      if (requested.length > MAX_PACKAGES) {
        throw new Error(`packages must contain at most ${MAX_PACKAGES} entries`);
      }

      const caseInsensitive = args.case_insensitive === true;
      const contextLines = args.context_lines ?? 0;
      const maxResults = args.max_results ?? 200;
      const includeSubpackages = args.include_subpackages === true;
      // 필터도 같은 분류기를 지난다 — `CLAS/OC`처럼 써도 받는다. FUNC는 애초에
      // 훑을 수 없으므로 필터에서도 뺀다(구 `:120-126`).
      const typeFilter = Array.isArray(args.object_types)
        ? new Set(
            args.object_types
              .map((type) => classifySourceType(type))
              .filter((code): code is SourceObjectCode => !!code && code !== 'FUNC'),
          )
        : undefined;

      // 나쁜 정규식은 SAP에 한 바이트도 나가기 전에 걸러진다.
      const regex = compileGrepRegex(args.pattern, caseInsensitive);

      const client = await context.getConnection();

      // 1. 패키지 내용을 편다.
      const candidates: Candidate[] = [];
      for (const rawName of requested) {
        const packageName = String(rawName ?? '')
          .trim()
          .toUpperCase();
        if (!packageName) continue;
        const items = await getPackageContentsList(client, packageName, {
          includeSubpackages,
          includeDescriptions: false,
        });
        for (const item of items) {
          if (item.isPackage) continue;
          const code = classifySourceType(item.adtType);
          // 소스가 없는 타입과 함수모듈은 **조용히** 뺀다 — 여기서 이유를 남기면
          // 함수그룹 하나마다 함수모듈 수십 줄이 `skipped`를 채운다.
          if (!code || code === 'FUNC') continue;
          if (typeFilter && !typeFilter.has(code)) continue;
          candidates.push({ object_type: code, object_name: item.name });
        }
      }

      // 2. 예산을 세면서 훑는다. 바닥나면 남은 것은 가져오지도 않는다.
      const results: ObjectGrepResult[] = [];
      const skipped: Array<{ object: string; reason: string }> = [];
      let totalMatches = 0;
      let objectsScanned = 0;
      let capReached = false;

      await runWithConcurrency(candidates, FETCH_CONCURRENCY, async (candidate) => {
        const label = `${candidate.object_type} ${candidate.object_name}`;
        if (capReached) {
          skipped.push({ object: label, reason: 'max_results reached; object not scanned' });
          return;
        }

        const { source, skipReason } = await fetchObjectSource(
          client,
          'GrepPackages',
          candidate.object_type,
          candidate.object_name,
          (message) => context.logger.warn(message),
        );

        // 가져오는 동안 다른 벌이 예산을 다 썼을 수 있다 — 다시 본다.
        if (capReached) {
          skipped.push({ object: label, reason: 'max_results reached; object not scanned' });
          return;
        }
        if (skipReason || source == null) {
          skipped.push({ object: label, reason: skipReason ?? 'Source not available' });
          return;
        }

        const remaining = maxResults - totalMatches;
        if (remaining <= 0) {
          capReached = true;
          skipped.push({ object: label, reason: 'max_results reached; object not scanned' });
          return;
        }

        objectsScanned += 1;
        const { matches, matchLimitReached, lineCapReached } = grepText(
          source,
          regex,
          contextLines,
          remaining,
        );
        if (matches.length > 0) {
          const entry: ObjectGrepResult = {
            object_type: candidate.object_type,
            object_name: candidate.object_name,
            matches,
          };
          if (lineCapReached) entry.truncated_object = true;
          results.push(entry);
          totalMatches += matches.length;
        } else if (lineCapReached) {
          // 줄 상한까지 훑었는데 일치가 없던 거대 오브젝트. 다른 후보의 훑기를
          // 멈추지도, 예산을 소모하지도 않는다.
          skipped.push({
            object: label,
            reason: `object exceeds the ${MAX_LINES_PER_OBJECT}-line scan cap; no matches found in the scanned portion`,
          });
        }
        if (matchLimitReached || totalMatches >= maxResults) capReached = true;
      });

      return ok(
        JSON.stringify(
          {
            total_matches: totalMatches,
            truncated: capReached,
            results,
            skipped,
            packages_scanned: requested.length,
            objects_scanned: objectsScanned,
            objects_skipped: skipped.length,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      return failure(messageOf(error));
    }
  },
);
