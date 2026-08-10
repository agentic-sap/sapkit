/**
 * 마스킹 검사기 — **음성시험이 본체**다.
 *
 * 픽스처는 git에 커밋된다. 자격증명·호스트·접속정보·실데이터가 하나라도 새면
 * 되돌릴 수 없다. 그러니 여기서 확인하는 것은 "검사기가 통과시키는가"가 아니라
 * **"심어 둔 비밀마다 저장을 거부하는가"**이다.
 *
 * 아래 심는 값은 전부 가짜다. 검사기가 거부하므로 파일로 나가지도 않는다.
 */
import { MaskingRejection, assertMasked, scanForSecrets } from '../masking';
import { saveSequenceFixture } from '../record';
import type { FixtureWriter } from '../record';
import { normalizeFixture } from '../normalize';
import type { JsonValue, SequenceFixture } from '../types';
import { fixture, step, withArgs, withResponse } from './helpers';

const text = (t: string): SequenceFixture => withResponse({ content: [{ type: 'text', text: t }] });

/** 저장을 시도하고, 거부되면 규칙 id 목록을 돌려준다. 통과하면 빈 배열. */
function rejectionRules(f: SequenceFixture): string[] {
  try {
    assertMasked(f);
    return [];
  } catch (err) {
    if (err instanceof MaskingRejection) return [...new Set(err.violations.map((v) => v.ruleId))].sort();
    throw err;
  }
}

describe('마스킹 음성시험 — 심어 둔 비밀마다 거부한다', () => {
  it('Basic 인증 헤더', () => {
    expect(rejectionRules(text('Authorization: Basic ZGV2dXNlcjpodW50ZXIy'))).toContain('basic-auth');
  });

  it('접두어 없는 base64 자격증명 (user:pass 로 복호되는 덩어리)', () => {
    // "sapuser:s3cr3tpass" 를 base64 한 값 — Basic 접두어가 없어도 잡혀야 한다.
    const blob = Buffer.from('sapuser:s3cr3tpass', 'utf8').toString('base64');
    expect(rejectionRules(text(`token ${blob} end`))).toContain('base64-credential');
  });

  it('비밀번호처럼 보이는 env 값', () => {
    expect(rejectionRules(text('SAP_PASSWORD=Hunter2Hunter2'))).toContain('password-like');
  });

  it('비밀번호처럼 보이는 JSON 키', () => {
    expect(rejectionRules(withArgs({ password: 'Hunter2Hunter2' }))).toContain('password-like');
  });

  // 아래 호스트는 전부 라우팅되지 않는 이름(.internal/.local)과 사설 IP다 —
  // 규칙은 똑같이 걸리면서 실재하는 남의 도메인을 레포에 적지 않는다.
  it('실제 호스트명 — URL 오리진', () => {
    expect(rejectionRules(text('connecting to https://sapdev.acme-corp.internal:44300/sap/bc/adt'))).toContain('real-host');
  });

  it('실제 호스트명 — host:port 형태', () => {
    expect(rejectionRules(text('host=s4hana.acme.local:8000'))).toContain('real-host');
  });

  it('실제 호스트명 — 스킴도 포트도 없는 맨 이름', () => {
    expect(rejectionRules(text('reported by vhcalnplci.acme.internal'))).toContain('real-host');
  });

  it('실제 IP 주소', () => {
    expect(rejectionRules(text('resolved to 10.42.13.7'))).toContain('real-host');
  });

  it('접속정보 env 키', () => {
    expect(rejectionRules(withArgs({ SAP_URL: 'https://vhcalnplci.acme.internal:44300' }))).toContain('real-host');
  });

  it('쿠키 값', () => {
    expect(rejectionRules(text('Set-Cookie: SAP_SESSIONID_A4H_001=xJ3kQ9zLm2; path=/'))).toContain('cookie');
  });

  it('JWT', () => {
    expect(
      rejectionRules(text('bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1g')),
    ).toContain('jwt');
  });

  it('실데이터처럼 보이는 대량 결과 — 행 배열', () => {
    const rows: JsonValue = Array.from({ length: 40 }, (_, i) => ({ KUNNR: `C${i}`, NAME1: `고객 ${i}` }));
    const f = fixture([step({ index: 0, tool: 'GetTableContents', response: { rows } })]);
    expect(rejectionRules(f)).toContain('bulk-row-data');
  });

  it('실데이터처럼 보이는 대량 결과 — 구분자 텍스트', () => {
    const lines = Array.from({ length: 40 }, (_, i) => `C${i}|고객 ${i}|서울`).join('\n');
    expect(rejectionRules(text(lines))).toContain('bulk-row-data');
  });

  it('실데이터처럼 보이는 대량 결과 — 반복 row 태그', () => {
    const xml = Array.from({ length: 40 }, (_, i) => `<row><c>${i}</c></row>`).join('');
    expect(rejectionRules(text(xml))).toContain('bulk-row-data');
  });
});

describe('마스킹 정탐 — 깨끗한 픽스처는 통과한다', () => {
  it('가짜 호스트·ADT 네임스페이스·자리표시자만 있는 픽스처', () => {
    const f = normalizeFixture(
      fixture([
        step({
          index: 0,
          tool: 'GetSystemInfo',
          args: { destination: 'https://sap.example.test:44300' },
          response: {
            content: [
              {
                type: 'text',
                text:
                  '<?xml version="1.0"?><adtcore:objectReference xmlns:adtcore="http://www.sap.com/adt/core" ' +
                  'adtcore:uri="/sap/bc/adt/oo/classes/zcl_demo" adtcore:changedAt="2026-08-10T09:15:22Z"/>',
              },
            ],
          },
        }),
        step({ index: 1, tool: 'UpdateClass', args: { object_name: 'ZCL_DEMO', lockHandle: 'AB12CD34EF56' } }),
      ]),
    );
    expect(() => assertMasked(f)).not.toThrow();
  });

  it('작은 결과 집합은 대량 실데이터가 아니다', () => {
    const rows: JsonValue = Array.from({ length: 3 }, (_, i) => ({ MANDT: '001', ID: `${i}` }));
    const f = fixture([step({ index: 0, tool: 'GetTableContents', response: { rows } })]);
    expect(rejectionRules(f)).toEqual([]);
  });

  it('행 데이터 도구가 아닌 큰 목록 응답은 통과한다 (패키지 목록 등)', () => {
    const objects: JsonValue = Array.from({ length: 40 }, (_, i) => ({ name: `ZCL_DEMO_${i}`, type: 'CLAS/OC' }));
    const f = fixture([step({ index: 0, tool: 'GetPackageContents', response: { objects } })]);
    expect(rejectionRules(f)).toEqual([]);
  });

  it('SAP 커널 판 번호는 IP로 오해하지 않는다', () => {
    expect(rejectionRules(text('kernel release 753.0.0.0 patch 900'))).toEqual([]);
  });

  it('루프백 주소는 허용한다', () => {
    expect(rejectionRules(text('listening on 127.0.0.1:8000'))).toEqual([]);
  });
});

describe('마스킹 위반 보고 — 보고서 자체가 새면 안 된다', () => {
  it('위반 항목은 경로와 규칙만 담고 원문 비밀을 담지 않는다', () => {
    const secret = 'Hunter2Hunter2';
    const violations = scanForSecrets({ password: secret }, '/steps/0/args');
    expect(violations.length).toBeGreaterThan(0);
    expect(JSON.stringify(violations)).not.toContain(secret);
    expect(violations[0]?.path.startsWith('/steps/0/args')).toBe(true);
  });
});

describe('저장 게이트 — 거부는 경고가 아니라 거부다', () => {
  const spyWriter = (): FixtureWriter & { calls: string[] } => {
    const calls: string[] = [];
    return { calls, write: (filePath: string) => void calls.push(filePath) };
  };

  it('비밀이 있으면 파일을 쓰지 않는다', () => {
    const writer = spyWriter();
    const f = text('Authorization: Basic ZGV2dXNlcjpodW50ZXIy');
    expect(() => saveSequenceFixture(f, 'fixtures/x.json', { writer })).toThrow(MaskingRejection);
    expect(writer.calls).toEqual([]);
  });

  it('깨끗하면 쓴다', () => {
    const writer = spyWriter();
    const f = normalizeFixture(fixture([step({ index: 0 })]));
    saveSequenceFixture(f, 'fixtures/demo-read-class.json', { writer });
    expect(writer.calls).toEqual(['fixtures/demo-read-class.json']);
  });
});
