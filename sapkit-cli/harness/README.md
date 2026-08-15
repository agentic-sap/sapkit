# harness — 채록과 대조 도구

제품 코드(`src/`)가 아니라, **판정을 붙잡아 두기 위한 도구**가 사는 자리다.

- **채록기** `record-baseline.mjs` — 구 vsp를 돌려 코퍼스의 세 표면(lint · analyze ·
  parse) 판정을 떠서 `fixtures/baseline/`에 고정한다. 구 vsp가 은퇴하면 이 기준 파일이
  구 판정의 유일한 잔존 형태가 된다.
- **판정기** `judge-current.mjs` — 채록기의 짝. **새 CLI**를 몰아 같은 형태의 판정을
  낸다. 파일 목록을 인자로 받으므로 코퍼스에도, 커밋하지 않는 외부 표본에도 쓴다.
  `dist/`가 없거나 소스보다 낡았으면 먼저 세운다(낡은 산출물을 대조하면 거짓 통과가 된다).
- **비교기** `compare-baseline.mjs` — 두 판정 집합을 맞대고 갈림 목록을 낸다.
  `gates/`의 코퍼스 대조 게이트가 이것을 쓴다. 모듈로 `compareSurface`·`compareAny`를
  내보낸다. exit 0 = 갈림 없음 · 1 = 갈림 있음 · 2 = 사용 오류.
- **커버리지 검사** `check-baseline-coverage.mjs` — 기준이 코퍼스 전 파일 × 세 표면을
  빠짐없이 담는지, 손으로 고쳐지지 않았는지 확인한다.
- **음성시험** `test-compare-baseline.mjs` — 비교기가 정말 갈림을 잡는지 일부러 어긋난
  입력으로 확인한다(통과만 보면 늘 "같다"고 답하는 비교기를 못 걸러낸다).
- **음성시험** `test-corpus-gate.mjs` — 코퍼스 대조 게이트(`gates/corpus-baseline.mjs`)의
  짝. 코퍼스 내용·구성·EOL을 어긋뜨리고 소스를 잠시 고쳐, 게이트가 비-0을 내는지 본다.
  **게이트를 고치면 이것도 함께 돌려라** — 둘이 짝이라야 게이트가 장식이 아님이 선다.
- **실측 반영** `derive-measured-hits.mjs` — 기준에서 실측 적중 수를 뽑아 코퍼스 대장의
  `measured_hits`에 되쓴다. 대장의 `predicted_hits`(예측)는 덮지 않는다.
- `corpus.mjs` — 위 전부가 같은 파일 목록·같은 키를 쓰게 하는 공용 열거.

**채록 절차의 정본은 [`RECORDING.md`](RECORDING.md)** — 표면별 채록 방법, parse용 일회용
Go 셈을 다시 뜨는 법, 정규화에서 무엇을 뺐는지, 구 vsp에서 관찰된 이상 동작,
그리고 **커밋하지 않는 표본으로 한 번 더 맞댄 광역 대조의 실측(§9)**이 거기 있다.
정규화 규칙의 원 근거는 `.dryforge/spec.md` §3.
