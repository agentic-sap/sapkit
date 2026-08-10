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

/**
 * 실데이터 도구가 **실제로 내는** 응답 형태.
 *
 * `handleGetTableContents`/`handleGetSqlQuery`는 행을 JSON 배열 노드로 싣지
 * 않는다 — `JSON.stringify(parsedData, null, 2)` **문자열**을 `content[0].text`에
 * 담는다. 음성시험을 맨 JSON 배열로 심으면 실제로 위험한 응답을 하나도 재현하지
 * 못한 채 통과해, 검사기의 구멍을 시험이 가려 준다.
 */
function rowDataFixture(tool: string, rowCount: number, columnCount = 2): SequenceFixture {
  const columns = Array.from({ length: columnCount }, (_, c) => ({
    name: `FIELD${c}`,
    type: 'CHAR',
    description: '',
    length: 10,
  }));
  const rows = Array.from({ length: rowCount }, (_, r) =>
    Object.fromEntries(columns.map((c, ci) => [c.name, `V${r}-${ci}`])),
  );
  const payload = {
    sql_query: 'SELECT * FROM ZDEMO',
    row_number: 100,
    returned_row_count: rowCount,
    columns,
    rows,
  };
  return withResponse({ content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }, tool);
}

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

  it('불투명 Bearer 토큰 — Basic도 JWT도 아니라 두 규칙 사이로 샜다', () => {
    expect(rejectionRules(text('Authorization: Bearer 8Kq2mZr7Vt4nBx9LpWc3Hd6Ys1Ug0Aj5'))).toContain('bearer-token');
  });

  it('실제 호스트명 — 단일 라벨 host:port (SAP 온프렘에 흔하다)', () => {
    expect(rejectionRules(text('probe sapdev01:44300 responded'))).toContain('real-host');
  });

  it('실제 IPv6 주소', () => {
    // RFC 3849가 문서용으로 예약한 접두사 — 라우팅되지 않는다. 규칙은 똑같이 걸린다.
    expect(rejectionRules(text('resolved to 2001:db8:85a3::8a2e:370:7334'))).toContain('real-host');
  });

  it('호스트명이 **키 이름** 자리에 실린 객체', () => {
    expect(rejectionRules(withResponse({ 'sapdev01.acme.internal': { status: 'up' } }))).toContain('real-host');
  });

  it('실데이터 — 구 엔진의 실제 응답 형태 (GetTableContents: text 안 pretty JSON)', () => {
    expect(rejectionRules(rowDataFixture('GetTableContents', 40))).toContain('bulk-row-data');
  });

  it('실데이터 — 구 엔진의 실제 응답 형태 (GetSqlQuery)', () => {
    expect(rejectionRules(rowDataFixture('GetSqlQuery', 40))).toContain('bulk-row-data');
  });

  it('실데이터 — text가 JSON으로 안 읽혀도 보수적 폴백이 센다', () => {
    const truncated =
      '{\n  "rows": [\n' + Array.from({ length: 40 }, (_, i) => `    {\n      "KUNNR": "C${i}"\n    },`).join('\n');
    const f = withResponse({ content: [{ type: 'text', text: truncated }] }, 'GetTableContents');
    expect(rejectionRules(f)).toContain('bulk-row-data');
  });

  it('실데이터 — 진짜 JSON 배열 노드', () => {
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

  it('작은 결과 집합은 대량 실데이터가 아니다 — 넓은 열 목록이 붙어도', () => {
    // 열이 30개여도 행은 3개다. 열 목록을 행으로 세면 데모 테이블조차 거부된다.
    expect(rejectionRules(rowDataFixture('GetTableContents', 3, 30))).toEqual([]);
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

  it('루프백·가짜 호스트의 host:port는 단일 라벨 규칙에 걸리지 않는다', () => {
    expect(rejectionRules(text('listening on localhost:44300 and sap.example.test:44300'))).toEqual([]);
  });

  it('IPv6 루프백과 시각 표기는 IPv6 전역 주소로 오해하지 않는다', () => {
    expect(rejectionRules(text('bound to ::1 at 09:15:22'))).toEqual([]);
  });

  it('`bearer`라는 낱말만으로는 토큰이 아니다', () => {
    expect(rejectionRules(text('the bearer of this note is not a token'))).toEqual([]);
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

  it('비밀이 **키 이름** 자리일 때도 보고서에 원문이 실리지 않는다', () => {
    const violations = scanForSecrets({ 'sapdev01.acme.internal': { status: 'up' } }, '/steps/0/response');
    expect(violations.length).toBeGreaterThan(0);
    expect(JSON.stringify(violations)).not.toContain('sapdev01');
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
