/**
 * #12 (ZUNIWTH dogfooding, 2026-07-24): CheckSyntax on a fully-active program
 * with no inactive version staged made the vendored inactive check throw
 * "The REPORT/PROGRAM statement is missing, or the program type is INCLUDE" —
 * a false positive (nothing inactive to compile) that leaked out as a -32603
 * MCP tool error.
 *
 * 4.13.18 converted the throw to a normal result but the fallback re-checked
 * the still-absent INACTIVE version and re-hit the SAME noise, so the residual
 * "REPORT missing" false-positive survived (live-observed on ZUNIWR2030). The
 * fix now READS the active source and validates IT via the (already-honest,
 * layer1 #7) inline-artifact check with version="active", with a noise safety
 * net for any residual.
 *
 * Coverage:
 *   1. the DETECTION predicate that triggers the fallback (isReportMissingNoiseText);
 *   2. the noise SAFETY NET (downgradeReportMissingNoise);
 *   3. the fallback WIRING in runSyntaxCheck — noise → read active source →
 *      inline check → normal result — driven over a mocked client + a fake
 *      connection whose /checkruns body is set per-test (clean / real error /
 *      residual noise), so the live scenario is actually reproduced (the prior
 *      test's always-empty body masked the residual bug).
 * The live red→green replay against ZUNIWR2030 is tracked as
 * UPSTREAM-FIX-HANDOFF Known-remaining #12.
 */

// getProgram().check drives the inactive-check throw; getProgram().read serves
// the active source the fallback validates. The inline /checkruns POST runs
// over the fake connection, whose body each test controls.
const mockProgramCheck = jest.fn();
const mockProgramRead = jest.fn();
jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getProgram: () => ({ check: mockProgramCheck, read: mockProgramRead }),
  }),
}));

import {
  downgradeReportMissingNoise,
  isReportMissingNoiseText,
  runSyntaxCheck,
} from '../../lib/preCheckBeforeActivation';

const NOISE =
  'Program check failed: The REPORT/PROGRAM statement is missing, or the program type is INCLUDE.';

const REPORT_MISSING_TEXT =
  'The REPORT/PROGRAM statement is missing, or the program type is INCLUDE.';

const checkReport = (type: string, shortText: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">
  <chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed">
    <chkrun:checkMessageList>
      <chkrun:checkMessage chkrun:uri="/sap/bc/adt/programs/programs/zfoo/source/main#start=5,0" chkrun:type="${type}" chkrun:shortText="${shortText}"/>
    </chkrun:checkMessageList>
  </chkrun:checkReport>
</chkrun:checkRunReports>`;

const REAL_ERROR_XML = checkReport('E', 'Field &quot;LV_X&quot; is unknown.');
const NOISE_ONLY_XML = checkReport('E', REPORT_MISSING_TEXT);

// Fake connection: the raw /checkruns POST returns `checkrunsBody`, which each
// test sets. Default '<empty/>' → no report → clean. The D010INC include query
// is never reached (the active fallback does not enumerate includes).
let checkrunsBody = '<empty/>';
const makeAdtRequestSpy = jest.fn(async () => ({
  status: 200,
  statusText: 'OK',
  data: checkrunsBody,
  headers: {},
}));
const fakeConnection = {
  setSessionType() {},
  getSessionMode: () => 'stateless',
  getSessionId: () => 'testsessionid00000000000000000000',
  getBaseUrl: async () => 'https://sap.example.com:44300',
  getAuthHeaders: async () => ({}),
  makeAdtRequest: makeAdtRequestSpy,
};

beforeEach(() => {
  mockProgramCheck.mockReset();
  mockProgramRead.mockReset();
  makeAdtRequestSpy.mockClear();
  checkrunsBody = '<empty/>';
  // Default: a valid active source is available for the fallback to check.
  mockProgramRead.mockResolvedValue({
    readResult: { data: 'REPORT zfoo.\nWRITE / 1.' },
  });
});

describe('isReportMissingNoiseText — CheckSyntax no-inactive fallback trigger (#12)', () => {
  it('recognises the exact live ZUNIWTH message as noise (fallback fires)', () => {
    expect(isReportMissingNoiseText(NOISE)).toBe(true);
  });

  it('recognises both noise phrasings independently', () => {
    expect(
      isReportMissingNoiseText('The REPORT/PROGRAM statement is missing'),
    ).toBe(true);
    expect(isReportMissingNoiseText('… the program type is INCLUDE')).toBe(
      true,
    );
  });

  it('does NOT flag a real syntax error as noise (genuine errors still propagate)', () => {
    expect(isReportMissingNoiseText('Statement "DATAX" is not defined.')).toBe(
      false,
    );
    expect(isReportMissingNoiseText('Field "LV_X" is unknown.')).toBe(false);
    expect(isReportMissingNoiseText('')).toBe(false);
  });
});

describe('downgradeReportMissingNoise — residual-noise safety net (#12)', () => {
  const base = {
    success: false,
    status: 'processed',
    message: '',
    warnings: [],
    info: [],
    total_messages: 1,
    has_errors: true,
    has_warnings: false,
  };

  it('strips a noise-only error set → success, empty errors', () => {
    const result = downgradeReportMissingNoise({
      ...base,
      errors: [{ type: 'E', text: REPORT_MISSING_TEXT }],
    });
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.has_errors).toBe(false);
  });

  it('preserves real errors and keeps a mixed set failing', () => {
    const result = downgradeReportMissingNoise({
      ...base,
      errors: [
        { type: 'E', text: REPORT_MISSING_TEXT },
        { type: 'E', text: 'Field "LV_X" is unknown.' },
      ],
      total_messages: 2,
    });
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].text).toMatch(/LV_X/);
  });

  it('returns a noise-free result unchanged (by reference)', () => {
    const clean = {
      ...base,
      success: true,
      errors: [],
      has_errors: false,
      total_messages: 0,
    };
    expect(downgradeReportMissingNoise(clean)).toBe(clean);
  });

  it('does NOT report clean when the status is not "processed" (status-aware recompute)', () => {
    const result = downgradeReportMissingNoise({
      ...base,
      status: 'notProcessed',
      errors: [{ type: 'E', text: REPORT_MISSING_TEXT }],
    });
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.has_errors).toBe(true);
  });
});

describe('runSyntaxCheck program/no-source active fallback (#12)', () => {
  it('noise throw → READS the active source and inline-checks it; clean active → normal success result', async () => {
    mockProgramCheck.mockRejectedValue(new Error(NOISE));
    const result = await runSyntaxCheck({ connection: fakeConnection } as any, {
      kind: 'program',
      name: 'ZFOO',
    });
    // The fix reads the ACTIVE version (not the absent inactive one) …
    expect(mockProgramRead).toHaveBeenCalledWith(
      { programName: 'ZFOO' },
      'active',
    );
    // … and a valid active program compiles clean.
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('noise throw → a genuinely broken active source surfaces the real error', async () => {
    mockProgramCheck.mockRejectedValue(new Error(NOISE));
    checkrunsBody = REAL_ERROR_XML;
    const result = await runSyntaxCheck({ connection: fakeConnection } as any, {
      kind: 'program',
      name: 'ZFOO',
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => /LV_X/.test(e.text))).toBe(true);
  });

  it('noise throw → residual REPORT-missing noise from the active check is downgraded to clean', async () => {
    mockProgramCheck.mockRejectedValue(new Error(NOISE));
    checkrunsBody = NOISE_ONLY_XML;
    const result = await runSyntaxCheck({ connection: fakeConnection } as any, {
      kind: 'program',
      name: 'ZFOO',
    });
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('noise throw → active source unreadable → clean result, no inline check attempted', async () => {
    mockProgramCheck.mockRejectedValue(new Error(NOISE));
    mockProgramRead.mockRejectedValue(new Error('read failed'));
    checkrunsBody = NOISE_ONLY_XML; // would fail loudly if it were parsed
    const result = await runSyntaxCheck({ connection: fakeConnection } as any, {
      kind: 'program',
      name: 'ZFOO',
    });
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(makeAdtRequestSpy).not.toHaveBeenCalled();
  });

  it('a genuine (non-noise) inactive error still propagates as a throw', async () => {
    mockProgramCheck.mockRejectedValue(new Error('Field "LV_X" is unknown.'));
    await expect(
      runSyntaxCheck({ connection: fakeConnection } as any, {
        kind: 'program',
        name: 'ZFOO',
      }),
    ).rejects.toThrow(/LV_X/);
    expect(mockProgramRead).not.toHaveBeenCalled();
  });

  it('an already-checked error is re-thrown to the outer catch → EMPTY_RESULT', async () => {
    mockProgramCheck.mockRejectedValue(
      Object.assign(new Error('already checked'), { isAlreadyChecked: true }),
    );
    const result = await runSyntaxCheck({ connection: fakeConnection } as any, {
      kind: 'program',
      name: 'ZFOO',
    });
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
