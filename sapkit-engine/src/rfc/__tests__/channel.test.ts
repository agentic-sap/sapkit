/**
 * 분배층 — 고른 통로를 실제로 만들어 주고, **없는 통로는 정직하게 실패**한다.
 *
 * 조용한 대체가 이 계층의 유일한 금기다: 미구현 통로가 선택됐는데 odata로
 * 넘어가면 사용자는 자기가 고른 통로가 동작한다고 믿게 된다(거짓 성공).
 */

import { RfcError } from '../errors';
import { createRfcChannel } from '../index';
import { fakeConnection, rfcEnv, scripted } from './support';

const UNIMPLEMENTED = ['soap', 'native', 'gateway', 'zrfc'] as const;

describe('createRfcChannel — 구현된 통로', () => {
  it('키가 없으면 기본값 odata 통로를 만든다', () => {
    const channel = createRfcChannel({
      connection: fakeConnection(),
      env: rfcEnv(),
      transport: scripted([]).transport,
    });
    expect(channel.backend).toBe('odata');
  });

  it('SAP_RFC_BACKEND=odata를 명시해도 같다', () => {
    const channel = createRfcChannel({
      connection: fakeConnection(),
      env: rfcEnv({ SAP_RFC_BACKEND: 'odata' }),
      transport: scripted([]).transport,
    });
    expect(channel.backend).toBe('odata');
  });

  it('odata 필수 키가 없으면 통로 생성이 config 오류로 막힌다', () => {
    let caught: unknown;
    try {
      createRfcChannel({ connection: fakeConnection(), env: {} });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RfcError);
    const error = caught as RfcError;
    expect(error.kind).toBe('config');
    expect(error.message).toContain('SAP_RFC_ODATA_SERVICE_URL');
  });
});

describe('createRfcChannel — 미구현 통로는 정직하게 실패한다', () => {
  it.each(UNIMPLEMENTED)('%s를 고르면 던진다 (조용한 대체 없음)', (backend) => {
    let caught: unknown;
    try {
      createRfcChannel({
        connection: fakeConnection(),
        env: rfcEnv({ SAP_RFC_BACKEND: backend }),
        transport: scripted([]).transport,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RfcError);
    const error = caught as RfcError;
    expect(error.kind).toBe('backend-unsupported');
    expect(error.backend).toBe(backend);
    // 무엇을 골랐고 지금 무엇이 되는지를 둘 다 말한다.
    expect(error.message).toContain(backend);
    expect(error.message).toContain('odata');
  });

  it('미구현 통로를 골랐을 때 odata 통로가 대신 만들어지지 않는다', () => {
    const spy = scripted([]);
    expect(() =>
      createRfcChannel({
        connection: fakeConnection(),
        env: rfcEnv({ SAP_RFC_BACKEND: 'soap' }),
        transport: spy.transport,
      }),
    ).toThrow(RfcError);
    expect(spy.calls).toHaveLength(0);
  });

  it('미구현 통로 오류가 필수 키 누락보다 먼저 판정된다 — 원인을 바꿔치기하지 않는다', () => {
    let caught: unknown;
    try {
      createRfcChannel({
        connection: fakeConnection(),
        env: { SAP_RFC_BACKEND: 'gateway' },
      });
    } catch (error) {
      caught = error;
    }
    expect((caught as RfcError).kind).toBe('backend-unsupported');
  });

  it('알 수 없는 값은 통로 생성 경로에서도 config 오류다', () => {
    let caught: unknown;
    try {
      createRfcChannel({ connection: fakeConnection(), env: { SAP_RFC_BACKEND: 'grpc' } });
    } catch (error) {
      caught = error;
    }
    expect((caught as RfcError).kind).toBe('config');
  });
});
