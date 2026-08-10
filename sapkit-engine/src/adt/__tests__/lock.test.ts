import type { ServerResponse } from 'node:http';

import { ACCEPT_LOCK_RESULT, AdtClient, CSRF_DISCOVERY_PATH } from '../client';
import { AdtError } from '../errors';
import { startTestServer, testConfig } from './testServer';
import type { RecordedRequest, TestServer } from './testServer';

const OBJECT_PATH = '/sap/bc/adt/oo/classes/zcl_dummy';

const LOCK_XML = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">',
  '<asx:values><DATA>',
  '<LOCK_HANDLE>LH/0001</LOCK_HANDLE>',
  '<CORRNR>DEVK900123</CORRNR>',
  '<CORRUSER>TESTUSER</CORRUSER>',
  '<IS_LOCAL/>',
  '</DATA></asx:values>',
  '</asx:abap>',
].join('');

const CONFLICT_XML = [
  '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">',
  '<namespace id="com.sap.adt"/>',
  '<type id="ExceptionResourceNoAccess"/>',
  '<message lang="EN">User OTHERUSER is currently editing ZCL_DUMMY (ENQUEUE lock)</message>',
  '</exc:exception>',
].join('');

interface Scenario {
  readonly lockStatus?: number;
  readonly lockBody?: string;
  readonly unlockStatus?: number;
  readonly unlockBody?: string;
}

const open: TestServer[] = [];

async function serveLockScenario(scenario: Scenario = {}): Promise<TestServer> {
  const server = await startTestServer((req: RecordedRequest, res: ServerResponse) => {
    if (req.path === CSRF_DISCOVERY_PATH) {
      res.setHeader('x-csrf-token', 'TOKEN-1');
      res.setHeader('set-cookie', ['SAP_SESSIONID_X01_100=sess-1; path=/']);
      res.statusCode = 200;
      res.end('<app:service/>');
      return;
    }
    const action = req.query.get('_action');
    if (action === 'LOCK') {
      res.statusCode = scenario.lockStatus ?? 200;
      res.end(scenario.lockBody ?? LOCK_XML);
      return;
    }
    if (action === 'UNLOCK') {
      res.statusCode = scenario.unlockStatus ?? 200;
      res.end(scenario.unlockBody ?? '');
      return;
    }
    res.statusCode = 200;
    res.end('ok');
  });
  open.push(server);
  return server;
}

afterEach(async () => {
  while (open.length > 0) {
    const server = open.pop();
    if (server) await server.close();
  }
});

function actionsOf(server: TestServer): (string | null)[] {
  return server.requests
    .filter((request) => request.path !== CSRF_DISCOVERY_PATH)
    .map((request) => request.query.get('_action'));
}

describe('AdtClient — 잠금 취득', () => {
  it('LOCK을 stateful 세션에서 POST하고 잠금 핸들·전송요청을 돌려준다', async () => {
    const server = await serveLockScenario();
    const client = new AdtClient(testConfig(server.baseUrl));

    const lock = await client.lock(OBJECT_PATH);

    expect(lock.handle).toBe('LH/0001');
    expect(lock.transport).toBe('DEVK900123');
    expect(lock.objectPath).toBe(OBJECT_PATH);

    const lockRequest = server.nth(1);
    expect(lockRequest.method).toBe('POST');
    expect(lockRequest.path).toBe(OBJECT_PATH);
    expect(lockRequest.query.get('_action')).toBe('LOCK');
    expect(lockRequest.query.get('accessMode')).toBe('MODIFY');
    expect(lockRequest.headers['x-sap-adt-sessiontype']).toBe('stateful');
    expect(lockRequest.headers.accept).toBe(ACCEPT_LOCK_RESULT);

    expect(client.sessionType).toBe('stateful');
    expect(client.activeLocks()).toHaveLength(1);
  });

  it('잠금 흐름의 CSRF 취득도 같은 stateful 세션에서 나간다', async () => {
    const server = await serveLockScenario();
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.lock(OBJECT_PATH);

    const discovery = server.nth(0);
    expect(discovery.path).toBe(CSRF_DISCOVERY_PATH);
    expect(discovery.headers['x-sap-adt-sessiontype']).toBe('stateful');
  });

  it('다른 사용자가 잠갔으면 lock-conflict로 정규화하고 세션을 되돌린다', async () => {
    const server = await serveLockScenario({ lockStatus: 403, lockBody: CONFLICT_XML });
    const client = new AdtClient(testConfig(server.baseUrl));

    const error = await client.lock(OBJECT_PATH).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('lock-conflict');
    expect((error as AdtError).adtType).toBe('ExceptionResourceNoAccess');
    expect((error as AdtError).adtMessage).toContain('OTHERUSER');
    expect(client.activeLocks()).toHaveLength(0);
    expect(client.sessionType).toBe('stateless');
  });

  it('423 Locked도 lock-conflict다', async () => {
    const server = await serveLockScenario({ lockStatus: 423, lockBody: 'locked' });
    const client = new AdtClient(testConfig(server.baseUrl));

    const error = await client.lock(OBJECT_PATH).catch((e: unknown) => e);

    expect((error as AdtError).kind).toBe('lock-conflict');
    expect(client.activeLocks()).toHaveLength(0);
  });

  it('LOCK_HANDLE이 없는 응답은 protocol 오류이고 잠금을 등록하지 않는다', async () => {
    const server = await serveLockScenario({
      lockBody: '<asx:abap><asx:values><DATA><CORRNR>DEVK900123</CORRNR></DATA></asx:values></asx:abap>',
    });
    const client = new AdtClient(testConfig(server.baseUrl));

    const error = await client.lock(OBJECT_PATH).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('protocol');
    expect((error as AdtError).rawBody).toContain('DEVK900123');
    expect(client.activeLocks()).toHaveLength(0);
    expect(client.sessionType).toBe('stateless');
  });
});

describe('AdtClient — 잠금 해제', () => {
  it('UNLOCK에 잠금 핸들을 퍼센트 인코딩해 싣고 세션을 stateless로 되돌린다', async () => {
    const server = await serveLockScenario();
    const client = new AdtClient(testConfig(server.baseUrl));

    const lock = await client.lock(OBJECT_PATH);
    await client.unlock(lock);

    const unlockRequest = server.nth(2);
    expect(unlockRequest.method).toBe('POST');
    expect(unlockRequest.query.get('_action')).toBe('UNLOCK');
    expect(unlockRequest.query.get('lockHandle')).toBe('LH/0001');
    expect(unlockRequest.url).toContain('lockHandle=LH%2F0001');
    expect(unlockRequest.headers['x-sap-adt-sessiontype']).toBe('stateful');

    expect(client.activeLocks()).toHaveLength(0);
    expect(client.sessionType).toBe('stateless');
  });

  it('releaseAllLocks는 남은 잠금을 모두 해제 시도한다', async () => {
    const server = await serveLockScenario();
    const client = new AdtClient(testConfig(server.baseUrl));

    await client.lock(OBJECT_PATH);
    await client.lock('/sap/bc/adt/oo/classes/zcl_other');
    expect(client.activeLocks()).toHaveLength(2);

    await client.releaseAllLocks();

    expect(client.activeLocks()).toHaveLength(0);
    expect(actionsOf(server).filter((action) => action === 'UNLOCK')).toHaveLength(2);
  });
});

describe('AdtClient — withLock 해제 보장', () => {
  it('성공 경로에서 잠금·작업·해제를 순서대로 수행한다', async () => {
    const server = await serveLockScenario();
    const client = new AdtClient(testConfig(server.baseUrl));

    const result = await client.withLock(OBJECT_PATH, async (lock) => {
      expect(client.sessionType).toBe('stateful');
      await client.request({
        method: 'PUT',
        path: `${OBJECT_PATH}/source/main`,
        params: { lockHandle: lock.handle },
        body: 'CLASS zcl_dummy DEFINITION.',
      });
      return 'done';
    });

    expect(result).toBe('done');
    expect(actionsOf(server)).toEqual(['LOCK', null, 'UNLOCK']);
    expect(server.nth(2).headers['x-sap-adt-sessiontype']).toBe('stateful');
    expect(client.activeLocks()).toHaveLength(0);
    expect(client.sessionType).toBe('stateless');
  });

  it('작업이 실패해도 잠금을 해제하고 원래 오류를 올린다', async () => {
    const server = await serveLockScenario();
    const client = new AdtClient(testConfig(server.baseUrl));
    const failure = new Error('작업 중 실패');

    const error = await client
      .withLock(OBJECT_PATH, async () => {
        throw failure;
      })
      .catch((e: unknown) => e);

    expect(error).toBe(failure);
    expect(actionsOf(server)).toEqual(['LOCK', 'UNLOCK']);
    expect(client.activeLocks()).toHaveLength(0);
    expect(client.sessionType).toBe('stateless');
  });

  it('해제가 실패하면 잠금이 activeLocks에 남아 누수가 드러난다', async () => {
    const server = await serveLockScenario({ unlockStatus: 500, unlockBody: 'unlock failed' });
    const client = new AdtClient(testConfig(server.baseUrl));

    const error = await client.withLock(OBJECT_PATH, async () => 'ok').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AdtError);
    expect((error as AdtError).kind).toBe('server');
    expect(actionsOf(server)).toEqual(['LOCK', 'UNLOCK']);
    expect(client.activeLocks()).toHaveLength(1);
  });

  it('작업 실패와 해제 실패가 겹치면 작업 오류가 이긴다', async () => {
    const server = await serveLockScenario({ unlockStatus: 500, unlockBody: 'unlock failed' });
    const client = new AdtClient(testConfig(server.baseUrl));
    const failure = new Error('작업 중 실패');

    const error = await client
      .withLock(OBJECT_PATH, async () => {
        throw failure;
      })
      .catch((e: unknown) => e);

    expect(error).toBe(failure);
    expect(actionsOf(server)).toEqual(['LOCK', 'UNLOCK']);
    expect(client.activeLocks()).toHaveLength(1);
  });

  it('잠금 취득 자체가 실패하면 작업도 해제도 하지 않는다', async () => {
    const server = await serveLockScenario({ lockStatus: 403, lockBody: CONFLICT_XML });
    const client = new AdtClient(testConfig(server.baseUrl));
    const work = jest.fn();

    const error = await client.withLock(OBJECT_PATH, async () => work()).catch((e: unknown) => e);

    expect((error as AdtError).kind).toBe('lock-conflict');
    expect(work).not.toHaveBeenCalled();
    expect(actionsOf(server)).toEqual(['LOCK']);
  });
});
