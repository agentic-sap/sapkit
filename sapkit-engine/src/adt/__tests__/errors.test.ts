import { AdtError, adtErrorFromResponse, parseAdtExceptionXml } from '../errors';

const EXCEPTION_XML = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">',
  '<namespace id="com.sap.adt"/>',
  '<type id="InvalidObjName"/>',
  '<message lang="EN">Object name ZDUMMY_T1 is not valid</message>',
  '<localizedMessage lang="DE">Objektname ZDUMMY_T1 ist ungueltig</localizedMessage>',
  '<properties>',
  '<entry key="LONGTEXT"/>',
  '<entry key="T100KEY-ID">SWB_TOOL</entry>',
  '<entry key="T100KEY-NO">016</entry>',
  '</properties>',
  '</exc:exception>',
].join('');

const LOCKED_XML = [
  '<exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">',
  '<namespace id="com.sap.adt"/>',
  '<type id="ExceptionResourceNoAccess"/>',
  '<message lang="EN">User OTHERUSER is currently editing the object (ENQUEUE lock)</message>',
  '</exc:exception>',
].join('');

describe('parseAdtExceptionXml', () => {
  it('type/namespace의 id 속성과 메시지·속성표를 뽑는다', () => {
    const parsed = parseAdtExceptionXml(EXCEPTION_XML);
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe('InvalidObjName');
    expect(parsed?.namespace).toBe('com.sap.adt');
    expect(parsed?.message).toBe('Object name ZDUMMY_T1 is not valid');
    expect(parsed?.localizedMessage).toBe('Objektname ZDUMMY_T1 ist ungueltig');
    expect(parsed?.properties['T100KEY-ID']).toBe('SWB_TOOL');
    expect(parsed?.properties['T100KEY-NO']).toBe('016');
    expect(parsed?.properties['LONGTEXT']).toBe('');
  });

  it('접두사 없는 <exception>도 받아준다', () => {
    const parsed = parseAdtExceptionXml('<exception><type id="Boom"/><message>bang</message></exception>');
    expect(parsed?.type).toBe('Boom');
    expect(parsed?.message).toBe('bang');
  });

  it('ADT 예외가 아닌 본문은 null이다', () => {
    expect(parseAdtExceptionXml('')).toBeNull();
    expect(parseAdtExceptionXml('plain text failure')).toBeNull();
    expect(parseAdtExceptionXml('<html><body>Gateway Timeout</body></html>')).toBeNull();
  });

  it('깨진 XML에도 던지지 않고 null을 준다', () => {
    expect(parseAdtExceptionXml('<exc:exception><type id="x"')).toBeNull();
  });
});

describe('adtErrorFromResponse', () => {
  const at = { method: 'POST', url: 'https://sap.example.test/sap/bc/adt/oo/classes/zcl_x' };

  it('HTTP 상태를 구조화된 종류로 정규화한다', () => {
    expect(adtErrorFromResponse({ ...at, status: 401, body: '' }).kind).toBe('auth');
    expect(adtErrorFromResponse({ ...at, status: 403, body: '' }).kind).toBe('forbidden');
    expect(adtErrorFromResponse({ ...at, status: 404, body: '' }).kind).toBe('not-found');
    expect(adtErrorFromResponse({ ...at, status: 409, body: '' }).kind).toBe('lock-conflict');
    expect(adtErrorFromResponse({ ...at, status: 423, body: '' }).kind).toBe('lock-conflict');
    expect(adtErrorFromResponse({ ...at, status: 400, body: '' }).kind).toBe('http');
    expect(adtErrorFromResponse({ ...at, status: 500, body: '' }).kind).toBe('server');
    expect(adtErrorFromResponse({ ...at, status: 502, body: '' }).kind).toBe('server');
  });

  it('403 + ExceptionResourceNoAccess는 잠금 충돌로 본다', () => {
    const error = adtErrorFromResponse({ ...at, status: 403, body: LOCKED_XML });
    expect(error.kind).toBe('lock-conflict');
    expect(error.adtType).toBe('ExceptionResourceNoAccess');
    expect(error.adtMessage).toContain('OTHERUSER');
  });

  it('오류 XML의 필드를 구조화해 싣고 원문을 보존한다', () => {
    const error = adtErrorFromResponse({ ...at, status: 400, body: EXCEPTION_XML });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AdtError);
    expect(error.name).toBe('AdtError');
    expect(error.status).toBe(400);
    expect(error.method).toBe('POST');
    expect(error.adtType).toBe('InvalidObjName');
    expect(error.adtNamespace).toBe('com.sap.adt');
    expect(error.adtMessage).toBe('Object name ZDUMMY_T1 is not valid');
    expect(error.adtProperties['T100KEY-ID']).toBe('SWB_TOOL');
    expect(error.rawBody).toBe(EXCEPTION_XML);
  });

  it('message 하나로 상위 계층이 문자열 파싱 없이 원인을 읽을 수 있다', () => {
    const error = adtErrorFromResponse({ ...at, status: 400, body: EXCEPTION_XML });
    expect(error.message).toContain('400');
    expect(error.message).toContain('InvalidObjName');
    expect(error.message).toContain('Object name ZDUMMY_T1 is not valid');
  });

  it('XML이 아닌 오류 본문도 원문을 잃지 않는다', () => {
    const error = adtErrorFromResponse({ ...at, status: 500, body: 'Internal Server Error' });
    expect(error.adtType).toBeUndefined();
    expect(error.rawBody).toBe('Internal Server Error');
    expect(error.adtProperties).toEqual({});
  });

  it('message가 없으면 localizedMessage로 대체한다', () => {
    const error = adtErrorFromResponse({
      ...at,
      status: 400,
      body: '<exc:exception><type id="X"/><localizedMessage lang="KO">대체 문구</localizedMessage></exc:exception>',
    });
    expect(error.adtMessage).toBe('대체 문구');
  });

  it('kind를 명시하면 상태 기반 분류를 덮어쓴다 (CSRF 소진 경로)', () => {
    const error = adtErrorFromResponse({ ...at, status: 403, body: 'CSRF token validation failed' }, 'csrf');
    expect(error.kind).toBe('csrf');
  });
});
