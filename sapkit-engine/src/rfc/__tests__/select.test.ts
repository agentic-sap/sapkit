/**
 * 통로 선택 계약 — 구 엔진 `engine/src/lib/rfcBackend.ts:34-48` 실측 대조.
 *
 * 검증하는 사실:
 * - 키는 `SAP_RFC_BACKEND` 하나. 값 하나가 통로 하나를 고른다.
 * - 미설정과 빈 값 **둘 다** 기본값 `odata`로 간다.
 * - 대소문자·앞뒤 공백을 무시한다.
 * - 알 수 없는 값은 **던진다** — 기본값으로 조용히 폴백하지 않는다.
 * - 폴백 사슬(한 통로가 실패하면 다음 통로)은 **없다**.
 */

import { RfcError } from '../errors';
import {
  DEFAULT_RFC_BACKEND,
  IMPLEMENTED_RFC_BACKENDS,
  RFC_BACKEND_NAMES,
  mergeRfcEnv,
  selectRfcBackend,
} from '../select';

describe('selectRfcBackend — SAP_RFC_BACKEND 하나가 통로를 고른다', () => {
  it('키가 아예 없으면 기본값 odata', () => {
    expect(selectRfcBackend({})).toBe('odata');
  });

  it('빈 문자열도 기본값 odata — 빈 줄이 옛 soap을 조용히 고르지 않는다', () => {
    expect(selectRfcBackend({ SAP_RFC_BACKEND: '' })).toBe('odata');
  });

  it('공백만 있어도 기본값 odata', () => {
    expect(selectRfcBackend({ SAP_RFC_BACKEND: '   ' })).toBe('odata');
  });

  it.each(['odata', 'soap', 'native', 'gateway', 'zrfc'] as const)(
    '%s를 그대로 고른다',
    (name) => {
      expect(selectRfcBackend({ SAP_RFC_BACKEND: name })).toBe(name);
    },
  );

  it('대소문자를 무시한다', () => {
    expect(selectRfcBackend({ SAP_RFC_BACKEND: 'NATIVE' })).toBe('native');
    expect(selectRfcBackend({ SAP_RFC_BACKEND: 'OData' })).toBe('odata');
  });

  it('앞뒤 공백을 허용한다', () => {
    expect(selectRfcBackend({ SAP_RFC_BACKEND: '  native  ' })).toBe('native');
  });

  it('알 수 없는 값은 던진다 — 기본값으로 폴백하지 않는다', () => {
    let caught: unknown;
    try {
      selectRfcBackend({ SAP_RFC_BACKEND: 'grpc' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RfcError);
    const error = caught as RfcError;
    expect(error.kind).toBe('config');
    // 받은 값과 유효한 이름 다섯을 모두 문구에 담는다.
    expect(error.message).toContain('grpc');
    for (const name of RFC_BACKEND_NAMES) expect(error.message).toContain(name);
  });

  it('기본값 상수와 이름 목록이 실측 계약과 같다', () => {
    expect(DEFAULT_RFC_BACKEND).toBe('odata');
    expect([...RFC_BACKEND_NAMES].sort()).toEqual(
      ['gateway', 'native', 'odata', 'soap', 'zrfc'].sort(),
    );
  });

  it('M1에서 실제로 구현된 통로는 odata 하나뿐이라고 선언한다', () => {
    expect([...IMPLEMENTED_RFC_BACKENDS]).toEqual(['odata']);
  });
});

describe('mergeRfcEnv — 프로파일 파일과 프로세스 env의 합류 규칙', () => {
  it('프로파일에만 있는 SAP_RFC_ 키가 살아남는다', () => {
    expect(mergeRfcEnv({ SAP_RFC_BACKEND: 'soap' }, {})).toEqual({
      SAP_RFC_BACKEND: 'soap',
    });
  });

  it('프로세스 env가 비어 있지 않으면 프로세스 env가 이긴다 (구 launcher 실측)', () => {
    expect(
      mergeRfcEnv({ SAP_RFC_BACKEND: 'soap' }, { SAP_RFC_BACKEND: 'native' }),
    ).toEqual({ SAP_RFC_BACKEND: 'native' });
  });

  it('프로세스 env가 빈 문자열이면 없는 것으로 보고 프로파일이 산다', () => {
    expect(mergeRfcEnv({ SAP_RFC_BACKEND: 'soap' }, { SAP_RFC_BACKEND: '' })).toEqual({
      SAP_RFC_BACKEND: 'soap',
    });
  });

  it('SAP_RFC_ 접두사가 아닌 키는 결과에 담지 않는다 — 자격증명이 새지 않는다', () => {
    const merged = mergeRfcEnv(
      { SAP_PASSWORD: 'not-a-real-secret', SAP_RFC_BACKEND: 'odata' },
      { SAP_USERNAME: 'TESTUSER' },
    );
    expect(merged).toEqual({ SAP_RFC_BACKEND: 'odata' });
  });

  it('프로세스 env 인자를 생략해도 동작한다', () => {
    expect(mergeRfcEnv({ SAP_RFC_ODATA_CSRF_TTL_SEC: '900' })).toEqual({
      SAP_RFC_ODATA_CSRF_TTL_SEC: '900',
    });
  });
});
