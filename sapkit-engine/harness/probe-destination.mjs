/**
 * destination 그랜트 프로브 — **attended 전용 · 게이트가 아니다.**
 *
 * ⚠ **이 파일을 게이트 목록에 넣지 말 것.** 실 UAA와 실 SAP로 나간다
 * (`harness/record-attended.mjs`와 같은 지위다). CI에서 돌리지 않는다.
 *
 * 재는 것은 하나 — **어느 그랜트의 토큰이 이 시스템의 ADT를 여는가.**
 * 판M2-b(D-115)가 이 물음에 답했고, 그 답이 판M2-c의 착수 근거다. 그때의 측정을
 * 다시 뜰 수 있게 이 도구를 남긴다(리뷰 권고 9 — 그 판의 산출물은 측정인데
 * 기계 흔적이 하나도 없었다).
 *
 * ## 정책 등급
 *
 * **P1 connected-read만** 한다. ADT 메타데이터 경로만 GET하고 **행 데이터를
 * 끌어오지 않으며**(P2 없음) 아무것도 쓰지 않는다(P3·P4 없음). 그러므로
 * `GetTableContents`/`GetSqlQuery` 계열의 건별 승인 대상이 아니다.
 *
 * ## 비밀 취급
 *
 * service key는 **레포 밖**에서 읽고(기본 `~/.sapkit/<name>.json`), clientid ·
 * clientsecret · access token · refresh token은 **어느 것도 출력하지 않는다.**
 * 출력하는 것은 상태 코드 · 응답 헤더 중 인증 판정에 쓰이는 것 · JWT 클레임의
 * **유무**뿐이다.
 *
 * ## 쓰는 법
 *
 *   node harness/probe-destination.mjs --key=~/.sapkit/default_key.json
 *   node harness/probe-destination.mjs --key=<파일> --grant=client_credentials
 *   node harness/probe-destination.mjs --key=<파일> --grant=authorization_code --port=8080
 *
 * `--grant`를 생략하면 **`client_credentials`만** 잰다(사람 손이 필요 없는 쪽).
 * `authorization_code`는 브라우저 로그인 1회가 필요하고, **콜백 주소가
 * XSUAA 화이트리스트에 등록돼 있어야 한다** — 판M2-b 실측에서
 * `http://localhost:8080/callback`은 받았고 `:8123`은 콜백이 오지 않았다.
 * `--host`의 기본값이 `localhost`인 이유가 그것이다(엔진의
 * `DEFAULT_CALLBACK_HOST`는 `127.0.0.1`이라 다르다 — 문자열이 다르면 XSUAA가
 * 거부한다).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as https from 'node:https';
import * as http from 'node:http';
import * as crypto from 'node:crypto';

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};

const keyArg = arg('key');
if (keyArg === null) {
  console.error(
    '사용: node harness/probe-destination.mjs --key=<service key 파일> ' +
      '[--grant=client_credentials|authorization_code] [--host=localhost] [--port=8080]',
  );
  process.exit(2);
}
const keyPath = keyArg.startsWith('~') ? path.join(os.homedir(), keyArg.slice(1)) : keyArg;
const grant = arg('grant', 'client_credentials');
const host = arg('host', 'localhost');
const port = Number(arg('port', '8080'));

if (grant !== 'client_credentials' && grant !== 'authorization_code') {
  console.error(`[probe] 모르는 그랜트: ${grant}`);
  process.exit(2);
}

const raw = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const key = Object.keys(raw).length === 1 && raw.credentials ? raw.credentials : raw;
const uaa = key.uaa ?? key;
const baseUrl = key.url ?? key.endpoints?.abap ?? null;
if (!uaa?.url || !uaa?.clientid || !uaa?.clientsecret) {
  console.error(`[probe] ${keyPath}에 uaa url/clientid/clientsecret이 없다.`);
  process.exit(2);
}
if (baseUrl === null) {
  console.error(`[probe] ${keyPath}에 ABAP service URL이 없다.`);
  process.exit(2);
}

/** ADT 메타데이터 경로만 — 행 데이터 경로는 여기 넣지 말 것(P2가 된다). */
const ADT_PATHS = [
  '/sap/bc/adt/discovery',
  '/sap/bc/adt/core/http/systeminformation',
  '/sap/bc/adt/repository/informationsystem/objecttypes',
  '/sap/bc/adt/compatibility/graph',
];

const request = (url, options, body) =>
  new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('timeout 30s')));
    if (body !== undefined) req.write(body);
    req.end();
  });

const basic = Buffer.from(`${uaa.clientid}:${uaa.clientsecret}`).toString('base64');
const tokenHeaders = {
  Authorization: `Basic ${basic}`,
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json',
};

/** 브라우저 로그인 1회. code가 돌아올 자리를 열고 기다린다. */
async function authorizationCode() {
  const state = crypto.randomBytes(8).toString('hex');
  const redirect = `http://${host}:${port}/callback`;
  const authUrl =
    `${uaa.url}/oauth/authorize?` +
    new URLSearchParams({ response_type: 'code', client_id: uaa.clientid, redirect_uri: redirect });

  console.log('\n=== 브라우저에서 아래 주소를 열고 로그인하세요 (10분 대기) ===');
  console.log(authUrl);
  console.log(`\n콜백: ${redirect}`);
  console.log('⚠ 이 주소가 XSUAA 화이트리스트에 없으면 콜백이 오지 않는다 — --host/--port로 맞춘다.\n');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((rq, rs) => {
      const url = new URL(rq.url, `http://${host}:${port}`);
      if (url.pathname !== '/callback') return void rs.writeHead(404).end('no');
      const got = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      rs.end(`<html><body><h2>${got ? '받았습니다 — 창을 닫으셔도 됩니다.' : `실패: ${err ?? 'code 없음'}`}</h2></body></html>`);
      server.close();
      if (got) resolve(got);
      else reject(new Error(err ?? 'code 없음'));
    });
    server.on('error', reject);
    server.listen(port, host);
    setTimeout(() => {
      server.close();
      reject(new Error('10분 안에 콜백이 오지 않았다 — 화이트리스트에 이 주소가 없을 수 있다'));
    }, 600000);
  });

  return request(
    `${uaa.url}/oauth/token`,
    { method: 'POST', headers: tokenHeaders },
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect }).toString(),
  );
}

const clientCredentials = () =>
  request(`${uaa.url}/oauth/token`, { method: 'POST', headers: tokenHeaders }, 'grant_type=client_credentials');

console.log(`[probe] key      : ${keyPath}`);
console.log(`[probe] system   : ${key.systemid ?? '(없음)'} · ${baseUrl}`);
console.log(`[probe] grant    : ${grant}`);

const res = grant === 'authorization_code' ? await authorizationCode() : await clientCredentials();
console.log(`\n[1] 토큰 종단점 status=${res.status}`);
if (res.status !== 200) {
  // 본문에는 error/error_description만 오고 비밀은 없다. 그래도 잘라서 낸다.
  console.log(`    body=${res.body.slice(0, 200)}`);
  process.exit(1);
}

const parsed = JSON.parse(res.body);
const token = parsed.access_token;
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
console.log(`    grant_type   =${claims.grant_type ?? '(없음)'}`);
console.log(`    user_name    =${claims.user_name ? '(있음 — 사용자 신원 실림)' : '(없음 — 신원 없는 토큰)'}`);
console.log(`    scope 수     =${Array.isArray(claims.scope) ? claims.scope.length : 0}`);
console.log(`    refresh_token=${parsed.refresh_token ? '(발급됨)' : '(없음)'}`);

console.log(`\n[2] ADT 메타데이터 경로 (Bearer)`);
let ok = 0;
for (const p of ADT_PATHS) {
  try {
    const r = await request(`${baseUrl}${p}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml, */*' },
    });
    if (r.status === 200) ok += 1;
    console.log(`    ${p}`);
    console.log(
      `      status=${r.status} · sap-authenticated=${r.headers['sap-authenticated'] ?? '(없음)'}` +
        `${r.headers['www-authenticate'] ? ` · www-authenticate=${r.headers['www-authenticate']}` : ''}`,
    );
    console.log(`      body[0:160]=${r.body.replace(/\s+/g, ' ').slice(0, 160)}`);
  } catch (e) {
    console.log(`    ${p}\n      ERROR ${e.message}`);
  }
}

console.log(`\n[probe] ADT 200: ${ok}/${ADT_PATHS.length}`);
console.log(
  ok === 0
    ? '[probe] 이 그랜트로는 ADT가 열리지 않는다 — 토큰이 유효해도 시스템이 매핑하지 못한다.'
    : ok === ADT_PATHS.length
      ? '[probe] 이 그랜트가 ADT를 연다.'
      : '[probe] 일부만 열린다 — 경로별 권한을 볼 자리다.',
);
