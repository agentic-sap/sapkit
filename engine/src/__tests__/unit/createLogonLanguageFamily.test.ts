/**
 * Regression tests for the create-payload EN-hardcoding remainder
 * (HANDOFF §6 engine backlog 11-⑫), the mechanical extension of the 4.13.10
 * logon-language fix (backlog 11-⑧) to the other reachable create builders.
 *
 * 4.13.10 resolved the logon language only for the three live-proven create
 * paths (DDLS view, domain, data element). The remaining vendored create
 * payloads still hardcoded adtcore:language / adtcore:masterLanguage = "EN":
 * class, interface, program, package, table, structure, service definition and
 * metadata extension (DDLX). Those creates SUCCEED (SAP tolerates the
 * EN→logon-language normalization), but the description lands in the EN text
 * slot and reads back empty on a non-EN logon system (IDES=CS, real users=KO).
 *
 * The fix (4.13.12) plugs each reachable create handler into the same dynamic
 * resolveLogonLanguage() infrastructure: the handler resolves the system's
 * logon language and injects it as master_language / masterLanguage, and the
 * vendored builder stamps both adtcore:language and adtcore:masterLanguage from
 * it (EN stays as the discovery-unavailable fallback).
 *
 * SAP-independent: drives each real handler through the real AdtClient over a
 * fake IAbapConnection whose systeminformation endpoint advertises CS (same
 * pattern as createLogonLanguageConsistency for the 4.13.10 trio).
 *
 * Reverse-verify: with the builder EN→${masterLanguage} substitution (or the
 * handler injection) reverted, the create POST carries language="EN" and the
 * "CS" assertions fail.
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
  systemLanguage = 'CS';

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
          systemID: 'S4H',
          client: '100',
          language: this.systemLanguage,
          userName: 'TESTER',
        }),
      );
    }
    if (url.includes('_action=LOCK')) return ok(LOCK_XML);
    if (url.includes('_action=UNLOCK')) return ok('');
    if (url.includes('/checkruns')) return ok(CHECK_OK_XML);
    return ok('');
  }

  /** The metadata create POST for the given collection. */
  createPost(collection: string): CapturedRequest | undefined {
    return this.captured.find(
      (r) =>
        r.method === 'POST' &&
        r.url.includes(collection) &&
        !r.url.includes('validation') &&
        !r.url.includes('/checkruns') &&
        !r.url.includes('systeminformation'),
    );
  }
}

function makeContext(connection: FakeConnection) {
  return { connection, logger: undefined } as any;
}

// Each reachable create handler newly plugged into resolveLogonLanguage (11-⑫).
const CREATE_CASES = [
  {
    name: 'CreateClass',
    collection: '/sap/bc/adt/oo/classes',
    run: (ctx: any) =>
      handleCreateClass(ctx, {
        class_name: 'ZSAH_CLAS_TEST',
        package_name: '$TMP',
        description: 'language family test',
      }),
  },
  {
    name: 'CreateInterface',
    collection: '/sap/bc/adt/oo/interfaces',
    run: (ctx: any) =>
      handleCreateInterface(ctx, {
        interface_name: 'ZSAH_IF_TEST',
        package_name: '$TMP',
        description: 'language family test',
      }),
  },
  {
    name: 'CreateProgram',
    collection: '/sap/bc/adt/programs/programs',
    run: (ctx: any) =>
      handleCreateProgram(ctx, {
        program_name: 'ZSAH_PROG_TEST',
        package_name: '$TMP',
        description: 'language family test',
      }),
  },
  {
    name: 'CreatePackage',
    collection: '/sap/bc/adt/packages',
    run: (ctx: any) =>
      handleCreatePackage(ctx, {
        package_name: 'ZSAH_PKG_TEST',
        super_package: 'ZSAH_PARENT',
        software_component: 'HOME',
        description: 'language family test',
      }),
  },
  {
    name: 'CreateTable',
    collection: '/sap/bc/adt/ddic/tables',
    run: (ctx: any) =>
      handleCreateTable(ctx, {
        table_name: 'ZSAH_TAB_TEST',
        package_name: '$TMP',
        description: 'language family test',
      }),
  },
  {
    name: 'CreateStructure',
    collection: '/sap/bc/adt/ddic/structures',
    run: (ctx: any) =>
      handleCreateStructure(ctx, {
        structure_name: 'ZSAH_STRU_TEST',
        package_name: '$TMP',
        description: 'language family test',
        fields: [{ name: 'ID', data_type: 'CHAR', length: 10 }],
        activate: false,
      }),
  },
  {
    name: 'CreateServiceDefinition',
    collection: '/sap/bc/adt/ddic/srvd/sources',
    run: (ctx: any) =>
      handleCreateServiceDefinition(ctx, {
        service_definition_name: 'ZSAH_SRVD_TEST',
        package_name: '$TMP',
        description: 'language family test',
        activate: false,
      }),
  },
  {
    name: 'CreateMetadataExtension',
    collection: '/sap/bc/adt/ddic/ddlx/sources',
    run: (ctx: any) =>
      handleCreateMetadataExtension(ctx, {
        name: 'ZSAH_DDLX_TEST',
        package_name: '$TMP',
        description: 'language family test',
        activate: false,
      }),
  },
] as const;

describe('Create-payload logon-language remainder (backlog 11-⑫)', () => {
  for (const c of CREATE_CASES) {
    it(`${c.name} stamps the create payload with the system logon language (CS)`, async () => {
      const connection = new FakeConnection();
      const result = await c.run(makeContext(connection));
      expect(result.isError).toBeFalsy();

      const post = connection.createPost(c.collection);
      expect(post).toBeDefined();
      expect(post?.data).toContain('adtcore:language="CS"');
      expect(post?.data).toContain('adtcore:masterLanguage="CS"');
      expect(post?.data).not.toContain('adtcore:language="EN"');
      expect(post?.data).not.toContain('adtcore:masterLanguage="EN"');
    });

    it(`${c.name} falls back to EN when systeminformation is unavailable`, async () => {
      const connection = new FakeConnection();
      connection.systemInfoAvailable = false;
      const result = await c.run(makeContext(connection));
      expect(result.isError).toBeFalsy();

      const post = connection.createPost(c.collection);
      expect(post).toBeDefined();
      expect(post?.data).toContain('adtcore:language="EN"');
      expect(post?.data).toContain('adtcore:masterLanguage="EN"');
    });
  }
});
