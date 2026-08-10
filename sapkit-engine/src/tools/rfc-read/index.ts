/**
 * ECC 우회로를 갖는 DDIC 읽기 도구 묶음의 공개 표면.
 *
 * 배선 단계(`src/tools/registry.ts`)는 여기서 두 이름만 가져간다. 몸통
 * (`./ddicRead`)은 내부 구현이며 레지스트리가 볼 필요가 없다.
 */

export { getStructure } from './getStructure';
export { getTable } from './getTable';
