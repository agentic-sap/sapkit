/**
 * Regression test for the UpdateTable pre-check "checks the wrong version"
 * defect (HANDOFF §6 engine backlog 11-⑪ — same root as the structure §7 fix).
 *
 * handleUpdateTable runs a "check new DDL code before update" step by calling
 * client.getTable().check({ tableName, ddlCode }, 'inactive'). The vendored
 * AdtTable.check() USED TO:
 *   (a) drop config.ddlCode and check-run the object's *stored* inactive
 *       version instead (runTableCheckRun(…, undefined, version)) — so the
 *       pre-check never validated the NEW code; and
 *   (b) return the raw check response UNPARSED (unlike the structure path,
 *       whose checkStructure parses + throws), so AdtTable.check always reported
 *       errors:[] and the handler's checkNewCodePassed was ALWAYS true — the
 *       pre-check could never block a bad update.
 * Together these meant a real syntax error in the new DDL slipped past the
 * pre-check and only surfaced at the write PUT, as SAP's opaque "Kein Sichern
 * wegen Fehler in Quelle. Details erhalten Sie mit Prüfung." — the details
 * never shown.
 *
 * The fix (4.13.12), both in the vendored AdtTable.check():
 *  - forwards config.ddlCode as the source to validate (check-with-source), so
 *    the pre-check validates the NEW DDL and surfaces the real error BEFORE the
 *    PUT (blocking the bad write with an honest message);
 *  - parses the result with parseCheckRunResponse and throws on a real error
 *    (skipping DDIC-benign warnings, never a bare message) — mirroring
 *    checkStructure.
 *
 * SAP-independent: drives the real handler through the real AdtClient over a
 * fake IAbapConnection that answers /checkruns differently depending on whether
 * the request carried source (chkrun:content) — mirroring live SAP.
 *
 * Reverse-verify: with the ddlCode-forward reverted, every /checkruns request is
 * source-less → the "valid code" case fails (no source-carrying request). With
 * the parse+throw reverted, the "real error" case fails (the bad update is not
 * blocked and the write PUT is issued).
 */

process.env.ADT_ACCEPT_CORRECTION = 'false';
process.env.SAP_VERSION = 'S4'; // not ECC — handleUpdateTable rejects ECC up front

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
  '<chkrun:checkMessage chkrun:type="E" chkrun:shortText="Field MANDT: data element MANDT is unknown"/>' +
  '</chkrun:checkMessageList>' +
  '</chkrun:checkReport>' +
  '</chkrun:checkRunReports>';

// status="notProcessed", no messages — the empty-shell inactive-version case
// that must produce an honest, status-carrying error (never bare).
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
  /** Answer for /checkruns requests without source (stored-version check). */
  checkNoSource: string = CHECK_NOTPROCESSED_XML;

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
  "@EndUserText.label : 'x'\n" +
  '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE\n' +
  '@AbapCatalog.tableCategory : #TRANSPARENT\n' +
  '@AbapCatalog.deliveryClass : #A\n' +
  '@AbapCatalog.dataMaintenance : #RESTRICTED\n' +
  'define table zsah_tbl_test { key mandt : mandt not null; key id : abap.char(10); }';

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
      table_name: 'ZSAH_TBL_TEST',
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
    const connection = new FakeConnection(CHECK_REAL_ERROR_XML);
    const context = { connection, logger: undefined } as any;

    const result = await handleUpdateTable(context, {
      table_name: 'ZSAH_TBL_TEST',
      ddl_code: GOOD_DDL,
      activate: true,
    });

    expect(result.isError).toBeTruthy();
    const text = JSON.stringify(result);
    // The actual SAP check detail is surfaced — not an opaque "error in source".
    expect(text).toContain('data element MANDT is unknown');
    // The bad update was blocked BEFORE the write PUT. (Reverting the parse+throw
    // makes checkNewCodePassed always true → the PUT is issued → this fails.)
    expect(sourcePuts(connection).length).toBe(0);
  });

  it('never throws a bare, empty "Table check failed:" (honest status)', async () => {
    const connection = new FakeConnection(CHECK_NOTPROCESSED_XML);
    const context = { connection, logger: undefined } as any;

    const result = await handleUpdateTable(context, {
      table_name: 'ZSAH_TBL_TEST',
      ddl_code: GOOD_DDL,
      activate: true,
    });

    expect(result.isError).toBeTruthy();
    const text = JSON.stringify(result);
    // Honest: carries the check status, never a bare "Table check failed: ".
    expect(text).toContain('notProcessed');
    expect(text).not.toMatch(/Table check failed:\s*(?:\\n|")/);
    expect(sourcePuts(connection).length).toBe(0);
  });
});
