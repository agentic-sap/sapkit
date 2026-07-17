/**
 * Regression test for the UpdateTable pre-check "checks the wrong version"
 * defect (HANDOFF §6 engine backlog 11-⑪, the UpdateTable sibling of the
 * 4.13.11 structure fix).
 *
 * handleUpdateTable runs a "check new DDL code before update" step by calling
 * client.getTable().check({ tableName, ddlCode }, 'inactive'). The vendored
 * AdtTable.check() USED TO drop config.ddlCode and check-run the object's
 * *stored* inactive version instead (runTableCheckRun(..., undefined, ...)) —
 * so the pre-check never validated the new code. When the stored version was
 * valid, the pre-check passed and the real syntax error in the new DDL only
 * surfaced at the write PUT, as SAP's opaque "Kein Sichern wegen Fehler in
 * Quelle. Details erhalten Sie mit Prüfung."
 *
 * Unlike AdtStructure.check (which throws on errors), AdtTable.check returns
 * the raw /checkruns response WITHOUT evaluating it — the CheckTableLow tool
 * relies on that non-throwing contract and parses the result itself. So the
 * 4.13.12 fix has two parts:
 *   1. AdtTable.check() now forwards config.ddlCode (check-with-source), so the
 *      pre-check validates the NEW DDL (this also revives the CheckTableLow
 *      documented ddl_code path).
 *   2. handleUpdateTable now parses that result and BLOCKS the write when the
 *      new DDL has real errors, surfacing the honest SAP detail BEFORE the PUT.
 *
 * SAP-independent: drives the real handler through the real AdtClient over a
 * fake IAbapConnection that answers /checkruns differently depending on whether
 * the request carried source (chkrun:content) — mirroring live SAP.
 *
 * Reverse-verify: with either half reverted (ddlCode-forward OR handler-eval),
 * the pre-check no longer blocks — the stored-version check (checkNoSource is
 * clean) passes and the write PUT is issued, so the error/no-PUT cases fail.
 */

process.env.ADT_ACCEPT_CORRECTION = 'false';
// UpdateTable takes a different ECC path when SAP_VERSION=ECC — keep the
// standard path under test.
delete process.env.SAP_VERSION;

import { handleUpdateTable } from '../../handlers/table/high/handleUpdateTable';

const LOCK_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">' +
  '<asx:values><DATA><LOCK_HANDLE>TESTHANDLE-1</LOCK_HANDLE></DATA></asx:values>' +
  '</asx:abap>';

const CHECK_OK_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
  '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="OK"/>' +
  '</chkrun:checkRunReports>';

// status="processed" with a real E message — a genuine source error.
const CHECK_REAL_ERROR_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
  '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="processed" chkrun:statusText="Errors found">' +
  '<chkrun:checkMessageList>' +
  '<chkrun:checkMessage chkrun:type="E" chkrun:shortText="Field MANDT: data element MANDT does not exist"/>' +
  '</chkrun:checkMessageList>' +
  '</chkrun:checkReport>' +
  '</chkrun:checkRunReports>';

// status="notProcessed", no messages — the case that historically produced a
// bare/empty error; the honest fallback must carry the status.
const CHECK_NOTPROCESSED_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<chkrun:checkRunReports xmlns:chkrun="http://www.sap.com/adt/checkrun">' +
  '<chkrun:checkReport chkrun:reporter="abapCheckRun" chkrun:status="notProcessed" chkrun:statusText="Not processed"/>' +
  '</chkrun:checkRunReports>';

interface CapturedRequest {
  url: string;
  method: string;
  body: string;
}

class FakeConnection {
  sessionMode: 'stateful' | 'stateless' = 'stateless';
  captured: CapturedRequest[] = [];
  /** Answer for /checkruns requests that carry source (chkrun:content). */
  checkWithSource: string;
  /**
   * Answer for /checkruns requests without source (stored-version check).
   * Defaults to OK: the stored version is valid, so reverting the fix (which
   * makes the pre-check fall back to a source-less stored-version check) lets
   * the bad new DDL slip through to the PUT — exactly the pre-fix pathology.
   */
  checkNoSource: string = CHECK_OK_XML;

  constructor(checkWithSource: string) {
    this.checkWithSource = checkWithSource;
  }

  setSessionType(type: 'stateful' | 'stateless') {
    this.sessionMode = type;
  }
  getSessionMode() {
    return this.sessionMode;
  }
  getSessionId() {
    return 'testsessionid00000000000000000000';
  }
  async getBaseUrl() {
    return 'https://sap.example.com:44300';
  }
  async getAuthHeaders() {
    return {};
  }

  async makeAdtRequest(options: any): Promise<any> {
    const { url, method, data } = options;
    const body = typeof data === 'string' ? data : '';
    this.captured.push({ url, method: String(method).toUpperCase(), body });
    const ok = (payload: string) => ({
      status: 200,
      statusText: 'OK',
      data: payload,
      headers: {},
    });
    if (url.includes('_action=LOCK')) return ok(LOCK_XML);
    if (url.includes('_action=UNLOCK')) return ok('');
    if (url.includes('/checkruns')) {
      return ok(
        body.includes('chkrun:content')
          ? this.checkWithSource
          : this.checkNoSource,
      );
    }
    return ok('');
  }
}

const GOOD_DDL =
  "@EndUserText.label : 'test'\n" +
  '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE\n' +
  '@AbapCatalog.tableCategory : #TRANSPARENT\n' +
  '@AbapCatalog.deliveryClass : #A\n' +
  '@AbapCatalog.dataMaintenance : #RESTRICTED\n' +
  'define table ztst_table { key mandt : mandt not null; key id : abap.char(10); }';

const checkruns = (c: FakeConnection) =>
  c.captured.filter((r) => r.method === 'POST' && r.url.includes('/checkruns'));
const sourcePuts = (c: FakeConnection) =>
  c.captured.filter(
    (r) =>
      r.method === 'PUT' &&
      r.url.includes('/ddic/tables/') &&
      r.url.includes('/source/main'),
  );

describe('UpdateTable pre-check validates the NEW DDL (backlog 11-⑪)', () => {
  it('forwards the new DDL to the pre-check (check-with-source) and completes on valid code', async () => {
    const connection = new FakeConnection(CHECK_OK_XML);
    const context = { connection, logger: undefined } as any;

    const result = await handleUpdateTable(context, {
      table_name: 'ZTST_TABLE',
      ddl_code: GOOD_DDL,
      activate: true,
    });

    expect(result.isError).toBeFalsy();

    // A /checkruns request carried the NEW DDL as base64 source — proof the
    // pre-check validated the new code, not the stored version. (Reverting the
    // ddlCode-forward makes every /checkruns request source-less → this fails.)
    const b64 = Buffer.from(GOOD_DDL, 'utf-8').toString('base64');
    const withSource = checkruns(connection).filter((r) =>
      r.body.includes('chkrun:content'),
    );
    expect(withSource.length).toBeGreaterThan(0);
    expect(withSource.some((r) => r.body.includes(b64))).toBe(true);

    // And the write PUT happened.
    expect(sourcePuts(connection).length).toBe(1);
  });

  it('surfaces the REAL check error before the write PUT (no opaque failure)', async () => {
    // Stored version is valid (checkNoSource=OK); only the NEW DDL has an error.
    const connection = new FakeConnection(CHECK_REAL_ERROR_XML);
    const context = { connection, logger: undefined } as any;

    const result = await handleUpdateTable(context, {
      table_name: 'ZTST_TABLE',
      ddl_code: GOOD_DDL,
      activate: true,
    });

    expect(result.isError).toBeTruthy();
    const text = JSON.stringify(result);
    // The actual SAP check detail is surfaced — not an opaque "error in source".
    expect(text).toContain('Field MANDT: data element MANDT does not exist');
    // The bad update was blocked BEFORE the write PUT.
    expect(sourcePuts(connection).length).toBe(0);
  });

  it('never surfaces a bare, empty check error (honest status on notProcessed)', async () => {
    const connection = new FakeConnection(CHECK_NOTPROCESSED_XML);
    const context = { connection, logger: undefined } as any;

    const result = await handleUpdateTable(context, {
      table_name: 'ZTST_TABLE',
      ddl_code: GOOD_DDL,
      activate: true,
    });

    expect(result.isError).toBeTruthy();
    const text = JSON.stringify(result);
    // Honest: carries the check status, never an empty "New code check failed:".
    expect(text).toContain('notProcessed');
    expect(text).not.toMatch(/New code check failed:\s*(?:\\n|")/);
    expect(sourcePuts(connection).length).toBe(0);
  });
});
