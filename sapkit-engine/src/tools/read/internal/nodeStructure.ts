/**
 * 리포지터리 노드 구조 조회 — ADT 트리 한 마디를 받아 오는 **유일한 와이어 자리**.
 *
 * 구 엔진에서 이 요청을 조립하던 곳은 겉 핸들러가 아니라 벤더 패키지다.
 * 겉만 읽으면 주소도 본문도 헤더도 알 수 없다 — 읽은 자취를 남긴다:
 *
 *  - 겉: `engine/src/handlers/search/readonly/handleGetObjectsByType.ts:162-171`
 *        (`createAdtClient(...).getUtils().fetchNodeStructure(...)`)
 *  - 한 다리: `engine/node_modules/@babamba2/mcp-abap-adt-clients/dist/core/shared/AdtUtils.js:435-436`
 *  - 와이어 정본: 같은 패키지 `dist/core/shared/nodeStructure.js:29-56`
 *
 * 거기서 확인한 것 넷:
 *  1. **POST**다(읽기인데 POST — 본문에 노드 키를 싣는다).
 *  2. 질의 인자는 `parent_type` · `parent_name` · `parent_tech_name` ·
 *     `withShortDescriptions` 순으로 실리고, `node_id`는 **주어졌을 때만** 뒤에
 *     붙는다.
 *  3. **`parent_tech_name`에는 `parentName`이 그대로 들어간다.** 호출자가 따로
 *     준 기술명은 이 자리에 오지 않는다 — `GetObjectsByType`이 그 인자를 필수로
 *     받으면서도 와이어에 싣지 않는 이유가 여기 있다.
 *  4. 본문의 `TV_NODEKEY`는 `nodeId ?? '000000'`이고, Accept·Content-Type은
 *     아래 상수 그대로다.
 */

import type { AdtClient, AdtResponse } from '../../../adt';

export const NODE_STRUCTURE_PATH = '/sap/bc/adt/repository/nodestructure';

/** 벤더가 싣던 Accept 한 줄. 세 값의 순서·공백까지 그대로다. */
export const NODE_STRUCTURE_ACCEPT =
  'application/vnd.sap.as+xml;dataname=com.sap.adt.RepositoryObjectTreeContent, ' +
  'application/vnd.sap.adt.repository.nodestructure.v1+xml, application/xml';

export const NODE_STRUCTURE_CONTENT_TYPE =
  'application/vnd.sap.as+xml; charset=UTF-8; dataname=null';

/** `node_id`가 없을 때 본문에 실리는 노드 키. */
export const ROOT_NODE_KEY = '000000';

/** 본문은 노드 키 하나만 담은 asx 문서다. */
export function nodeStructureBody(nodeKey: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0">' +
    `<asx:values><DATA><TV_NODEKEY>${nodeKey}</TV_NODEKEY></DATA></asx:values>` +
    '</asx:abap>'
  );
}

export interface NodeStructureRequest {
  /** `CLAS/OC` · `PROG/P` · `DEVC/K` 류. */
  readonly parentType: string;
  readonly parentName: string;
  /** 없으면 루트 마디를 받는다(`node_id` 인자 자체가 붙지 않는다). */
  readonly nodeId?: string;
  /** 벤더 기본값은 참이다. 호출자가 정한다. */
  readonly withShortDescriptions?: boolean;
}

export async function fetchNodeStructure(
  client: AdtClient,
  { parentType, parentName, nodeId, withShortDescriptions = true }: NodeStructureRequest,
): Promise<AdtResponse> {
  return client.request({
    method: 'POST',
    path: NODE_STRUCTURE_PATH,
    params: {
      parent_type: parentType,
      parent_name: parentName,
      // 기술명 자리에도 이름이 들어간다 — 벤더 실측(nodeStructure.js:34).
      parent_tech_name: parentName,
      withShortDescriptions,
      ...(nodeId ? { node_id: nodeId } : {}),
    },
    body: nodeStructureBody(nodeId || ROOT_NODE_KEY),
    accept: NODE_STRUCTURE_ACCEPT,
    contentType: NODE_STRUCTURE_CONTENT_TYPE,
    timeout: 'default',
  });
}
