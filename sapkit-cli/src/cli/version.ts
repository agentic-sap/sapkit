// 판 번호 한 곳. `sapkit --version`이 내는 값이고, 공개 배럴이 그대로 재수출한다.
// (`package.json`을 런타임에 읽지 않는다 — 번들·설치 형태에 따라 그 파일이 곁에
// 없을 수 있고, 그러면 `--version`이 조용히 깨진다.)

export const SAPKIT_CLI_VERSION = '0.1.0';
