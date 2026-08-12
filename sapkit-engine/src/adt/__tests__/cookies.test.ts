import { CookieJar } from '../cookies';

describe('CookieJar', () => {
  it('빈 저장소는 Cookie 헤더를 만들지 않는다', () => {
    expect(new CookieJar().header()).toBeUndefined();
  });

  it('Set-Cookie의 속성부를 버리고 name=value만 보관한다', () => {
    const jar = new CookieJar();
    jar.accept([
      'SAP_SESSIONID_X01_100=abc123; path=/; HttpOnly; Secure; SameSite=None',
      'sap-usercontext=sap-client=100; path=/',
    ]);
    expect(jar.get('SAP_SESSIONID_X01_100')).toBe('abc123');
    expect(jar.get('sap-usercontext')).toBe('sap-client=100');
    expect(jar.header()).toBe('SAP_SESSIONID_X01_100=abc123; sap-usercontext=sap-client=100');
  });

  it('같은 이름은 나중 값으로 덮어쓴다 (재로그온 시 세션 갱신)', () => {
    const jar = new CookieJar();
    jar.accept(['SAP_SESSIONID_X01_100=first; path=/']);
    jar.accept(['SAP_SESSIONID_X01_100=second; path=/']);
    expect(jar.get('SAP_SESSIONID_X01_100')).toBe('second');
    expect(jar.size).toBe(1);
  });

  it('빈 값으로 오는 Set-Cookie는 삭제로 본다', () => {
    const jar = new CookieJar();
    jar.accept(['SAP_SESSIONID_X01_100=abc123; path=/']);
    jar.accept(['SAP_SESSIONID_X01_100=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/']);
    expect(jar.get('SAP_SESSIONID_X01_100')).toBeUndefined();
    expect(jar.header()).toBeUndefined();
  });

  it('= 없는 조각과 이름 없는 조각은 무시한다', () => {
    const jar = new CookieJar();
    jar.accept(['garbage', '=novalue; path=/', 'ok=1']);
    expect(jar.size).toBe(1);
    expect(jar.header()).toBe('ok=1');
  });

  it('clear()가 전부 비운다', () => {
    const jar = new CookieJar();
    jar.accept(['a=1', 'b=2']);
    expect(jar.size).toBe(2);
    jar.clear();
    expect(jar.size).toBe(0);
    expect(jar.header()).toBeUndefined();
  });

  it('names()는 보관 순서를 유지한다', () => {
    const jar = new CookieJar();
    jar.accept(['a=1', 'b=2', 'c=3']);
    expect(jar.names()).toEqual(['a', 'b', 'c']);
  });
});
