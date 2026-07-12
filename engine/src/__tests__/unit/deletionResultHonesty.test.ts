/**
 * Regression test for the silent-delete-failure bug (HANDOFF §6 backlog 3-5).
 *
 * The generic ADT deletion service (`POST /sap/bc/adt/deletion/delete`) returns
 * HTTP 200 even when it REFUSES the delete (e.g. the object is still locked):
 * the real outcome is carried only by
 * `del:deletionResult/del:object[@del:isDeleted]` plus an E-level `del:message`.
 * The vendored low-level `deleteX()` helpers discarded that body and hardcoded
 * `{ success: true }`, so a failed delete (live-measured 3x on
 * DeleteFunctionGroup) was reported to the caller as a success.
 *
 * The fix adds a shared `assertDeletionSucceeded()` (vendored
 * `utils/internalUtils.js`, applied via patch-package) that every reachable
 * `/deletion/delete` helper now calls before returning, throwing with the SAP
 * message on a positively-identified failure. This drives the REAL delete
 * handlers over a fake connection serving a controllable deletion response,
 * covering the hardcoded-success family (function group / class / program) and
 * the raw-response family (behavior definition).
 *
 * SAP-independent. Reverse-verify: with the vendored patch reverted the red
 * cases report success and these assertions fail.
 */

process.env.ADT_ACCEPT_CORRECTION = 'false';
delete process.env.SAP_VERSION;
delete process.env.SAP_SYSTEM_TYPE;

import { handleDeleteBehaviorDefinition } from '../../handlers/behavior_definition/high/handleDeleteBehaviorDefinition';
import { handleDeleteClass } from '../../handlers/class/high/handleDeleteClass';
import { handleDeleteFunctionGroup } from '../../handlers/function_group/high/handleDeleteFunctionGroup';
import { handleDeleteProgram } from '../../handlers/program/high/handleDeleteProgram';
import { handleDeleteStructure } from '../../handlers/structure/high/handleDeleteStructure';

const LOCK_MESSAGE = 'Object is locked by user HJAEWON and cannot be deleted';

const deletionResult = (isDeleted: boolean) =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
  `<del:object del:isDeleted="${isDeleted ? 'true' : 'false'}">` +
  (isDeleted
    ? ''
    : `<del:message><del:text>${LOCK_MESSAGE}</del:text></del:message>`) +
  '</del:object>' +
  '</del:deletionResult>';

const CHECK_OK =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<del:checkResponse xmlns:del="http://www.sap.com/adt/deletion">' +
  '<del:object del:isDeletable="true"/>' +
  '</del:checkResponse>';

/** Minimal IAbapConnection stand-in that serves a controllable deletion body. */
class FakeConnection {
  sessionMode: 'stateful' | 'stateless' = 'stateless';
  constructor(private readonly deleteSucceeds: boolean) {}

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
    const url = String(options.url);
    const ok = (data: string) => ({
      status: 200,
      statusText: 'OK',
      data,
      headers: {},
    });
    if (url.includes('/deletion/check')) return ok(CHECK_OK);
    if (url.includes('/deletion/delete'))
      return ok(deletionResult(this.deleteSucceeds));
    return ok('');
  }
}

interface DeleteCase {
  name: string;
  run: (context: any) => Promise<any>;
}

const CASES: DeleteCase[] = [
  {
    name: 'DeleteFunctionGroup',
    run: (ctx) =>
      handleDeleteFunctionGroup(ctx, { function_group_name: 'ZSAH_FG_TEST' }),
  },
  {
    name: 'DeleteClass',
    run: (ctx) => handleDeleteClass(ctx, { class_name: 'ZCL_SAH_TEST' }),
  },
  {
    name: 'DeleteProgram',
    run: (ctx) => handleDeleteProgram(ctx, { program_name: 'ZSAH_PROG_TEST' }),
  },
  {
    name: 'DeleteBehaviorDefinition',
    run: (ctx) =>
      handleDeleteBehaviorDefinition(ctx, {
        behavior_definition_name: 'ZSAH_BDEF_TEST',
      }),
  },
];

describe('Deletion-result honesty (regression: silent delete failure reported as success)', () => {
  for (const c of CASES) {
    it(`${c.name} reports a del:isDeleted="false" response as a failure with the SAP message`, async () => {
      const connection = new FakeConnection(false);
      const context = { connection, logger: undefined } as any;

      const result = await c.run(context);

      expect(result.isError).toBeTruthy();
      expect(JSON.stringify(result)).toContain(LOCK_MESSAGE);
    });

    it(`${c.name} still reports a del:isDeleted="true" response as a success`, async () => {
      const connection = new FakeConnection(true);
      const context = { connection, logger: undefined } as any;

      const result = await c.run(context);

      expect(result.isError).toBeFalsy();
    });
  }
});

// A single delete can cascade into several del:object nodes (a structure
// delete returns both its TABL/DS and TABT/DTT nodes), which fast-xml-parser
// yields as an ARRAY. The helper must treat that array correctly instead of
// mis-reading it as one object with no isDeleted flag (which reported a
// successful multi-node delete as a failure — caught live on DeleteStructure).
const multiObjectResult = (secondDeleted: boolean) =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<del:deletionResult xmlns:del="http://www.sap.com/adt/deletion">' +
  '<del:object del:isDeleted="true" adtcore:uri="/sap/bc/adt/ddic/db/settings/zsah_s">' +
  '<del:message del:type="S"><del:text/></del:message></del:object>' +
  `<del:object del:isDeleted="${secondDeleted ? 'true' : 'false'}" adtcore:uri="/sap/bc/adt/ddic/structures/zsah_s">` +
  (secondDeleted
    ? '<del:message del:type="S"><del:text/></del:message>'
    : `<del:message del:type="E"><del:text>${LOCK_MESSAGE}</del:text></del:message>`) +
  '</del:object>' +
  '</del:deletionResult>';

class MultiObjectFakeConnection extends FakeConnection {
  constructor(private readonly secondDeleted: boolean) {
    super(true);
  }
  async makeAdtRequest(options: any): Promise<any> {
    const url = String(options.url);
    const ok = (data: string) => ({
      status: 200,
      statusText: 'OK',
      data,
      headers: {},
    });
    if (url.includes('/deletion/check')) return ok(CHECK_OK);
    if (url.includes('/deletion/delete'))
      return ok(multiObjectResult(this.secondDeleted));
    return ok('');
  }
}

describe('Deletion-result honesty — cascade (multiple del:object nodes)', () => {
  it('reports a multi-node delete where every node isDeleted="true" as success', async () => {
    const connection = new MultiObjectFakeConnection(true);
    const result = await handleDeleteStructure(
      { connection, logger: undefined } as any,
      { structure_name: 'ZSAH_S_TEST' },
    );
    expect(result.isError).toBeFalsy();
  });

  it('reports a multi-node delete where one node isDeleted="false" as a failure', async () => {
    const connection = new MultiObjectFakeConnection(false);
    const result = await handleDeleteStructure(
      { connection, logger: undefined } as any,
      { structure_name: 'ZSAH_S_TEST' },
    );
    expect(result.isError).toBeTruthy();
    expect(JSON.stringify(result)).toContain(LOCK_MESSAGE);
  });
});
