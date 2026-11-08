#Requires -Version 7.0
<#
K-60-run-code.ps1 — 판K T6 「코드 시험 응시(켠 조건) + 동봉 검사기 채점」 러너 (2026-11-08) — 판J 60-run-code.ps1 의 복사본 + 판K 차이
=====================================================================================
(차이 전수표 = K-01-diff-from-panJ.txt · 명령·고정 값 정본 = K-00-recipe.txt · 설계 정본 = DECISIONS.md D-160 ⓪)
무엇을 하나
  코드 과제 C-01~C-05(판J 11-code-tasks.txt · 사고 재현 C-INC 는 응시하지 않는다)를 3 모델(claude-opus-5-5 ·
  claude-sonnet-5-5 · gpt-5.6-sol)에게 「하네스 폴더를 읽을 수 있는」 조건으로 던지고, 응답에서 ABAP 을 기계 추출해
  동봉 검사기(lint·parse·analyze)로 채점한다. 이 세션 모델은 ABAP 을 한 줄도 쓰지 않는다 — 응답은 무편집으로 저장한다
  (단 로컬 경로 %TEMP% · 홈 조각만 자리 표시로 가린다 — 이벤트 요약에 가린 수를 적는다).

판J 레시피 대비 차이 (D-160 ⓪ 셋 + 판K 운영)
  1. 하네스 폴더 %TEMP%\sapkit-panK\harness-T6\ (커밋 4f12d678 의 knowledge\ · personas\ — 203파일) = 모든 호출의 cwd(claude
     작업 폴더 · codex -C). empty-mcp.json 은 폴더 밖 형제 %TEMP%\sapkit-panK\empty-mcp.json. Codex 홈 codexhome-T6\ (auth.json 사본만).
  2. Claude: --tools "Read,Grep,Glob" + --restricted. Codex: 플래그 그대로 + -c model_reasoning_effort="medium"(배너 확인 · 거부되면 중단) + -c windows.sandbox="unelevated"(T0-b · 소유자 결정 2026-11-08 · K-00 §3).
  3. 고정 줄 = D-160 ⓪ 코드 줄(+ 한국어 병기).
  4. 유효성 ⑴~⑷ 기계 판정 · 판정 순서 ①②③ · 벽시계 15분 · 고정 백오프 8회(K-00 §4 · §5) — 3회 모두 무효면 그 과제는 불통과(오답).
  5. 원 이벤트 스트림(JSONL) · 무효 원응답은 %TEMP%\sapkit-panK\raw-T6\<model>\ 에만 (커밋하지 않음).
  6. 폴더 무결성: 모델마다 응시 시작 · 끝에 203 blob sha 재측정 (K-60-folder-integrity.txt).

사용 (PowerShell 7 · 레포 안 어디서든)
  pwsh -NoProfile -File K-60-run-code.ps1 -Phase check                       완전성 검사 (RED/GREEN · exit 0/1 · 모델 호출 없음)
  pwsh -NoProfile -File K-60-run-code.ps1 -Phase prompts                     프롬프트 5종 생성·sha256 표 (모델 호출 없음)
  pwsh -NoProfile -File K-60-run-code.ps1 -Phase canary -Model <m|all>       T0 카나리아 ⑴ 격리 ⑵ 폴더 안 읽기 ⑶ 경계 (+ ⑷ Codex 배너) → K-02-canary\T6-<m>.txt
  pwsh -NoProfile -File K-60-run-code.ps1 -Phase run -Model <m> [-Only id,…] 과제 5종 응시 (첫 호출 = 격리 카나리아 · 멱등 · 끝난 과제는 건너뜀)
  pwsh -NoProfile -File K-60-run-code.ps1 -Phase reextract [-Model <m>]      저장된 JSONL 에서 raw/code/events 재도출 (모델 호출 없음)
  pwsh -NoProfile -File K-60-run-code.ps1 -Phase score                       검사기 채점 → K-60-checker/ · K-60-checker-summary.csv
  pwsh -NoProfile -File K-60-run-code.ps1 -Phase cleanup                     codexhome-T6 삭제·확인

멱등·재개
  (모델, 과제) 상태는 raw-T6\<model>\<id>.state.json 에 있다. done 이면 건너뛴다. 호출마다 JSONL 은
  <id>.call-<k>.jsonl 로 남고, 최종 호출은 <id>.jsonl 로 복사된다.

코드 추출 규칙 (기계 적용 · 판J 와 같다)
  원응답에서 「마지막 완결 펜스 블록」을 취한다 — 여는 펜스 = ``` 로 시작하는 줄(언어 태그 허용) ·
  닫는 펜스 = ``` 만 있는 줄. 펜스 두 줄을 떼고 안의 줄들을 LF 로 이어 끝에 LF 하나를 둔다.
  완결 블록이 없으면 원응답 전체를 .abap 으로 저장하고 no_fence=1. 블록이 둘 이상이면 blocks=N.
  답 없음(answer=none — 3회 무효 · 빈 본문 · 되묻기)도 .abap 자리에 저장하되 검사기는 돌리지 않는다(그 과제는 불통과).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('check', 'prompts', 'canary', 'run', 'reextract', 'score', 'cleanup')]
  [string]$Phase,
  [ValidateSet('claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol', 'all')]
  [string]$Model = 'all',
  [string[]]$Only = @()
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$Utf8 = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8
[Console]::InputEncoding = $Utf8
$OutputEncoding = $Utf8

# ---------- 경로·상수 ----------
$Data = $PSScriptRoot
$DataName = Split-Path $Data -Leaf
$Root = (Resolve-Path (Join-Path $Data '..\..\..\..')).Path
$DataRel = "docs/reference/audits/$DataName"
$JData = Join-Path (Split-Path $Data) '2026-11-05-harness-necessity-review-data'
$CheckerRel = 'interactive/checker/sapkit-checker.bundle.cjs'
$Tmp = Join-Path $env:TEMP 'sapkit-panK'
$KSet = 'T6'
$HarnessDir = Join-Path $Tmp 'harness-T6'
$EmptyMcp = Join-Path $Tmp 'empty-mcp.json'
$CodexHome = Join-Path $Tmp 'codexhome-T6'
$RawRoot = Join-Path $Tmp 'raw-T6'
$KCanaryDir = Join-Path $Data 'K-02-canary'
$KFolderShaFile = Join-Path $KCanaryDir 'folder-sha-T6.txt'
$AllModels = @('claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol')
$CodexModel = 'gpt-5.6-sol'
$RetriesPath = Join-Path $Data 'K-60-retries.txt'
$RunLogPath = Join-Path $Data 'K-60-run-log.txt'
$IntegrityPath = Join-Path $Data 'K-60-folder-integrity.txt'
$Backoff = @(60, 120, 240, 480, 900, 900, 900, 900)
$MaxTransient = $Backoff.Count
$MaxAttempts = 3
$NodeExe = (Get-Command node -CommandType Application | Select-Object -First 1).Source

# 프롬프트 고정 줄 (세 모델 공통 · 과제마다 동일 · 글자 그대로 · D-160 ⓪ 둘째 줄 + 한국어 병기)
$FixedLine = @'
Write the complete ABAP source as a single file and return it in one ```abap code block, with no explanation outside the block. You may read the files in the current folder first (SAP knowledge pack: knowledge/ - ABAP conventions: knowledge/abap/conventions/). Do not use web search, do not read anything outside the current folder, and do not create or modify any file. (설명 없이 단일 파일 ABAP 소스를 ```abap 코드 블록 하나로만 돌려줘. 먼저 현재 폴더의 파일을 읽어도 된다 — SAP 지식 팩: knowledge/ · ABAP 규약: knowledge/abap/conventions/. 웹 검색을 쓰지 말고, 현재 폴더 밖은 읽지 말고, 파일을 만들거나 고치지 말라.)
'@
# 카나리아 프롬프트 · 배너 프롬프트 = K-COMMON 의 $KCanaryPrompt · $KBannerPrompt (판J 02 §0 · §3 글자 그대로)

# >>> K-COMMON (K-50 · K-60 같은 글자 — 판K T0 · 정본 = K-00-recipe.txt) ---------------------------------------------
# 하네스 조건 공통 부분: 고정 값 · CLI 호출(벽시계 15분) · 유효성 ⑴~⑷ · 판정 순서 · 폴더 무결성 · 카나리아 3종 · 가림.
# 이 블록을 쓰기 전에 러너가 정해 두는 변수: $HarnessDir · $EmptyMcp · $CodexHome · $KFolderShaFile · $KCanaryDir · $KSet(T5|T6)
$KUtf8           = [Text.UTF8Encoding]::new($false)
$KBackoff        = @(60, 120, 240, 480, 900, 900, 900, 900)   # 전이 오류 백오프(초) — 8회 넘으면 중단(재개 가능)
$KWallSec        = 900                                         # 호출 하나의 벽시계 상한(15분) — 넘으면 프로세스 트리를 끊고 무효
$KMaxAttempts    = 3                                           # 무효 시도 상한 — 3회 모두 무효면 그 행은 오답
$KModels         = @('claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol')
$KClaudeTools    = @('Read', 'Grep', 'Glob')
$KCanaryPrompt   = "First, list every tool, skill, plugin, MCP server, slash command, web/search capability and file you currently have access to (say 'none' if none). Do not use any tool or web search. Second, answer from memory in one line: what is the standard VAT rate in Korea and how many digits does the Korean business registration number have?"
$KBannerPrompt   = 'Reply with exactly the single word OK and nothing else. Do not use any tool.'
$KReadPrompt     = 'Read the file personas/INDEX.md in the current folder and reply with its first line verbatim. Do not use web search. (현재 폴더의 personas/INDEX.md를 읽고 첫 줄을 글자 그대로 답하라.)'
$KBoundaryPrompt = 'Read the file {0} (absolute path) and reply with the single line it contains, verbatim. Do not use web search. (이 절대 경로의 파일을 읽고 그 한 줄을 글자 그대로 답하라.)'
# 판정 순서용 정규식 (K-00 §5 글자 그대로)
$KTransientRe    = '(?i)rate.?limit|usage limit|hit your limit|limit reached|too many requests|overloaded|\b429\b|\b5\d\d\b|stream disconnected|error sending request|connection (reset|refused|closed|error)|network error|timed? ?out|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|service unavailable|internal server error'
$KContextRe      = '(?i)context (window|length)|prompt is too long|too many tokens|maximum context|exceeds? the (model''?s )?context|max(imum)? turns|error_max_turns|ran out of room'
$KCodexRouterRe  = 'codex_core::tools::router: error=(?<k>[A-Za-z_]+)'   # Codex 가 --json 밖(stderr)에만 남기는 도구 시도
$KNoAnswerRe     = '(?i)^\s*(i (don''t|do not) know|i''?m not sure|i (cannot|can''t|could not|couldn''t) (find|read|access|determine|answer|locate)|unable to (find|read|access|determine|answer|locate)|(could|can) you (clarify|specify)|모르|알 수 없|읽을 수 없|찾을 수 없|확인할 수 없)'
# Codex 명령 분류 (K-00 §4 정본 — 분류가 애매하면 위반)
$KReadHeads = @('cat', 'type', 'get-content', 'gc', 'ls', 'dir', 'get-childitem', 'gci', 'rg', 'grep', 'select-string', 'sls', 'findstr',
  'head', 'tail', 'sed', 'find', 'wc', 'tree', 'test-path', 'resolve-path', 'pwd', 'get-location', 'gl', 'get-item', 'gi',
  'select-object', 'select', 'sort-object', 'sort', 'measure-object', 'measure', 'where-object', 'where', '?', 'foreach-object', '%',
  'format-table', 'ft', 'format-list', 'fl', 'out-string', 'echo', 'write-output', 'write-host', 'uniq', 'cut', 'nl', 'split-path',
  'join-path', 'get-filehash', 'cd', 'set-location', 'sl', 'pushd', 'popd')
$KDenyNet   = @('curl', 'wget', 'invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm', 'start-bitstransfer', 'ssh', 'scp', 'ftp', 'ping',
  'nslookup', 'test-netconnection', 'npm', 'npx', 'pip', 'pip3', 'winget')
$KDenyWrite = @('set-content', 'add-content', 'out-file', 'new-item', 'remove-item', 'rename-item', 'move-item', 'copy-item', 'mkdir',
  'rm', 'del', 'mv', 'cp', 'copy', 'move', 'ren', 'apply_patch', 'tee', 'tee-object', 'rmdir', 'erase', 'ni', 'ri', 'md')
$KDenyExec  = @('node', 'python', 'python3', 'py', 'pwsh', 'powershell', 'cmd', 'bash', 'sh', 'wsl', 'start-process', 'saps', 'start',
  'invoke-expression', 'iex', 'invoke-item', 'ii', 'invoke-command', 'icm')
$KGitNetRe  = '(?i)(?<![\w-])git(\.exe)?\s+(clone|fetch|pull|push)(?![\w-])'

$script:KHarnessText = $null
function Get-KHarnessText {
  if ($null -eq $script:KHarnessText) {
    $sb = [Text.StringBuilder]::new()
    foreach ($f in Get-ChildItem -LiteralPath $HarnessDir -Recurse -File -Force) { [void]$sb.Append([IO.File]::ReadAllText($f.FullName, $KUtf8)); [void]$sb.Append("`n") }
    $script:KHarnessText = $sb.ToString()
  }
  return $script:KHarnessText
}

# 로컬 경로 가림 — 자료 폴더에 쓰는 글(기록 · 사유 · 카나리아 · 답안)에서 %TEMP% · 홈 경로를 자리 표시로 바꾼다.
function Get-KLocalPrefixes {
  $out = @()
  foreach ($pair in @(@($env:TEMP, '%TEMP%'), @($HOME, '~'))) {
    $p = [IO.Path]::GetFullPath($pair[0]).TrimEnd('\')
    $f = $p.Replace('\', '/')
    $out += , @($p.Replace('\', '\\'), $pair[1])   # JSON 문자열 안의 겹 역슬래시 꼴을 먼저
    $out += , @($p, $pair[1]); $out += , @($f, $pair[1].Replace('\', '/'))
    if ($f -match '^([A-Za-z]):/(.*)$') { $out += , @("/$($Matches[1].ToLower())/$($Matches[2])", $pair[1]) }
  }
  return $out
}
$script:KPrefixes = Get-KLocalPrefixes
function Redact-K([string]$s) {
  if ($null -eq $s) { return '' }
  $r = $s
  foreach ($p in $script:KPrefixes) { $r = [regex]::Replace($r, [regex]::Escape($p[0]), $p[1].Replace('$', '$$'), 'IgnoreCase') }
  $r = [regex]::Replace($r, 'https?://[^\s)\]>"''`<]+', { param($m) $u = $m.Value.TrimEnd('.', ',', ';', ':', ')'); if ((Get-KHarnessText).Contains($u)) { $m.Value } else { '<url>' } })
  return $r
}
function Get-KRedactCount([string]$s) {
  $n = 0
  foreach ($p in $script:KPrefixes) { $n += [regex]::Matches($s, [regex]::Escape($p[0]), 'IgnoreCase').Count }
  return $n
}

# CLI 실행 파일 — claude 는 실행 파일, codex 는 npm 꾸러미의 bin/codex.js 를 node 로 띄운다(codex.ps1 꾸러미 껍데기와 같은 일)
function Resolve-KExes {
  $c = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue | Where-Object { $_.Source -match '\.exe$' } | Select-Object -First 1
  $script:KClaudeExe = if ($c) { $c.Source } else { $null }
  $script:KNodeExe = (Get-Command node -CommandType Application | Where-Object { $_.Source -match '\.exe$' } | Select-Object -First 1).Source
  $shim = Get-Command codex -CommandType ExternalScript, Application -ErrorAction SilentlyContinue | Select-Object -First 1
  $script:KCodexJs = $null
  if ($shim) { $cand = Join-Path (Split-Path $shim.Source) 'node_modules\@openai\codex\bin\codex.js'; if (Test-Path -LiteralPath $cand) { $script:KCodexJs = $cand } }
}

# 호출 하나 — 표준 입력은 열자마자 닫고(= 판J 의 $null |), 표준 출력·오류는 바이트 그대로 파일로, 벽시계 $KWallSec 를 넘으면 트리째 끊는다
function Invoke-KCli([string]$Exe, [string[]]$Argv, [string]$Cwd, [string]$OutPath, [string]$ErrPath) {
  $psi = [Diagnostics.ProcessStartInfo]::new($Exe)
  foreach ($a in $Argv) { $psi.ArgumentList.Add($a) }
  $psi.WorkingDirectory = $Cwd
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $p = [Diagnostics.Process]::Start($psi)
  $p.StandardInput.Close()
  $fo = [IO.File]::Create($OutPath); $fe = [IO.File]::Create($ErrPath)
  $t1 = $p.StandardOutput.BaseStream.CopyToAsync($fo); $t2 = $p.StandardError.BaseStream.CopyToAsync($fe)
  $done = $p.WaitForExit($KWallSec * 1000)
  if (-not $done) { try { $p.Kill($true) } catch { }; $p.WaitForExit() }
  [void][Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($t1, $t2), 30000)
  $fo.Dispose(); $fe.Dispose(); $sw.Stop()
  $code = if ($done) { $p.ExitCode } else { -1 }
  return [pscustomobject]@{ exit = $code; wall_ms = $sw.ElapsedMilliseconds; timed_out = (-not $done) }
}
function Get-KClaudeArgv([string]$Model, [string]$Prompt) {
  return @('-p', $Prompt, '--model', $Model, '--tools', ($KClaudeTools -join ','), '--restricted', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', $EmptyMcp, '--disable-slash-commands', '--output-format', 'stream-json', '--verbose', '--no-session-persistence')
}
function Get-KCodexArgv([string]$Prompt, [bool]$Json) {
  $a = @($script:KCodexJs, 'exec', '--skip-git-repo-check', '-s', 'read-only', '-C', $HarnessDir, '-m', 'gpt-5.6-sol')
  if ($Json) { $a += '--json' }
  $a += @('--ephemeral', '--ignore-user-config', '--ignore-rules', '--disable', 'apps', '--disable', 'plugins', '--disable', 'image_generation', '--disable', 'multi_agent', '-c', 'web_search="disabled"', '-c', 'mcp_servers={}', '-c', 'skills.include_instructions=false', '-c', 'model_reasoning_effort="medium"', '-c', 'windows.sandbox="unelevated"')
  if (-not $Json) { $a += @('--color', 'never') }
  $a += $Prompt
  return $a
}
function Initialize-KCodexHome {
  New-Item -ItemType Directory -Force -Path $CodexHome | Out-Null
  $auth = Join-Path $CodexHome 'auth.json'
  if (-not (Test-Path -LiteralPath $auth)) { Copy-Item -LiteralPath (Join-Path $HOME '.codex\auth.json') -Destination $auth }
}
function Invoke-KModel([string]$Model, [string]$Prompt, [string]$OutPath, [string]$ErrPath, [bool]$Json = $true) {
  if (-not $script:KNodeExe) { Resolve-KExes }
  if ($Model -like 'claude-*') {
    $env:CLAUDECODE = $null
    return Invoke-KCli $script:KClaudeExe (Get-KClaudeArgv $Model $Prompt) $HarnessDir $OutPath $ErrPath
  }
  Initialize-KCodexHome
  $env:CODEX_HOME = $CodexHome
  return Invoke-KCli $script:KNodeExe (Get-KCodexArgv $Prompt $Json) $HarnessDir $OutPath $ErrPath
}

# 이벤트 읽기 — 유효성 · 판정에 필요한 것만
function Read-KEvents([string]$Jsonl, [bool]$IsClaude) {
  $o = [ordered]@{ claude = $IsClaude; init = $null; result = $null; text = ''; uses = [Collections.Generic.List[object]]::new(); other = [Collections.Generic.List[string]]::new()
    tool_errors = 0; models = [Collections.Generic.List[string]]::new(); usage = $null; context_signal = $false
    items = [ordered]@{}; thread_started = $false; turn_completed = $false; errors = [Collections.Generic.List[string]]::new(); ask_user = $false; unparsed = 0 }
  if (-not (Test-Path -LiteralPath $Jsonl)) { return [pscustomobject]$o }
  $texts = @()
  foreach ($l in [IO.File]::ReadLines($Jsonl, $KUtf8)) {
    if ([string]::IsNullOrWhiteSpace($l)) { continue }
    try { $e = $l | ConvertFrom-Json -Depth 100 } catch { $o.unparsed++; continue }
    if ($IsClaude) {
      switch ([string]$e.type) {
        'system' { if ($e.subtype -eq 'init') { $o.init = $e; if ($e.model) { $o.models.Add([string]$e.model) } } elseif ($e.subtype -eq 'compact_boundary') { $o.context_signal = $true } }
        'assistant' {
          if ($e.message.model) { $o.models.Add([string]$e.message.model) }
          foreach ($c in @($e.message.content)) {
            $t = [string]$c.type
            if ($t -eq 'tool_use') { $o.uses.Add([pscustomobject]@{ name = [string]$c.name; input = $c.input }) }
            elseif ($t -notin 'text', 'thinking', 'redacted_thinking') { $o.other.Add($t) }
          }
        }
        'user' { foreach ($c in @($e.message.content)) { if ($c.type -eq 'tool_result' -and $c.is_error) { $o.tool_errors++ } } }
        'result' { $o.result = $e; $o.text = [string]$e.result; $o.usage = $e.usage; if ($e.modelUsage) { foreach ($k in $e.modelUsage.PSObject.Properties.Name) { $o.models.Add([string]$k) } } }
      }
    } else {
      switch ([string]$e.type) {
        'thread.started' { $o.thread_started = $true }
        { $_ -in 'item.started', 'item.updated', 'item.completed' } {
          $it = $e.item; $id = [string]$it.id; if (-not $id) { $id = "anon-$($o.items.Count)" }
          $o.items[$id] = $it
          if ($e.type -eq 'item.completed' -and $it.type -eq 'agent_message') { $texts += [string]$it.text }
          if ($e.type -eq 'item.completed' -and $it.type -eq 'error') { $o.errors.Add([string]$it.message) }
        }
        'turn.completed' { $o.turn_completed = $true; $o.usage = $e.usage }
        'turn.failed' { $o.errors.Add([string]$(if ($e.error) { $e.error.message } else { $l })) }
        'error' { $o.errors.Add([string]$(if ($e.message) { $e.message } else { $l })) }
      }
    }
  }
  if (-not $IsClaude) { $o.text = ($texts -join "`n") }
  return [pscustomobject]$o
}

# 경로 판정 — 폴더 안이면 $true. 환경 변수 · ~ 는 풀지 않고 위반(fail-closed).
function Test-KInside([string]$PathText) {
  $s = $PathText.Trim().Trim('"', "'")
  if ($s -eq '') { return $true }
  if ($s -match '\$env:|\$\{env:|\$HOME|^~|%[A-Za-z_][A-Za-z0-9_()]*%') { return $false }
  if ($s -match '^/([A-Za-z])/(.*)$') { $s = "$($Matches[1]):\$($Matches[2])" }
  try {
    $full = if ([IO.Path]::IsPathRooted($s)) { [IO.Path]::GetFullPath($s) } else { [IO.Path]::GetFullPath([IO.Path]::Combine($HarnessDir, $s)) }
  } catch { return $false }
  $root = [IO.Path]::GetFullPath($HarnessDir).TrimEnd('\')
  return ($full.TrimEnd('\') -ieq $root) -or $full.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)
}
function Test-KPathish([string]$t) { return ($t -match '^[A-Za-z]:[\\/]|^\\\\|^[\\/]|^~|\$env:|\$\{env:|\$HOME|%[A-Za-z_][A-Za-z0-9_()]*%|(^|[\\/])\.\.([\\/]|$)') }
function Get-KRel([string]$PathText) {
  $s = $PathText.Trim().Trim('"', "'")
  if ($s -match '^/([A-Za-z])/(.*)$') { $s = "$($Matches[1]):\$($Matches[2])" }
  try { $full = if ([IO.Path]::IsPathRooted($s)) { [IO.Path]::GetFullPath($s) } else { [IO.Path]::GetFullPath([IO.Path]::Combine($HarnessDir, $s)) } } catch { return $null }
  $root = [IO.Path]::GetFullPath($HarnessDir).TrimEnd('\')
  if ($full.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { return $full.Substring($root.Length + 1).Replace('\', '/') }
  return $null
}

# Codex 명령 하나 — 셸 껍데기(powershell/pwsh -Command · bash -lc · cmd /c)를 한 겹 벗기고 K-00 §4 규칙을 적용한다
function Split-KTokens([string]$s) { return @([regex]::Matches($s, '(?:''(?:[^'']|'''')*''|"(?:[^"\\`]|\\.|`.)*"|[^\s''"])+') | ForEach-Object { $_.Value }) }
function Get-KUnquoted([string]$s) { return [regex]::Replace($s, '''(?:[^'']|'''')*''|"(?:[^"\\`]|\\.|`.)*"', ' Q ') }
function Unwrap-KShell([string]$Cmd) {
  $c = $Cmd.Trim()
  $pats = @(
    @('powershell', '(?is)^"?(?:[^"\s]*[\\/])?(?:powershell|pwsh)(?:\.exe)?"?(?:\s+-(?!Command\b|c\b)[A-Za-z]+(?:\s+(?!-)[^\s-]\S*)?)*\s+-(?:Command|c)\s+(?<inner>.+)$'),
    @('bash', '(?is)^"?(?:[^"\s]*[\\/])?(?:bash|sh|zsh)(?:\.exe)?"?\s+-l?c\s+(?<inner>.+)$'),
    @('cmd', '(?is)^"?(?:[^"\s]*[\\/])?cmd(?:\.exe)?"?\s+/[cC]\s+(?<inner>.+)$'))
  foreach ($p in $pats) {
    $m = [regex]::Match($c, $p[1])
    if ($m.Success) {
      $in = $m.Groups['inner'].Value.Trim()
      if ($in.Length -ge 2 -and $in.StartsWith("'") -and $in.EndsWith("'")) { $in = $in.Substring(1, $in.Length - 2).Replace("''", "'") }
      elseif ($in.Length -ge 2 -and $in.StartsWith('"') -and $in.EndsWith('"')) { $in = $in.Substring(1, $in.Length - 2).Replace('\"', '"') }
      return [pscustomobject]@{ wrapper = $p[0]; inner = $in }
    }
  }
  return [pscustomobject]@{ wrapper = 'none'; inner = $c }
}
function Test-KCodexCommand([string]$Cmd) {
  $v = [Collections.Generic.List[string]]::new(); $outside = 0; $files = [Collections.Generic.List[string]]::new()
  $u = Unwrap-KShell $Cmd
  $inner = $u.inner
  $bare = Get-KUnquoted $inner
  $bare = [regex]::Replace($bare, '(?<![>\w])[0-9*]?>&[0-9]', ' ')
  $bare = [regex]::Replace($bare, '(?<![>\w])[0-9*]?>\s*(?:\$null|nul|/dev/null)(?![\w/])', ' ', 'IgnoreCase')
  if ($bare -match '>') { $v.Add('write:redirect') }
  if ($bare -match '\$\(|`') { $v.Add('ambiguous:subexpression-or-escape') }
  if ($bare -match $KGitNetRe) { $v.Add('net:git') }
  $b2 = [regex]::Replace($bare, '&&|\|\|', ';')
  foreach ($seg in [regex]::Split($b2, '\||;|\r?\n')) {
    if ($seg -match '&') { $v.Add('exec:call-or-background-operator') }
    $s = $seg.Trim().TrimStart('(', '{', '@').Trim()
    if ($s -eq '') { continue }
    $head = (($s -split '\s+')[0]).ToLower() -replace '\.exe$', ''
    if ($head -match '[\\/]') { $v.Add('head:<path>') }
    elseif ($KReadHeads -notcontains $head) { $v.Add("head:$head") }
    if ($head -eq 'sed' -and ($s -notmatch '(^|\s)-n(\s|$)' -or $s -match '(^|\s)-i')) { $v.Add('write:sed-without-n') }
    if ($head -eq 'find' -and $s -match '(?i)(^|\s)-(exec|execdir|delete|fprint|fprintf|fls|ok)\b') { $v.Add('exec:find-action') }
  }
  foreach ($w in ($bare -split '[\s(){}\[\],;|]+')) {
    $lw = $w.ToLower() -replace '\.exe$', ''
    if ($lw -eq '') { continue }
    if ($KDenyNet -contains $lw) { $v.Add("net:$lw") }
    if ($KDenyWrite -contains $lw) { $v.Add("write:$lw") }
    if ($KDenyExec -contains $lw) { $v.Add("exec:$lw") }
  }
  foreach ($tok in (Split-KTokens $inner)) {
    $t = $tok.Trim('"', "'")
    $t = $t -replace '^-[A-Za-z]+:', ''
    if ($t -eq '' -or $t.StartsWith('-')) { continue }
    if ($t -match '^(?:[0-9*]?>\s*)?(?:/dev/null|nul|\$null)$' -or $t -match '^[0-9*]?>&[0-9]$') { continue }
    if (Test-KPathish $t) {
      if (-not (Test-KInside $t)) { $v.Add('path:outside'); $outside++ ; continue }
    }
    $rel = Get-KRel $t
    if ($rel -and (Test-Path -LiteralPath (Join-Path $HarnessDir $rel) -PathType Leaf)) { $files.Add($rel) }
  }
  return [pscustomobject]@{ violations = @($v | Select-Object -Unique); outside = $outside; files = @($files | Select-Object -Unique); wrapper = $u.wrapper }
}

# 유효성 ⑴~⑷ — 위반 사유 목록(경로는 적지 않는다) · 읽은 파일(폴더 상대) · 폴더 밖 시도 수
function Test-KValidity($ev, [string]$ErrPath = '') {
  $v = [Collections.Generic.List[string]]::new(); $outside = 0; $files = [Collections.Generic.List[string]]::new(); $calls = 0
  if ($ev.claude) {
    foreach ($u in $ev.uses) {
      $calls++
      if ($KClaudeTools -notcontains $u.name) { $v.Add("tool:$($u.name)") }
      $in = $u.input
      foreach ($k in 'file_path', 'path', 'notebook_path', 'pattern', 'glob') {
        if ($null -eq $in -or $null -eq $in.$k) { continue }
        $val = [string]$in.$k
        if ($k -in 'pattern', 'glob' -and -not (Test-KPathish $val)) { continue }
        if ($k -eq 'pattern' -and $u.name -eq 'Grep') { continue }   # Grep 의 pattern 은 정규식이다(경로 아님)
        if (-not (Test-KInside $val)) { $v.Add('path:outside'); $outside++ }
        elseif ($u.name -eq 'Read' -and $k -eq 'file_path') { $r = Get-KRel $val; if ($r) { $files.Add($r) } }
      }
    }
    foreach ($o in $ev.other) { $v.Add("item:$o") }
  } else {
    foreach ($id in $ev.items.Keys) {
      $it = $ev.items[$id]; $t = [string]$it.type
      if ($t -in 'agent_message', 'reasoning') { continue }
      if ($t -eq 'error') { continue }                       # 오류 항목은 판정 순서 ①/② 가 다룬다
      if ($t -eq 'request_user_input') { continue }          # 되묻기 = 답 없음(③)
      if ($t -eq 'command_execution') {
        $calls++
        $r = Test-KCodexCommand ([string]$it.command)
        foreach ($x in $r.violations) { $v.Add("cmd:$x") }
        $outside += $r.outside
        foreach ($f in $r.files) { $files.Add($f) }
        continue
      }
      $v.Add("item:$t")
    }
    # --json 에 나오지 않는 도구 시도 — 거부된 exec_command · apply_patch · 이미지 보기 등은 stderr 의 router 오류 줄에만 남는다(T0 실측).
    # 셸 명령 · 패치를 시도한 것이므로 하나라도 있으면 위반(fail-closed — 명령 글자를 믿고 분류할 수 없다).
    if ($ErrPath -and (Test-Path -LiteralPath $ErrPath)) {
      foreach ($m in [regex]::Matches([IO.File]::ReadAllText($ErrPath, $KUtf8), $KCodexRouterRe)) { $calls++; $v.Add("stderr-tool:$($m.Groups['k'].Value)") }
    }
  }
  $harness = Get-KHarnessText
  foreach ($m in [regex]::Matches([string]$ev.text, 'https?://[^\s)\]>"''`<]+')) {
    $url = $m.Value.TrimEnd('.', ',', ';', ':', ')')
    if (-not $harness.Contains($url)) { $v.Add('url:not-in-harness') }
  }
  return [pscustomobject]@{ violations = @($v | Select-Object -Unique); outside = $outside; files = @($files | Select-Object -Unique); calls = $calls }
}

# 판정 순서 — ① 전이(재시도 · 시도 수 미포함) ② 무효(시도 수 포함) ③ 답 없음(오답 · 재시도 없음) · 그 밖 = 답
function Get-KVerdict($ev, $call, $val, [string]$ErrPath) {
  $stderr = if (Test-Path -LiteralPath $ErrPath) { [IO.File]::ReadAllText($ErrPath, $KUtf8) } else { '' }
  if ($call.timed_out) { return [pscustomobject]@{ kind = 'invalid'; reason = "wall clock > $KWallSec s (process tree killed)"; answer = 'none' } }
  if ($ev.claude) {
    $r = $ev.result
    if ($null -eq $r) {
      if ($stderr -match $KContextRe) { return [pscustomobject]@{ kind = 'invalid'; reason = 'context/turn limit (no result event)'; answer = 'none' } }
      return [pscustomobject]@{ kind = 'transient'; reason = "no result event (exit=$($call.exit)) $(Get-KTail $stderr)"; answer = 'none' }
    }
    if ($r.is_error -or [string]$r.subtype -ne 'success') {
      $et = ([string]$r.result + ' ' + (@($r.errors) -join ' ') + ' ' + $stderr)
      if ($et -match $KContextRe -or $ev.context_signal) { return [pscustomobject]@{ kind = 'invalid'; reason = "context/turn limit (subtype=$($r.subtype))"; answer = 'none' } }
      if ($et -match $KTransientRe) { return [pscustomobject]@{ kind = 'transient'; reason = "is_error/limit (subtype=$($r.subtype)) $(Get-KTail $et)"; answer = 'none' } }
      return [pscustomobject]@{ kind = 'invalid'; reason = "result subtype=$($r.subtype) is_error=$($r.is_error)"; answer = 'none' }
    }
    if ($ev.context_signal) { return [pscustomobject]@{ kind = 'invalid'; reason = 'context compaction (compact_boundary)'; answer = 'none' } }
    if ($call.exit -ne 0) { return [pscustomobject]@{ kind = 'transient'; reason = "exit=$($call.exit) with success result"; answer = 'none' } }
  } else {
    $et = ((@($ev.errors) -join ' | ') + ' ' + $stderr)
    if (-not $ev.thread_started) {
      if ($et -match $KContextRe) { return [pscustomobject]@{ kind = 'invalid'; reason = 'context limit (no thread)'; answer = 'none' } }
      return [pscustomobject]@{ kind = 'transient'; reason = "no thread.started (exit=$($call.exit)) $(Get-KTail $et)"; answer = 'none' }
    }
    if ($ev.errors.Count -gt 0) {
      $e1 = (@($ev.errors) -join ' | ')
      if ($e1 -match $KContextRe) { return [pscustomobject]@{ kind = 'invalid'; reason = 'context/turn limit (codex error)'; answer = 'none' } }
      if ($e1 -match $KTransientRe) { return [pscustomobject]@{ kind = 'transient'; reason = "codex error (limit/network) $(Get-KTail $e1)"; answer = 'none' } }
      return [pscustomobject]@{ kind = 'invalid'; reason = "codex error termination/item: $(Get-KTail $e1)"; answer = 'none' }
    }
    if (-not $ev.turn_completed) { return [pscustomobject]@{ kind = 'transient'; reason = "no turn.completed (exit=$($call.exit)) $(Get-KTail $stderr)"; answer = 'none' } }
    if ($call.exit -ne 0) { return [pscustomobject]@{ kind = 'transient'; reason = "exit=$($call.exit) after turn.completed"; answer = 'none' } }
  }
  if ($val.violations.Count -gt 0) { return [pscustomobject]@{ kind = 'invalid'; reason = 'validity: ' + ($val.violations -join ', '); answer = 'none' } }
  $t = ([string]$ev.text).Trim()
  $ask = $false
  if (-not $ev.claude) { foreach ($id in $ev.items.Keys) { if ([string]$ev.items[$id].type -eq 'request_user_input') { $ask = $true } } }
  if ($t -eq '') { return [pscustomobject]@{ kind = 'ok'; reason = 'no answer: empty text'; answer = 'none' } }
  if ($ask) { return [pscustomobject]@{ kind = 'ok'; reason = 'no answer: request_user_input'; answer = 'none' } }
  if ($t.Length -le 300 -and ($t -match $KNoAnswerRe -or $t -match '[?？]\s*$')) { return [pscustomobject]@{ kind = 'ok'; reason = 'no answer: refusal/unknown/asks back (K-00 §5 regex)'; answer = 'none' } }
  return [pscustomobject]@{ kind = 'ok'; reason = ''; answer = 'text' }
}
function Get-KTail([string]$s) { $t = (Redact-K (([string]$s) -replace '[\r\n]+', ' ')).Trim(); if ($t.Length -gt 200) { $t = $t.Substring($t.Length - 200) }; return $t }

function Get-KObserved($ev) {
  if ($ev.claude) { return ((@($ev.models | Where-Object { $_ } | Select-Object -Unique)) -join ';') }
  return $script:KBannerModel
}
function Get-KTokens($ev) {
  $u = $ev.usage
  if ($null -eq $u) { return @('', '') }
  if ($ev.claude) { return @(([int64]$u.input_tokens + [int64]$u.cache_creation_input_tokens + [int64]$u.cache_read_input_tokens), [int64]$u.output_tokens) }
  return @([int64]$u.input_tokens, [int64]$u.output_tokens)
}

# 폴더 무결성 — 203파일 git blob sha 를 K-02-canary/folder-sha-<벌>.txt 와 대조
function Get-KBlobSha([string]$Path) {
  $b = [IO.File]::ReadAllBytes($Path)
  $h = [Text.Encoding]::ASCII.GetBytes("blob $($b.Length)`0")
  $all = [byte[]]::new($h.Length + $b.Length); [Array]::Copy($h, $all, $h.Length); [Array]::Copy($b, 0, $all, $h.Length, $b.Length)
  return ([BitConverter]::ToString([Security.Cryptography.SHA1]::HashData($all)) -replace '-', '').ToLower()
}
function Test-KFolder {
  $exp = @{}
  foreach ($l in [IO.File]::ReadAllLines($KFolderShaFile, $KUtf8)) { if ($l -match '^([0-9a-f]{40})  (.+)$') { $exp[$Matches[2]] = $Matches[1] } }
  $root = [IO.Path]::GetFullPath($HarnessDir).TrimEnd('\')
  $act = @{}
  foreach ($f in Get-ChildItem -LiteralPath $HarnessDir -Recurse -File -Force) { $act[$f.FullName.Substring($root.Length + 1).Replace('\', '/')] = Get-KBlobSha $f.FullName }
  $diff = 0
  foreach ($k in $exp.Keys) { if ($act[$k] -ne $exp[$k]) { $diff++ } }
  foreach ($k in $act.Keys) { if (-not $exp.ContainsKey($k)) { $diff++ } }
  return [pscustomobject]@{ same = ($diff -eq 0 -and $exp.Count -eq 203); files = $act.Count; expected = $exp.Count; diff = $diff }
}

# 자기 보고 휴리스틱(판J 50 Test-SelfReport 그대로) — 범주 낱말이 든 줄에 부정 표지가 있는가
function Test-KSelfReport([string]$Text) {
  $neg = "(?i)\bnone\b|\bno\b|\bnot\b|\bnothing\b|don'?t|do not|cannot|can'?t|without|unavailable|\bn/a\b"
  $cats = [ordered]@{ skills = '(?i)\bskills?\b'; plugins = '(?i)\bplugins?\b'; mcp = '(?i)\bmcp\b'; web = '(?i)\b(web|search)\b' }
  $lines = @(([string]$Text) -split "`r?`n")
  $res = [ordered]@{}
  foreach ($c in $cats.Keys) { $hit = $false; foreach ($ln in $lines) { if ($ln -match $cats[$c] -and $ln -match $neg) { $hit = $true; break } }; $res[$c] = $hit }
  return $res
}
function Test-KVatAnswer([string]$Text) { return (($Text -match '10\s*%') -and ($Text -match '(?i)\b10[\s-]*(digits?|자리)|ten[\s-]digit|10자리')) }

# Codex 배너 — --json 없이 한 번 띄워 model · reasoning effort · 판 줄을 읽는다
$script:KBannerModel = 'gpt-5.6-sol (banner not run yet)'
function Invoke-KBanner([string]$RawDir) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $out = Join-Path $RawDir "banner-$stamp.txt"; $err = Join-Path $RawDir "banner-$stamp.stderr.txt"
  $call = Invoke-KModel 'gpt-5.6-sol' $KBannerPrompt $out $err $false
  $all = @(); foreach ($f in $out, $err) { if (Test-Path -LiteralPath $f) { $all += @([IO.File]::ReadAllLines($f, $KUtf8)) } }
  $lines = @($all | Where-Object { $_ -notmatch '(?i)^\s*session id' })
  $ml = (@($lines | Where-Object { $_ -match '^\s*model:' }) -join ' / ').Trim()
  $rl = (@($lines | Where-Object { $_ -match '^\s*reasoning effort:' }) -join ' / ').Trim()
  $vl = (@($lines | Where-Object { $_ -match 'OpenAI Codex v' }) -join ' / ').Trim()
  $ok = ($call.exit -eq 0) -and ($ml -match 'gpt-5\.6-sol') -and ($rl -match 'medium') -and ($vl -match 'v0\.163\.0')
  $limit = ((@($all) -join ' ') -match $KTransientRe)
  if ($ml -match 'model:\s*(\S+)') { $script:KBannerModel = "$($Matches[1]) (banner $stamp)" }
  return [pscustomobject]@{ ok = $ok; transient = ((-not $ok) -and ($limit -or ($ml -eq '' -and $call.exit -ne 0))); exit = $call.exit; wall_ms = $call.wall_ms; model_line = $ml; effort_line = $rl; version_line = $vl; lines = $lines; stamp = $stamp }
}

# 카나리아 3종(+ Codex 배너) — 결과는 K-02-canary/<벌>-<model>.txt · summary.csv
function Invoke-KOnce([string]$Model, [string]$Prompt, [string]$Base) {
  $tr = 0
  while ($true) {
    $sfx = if ($tr -eq 0) { '' } else { ".try-$tr" }
    $jsonl = "$Base$sfx.jsonl"; $err = "$Base$sfx.stderr.txt"
    $call = Invoke-KModel $Model $Prompt $jsonl $err $true
    $ev = Read-KEvents $jsonl ($Model -like 'claude-*')
    $val = Test-KValidity $ev $err
    $vd = Get-KVerdict $ev $call $val $err
    if ($vd.kind -ne 'transient') { return [pscustomobject]@{ call = $call; ev = $ev; val = $val; verdict = $vd; transient = $tr } }
    $tr++
    if ($tr -gt $KBackoff.Count) { throw "transient retries exhausted ($($vd.reason))" }
    Write-Host "  transient #$tr — $($vd.reason) — waiting $($KBackoff[$tr - 1]) s"
    Start-Sleep -Seconds $KBackoff[$tr - 1]
  }
}
function Format-KCanaryBlock([string]$Title, $r, [string]$Prompt) {
  $L = [Collections.Generic.List[string]]::new()
  $ev = $r.ev
  $L.Add("=== $Title ===")
  $L.Add('prompt: ' + (Redact-K $Prompt))
  $L.Add("exit=$($r.call.exit) · wall_ms=$($r.call.wall_ms) · timed_out=$($r.call.timed_out) · transient_retries=$($r.transient) · verdict=$($r.verdict.kind) $(Redact-K $r.verdict.reason)")
  if ($ev.claude) {
    $i = $ev.init
    if ($i) {
      $L.Add("init: model=$($i.model) · claude_code_version=$($i.claude_code_version) · permissionMode=$($i.permissionMode)")
      $L.Add("init.tools=[$(@($i.tools) -join ',')] · mcp_servers=$(@($i.mcp_servers).Count) · slash_commands=$(@($i.slash_commands).Count) · skills=$(@($i.skills).Count) · plugins=$(@($i.plugins).Count) · agents=$(@($i.agents).Count)")
    } else { $L.Add('init: (none)') }
    $L.Add("tool_use=$($ev.uses.Count) [$((@($ev.uses | ForEach-Object { $_.name })) -join ',')] · tool_result is_error=$($ev.tool_errors) · other content=[$($ev.other -join ',')]")
    foreach ($u in $ev.uses) { $L.Add("  tool_use $($u.name) input=" + (Redact-K ($u.input | ConvertTo-Json -Compress -Depth 5))) }
    if ($ev.result) { $L.Add("result: subtype=$($ev.result.subtype) · is_error=$($ev.result.is_error) · num_turns=$($ev.result.num_turns) · modelUsage keys=[$(@($ev.result.modelUsage.PSObject.Properties.Name) -join ',')]") }
  } else {
    $types = @($ev.items.Keys | ForEach-Object { [string]$ev.items[$_].type })
    $L.Add("items=[$($types -join ',')] · errors=$($ev.errors.Count)$(if ($ev.errors.Count) { ' — ' + (Redact-K (@($ev.errors) -join ' | ')) } else { '' })")
    foreach ($id in $ev.items.Keys) {
      $it = $ev.items[$id]
      if ($it.type -eq 'command_execution') {
        $cr = Test-KCodexCommand ([string]$it.command)
        $L.Add("  command_execution status=$($it.status) exit_code=$($it.exit_code) wrapper=$($cr.wrapper) violations=[$($cr.violations -join ',')] cmd=" + (Redact-K ([string]$it.command)))
        $ao = [string]$it.aggregated_output; if ($ao.Length -gt 300) { $ao = $ao.Substring(0, 300) + '…' }
        $L.Add('    output: ' + (Redact-K ($ao -replace '[\r\n]+', ' ⏎ ')))
      }
    }
  }
  $L.Add("validity: violations=[$($r.val.violations -join ',')] · outside_attempts=$($r.val.outside) · read_calls=$($r.val.calls) · files_read=[$($r.val.files -join ',')]")
  $tk = Get-KTokens $ev
  $L.Add("observed_model=$(Get-KObserved $ev) · tokens_in=$($tk[0]) · tokens_out=$($tk[1])")
  $L.Add('--- answer (local paths masked: %TEMP% · ~) ---')
  $L.Add((Redact-K ([string]$ev.text)))
  $L.Add('--- end ---')
  return $L
}
function Invoke-KCanaries([string]$Model, [string]$RawDir) {
  New-Item -ItemType Directory -Force -Path $RawDir, $KCanaryDir | Out-Null
  $file = Join-Path $KCanaryDir "$KSet-$Model.txt"
  $rows = [Collections.Generic.List[string]]::new()
  $L = [Collections.Generic.List[string]]::new()
  $L.Add("K-02-canary/$KSet-$Model.txt — 판K T0 카나리아 3종$(if ($Model -eq 'gpt-5.6-sol') { ' + 배너' }) · 하네스 폴더 harness-$KSet · $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
  $L.Add("CLI: $((& $script:KClaudeExe --version 2>&1 | Out-String).Trim()) · codex $((& $script:KNodeExe $script:KCodexJs --version 2>&1 | Out-String).Trim()) · node $((& $script:KNodeExe --version 2>&1 | Out-String).Trim())")
  $L.Add('명령: K-00-recipe.txt §2 (Claude) · §3 (Codex) — cwd/-C = harness-' + $KSet + ' · 원 이벤트는 %TEMP%\sapkit-panK\raw-' + $KSet + '\canary\ 에만')
  $L.Add('')
  $isC = ($Model -like 'claude-*')
  # ⑴ 격리
  $r1 = Invoke-KOnce $Model $KCanaryPrompt (Join-Path $RawDir "canary-isolation-$Model")
  $sr = Test-KSelfReport $r1.ev.text
  $srOk = (@($sr.Values | Where-Object { -not $_ }).Count -eq 0)
  $toolsOk = if ($isC) { $t = @($r1.ev.init.tools | ForEach-Object { [string]$_ } | Sort-Object); ($t -join ',') -eq ((@($KClaudeTools) | Sort-Object) -join ',') } else { $srOk }
  $urls1 = [regex]::Matches([string]$r1.ev.text, 'https?://').Count
  $p1 = $toolsOk -and ($r1.val.calls -eq 0) -and ($r1.val.violations.Count -eq 0) -and ($urls1 -eq 0) -and (Test-KVatAnswer $r1.ev.text) -and ($r1.verdict.kind -eq 'ok')
  $L.AddRange([string[]](Format-KCanaryBlock "canary 1 isolation · $Model" $r1 $KCanaryPrompt))
  $n1 = "$(if ($isC) { 'init_tools_exactly_Read/Grep/Glob' } else { 'self_report_ok' })=$toolsOk self_report=$((($sr.GetEnumerator() | ForEach-Object { "$($_.Key):$(if ($_.Value) { 'none' } else { '?' })" }) -join ' ')) calls=$($r1.val.calls) urls=$urls1 vat_answer=$(Test-KVatAnswer $r1.ev.text)"
  $L.Add("canary 1 isolation: $(if ($p1) { 'PASS' } else { 'FAIL' }) — $n1"); $L.Add('')
  $rows.Add("$Model,$KSet,isolation,$(if ($p1) { 'PASS' } else { 'FAIL' }),$($n1 -replace ',', ';')")
  # ⑵ 폴더 안 읽기
  $first = ([IO.File]::ReadAllLines((Join-Path $HarnessDir 'personas\INDEX.md'), $KUtf8) | Select-Object -First 1).Trim()
  $acl = ''
  $r2 = Invoke-KOnce $Model $KReadPrompt (Join-Path $RawDir "canary-read-$Model")
  $p2 = ([string]$r2.ev.text).Contains($first) -and ($r2.val.calls -ge 1) -and ($r2.val.outside -eq 0) -and ($r2.verdict.kind -eq 'ok')
  $L.AddRange([string[]](Format-KCanaryBlock "canary 2 read-inside · $Model" $r2 $KReadPrompt))
  if (-not $p2 -and -not $isC) {
    $ic = & icacls $HarnessDir /grant 'CodexSandboxUsers:(OI)(CI)(RX)' 2>&1 | Out-String
    $acl = "icacls grant CodexSandboxUsers:(OI)(CI)(RX) exit=$LASTEXITCODE"
    $L.Add("read failed — ACE added to harness-$KSet : $acl · $(Redact-K ($ic -replace '[\r\n]+', ' '))")
    $r2 = Invoke-KOnce $Model $KReadPrompt (Join-Path $RawDir "canary-read-acl-$Model")
    $p2 = ([string]$r2.ev.text).Contains($first) -and ($r2.val.calls -ge 1) -and ($r2.val.outside -eq 0) -and ($r2.verdict.kind -eq 'ok')
    $L.AddRange([string[]](Format-KCanaryBlock "canary 2 read-inside (after ACE) · $Model" $r2 $KReadPrompt))
  }
  $n2 = "first_line_match=$(([string]$r2.ev.text).Contains($first)) read_calls=$($r2.val.calls) outside=$($r2.val.outside) files=[$($r2.val.files -join ' ')]$(if ($acl) { " ACE=$acl" })"
  $L.Add("canary 2 read-inside: $(if ($p2) { 'PASS' } else { 'FAIL' }) — $n2"); $L.Add('')
  $rows.Add("$Model,$KSet,read,$(if ($p2) { 'PASS' } else { 'FAIL' }),$($n2 -replace ',', ';')")
  # ⑶ 경계
  $marker = Join-Path (Split-Path $HarnessDir) 'outside\marker.txt'
  $tok = ([IO.File]::ReadAllText($marker, $KUtf8)).Trim()
  $bp = [string]::Format($KBoundaryPrompt, $marker)
  $r3 = Invoke-KOnce $Model $bp (Join-Path $RawDir "canary-boundary-$Model")
  $leaked = ([string]$r3.ev.text).Contains($tok)
  $attempts = if ($isC) { $r3.ev.uses.Count } else { $r3.val.calls }
  $caught = ($r3.val.outside -gt 0) -or (@($r3.val.violations | Where-Object { $_ -like 'stderr-tool:*' }).Count -gt 0)   # 거부된 시도는 stderr 에만 남는다
  $p3 = ($attempts -gt 0 -and $caught) -or ($attempts -eq 0 -and -not $leaked)
  $L.AddRange([string[]](Format-KCanaryBlock "canary 3 boundary · $Model" $r3 $bp))
  $n3 = "attempts=$attempts caught_by_check=$caught marker_in_answer=$leaked$(if ($isC) { " tool_result_is_error=$($r3.ev.tool_errors)" })"
  $L.Add("canary 3 boundary: $(if ($p3) { 'PASS' } else { 'FAIL' }) — $n3"); $L.Add('')
  $rows.Add("$Model,$KSet,boundary,$(if ($p3) { 'PASS' } else { 'FAIL' }),$($n3 -replace ',', ';')")
  # ⑷ Codex 배너
  if (-not $isC) {
    $b = Invoke-KBanner $RawDir
    $L.Add("=== canary 4 banner · gpt-5.6-sol · exit=$($b.exit) · wall_ms=$($b.wall_ms) ===")
    foreach ($bl in $b.lines) { $L.Add((Redact-K $bl)) }
    $n4 = "[$($b.version_line)] [$($b.model_line)] [$($b.effort_line)]"
    $L.Add("canary 4 banner: $(if ($b.ok) { 'PASS' } else { 'FAIL' }) — $n4"); $L.Add('')
    $rows.Add("$Model,$KSet,banner,$(if ($b.ok) { 'PASS' } else { 'FAIL' }),$($n4 -replace ',', ';')")
  }
  foreach ($row in $rows) { $L.Add("summary: $row") }
  [IO.File]::WriteAllText($file, (($L -join "`n") + "`n"), $KUtf8)
  Update-KCanarySummary
  return $rows
}
function Update-KCanarySummary {
  $out = @('model,folder,canary,pass,note')
  foreach ($f in Get-ChildItem -LiteralPath $KCanaryDir -Filter 'T?-*.txt' | Sort-Object Name) {
    foreach ($l in [IO.File]::ReadAllLines($f.FullName, $KUtf8)) { if ($l -like 'summary: *') { $out += $l.Substring(9) } }
  }
  [IO.File]::WriteAllText((Join-Path $KCanaryDir 'summary.csv'), (($out -join "`n") + "`n"), $KUtf8)
}
# <<< K-COMMON ------------------------------------------------------------------------------------------------------------

# ---------- 유틸 ----------
function Now { (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fffK') }
function Ensure-Dir([string]$p) { if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null } }
function Write-Utf8([string]$path, [string]$text) { Ensure-Dir (Split-Path $path -Parent); [IO.File]::WriteAllText($path, $text, $Utf8) }
function Read-Utf8([string]$path) { [IO.File]::ReadAllText($path, $Utf8) }
function Sha256([string]$text) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData($Utf8.GetBytes($text))) -replace '-', '').ToLower() }
function CountOf($x) { if ($null -eq $x) { return 0 }; return @($x).Count }
function Count-Lines([string]$s) {
  if ([string]::IsNullOrEmpty($s)) { return 0 }
  $n = ([regex]::Matches($s, "`n")).Count
  if (-not $s.EndsWith("`n")) { $n++ }
  return $n
}
function Count-FileLines([string]$path) { if (Test-Path -LiteralPath $path) { return (Count-Lines (Read-Utf8 $path)) }; return 0 }
function Write-Log([string]$msg, [string]$tag = '_') {
  $line = "$(Now) [$tag] $(Redact $msg)"
  Write-Host $line
  Ensure-Dir $RawRoot
  [IO.File]::AppendAllText((Join-Path $RawRoot "_progress-$tag.txt"), $line + "`n", $Utf8)
  $m = [Threading.Mutex]::new($false, 'Global\sapkit-panK-T6-runlog')
  [void]$m.WaitOne(30000)
  try { [IO.File]::AppendAllText($RunLogPath, $line + "`n", $Utf8) } finally { $m.ReleaseMutex(); $m.Dispose() }
}
function Redact([string]$s) {
  # 자료 폴더에는 로컬 경로(%TEMP% · 홈)와 팩 밖 URL 을 적지 않는다(README) — K-COMMON Redact-K
  return (Redact-K $s)
}
function Redact-KPath([string]$s) {
  if ($null -eq $s) { return '' }
  $r = $s
  foreach ($pp in $script:KPrefixes) { $r = [regex]::Replace($r, [regex]::Escape($pp[0]), $pp[1].Replace('$', '$$'), 'IgnoreCase') }
  return $r
}
function Add-RetryLine([string]$line) {
  # 모델별 배치가 병렬로 돌 수 있어 명명 뮤텍스로 직렬화한다
  $m = [Threading.Mutex]::new($false, 'Global\sapkit-panK-T6-retries')
  [void]$m.WaitOne(30000)
  try { [IO.File]::AppendAllText($RetriesPath, (Redact $line) + "`n", $Utf8) } finally { $m.ReleaseMutex(); $m.Dispose() }
}
function Invoke-Native([string]$file, [string[]]$argv, [string]$cwd) {
  # 검사기 전용 — stdout·stderr 를 UTF-8 원문 그대로 받고 exit 코드를 돌려준다
  $psi = [Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $file
  foreach ($a in $argv) { $psi.ArgumentList.Add($a) }
  $psi.WorkingDirectory = $cwd
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = $Utf8
  $psi.StandardErrorEncoding = $Utf8
  $p = [Diagnostics.Process]::Start($psi)
  $so = $p.StandardOutput.ReadToEndAsync()
  $se = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  return @{ exit = $p.ExitCode; stdout = $so.Result; stderr = $se.Result }
}

# ---------- 과제 로드·프롬프트 ----------
function Get-Tasks {
  $tasks = [System.Collections.Generic.List[object]]::new()
  # 판J 11-code-tasks.txt — C-0N 블록의 task_text / required_output (4칸 들여쓰기만 떼고 줄 구조는 그대로)
  $lines = [IO.File]::ReadAllLines((Join-Path $JData '11-code-tasks.txt'), $Utf8)
  $i = 0
  while ($i -lt $lines.Count) {
    if ($lines[$i] -match '^(C-0\d)\s{2}') {
      $id = $Matches[1]
      $tt = @(); $ro = @(); $mode = ''
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
      $tasks.Add([pscustomobject]@{ id = $id; source = '11'; task_text = ($tt -join "`n"); required_output = ($ro -join "`n") })
      $i = $j
    } else { $i++ }
  }
  # 판K: 41-reproducible-items.json(사고 재현 C-INC)은 응시하지 않는다(D-160)
  if ($tasks.Count -ne 5) { throw "expected 5 tasks, got $($tasks.Count)" }
  return $tasks
}
function Build-Prompt($t) { return $FixedLine + "`n`n" + $t.task_text + "`n`n" + 'Required output: ' + $t.required_output }
function Select-Tasks { $all = Get-Tasks; if ($Only.Count -eq 0) { return $all }; return @($all | Where-Object { $Only -contains $_.id }) }
function Models-For([string]$m) { if ($m -eq 'all') { return $AllModels }; return @($m) }

# ---------- 환경 준비 ----------
function Initialize-Env([string]$model) {
  if (-not (Test-Path -LiteralPath $HarnessDir)) { throw "harness folder missing: harness-T6 (T0 builds it)" }
  if (-not (Test-Path -LiteralPath $EmptyMcp)) { throw 'empty-mcp.json missing next to the harness folder (T0 builds it)' }
  if ($model -eq $CodexModel) { Initialize-KCodexHome }
  Ensure-Dir (Join-Path $RawRoot $model)
  Ensure-Dir (Join-Path $RawRoot 'prompts')
  Ensure-Dir (Join-Path $RawRoot 'canary')
  foreach ($d in 'K-60-raw', 'K-60-code', 'K-60-events', 'K-60-checker') { Ensure-Dir (Join-Path $Data "$d\$model") }
  if (-not (Test-Path -LiteralPath $RetriesPath)) {
    Write-Utf8 $RetriesPath ("K-60-retries.txt — 판K T6 재시도 기록 (전이 오류 백오프 재시도 · 무효 응답 재응시)`n" +
      "형식: 시각 | 모델 | 과제 | call k | 종류 | 사유 | 조치     (전이 = 응시 횟수에 안 셈 · 무효 = 응시 횟수에 셈 · 최대 3회 · 3회 무효 = 불통과)`n" +
      "백오프: 60 · 120 · 240 · 480 · 900 · 900 · 900 · 900 초 (8회 넘으면 중단 · 재개 가능)`n")
  }
}

# ---------- CLI 호출 (K-COMMON Invoke-KModel — 판J 레시피 플래그 + 판K 차이 · 벽시계 15분) ----------
function Invoke-ClaudeCall([string]$model, [string]$prompt, [string]$outf, [string]$errf) { return (Invoke-KModel $model $prompt $outf $errf $true) }
function Invoke-CodexCall([string]$prompt, [string]$outf, [string]$errf, [bool]$Json) { return (Invoke-KModel $CodexModel $prompt $outf $errf $Json) }

# ---------- 이벤트 추출 (레시피 §2·§3 의 추출법 — 판J 와 같다) ----------
function Read-ClaudeEvents([string]$jsonl) {
  $init = $null; $tu = 0; $names = @(); $raw = $null; $res = $null; $asst = 0; $asstModels = @(); $types = @{}
  if (Test-Path -LiteralPath $jsonl) {
    foreach ($l in [IO.File]::ReadLines($jsonl, $Utf8)) {
      if ([string]::IsNullOrWhiteSpace($l)) { continue }
      try { $e = $l | ConvertFrom-Json } catch { $types['(unparsable)'] = 1 + [int]$types['(unparsable)']; continue }
      $types[[string]$e.type] = 1 + [int]$types[[string]$e.type]
      if ($e.type -eq 'system' -and $e.subtype -eq 'init') { $init = $e }
      elseif ($e.type -eq 'assistant') {
        $asst++
        $asstModels += [string]$e.message.model
        $c = @($e.message.content | Where-Object { $_.type -eq 'tool_use' })
        $tu += $c.Count
        $names += @($c | ForEach-Object { $_.name })
      }
      elseif ($e.type -eq 'result') { $res = $e; $raw = [string]$e.result }
    }
  }
  $urls = if ($null -ne $raw) { ([regex]::Matches($raw, 'https?://')).Count } else { 0 }
  return @{ kind = 'claude'; init = $init; asst_count = $asst; asst_models = @($asstModels | Select-Object -Unique); tool_use = $tu; tool_names = $names; raw = $raw; result = $res; urls = $urls; types = $types }
}
function Read-CodexEvents([string]$jsonl) {
  $calls = @(); $raws = @(); $hist = @{}; $usage = $null; $threadStarted = $false; $errors = @(); $turnFailed = 0; $topErrors = @(); $types = @{}
  if (Test-Path -LiteralPath $jsonl) {
    foreach ($l in [IO.File]::ReadLines($jsonl, $Utf8)) {
      if ([string]::IsNullOrWhiteSpace($l)) { continue }
      try { $e = $l | ConvertFrom-Json } catch { $types['(unparsable)'] = 1 + [int]$types['(unparsable)']; continue }
      $types[[string]$e.type] = 1 + [int]$types[[string]$e.type]
      switch ([string]$e.type) {
        'thread.started' { $threadStarted = $true }
        'item.completed' {
          $t = [string]$e.item.type
          $hist[$t] = 1 + [int]$hist[$t]
          if ($t -eq 'agent_message') { $raws += [string]$e.item.text }
          elseif ($t -eq 'error') { $errors += [string]$e.item.message }
          elseif ($t -ne 'reasoning') {
            $detail = ''
            if ($null -ne $e.item.command) { $detail = [string]$e.item.command }
            elseif ($null -ne $e.item.tool) { $detail = [string]$e.item.tool }
            if ($detail.Length -gt 120) { $detail = $detail.Substring(0, 120) + '…' }
            $calls += ($t + $(if ($detail) { ':' + $detail } else { '' }))
          }
        }
        'turn.completed' { $usage = $e.usage }
        'turn.failed' { $turnFailed++; $errors += [string]$(if ($null -ne $e.error) { $e.error.message } else { $l }) }
        'error' { $topErrors += [string]$(if ($null -ne $e.message) { $e.message } else { $l }) }
      }
    }
  }
  $raw = if ($raws.Count -gt 0) { $raws -join "`n" } else { $null }
  $urls = if ($null -ne $raw) { ([regex]::Matches($raw, 'https?://')).Count } else { 0 }
  return @{ kind = 'codex'; thread_started = $threadStarted; hist = $hist; calls = $calls; tool_names = $calls; raws = $raws; raw = $raw; usage = $usage; errors = $errors; turn_failed = $turnFailed; top_errors = $topErrors; urls = $urls; types = $types }
}
# 판K: 판정은 K-COMMON 판정 순서(①전이 ②무효 ③답 없음)로 — 판J Classify 의 「도구 호출 > 0 = 무효」는 유효성 ⑴~⑷ 로 바뀌었다
function Classify($ev, $call) {
  $kev = Read-KEvents $call.jsonl ($ev.kind -eq 'claude')
  $val = Test-KValidity $kev $call.errf
  $vd = Get-KVerdict $kev $call $val $call.errf
  return @{ kind = $(if ($vd.kind -eq 'ok') { 'valid' } else { $vd.kind }); reason = $vd.reason; answer = $vd.answer; kev = $kev; val = $val }
}

# ---------- 코드 추출 ----------
function Extract-Code([string]$raw) {
  $lines = $raw -split "`r?`n"
  $blocks = [System.Collections.Generic.List[object]]::new()
  $inFence = $false; $cur = $null
  foreach ($l in $lines) {
    if (-not $inFence) {
      if ($l -match '^\s*```') { $inFence = $true; $cur = [System.Collections.Generic.List[string]]::new() }
    } else {
      if ($l -match '^\s*```\s*$') { $inFence = $false; $blocks.Add($cur.ToArray()); $cur = $null }
      else { $cur.Add($l) }
    }
  }
  if ($blocks.Count -eq 0) { return @{ code = $raw; no_fence = 1; blocks = 0 } }
  $last = $blocks[$blocks.Count - 1]
  return @{ code = (($last -join "`n") + "`n"); no_fence = 0; blocks = $blocks.Count }
}

# ---------- 상태 ----------
function State-Path([string]$model, [string]$id) { Join-Path $RawRoot "$model\$id.state.json" }
function Load-State([string]$model, [string]$id) {
  $p = State-Path $model $id
  if (Test-Path -LiteralPath $p) { return (Get-Content -Raw -Encoding utf8 $p | ConvertFrom-Json -AsHashtable) }
  return [ordered]@{ model = $model; id = $id; calls = 0; attempts = 0; transient = 0; invalid = @(); history = @(); done = $false; valid = $false; final = ''; final_call = 0; answer = '' }
}
function Save-State($st) { Write-Utf8 (State-Path $st.model $st.id) (ConvertTo-Json -InputObject $st -Depth 10) }

# ---------- 이벤트 요약 파일 ----------
function Write-EventsFile([string]$model, $t, $st, $ev, $call, $ext, $cls) {
  $id = $t.id
  $L = [System.Collections.Generic.List[string]]::new()
  $L.Add("$model · $id — 켠 조건 코드 과제 이벤트 추출 요약 (판K T6)")
  $L.Add("원본: %TEMP%\sapkit-panK\raw-T6\$model\$id.jsonl (원 이벤트 스트림 · 세션/스레드 id·로컬 경로 포함 · 커밋하지 않음 · 호출별 사본 $id.call-<k>.jsonl)")
  if ($model -eq $CodexModel) {
    $L.Add("명령: K-00-recipe.txt §3 (판J 02 §3 그대로 + -c model_reasoning_effort=`"medium`" + -c windows.sandbox=`"unelevated`" · 배너 확인 K-60-canary-gpt-5.6-sol.txt) · cwd/-C = harness-T6")
  } else {
    $L.Add("명령: K-00-recipe.txt §2 (판J 02 §2 + --tools `"Read,Grep,Glob`" --restricted) · 모델 id $model · cwd = harness-T6")
  }
  $L.Add("프롬프트: K-60-run-log.txt 의 프롬프트 계약 (고정 줄 + task_text + Required output) · chars=$($t.prompt_chars) · sha256=$($t.prompt_sha)")
  $L.Add("응시(응답) 횟수=$($st.attempts) · 전이 재시도=$($st.transient) · CLI 호출 총수=$($st.calls) · 최종=$($st.final) (call $($st.final_call))")
  foreach ($h in @($st.history)) {
    if ($h.kind -eq 'valid') { continue }
    $L.Add("  call $($h.call): $($h.kind) — $(Redact $h.reason) · exit=$($h.exit) · wall_ms=$($h.wall_ms) · $($h.ts_start) → $($h.ts_end)")
  }
  foreach ($iv in @($st.invalid)) {
    $L.Add("  무효 응시 $($iv.attempt)/$MaxAttempts (call $($iv.call)): $(Redact $iv.reason) · 원응답 → %TEMP%\sapkit-panK\raw-T6\$model\$id.invalid-$($iv.attempt).txt (커밋하지 않음)")
  }
  if ($ev.kind -eq 'claude') {
    $init = $ev.init
    if ($null -ne $init) {
      $plugins = @($init.plugins | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.name } })
      $L.Add("system/init: model=$($init.model) · claude_code_version=$($init.claude_code_version) · permissionMode=$($init.permissionMode)")
      $L.Add("  tools=$(CountOf $init.tools) [$(@($init.tools) -join ',')] · mcp_servers=$(CountOf $init.mcp_servers) · slash_commands=$(CountOf $init.slash_commands) · skills=$(CountOf $init.skills) · plugins=$(CountOf $init.plugins) [$($plugins -join ',')] · agents=$(CountOf $init.agents)")
    } else { $L.Add('system/init: (없음)') }
    $L.Add("assistant 이벤트 수=$($ev.asst_count) · assistant.message.model=[$($ev.asst_models -join ',')]")
    $L.Add("도구 호출(tool_use 블록) 수=$($ev.tool_use) · 이름: $(if ($ev.tool_names.Count -gt 0) { $ev.tool_names -join ',' } else { '없음' })")
    $res = $ev.result
    if ($null -ne $res) {
      $mu = @($res.modelUsage.PSObject.Properties.Name)
      $L.Add("result: is_error=$($res.is_error) · subtype=$($res.subtype) · num_turns=$($res.num_turns) · duration_ms=$($res.duration_ms) · duration_api_ms=$($res.duration_api_ms) · modelUsage 키=[$($mu -join ',')]")
      $u = $res.usage
      $L.Add("usage: input_tokens=$($u.input_tokens) · output_tokens=$($u.output_tokens) · cache_creation_input_tokens=$($u.cache_creation_input_tokens) · cache_read_input_tokens=$($u.cache_read_input_tokens)")
    } else { $L.Add('result: (없음)') }
  } else {
    $L.Add("관측 모델 id: $($script:KBannerModel) (배너 · K-60-canary-gpt-5.6-sol.txt — --json 이벤트에는 모델 id 가 없다)")
    $hs = @($ev.hist.Keys | Sort-Object | ForEach-Object { "$_=$($ev.hist[$_])" })
    $L.Add("events: thread.started=$($ev.thread_started) · item.completed 유형 히스토그램: $(if ($hs.Count) { $hs -join ', ' } else { '(없음)' })")
    $L.Add("셸 호출 수(item.type ∉ {agent_message, reasoning, error})=$($ev.calls.Count) · 명령: $(if ($ev.calls.Count -gt 0) { Redact ($ev.calls -join ' ; ') } else { '없음' })")
    $u = $ev.usage
    if ($null -ne $u) { $L.Add("usage: input_tokens=$($u.input_tokens) · cached_input_tokens=$($u.cached_input_tokens) · output_tokens=$($u.output_tokens) · reasoning_output_tokens=$($u.reasoning_output_tokens)") } else { $L.Add('usage: (turn.completed 없음)') }
    $L.Add("error 항목=$($ev.errors.Count) · turn.failed=$($ev.turn_failed) · 최상위 error 이벤트=$($ev.top_errors.Count)$(if ($ev.errors.Count -or $ev.top_errors.Count) { ' — ' + (Redact (@($ev.errors + $ev.top_errors) -join ' | ')) } else { '' })")
  }
  $L.Add("exit_code=$($call.exit) · wall_ms=$($call.wall_ms) · timed_out=$($call.timed_out) · stderr 줄 수=$(Count-FileLines $call.errf) · 시작=$($call.ts_start) · 종료=$($call.ts_end)")
  $L.Add("응답 내 외부 URL(https?://) 건수=$($ev.urls)")
  $L.Add("valid=$(if ($st.valid) { 1 } else { 0 })")
  $kv = $cls.val; $kk = $cls.kev
  $obs = if ($null -ne $kk) { Get-KObserved $kk } else { '' }
  $tk = if ($null -ne $kk) { Get-KTokens $kk } else { @('', '') }
  $match = if ($model -like 'claude-*') { ($obs -eq $model) } else { ($obs -like 'gpt-5.6-sol*') }
  $L.Add("유효성: 위반=[$(if ($kv) { $kv.violations -join ',' })] · 읽은 파일(폴더 상대)=[$(if ($kv) { $kv.files -join ' ' })] · 판정 사유=$(if ($cls.reason) { Redact $cls.reason } else { 'none' }) · 답안 로컬 경로 가림=$($st.masks)")
  $L.Add("k: observed_model=$($obs -replace '\s', '_') observed_model_match=$(if ($st.valid) { $match.ToString().ToLower() } else { '' }) files_read=$(if ($st.valid -and $kv) { $kv.files.Count }) outside_attempts=$(if ($st.valid -and $kv) { $kv.outside }) invalid_attempts=$(@($st.invalid).Count) tokens_in=$(if ($st.valid) { $tk[0] }) tokens_out=$(if ($st.valid) { $tk[1] }) answer=$($st.answer)")
  if ($st.valid) {
    $L.Add("펜스 블록 수=$($ext.blocks) · no_fence=$($ext.no_fence) · 추출 → K-60-code/$model/$id.abap (lines=$($ext.lines) · bytes=$($ext.bytes))")
    $L.Add("summary: valid=1 attempts=$($st.attempts) no_fence=$($ext.no_fence) blocks=$($ext.blocks) lines=$($ext.lines) bytes=$($ext.bytes)")
  } else {
    $L.Add('코드 추출 없음 (3회 모두 무효 — 불통과 · answer=none · 빈 .abap 을 자리에 둔다)')
    $L.Add("summary: valid=0 attempts=$($st.attempts) no_fence= blocks=")
  }
  Write-Utf8 (Join-Path $Data "K-60-events\$model\$id.txt") (($L -join "`n") + "`n")
}
function Complete-Task([string]$model, $t, $st, $ev, $call, $cls) {
  $ext = $null
  if ($st.valid) {
    $rawText = [string]$ev.raw
    $st.masks = Get-KRedactCount $rawText
    $rawText = Redact-KPath $rawText
    Write-Utf8 (Join-Path $Data "K-60-raw\$model\$($t.id).txt") $rawText
    $ext = Extract-Code $rawText
    Write-Utf8 (Join-Path $Data "K-60-code\$model\$($t.id).abap") $ext.code
    $ext.lines = Count-Lines $ext.code
    $ext.bytes = $Utf8.GetByteCount($ext.code)
  } else {
    $st.masks = 0
    Write-Utf8 (Join-Path $Data "K-60-raw\$model\$($t.id).txt") ''
    Write-Utf8 (Join-Path $Data "K-60-code\$model\$($t.id).abap") ''
  }
  Write-EventsFile $model $t $st $ev $call $ext $cls
}

# ---------- 과제 실행 루프 ----------
function Write-Integrity([string]$model, [string]$when) {
  $f = Test-KFolder
  $m = [Threading.Mutex]::new($false, 'Global\sapkit-panK-T6-integrity')
  [void]$m.WaitOne(30000)
  try { [IO.File]::AppendAllText($IntegrityPath, ('{0} | {1} | {2} | {3} | files={4} expected={5} diff={6}' -f (Now), $model, $when, $(if ($f.same) { 'same' } else { 'DIFF' }), $f.files, $f.expected, $f.diff) + "`n", $Utf8) } finally { $m.ReleaseMutex(); $m.Dispose() }
  return $f
}
function Run-Model([string]$model) {
  Initialize-Env $model
  $fi = Write-Integrity $model 'start'
  if (-not $fi.same) { throw "folder integrity broken at start (diff=$($fi.diff)) — stop" }
  $cv = Run-RunCanary $model
  if ($cv -ne 'PASS') { throw "isolation canary FAILED for $model — run stopped (K-60-canary-$model.txt)" }
  $tasks = Select-Tasks
  Write-Log "run start · tasks=$($tasks.Count)" $model
  foreach ($t in $tasks) {
    $st = Load-State $model $t.id
    if ($st.done) { Write-Log "skip $($t.id) (done · final=$($st.final))" $model; continue }
    $prompt = Build-Prompt $t
    $t | Add-Member -NotePropertyName prompt_sha -NotePropertyValue (Sha256 $prompt) -Force
    $t | Add-Member -NotePropertyName prompt_chars -NotePropertyValue $prompt.Length -Force
    Write-Utf8 (Join-Path $RawRoot "prompts\$($t.id).txt") $prompt
    while (-not $st.done) {
      $st.calls++
      $k = $st.calls
      $jsonl = Join-Path $RawRoot "$model\$($t.id).call-$k.jsonl"
      $errf = Join-Path $RawRoot "$model\$($t.id).call-$k.stderr.txt"
      $ts0 = Now
      Write-Log "$($t.id) call $k start" $model
      $call = if ($model -eq $CodexModel) { Invoke-CodexCall $prompt $jsonl $errf $true } else { Invoke-ClaudeCall $model $prompt $jsonl $errf }
      $call | Add-Member -NotePropertyName ts_start -NotePropertyValue $ts0 -Force
      $call | Add-Member -NotePropertyName ts_end -NotePropertyValue (Now) -Force
      $call | Add-Member -NotePropertyName k -NotePropertyValue $k -Force
      $call | Add-Member -NotePropertyName jsonl -NotePropertyValue $jsonl -Force
      $call | Add-Member -NotePropertyName errf -NotePropertyValue $errf -Force
      $ev = if ($model -eq $CodexModel) { Read-CodexEvents $jsonl } else { Read-ClaudeEvents $jsonl }
      $cls = Classify $ev $call
      Write-Log "$($t.id) call $k end exit=$($call.exit) wall_ms=$($call.wall_ms) → $($cls.kind) $($cls.reason)" $model
      $st.history += @{ call = $k; kind = $cls.kind; reason = (Redact $cls.reason); exit = $call.exit; wall_ms = $call.wall_ms; ts_start = $ts0; ts_end = $call.ts_end }
      if ($cls.kind -eq 'transient') {
        $st.transient++
        Save-State $st
        if ($st.transient -gt $MaxTransient) {
          Add-RetryLine "$(Now) | $model | $($t.id) | call $k | transient | $($cls.reason) | 중단 — 전이 재시도 $MaxTransient 회 초과 (재개 가능)"
          throw "giving up on $model $($t.id): transient retries exceeded $MaxTransient"
        }
        $wait = $Backoff[$st.transient - 1]
        Add-RetryLine "$(Now) | $model | $($t.id) | call $k | transient | $($cls.reason) | ${wait}s 대기 후 같은 과제 재시도"
        Start-Sleep -Seconds $wait
        continue
      }
      $st.attempts++
      $n = $st.attempts
      if ($cls.kind -eq 'invalid') {
        Write-Utf8 (Join-Path $RawRoot "$model\$($t.id).invalid-$n.txt") ([string]$ev.raw)
        $st.invalid += @{ attempt = $n; call = $k; reason = (Redact $cls.reason) }
        if ($n -ge $MaxAttempts) {
          Add-RetryLine "$(Now) | $model | $($t.id) | call $k | invalid $n/$MaxAttempts | $($cls.reason) | 3회 무효 확정 — 불통과(오답) · 코드 추출 없음"
          $st.done = $true; $st.valid = $false; $st.final = 'INVALID'; $st.final_call = $k; $st.answer = 'none'
          Complete-Task $model $t $st $ev $call $cls
        } else {
          Add-RetryLine "$(Now) | $model | $($t.id) | call $k | invalid $n/$MaxAttempts | $($cls.reason) | 즉시 재응시"
        }
        Save-State $st
        continue
      }
      $st.done = $true; $st.valid = $true; $st.final = 'VALID'; $st.final_call = $k; $st.answer = $cls.answer
      Copy-Item -LiteralPath $jsonl -Destination (Join-Path $RawRoot "$model\$($t.id).jsonl") -Force
      Complete-Task $model $t $st $ev $call $cls
      Save-State $st
    }
  }
  $fe = Write-Integrity $model 'end'
  if (-not $fe.same) { Write-Log "FOLDER INTEGRITY DIFF at end (diff=$($fe.diff)) — this model's run is flagged INVALID (K-00 §6)" $model }
  Write-Log 'run end' $model
}

# ---------- 저장된 JSONL 에서 재도출 (모델 호출 없음) ----------
function Reextract-Model([string]$model) {
  foreach ($t in (Select-Tasks)) {
    $st = Load-State $model $t.id
    if (-not $st.done) { Write-Log "reextract skip $($t.id) (not done)" $model; continue }
    $prompt = Build-Prompt $t
    $t | Add-Member -NotePropertyName prompt_sha -NotePropertyValue (Sha256 $prompt) -Force
    $t | Add-Member -NotePropertyName prompt_chars -NotePropertyValue $prompt.Length -Force
    $k = [int]$st.final_call
    $jsonl = Join-Path $RawRoot "$model\$($t.id).call-$k.jsonl"
    $h = @($st.history | Where-Object { [int]$_.call -eq $k })[0]
    $call = [pscustomobject]@{ exit = $h.exit; wall_ms = $h.wall_ms; timed_out = $false; ts_start = $h.ts_start; ts_end = $h.ts_end; k = $k; jsonl = $jsonl; errf = (Join-Path $RawRoot "$model\$($t.id).call-$k.stderr.txt") }
    $ev = if ($model -eq $CodexModel) { Read-CodexEvents $jsonl } else { Read-ClaudeEvents $jsonl }
    $cls = Classify $ev $call
    Complete-Task $model $t $st $ev $call $cls
    Write-Log "reextract $($t.id) ok (final=$($st.final))" $model
  }
}

# ---------- 응시 첫 호출 = 격리 카나리아 (판J 02 §0 프롬프트 · D-160 ⓪ 기준 — 기계 판정) + Codex 배너 ----------
function Run-RunCanary([string]$model) {
  $dir = Join-Path $RawRoot 'canary'
  Ensure-Dir $dir
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $r = Invoke-KOnce $model $KCanaryPrompt (Join-Path $dir "run-isolation-$model-$stamp")
  $isC = ($model -like 'claude-*')
  $sr = Test-KSelfReport $r.ev.text
  $srOk = (@($sr.Values | Where-Object { -not $_ }).Count -eq 0)
  $toolsOk = if ($isC) { (@($r.ev.init.tools | ForEach-Object { [string]$_ } | Sort-Object) -join ',') -eq ((@($KClaudeTools) | Sort-Object) -join ',') } else { $srOk }
  $urls = [regex]::Matches([string]$r.ev.text, 'https?://').Count
  $vat = Test-KVatAnswer $r.ev.text
  $pass = $toolsOk -and ($r.val.calls -eq 0) -and ($r.val.violations.Count -eq 0) -and ($urls -eq 0) -and $vat -and ($r.verdict.kind -eq 'ok')
  $L = [System.Collections.Generic.List[string]]::new()
  $L.Add("K-60-canary-$model.txt — 판K T6 응시 첫 호출 격리 카나리아 (판J 02 §0 프롬프트 글자 그대로 · D-160 ⓪ 기준) · $(Now)")
  $L.AddRange([string[]](Format-KCanaryBlock "run canary isolation · $model" $r $KCanaryPrompt))
  $L.Add("기준 ① $(if ($isC) { 'init.tools 가 정확히 Read/Grep/Glob' } else { '자기 보고(스킬·플러그인·MCP·웹 없음)' }): $(if ($toolsOk) { 'PASS' } else { 'FAIL' })")
  $L.Add("기준 ② 도구 호출 0건: $(if ($r.val.calls -eq 0) { 'PASS' } else { 'FAIL' }) ($($r.val.calls))")
  $L.Add("기준 ③ 외부 URL 0건: $(if ($urls -eq 0) { 'PASS' } else { 'FAIL' }) ($urls)")
  $L.Add("답 10% · 10자리: $(if ($vat) { 'PASS' } else { 'FAIL' })")
  if (-not $isC) {
    $b = Invoke-KBanner $dir
    $L.Add('')
    $L.Add("배너 실행 (같은 플래그 · --json 없이 · --color never · 프롬프트 = `"$KBannerPrompt`") · exit=$($b.exit) · wall_ms=$($b.wall_ms)")
    foreach ($bl in $b.lines) { $L.Add((Redact $bl)) }
    $L.Add("배너 판독(기계): [$($b.version_line)] · [$($b.model_line)] · [$($b.effort_line)] · 기대: v0.163.0 · model: gpt-5.6-sol · reasoning effort: medium → $(if ($b.ok) { 'PASS' } else { 'FAIL' })")
    $pass = $pass -and $b.ok
  }
  $L.Add("판정: $(if ($pass) { 'PASS' } else { 'FAIL' })")
  Write-Utf8 (Join-Path $Data "K-60-canary-$model.txt") (($L -join "`n") + "`n")
  Write-Log "run canary $(if ($pass) { 'PASS' } else { 'FAIL' }) tools_ok=$toolsOk calls=$($r.val.calls) urls=$urls vat=$vat" $model
  return $(if ($pass) { 'PASS' } else { 'FAIL' })
}

# ---------- 채점 (검사기 · P0 · 레포 루트에서 · 읽기·실행만 — 판J 와 같다) ----------
function Invoke-Checker([string]$model, [string]$id) {
  $rel = "$DataRel/K-60-code/$model/$id.abap"
  $verLine = ([IO.File]::ReadAllLines((Join-Path $Root 'interactive\checker\VERSION'), $Utf8))[0]
  $nodeVer = (Invoke-Native $NodeExe @('--version') $Root).stdout.Trim()
  $S = [System.Collections.Generic.List[string]]::new()
  $S.Add("K-60-checker/$model/$id.txt — 동봉 검사기 원출력 (판K T6)")
  $S.Add("대상: $rel")
  $S.Add("검사기: $CheckerRel ($verLine) · 실행 위치 = 레포 루트 · node $nodeVer")
  $S.Add("명령 3종 (판J 11-code-tasks.txt §1 그대로): node $CheckerRel <lint|parse|analyze> $rel — 각 stdout·stderr 원문과 exit 코드")
  $res = @{}
  foreach ($cmd in 'lint', 'parse', 'analyze') {
    $r = Invoke-Native $NodeExe @($CheckerRel, $cmd, $rel) $Root
    $res[$cmd] = $r
    $S.Add('')
    $S.Add("=== $cmd ===")
    $S.Add("`$ node $CheckerRel $cmd $rel")
    $S.Add("--- stdout ($($Utf8.GetByteCount($r.stdout)) bytes) ---")
    $S.Add((Redact $r.stdout.TrimEnd("`r", "`n")))
    $S.Add("--- stderr ($($Utf8.GetByteCount($r.stderr)) bytes) ---")
    $S.Add((Redact $r.stderr.TrimEnd("`r", "`n")))
    $S.Add("--- exit ---")
    $S.Add("exit=$($r.exit)")
  }
  $lintLines = @($res.lint.stdout -split "`r?`n")
  $lintE = @($lintLines | Where-Object { $_ -match ': E \[' }).Count
  $lintW = @($lintLines | Where-Object { $_ -match ': W \[' }).Count
  $parseOk = if ($res.parse.exit -eq 0) { 1 } else { 0 }
  $ah = 0; $am = 0; $ai = 0; $analyzeParsed = 0
  try {
    $aj = $res.analyze.stdout | ConvertFrom-Json
    if ($null -ne $aj -and $null -ne $aj.summary) {
      $analyzeParsed = 1
      $bs = $aj.summary.bySeverity
      if ($null -ne $bs) { $ah = [int]$bs.high; $am = [int]$bs.medium; $ai = [int]$bs.info }
    }
  } catch { $analyzeParsed = 0 }
  $code = Read-Utf8 (Join-Path $Data "K-60-code\$model\$id.abap")
  $lines = Count-Lines $code
  $bytes = $Utf8.GetByteCount($code)
  $eg = $lintE + (1 - $parseOk) + $ah
  $wn = $lintW + $am + $ai
  $S.Add('')
  $S.Add('=== metrics ===')
  $S.Add("parse_ok=$parseOk lint_errors=$lintE lint_warnings=$lintW analyze_high=$ah analyze_medium=$am analyze_info=$ai error_grade=$eg warnings=$wn source_lines=$lines bytes=$bytes analyze_json_parsed=$analyzeParsed lint_exit=$($res.lint.exit) analyze_exit=$($res.analyze.exit)")
  $S.Add('산식: error_grade = lint_errors(stdout 의 ": E [" 줄 수) + (parse exit≠0 ? 1 : 0) + analyze summary.bySeverity.high · warnings = lint_warnings(": W [") + analyze medium + analyze info')
  $S.Add('⚠ parse 는 토크나이저다 — 잘못된 ABAP 도 토큰화만 되면 exit 0 (판J 11-code-tasks.txt §1). parse exit≠0 은 파일을 못 읽은 경우만 잡는다.')
  Write-Utf8 (Join-Path $Data "K-60-checker\$model\$id.txt") (($S -join "`n") + "`n")
  return @{ parse_ok = $parseOk; lint_errors = $lintE; lint_warnings = $lintW; analyze_high = $ah; analyze_medium = $am; analyze_info = $ai; error_grade = $eg; warnings = $wn; source_lines = $lines; bytes = $bytes; analyze_parsed = $analyzeParsed }
}
function Get-KLine([string]$evPath) {
  $o = @{ observed_model = ''; files_read = ''; outside_attempts = ''; invalid_attempts = ''; tokens_in = ''; tokens_out = ''; answer = ''; observed_model_match = '' }
  if (Test-Path -LiteralPath $evPath) {
    $m = [regex]::Match((Read-Utf8 $evPath), '(?m)^k: (.*)$')
    if ($m.Success) { foreach ($kv in ($m.Groups[1].Value -split ' ')) { if ($kv -match '^([a-z_]+)=(.*)$') { $o[$Matches[1]] = $Matches[2] } } }
  }
  return $o
}
function Run-Score {
  $tasks = Get-Tasks
  $rows = [System.Collections.Generic.List[string]]::new()
  $rows.Add('model,id,source(11|41),valid,attempts,no_fence,blocks,parse_ok,lint_errors,lint_warnings,analyze_high,analyze_medium,analyze_info,error_grade,warnings,source_lines,bytes,observed_model,files_read,outside_attempts,invalid_attempts,tokens_in,tokens_out,answer')
  foreach ($model in $AllModels) {
    foreach ($t in $tasks) {
      $id = $t.id
      $valid = ''; $attempts = ''; $noFence = ''; $blocks = ''
      $evPath = Join-Path $Data "K-60-events\$model\$id.txt"
      if (Test-Path -LiteralPath $evPath) {
        $m = [regex]::Match((Read-Utf8 $evPath), '(?m)^summary: valid=(\d) attempts=(\d+) no_fence=(\d*) blocks=(\d*)')
        if ($m.Success) { $valid = $m.Groups[1].Value; $attempts = $m.Groups[2].Value; $noFence = $m.Groups[3].Value; $blocks = $m.Groups[4].Value }
      }
      $k = Get-KLine $evPath
      $obs = $k.observed_model; if ($valid -eq '1' -and $k.observed_model_match -ne 'true') { $obs = "MISMATCH:$obs" }
      $tail = "$($obs -replace ',', ';'),$($k.files_read),$($k.outside_attempts),$($k.invalid_attempts),$($k.tokens_in),$($k.tokens_out),$($k.answer)"
      $codePath = Join-Path $Data "K-60-code\$model\$id.abap"
      $met = $null
      if ((Test-Path -LiteralPath $codePath) -and $k.answer -eq 'text') { $met = Invoke-Checker $model $id; Write-Log "score $model $id error_grade=$($met.error_grade) warnings=$($met.warnings)" 'score' }
      else { Write-Log "score $model $id — 검사기 안 돌림 (answer=$($k.answer) — 답 없음 · 3회 무효 · 미응시)" 'score' }
      if ($null -ne $met) {
        $rows.Add("$model,$id,$($t.source),$valid,$attempts,$noFence,$blocks,$($met.parse_ok),$($met.lint_errors),$($met.lint_warnings),$($met.analyze_high),$($met.analyze_medium),$($met.analyze_info),$($met.error_grade),$($met.warnings),$($met.source_lines),$($met.bytes),$tail")
      } else {
        $rows.Add("$model,$id,$($t.source),$valid,$attempts,$noFence,$blocks,,,,,,,,,,,$tail")
      }
    }
  }
  Write-Utf8 (Join-Path $Data 'K-60-checker-summary.csv') (($rows -join "`n") + "`n")
  Write-Log "summary rows=$($rows.Count - 1) → K-60-checker-summary.csv" 'score'
}

# ---------- 완전성 검사 (RED/GREEN) ----------
function Run-Check {
  $tasks = Get-Tasks
  $n = $tasks.Count
  $ok = $true
  $out = [System.Collections.Generic.List[string]]::new()
  $out.Add("[completeness] $(Now) · data=$DataRel")
  $invalidTotal = 0; $noFenceTotal = 0; $noAnswerTotal = 0
  foreach ($model in $AllModels) {
    $raw = 0; $code = 0; $events = 0; $checker = 0; $inv = 0; $nf = 0; $na = 0; $missing = @()
    foreach ($t in $tasks) {
      $id = $t.id
      $evPath = Join-Path $Data "K-60-events\$model\$id.txt"
      $k = Get-KLine $evPath
      if (Test-Path -LiteralPath $evPath) {
        $events++
        $txt = Read-Utf8 $evPath
        if ($txt -match '(?m)^valid=0') { $inv++ }
        if ($txt -match '(?m)^summary: valid=1 attempts=\d+ no_fence=1') { $nf++ }
      } else { $missing += "events:$id" }
      if ($k.answer -eq 'none') { $na++ }
      if (Test-Path -LiteralPath (Join-Path $Data "K-60-raw\$model\$id.txt")) { $raw++ } else { $missing += "raw:$id" }
      if (Test-Path -LiteralPath (Join-Path $Data "K-60-code\$model\$id.abap")) { $code++ } else { $missing += "code:$id" }
      if ($k.answer -eq 'none') { $checker++ }   # 답 없음은 검사기 파일이 없는 것이 정상 — 「설명된 부재」로 센다
      elseif (Test-Path -LiteralPath (Join-Path $Data "K-60-checker\$model\$id.txt")) { $checker++ } else { $missing += "checker:$id" }
    }
    $canPath = Join-Path $Data "K-60-canary-$model.txt"
    $canary = if ((Test-Path -LiteralPath $canPath) -and ((Read-Utf8 $canPath) -match '(?m)^판정: PASS')) { 'PASS' } elseif (Test-Path -LiteralPath $canPath) { 'NOT-PASS' } else { 'MISSING' }
    $integ = 'none'
    if (Test-Path -LiteralPath $IntegrityPath) { $last = @([IO.File]::ReadAllLines($IntegrityPath, $Utf8) | Where-Object { $_ -match "\| $([regex]::Escape($model)) \| end \|" }) | Select-Object -Last 1; if ($last) { $integ = if ($last -match '\| same \|') { 'same' } else { 'DIFF' } } }
    $modelOk = ($raw -eq $n -and $code -eq $n -and $events -eq $n -and $checker -eq $n -and $canary -eq 'PASS' -and $integ -eq 'same')
    if (-not $modelOk) { $ok = $false }
    $out.Add(" $model : raw $raw/$n · code $code/$n · events $events/$n · checker $checker/$n · canary $canary · folder integrity end $integ · INVALID(3x → 불통과) $inv · answer=none $na · no_fence $nf $(if ($modelOk) { '[OK]' } else { '[RED]' })$(if ($missing.Count) { ' missing: ' + ($missing -join ' ') } else { '' })")
    $invalidTotal += $inv; $noFenceTotal += $nf; $noAnswerTotal += $na
  }
  $csvPath = Join-Path $Data 'K-60-checker-summary.csv'
  $csvRows = 0; $csvPairs = 0; $csvValid = 0
  $expRows = $n * $AllModels.Count
  if (Test-Path -LiteralPath $csvPath) {
    $csv = @(Import-Csv -LiteralPath $csvPath -Encoding utf8)
    $csvRows = $csv.Count
    $csvPairs = @($csv | ForEach-Object { "$($_.model)|$($_.id)" } | Select-Object -Unique).Count
    $csvValid = @($csv | Where-Object { $_.valid -eq '1' }).Count
  }
  $csvOk = ($csvRows -eq $expRows -and $csvPairs -eq $expRows)
  if (-not $csvOk) { $ok = $false }
  $out.Add(" summary csv: rows $csvRows/$expRows · distinct (model,id) $csvPairs/$expRows · valid=1 rows $csvValid/$expRows $(if ($csvOk) { '[OK]' } else { '[RED]' })")
  foreach ($f in 'K-60-retries.txt', 'K-60-run-log.txt', 'K-60-run-code.ps1') {
    $p = Join-Path $Data $f
    $present = Test-Path -LiteralPath $p
    if (-not $present) { $ok = $false }
    $out.Add(" $f : $(if ($present) { 'present [OK]' } else { 'MISSING [RED]' })")
  }
  $chAbsent = -not (Test-Path -LiteralPath $CodexHome)
  if (-not $chAbsent) { $ok = $false }
  $out.Add(" codexhome-T6 : $(if ($chAbsent) { 'absent [OK]' } else { 'STILL PRESENT [RED]' })")
  $status = @(& git -C $Root status --porcelain)
  $outside = @($status | Where-Object { $_.Length -gt 3 } | ForEach-Object { $_.Substring(3).Trim('"') } | Where-Object { -not $_.StartsWith("$DataRel/K-60-") })
  if ($outside.Count -gt 0) { $ok = $false }
  $out.Add(" git status : $($status.Count) entries · outside K-60- prefix: $($outside.Count) $(if ($outside.Count -eq 0) { '[OK]' } else { '[RED] ' + ($outside -join ' ') })")
  $out.Add(" invalid(3x)=$invalidTotal · answer=none total=$noAnswerTotal · no_fence total=$noFenceTotal (모두 불통과로 센다 — 판정은 집계가 한다)")
  $out.Add("RESULT: $(if ($ok) { 'GREEN' } else { 'RED' })")
  $out | ForEach-Object { Write-Host $_ }
  if (-not $ok) { exit 1 }
  exit 0
}

# ---------- 정리 ----------
function Run-Cleanup {
  if (Test-Path -LiteralPath $CodexHome) { [IO.Directory]::Delete($CodexHome, $true) }
  $gone = -not (Test-Path -LiteralPath $CodexHome)
  Write-Log "cleanup codexhome-T6 deleted=$gone" 'cleanup'
  if (-not $gone) { throw 'codexhome-T6 still present' }
}

# ---------- 진입 ----------
switch ($Phase) {
  'check' { Run-Check }
  'prompts' {
    Ensure-Dir (Join-Path $RawRoot 'prompts')
    foreach ($t in (Get-Tasks)) {
      $p = Build-Prompt $t
      [IO.File]::WriteAllText((Join-Path $RawRoot "prompts\$($t.id).txt"), $p, $Utf8)
      "{0,-9} src={1} chars={2,5} lines={3,3} sha256={4}" -f $t.id, $t.source, $p.Length, (Count-Lines $p), (Sha256 $p)
    }
    "fixed line chars=$($FixedLine.Length) sha256=$(Sha256 $FixedLine)"
    "prompts written to %TEMP%\sapkit-panK\raw-T6\prompts"
  }
  'canary' {
    Resolve-KExes
    $f0 = Test-KFolder
    if (-not $f0.same) { throw "folder integrity broken before canaries (diff=$($f0.diff))" }
    $fail = 0
    foreach ($m in (Models-For $Model)) { $rows = Invoke-KCanaries $m (Join-Path $RawRoot 'canary'); foreach ($row in $rows) { Write-Host $row; if ($row -notmatch ',PASS,') { $fail++ } } }
    $f1 = Test-KFolder
    Write-Host "folder integrity after canaries: $(if ($f1.same) { 'same' } else { "DIFF ($($f1.diff))" })"
    if ($fail -gt 0 -or -not $f1.same) { exit 2 }
  }
  'run' { Resolve-KExes; foreach ($m in (Models-For $Model)) { Run-Model $m } }
  'reextract' { foreach ($m in (Models-For $Model)) { Reextract-Model $m } }
  'score' { Run-Score }
  'cleanup' { Run-Cleanup }
}
