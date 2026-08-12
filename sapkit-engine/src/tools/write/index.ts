/**
 * 쓰기·활성 도구 7종의 공개 표면.
 *
 * 배선 단계(`src/tools/registry.ts`)는 여기서만 가져다 쓴다 — 개별 모듈 경로를
 * 직접 참조하지 않는다. 이 묶음은 전부 `kind: 'mutation'`이며, tier 게이트가 그
 * 축으로 판단한다(DEV 외 등급에서 접속 전에 막힌다).
 */

export { activateObjects } from './activateObjects';
export { createInclude } from './createInclude';
export { createProgram } from './createProgram';
export { updateClass } from './updateClass';
export { updateInclude } from './updateInclude';
export { updateProgram } from './updateProgram';
export { updateSourceByPatch } from './updateSourceByPatch';
