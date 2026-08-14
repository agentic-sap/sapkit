/**
 * ReloadProfile — 활성 프로파일을 다시 읽고 캐시된 접속을 버린다.
 *
 * 이 묶음의 유일한 **비(非) SAP** 도구다. 와이어가 없다 — 읽는 것은
 * `<cwd>/.sapkit/active-profile.txt`와 그것이 가리키는 `sap.env`뿐이고, SAP에
 * 요청 한 줄도 보내지 않는다. 그래서 참조 원본도 접속 계층이 아니라 프로파일
 * 계층이다.
 *
 * ## 참조 원본 (읽은 자리)
 *
 * - `engine/src/handlers/system/readonly/handleReloadProfile.ts:36-82` — 겉 흐름과
 *   응답 본문의 키. `activateProfile()` → `invalidateConnectionCache()` →
 *   `{ ok, alias, legacy, tier, readonly, host, client, description, sourcePath,
 *   restartRequired, note }`를 `JSON.stringify(_, null, 2)`로 싣는다
 *   (`engine/src/lib/utils.ts:97-107`의 `return_response`가 `data`를 text 하나에
 *   그대로 넣는다).
 * - `engine/src/lib/profile.ts:199-305` — `loadActiveProfile` · `applyProfile` ·
 *   `activateProfile`. 별칭이 없으면 `<runtime>/sap.env`로 떨어지고 그것이
 *   `legacy: true`다(:218-236). tier는 fail-closed로 `UNKNOWN`(:251).
 * - `engine/src/lib/utils.ts:857-874` (`invalidateConnectionCache`) ·
 *   `engine/src/lib/connectionEvents.ts` · `engine/src/lib/clients.ts:44-50` —
 *   접속 캐시와 클라이언트 캐시를 함께 떨구는 팬아웃.
 * - `engine/src/lib/readonlyGuard.ts:130-133` — 가드가 이 도구 **이름 하나**만
 *   무조건 통과시킨다. 신 엔진에서 그 계약은 `src/safety/tier.ts`의
 *   `SERVER_CONTROL_TOOLS`가 이미 승계해 두었다.
 * - `engine/src/server/launcher.ts:380-403` — 구가 `restartRequired`를 내야 했던
 *   이유(무접속 기동에서 mock 브로커를 프로세스 수명 내내 붙잡는다). 아래 참조.
 *
 * ## 구와 다른 것 (차이 장부 D38 · D39 · D40)
 *
 * - **실패해도 옛 프로파일로 돌아가지 않는다** — 구는 `loadActiveProfile`이
 *   던지면 `applyProfile`에 닿지 못해 옛 tier·옛 접속이 그대로 살아남았다. 신은
 *   무접속 · `tier=UNKNOWN`으로 내려앉고 그 이유를 `diagnostics`에 싣는다.
 * - **`restartRequired`가 가리키는 제약이 바뀌었다** — 신 엔진은 접속을 게으르게
 *   다시 만들므로 무접속 기동에서도 재적재가 접속을 되살린다. 대신 이 프로세스가
 *   정말로 못 고치는 것 하나(기동 시점에 확정된 `tools/list`)를 보고한다.
 * - **`diagnostics`를 싣는다** — 구는 실패를 예외로 알렸다. 신의 프로파일 계층은
 *   던지지 않고 진단 문구로 끝내므로, 그 문구를 싣지 않으면 "왜 무접속이 됐는지"가
 *   응답에서 사라진다.
 */

import { defineTool } from '../../server/toolDefinition';
import { okJson, returnError } from './internal/results';

export const reloadProfile = defineTool(
  {
    name: 'ReloadProfile',
    description:
      '[system] Reload the active SAP profile from .sapkit/active-profile.txt and reset the cached connection. Called by the sapkit plugin after switching profiles. Returns the newly active alias, host, tier, and readonly status. If the server was started without connection parameters (inspection-only), this CANNOT restore the connection: it returns restartRequired=true and the MCP server must be restarted.',
    inputSchema: {},
    available_in: ['onprem', 'cloud', 'legacy'],
    // 구 경로 `handlers/system/readonly/` — 채록본의 4개 노출 조건 전부에 뜬다.
    sets: ['readonly'],
    // tier 게이트가 이름으로 면제하는 유일한 분류이자, 재적재 훅을 받을 자격의
    // 근거(`src/safety/tier.ts`의 SERVER_CONTROL_TOOLS · `src/server/core.ts`의
    // `mayReload`).
    kind: 'server-control',
    // 겨누는 SAP 오브젝트가 없다. 빈 배열은 명시 선언이다.
    targetNames: [],
  },
  async (context) => {
    try {
      const outcome = context.reloadProfile();

      // 해석기가 던진 갈래. 상태는 이미 inspection-only로 봉인돼 있고, 여기서는
      // 그것을 오류로 알린다 — 구도 이 자리에서 `return_error`를 냈다.
      if (outcome.sealed !== null) {
        context.logger.error(`[ReloadProfile] sealed: ${outcome.sealed}`);
        return returnError(
          new Error(
            `ReloadProfile could not resolve the active profile and sealed this server into ` +
              `inspection-only (no connection, tier=UNKNOWN, locked blocklist): ${outcome.sealed}`,
          ),
        );
      }

      const { startup } = outcome;
      const { profile, envVars } = startup;

      const host = envVars.SAP_URL ?? '';
      const client = envVars.SAP_CLIENT ?? '';
      const description = envVars.SAP_DESCRIPTION ?? '';

      context.logger.info(
        `[ReloadProfile] alias=${profile.alias ?? '(legacy)'} tier=${profile.tier} ` +
          `readonly=${profile.tier !== 'DEV'} host=${host} client=${client}`,
      );

      return okJson({
        // 구와 같은 뜻 — "재적재가 실제로 수행됐다"이지 "쓸 수 있는 접속이 섰다"가
        // 아니다(구 시험 `engine/src/__tests__/handlers/system/handleReloadProfile.test.ts`의
        // 주석이 그렇게 못박는다). 결과 상태는 아래 필드들이 말한다.
        ok: true,
        alias: profile.alias,
        // 구의 `legacy`는 "포인터 없이 단일 프로파일 파일로 떴다"였고, 신에서
        // 그 조건은 별칭이 없는 것과 같다.
        legacy: profile.alias === null,
        tier: profile.tier,
        readonly: profile.tier !== 'DEV',
        host,
        client,
        description,
        sourcePath: profile.envPath,
        restartRequired: outcome.exposureStale,
        note: outcome.exposureStale
          ? `The reloaded profile runs on the ${outcome.after.systemType} deployment axis, but this ` +
            `server started on ${outcome.bootSystemType} and its published tool list was fixed at ` +
            'startup, so the list no longer matches this system. Tier, blocklist and the SAP ' +
            'connection are already using the new profile — only the tool list is stale. Restart ' +
            '(reconnect) the MCP server to publish the matching set.'
          : undefined,
        // 왜 이 상태인지. 프로파일을 못 찾았거나 접속 정보가 모자라면 여기에
        // 이유가 들어온다 — 구는 그것을 예외로 알렸고 신의 계층은 던지지 않는다.
        diagnostics: [...profile.diagnostics],
      });
    } catch (error) {
      context.logger.error(`[ReloadProfile] error: ${String(error)}`);
      return returnError(error);
    }
  },
);
