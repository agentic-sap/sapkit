/**
 * ABAP `METHOD … ENDMETHOD` 경계 찾기 — **줄 단위 실용 스캔**이지 파서가 아니다.
 *
 * 클래스 소스 한 벌 안에서 메서드 구현 하나의 자리를 찾아, 그 덩이만 읽거나
 * (`GetClassMethod`) 그 덩이만 갈아 끼우기(`UpdateClassMethod`) 위한 것이다.
 *
 * ## 근거
 *
 * 이 로직은 벤더 패키지가 아니라 **구 엔진이 스스로 저작한 것**이다 —
 * `engine/src/lib/abapMethodBoundaries.ts:23-239`. 그리고 그 동작의 계약 정본은
 * 구 엔진 자신의 단위 시험 `engine/src/__tests__/unit/abapMethodBoundaries.test.ts`
 * 다. 여기 기대값은 전부 그 파일에서 왔다.
 *
 * ## 판정 규칙 (구와 같은 것)
 *
 *  - 줄의 첫 비공백이 `*`이면 그 줄은 통째로 주석이다.
 *  - `"`부터 줄 끝까지는 주석이다 — **단 문자열 리터럴 안이 아닐 때만**.
 *  - 문자열 리터럴은 `'`로 감싸며 `''`는 escape된 홑따옴표다. ABAP 리터럴은
 *    줄을 넘지 못하므로 줄 단위 판정이 안전하다.
 *  - `METHOD` 문은 **여는 줄만** 알아본다. AMDP의
 *    `BY DATABASE PROCEDURE … USING …` 같은 부가어는 여러 줄에 걸칠 수 있는데,
 *    그것을 해석하지 않고 그냥 `METHOD` 줄에서 시작해 다음 `ENDMETHOD.`에서
 *    끝낸다. 부가어를 파싱하려 들면 방언마다 깨진다.
 *  - 중첩된 `METHOD`는 잘못된 소스이므로(ABAP은 중첩 구현을 허용하지 않는다)
 *    던지지 않고 조용히 무시한다 — 실용 스캔의 태도다.
 *
 * ## 자리
 *
 * 읽기 쪽 내부에 두었지만 `src/tools/write/updateClassMethod.ts`도 이것을
 * 가져다 쓴다. 순수 텍스트 계산이고 접속을 모르므로 어느 성격에도 묶이지
 * 않는다 — 같은 규칙을 두 벌 저작하면 읽기와 쓰기가 서로 다른 경계를 보게
 * 되고, 그때 갈아 끼우는 자리가 어긋난다.
 */

/** 식별자 — 글자·숫자·밑줄, 첫 글자는 글자나 밑줄. */
const NAME_SEGMENT = '[A-Za-z_][A-Za-z0-9_]*';
/** 메서드 이름 — 앞의 `/NAMESPACE/`와 뒤의 `~인터페이스메서드`가 선택적이다. */
const METHOD_NAME_SOURCE = `(?:/${NAME_SEGMENT}/)?${NAME_SEGMENT}(?:~${NAME_SEGMENT})?`;
const METHOD_START_RE = new RegExp(`^METHOD\\s+(${METHOD_NAME_SOURCE})(?=[\\s.]|$)`, 'i');
const METHOD_END_RE = /^ENDMETHOD\s*\.\s*$/i;

export interface MethodBoundary {
  /** `METHOD` 문에 **선언된 그대로의** 이름 (대소문자 보존). */
  readonly name: string;
  /** `METHOD` 문의 줄번호 — 1부터, 경계에 포함된다. */
  readonly startLine: number;
  /** `ENDMETHOD` 문의 줄번호 — 1부터, 경계에 포함된다. */
  readonly endLine: number;
}

export interface MethodBlockValidation {
  readonly valid: boolean;
  /** 블록의 `METHOD` 문에서 읽어 낸 이름. 못 읽었으면 없다. */
  readonly name?: string;
  readonly error?: string;
}

/** CRLF·CR·LF 셋 다 한 줄바꿈으로 센다. */
function splitLines(source: string): string[] {
  return source.split(/\r\n|\r|\n/);
}

function isFullLineComment(line: string): boolean {
  const first = line.match(/\S/);
  return first !== null && first[0] === '*';
}

/**
 * 한 줄에서 **코드인 부분만** 남긴다. 문자열 리터럴 안은 공백으로 덮고, 인라인
 * 주석부터는 잘라 낸다. 자리(열 번호)를 지키려고 지운 만큼 공백을 채운다 —
 * 그래야 `^METHOD` 같은 앵커가 원래 위치에서 맞는다.
 */
function codeOnlyPortion(line: string): string {
  let result = '';
  let inString = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (inString) {
      if (ch === "'") {
        if (line[i + 1] === "'") {
          // escape된 홑따옴표 — 두 글자를 함께 덮는다.
          result += '  ';
          i += 1;
        } else {
          inString = false;
          result += ' ';
        }
      } else {
        result += ' ';
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      result += ' ';
      continue;
    }

    // 리터럴 밖의 `"`부터 줄 끝까지는 주석이다.
    if (ch === '"') break;

    result += ch;
  }

  return result;
}

function codeOnly(line: string): string {
  return isFullLineComment(line) ? '' : codeOnlyPortion(line);
}

/**
 * 소스 안의 모든 `METHOD…ENDMETHOD` 구현을 문서 순서로 모은다.
 * 닫히지 않은 블록은 결과에 담기지 않는다.
 */
export function listMethodImplementations(source: string): MethodBoundary[] {
  const lines = splitLines(source);
  const found: MethodBoundary[] = [];
  let open: { name: string; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const code = codeOnly(lines[i] ?? '').trim();
    if (!code) continue;

    if (open === null) {
      const start = code.match(METHOD_START_RE);
      if (start?.[1]) open = { name: start[1], startLine: i + 1 };
      continue;
    }

    if (METHOD_END_RE.test(code)) {
      found.push({ name: open.name, startLine: open.startLine, endLine: i + 1 });
      open = null;
    }
    // 열린 상태에서 만난 `METHOD` 줄은 잘못된 소스다 — 무시한다(위 머리주석).
  }

  return found;
}

/** 이름으로 구현 하나를 찾는다. 대조는 대소문자를 가리지 않는다. */
export function findMethodBoundary(source: string, methodName: string): MethodBoundary | null {
  const target = methodName.trim().toLowerCase();
  return listMethodImplementations(source).find((m) => m.name.toLowerCase() === target) ?? null;
}

/** 경계가 덮는 줄들을 그대로 잘라 낸다. 잇는 줄바꿈은 `\n`이다. */
export function extractMethodSource(source: string, boundary: MethodBoundary): string {
  return splitLines(source)
    .slice(boundary.startLine - 1, boundary.endLine)
    .join('\n');
}

/**
 * 갈아 끼울 블록 자체가 `METHOD`로 열리고 `ENDMETHOD.`로 닫히는지, 그리고
 * 선언된 이름이 기대한 이름과 같은지 본다. 앞뒤 빈 줄은 눈감아 준다.
 *
 * **이 검사가 이 도구의 안전 바닥선이다.** 이름이 어긋난 블록을 그대로 끼우면
 * 엉뚱한 메서드의 몸통이 통째로 바뀐다.
 */
export function validateMethodBlock(
  source: string,
  expectedMethodName: string,
): MethodBlockValidation {
  const lines = splitLines(source);

  let startIdx = 0;
  while (startIdx < lines.length && (lines[startIdx] ?? '').trim() === '') startIdx += 1;
  let endIdx = lines.length - 1;
  while (endIdx >= 0 && (lines[endIdx] ?? '').trim() === '') endIdx -= 1;

  if (startIdx > endIdx) return { valid: false, error: 'source is empty' };

  const startCode = codeOnly(lines[startIdx] ?? '').trim();
  const startMatch = startCode.match(METHOD_START_RE);
  if (!startMatch?.[1]) {
    return {
      valid: false,
      error: `source must start with "METHOD <name>." (found: "${(lines[startIdx] ?? '').trim()}")`,
    };
  }

  const endCode = codeOnly(lines[endIdx] ?? '').trim();
  if (!METHOD_END_RE.test(endCode)) {
    return {
      valid: false,
      error: `source must end with "ENDMETHOD." (found: "${(lines[endIdx] ?? '').trim()}")`,
    };
  }

  const name = startMatch[1];
  if (name.toLowerCase() !== expectedMethodName.trim().toLowerCase()) {
    return {
      valid: false,
      name,
      error: `method name mismatch: source declares "${name}" but method_name is "${expectedMethodName}"`,
    };
  }

  return { valid: true, name };
}

/**
 * 경계가 덮는 줄들을 대체 블록으로 갈아 끼운다. 나머지 줄은 글자 그대로
 * 보존되고, 결과는 `\n`으로 이어진다.
 */
export function spliceMethodSource(
  fullSource: string,
  boundary: MethodBoundary,
  replacement: string,
): string {
  const lines = splitLines(fullSource);
  return [
    ...lines.slice(0, boundary.startLine - 1),
    ...splitLines(replacement),
    ...lines.slice(boundary.endLine),
  ].join('\n');
}
