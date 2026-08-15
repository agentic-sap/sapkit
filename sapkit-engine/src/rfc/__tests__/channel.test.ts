/**
 * 분배층 — 고른 통로를 실제로 만들어 주고, **없는 통로는 정직하게 실패**한다.
 *
 * 조용한 대체가 이 계층의 유일한 금기다: 미구현 통로가 선택됐는데 odata로
 * 넘어가면 사용자는 자기가 고른 통로가 동작한다고 믿게 된다(거짓 성공).
 */

import { RfcError } from '../errors';
import { createRfcChannel } from '../index';
import * as select from '../select';
import type { RfcBackendName } from '../types';
import { fakeConnection, rfcEnv, scripted } from './support';

/**
 * 지어진 다섯 통로와, 각 통로가 **생성 시점에** 요구하는 최소 설정.
 *
 * 통로별 상세 계약은 각자의 시험 파일이 갖는다. 여기서 보는 것은 하나뿐이다 —
 * **고른 이름이 그 통로로 이어지는가.** 그래서 최소 설정만 준다.
 */
const BUILT: readonly { backend: RfcBackendName; env: Record<string, string> }[] = [
  { backend: 'odata' as const, env: rfcEnv() },
  { backend: 'soap' as const, env: {} },
  {
    backend: 'native' as const,
    env: {
      SAP_RFC_ASHOST: 's4h.example.test',
      SAP_RFC_SYSNR: '00',
      SAP_RFC_CLIENT: '100',
      SAP_RFC_USER: 'MCP_RFC',
      SAP_RFC_PASSWD: 'not-a-real-secret',
    },
  },
  { backend: 'gateway' as const, env: { SAP_RFC_GATEWAY_URL: 'https://gw.example.test' } },
  { backend: 'zrfc' as const, env: { SAP_RFC_ZRFC_BASE_URL: 'https://s4h.example.test/sap/bc/rest/zmcp_rfc' } },
];

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

describe('createRfcChannel — 다섯 통로가 전부 배선돼 있다', () => {
  it.each(BUILT)('$backend를 고르면 그 통로가 만들어진다', ({ backend, env }) => {
    const channel = createRfcChannel({
      connection: fakeConnection(),
      env: { ...env, SAP_RFC_BACKEND: backend },
      transport: scripted([]).transport,
    });
    // 조용한 대체의 실증 방지: 고른 이름이 그대로 나와야 한다. odata로 흘러내리면
    // 사용자는 자기가 고른 경로가 동작한다고 믿게 된다.
    expect(channel.backend).toBe(backend);
  });

  it.each(BUILT)('$backend는 더 이상 backend-unsupported로 거부되지 않는다', ({ backend, env }) => {
    expect(() =>
      createRfcChannel({
        connection: fakeConnection(),
        env: { ...env, SAP_RFC_BACKEND: backend },
        transport: scripted([]).transport,
      }),
    ).not.toThrow();
  });

  it('필수 키가 빠지면 backend-unsupported가 아니라 그 통로의 config 오류가 난다', () => {
    // 배선 전에는 이 자리가 backend-unsupported였다. 이제는 통로가 실재하므로
    // 진짜 원인(설정 누락)이 드러나야 한다 — 원인을 바꿔치기하지 않는다.
    let caught: unknown;
    try {
      createRfcChannel({
        connection: fakeConnection(),
        env: { SAP_RFC_BACKEND: 'gateway' },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RfcError);
    const error = caught as RfcError;
    expect(error.kind).toBe('config');
    expect(error.message).toContain('SAP_RFC_GATEWAY_URL');
  });

  it('구현 목록에 없는 이름은 여전히 backend-unsupported로 막힌다 (방어가 살아 있다)', () => {
    // 여섯째 이름이 목록에만 추가되고 구현이 빠지는 경우를 흉내 낸다.
    // 이 방어가 죽으면 그때 그 이름은 조용히 odata로 흘러내린다.
    const spy = scripted([]);
    const unimplemented = jest
      .spyOn(select, 'selectRfcBackend')
      .mockReturnValue('grpc' as never);
    try {
      let caught: unknown;
      try {
        createRfcChannel({ connection: fakeConnection(), env: {}, transport: spy.transport });
      } catch (error) {
        caught = error;
      }
      expect((caught as RfcError).kind).toBe('backend-unsupported');
      expect(spy.calls).toHaveLength(0);
    } finally {
      unimplemented.mockRestore();
    }
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
