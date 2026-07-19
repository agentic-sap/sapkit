/**
 * Schema-shape regression (4.13.15): the low-level class ABAP-Unit tools must
 * NOT advertise Cloud-only parameters that their handlers never read.
 *
 * 4.13.11 moved RunClassUnitTestsLow + GetClassUnitTest{Status,Result}Low off
 * the ABAP-Cloud-only /abapunit/runs collection onto the classic synchronous
 * Eclipse-ADT /testruns bridge. That left four inputSchema parameters
 * decorative — the handlers' argument destructuring never reads them, so
 * advertising them in the MCP tool contract is a no-op that misleads callers.
 * 4.13.15 removed them from the schemas (schema-only; handler logic unchanged).
 *
 * Guard: this also asserts the params that ARE consumed stay advertised
 * (scope/risk_level/duration flow into abapUnitClassic options; format is
 * honoured by the result reader) so a future cleanup can't remove the wrong
 * ones. Re-adding any removed key without wiring it fails this test.
 */

import { TOOL_DEFINITION as RESULT_LOW } from '../../handlers/class/low/handleGetClassUnitTestResult';
import { TOOL_DEFINITION as STATUS_LOW } from '../../handlers/class/low/handleGetClassUnitTestStatus';
import { TOOL_DEFINITION as RUN_LOW } from '../../handlers/class/low/handleRunClassUnitTests';

describe('low-level class ABAP-Unit tools omit decorative Cloud-only params (4.13.15)', () => {
  it('RunClassUnitTestsLow drops title and context, keeps consumed options', () => {
    const props = RUN_LOW.inputSchema.properties as Record<string, unknown>;
    expect(props).not.toHaveProperty('title');
    expect(props).not.toHaveProperty('context');
    // Consumed by abapUnitClassic (scope/riskLevel/duration options block):
    expect(props).toHaveProperty('scope');
    expect(props).toHaveProperty('risk_level');
    expect(props).toHaveProperty('duration');
    expect(props).toHaveProperty('tests');
  });

  it('GetClassUnitTestStatusLow drops with_long_polling', () => {
    const props = STATUS_LOW.inputSchema.properties as Record<string, unknown>;
    expect(props).not.toHaveProperty('with_long_polling');
    expect(props).toHaveProperty('run_id');
  });

  it('GetClassUnitTestResultLow drops with_navigation_uris, keeps format', () => {
    const props = RESULT_LOW.inputSchema.properties as Record<string, unknown>;
    expect(props).not.toHaveProperty('with_navigation_uris');
    // format IS honoured by the handler (rejects "junit"):
    expect(props).toHaveProperty('format');
    expect(props).toHaveProperty('run_id');
  });
});
