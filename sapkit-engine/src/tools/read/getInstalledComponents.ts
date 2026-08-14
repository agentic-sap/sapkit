/**
 * GetInstalledComponents — 설치된 소프트웨어 컴포넌트의 릴리스·SP 수준.
 *
 * **오류를 내지 않는 도구다.** 후보 엔드포인트가 하나도 응답하지 않으면
 * `{ supported: false, reason }`을 `isError:false`로 돌려준다. 구 핸들러가 그렇게
 * 지은 이유는 이 도구의 답이 플랫폼 자동 판별의 입력이기 때문이다 — "이 릴리스엔
 * 그 엔드포인트가 없다"는 오류가 아니라 **유효한 데이터**다
 * (`engine/src/handlers/system/readonly/handleGetInstalledComponents.ts:1-12`).
 *
 * ## 와이어 동작을 어디서 복원했나
 *
 * 겉 핸들러는 `lib/systemInfoParsers.ts`의 `tryAdtGet`만 부르고, 그 헬퍼는
 * `lib/utils.ts:902-958`의 `makeAdtRequestWithTimeout` → `connection.makeAdtRequest`
 * 로 내려간다. 실제 요청이 조립되는 자리는 거기가 아니라 안쪽 패키지다 —
 * `@babamba2/mcp-abap-connection/dist/connection/AbstractAbapConnection.js:139-190`:
 *
 *  - URL = `baseUrl + endpoint` (질의 인자 없음)
 *  - `Accept`는 **호출자가 준 값이 이긴다**. 그 자리의 기본값(xml·json·text·
 *    와일드카드를 나열한 문자열)은 호출자가 `Accept`를 주지 않았을 때만 붙는다.
 *    이 도구는 `application/json, application/xml`을 주므로 그 값이 그대로 나간다.
 *  - GET이므로 CSRF 취득도, 상태유지 세션 헤더도 붙지 않는다.
 *
 * 그리고 axios는 비 2xx에서 던지므로 `tryAdtGet`의 `catch`가 그것을 `{ok:false}`로
 * 접는다. 신 엔진의 `AdtClient.request()`도 `status >= 400`에서 `AdtError`를
 * 던지므로(`src/adt/client.ts:296`) 같은 자리에서 같은 갈래가 갈린다.
 *
 * ## 구와 다른 것 (차이가 아니다)
 *
 * 구는 axios가 content-type을 보고 JSON을 **객체로 파싱한 뒤** 넘겼고, 신은 본문을
 * 항상 문자열로 넘긴다. 그래서 파싱 분기의 진입점이 다르지만 — 문자열 +
 * `application/json`은 `JSON.parse`를 거쳐 같은 객체가 된다 — **결과 표는 같다.**
 * 등재할 차이가 아니다.
 */

import { XMLParser } from 'fast-xml-parser';

import { defineTool } from '../../server/toolDefinition';
import { ok } from './internal/results';

/**
 * 시도 순서. 구 핸들러의 `VERIFY(live)` 주석대로 **어느 쪽도 실 시스템에서
 * 확인된 적이 없다** — 그래서 둘을 차례로 물어보고 둘 다 없으면 없다고 답한다.
 */
const CANDIDATE_PATHS = [
  '/sap/bc/adt/core/http/systeminformation/componentreleases',
  '/sap/bc/adt/core/systeminformation/componentreleases',
] as const;

const ACCEPT = 'application/json, application/xml';

interface InstalledComponent {
  readonly name: string;
  readonly release?: string;
  readonly spLevel?: string;
  readonly description?: string;
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

const asArray = (node: unknown): unknown[] =>
  node === undefined || node === null ? [] : Array.isArray(node) ? node : [node];

const text = (value: unknown): string | undefined =>
  value === undefined || value === null ? undefined : String(value);

/** 첫 번째로 값이 있는 키를 고른다. 키 이름이 릴리스마다 다르다. */
function pick(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/**
 * 항목 하나를 표 한 줄로 접는다. **이름이 없으면 줄이 아니다** — 스키마가
 * 릴리스마다 다르므로, 이름조차 못 찾은 항목은 컴포넌트가 아니라 껍데기다.
 */
function toComponent(raw: unknown): InstalledComponent | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const name = pick(record, ['name', 'component', 'swComponent', '@_name']);
  if (!name) return null;
  return {
    name: String(name),
    release: text(pick(record, ['release', 'releaseVersion', '@_release'])),
    spLevel: text(pick(record, ['spLevel', 'supportPackage', 'sp', '@_spLevel'])),
    description: text(pick(record, ['description', 'text', '@_description'])),
  };
}

function collect(candidates: readonly unknown[]): InstalledComponent[] {
  const out: InstalledComponent[] = [];
  for (const candidate of candidates) {
    const component = toComponent(candidate);
    if (component !== null) out.push(component);
  }
  return out;
}

/** JSON 모양 — 배열 자체이거나 `components`/`component` 아래에 배열이 있다. */
function fromJson(document: unknown): InstalledComponent[] {
  if (Array.isArray(document)) return collect(document);
  if (document === null || typeof document !== 'object') return [];
  const record = document as Record<string, unknown>;
  const list = Array.isArray(record['components'])
    ? record['components']
    : Array.isArray(record['component'])
      ? record['component']
      : [];
  return collect(list);
}

/**
 * XML 모양 — 네임스페이스 접두사를 떼고 그럴듯한 컨테이너 이름을 차례로 본다.
 * 스키마가 실 시스템에서 확인된 적이 없으므로 못 알아보면 빈 표로 물러난다.
 */
function fromXml(body: string): InstalledComponent[] {
  let document: unknown;
  try {
    document = parser.parse(body);
  } catch {
    return [];
  }
  if (document === null || typeof document !== 'object') return [];
  const record = document as Record<string, unknown>;
  const root =
    (pick(record, ['componentReleases', 'components', 'installedComponents', 'feed']) ??
      record) as Record<string, unknown>;
  return collect(asArray(pick(root, ['component', 'entry', 'installedComponent'])));
}

/** 본문과 content-type에서 컴포넌트 표를 뽑는다. 못 알아보면 빈 표다. */
export function parseInstalledComponents(body: string, contentType: string): InstalledComponent[] {
  if (body === '') return [];
  if (contentType.includes('xml')) return fromXml(body);
  try {
    return fromJson(JSON.parse(body));
  } catch {
    // content-type이 없거나 틀리게 붙은 경우가 있다 — 모양으로 한 번 더 본다.
    return body.trimStart().startsWith('<') ? fromXml(body) : [];
  }
}

export const getInstalledComponents = defineTool(
  {
    name: 'GetInstalledComponents',
    description:
      '[read-only] Retrieve installed software components with release/support-package level (e.g. SAP_BASIS 757 SP02). Returns { supported: false } instead of an error when the underlying ADT endpoint is absent on this release.',
    inputSchema: {},
    available_in: ['onprem', 'cloud', 'legacy'],
    sets: ['readonly'],
    kind: 'read',
  },
  async (context) => {
    const client = await context.getConnection();

    for (const path of CANDIDATE_PATHS) {
      let body: string;
      let contentType: string;
      try {
        const response = await client.request({
          method: 'GET',
          path,
          accept: ACCEPT,
          timeout: 'default',
        });
        body = response.body;
        contentType = response.headers['content-type'] ?? '';
      } catch {
        // 이 릴리스에 그 엔드포인트가 없다는 뜻일 수 있다 — 다음 후보로 간다.
        continue;
      }

      const components = parseInstalledComponents(body, contentType);
      context.logger.info(
        `GetInstalledComponents: ${path} responded, ${components.length} component(s) parsed`,
      );
      return ok(JSON.stringify({ supported: true, components }));
    }

    context.logger.info('GetInstalledComponents: no candidate endpoint responded');
    return ok(
      JSON.stringify({
        supported: false,
        reason: `No installed-components endpoint responded on this system (tried: ${CANDIDATE_PATHS.join(', ')}).`,
      }),
    );
  },
);
