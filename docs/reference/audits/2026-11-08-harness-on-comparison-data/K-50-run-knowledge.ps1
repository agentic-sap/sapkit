#Requires -Version 7.0
<#
K-50-run-knowledge.ps1 — 판K T5 지식 시험 응시 러너 (켠 조건 · 2 models × 60 items — T0-c) — 판J 50-run-knowledge.ps1 의 복사본 + 판K 차이
(차이 전수표 = K-01-diff-from-panJ.txt · 명령·고정 값 정본 = K-00-recipe.txt · 설계 정본 = DECISIONS.md D-160 ⓪)

T0-c (2026-11-08 · 소유자 결정 4): 기본 모델 집합 = claude-opus-5-5 · claude-sonnet-5-5 둘 ($Models · K-COMMON $KModels).
  Codex gpt-5.6-sol 은 이 판에서 뺐다 — 이 컴퓨터의 Codex 샌드박스 셸(ConstrainedLanguage)이 출력을 코드 페이지 949 로 내보내 한글이
  깨지고, 러너 콘솔 설정 시험이 맑은 한글을 얻지 못했다(그 설정 = 콘솔 65001 상속은 T0-b 2회차에 이미 걸려 있었는데 한글이 깨졌고, T0-c 의 새 호출은 Codex 사용량 한도로 거부됐다 · K-00 §3 · §10 T0-c). -Model gpt-5.6-sol 은 다른 컴퓨터
  재현용으로 ValidateSet 에 남기되 기본값 · all 에는 들지 않는다. Codex 명령 · 분류 규칙(T0-c 껍데기 손질 포함)은 그대로 둔다.

Follows 02-isolation-recipe.txt (Claude §2 · Codex §3 · canary §0) of 판J, with the 판K deviations only (D-160 ⓪):
  1. harness folder  %TEMP%\sapkit-panK\harness-T5\  (knowledge\ · personas\ from commit 4f12d678 — 203 files) is the cwd of
     every call (claude working folder · codex -C). empty-mcp.json sits OUTSIDE it: %TEMP%\sapkit-panK\empty-mcp.json.
     own Codex home %TEMP%\sapkit-panK\codexhome-T5\ (auth.json copy only — the operator deletes it at the end).
  2. Claude: --tools "Read,Grep,Glob" (was "") and --restricted (new). Codex: flags unchanged + -c model_reasoning_effort="medium" + -c windows.sandbox="unelevated" (T0-b · owner decision 2026-11-08 · K-00 §3).
  3. fixed line = D-160 ⓪ knowledge line (+ Korean gloss). Items = J-10 sample 60 only (K-INC from J-41 is not taken).
  4. validity ⑴~⑷ by machine (K-00 §4): read tools only · every read attempt inside the folder · no other item · URLs only from the folder.
     verdict order (K-00 §5): ① transient (no result · exit≠0 · usage limit · network/CLI) → fixed backoff 60/120/240/480/900×4, 8 times,
     not counted ② invalid (validity · context · turns · wall clock 15 min · subtype≠success · Codex error end) → max 3 attempts, all
     three invalid → the row is WRONG ③ success but empty / asks back / "cannot read · don't know" → no answer → WRONG, no retry.
  5. raw event streams + invalid raw answers → %TEMP%\sapkit-panK\raw-T5\<model>\  (outside the repo, never committed).
  6. folder integrity: 203 blob sha re-measured at run start and end per model (K-50-folder-integrity.txt).

Prompt contract (every model, every item): fixed line + blank line + the item's question verbatim. One question = one CLI call.
Batches of <= BatchSize items; the first call of every batch is the canary (J-02 §0 prompt · D-160 ⓪ canary criteria).
Idempotent: items with a final answer (valid or 3× invalid) are skipped, so a run resumes after a limit.

Usage (PowerShell 7):
  & .\K-50-run-knowledge.ps1 -Check                         # completeness check (regenerates K-50-summary.csv) — exit 0 GREEN / 1 RED  (no model call)
  & .\K-50-run-knowledge.ps1 -Phase prompts                 # prompts 60 + sha256 table (no model call)
  & .\K-50-run-knowledge.ps1 -Phase canary -Model <m|all>   # T0 canaries ⑴ isolation ⑵ read-inside ⑶ boundary (+ ⑷ Codex banner) → K-02-canary\T5-<m>.txt
  & .\K-50-run-knowledge.ps1 -Model claude-opus-5-5         # the run (T5)
  & .\K-50-run-knowledge.ps1 -Phase cleanup                 # delete codexhome-T5 (.NET call) and confirm
Exit codes: 0 ok · 1 check RED · 2 canary FAIL (batch stopped) · 3 banner FAIL · 4 transient retries exhausted · 5 folder integrity broken at start
#>
[CmdletBinding()]
param(
  [ValidateSet('claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol', 'all')]
  [string]$Model,
  [switch]$Check,
  [ValidateSet('run', 'canary', 'prompts', 'cleanup')]
  [string]$Phase = 'run',
  [int]$BatchSize = 30,
  [string]$DataDir,
  [string]$WorkRoot,
  [switch]$NoBanner
)

$ErrorActionPreference = 'Continue'
$PSNativeCommandUseErrorActionPreference = $false
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$Utf8NoBom = [Text.UTF8Encoding]::new($false)

if (-not $DataDir) { $DataDir = $PSScriptRoot }
if (-not $WorkRoot) { $WorkRoot = Join-Path $env:TEMP 'sapkit-panK' }
$JDataDir = Join-Path (Split-Path $DataDir) '2026-11-05-harness-necessity-review-data'

# ---- pre-registered prompts (verbatim · K-00 §1) ---------------------------------------------------
$FixedLine    = 'Answer in one or two lines, concisely. You may read the files in the current folder (SAP knowledge pack: knowledge/ - consultant personas: personas/, start from personas/INDEX.md if unsure where to look). Do not use web search, do not read anything outside the current folder, and do not create or modify any file. (한두 줄로 간결히 답하라. 현재 폴더의 파일은 읽어도 된다 — SAP 지식 팩: knowledge/ · 컨설턴트 페르소나: personas/, 어디를 볼지 모르면 personas/INDEX.md부터. 웹 검색을 쓰지 말고, 현재 폴더 밖은 읽지 말고, 파일을 만들거나 고치지 말라.)'
$Models       = @('claude-opus-5-5', 'claude-sonnet-5-5')   # T0-c: Codex 제외(머리 주석)

# ---- paths ----------------------------------------------------------------------------------------
$KSet           = 'T5'
$HarnessDir     = Join-Path $WorkRoot 'harness-T5'
$EmptyMcp       = Join-Path $WorkRoot 'empty-mcp.json'
$CodexHome      = Join-Path $WorkRoot 'codexhome-T5'
$RawRoot        = Join-Path $WorkRoot 'raw-T5'
$KCanaryDir     = Join-Path $DataDir 'K-02-canary'
$KFolderShaFile = Join-Path $KCanaryDir 'folder-sha-T5.txt'
$RunLog         = Join-Path $DataDir 'K-50-run-log.txt'
$RetryLog       = Join-Path $DataDir 'K-50-retries.txt'
$SummaryCsv     = Join-Path $DataDir 'K-50-summary.csv'
$IntegrityLog   = Join-Path $DataDir 'K-50-folder-integrity.txt'
$Items10        = Join-Path $JDataDir '10-knowledge-items.json'

$script:CallCount  = 0
$script:CanaryNo   = 0

# >>> K-COMMON (K-50 · K-60 같은 글자 — 판K T0 · 정본 = K-00-recipe.txt) ---------------------------------------------
# 하네스 조건 공통 부분: 고정 값 · CLI 호출(벽시계 15분) · 유효성 ⑴~⑷ · 판정 순서 · 폴더 무결성 · 카나리아 3종 · 가림.
# 이 블록을 쓰기 전에 러너가 정해 두는 변수: $HarnessDir · $EmptyMcp · $CodexHome · $KFolderShaFile · $KCanaryDir · $KSet(T5|T6)
$KUtf8           = [Text.UTF8Encoding]::new($false)
$KBackoff        = @(60, 120, 240, 480, 900, 900, 900, 900)   # 전이 오류 백오프(초) — 8회 넘으면 중단(재개 가능)
$KWallSec        = 900                                         # 호출 하나의 벽시계 상한(15분) — 넘으면 프로세스 트리를 끊고 무효
$KMaxAttempts    = 3                                           # 무효 시도 상한 — 3회 모두 무효면 그 행은 오답
$KModels         = @('claude-opus-5-5', 'claude-sonnet-5-5')   # T0-c: Codex 제외 — K-00 §3 · §10 T0-c
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
  # T0-c (owner decision 2026-11-08 · K-00 §4 step 0): + allowlisted quoted shell paths (msi pwsh 7 · System32 powershell 5.1 · \ or \\)
  $pats = @(
    @('powershell', '(?is)^(?:"C:(?<s>\\\\?)(?:Program Files\k<s>PowerShell\k<s>7\k<s>pwsh|Windows\k<s>System32\k<s>WindowsPowerShell\k<s>v1\.0\k<s>powershell)\.exe"|"?(?:[^"\s]*[\\/])?(?:powershell|pwsh)(?:\.exe)?"?)(?:\s+-(?!Command\b|c\b)[A-Za-z]+(?:\s+(?!-)[^\s-]\S*)?)*\s+-(?:Command|c)\s+(?<inner>.+)$'),
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

# ---- helpers --------------------------------------------------------------------------------------
# shared log files may be appended by two model runs at once — retry briefly on a file lock
function Add-Line([string]$Path, [string]$Value) {
  for ($i = 0; $i -lt 20; $i++) {
    try { Add-Content -Path $Path -Value $Value -Encoding utf8 -ErrorAction Stop; return } catch { Start-Sleep -Milliseconds 150 }
  }
  Write-Host "WARN: could not append to $Path after 20 tries: $Value"
}

function Write-Log([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), (Redact-K $Message)
  Add-Line $RunLog $line
  Write-Host $line
}

function Write-Retry([string]$Id, [int]$Attempt, [string]$Kind, [string]$Reason, [int]$WaitSec) {
  if (-not (Test-Path $RetryLog)) {
    Add-Line $RetryLog 'timestamp | model | id | attempt | kind(transient=wait+retry same item, not counted · invalid=validity/context/wall-clock → re-run, counted, 3 → WRONG) | reason | wait_s'
  }
  $r = (Redact-K ($Reason -replace '[\r\n]+', ' '))
  Add-Line $RetryLog ('{0} | {1} | {2} | {3} | {4} | {5} | {6}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Model, $Id, $Attempt, $Kind, $r, $WaitSec)
}

function Get-Items {
  $j = Get-Content -Raw -Encoding utf8 $Items10 | ConvertFrom-Json
  $items = @()
  foreach ($it in $j.items) { $items += [pscustomobject]@{ id = [string]$it.id; source = '10'; question = [string]$it.question } }
  return $items
}

function Get-StderrTail([string]$Path) {
  if (-not (Test-Path $Path)) { return '' }
  $t = ([IO.File]::ReadAllText($Path, $Utf8NoBom) -replace '[\r\n]+', ' ').Trim()
  if ($t.Length -gt 300) { $t = $t.Substring($t.Length - 300) }
  return (Redact-K $t)
}

function Read-Jsonl([string]$Path) {
  $events = [System.Collections.Generic.List[object]]::new(); $bad = 0
  if (Test-Path $Path) {
    foreach ($l in [IO.File]::ReadAllLines($Path, $Utf8NoBom)) {
      if ([string]::IsNullOrWhiteSpace($l)) { continue }
      try { $events.Add(($l | ConvertFrom-Json -Depth 100)) } catch { $bad++ }
    }
  }
  return @{ events = $events; bad = $bad }
}

function Format-NameList($arr) {
  $a = @($arr)
  $names = @($a | ForEach-Object { if ($_ -is [string]) { $_ } elseif ($null -ne $_.name) { [string]$_.name } else { ($_ | ConvertTo-Json -Compress -Depth 3) } })
  return "$($names.Count) [" + ($names -join ',') + ']'
}

function Format-Hist($h) { return (($h.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ') }

# ---- extraction (recipe §2 · §3) ------------------------------------------------------------------
function Parse-Claude([string]$RawPath) {
  $j = Read-Jsonl $RawPath
  $init = $null; $tu = 0; $names = @(); $text = $null; $muKeys = @(); $dur = $null; $isErr = $false; $turns = $null
  $usage = $null; $amodels = @(); $hist = [ordered]@{}; $hasResult = $false; $subtype = $null; $errs = @()
  foreach ($e in $j.events) {
    $t = [string]$e.type; if (-not $hist.Contains($t)) { $hist[$t] = 0 }; $hist[$t]++
    if ($t -eq 'system' -and $e.subtype -eq 'init') { $init = $e }
    elseif ($t -eq 'assistant') {
      $c = @($e.message.content | Where-Object { $_.type -eq 'tool_use' })
      $tu += $c.Count; $names += @($c | ForEach-Object { [string]$_.name })
      if ($e.message.model) { $amodels += [string]$e.message.model }
    }
    elseif ($t -eq 'result') {
      $hasResult = $true; $text = [string]$e.result; $subtype = [string]$e.subtype
      if ($e.modelUsage) { $muKeys = @($e.modelUsage.PSObject.Properties.Name) }
      $dur = $e.duration_ms; $isErr = [bool]$e.is_error; $turns = $e.num_turns; $usage = $e.usage
      if ($e.errors) { $errs += @($e.errors | ForEach-Object { [string]$_ }) }
    }
  }
  $urls = if ($text) { ([regex]::Matches($text, 'https?://')).Count } else { 0 }
  $obs = @(@($init.model) + $amodels + $muKeys | Where-Object { $_ } | Select-Object -Unique)
  $extra = @()
  if ($init) {
    $extra += "init_model: $($init.model) · claude_code_version: $($init.claude_code_version) · permissionMode: $($init.permissionMode)"
    $extra += "init_tools: $(Format-NameList $init.tools)"
    $extra += "init_mcp_servers: $(Format-NameList $init.mcp_servers)"
    $extra += "init_slash_commands: $(Format-NameList $init.slash_commands)"
    $extra += "init_skills: $(Format-NameList $init.skills)"
    $extra += "init_plugins: $(Format-NameList $init.plugins)"
    $extra += "init_agents: $(Format-NameList $init.agents)"
  } else { $extra += 'init: MISSING' }
  $extra += "assistant_models: $((@($amodels | Select-Object -Unique)) -join ',') · result_modelUsage_keys: $($muKeys -join ',')"
  $extra += "result_subtype: $subtype · num_turns: $turns · is_error: $isErr"
  $extra += "events: $(Format-Hist $hist) · unparsed_lines: $($j.bad)"
  if ($errs.Count) { $extra += 'result_errors: ' + (Redact-K (($errs -join ' | ') -replace '[\r\n]+', ' ')) }
  $u = [ordered]@{}
  if ($usage) { foreach ($k in 'input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens') { if ($null -ne $usage.$k) { $u[$k] = [int64]$usage.$k } } }
  return [pscustomobject]@{ text = $text; tool_calls = $tu; tool_names = $names; url_count = $urls; observed_model = ($obs -join ','); duration_ms = $dur; usage = $u; is_error = $isErr; has_result = $hasResult; errors = $errs; extra = $extra }
}

function Parse-Codex([string]$RawPath) {
  $j = Read-Jsonl $RawPath
  $calls = @(); $texts = @(); $hist = [ordered]@{}; $evHist = [ordered]@{}; $usage = $null; $turnDone = $false; $errs = @()
  foreach ($e in $j.events) {
    $t = [string]$e.type; if (-not $evHist.Contains($t)) { $evHist[$t] = 0 }; $evHist[$t]++
    if ($t -eq 'item.completed') {
      $it = [string]$e.item.type; if (-not $hist.Contains($it)) { $hist[$it] = 0 }; $hist[$it]++
      if ($it -eq 'agent_message') { $texts += [string]$e.item.text }
      elseif ($it -eq 'error') { $errs += [string]$e.item.message }
      elseif ($it -ne 'reasoning') {
        $nm = $it
        if ($e.item.command) { $nm += ':' + [string]$e.item.command }
        elseif ($e.item.tool) { $nm += ':' + [string]$e.item.tool }
        $calls += $nm
      }
    }
    elseif ($t -eq 'turn.completed') { $turnDone = $true; $usage = $e.usage }
    elseif ($t -eq 'turn.failed') { $errs += [string]$e.error.message }
    elseif ($t -eq 'error') { $errs += [string]$e.message }
  }
  $text = $texts -join "`n"
  $urls = ([regex]::Matches($text, 'https?://')).Count
  $extra = @()
  $extra += 'model_id_note: codex --json events carry no model id — observed id comes from the banner run of this run (K-50-canary-gpt-5.6-sol.txt)'
  $extra += "item_types: $(Format-Hist $hist)"
  $extra += "events: $(Format-Hist $evHist) · unparsed_lines: $($j.bad)"
  if ($errs.Count) { $extra += 'error_items: ' + (Redact-K (($errs -join ' | ') -replace '[\r\n]+', ' ')) }
  $u = [ordered]@{}
  if ($usage) { foreach ($k in 'input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens') { if ($null -ne $usage.$k) { $u[$k] = [int64]$usage.$k } } }
  return [pscustomobject]@{ text = $text; tool_calls = $calls.Count; tool_names = $calls; url_count = $urls; observed_model = $script:KBannerModel; duration_ms = $null; usage = $u; is_error = $false; has_result = $turnDone; errors = $errs; extra = $extra }
}

function Parse-Raw([string]$RawPath) { if ($Model -like 'claude-*') { return (Parse-Claude $RawPath) } else { return (Parse-Codex $RawPath) } }

# ---- one CLI call (K-COMMON Invoke-KModel — recipe flags + 판K deviations · wall clock 15 min) ---------
function Invoke-Model([string]$Prompt, [string]$RawPath, [string]$ErrPath) {
  $script:CallCount++
  return (Invoke-KModel $Model $Prompt $RawPath $ErrPath $true)
}

# 판정 순서 ① 전이 — 고정 백오프 8회(K-00 §5). ② 무효 · ③ 답 없음은 부르는 쪽이 가른다.
function Invoke-WithRetry([string]$Prompt, [string]$RawBase, [string]$Id, [int]$Attempt) {
  $tr = 0
  while ($true) {
    $suffix = if ($tr -eq 0) { '' } else { ".try-$tr" }
    $raw = "$RawBase$suffix.jsonl"; $err = "$RawBase$suffix.stderr.txt"
    $r = Invoke-Model $Prompt $raw $err
    $p = Parse-Raw $raw
    $kev = Read-KEvents $raw ($Model -like 'claude-*')
    $val = Test-KValidity $kev $err
    $vd = Get-KVerdict $kev $r $val $err
    if ($vd.kind -ne 'transient') { return [pscustomobject]@{ r = $r; p = $p; kev = $kev; val = $val; vd = $vd; raw = $raw; err = $err; transient_retries = $tr } }
    $tr++
    if ($tr -gt $KBackoff.Count) { Write-Retry $Id $Attempt 'transient' "$($vd.reason) — transient retries exhausted ($($KBackoff.Count)) — run stopped (resumable)" 0; Write-Log "transient retries exhausted on $Id ($($vd.reason)) — stopping"; exit 4 }
    $wait = $KBackoff[$tr - 1]
    Write-Retry $Id $Attempt 'transient' "$($vd.reason) [stderr: $(Get-StderrTail $err)]" $wait
    Write-Log "  transient #$tr on $Id — $($vd.reason) — waiting $wait s"
    Start-Sleep -Seconds $wait
  }
}

# ---- events summary (committed) -------------------------------------------------------------------
function Write-Events([string]$Path, $Item, [int]$Attempt, [bool]$Valid, $res, [int]$PrevInvalid, [string]$AnswerKind, [int]$Redactions) {
  $p = $res.p; $r = $res.r
  $dur = if ($null -ne $p.duration_ms) { $p.duration_ms } else { $r.wall_ms }
  $tk = Get-KTokens $res.kev
  $obs = Get-KObserved $res.kev
  $lines = @(
    "id: $($Item.id)", "model: $Model", "source: $($Item.source)", "attempt: $Attempt", "valid: $($Valid.ToString().ToLower())",
    "tool_calls: $($p.tool_calls)", "tool_names: $(if ($p.tool_names.Count) { Redact-K ($p.tool_names -join ',') } else { 'none' })",
    "url_count: $($p.url_count)", "answer_chars: $(([string]$p.text).Length)", "duration_ms: $dur",
    "duration_note: $(if ($null -ne $p.duration_ms) { 'result.duration_ms from the claude stream-json result event' } else { 'wall-clock of the CLI call (codex --json has no duration field)' })",
    "wall_ms: $($r.wall_ms)", "exit_code: $($r.exit)", "timed_out: $($r.timed_out)", "transient_retries: $($res.transient_retries)", "previous_invalid_attempts: $PrevInvalid",
    "observed_model: $obs",
    "observed_model_match: $(if ($Model -like 'claude-*') { ($obs -eq $Model).ToString().ToLower() } else { ($obs -like 'gpt-5.6-sol*').ToString().ToLower() })",
    "files_read: $($res.val.files.Count)", "files_read_list: $(if ($res.val.files.Count) { $res.val.files -join ' ' } else { 'none' })",
    "outside_attempts: $($res.val.outside)", "invalid_attempts: $PrevInvalid", "tokens_in: $($tk[0])", "tokens_out: $($tk[1])",
    "answer: $AnswerKind", "verdict_reason: $(if ($res.vd.reason) { Redact-K $res.vd.reason } else { 'none' })", "answer_local_path_masks: $Redactions"
  )
  foreach ($k in $p.usage.Keys) { $lines += "usage_${k}: $($p.usage[$k])" }
  $lines += $p.extra
  $lines += "recorded_at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  Set-Content -Path $Path -Value ($lines -join "`r`n") -Encoding utf8
}

function Write-ExhaustedEvents([string]$Path, $Item, [string]$LastReason) {
  $lines = @("id: $($Item.id)", "model: $Model", "source: $($Item.source)", "attempt: $KMaxAttempts", 'valid: false', 'tool_calls: ', 'tool_names: ', 'url_count: ', 'answer_chars: 0', 'duration_ms: ',
    "observed_model: ", 'files_read: ', 'outside_attempts: ', "invalid_attempts: $KMaxAttempts", 'tokens_in: ', 'tokens_out: ', 'answer: none',
    "verdict_reason: all $KMaxAttempts attempts invalid — row is WRONG (D-160 ⓪) · last: $(Redact-K $LastReason)", "recorded_at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
  Set-Content -Path $Path -Value ($lines -join "`r`n") -Encoding utf8
}

function Read-Events([string]$Path) {
  $d = @{}
  foreach ($l in [IO.File]::ReadAllLines($Path, $Utf8NoBom)) { if ($l -match '^([a-z_]+): (.*)$') { $d[$Matches[1]] = $Matches[2] } }
  return $d
}

# ---- canary / banner ------------------------------------------------------------------------------
function Run-Canary([int]$BatchNo) {
  $script:CanaryNo++
  $n = $script:CanaryNo
  $base = Join-Path $RawDir ('canary-{0:D2}-{1}' -f $n, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  $res = Invoke-WithRetry $KCanaryPrompt $base "canary-$n" 1
  $p = $res.p; $r = $res.r
  $sr = Test-KSelfReport $p.text
  $srOk = (@($sr.Values | Where-Object { -not $_ }).Count -eq 0)
  $toolsOk = if ($Model -like 'claude-*') { (@($res.kev.init.tools | ForEach-Object { [string]$_ } | Sort-Object) -join ',') -eq ((@($KClaudeTools) | Sort-Object) -join ',') } else { $srOk }
  $vat = Test-KVatAnswer $p.text
  $mech = ($p.tool_calls -eq 0 -and $p.url_count -eq 0 -and $res.val.violations.Count -eq 0 -and $res.vd.kind -eq 'ok')
  $verdict = if ($mech -and $toolsOk -and $vat) { 'PASS' } else { 'FAIL' }
  $lines = @()
  $lines += "=== canary #$n · model=$Model · batch=$BatchNo · $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
  $lines += 'prompt: 판J 02-isolation-recipe.txt §0 canary prompt (verbatim) · criteria D-160 ⓪ (① read tools only · ② tool calls 0 · ③ URL 0 · answer 10% / 10 digits)'
  $lines += "observed_model: $($p.observed_model)"
  $lines += "tool_calls: $($p.tool_calls) · names: $(if ($p.tool_names.Count) { Redact-K ($p.tool_names -join ',') } else { 'none' })"
  $lines += "url_count: $($p.url_count)"
  $lines += "criterion_1: $(if ($Model -like 'claude-*') { "init.tools exactly Read/Grep/Glob = $toolsOk" } else { "self report (skills/plugins/mcp/web none) = $toolsOk" })"
  $lines += 'self_report_heuristic: ' + (($sr.GetEnumerator() | ForEach-Object { "$($_.Key)=$(if ($_.Value) { 'none' } else { '?' })" }) -join ' ') + " → $(if ($srOk) { 'ok' } else { 'NOT ok (read the raw answer)' })"
  $lines += "answer_10pct_10digits: $vat"
  $lines += "exit_code: $($r.exit) · duration_ms: $($p.duration_ms) · wall_ms: $($r.wall_ms) · transient_retries: $($res.transient_retries)"
  foreach ($k in $p.usage.Keys) { $lines += "usage_${k}: $($p.usage[$k])" }
  $lines += $p.extra
  $lines += "verdict: $verdict"
  $lines += '--- raw answer (local paths masked: %TEMP% · ~) ---'
  $lines += (Redact-K ([string]$p.text))
  $lines += '--- end ---'
  $lines += ''
  Add-Content -Path $CanaryFile -Value ($lines -join "`r`n") -Encoding utf8
  Write-Log "canary #$n (batch $BatchNo): $verdict · tool_calls=$($p.tool_calls) · urls=$($p.url_count) · criterion_1=$toolsOk · vat=$vat · model=$($p.observed_model) · wall_ms=$($r.wall_ms)"
  return $verdict
}

function Run-Banner {
  $script:CallCount++
  $b = Invoke-KBanner $RawDir
  $status = if ($b.ok) { 'PASS' } elseif ($b.transient) { 'TRANSIENT (account limit / API error — retried)' } else { 'FAIL (banner check failed — flag rejected, wrong model/effort/version, or CLI error)' }
  $rec = @("=== banner · model=$Model · $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · effort_flag=-c model_reasoning_effort=`"medium`" ===", "exit_code: $($b.exit) · wall_ms: $($b.wall_ms)", 'stdout+stderr (verbatim, session id line removed, local paths masked):')
  $rec += @($b.lines | ForEach-Object { Redact-K $_ })
  $rec += @("model_line: $($b.model_line)", "reasoning_effort_line: $($b.effort_line)", "version_line: $($b.version_line)", "banner_check: $(if ($b.ok) { 'PASS' } else { 'FAIL' })", '')
  Add-Line $CanaryFile ($rec -join "`r`n")
  Write-Log "banner: exit=$($b.exit) · $($b.version_line) · $($b.model_line) · $($b.effort_line) · check=$status"
  return $b
}

# ---- items ----------------------------------------------------------------------------------------
function Get-PrevInvalid($Item) { return @(Get-ChildItem -Path $RawDir -Filter "$($Item.id).invalid-*.txt" -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '\.invalid-\d+\.txt$' }).Count }
function Get-ItemState($Item) {
  $finalEv = Join-Path $EvDir "$($Item.id).txt"; $finalAns = Join-Path $AnsDir "$($Item.id).txt"
  if ((Test-Path $finalEv) -and (Test-Path $finalAns)) { $d = Read-Events $finalEv; if ($d['valid'] -eq 'true') { return 'valid' } else { return 'exhausted' } }
  return 'pending'
}

function Run-Item($Item, [int]$BatchNo, [int]$Index, [int]$Total) {
  $state = Get-ItemState $Item
  if ($state -ne 'pending') { Write-Log "[$Index/$Total] $($Item.id): skipped ($state)"; return $state }
  $prevInvalid = Get-PrevInvalid $Item
  $prompt = $FixedLine + "`n`n" + $Item.question
  $attempt = $prevInvalid
  $lastReason = ''
  while ($attempt -lt $KMaxAttempts) {
    $attempt++
    $base = Join-Path $RawDir "$($Item.id).attempt-$attempt"
    $res = Invoke-WithRetry $prompt $base $Item.id $attempt
    $p = $res.p; $r = $res.r
    if ($res.vd.kind -eq 'ok') {
      $text = [string]$p.text
      $masks = Get-KRedactCount $text
      [IO.File]::WriteAllText((Join-Path $AnsDir "$($Item.id).txt"), (Redact-KPath $text), $Utf8NoBom)
      Write-Events (Join-Path $EvDir "$($Item.id).txt") $Item $attempt $true $res $prevInvalid $res.vd.answer $masks
      Copy-Item -Path $res.raw -Destination (Join-Path $RawDir "$($Item.id).jsonl") -Force
      Write-Log "[$Index/$Total] $($Item.id): valid (attempt $attempt · answer=$($res.vd.answer) · read_calls=$($res.val.calls) · files=$($res.val.files.Count) · $($r.wall_ms) ms · chars=$($text.Length))"
      return 'valid'
    }
    # 무효 — 원응답과 이벤트 요약은 raw 에만(커밋 0)
    [IO.File]::WriteAllText((Join-Path $RawDir "$($Item.id).invalid-$attempt.txt"), [string]$p.text, $Utf8NoBom)
    Copy-Item -Path $res.raw -Destination (Join-Path $RawDir "$($Item.id).invalid-$attempt.jsonl") -Force
    $lastReason = $res.vd.reason
    Write-Retry $Item.id $attempt 'invalid' $res.vd.reason 0
    Write-Log "[$Index/$Total] $($Item.id): INVALID attempt $attempt — $($res.vd.reason) — $(if ($attempt -lt $KMaxAttempts) { 're-running' } else { 'no attempts left' })"
    $prevInvalid = $attempt
  }
  [IO.File]::WriteAllText((Join-Path $AnsDir "$($Item.id).txt"), '', $Utf8NoBom)
  Write-ExhaustedEvents (Join-Path $EvDir "$($Item.id).txt") $Item $lastReason
  Write-Log "[$Index/$Total] $($Item.id): INVALID after $KMaxAttempts attempts — recorded as WRONG (answer=none · D-160 ⓪)"
  return 'exhausted'
}
# 답안 본문의 로컬 경로(%TEMP% · 홈)만 자리 표시로 바꾼다 — URL 은 건드리지 않는다(유효성 ⑷ 가 이미 쟀다)
function Redact-KPath([string]$s) {
  if ($null -eq $s) { return '' }
  $r = $s
  foreach ($pp in $script:KPrefixes) { $r = [regex]::Replace($r, [regex]::Escape($pp[0]), $pp[1].Replace('$', '$$'), 'IgnoreCase') }
  return $r
}

# ---- completeness check + summary csv -------------------------------------------------------------
function Test-Complete {
  $items = Get-Items
  $batches = [int][Math]::Ceiling($items.Count / $BatchSize)
  $rows = @('model,id,source(10|41),valid,attempts,tool_calls,url_count,answer_chars,duration_ms,observed_model,files_read,outside_attempts,invalid_attempts,tokens_in,tokens_out,answer')
  $green = $true
  $report = @("=== CHECK $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · items expected per model = $($items.Count) · batch_size = $BatchSize (min canaries = $batches) ===")
  foreach ($m in $Models) {
    $ansDir = Join-Path $DataDir "K-50-answers\$m"; $evDir = Join-Path $DataDir "K-50-events\$m"; $canFile = Join-Path $DataDir "K-50-canary-$m.txt"
    $answers = 0; $valid = 0; $exhausted = 0; $pending = 0; $noAnswer = 0; $modelMismatch = 0; $retriesTransient = 0; $retriesInvalid = 0
    foreach ($it in $items) {
      $finalEv = Join-Path $evDir "$($it.id).txt"; $finalAns = Join-Path $ansDir "$($it.id).txt"
      if (Test-Path $finalAns) { $answers++ }
      if (-not ((Test-Path $finalEv) -and (Test-Path $finalAns))) { $pending++; continue }
      $d = Read-Events $finalEv
      $isValid = ($d['valid'] -eq 'true')
      if ($isValid) { $valid++ } else { $exhausted++ }
      if ($d['answer'] -eq 'none') { $noAnswer++ }
      if ($isValid -and $d['observed_model_match'] -ne 'true') { $modelMismatch++ }
      $obs = [string]$d['observed_model']; if ($isValid -and $d['observed_model_match'] -ne 'true') { $obs = "MISMATCH:$obs" }
      $rows += ('{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11},{12},{13},{14},{15}' -f $m, $it.id, $it.source, $(if ($isValid) { 'true' } else { 'false' }), $d['attempt'], $d['tool_calls'], $d['url_count'], $d['answer_chars'], $d['duration_ms'], ($obs -replace ',', ';'), $d['files_read'], $d['outside_attempts'], $d['invalid_attempts'], $d['tokens_in'], $d['tokens_out'], $d['answer'])
    }
    $canPass = 0; $canFail = 0; $bannerPass = 0; $bannerFail = 0; $lastBanner = ''
    if (Test-Path $canFile) {
      foreach ($l in [IO.File]::ReadAllLines($canFile, $Utf8NoBom)) {
        if ($l -eq 'verdict: PASS') { $canPass++ } elseif ($l -eq 'verdict: FAIL') { $canFail++ }
        elseif ($l -like 'banner_check: *') { if ($l -eq 'banner_check: PASS') { $bannerPass++; $lastBanner = 'PASS' } else { $bannerFail++; $lastBanner = 'FAIL' } }
      }
    }
    if (Test-Path $RetryLog) {
      foreach ($l in [IO.File]::ReadAllLines($RetryLog, $Utf8NoBom)) { if ($l -match "^\S+ \S+ \| $([regex]::Escape($m)) \| ") { if ($l -match '\| transient \|') { $retriesTransient++ } elseif ($l -match '\| invalid \|') { $retriesInvalid++ } } }
    }
    $integ = 'none'
    if (Test-Path $IntegrityLog) { $last = @([IO.File]::ReadAllLines($IntegrityLog, $Utf8NoBom) | Where-Object { $_ -match "\| $([regex]::Escape($m)) \| end \|" }) | Select-Object -Last 1; if ($last) { $integ = if ($last -match '\| same \|') { 'same' } else { 'DIFF' } } }
    $okModel = ($answers -eq $items.Count) -and ($pending -eq 0) -and ($canPass -ge $batches) -and ($canFail -eq 0) -and ($integ -eq 'same')
    if ($m -eq 'gpt-5.6-sol') { $okModel = $okModel -and ($bannerPass -ge 1) -and ($lastBanner -eq 'PASS') }
    if (-not $okModel) { $green = $false }
    $bannerTxt = if ($m -eq 'gpt-5.6-sol') { " · banner PASS=$bannerPass not-PASS=$bannerFail last=$lastBanner" } else { '' }
    $report += ("{0,-18} answers={1,3}/{2} valid={3,3} invalid(3x → WRONG)={4} no_answer={5} pending={6,3} canary PASS={7} FAIL={8}{9} · retries transient={10} invalid={11} · observed-model mismatches={12} (flag only) · folder integrity end={13} → {14}" -f $m, $answers, $items.Count, $valid, $exhausted, $noAnswer, $pending, $canPass, $canFail, $bannerTxt, $retriesTransient, $retriesInvalid, $modelMismatch, $integ, $(if ($okModel) { 'ok' } else { 'NOT ok' }))
  }
  Set-Content -Path $SummaryCsv -Value ($rows -join "`r`n") -Encoding utf8
  $rowCount = $rows.Count - 1
  $expectedRows = $items.Count * $Models.Count
  if ($rowCount -ne $expectedRows) { $green = $false }
  $chAbsent = -not (Test-Path -LiteralPath $CodexHome)
  $report += "summary rows = $rowCount / $expectedRows (K-50-summary.csv regenerated) · codexhome-T5 $(if ($chAbsent) { 'absent' } else { 'PRESENT (delete with -Phase cleanup at the end)' })"
  $report += "RESULT: $(if ($green) { 'GREEN' } else { 'RED' })"
  foreach ($l in $report) { Add-Content -Path $RunLog -Value $l -Encoding utf8; Write-Host $l }
  if ($green) { return 0 } else { return 1 }
}

function Write-Integrity([string]$M, [string]$When) {
  $f = Test-KFolder
  Add-Line $IntegrityLog ('{0} | {1} | {2} | {3} | files={4} expected={5} diff={6}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $M, $When, $(if ($f.same) { 'same' } else { 'DIFF' }), $f.files, $f.expected, $f.diff)
  return $f
}

# ---- main -----------------------------------------------------------------------------------------
if ($Check) { exit (Test-Complete) }
switch ($Phase) {
  'prompts' {
    $pd = Join-Path $RawRoot 'prompts'; New-Item -ItemType Directory -Force -Path $pd | Out-Null
    foreach ($it in (Get-Items)) {
      $pr = $FixedLine + "`n`n" + $it.question
      [IO.File]::WriteAllText((Join-Path $pd "$($it.id).txt"), $pr, $Utf8NoBom)
      $sha = ([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData($Utf8NoBom.GetBytes($pr))) -replace '-', '').ToLower()
      "{0,-22} chars={1,5} sha256={2}" -f $it.id, $pr.Length, $sha
    }
    "items=$(@(Get-Items).Count) · fixed line chars=$($FixedLine.Length) sha256=$(([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData($Utf8NoBom.GetBytes($FixedLine))) -replace '-', '').ToLower())"
    exit 0
  }
  'cleanup' {
    if (Test-Path -LiteralPath $CodexHome) { [IO.Directory]::Delete($CodexHome, $true) }
    $gone = -not (Test-Path -LiteralPath $CodexHome)
    Write-Host "cleanup codexhome-T5 deleted=$gone"
    if ($gone) { exit 0 } else { exit 1 }
  }
  'canary' {
    if (-not $Model) { $Model = 'all' }
    Resolve-KExes
    $ms = if ($Model -eq 'all') { $Models } else { @($Model) }
    $f0 = Test-KFolder
    if (-not $f0.same) { Write-Host "folder integrity broken before canaries (diff=$($f0.diff)) — stop"; exit 5 }
    $fail = 0
    foreach ($m in $ms) {
      $rows = Invoke-KCanaries $m (Join-Path $RawRoot 'canary')
      foreach ($row in $rows) { Write-Host $row; if ($row -notmatch ',PASS,') { $fail++ } }
    }
    $f1 = Test-KFolder
    Write-Host "folder integrity after canaries: $(if ($f1.same) { 'same' } else { "DIFF ($($f1.diff))" })"
    if ($fail -gt 0 -or -not $f1.same) { exit 2 } else { exit 0 }
  }
}
if (-not $Model -or $Model -eq 'all') { Write-Host 'specify -Model <claude-opus-5-5|claude-sonnet-5-5|gpt-5.6-sol> or -Check / -Phase prompts|canary|cleanup'; exit 2 }

Resolve-KExes
$RawDir     = Join-Path $RawRoot $Model
$AnsDir     = Join-Path $DataDir "K-50-answers\$Model"
$EvDir      = Join-Path $DataDir "K-50-events\$Model"
$CanaryFile = Join-Path $DataDir "K-50-canary-$Model.txt"
foreach ($d in $RawDir, $AnsDir, $EvDir) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
if (Test-Path $CanaryFile) { $script:CanaryNo = @([IO.File]::ReadAllLines($CanaryFile, $Utf8NoBom) | Where-Object { $_ -like '=== canary #*' }).Count }

$items = Get-Items
$runStart = Get-Date
$claudeVer = (& $script:KClaudeExe --version 2>&1 | Out-String).Trim()
$codexVer  = (& $script:KNodeExe $script:KCodexJs --version 2>&1 | Out-String).Trim()
Write-Log "=== START model=$Model · items=$($items.Count) (J-10 sample 60) · batch_size=$BatchSize · max_attempts=$KMaxAttempts · wall_clock=$KWallSec s · claude --version: $claudeVer · codex --version: $codexVer ==="
Write-Log "harness_dir=$HarnessDir · empty_mcp=$EmptyMcp · codex_home=$CodexHome · raw_dir=$RawDir (raw JSONL + invalid raw answers stay outside the repo)"
Write-Log ('prompt = fixed line + blank line + question (verbatim); fixed line: ' + $FixedLine)
if ($Model -like 'claude-*') {
  Write-Log ('command: $env:CLAUDECODE = $null; cwd=<HARNESS>; claude -p "<PROMPT>" --model ' + $Model + ' --tools "Read,Grep,Glob" --restricted --setting-sources "" --strict-mcp-config --mcp-config "<WORK>\empty-mcp.json" --disable-slash-commands --output-format stream-json --verbose --no-session-persistence  (stdin closed · stdout/stderr → <RAW> · wall clock 900 s)')
} else {
  Write-Log ('command: $env:CODEX_HOME = "<CODEXHOME>"; codex exec --skip-git-repo-check -s read-only -C "<HARNESS>" -m gpt-5.6-sol --json --ephemeral --ignore-user-config --ignore-rules --disable apps --disable plugins --disable image_generation --disable multi_agent -c ''web_search="disabled"'' -c ''mcp_servers={}'' -c ''skills.include_instructions=false'' -c ''model_reasoning_effort="medium"'' -c ''windows.sandbox="unelevated"'' "<PROMPT>"  (stdin closed = $null | · node <npm>\node_modules\@openai\codex\bin\codex.js · wall clock 900 s)')
  Write-Log ('banner command: same flags without --json, plus --color never, prompt "' + $KBannerPrompt + '" (model id + reasoning effort + version read from the banner)')
}

$fi = Write-Integrity $Model 'start'
if (-not $fi.same) { Write-Log "folder integrity broken at start (diff=$($fi.diff)) — stopping"; exit 5 }
if ($Model -eq 'gpt-5.6-sol' -and -not $NoBanner) {
  $bt = 0
  while ($true) {
    $b = Run-Banner
    if ($b.ok) { break }
    if (-not $b.transient) { Write-Log "banner FAILED (exit=$($b.exit)) — stopping (판K does not fall back to running without the effort flag)"; exit 3 }
    $bt++
    if ($bt -gt $KBackoff.Count) { Write-Log 'banner: transient retries exhausted — stopping'; exit 4 }
    $bw = $KBackoff[$bt - 1]
    Write-Retry 'banner' 1 'transient' "exit=$($b.exit)" $bw
    Write-Log "banner: transient (exit=$($b.exit)) — waiting $bw s"
    Start-Sleep -Seconds $bw
  }
}
$counts = @{ valid = 0; exhausted = 0; skipped = 0 }
$batches = [int][Math]::Ceiling($items.Count / $BatchSize)
for ($b = 0; $b -lt $batches; $b++) {
  $from = $b * $BatchSize; $to = [Math]::Min(($b + 1) * $BatchSize, $items.Count) - 1
  $slice = @($items[$from..$to])
  $pending = @($slice | Where-Object { (Get-ItemState $_) -eq 'pending' })
  if ($pending.Count -eq 0) { Write-Log "batch $($b + 1)/$batches (items $($from + 1)-$($to + 1)): nothing pending — skipped (no canary needed)"; $counts.skipped += $slice.Count; continue }
  Write-Log "batch $($b + 1)/$batches (items $($from + 1)-$($to + 1)): pending=$($pending.Count) — canary first"
  $v = Run-Canary ($b + 1)
  if ($v -ne 'PASS') { Write-Log "batch $($b + 1): canary FAILED — run stopped. Fix the environment and re-run; the canary runs again before this batch continues."; exit 2 }
  for ($i = 0; $i -lt $slice.Count; $i++) {
    $st = Run-Item $slice[$i] ($b + 1) ($from + $i + 1) $items.Count
    if ($st -eq 'valid') { $counts.valid++ } elseif ($st -eq 'exhausted') { $counts.exhausted++ } else { $counts.skipped++ }
  }
}
$fe = Write-Integrity $Model 'end'
if (-not $fe.same) { Write-Log "FOLDER INTEGRITY DIFF at end (diff=$($fe.diff)) — this model's run is flagged INVALID (D-160 ⓪ · K-00 §6)" }
$elapsed = (Get-Date) - $runStart
Write-Log "=== END model=$Model · this run: valid=$($counts.valid) · INVALID(3x → WRONG)=$($counts.exhausted) · skipped(already done)=$($counts.skipped) · CLI calls=$($script:CallCount) · folder integrity end=$(if ($fe.same) { 'same' } else { 'DIFF' }) · wall=$([int]$elapsed.TotalSeconds) s ($($elapsed.ToString('hh\:mm\:ss'))) ==="
exit 0
