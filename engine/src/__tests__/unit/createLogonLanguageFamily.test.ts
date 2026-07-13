/**
 * Regression tests for the create-payload logon-language mismatch across the
 * REMAINING create paths (HANDOFF §6 engine backlog 11-⑫), extending the
 * 4.13.10 fix (§5 / backlog 11-⑧, which covered view/domain/dataElement) to the
 * eight other create handlers whose vendored payloads still hardcoded
 * adtcore:language="EN" / adtcore:masterLanguage="EN":
 *   Class, Interface, Program, Package, Table, Structure,
 *   ServiceDefinition (SRVD), MetadataExtension (DDLX).
 *
 * On a non-EN logon system (live: KR-DEV, logon language KO) those creates
 * SUCCEED (SAP tolerates the EN→logon-language normalization) but the
 * description is stored in the EN language row and shows empty under the KO
 * logon — real user demand: a fork bundle had been hand-edited in 19 places to
 * force KO. Each handler now resolves the logon language from the live ADT
 * system-information document (same source GetSystemInfo reads) and injects it
 * as master_language; EN remains only the discovery-unavailable fallback.
 *
 * SAP-independent: drives the real handlers through the real AdtClient over a
 * fake IAbapConnection advertising KO, and pins the resolved language on the
 * create POST body. Reverse-verify: revert the handler resolve+inject (or the
 * vendored builder edits) and the create POST carries EN again → these fail.
 * (DCL/accessControl create is deliberately NOT covered — no handler routes to
 * it, so its vendored EN hardcoding is unreachable dead code; see CHANGELOG.)
 */

process.env.ADT_ACCEPT_CORRECTION = 'false';
delete process.env.SAP_VERSION;

import { handleCreateClass } from '../../handlers/class/high/handleCreateClass';
import { handleCreateMetadataExtension } from '../../handlers/ddlx/high/handleCreateMetadataExtension';
import { handleCreateInterface } from '../../handlers/interface/high/handleCreateInterface';
import { handleCreatePackage } from '../../handlers/package/high/handleCreatePackage';
import { handleCreateProgram } from '../../handlers/program/high/handleCreateProgram';
import { handleCreateServiceDefinition } from '../../handlers/service_definition/high/handleCreateServiceDefinition';
import { handleCreateStructure } from '../../handlers/structure/high/handleCreateStructure';
import { handleCreateTable } from '../../handlers/table/high/handleCreateTable';

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

interface CapturedRequest {
  url: string;
  method: string;
  data?: string;
}

class FakeConnection {
  sessionMode: 'stateful' | 'stateless' = 'stateless';
  captured: CapturedRequest[] = [];
  /** When false, the systeminformation endpoint 404s (fallback path). */
  systemInfoAvailable = true;
  /** Language advertised by the systeminformation endpoint. */
  systemLanguage = 'KO';

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
    this.captured.push({
      url,
      method: String(method).toUpperCase(),
      data: typeof data === 'string' ? data : undefined,
    });
    return this.route(url, String(method).toUpperCase());
  }

  private route(url: string, method: string): any {
    const ok = (data: string) => ({
      status: 200,
      statusText: 'OK',
      data,
      headers: {},
    });
    if (url.includes('/core/http/systeminformation')) {
      if (!this.systemInfoAvailable) {
        const err: any = new Error('Request failed with status code 404');
        err.response = { status: 404, data: '' };
        throw err;
      }
      return ok(
        JSON.stringify({
          systemID: 'DEV',
          client: '700',
          language: this.systemLanguage,
          userName: 'TESTER',
        }),
      );
    }
    if (url.includes('_action=LOCK')) return ok(LOCK_XML);
    if (url.includes('_action=UNLOCK')) return ok('');
    if (url.includes('/checkruns')) return ok(CHECK_OK_XML);
    // Everything else (validation, create POST, activation, source PUT, reads)
    // succeeds with an empty 200 — enough to reach and capture the create POST.
    return ok('');
  }

  /** The create POST for the given collection (excludes validation/checkruns). */
  createPost(collection: string): CapturedRequest | undefined {
    return this.captured.find(
      (r) =>
        r.method === 'POST' &&
        r.url.includes(collection) &&
        !r.url.includes('validation') &&
        !r.url.includes('/checkruns'),
    );
  }
}

function makeContext(connection: FakeConnection) {
  return { connection, logger: undefined } as any;
}

// Each case names the create-POST collection URL and how to invoke the handler.
const CREATE_CASES = [
  {
    name: 'CreateClass',
    collection: '/oo/classes',
    run: (ctx: any) =>
      handleCreateClass(ctx, {
        class_name: 'ZCL_SAH_LANG_TEST',
        package_name: '$TMP',
        description: 'language family test',
      }),
  },
  {
    name: 'CreateInterface',
    collection: '/oo/interfaces',
    run: (ctx: any) =>
      handleCreateInterface(ctx, {
        interface_name: 'ZIF_SAH_LANG_TEST',
        package_name: '$TMP',
        description: 'language family test',
      }),
  },
  {
    name: 'CreateProgram',
    collection: '/programs/programs',
    run: (ctx: any) =>
      handleCreateProgram(ctx, {
        program_name: 'ZSAH_LANG_TEST',
        package_name: '$TMP',
        description: 'language family test',
      }),
  },
  {
    name: 'CreatePackage',
    collection: '/adt/packages',
    run: (ctx: any) =>
      handleCreatePackage(ctx, {
        package_name: 'ZSAH_LANG_TEST',
        description: 'language family test',
        software_component: 'LOCAL',
        super_package: 'ZSAH_PARENT',
      }),
  },
  {
    name: 'CreateTable',
    collection: '/ddic/tables',
    run: (ctx: any) =>
      handleCreateTable(ctx, {
        table_name: 'ZSAH_LANG_TBL',
        package_name: '$TMP',
        description: 'language family test',
      }),
  },
  {
    name: 'CreateStructure',
    collection: '/ddic/structures',
    run: (ctx: any) =>
      handleCreateStructure(ctx, {
        structure_name: 'ZSAH_LANG_STRU',
        package_name: '$TMP',
        description: 'language family test',
        fields: [{ name: 'ID', data_type: 'CHAR', length: 10 }],
      }),
  },
  {
    name: 'CreateServiceDefinition',
    collection: '/ddic/srvd/sources',
    run: (ctx: any) =>
      handleCreateServiceDefinition(ctx, {
        service_definition_name: 'ZSAH_LANG_SRVD',
        package_name: '$TMP',
        description: 'language family test',
      }),
  },
  {
    name: 'CreateMetadataExtension',
    collection: '/ddic/ddlx/sources',
    run: (ctx: any) =>
      handleCreateMetadataExtension(ctx, {
        name: 'ZSAH_LANG_DDLX',
        package_name: '$TMP',
        description: 'language family test',
      }),
  },
] as const;

describe('Create-payload logon-language extension — 8 remaining paths (backlog 11-⑫)', () => {
  for (const c of CREATE_CASES) {
    it(`${c.name} stamps the create payload with the system logon language (KO)`, async () => {
      const connection = new FakeConnection();
      await c.run(makeContext(connection));

      const post = connection.createPost(c.collection);
      expect(post).toBeDefined();
      // The resolved logon language (KO) — not the old hardcoded EN — is stamped
      // on BOTH language attributes. (Revert the fix → these carry EN → fail.)
      expect(post?.data).toContain('adtcore:language="KO"');
      expect(post?.data).toContain('adtcore:masterLanguage="KO"');
      expect(post?.data).not.toContain('adtcore:language="EN"');
      expect(post?.data).not.toContain('adtcore:masterLanguage="EN"');
    });

    it(`${c.name} falls back to EN when systeminformation is unavailable`, async () => {
      const connection = new FakeConnection();
      connection.systemInfoAvailable = false;
      await c.run(makeContext(connection));

      const post = connection.createPost(c.collection);
      expect(post).toBeDefined();
      expect(post?.data).toContain('adtcore:language="EN"');
      expect(post?.data).toContain('adtcore:masterLanguage="EN"');
    });
  }
});
