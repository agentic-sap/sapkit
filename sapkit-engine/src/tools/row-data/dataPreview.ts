/**
 * ADT Data Preview 응답(XML) → 도구가 돌려주는 표.
 *
 * 응답 형태는 **구 엔진 계약 그대로**다. 구는 행 데이터를 배열 노드가 아니라
 * text 콘텐츠 안의 pretty-print JSON으로 돌려주고, 그 JSON의 키 집합과 순서가
 * 곧 계약이다(`harness/DIVERGENCES.md`의 마스킹 항목이 이 사실에 기대고 있다).
 * 그래서 여기서 만드는 객체는 키 순서까지 구와 같다.
 *
 * 표를 읽을 때 반드시 지켜야 하는 세 가지:
 *
 * 1. **self-closing 셀은 그 자리의 null이다.** `<dataPreview:data/>`는 nil(NULL)
 *    이고, 닫는 태그를 요구하는 방식으로 훑으면 이 셀을 건너뛴 뒤 다음 셀의 닫는
 *    태그까지 삼켜 **그 열의 이후 행이 전부 한 칸씩 밀린다**. 셀 자리를 세는 것이
 *    이 함수의 본업이다.
 * 2. **빈 값과 공백 한 칸은 다르다.** `<data></data>`는 null, `<data> </data>`는
 *    실제 값 `" "`다.
 * 3. **열 길이가 어긋나면 숨기지 않는다.** 정렬할 수 없는 응답을 조용히 맞춰
 *    놓으면 밀린 표가 정상으로 보인다 — `ragged_columns`로 드러낸다.
 *
 * 값은 XML 원문 그대로 싣는다. 엔티티를 풀지 않는 것도 구 동작이다.
 */

import type { ToolLogger } from '../../server/toolDefinition';

export interface DataPreviewColumn {
  name: string;
  type: string;
  description?: string;
  length?: number;
}

/** 도구가 text 콘텐츠에 싣는 payload — 키 순서가 계약이다. */
export interface SqlQueryResponse {
  sql_query: string;
  row_number: number;
  execution_time?: number;
  total_rows?: number;
  /** 실제로 파싱된 행 수. */
  returned_row_count?: number;
  /** 행 상한에 닿았거나 서버 총계가 반환 행보다 클 때 참. */
  truncated?: boolean;
  /** XML이 총계를 알려줬을 때만 실린다. */
  server_total_rows?: number;
  /** 열 길이가 어긋났을 때의 진단(`이름:길이` 나열). */
  ragged_columns?: string;
  columns: DataPreviewColumn[];
  rows: Array<Record<string, string | null>>;
  error?: string;
}

const TOTAL_ROWS = /<dataPreview:totalRows>([\d]+)<\/dataPreview:totalRows>/;
const EXECUTION_TIME = /<dataPreview:queryExecutionTime>([\d.]+)<\/dataPreview:queryExecutionTime>/;
const METADATA_TAG = /<dataPreview:metadata\b[^>]*>/g;
const COLUMN_BLOCK = /<dataPreview:columns\b[^>]*>([\s\S]*?)<\/dataPreview:columns>/g;
/**
 * 셀의 여는 태그. 두 번째 그룹이 `/`면 self-closing, 즉 nil이다.
 * 커서를 직접 옮겨야 해서 매번 새 인스턴스를 만든다 — `lastIndex`는 상태다.
 */
const CELL_OPEN_SOURCE = '<dataPreview:data(\\s[^>]*?)?(\\/)?>';
const CELL_CLOSE = '</dataPreview:data>';

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`dataPreview:${name}="([^"]*)"`).exec(tag);
  return match?.[1];
}

function readColumns(xml: string): DataPreviewColumn[] {
  const columns: DataPreviewColumn[] = [];
  for (const match of xml.matchAll(METADATA_TAG)) {
    const tag = match[0];
    const name = attribute(tag, 'name');
    // 이름 없는 metadata는 열이 아니다 — 세지 않는다.
    if (!name) continue;
    const length = attribute(tag, 'length');
    columns.push({
      name,
      type: attribute(tag, 'type') ?? 'UNKNOWN',
      description: attribute(tag, 'description') ?? '',
      length: length === undefined ? undefined : Number.parseInt(length, 10),
    });
  }
  return columns;
}

/**
 * 블록 하나가 담은 셀들을 **자리를 세면서** 읽는다.
 *
 * self-closing이면 그 자리에 null을 놓고 바로 다음 셀로 간다. 그렇지 않으면 닫는
 * 태그를 찾아 그 사이를 값으로 삼고, 커서를 닫는 태그 뒤로 옮겨 다음 셀이 이
 * 값을 다시 삼키지 못하게 한다.
 */
function readCells(block: string): Array<string | null> {
  const cells: Array<string | null> = [];
  const scanner = new RegExp(CELL_OPEN_SOURCE, 'g');
  let match: RegExpExecArray | null = scanner.exec(block);
  while (match !== null) {
    if (match[2] === '/') {
      cells.push(null);
    } else {
      const close = block.indexOf(CELL_CLOSE, scanner.lastIndex);
      if (close === -1) {
        // 닫히지 않은 셀. 자리는 세되 값은 없다.
        cells.push(null);
        break;
      }
      const value = block.slice(scanner.lastIndex, close);
      cells.push(value === '' ? null : value);
      scanner.lastIndex = close + CELL_CLOSE.length;
    }
    match = scanner.exec(block);
  }
  return cells;
}

export function parseDataPreviewXml(
  xml: string,
  sqlQuery: string,
  rowNumber: number,
  logger?: ToolLogger,
): SqlQueryResponse {
  try {
    const totalRowsMatch = TOTAL_ROWS.exec(xml);
    const totalRows = totalRowsMatch?.[1] ? Number.parseInt(totalRowsMatch[1], 10) : 0;
    const executionMatch = EXECUTION_TIME.exec(xml);
    const executionTime = executionMatch?.[1] ? Number.parseFloat(executionMatch[1]) : 0;

    const columns = readColumns(xml);

    // 열 이름 → 그 열의 셀들. 블록 순서와 metadata 순서는 같은 열을 가리킨다.
    const byColumn = new Map<string, Array<string | null>>();
    let blockIndex = 0;
    for (const block of xml.matchAll(COLUMN_BLOCK)) {
      const column = columns[blockIndex];
      blockIndex += 1;
      if (!column) continue;
      byColumn.set(column.name, readCells(block[1] ?? ''));
    }

    const lengths = [...byColumn.values()].map((cells) => cells.length);
    const rowCount = lengths.reduce((most, length) => (length > most ? length : most), 0);
    const ragged = lengths.some((length) => length !== rowCount);
    const raggedColumns = ragged
      ? [...byColumn.entries()].map(([name, cells]) => `${name}:${cells.length}`).join(' ')
      : undefined;
    if (raggedColumns) {
      logger?.error(`parseDataPreviewXml: 열 길이가 어긋나 행이 정렬되지 않는다 (${raggedColumns})`);
    }

    const rows: Array<Record<string, string | null>> = [];
    for (let index = 0; index < rowCount; index += 1) {
      const row: Record<string, string | null> = {};
      for (const column of columns) {
        row[column.name] = byColumn.get(column.name)?.[index] ?? null;
      }
      rows.push(row);
    }

    const serverTotalRows = totalRowsMatch ? totalRows : undefined;
    return {
      sql_query: sqlQuery,
      row_number: rowNumber,
      execution_time: executionTime,
      total_rows: totalRows,
      returned_row_count: rows.length,
      truncated:
        rows.length >= rowNumber ||
        (serverTotalRows !== undefined && serverTotalRows > rows.length),
      server_total_rows: serverTotalRows,
      ragged_columns: raggedColumns,
      columns,
      rows,
    };
  } catch (error) {
    logger?.error(`parseDataPreviewXml: 응답을 해석하지 못했다 — ${String(error)}`);
    return {
      sql_query: sqlQuery,
      row_number: rowNumber,
      columns: [],
      rows: [],
      error: 'Failed to parse XML response',
    };
  }
}
