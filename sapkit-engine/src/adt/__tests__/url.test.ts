import { buildAdtUrl } from '../url';
import { offlineConfig } from './testServer';

describe('buildAdtUrl', () => {
  it('설정된 client는 질의 인자로 붙지 않는다 (헤더+쿠키로 나간다)', () => {
    const url = buildAdtUrl(offlineConfig(), '/sap/bc/adt/oo/classes/zcl_x');
    expect(url).toBe('https://sap.example.test:44300/sap/bc/adt/oo/classes/zcl_x');
    expect(url).not.toContain('sap-client');
  });

  it('설정된 language를 ADT 요청 URL에 싣지 않는다', () => {
    const url = buildAdtUrl(offlineConfig({ language: 'DE' }), '/sap/bc/adt/oo/classes/zcl_x', {
      version: 'active',
    });
    expect(url).toBe(
      'https://sap.example.test:44300/sap/bc/adt/oo/classes/zcl_x?version=active',
    );
    expect(url).not.toContain('sap-language');
  });

  it('client·language가 없어도 결과가 같다', () => {
    const url = buildAdtUrl(
      offlineConfig({ client: undefined, language: undefined }),
      '/sap/bc/adt/core/discovery',
    );
    expect(url).toBe('https://sap.example.test:44300/sap/bc/adt/core/discovery');
  });

  it('baseUrl 끝 슬래시와 path 앞 슬래시를 정규화한다', () => {
    const url = buildAdtUrl(
      offlineConfig({ baseUrl: 'https://sap.example.test:44300//', client: undefined, language: undefined }),
      'sap/bc/adt/discovery',
    );
    expect(url).toBe('https://sap.example.test:44300/sap/bc/adt/discovery');
  });

  it('params를 순서대로 붙이고 값을 퍼센트 인코딩한다', () => {
    const url = buildAdtUrl(
      offlineConfig({ client: undefined, language: undefined }),
      '/sap/bc/adt/oo/classes/zcl_x',
      { _action: 'UNLOCK', lockHandle: 'AB/CD EF+GH&IJ' },
    );
    expect(url).toBe(
      'https://sap.example.test:44300/sap/bc/adt/oo/classes/zcl_x' +
        '?_action=UNLOCK&lockHandle=AB%2FCD%20EF%2BGH%26IJ',
    );
  });

  it('공백을 +가 아니라 %20으로 인코딩한다', () => {
    const url = buildAdtUrl(offlineConfig({ client: undefined, language: undefined }), '/x', {
      q: 'a b',
    });
    expect(url).toContain('q=a%20b');
    expect(url).not.toContain('+');
  });

  it('undefined params는 건너뛴다', () => {
    const url = buildAdtUrl(offlineConfig({ client: undefined, language: undefined }), '/x', {
      corrNr: undefined,
      version: 'active',
    });
    expect(url).toBe('https://sap.example.test:44300/x?version=active');
  });

  it('path에 이미 붙어 있는 질의를 보존하고 병합한다', () => {
    const url = buildAdtUrl(
      offlineConfig({ client: undefined, language: undefined }),
      '/x?version=active',
      { lockHandle: 'H1' },
    );
    expect(url).toBe('https://sap.example.test:44300/x?version=active&lockHandle=H1');
  });

  it('호출자가 sap-client를 직접 주면 그것만 나간다 (중복 없음)', () => {
    const url = buildAdtUrl(offlineConfig(), '/x', { 'sap-client': '200' });
    expect(url).toBe('https://sap.example.test:44300/x?sap-client=200');
  });

  it('boolean·number params를 문자열로 직렬화한다', () => {
    const url = buildAdtUrl(offlineConfig({ client: undefined, language: undefined }), '/x', {
      preauditRequested: false,
      rows: 100,
    });
    expect(url).toBe('https://sap.example.test:44300/x?preauditRequested=false&rows=100');
  });
});
