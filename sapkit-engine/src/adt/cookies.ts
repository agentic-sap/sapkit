/**
 * 클라이언트 인스턴스 안에서만 사는 쿠키 저장소.
 *
 * ADT 세션은 쿠키(`SAP_SESSIONID_*`, `sap-usercontext` 등)로 이어진다. 한 접속이
 * 한 SAP 오리진만 상대하므로 도메인·경로 대조는 하지 않고 `name=value`만 보관한다
 * — 속성부(Path/Domain/Expires/HttpOnly/Secure)는 버린다. 그래서 이 저장소는
 * **디스크에 남지 않고 프로세스 밖으로도 나가지 않는다**.
 */
export class CookieJar {
  private readonly jar = new Map<string, string>();

  /** 응답의 `Set-Cookie` 원문들을 받아 반영한다. 빈 값은 삭제로 본다. */
  accept(setCookie: readonly string[]): void {
    for (const raw of setCookie) {
      const pair = raw.split(';', 1)[0] ?? '';
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (name === '') continue;
      if (value === '') {
        this.jar.delete(name);
        continue;
      }
      this.jar.set(name, value);
    }
  }

  /** 요청에 실을 `Cookie` 헤더 값. 보관된 쿠키가 없으면 undefined. */
  header(): string | undefined {
    if (this.jar.size === 0) return undefined;
    return [...this.jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get(name: string): string | undefined {
    return this.jar.get(name);
  }

  names(): string[] {
    return [...this.jar.keys()];
  }

  get size(): number {
    return this.jar.size;
  }

  clear(): void {
    this.jar.clear();
  }
}
