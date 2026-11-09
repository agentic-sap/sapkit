<#
L-75-review-runner.ps1 — 판L T7 · E-3 실행: 같은 코드 10개를 §8 두 조건의 리뷰어에게 보인다 (2026-11-09)

무엇을 하는가
  판K 코드 답 10개(모델 2 × 과제 5)를 claude-opus-5-5 헤드리스 리뷰어에게 한 답 한 세션으로 보이고 응답 원문을 받는다.
  조건 둘 — original(변경 전 §8 문안 + 원본 규약 5파일 사본 · --tools "Read") / note(변경 후 §8 문안 · 파일 없음 · --tools "").
  채점하지 않는다(매칭은 다른 태스크).

입력 (전부 레포 안 · 읽기만)
  코드      ../2026-11-08-harness-on-comparison-data/K-60-code/<model>/C-0n.abap  — 줄 번호를 붙여(1부터, 파일 줄 그대로) 준다
  검사기    ../2026-11-08-harness-on-comparison-data/K-60-checker/<model>/C-0n.txt — 파일 원문 그대로(줄 끝만 LF 로)
  과제 본문 ../2026-11-05-harness-necessity-review-data/11-code-tasks.txt 의 C-0n task_text + required_output
            — 판K K-00-recipe.txt §1 「프롬프트 = 고정 줄 + 빈 줄 + task_text + 빈 줄 + "Required output: " + required_output」
              가운데 응시자에게 준 과제 부분(task_text 이하)을 같은 조립 꼴로 쓴다. 고정 줄(응시 방법 지시)과
              general_rules(채점 규칙)는 넣지 않는다. 추출은 판J 60-run-code.ps1 Get-Tasks 와 같은 규칙
              (4칸 들여쓰기만 떼고 줄 구조는 그대로 · general_rules 줄에서 끊는다).
  §8 원본  ./L-30-old-section8.txt — 머리 출처 줄(1행)을 뺀 나머지(끝 빈 줄 제거)
  §8 쪽지  ../../../../interactive/core/procedures/review-checklist.md — "## §8 — " 줄부터 다음 "## " 줄 직전까지(끝 빈 줄 제거)
  규약 5파일 ../../../../interactive/core/knowledge/abap/conventions/{clean-code, clean-code-oop, clean-code-procedural,
            function-module-rule, abap-release-reference}.md — original 작업 폴더로 복사(바이트 그대로)

패러다임 · 릴리스 한 줄 (두 조건 같은 문장 · 과제 본문에서 읽어 정한 근거)
  C-01 Procedural · 7.58 — "Write an executable ABAP report" · 클래스 요구 없음(SELECT-OPTIONS/PARAMETER 리포트) · 릴리스 언급 없음
  C-02 OOP        · 7.58 — "Write a global class ZCL_JUDGE_C02_DISCOUNT" + 로컬 테스트 클래스 · 릴리스 언급 없음
  C-03 Procedural · 7.58 — "Write a function module" — 함수 모듈은 clean-code-procedural.md 갈래(판J 11 C-03 규칙 3 이 그 파일을 인용) · 릴리스 언급 없음
  C-04 Procedural · 7.58 — "Write an executable report" · 클래스 요구 없음 · 릴리스 언급 없음
  C-05 Procedural · 7.02 — "Write an executable report" · "The target system runs ABAP 7.02 (SAP NetWeaver 7.0 EHP2)"
  릴리스 언급이 없는 C-01~C-04 는 응시자가 릴리스 제약을 받지 않았다 → 「제약 없음」을 현행 온프레미스 최신 띠 7.58
  (ABAP Platform 2023)로 적는다(spec E-3 의 예시 값과 같다). 쪽지 문안은 ABAP_RELEASE 가 비어 있으면 「멈추고 물어라」를
  적고 있으므로 비워 두지 않고 값을 준다. (참고 · 판정 근거 아님: 판K 답 10개의 실제 형태도 C-02 만 CLASS · 나머지는 FORM/FUNCTION 이다.)

헤드리스 호출 (판J 60-run-code.ps1 Invoke-ClaudeCall 그대로 · --tools 와 cwd 만 조건별)
  $env:CLAUDECODE = $null
  claude -p $prompt --model claude-opus-5-5 --tools <"Read" | ""> --setting-sources "" --strict-mcp-config
         --mcp-config <panL-review>\empty-mcp.json --disable-slash-commands --output-format stream-json --verbose --no-session-persistence
  cwd: original = <panL-review>\original\procedures   (옛 문안의 ../knowledge/abap/conventions/<파일> 이 풀린다)
       + 본 측정(main)의 original 에만 --add-dir "<panL-review>\original" (--tools "Read" 바로 뒤)
         — 시험(trial)에서 cwd 밖 형제 폴더의 Read 가 권한 거부(permission_denials 2)로 막혀 원본 조건이 파일을 못 열었다.
           메인 판정(2026-11-09 · 안 (a)): 원본 조건 파일 접근을 가능하게 하는 수단으로 add-dir 를 더한다 · 접근은 작업 폴더 안에 갇힌다.
           시험 두 번(trial = spec 글자 그대로 · trial-adddir = add-dir 추가)은 「시험」으로 남긴다.
         템플릿 2파일(옛 문안이 링크하는 templates/…)은 넣지 않는다(spec = 규약 5파일 · 쪽지 조건도 못 읽음 — 대칭) · 그 Read 실패는 폴더 안이면 유효.
       note     = <panL-review>\note                  (빈 폴더)
  empty-mcp.json 은 두 작업 폴더 밖 형제 자리(<panL-review>\empty-mcp.json) — note 폴더를 빈 채로 두기 위해(판K D-160 ⓪ 과 같은 배치).

작업 폴더(레포 밖 스크래치) = $Scratch\panL-review\
  original\procedures\ (빈 폴더) · original\knowledge\abap\conventions\ (5파일) · note\ (빈 폴더) · empty-mcp.json
  raw\<trial|main>\<cond>\<model>-C-0n.a<k>.jsonl / .stderr.txt — stream JSON 원본(작업 경로 · 홈 경로 · 세션 ID 가 실린다 · 커밋 0)
  state\<trial|main>-<cond>-<model>-C-0n.json — 세션 기록(렌더 원천 · 로그는 여기서 다시 그린다)

무효 규칙 (spec E-3 5)
  note     : tool_use 1개 이상 → 무효(재실행)
  original : tool_use 이름이 Read 밖 · 또는 Read 경로(file_path)가 original 작업 폴더 밖 → 무효(재실행) · 파일을 하나도 안 열어도 유효
  전이(한도 · exit≠0 · result 없음 · is_error · 빈 응답 · 관측 모델 ≠ 요청 모델) → 기다렸다 재시도(무효와 따로 센다)

산출 (자료 폴더 · L-75* 만)
  L-75-reviews/<original|note>/<model>-C-0n.txt — 본 측정 응답 원문(result 문자열 그대로 · 편집 0)
  L-75-reviews-trial/<cond>/<model>-C-0n.txt     — 시험 실행 응답 원문(기록용 「시험」)
  L-75-prompts/  — 조건별 프롬프트 원문 1개씩 + diff 요약(20 프롬프트 전부 대조)
  L-75-run-log.txt — 세션마다 모델 id(이벤트 실측) · 시각 · 종료 코드 · 토큰 · 도구 호출(작업 폴더 상대 경로) · 무효 여부

사용 (PowerShell · 레포 루트 어디서든)
  pwsh -File L-75-review-runner.ps1 -Scratch <scratchpad> -Phase setup     # 작업 폴더 구성 · 무결성
  pwsh -File L-75-review-runner.ps1 -Scratch <scratchpad> -Phase prompts   # 프롬프트 20개 조립 · L-75-prompts 쓰기 · 길이 보고
  pwsh -File L-75-review-runner.ps1 -Scratch <scratchpad> -Phase trial     # 조건마다 1세션(claude-opus-5-5 C-01) · 시험
  pwsh -File L-75-review-runner.ps1 -Scratch <scratchpad> -Phase main      # 20세션 본 측정(이미 유효 기록이 있는 세션은 건너뛴다 — 재개 가능)
  pwsh -File L-75-review-runner.ps1 -Scratch <scratchpad> -Phase log       # state\ 에서 L-75-run-log.txt 를 다시 그린다
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('setup', 'prompts', 'trial', 'trial-adddir', 'main', 'log')][string]$Phase,
  [Parameter(Mandatory = $true)][string]$Scratch   # 세션 스크래치패드 폴더(레포 밖) — 경로에 홈 · 세션 ID 가 들어 있어 이 파일에 적지 않고 인자로 받는다
)
$ErrorActionPreference = 'Stop'
$Utf8 = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8
[Console]::InputEncoding = $Utf8
$OutputEncoding = $Utf8

$Data = $PSScriptRoot
$Repo = (Resolve-Path (Join-Path $Data '..\..\..\..')).Path
$KDir = Join-Path $Data '..\2026-11-08-harness-on-comparison-data'
$JDir = Join-Path $Data '..\2026-11-05-harness-necessity-review-data'
$Work = Join-Path $Scratch 'panL-review'
$OrigDir = Join-Path $Work 'original'
$OrigCwd = Join-Path $OrigDir 'procedures'
$ConvDir = Join-Path $OrigDir 'knowledge\abap\conventions'
$NoteDir = Join-Path $Work 'note'
$Mcp = Join-Path $Work 'empty-mcp.json'
$RawRoot = Join-Path $Work 'raw'
$StateDir = Join-Path $Work 'state'
$Model = 'claude-opus-5-5'
$AnswerModels = @('claude-opus-5-5', 'claude-sonnet-5-5')
$TaskIds = @('C-01', 'C-02', 'C-03', 'C-04', 'C-05')
$ConvFiles = @('clean-code.md', 'clean-code-oop.md', 'clean-code-procedural.md', 'function-module-rule.md', 'abap-release-reference.md')
$Conds = @('original', 'note')
$MaxInvalid = 3
$MaxTransient = 8
$Backoff = @(60, 120, 240, 480, 900, 900, 900, 900)
$Paradigm = @{
  'C-01' = 'Paradigm: Procedural · ABAP release: 7.58'
  'C-02' = 'Paradigm: OOP · ABAP release: 7.58'
  'C-03' = 'Paradigm: Procedural · ABAP release: 7.58'
  'C-04' = 'Paradigm: Procedural · ABAP release: 7.58'
  'C-05' = 'Paradigm: Procedural · ABAP release: 7.02'
}
$Instruction = '§8 기준으로 이 코드의 어긋남을 모두 적어라 — 한 줄에 하나, 형식 `규칙 | 위치(줄 번호) | 내용`'

function Ensure-Dir([string]$p) { if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null } }
function Write-Utf8([string]$path, [string]$text) { Ensure-Dir (Split-Path $path -Parent); [IO.File]::WriteAllText($path, $text, $Utf8) }
function Read-Lf([string]$path) { return ([IO.File]::ReadAllText($path, $Utf8) -replace "`r`n", "`n") }
function Sha256Text([string]$t) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData($Utf8.GetBytes($t))) -replace '-', '').ToLower() }
function Sha256File([string]$p) { (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLower() }
function TrimEndBlank([string[]]$lines) { $n = $lines.Count; while ($n -gt 0 -and [string]::IsNullOrWhiteSpace($lines[$n - 1])) { $n-- }; return @($lines[0..($n - 1)]) }
function Now { (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') }
function Say([string]$s) { Write-Host "[$(Now)] $s" }
function Redact([string]$s) {
  if ($null -eq $s) { return '' }
  $r = $s.Replace($Work, '<work>').Replace($Scratch, '<scratch>').Replace($HOME, '<home>')
  $r = $r -replace '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', '<uuid>'
  return ($r -replace 'https?://[^\s)\]>"'']+', '<url>')
}

# ---------- 입력 조립 ----------
function Get-Section8Old {
  $lines = (Read-Lf (Join-Path $Data 'L-30-old-section8.txt')) -split "`n"
  if ($lines[0] -notmatch '^출처: ') { throw 'L-30 first line is not the source line' }
  return ((TrimEndBlank $lines[1..($lines.Count - 1)]) -join "`n")
}
function Get-Section8New {
  $lines = (Read-Lf (Join-Path $Repo 'interactive\core\procedures\review-checklist.md')) -split "`n"
  $s = -1; $e = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($s -lt 0 -and $lines[$i] -like '## §8 — *') { $s = $i; continue }
    if ($s -ge 0 -and $lines[$i] -like '## *') { $e = $i; break }
  }
  if ($s -lt 0 -or $e -lt 0) { throw '§8 bounds not found' }
  return ((TrimEndBlank $lines[$s..($e - 1)]) -join "`n")
}
function Get-Tasks {
  $lines = (Read-Lf (Join-Path $JDir '11-code-tasks.txt')) -split "`n"
  $tasks = @{}
  $i = 0
  while ($i -lt $lines.Count) {
    if ($lines[$i] -match '^(C-0\d)\s{2}') {
      $id = $Matches[1]; $tt = @(); $ro = @(); $mode = ''
      $j = $i + 1
      while ($j -lt $lines.Count -and $lines[$j] -notmatch '^C-0\d\s{2}' -and $lines[$j] -notmatch '^4\. ') {
        $l = $lines[$j]
        if ($l -eq '  task_text:') { $mode = 'tt' }
        elseif ($l -eq '  required_output:') { $mode = 'ro' }
        elseif ($l -match '^  general_rules') { $mode = '' }
        elseif ($mode -eq 'tt') { $tt += ($l -replace '^    ', '') }
        elseif ($mode -eq 'ro') { $ro += ($l -replace '^    ', '') }
        $j++
      }
      $tasks[$id] = [pscustomobject]@{ task_text = ($tt -join "`n"); required_output = ($ro -join "`n") }
      $i = $j
    } else { $i++ }
  }
  foreach ($t in $TaskIds) { if (-not $tasks.ContainsKey($t)) { throw "task $t missing" } }
  return $tasks
}
function Get-NumberedCode([string]$model, [string]$id) {
  $txt = Read-Lf (Join-Path $KDir "K-60-code\$model\$id.abap")
  if ($txt.EndsWith("`n")) { $txt = $txt.Substring(0, $txt.Length - 1) }
  $lines = $txt -split "`n"
  $w = "$($lines.Count)".Length
  $out = for ($k = 0; $k -lt $lines.Count; $k++) { ("{0}  {1}" -f "$($k + 1)".PadLeft($w), $lines[$k]).TrimEnd() }
  return ($out -join "`n")
}
function Get-Checker([string]$model, [string]$id) {
  $txt = Read-Lf (Join-Path $KDir "K-60-checker\$model\$id.txt")
  return $txt.TrimEnd("`n")
}
$Script:S8 = $null; $Script:Tasks = $null
function Build-Prompt([string]$cond, [string]$model, [string]$id) {
  if ($null -eq $Script:S8) { $Script:S8 = @{ original = (Get-Section8Old); note = (Get-Section8New) }; $Script:Tasks = Get-Tasks }
  $t = $Script:Tasks[$id]
  $parts = @(
    'Review the ABAP code below against §8 of the review checklist.',
    '',
    '==== §8 of the review checklist ====',
    $Script:S8[$cond],
    '==== end of §8 ====',
    '',
    ($Paradigm[$id] + ' (given here in place of interview.md and the configured ABAP_RELEASE)'),
    '',
    '==== Task the author was given ====',
    $t.task_text,
    '',
    ('Required output: ' + $t.required_output),
    '==== end of task ====',
    '',
    '==== Code (line numbers prefixed; they are not part of the source) ====',
    (Get-NumberedCode $model $id),
    '==== end of code ====',
    '',
    '==== Bundled offline checker output for this code ====',
    (Get-Checker $model $id),
    '==== end of checker output ====',
    '',
    $Instruction
  )
  return ($parts -join "`n")
}
function CmdLineLen([string]$p) {
  # Windows 인자 인용 규칙으로 늘어나는 몫을 더한 근사치(" → \" · 따옴표 앞 역슬래시 두 배)
  $q = ([regex]::Matches($p, '"')).Count
  $bs = 0; foreach ($m in [regex]::Matches($p, '\\+"')) { $bs += $m.Length - 1 }
  return $p.Length + $q + $bs + 2
}

# ---------- 작업 폴더 ----------
function Setup-Work {
  Ensure-Dir $Work; Ensure-Dir $OrigCwd; Ensure-Dir $ConvDir; Ensure-Dir $NoteDir; Ensure-Dir $RawRoot; Ensure-Dir $StateDir
  if (-not (Test-Path -LiteralPath $Mcp)) { [IO.File]::WriteAllText($Mcp, '{"mcpServers":{}}', $Utf8) }
  foreach ($f in $ConvFiles) {
    $src = Join-Path $Repo "interactive\core\knowledge\abap\conventions\$f"
    $dst = Join-Path $ConvDir $f
    if (-not (Test-Path -LiteralPath $dst) -or (Sha256File $src) -ne (Sha256File $dst)) { [IO.File]::Copy($src, $dst, $true) }
  }
  Check-Work
}
function Check-Work {
  $noteItems = @(Get-ChildItem -LiteralPath $NoteDir -Force -Recurse)
  if ($noteItems.Count -ne 0) { throw "note folder is not empty ($($noteItems.Count) entries)" }
  $origFiles = @(Get-ChildItem -LiteralPath $OrigDir -Force -Recurse -File)
  $expect = @($ConvFiles | ForEach-Object { "knowledge\abap\conventions\$_" })
  $rel = @($origFiles | ForEach-Object { $_.FullName.Substring($OrigDir.Length + 1) })
  if ($rel.Count -ne 5 -or @(Compare-Object $rel $expect).Count -ne 0) { throw "original folder files unexpected: $($rel -join ', ')" }
  $origDirs = @(Get-ChildItem -LiteralPath $OrigDir -Force -Recurse -Directory | ForEach-Object { $_.FullName.Substring($OrigDir.Length + 1) })
  $expectDirs = @('procedures', 'knowledge', 'knowledge\abap', 'knowledge\abap\conventions')
  if (@(Compare-Object $origDirs $expectDirs).Count -ne 0) { throw "original folder dirs unexpected: $($origDirs -join ', ')" }
  foreach ($f in $ConvFiles) {
    if ((Sha256File (Join-Path $Repo "interactive\core\knowledge\abap\conventions\$f")) -ne (Sha256File (Join-Path $ConvDir $f))) { throw "copy differs: $f" }
  }
  if ((Get-Content -Raw -LiteralPath $Mcp) -ne '{"mcpServers":{}}') { throw 'empty-mcp.json content unexpected' }
}

# ---------- 프롬프트 산출 ----------
function Write-Prompts {
  $pdir = Join-Path $Data 'L-75-prompts'
  Ensure-Dir $pdir
  $sample = @{ model = 'claude-opus-5-5'; id = 'C-01' }
  $L = [System.Collections.Generic.List[string]]::new()
  $L.Add('L-75-prompts/diff-summary.txt — 판L T7 · 두 조건 프롬프트의 차이 대조 (L-75-review-runner.ps1 -Phase prompts 가 쓴다)')
  $L.Add('')
  $L.Add('원문 1개씩: original-claude-opus-5-5-C-01.txt · note-claude-opus-5-5-C-01.txt (나머지 18개는 러너가 같은 함수로 다시 조립한다 · 아래 sha256)')
  $L.Add('')
  $L.Add('1. 조건별로 다른 것 — §8 · 도구 · cwd · add-dir(원본 조건 파일 접근 수단 · 본 측정 메인 판정 (a))')
  $L.Add('   §8 문안  original = L-30-old-section8.txt 의 2행~끝(머리 출처 줄 제외) · note = review-checklist.md 의 "## §8 — " 줄 ~ 다음 "## " 줄 직전')
  $L.Add('   도구     original = --tools "Read" · note = --tools ""')
  $L.Add('   cwd      original = <work>\original\procedures (안에 아무것도 없음 · 형제 knowledge\abap\conventions\ 에 규약 5파일) · note = <work>\note (빈 폴더)')
  $L.Add('   add-dir  original(본 측정) = --tools "Read" 뒤에 --add-dir <work>\original · note = 없음 — spec 글자 그대로의 시험(trial)에서 cwd 밖 Read 가 권한 거부돼 메인이 더했다(L-75-run-log.txt 시험 기록)')
  $L.Add('   그 밖의 명령 인자는 글자 그대로 같다: claude -p <프롬프트> --model claude-opus-5-5 --tools <위> --setting-sources "" --strict-mcp-config --mcp-config <work>\empty-mcp.json --disable-slash-commands --output-format stream-json --verbose --no-session-persistence')
  $L.Add('')
  $L.Add('2. 기계 대조 — 20개 프롬프트 전부 (각 쌍에서 §8 블록을 같은 자리표 <<SECTION8>> 로 바꾼 뒤 바이트 비교)')
  $allSame = $true
  foreach ($m in $AnswerModels) {
    foreach ($id in $TaskIds) {
      $po = Build-Prompt 'original' $m $id
      $pn = Build-Prompt 'note' $m $id
      $ko = $po.Replace($Script:S8.original, '<<SECTION8>>')
      $kn = $pn.Replace($Script:S8.note, '<<SECTION8>>')
      $same = ($ko -ceq $kn) -and ($ko.Contains('<<SECTION8>>')) -and (([regex]::Matches($ko, '<<SECTION8>>')).Count -eq 1)
      if (-not $same) { $allSame = $false }
      $L.Add(("   {0,-18} {1}  §8 밖 동일={2}  original chars={3} sha256={4}  note chars={5} sha256={6}  cmdline≈ {7} / {8}" -f $m, $id, $same, $po.Length, (Sha256Text $po).Substring(0, 16), $pn.Length, (Sha256Text $pn).Substring(0, 16), (CmdLineLen $po), (CmdLineLen $pn)))
      if ($m -eq $sample.model -and $id -eq $sample.id) {
        Write-Utf8 (Join-Path $pdir "original-$m-$id.txt") $po
        Write-Utf8 (Join-Path $pdir "note-$m-$id.txt") $pn
      }
    }
  }
  $L.Add("   전체 결과: §8 밖 20/20 동일 = $allSame")
  $L.Add('')
  $L.Add('3. 줄 단위 차이 (견본 claude-opus-5-5 C-01 · Compare-Object — 차이가 난 줄이 전부 §8 블록 안의 줄인지)')
  $po = Build-Prompt 'original' 'claude-opus-5-5' 'C-01'; $pn = Build-Prompt 'note' 'claude-opus-5-5' 'C-01'
  $oSet = @($Script:S8.original -split "`n"); $nSet = @($Script:S8.note -split "`n")
  $diff = @(Compare-Object ($po -split "`n") ($pn -split "`n") -CaseSensitive)
  $outside = @($diff | Where-Object { ($_.SideIndicator -eq '<=' -and $oSet -cnotcontains $_.InputObject) -or ($_.SideIndicator -eq '=>' -and $nSet -cnotcontains $_.InputObject) })
  $L.Add("   original 에만 있는 줄 $(@($diff | Where-Object SideIndicator -eq '<=').Count) · note 에만 있는 줄 $(@($diff | Where-Object SideIndicator -eq '=>').Count) · 그 가운데 §8 블록 밖의 줄 $($outside.Count)")
  $L.Add("   §8 블록 줄 수: original $($oSet.Count) · note $($nSet.Count) · sha256 original $((Sha256Text $Script:S8.original).Substring(0,16)) · note $((Sha256Text $Script:S8.note).Substring(0,16))")
  $L.Add('')
  $L.Add('4. 프롬프트 골격 (두 조건 공통 · 글자 그대로)')
  $L.Add('   Review the ABAP code below against §8 of the review checklist. / ==== §8 ... ==== <§8 문안> ==== end of §8 ==== /')
  $L.Add('   <패러다임 · 릴리스 한 줄> (given here in place of interview.md and the configured ABAP_RELEASE) /')
  $L.Add('   ==== Task the author was given ==== <task_text> / Required output: <required_output> ==== end of task ==== /')
  $L.Add('   ==== Code (line numbers prefixed; they are not part of the source) ==== <줄 번호 + 두 칸 + 원래 줄> ==== end of code ==== /')
  $L.Add('   ==== Bundled offline checker output for this code ==== <K-60-checker 파일 원문> ==== end of checker output ==== /')
  $L.Add("   $Instruction")
  $L.Add('   패러다임 · 릴리스 줄의 값과 근거는 L-75-review-runner.ps1 머리 주석.')
  Write-Utf8 (Join-Path $pdir 'diff-summary.txt') (($L -join "`n") + "`n")
  if (-not $allSame -or $outside.Count -ne 0) { throw 'prompt diff check failed' }
  Say "prompts ok · allSame=$allSame"
}

# ---------- 호출 · 이벤트 ----------
function Invoke-Review([string]$cond, [string]$prompt, [string]$outf, [string]$errf, [bool]$addDir) {
  $env:CLAUDECODE = $null
  $cwd = if ($cond -eq 'original') { $OrigCwd } else { $NoteDir }
  Push-Location -LiteralPath $cwd
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    if ($cond -eq 'original' -and $addDir) {
      claude -p $prompt --model $Model --tools "Read" --add-dir "$OrigDir" --setting-sources "" --strict-mcp-config --mcp-config "$Mcp" --disable-slash-commands --output-format stream-json --verbose --no-session-persistence > $outf 2> $errf
    } elseif ($cond -eq 'original') {
      claude -p $prompt --model $Model --tools "Read" --setting-sources "" --strict-mcp-config --mcp-config "$Mcp" --disable-slash-commands --output-format stream-json --verbose --no-session-persistence > $outf 2> $errf
    } else {
      claude -p $prompt --model $Model --tools "" --setting-sources "" --strict-mcp-config --mcp-config "$Mcp" --disable-slash-commands --output-format stream-json --verbose --no-session-persistence > $outf 2> $errf
    }
    $code = $LASTEXITCODE
    $sw.Stop()
  } finally { Pop-Location }
  return @{ exit = $code; wall_ms = $sw.ElapsedMilliseconds }
}
function Read-Events([string]$jsonl) {
  $o = [ordered]@{ init_model = $null; init_tools = @(); init_mcp = @(); asst_models = @(); usage_models = @(); tool_uses = @(); tool_errors = @{}; result = $null; is_error = $null; denials = 0; usage = $null; num_turns = $null; duration_ms = $null; cost = $null; types = @{}; result_subtype = $null }
  if (-not (Test-Path -LiteralPath $jsonl)) { return $o }
  foreach ($l in [IO.File]::ReadLines($jsonl, $Utf8)) {
    if ([string]::IsNullOrWhiteSpace($l)) { continue }
    try { $e = $l | ConvertFrom-Json -Depth 50 } catch { $o.types['(unparsable)'] = 1 + [int]$o.types['(unparsable)']; continue }
    $o.types[[string]$e.type] = 1 + [int]$o.types[[string]$e.type]
    if ($e.type -eq 'system' -and $e.subtype -eq 'init') {
      $o.init_model = [string]$e.model; $o.init_tools = @($e.tools); $o.init_mcp = @($e.mcp_servers | ForEach-Object { [string]$_.name })
    } elseif ($e.type -eq 'assistant') {
      $o.asst_models += [string]$e.message.model
      foreach ($c in @($e.message.content)) {
        if ($c.type -eq 'tool_use') { $o.tool_uses += [pscustomobject]@{ id = [string]$c.id; name = [string]$c.name; input = $c.input } }
      }
    } elseif ($e.type -eq 'user') {
      foreach ($c in @($e.message.content)) {
        if ($c.type -eq 'tool_result') { $o.tool_errors[[string]$c.tool_use_id] = [bool]$c.is_error }
      }
    } elseif ($e.type -eq 'result') {
      $o.result = [string]$e.result; $o.is_error = [bool]$e.is_error; $o.usage = $e.usage; $o.num_turns = $e.num_turns
      $o.duration_ms = $e.duration_ms; $o.cost = $e.total_cost_usd; $o.denials = @($e.permission_denials).Count; $o.result_subtype = [string]$e.subtype
      if ($null -ne $e.modelUsage) { $o.usage_models = @($e.modelUsage.PSObject.Properties.Name) }
    }
  }
  $o.asst_models = @($o.asst_models | Where-Object { $_ } | Select-Object -Unique)
  return $o
}
function Rel-ToWork([string]$p, [string]$base) {
  # base = 작업 폴더(original) · 상대 경로는 cwd(procedures) 기준으로 편다
  if ([string]::IsNullOrWhiteSpace($p)) { return @{ rel = '(no path)'; inside = $false } }
  $full = if ([IO.Path]::IsPathRooted($p)) { [IO.Path]::GetFullPath($p) } else { [IO.Path]::GetFullPath((Join-Path $OrigCwd $p)) }
  $b = $base.TrimEnd('\') + '\'
  if ($full.StartsWith($b, [StringComparison]::OrdinalIgnoreCase)) { return @{ rel = $full.Substring($b.Length).Replace('\', '/'); inside = $true } }
  return @{ rel = '(outside work folder)'; inside = $false }
}
function Get-ResetWait([string]$text) {
  $m = [regex]::Match($text, '(?:try again at|resets?(?: at)?)\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)')
  if ($m.Success) {
    $h = [int]$m.Groups[1].Value; $mi = if ($m.Groups[2].Success) { [int]$m.Groups[2].Value } else { 0 }; $ap = $m.Groups[3].Value.ToUpper()
    if ($ap -eq 'PM' -and $h -lt 12) { $h += 12 } elseif ($ap -eq 'AM' -and $h -eq 12) { $h = 0 }
    $target = (Get-Date).Date.AddHours($h).AddMinutes($mi)
    if ($target -lt (Get-Date)) { $target = $target.AddDays(1) }
    return [int]([math]::Ceiling(($target - (Get-Date)).TotalSeconds)) + 60
  }
  $m2 = [regex]::Match($text, '\|(\d{10})\b')
  if ($m2.Success) {
    $target = [DateTimeOffset]::FromUnixTimeSeconds([long]$m2.Groups[1].Value).LocalDateTime
    return [int]([math]::Max(60, [math]::Ceiling(($target - (Get-Date)).TotalSeconds) + 60))
  }
  return 0
}

function Run-Session([string]$phaseName, [string]$cond, [string]$m, [string]$id, [bool]$addDir = $false) {
  $key = "$phaseName-$cond-$m-$id"
  $statePath = Join-Path $StateDir "$key.json"
  if (Test-Path -LiteralPath $statePath) {
    $prev = Get-Content -Raw -Encoding utf8 $statePath | ConvertFrom-Json -Depth 20
    if ($prev.final -eq 'valid') { Say "skip $key (already valid)"; return }
  }
  $prompt = Build-Prompt $cond $m $id
  $rawDir = Join-Path $RawRoot "$phaseName\$cond"; Ensure-Dir $rawDir
  $attempts = [System.Collections.Generic.List[object]]::new()
  $invalidN = 0; $transientN = 0; $k = 0; $final = 'none'; $answer = $null
  while ($true) {
    $k++
    Check-Work
    $outf = Join-Path $rawDir "$m-$id.a$k.jsonl"; $errf = Join-Path $rawDir "$m-$id.a$k.stderr.txt"
    $ts0 = Now
    Say "$key attempt $k start"
    $call = Invoke-Review $cond $prompt $outf $errf $addDir
    $ts1 = Now
    $ev = Read-Events $outf
    $stderr = if (Test-Path -LiteralPath $errf) { [IO.File]::ReadAllText($errf, $Utf8) } else { '' }
    $tools = @()
    $ruleViolations = @()
    foreach ($tu in $ev.tool_uses) {
      $err = if ($ev.tool_errors.ContainsKey($tu.id)) { $ev.tool_errors[$tu.id] } else { $null }
      if ($tu.name -eq 'Read') {
        $r = Rel-ToWork ([string]$tu.input.file_path) $OrigDir
        $tools += [pscustomobject]@{ name = 'Read'; path = $r.rel; inside = $r.inside; is_error = $err; offset = $tu.input.offset; limit = $tu.input.limit }
        if ($cond -eq 'original' -and -not $r.inside) { $ruleViolations += "Read outside work folder" }
      } else {
        $tools += [pscustomobject]@{ name = $tu.name; path = ''; inside = $false; is_error = $err }
        if ($cond -eq 'original') { $ruleViolations += "tool other than Read: $($tu.name)" }
      }
    }
    if ($cond -eq 'note' -and $ev.tool_uses.Count -gt 0) { $ruleViolations += "note condition made $($ev.tool_uses.Count) tool call(s)" }
    $expectTools = if ($cond -eq 'original') { 'Read' } else { '' }
    if ((@($ev.init_tools | Sort-Object) -join ',') -ne $expectTools) { $ruleViolations += "init.tools = [$(@($ev.init_tools) -join ',')]" }
    if (@($ev.init_mcp).Count -ne 0) { $ruleViolations += "init.mcp_servers = [$(@($ev.init_mcp) -join ',')]" }
    $transient = @()
    if ($call.exit -ne 0) { $transient += "exit=$($call.exit)" }
    if ($null -eq $ev.result) { $transient += 'no result event' }
    elseif ($ev.is_error) { $transient += "result is_error (subtype=$($ev.result_subtype))" }
    elseif ([string]::IsNullOrWhiteSpace($ev.result)) { $transient += 'empty result' }
    $observed = @(@($ev.init_model) + @($ev.asst_models) + @($ev.usage_models) | Where-Object { $_ } | Select-Object -Unique)
    if ($observed.Count -eq 0 -or @($observed | Where-Object { $_ -notlike "$Model*" }).Count -gt 0) { $transient += "observed model(s) = [$($observed -join ',')]" }
    $kind = if ($ruleViolations.Count -gt 0) { 'invalid' } elseif ($transient.Count -gt 0) { 'transient' } else { 'valid' }
    $attempts.Add([pscustomobject]@{
      attempt = $k; kind = $kind; ts_start = $ts0; ts_end = $ts1; exit = $call.exit; wall_ms = $call.wall_ms
      init_model = $ev.init_model; asst_models = @($ev.asst_models); usage_models = @($ev.usage_models)
      init_tools = @($ev.init_tools); init_mcp = @($ev.init_mcp)
      usage = $ev.usage; permission_denials = $ev.denials; add_dir = ($cond -eq 'original' -and $addDir); num_turns = $ev.num_turns; duration_ms = $ev.duration_ms; cost = $ev.cost
      tools = $tools; rule = @($ruleViolations); transient = @($transient)
      result_chars = if ($null -ne $ev.result) { $ev.result.Length } else { 0 }
      stderr_head = (Redact ($stderr.Substring(0, [math]::Min(300, $stderr.Length))))
      result_head = if ($kind -ne 'valid' -and $null -ne $ev.result) { Redact ($ev.result.Substring(0, [math]::Min(300, $ev.result.Length))) } else { '' }
    })
    Say "$key attempt $k → $kind $(@($ruleViolations + $transient) -join '; ')"
    if ($kind -eq 'valid') { $final = 'valid'; $answer = $ev.result; break }
    if ($kind -eq 'invalid') {
      $invalidN++
      if ($invalidN -ge $MaxInvalid) { $final = 'gave-up-invalid'; break }
      continue
    }
    $transientN++
    if ($transientN -gt $MaxTransient) { $final = 'gave-up-transient'; break }
    $wait = Get-ResetWait (($ev.result) + ' ' + $stderr)
    if ($wait -le 0) { $wait = $Backoff[[math]::Min($transientN - 1, $Backoff.Count - 1)] }
    Say "$key waiting $wait s"
    Start-Sleep -Seconds $wait
  }
  if ($final -eq 'valid') {
    $outDir = if ($phaseName -eq 'main') { Join-Path $Data "L-75-reviews\$cond" } else { Join-Path $Data "L-75-reviews-$phaseName\$cond" }
    Write-Utf8 (Join-Path $outDir "$m-$id.txt") $answer
  }
  $state = [ordered]@{ phase = $phaseName; cond = $cond; answer_model = $m; task = $id; final = $final; prompt_chars = $prompt.Length; prompt_sha256 = (Sha256Text $prompt); attempts = $attempts }
  [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 20), $Utf8)
  if ($final -ne 'valid') { throw "$key ended $final" }
}

# ---------- 로그 렌더 ----------
function Fmt-Usage($u) {
  if ($null -eq $u) { return 'usage=(none)' }
  return "input=$($u.input_tokens) · cache_creation=$($u.cache_creation_input_tokens) · cache_read=$($u.cache_read_input_tokens) · output=$($u.output_tokens)"
}
function Render-Log {
  $L = [System.Collections.Generic.List[string]]::new()
  $L.Add('L-75-run-log.txt — 판L T7 · E-3 리뷰어 두 조건 실행 기록 (L-75-review-runner.ps1 -Phase log 가 state 기록에서 그린다)')
  $L.Add('=====================================================================================')
  $L.Add("리뷰어: $Model 헤드리스(Claude Code $((claude --version) -replace ' \(Claude Code\)','')) · 한 답 한 세션 · 명령과 조건은 L-75-review-runner.ps1 머리 · L-75-prompts/diff-summary.txt")
  $L.Add('경로 표기: 도구 호출 경로는 original 작업 폴더 상대(knowledge/abap/conventions/… · procedures/…) · 작업 폴더 밖이면 (outside work folder)')
  $L.Add('모델 id: init = system/init.model · asst = assistant.message.model · usage = result.modelUsage 의 키 (모두 이벤트 실측)')
  $L.Add('토큰: result.usage (input · cache_creation · cache_read · output) · 종류: valid / invalid(무효 규칙 위반 → 재실행) / transient(한도·오류 → 기다렸다 재시도)')
  $L.Add('stream JSON 원본은 레포 밖 스크래치에만 있다(작업 경로 · 홈 경로 · 세션 ID 가 실려 커밋하지 않는다).')
  $L.Add('조건 차이: §8 · 도구 · cwd · add-dir. 시험 trial(spec 글자 그대로)의 original 은 cwd 밖 Read 2회가 권한 거부(permission_denials 2)로')
  $L.Add('  파일을 못 열었다 → 메인 판정 (a): 본 측정 original 에만 --add-dir <work>\original. trial-adddir 가 그 수단의 시험이다.')
  $L.Add('러너 결함 1회(기록): trial note 의 첫 세션은 세션 자체는 끝났으나 러너의 판정 코드가 빈 배열 비교에서 멈췄다 → 고친 뒤 같은 세션을')
  $L.Add('  다시 돌렸다(아래 trial note a1 이 그 재실행). 멈춘 세션의 원본은 스크래치에만 runner-crash 이름으로 남겼다(판정 · 응답 저장 없음).')
  $L.Add('알려진 한계(기록만): ① 가장 긴 프롬프트(claude-sonnet-5-5 C-02 note)의 명령줄 근사 길이 약 31.6K 자 — Windows 상한 32,767 자 대비 여유 약 800 자')
  $L.Add('  ② 지시 줄이 한국어라 응답도 한국어다 ③ 검사기 출력은 원문 그대로라 머리 경로에 답 모델 이름이 보인다(두 조건 같은 글자)')
  $L.Add('  ④ 옛 §8 이 링크하는 템플릿 2파일은 넣지 않았다(spec = 규약 5파일 · 쪽지 조건도 못 읽음) — 그 Read 실패는 폴더 안이면 유효 · 기록만.')
  $L.Add('이름 검사(판K K-99-namecheck.mjs · L-75* 전부): 위반 1 = L-75-reviews/note/claude-sonnet-5-5-C-02.txt 2행의 [sid] 1건 — 그 낱말은')
  $L.Add('  ABAP 예외 클래스 접두 ZCX_ 의 머리 세 글자(쪽지 문안의 ZCX_{MODULE}_{PURPOSE} · 응답이 밑줄 없이 단독으로 썼다)로 SID 가 아니다(오탐). 응답 원문은 편집 금지라 그대로 둔다.')
  $L.Add('  그 밖의 범주(user · host · home · repo · sapenv · names · uuid · url · forge · binary) 위반 0.')
  $files = @(Get-ChildItem -LiteralPath $StateDir -Filter '*.json' | Sort-Object Name)
  $order = @{ 'trial' = 0; 'trial-adddir' = 1; 'main' = 2 }
  $states = @($files | ForEach-Object { Get-Content -Raw -Encoding utf8 $_.FullName | ConvertFrom-Json -Depth 20 } |
    Sort-Object @{ Expression = { $order[$_.phase] } }, @{ Expression = { $_.cond } ; Descending = $true }, answer_model, task)
  $sum = @{}
  foreach ($phaseName in 'trial', 'trial-adddir', 'main') {
    $ps = @($states | Where-Object phase -eq $phaseName)
    if ($ps.Count -eq 0) { continue }
    $L.Add('')
    $L.Add($(if ($phaseName -eq 'main') { '── 본 측정 (20세션 · 응답은 L-75-reviews/) ──' } else { "── 시험 실행 $phaseName (형식 확인용 · 본 측정과 별도 · 응답은 L-75-reviews-$phaseName/) ──" }))
    foreach ($s in $ps) {
      $L.Add('')
      $L.Add("[$($s.phase)] $($s.cond) · $($s.answer_model) $($s.task) · 최종=$($s.final) · 시도 $(@($s.attempts).Count) · prompt chars=$($s.prompt_chars) sha256=$($s.prompt_sha256.Substring(0,16))")
      foreach ($a in @($s.attempts)) {
        $L.Add("  a$($a.attempt) $($a.kind) · $($a.ts_start) → $($a.ts_end) · exit=$($a.exit) · wall_ms=$($a.wall_ms) · turns=$($a.num_turns)")
        $L.Add("     cmd: --tools $(if ($s.cond -eq 'original') { '"Read"' } else { '""' })$(if ($a.add_dir) { ' --add-dir <work>\original' }) · permission_denials=$($a.permission_denials)")
        $L.Add("     model: init=$($a.init_model) · asst=$(@($a.asst_models) -join ',') · usage=$(@($a.usage_models) -join ',') · init.tools=[$(@($a.init_tools) -join ',')] · mcp=[$(@($a.init_mcp) -join ',')]")
        $L.Add("     tokens: $(Fmt-Usage $a.usage)")
        $tl = @($a.tools)
        if ($tl.Count -eq 0) { $L.Add('     tool calls: 0') }
        else {
          $L.Add("     tool calls: $($tl.Count)")
          foreach ($t in $tl) { $L.Add("       - $($t.name) $($t.path)$(if ($null -ne $t.offset -or $null -ne $t.limit) { " (offset=$($t.offset) limit=$($t.limit))" })$(if ($t.is_error) { ' · tool_result is_error' })") }
        }
        $why = @(@($a.rule) + @($a.transient))
        $L.Add("     무효 여부: $(if ($a.kind -eq 'invalid') { '무효 — ' + ($why -join '; ') } elseif ($a.kind -eq 'transient') { '전이 — ' + ($why -join '; ') } else { '유효' })")
        if ($a.kind -ne 'valid') {
          if ($a.stderr_head) { $L.Add("     stderr 머리: $($a.stderr_head -replace "`r?`n", ' / ')") }
          if ($a.result_head) { $L.Add("     result 머리: $($a.result_head -replace "`r?`n", ' / ')") }
        }
      }
      if ($s.phase -eq 'main' -and $s.final -eq 'valid') {
        $va = @($s.attempts | Where-Object kind -eq 'valid')[-1]
        $f = Join-Path $Data "L-75-reviews\$($s.cond)\$($s.answer_model)-$($s.task).txt"
        $lines = @([IO.File]::ReadAllLines($f, $Utf8) | Where-Object { $_ -match '\|.*\|' -and $_ -notmatch '^\s*\|?\s*:?-{3,}' -and $_ -notmatch '^\s*\|?\s*\**(규칙|rule)\**\s*\|\s*\**(위치|location)' -and -not $_.Contains('규칙 | 위치(줄 번호) | 내용') })
        $L.Add("     응답: L-75-reviews/$($s.cond)/$($s.answer_model)-$($s.task).txt · 지적 줄 수(「a | b | c」 꼴 · 표 머리 · 구분 줄 제외 · 기계 계수 참고치 — 매칭은 다른 태스크) = $($lines.Count) · Read $(@($va.tools).Count)회")
        if (-not $sum.ContainsKey($s.cond)) { $sum[$s.cond] = @{ lines = 0; opened = 0; n = 0; invalid = 0; reads = 0 } }
        $sum[$s.cond].lines += $lines.Count; $sum[$s.cond].n++; $sum[$s.cond].reads += @($va.tools).Count
        if (@($va.tools | Where-Object { $_.name -eq 'Read' -and -not $_.is_error }).Count -gt 0) { $sum[$s.cond].opened++ }
        $sum[$s.cond].invalid += @($s.attempts | Where-Object kind -eq 'invalid').Count
      }
    }
  }
  $L.Add('')
  $L.Add('── 요약 (본 측정) ──')
  foreach ($c in $Conds) {
    if ($sum.ContainsKey($c)) {
      $L.Add("  $c : 세션 $($sum[$c].n)/10 유효 · 무효 시도(재실행으로 대체) $($sum[$c].invalid) · 지적 줄 수 합계(기계 계수 참고치) $($sum[$c].lines) · Read 호출 합계 $($sum[$c].reads) · 파일을 하나 이상 연(성공한 Read) 세션 $($sum[$c].opened)")
    }
  }
  Write-Utf8 (Join-Path $Data 'L-75-run-log.txt') (($L -join "`n") + "`n")
  Say 'log rendered'
}

switch ($Phase) {
  'setup' { Setup-Work; Say 'setup ok' }
  'prompts' { Check-Work; Write-Prompts }
  'trial' {
    Check-Work
    foreach ($c in $Conds) { Run-Session 'trial' $c 'claude-opus-5-5' 'C-01' }
    Render-Log
  }
  'trial-adddir' {
    Check-Work
    Run-Session 'trial-adddir' 'original' 'claude-opus-5-5' 'C-01' $true
    Render-Log
  }
  'main' {
    Check-Work
    foreach ($m in $AnswerModels) { foreach ($id in $TaskIds) { foreach ($c in $Conds) { Run-Session 'main' $c $m $id $true } } }
    Render-Log
  }
  'log' { Render-Log }
}
