/**
 * `DeleteFunctionModule` — 발행 계약 · 와이어(두 단짜리 주소) · 거짓 성공 판정 ·
 * **사전 검사 음성시험**(대상 이름이 둘이다) · tier 게이트 음성시험.
 *
 * spec의 값은 전부 **구의 실측**이다:
 *  - 선언: `harness/old-surface/m1-tools.json`의 `tools.DeleteFunctionModule`
 *  - 겉 핸들러: `engine/src/handlers/function_module/high/handleDeleteFunctionModule.ts:17-145`
 *  - 사슬·세션: `.../dist/core/functionModule/AdtFunctionModule.js` delete (세션 무접촉)
 *  - 전문·주소: `.../dist/core/functionModule/delete.js:14-92`
 *    (검사 걸음도 **같은 두 단짜리 주소**를 쓴다)
 */

import { checkSourceNamespace } from '../../../../harness/targetGuard';
import { deleteFunctionModule } from '../deleteFunctionModule';
import { describeStandardDeletion } from './deletionSupport';

const FM = 'Z_SAPKIT_FM';
const FG = 'ZSAPKIT_FG';

describeStandardDeletion({
  tool: deleteFunctionModule,
  name: 'DeleteFunctionModule',
  args: { function_module_name: FM, function_group_name: FG },
  lowerArgs: { function_module_name: FM.toLowerCase(), function_group_name: FG.toLowerCase() },
  objectUri: `/sap/bc/adt/functions/groups/${FG}/fmodules/${FM}`,
  availableIn: ['onprem', 'cloud', 'legacy'],
  targetNames: ['function_module_name', 'function_group_name'],
  layout: 'standard',
  stateful: false,
  vendorLabel: 'Function module',
  statusLabel: 'FunctionModule',
  subject: 'function module',
  successPayload: (transport) => ({
    success: true,
    function_module_name: FM,
    function_group_name: FG,
    transport_request: transport,
    message: `FunctionModule ${FM} deleted successfully.`,
  }),
  missingArgMessage:
    'Error: Missing required parameters: function_module_name and function_group_name',
  missingArgs: { function_module_name: FM },
});

// ── 사전 검사 (녹화) — 대상 이름이 둘이라 둘 다 본다 ────────────────────────

describe('녹화 사전 검사 — Z·Y 밖 대상을 SAP 호출 전에 막는다', () => {
  const scenarioOf = (args: unknown) => ({ steps: [{ tool: 'DeleteFunctionModule', args }] });

  it('그룹이 표준이면 막힌다 — 모듈만 Z여도 통과시키지 않는다', () => {
    const offenders = checkSourceNamespace(
      scenarioOf({ function_module_name: FM, function_group_name: 'MG' }),
      {},
    );
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain('DeleteFunctionModule');
    expect(offenders[0]).toContain('MG');
  });

  it('모듈이 표준이면 막힌다', () => {
    expect(
      checkSourceNamespace(
        scenarioOf({ function_module_name: 'BAPI_MATERIAL_GET_ALL', function_group_name: FG }),
        {},
      ),
    ).toHaveLength(1);
  });

  it('둘 다 표준이면 둘 다 보고한다', () => {
    expect(
      checkSourceNamespace(
        scenarioOf({ function_module_name: 'BAPI_MATERIAL_GET_ALL', function_group_name: 'MG' }),
        {},
      ),
    ).toHaveLength(2);
  });

  it('둘 다 고객 객체면 통과한다 (과수리 역검증)', () => {
    expect(
      checkSourceNamespace(scenarioOf({ function_module_name: FM, function_group_name: FG }), {}),
    ).toEqual([]);
  });
});
