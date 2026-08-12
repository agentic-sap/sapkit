/**
 * 오류 응답의 대조 규칙 (장부 D13).
 *
 * > 오류 응답은 **오류 종류(kind)와 SAP 유래 텍스트로 엄격 대조**하고, 엔진이
 * > 스스로 지어내는 **진단 산문은 비결정 토큰과 같은 취급으로 정규화**한다.
 * > **이 정규화가 적용된 건은 커버리지 표에 반드시 드러나야 한다.**
 *
 * 그래서 여기서 못박는 것은 셋이다 — 엄격한 쪽이 정말 엄격한가, 느슨한 쪽이
 * 정말 통과하는가, 그리고 **느슨하게 판정한 건이 세어지는가**.
 */
import { compareErrorSignatures, errorSignature } from '../errorSignature';
import { replaySequence } from '../replay';
import { envelope, recorded, step, target } from './helpers';

const ADT_403 =
  'ADT request failed: PUT /sap/bc/adt/oo/classes/zcl_demo — HTTP 403 Forbidden — ' +
  '[ExceptionResourceNoAccess] (lock-conflict): Object is locked by user DEVELOPER1';

/** 같은 실패를, 엔진이 다른 산문으로 말한 것. 코드·상태·SAP 텍스트는 그대로다. */
const ADT_403_NEW_PROSE =
  'ADT 요청 실패: PUT /sap/bc/adt/oo/classes/zcl_demo — HTTP 403 Forbidden — ' +
  '[ExceptionResourceNoAccess] (lock-conflict): Object is locked by user DEVELOPER1';

describe('오류 서명 뽑기', () => {
  it('오류 종류·상태·SAP 유래 텍스트를 따로 뽑는다', () => {
    const sig = errorSignature(ADT_403);

    expect(sig.codes).toContain('ExceptionResourceNoAccess');
    expect(sig.codes).toContain('lock-conflict');
    expect(sig.statuses).toEqual([403]);
  });

  it('계약성 SAP 문구는 글자 그대로 보존한다', () => {
    const sig = errorSignature('ZMCP_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): object not found');

    expect(sig.sapText).toEqual(['ZMCP_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): object not found']);
  });

  it('ADT 예외 XML의 message는 SAP 유래 텍스트다', () => {
    const sig = errorSignature('<exc:exception><message lang="EN">Object ZCL_X does not exist</message></exc:exception>');

    expect(sig.sapText).toEqual(['Object ZCL_X does not exist']);
  });

  it('엔진 계약 코드(ERR_*)를 종류로 잡는다', () => {
    expect(errorSignature('ERR_READONLY_TIER: write refused on tier QA').codes).toContain('ERR_READONLY_TIER');
  });
});

describe('오류 서명 대조', () => {
  it('엔진 진단 산문만 다르면 통과한다', () => {
    const outcome = compareErrorSignatures(errorSignature(ADT_403), errorSignature(ADT_403_NEW_PROSE));

    expect(outcome.ok).toBe(true);
    expect(outcome.proseNormalized).toBe(true);
    expect(outcome.strictSignal).toBe(true);
  });

  it('오류 종류가 다르면 실패한다', () => {
    const outcome = compareErrorSignatures(
      errorSignature(ADT_403),
      errorSignature(ADT_403.replace('lock-conflict', 'forbidden')),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('error-kind');
  });

  it('HTTP 상태가 다르면 실패한다', () => {
    const outcome = compareErrorSignatures(errorSignature(ADT_403), errorSignature(ADT_403.replace('403', '404')));

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('error-kind');
  });

  it('SAP 유래 텍스트가 다르면 실패한다', () => {
    const outcome = compareErrorSignatures(
      errorSignature('ZMCP_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): object not found'),
      errorSignature('ZMCP_ADT_DISPATCH error (action=CUA_FETCH, subrc=8): object not found'),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('error-sap-text');
  });

  it('엄격 신호가 하나도 없으면 산문 정규화로 통과시키지 않는다', () => {
    // "산문**만** 다르다"는 말은 엄격 부분이 있고 그것이 같을 때만 성립한다.
    // 아무 신호도 없는 두 문장을 같다고 하면 오류 경로 전체가 무증거가 된다.
    const outcome = compareErrorSignatures(errorSignature('something went wrong'), errorSignature('무언가 잘못됐다'));

    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toBe('error-prose');
    expect(outcome.strictSignal).toBe(false);
  });

  it('글자까지 같으면 산문 정규화로 세지 않는다', () => {
    const outcome = compareErrorSignatures(errorSignature(ADT_403), errorSignature(ADT_403));

    expect(outcome.ok).toBe(true);
    expect(outcome.proseNormalized).toBe(false);
  });
});

describe('재생 대조에 걸린 오류 규칙', () => {
  const errorStep = (text: string) => step({ index: 0, isError: true, response: envelope(text, true) });

  it('진단 산문만 다른 오류는 통과하고 산문 정규화 건으로 잡힌다', async () => {
    const fixture = recorded([errorStep(ADT_403)]);
    const result = await replaySequence(
      fixture,
      target([{ payload: envelope(ADT_403_NEW_PROSE, true), isError: true }]),
    );

    expect(result.verdict).toBe('pass');
    expect(result.steps[0]?.verdict).toBe('match');
    expect(result.proseNormalized).toHaveLength(1);
    expect(result.proseNormalized[0]).toMatchObject({ stepIndex: 0, divergenceId: 'D13', strictSignal: true });
  });

  it('오류 종류가 다르면 실패로 판정한다', async () => {
    const fixture = recorded([errorStep(ADT_403)]);
    const result = await replaySequence(
      fixture,
      target([{ payload: envelope(ADT_403.replace('lock-conflict', 'forbidden'), true), isError: true }]),
    );

    expect(result.verdict).toBe('fail');
    expect(result.steps[0]?.differences[0]?.reason).toBe('error-kind');
  });

  it('SAP 유래 텍스트가 다르면 실패로 판정한다', async () => {
    const sap = 'ZMCP_ADT_DISPATCH error (action=CUA_FETCH, subrc=4): object not found';
    const fixture = recorded([errorStep(sap)]);
    const result = await replaySequence(
      fixture,
      target([{ payload: envelope(sap.replace('subrc=4', 'subrc=8'), true), isError: true }]),
    );

    expect(result.verdict).toBe('fail');
    expect(result.steps[0]?.differences[0]?.reason).toBe('error-sap-text');
  });

  it('한쪽만 오류면 실패한다', async () => {
    const fixture = recorded([errorStep(ADT_403)]);
    const result = await replaySequence(fixture, target([{ payload: envelope('성공했다'), isError: false }]));

    expect(result.verdict).toBe('fail');
    expect(result.steps[0]?.differences[0]?.reason).toBe('error-flag');
  });

  it('오류 산문이 달라도 비밀은 보고서에 실리지 않는다', async () => {
    const fixture = recorded([errorStep('ERR_X: 실패')]);
    const result = await replaySequence(
      fixture,
      target([{ payload: envelope('ERR_Y: Basic dXNlcjpzM2NyZXRwYXNz 로 실패', true), isError: true }]),
    );

    expect(result.verdict).toBe('fail');
    expect(JSON.stringify(result.steps[0]?.differences)).not.toContain('dXNlcjpzM2NyZXRwYXNz');
  });
});

// ── D18 — 무접속 거부 어휘 (장부가 "기계가 소비한다"고 따로 둔 항목) ──────────

describe('D18 무접속 거부 어휘', () => {
  it('구 어휘 대 신 어휘는 등재 항목이 대체 기대 시험으로 판정한다', async () => {
    const fixture = recorded([
      step({
        index: 0,
        tool: 'GetClass',
        isError: true,
        response: envelope('Basic authentication requires SAP_CLIENT to be provided', true),
      }),
    ]);
    const result = await replaySequence(
      fixture,
      target([
        {
          payload: envelope('ERR_NO_CONNECTION: this tool needs a SAP connection but none is configured', true),
          isError: true,
        },
      ]),
    );

    expect(result.verdict).toBe('pass');
    expect(result.steps[0]?.verdict).toBe('allowlisted-pass');
    expect(result.steps[0]?.divergenceId).toBe('D18');
  });

  it('신 엔진이 그 자리에서 다른 말을 하면 대체 기대 시험이 실패한다', async () => {
    const fixture = recorded([
      step({
        index: 0,
        tool: 'GetClass',
        isError: true,
        response: envelope('Basic authentication requires SAP_CLIENT to be provided', true),
      }),
    ]);
    const result = await replaySequence(
      fixture,
      target([{ payload: envelope('something else entirely', true), isError: true }]),
    );

    expect(result.verdict).toBe('fail');
    expect(result.steps[0]?.verdict).toBe('allowlisted-fail');
    expect(result.steps[0]?.divergenceId).toBe('D18');
  });
});
