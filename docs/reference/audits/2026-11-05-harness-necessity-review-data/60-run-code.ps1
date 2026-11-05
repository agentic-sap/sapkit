#Requires -Version 7.0
<#
60-run-code.ps1 — 판J T6 「코드 시험 응시 + 동봉 검사기 채점」 러너 (2026-11-05)
=====================================================================================
무엇을 하나
  코드 과제 14종(11-code-tasks.txt C-01~C-05 · 41-reproducible-items.json kind=code 9종)을
  「맨 모델」 3종(claude-opus-5-5 · claude-sonnet-5-5 · gpt-5.6-sol)에게 02-isolation-recipe.txt 의
  블라인드 레시피 그대로 던지고, 응답에서 ABAP 을 기계 추출해 동봉 검사기(lint·parse·analyze)로 채점한다.
  이 세션 모델은 ABAP 을 한 줄도 쓰지 않는다 — 응답은 무편집으로 저장한다.

레시피 대비 편차 (T6 에 허용된 셋뿐)
  1. 블라인드 폴더·Codex 홈이 T6 전용이다: %TEMP%\sapkit-panJ\blind-T6\ (empty-mcp.json 하나) ·
     %TEMP%\sapkit-panJ\codexhome-T6\ (auth.json 사본 하나 · 끝나면 .NET 호출로 통째 삭제)
  2. Codex 에 -c model_reasoning_effort="medium" 을 더한다 (배너 실행으로 확인 · 60-canary-gpt-5.6-sol.txt)
  3. 원 이벤트 스트림(JSONL)은 %TEMP%\sapkit-panJ\raw-T6\<model>\<id>.jsonl 에 둔다 (레포 밖 · 커밋하지 않음)

사용 (PowerShell 7 · 레포 안 어디서든)
  pwsh -NoProfile -File 60-run-code.ps1 -Phase check                       완전성 검사 (RED/GREEN · exit 0/1)
  pwsh -NoProfile -File 60-run-code.ps1 -Phase prompts                     프롬프트 14종 생성·sha256 표 (모델 호출 없음)
  pwsh -NoProfile -File 60-run-code.ps1 -Phase canary -Model <m>           카나리아 (모델별 첫 호출 · §0 프롬프트)
  pwsh -NoProfile -File 60-run-code.ps1 -Phase run -Model <m> [-Only id,…] 과제 14종 응시 (멱등 · 끝난 과제는 건너뜀)
  pwsh -NoProfile -File 60-run-code.ps1 -Phase reextract [-Model <m>]      저장된 JSONL 에서 raw/code/events 재도출 (모델 호출 없음)
  pwsh -NoProfile -File 60-run-code.ps1 -Phase score                       검사기 채점 → 60-checker/ · 60-checker-summary.csv
  pwsh -NoProfile -File 60-run-code.ps1 -Phase cleanup                     codexhome-T6 삭제·확인

멱등·재개
  (모델, 과제) 상태는 raw-T6\<model>\<id>.state.json 에 있다. done 이면 건너뛴다. 호출마다 JSONL 은
  <id>.call-<k>.jsonl 로 남고, 최종 유효 호출은 <id>.jsonl 로 복사된다.

유효성 (spec B-5)
  무효 = 추출된 도구 호출 > 0 (Claude: tool_use 블록 · Codex: item.type ∉ {agent_message, reasoning, error}
  인 item.completed — command_execution 도 무효) 또는 응답에 https?:// 가 있음. 무효면 같은 과제를 최대 3회
  응시, 무효 원응답은 60-raw/<model>/<id>.invalid-<n>.txt. 3회 모두 무효면 INVALID (코드 추출 없음).
  전이 오류(결과 없음 · is_error · exit≠0 · turn.failed 등)는 응시 횟수에 넣지 않고 60·120·240·480·900·900·900·900 s
  백오프로 같은 과제를 재시도한다 (60-retries.txt 에 기록). 8회 넘으면 중단(재개 가능).

코드 추출 규칙 (기계 적용 · 60-run-log.txt 에도 적음)
  원응답에서 「마지막 완결 펜스 블록」을 취한다 — 여는 펜스 = ``` 로 시작하는 줄(언어 태그 허용) ·
  닫는 펜스 = ``` 만 있는 줄. 펜스 두 줄을 떼고 안의 줄들을 LF 로 이어 끝에 LF 하나를 둔다.
  완결 블록이 없으면 원응답 전체를 .abap 으로 저장하고 no_fence=1. 블록이 둘 이상이면 blocks=N.
  코드는 절대 손대지 않는다.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('check', 'prompts', 'canary', 'run', 'reextract', 'score', 'cleanup')]
  [string]$Phase,
  [ValidateSet('claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol', 'all')]
  [string]$Model = 'all',
  [string[]]$Only = @(),
  [switch]$NoCodexReasoningFlag   # 편차 2 가 거부될 때만 — 배너로 거부를 확인한 뒤 쓴다
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
$CheckerRel = 'interactive/checker/sapkit-checker.bundle.cjs'
$Tmp = Join-Path $env:TEMP 'sapkit-panJ'
$Blind = Join-Path $Tmp 'blind-T6'
$CodexHome = Join-Path $Tmp 'codexhome-T6'
$RawRoot = Join-Path $Tmp 'raw-T6'
$AllModels = @('claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol')
$CodexModel = 'gpt-5.6-sol'
$RetriesPath = Join-Path $Data '60-retries.txt'
$Backoff = @(60, 120, 240, 480, 900, 900, 900, 900)
$MaxTransient = $Backoff.Count
$MaxAttempts = 3
$CodexExtra = if ($NoCodexReasoningFlag) { @() } else { @('-c', 'model_reasoning_effort="medium"') }
$NodeExe = (Get-Command node -CommandType Application | Select-Object -First 1).Source

# 프롬프트 고정 줄 (세 모델 공통 · 과제마다 동일 · 글자 그대로)
$FixedLine = @'
Write the complete ABAP source as a single file and return it in one ```abap code block, with no explanation outside the block. Do not use any tool, file, shell, or web search. (도구·파일·셸·웹 검색을 쓰지 말고, 설명 없이 단일 파일 ABAP 소스를 ```abap 코드 블록 하나로만 돌려줘.)
'@
# 카나리아 프롬프트 (02-isolation-recipe.txt §0 · 글자 그대로)
$CanaryPrompt = @'
First, list every tool, skill, plugin, MCP server, slash command, web/search capability and file you currently have access to (say 'none' if none). Do not use any tool or web search. Second, answer from memory in one line: what is the standard VAT rate in Korea and how many digits does the Korean business registration number have?
'@
# Codex 배너 실행 프롬프트 (02-isolation-recipe.txt §3 · 글자 그대로)
$BannerPrompt = 'Reply with exactly the single word OK and nothing else. Do not use any tool.'

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
  $line = "$(Now) [$tag] $msg"
  Write-Host $line
  Ensure-Dir $RawRoot
  [IO.File]::AppendAllText((Join-Path $RawRoot "_progress-$tag.txt"), $line + "`n", $Utf8)
}
function Redact([string]$s) {
  # 자료 폴더에는 URL 을 적지 않는다(README) — CLI 오류문에 든 URL 만 가린다. 모델 원응답(60-raw)은 무편집이다.
  if ($null -eq $s) { return '' }
  return ($s -replace 'https?://[^\s)\]>"'']+', '<url>')
}
function Add-RetryLine([string]$line) {
  # 모델별 배치가 병렬로 돌 수 있어 명명 뮤텍스로 직렬화한다
  $m = [Threading.Mutex]::new($false, 'Global\sapkit-panJ-T6-retries')
  [void]$m.WaitOne(30000)
  try { [IO.File]::AppendAllText($RetriesPath, (Redact $line) + "`n", $Utf8) } finally { $m.ReleaseMutex(); $m.Dispose() }
}
function Get-ResetWait([string]$reason) {
  # 사용량 한도 오류문의 「try again at H:MM AM/PM」 을 읽어 그 시각 + 60 s 까지의 초를 돌려준다 (없으면 0 · 2 시간 상한 넘으면 -1 = 중단)
  $m = [regex]::Match($reason, 'try again at (\d{1,2}):(\d{2})\s*(AM|PM)', 'IgnoreCase')
  if (-not $m.Success) { return 0 }
  $h = [int]$m.Groups[1].Value; $mi = [int]$m.Groups[2].Value; $ap = $m.Groups[3].Value.ToUpper()
  if ($ap -eq 'PM' -and $h -lt 12) { $h += 12 } elseif ($ap -eq 'AM' -and $h -eq 12) { $h = 0 }
  $target = (Get-Date).Date.AddHours($h).AddMinutes($mi)
  if ($target -lt (Get-Date)) { $target = $target.AddDays(1) }
  $secs = [int]([math]::Ceiling(($target - (Get-Date)).TotalSeconds)) + 60
  if ($secs -gt 7200) { return -1 }
  return $secs
}
function Invoke-Native([string]$file, [string[]]$argv, [string]$cwd) {
  # 검사기 전용 — stdout·stderr 를 UTF-8 원문 그대로 받고 exit 코드를 돌려준다 (레시피 호출은 레시피 형태 그대로 둔다)
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
  # 11-code-tasks.txt — C-0N 블록의 task_text / required_output (4칸 들여쓰기만 떼고 줄 구조는 그대로)
  $lines = [IO.File]::ReadAllLines((Join-Path $Data '11-code-tasks.txt'), $Utf8)
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
  # 41-reproducible-items.json — kind == code 만
  $j41 = Get-Content -Raw -Encoding utf8 (Join-Path $Data '41-reproducible-items.json') | ConvertFrom-Json
  foreach ($it in $j41.items) {
    if ($it.kind -eq 'code') {
      $tasks.Add([pscustomobject]@{ id = $it.id; source = '41'; task_text = [string]$it.task_text; required_output = [string]$it.required_output })
    }
  }
  if ($tasks.Count -ne 14) { throw "expected 14 tasks, got $($tasks.Count)" }
  return $tasks
}
function Build-Prompt($t) { return $FixedLine + "`n`n" + $t.task_text + "`n`n" + 'Required output: ' + $t.required_output }
function Select-Tasks { $all = Get-Tasks; if ($Only.Count -eq 0) { return $all }; return @($all | Where-Object { $Only -contains $_.id }) }
function Models-For([string]$m) { if ($m -eq 'all') { return $AllModels }; return @($m) }

# ---------- 환경 준비 ----------
function Initialize-Env([string]$model) {
  Ensure-Dir $Blind
  $mcp = Join-Path $Blind 'empty-mcp.json'
  if (-not (Test-Path -LiteralPath $mcp)) { Set-Content -Path $mcp -Value '{"mcpServers":{}}' -Encoding utf8 }
  $extra = @(Get-ChildItem -LiteralPath $Blind -Force | Where-Object { $_.Name -ne 'empty-mcp.json' })
  if ($extra.Count -gt 0) { Write-Log "WARN blind-T6 has extra entries: $($extra.Name -join ', ')" $model }
  if ($model -eq $CodexModel) {
    Ensure-Dir $CodexHome
    $auth = Join-Path $CodexHome 'auth.json'
    if (-not (Test-Path -LiteralPath $auth)) { Copy-Item -LiteralPath (Join-Path $HOME '.codex\auth.json') -Destination $auth }
  }
  Ensure-Dir (Join-Path $RawRoot $model)
  Ensure-Dir (Join-Path $RawRoot 'prompts')
  Ensure-Dir (Join-Path $RawRoot 'canary')
  foreach ($d in '60-raw', '60-code', '60-events', '60-checker') { Ensure-Dir (Join-Path $Data "$d\$model") }
  if (-not (Test-Path -LiteralPath $RetriesPath)) {
    Write-Utf8 $RetriesPath ("60-retries.txt — 판J T6 재시도 기록 (전이 오류 백오프 재시도 · 무효 응답 재응시) · 2026-11-05`n" +
      "형식: 시각 | 모델 | 과제 | call k | 종류 | 사유 | 조치     (전이 = 응시 횟수에 안 셈 · 무효 = 응시 횟수에 셈 · 최대 3회)`n" +
      "백오프: 60 · 120 · 240 · 480 · 900 · 900 · 900 · 900 초 (8회 넘으면 중단 · 재개 가능)`n")
  }
}

# ---------- CLI 호출 (02-isolation-recipe.txt 의 명령 줄 그대로 · 모델 id · 프롬프트 · 출력 파일만 자리) ----------
function Invoke-ClaudeCall([string]$model, [string]$prompt, [string]$outf, [string]$errf) {
  $env:CLAUDECODE = $null   # 레시피 §2 — 중첩 기동 방지 (Remove-Item Env: 는 쓰지 않는다)
  Push-Location -LiteralPath $Blind
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    claude -p $prompt --model $model --tools "" --setting-sources "" --strict-mcp-config --mcp-config "$Blind\empty-mcp.json" --disable-slash-commands --output-format stream-json --verbose --no-session-persistence > $outf 2> $errf
    $code = $LASTEXITCODE
    $sw.Stop()
  } finally { Pop-Location }
  return @{ exit = $code; wall_ms = $sw.ElapsedMilliseconds }
}
function Invoke-CodexCall([string]$prompt, [string]$outf, [string]$errf, [bool]$Json) {
  $env:CODEX_HOME = $CodexHome   # 레시피 §3 — 임시 홈 (auth.json 사본만)
  Push-Location -LiteralPath $Blind
  try {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    if ($Json) {
      $null | codex exec --skip-git-repo-check -s read-only -C $Blind -m gpt-5.6-sol --json --ephemeral --ignore-user-config --ignore-rules --disable apps --disable plugins --disable image_generation --disable multi_agent -c 'web_search="disabled"' -c 'mcp_servers={}' -c 'skills.include_instructions=false' @CodexExtra $prompt > $outf 2> $errf
    } else {
      $null | codex exec --skip-git-repo-check -s read-only -C $Blind -m gpt-5.6-sol --ephemeral --ignore-user-config --ignore-rules --disable apps --disable plugins --disable image_generation --disable multi_agent -c 'web_search="disabled"' -c 'mcp_servers={}' -c 'skills.include_instructions=false' @CodexExtra --color never $prompt > $outf 2> $errf
    }
    $code = $LASTEXITCODE
    $sw.Stop()
  } finally { Pop-Location }
  return @{ exit = $code; wall_ms = $sw.ElapsedMilliseconds }
}

# ---------- 이벤트 추출 (레시피 §2·§3 의 추출법) ----------
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
function Classify($ev, $call) {
  if ($ev.kind -eq 'claude') {
    if ($null -eq $ev.result) { return @{ kind = 'transient'; reason = "no result event (exit=$($call.exit))" } }
    if ($ev.result.is_error) { $msg = [string]$ev.raw; if ($msg.Length -gt 200) { $msg = $msg.Substring(0, 200) }; return @{ kind = 'transient'; reason = "is_error=true (exit=$($call.exit)) $msg" } }
    if ($call.exit -ne 0) { return @{ kind = 'transient'; reason = "exit=$($call.exit)" } }
    if ([string]::IsNullOrWhiteSpace($ev.raw)) { return @{ kind = 'transient'; reason = 'empty result text' } }
    if ($ev.tool_use -gt 0 -or $ev.urls -gt 0) { return @{ kind = 'invalid'; reason = "tool_use=$($ev.tool_use) [$($ev.tool_names -join ',')] urls=$($ev.urls)" } }
    return @{ kind = 'valid'; reason = '' }
  }
  if (-not $ev.thread_started) { return @{ kind = 'transient'; reason = "no thread.started (exit=$($call.exit)) $($ev.top_errors -join ' | ')" } }
  if ($ev.turn_failed -gt 0 -or $ev.top_errors.Count -gt 0) { return @{ kind = 'transient'; reason = "turn.failed=$($ev.turn_failed) errors: $(@($ev.errors + $ev.top_errors) -join ' | ')" } }
  if ($call.exit -ne 0) { return @{ kind = 'transient'; reason = "exit=$($call.exit) $($ev.errors -join ' | ')" } }
  if ($ev.raws.Count -eq 0) { return @{ kind = 'transient'; reason = "no agent_message $($ev.errors -join ' | ')" } }
  if ($ev.calls.Count -gt 0 -or $ev.urls -gt 0) { return @{ kind = 'invalid'; reason = "tool_calls=$($ev.calls.Count) [$($ev.calls -join ' ; ')] urls=$($ev.urls)" } }
  return @{ kind = 'valid'; reason = '' }
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
  return [ordered]@{ model = $model; id = $id; calls = 0; attempts = 0; transient = 0; invalid = @(); history = @(); done = $false; valid = $false; final = ''; final_call = 0 }
}
function Save-State($st) { Write-Utf8 (State-Path $st.model $st.id) (ConvertTo-Json -InputObject $st -Depth 10) }

# ---------- 이벤트 요약 파일 ----------
function Write-EventsFile([string]$model, $t, $st, $ev, $call, $ext) {
  $id = $t.id
  $L = [System.Collections.Generic.List[string]]::new()
  $L.Add("$model · $id — 블라인드 코드 과제 이벤트 추출 요약 (판J T6 · 2026-11-05)")
  $L.Add("원본: %TEMP%\sapkit-panJ\raw-T6\$model\$id.jsonl (원 이벤트 스트림 · 세션/스레드 id·로컬 경로 포함 · 커밋하지 않음 · 호출별 사본 $id.call-<k>.jsonl)")
  if ($model -eq $CodexModel) {
    $L.Add("명령: 02-isolation-recipe.txt §3 그대로 + 편차 2 (-c model_reasoning_effort=`"medium`" · 배너 확인 60-canary-gpt-5.6-sol.txt) · cwd = blind-T6")
  } else {
    $L.Add("명령: 02-isolation-recipe.txt §2 그대로 · 모델 id $model · cwd = blind-T6")
  }
  $L.Add("프롬프트: 60-run-log.txt 의 프롬프트 계약 (고정 줄 + task_text + Required output) · chars=$($t.prompt_chars) · sha256=$($t.prompt_sha)")
  $L.Add("응시(응답) 횟수=$($st.attempts) · 전이 재시도=$($st.transient) · CLI 호출 총수=$($st.calls) · 최종=$($st.final) (call $($st.final_call))")
  foreach ($h in @($st.history)) {
    if ($h.kind -eq 'valid') { continue }
    $L.Add("  call $($h.call): $($h.kind) — $(Redact $h.reason) · exit=$($h.exit) · wall_ms=$($h.wall_ms) · $($h.ts_start) → $($h.ts_end)")
  }
  foreach ($iv in @($st.invalid)) {
    $L.Add("  무효 응시 $($iv.attempt)/$MaxAttempts (call $($iv.call)): $(Redact $iv.reason) · 원응답 → 60-raw/$model/$id.invalid-$($iv.attempt).txt")
  }
  if ($ev.kind -eq 'claude') {
    $init = $ev.init
    if ($null -ne $init) {
      $plugins = @($init.plugins | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.name } })
      $L.Add("system/init: model=$($init.model) · claude_code_version=$($init.claude_code_version) · permissionMode=$($init.permissionMode)")
      $L.Add("  tools=$(CountOf $init.tools) · mcp_servers=$(CountOf $init.mcp_servers) · slash_commands=$(CountOf $init.slash_commands) · skills=$(CountOf $init.skills) · plugins=$(CountOf $init.plugins) [$($plugins -join ',')] · agents=$(CountOf $init.agents)")
    } else { $L.Add('system/init: (없음)') }
    $L.Add("assistant 이벤트 수=$($ev.asst_count) · assistant.message.model=[$($ev.asst_models -join ',')]")
    $L.Add("도구 호출(tool_use 블록) 수=$($ev.tool_use) · 이름: $(if ($ev.tool_names.Count -gt 0) { $ev.tool_names -join ',' } else { '없음' })")
    $res = $ev.result
    if ($null -ne $res) {
      $mu = @($res.modelUsage.PSObject.Properties.Name)
      $L.Add("result: is_error=$($res.is_error) · num_turns=$($res.num_turns) · duration_ms=$($res.duration_ms) · duration_api_ms=$($res.duration_api_ms) · modelUsage 키=[$($mu -join ',')]")
      $u = $res.usage
      $L.Add("usage: input_tokens=$($u.input_tokens) · output_tokens=$($u.output_tokens) · cache_creation_input_tokens=$($u.cache_creation_input_tokens) · cache_read_input_tokens=$($u.cache_read_input_tokens)")
      $observed = @(@($init.model) + $ev.asst_models + $mu | Where-Object { $_ } | Select-Object -Unique)
      $L.Add("관측 모델 id=[$($observed -join ',')] · 요청=$model · 일치=$(if ($observed.Count -eq 1 -and $observed[0] -eq $model) { 1 } else { 0 })")
    } else { $L.Add('result: (없음)') }
  } else {
    $L.Add('관측 모델 id: gpt-5.6-sol (배너 · 60-canary-gpt-5.6-sol.txt — --json 이벤트에는 모델 id 가 없다)')
    $hs = @($ev.hist.Keys | Sort-Object | ForEach-Object { "$_=$($ev.hist[$_])" })
    $L.Add("events: thread.started=$($ev.thread_started) · item.completed 유형 히스토그램: $(if ($hs.Count) { $hs -join ', ' } else { '(없음)' })")
    $L.Add("도구 호출 수(item.type ∉ {agent_message, reasoning, error})=$($ev.calls.Count) · 이름: $(if ($ev.calls.Count -gt 0) { $ev.calls -join ' ; ' } else { '없음' })")
    $u = $ev.usage
    if ($null -ne $u) { $L.Add("usage: input_tokens=$($u.input_tokens) · cached_input_tokens=$($u.cached_input_tokens) · output_tokens=$($u.output_tokens) · reasoning_output_tokens=$($u.reasoning_output_tokens)") } else { $L.Add('usage: (turn.completed 없음)') }
    $L.Add("error 항목=$($ev.errors.Count) · turn.failed=$($ev.turn_failed) · 최상위 error 이벤트=$($ev.top_errors.Count)$(if ($ev.errors.Count -or $ev.top_errors.Count) { ' — ' + (Redact (@($ev.errors + $ev.top_errors) -join ' | ')) } else { '' })")
  }
  $L.Add("exit_code=$($call.exit) · wall_ms=$($call.wall_ms) · stderr 줄 수=$(Count-FileLines $call.errf) · 시작=$($call.ts_start) · 종료=$($call.ts_end)")
  $L.Add("응답 내 외부 URL(https?://) 건수=$($ev.urls)")
  $L.Add("valid=$(if ($st.valid) { 1 } else { 0 })")
  if ($st.valid) {
    $L.Add("펜스 블록 수=$($ext.blocks) · no_fence=$($ext.no_fence) · 추출 → 60-code/$model/$id.abap (lines=$($ext.lines) · bytes=$($ext.bytes))")
    $L.Add("summary: valid=1 attempts=$($st.attempts) no_fence=$($ext.no_fence) blocks=$($ext.blocks) lines=$($ext.lines) bytes=$($ext.bytes)")
  } else {
    $L.Add('코드 추출 없음 (INVALID — 3회 모두 무효)')
    $L.Add("summary: valid=0 attempts=$($st.attempts) no_fence= blocks=")
  }
  Write-Utf8 (Join-Path $Data "60-events\$model\$id.txt") (($L -join "`n") + "`n")
}
function Complete-Task([string]$model, $t, $st, $ev, $call) {
  $ext = $null
  if ($st.valid) {
    Write-Utf8 (Join-Path $Data "60-raw\$model\$($t.id).txt") $ev.raw
    $ext = Extract-Code $ev.raw
    Write-Utf8 (Join-Path $Data "60-code\$model\$($t.id).abap") $ext.code
    $ext.lines = Count-Lines $ext.code
    $ext.bytes = $Utf8.GetByteCount($ext.code)
  }
  Write-EventsFile $model $t $st $ev $call $ext
}

# ---------- 과제 실행 루프 ----------
function Run-Model([string]$model) {
  Initialize-Env $model
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
      $call.ts_start = $ts0; $call.ts_end = Now; $call.k = $k; $call.jsonl = $jsonl; $call.errf = $errf
      $ev = if ($model -eq $CodexModel) { Read-CodexEvents $jsonl } else { Read-ClaudeEvents $jsonl }
      $cls = Classify $ev $call
      Write-Log "$($t.id) call $k end exit=$($call.exit) wall_ms=$($call.wall_ms) → $($cls.kind) $($cls.reason)" $model
      $st.history += @{ call = $k; kind = $cls.kind; reason = $cls.reason; exit = $call.exit; wall_ms = $call.wall_ms; ts_start = $ts0; ts_end = $call.ts_end }
      if ($cls.kind -eq 'transient') {
        $st.transient++
        Save-State $st
        if ($st.transient -gt $MaxTransient) {
          Add-RetryLine "$(Now) | $model | $($t.id) | call $k | transient | $($cls.reason) | 중단 — 전이 재시도 $MaxTransient 회 초과 (재개 가능)"
          throw "giving up on $model $($t.id): transient retries exceeded $MaxTransient"
        }
        $wait = $Backoff[$st.transient - 1]
        $reset = Get-ResetWait $cls.reason
        if ($reset -lt 0) {
          Add-RetryLine "$(Now) | $model | $($t.id) | call $k | transient | $($cls.reason) | 중단 — 사용량 한도 해제 시각이 2 시간 밖 (재개 가능)"
          throw "giving up on $model $($t.id): usage-limit reset is more than 2 h away"
        }
        $note = ''
        if ($reset -gt $wait) { $wait = $reset; $note = ' (사용량 한도 해제 시각 + 60 s 까지)' }
        Add-RetryLine "$(Now) | $model | $($t.id) | call $k | transient | $($cls.reason) | ${wait}s 대기$note 후 같은 과제 재시도"
        Start-Sleep -Seconds $wait
        continue
      }
      $st.attempts++
      $n = $st.attempts
      if ($cls.kind -eq 'invalid') {
        Write-Utf8 (Join-Path $Data "60-raw\$model\$($t.id).invalid-$n.txt") $ev.raw
        $st.invalid += @{ attempt = $n; call = $k; reason = $cls.reason }
        if ($n -ge $MaxAttempts) {
          Add-RetryLine "$(Now) | $model | $($t.id) | call $k | invalid $n/$MaxAttempts | $($cls.reason) | INVALID 확정 (코드 추출 없음)"
          $st.done = $true; $st.valid = $false; $st.final = 'INVALID'; $st.final_call = $k
          Complete-Task $model $t $st $ev $call
        } else {
          Add-RetryLine "$(Now) | $model | $($t.id) | call $k | invalid $n/$MaxAttempts | $($cls.reason) | 즉시 재응시"
        }
        Save-State $st
        continue
      }
      $st.done = $true; $st.valid = $true; $st.final = 'VALID'; $st.final_call = $k
      Copy-Item -LiteralPath $jsonl -Destination (Join-Path $RawRoot "$model\$($t.id).jsonl") -Force
      Complete-Task $model $t $st $ev $call
      Save-State $st
    }
  }
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
    $call = @{ exit = $h.exit; wall_ms = $h.wall_ms; ts_start = $h.ts_start; ts_end = $h.ts_end; k = $k; jsonl = $jsonl; errf = (Join-Path $RawRoot "$model\$($t.id).call-$k.stderr.txt") }
    $ev = if ($model -eq $CodexModel) { Read-CodexEvents $jsonl } else { Read-ClaudeEvents $jsonl }
    Complete-Task $model $t $st $ev $call
    Write-Log "reextract $($t.id) ok (final=$($st.final))" $model
  }
}

# ---------- 카나리아 (모델별 첫 호출 · 레시피 §0 프롬프트 · 기준 ②③ 기계 판정 · ① 은 T6 세션이 판독해 아래에 덧붙인다) ----------
function Run-Canary([string]$model) {
  Initialize-Env $model
  $dir = Join-Path $RawRoot 'canary'
  $jsonl = Join-Path $dir "$model.jsonl"; $errf = Join-Path $dir "$model.stderr.txt"
  $ts0 = Now
  Write-Log 'canary start' $model
  $call = if ($model -eq $CodexModel) { Invoke-CodexCall $CanaryPrompt $jsonl $errf $true } else { Invoke-ClaudeCall $model $CanaryPrompt $jsonl $errf }
  $ts1 = Now
  $ev = if ($model -eq $CodexModel) { Read-CodexEvents $jsonl } else { Read-ClaudeEvents $jsonl }
  $L = [System.Collections.Generic.List[string]]::new()
  $L.Add("60-canary-$model.txt — 판J T6 카나리아 (02-isolation-recipe.txt §0 프롬프트 글자 그대로 · 2026-11-05)")
  if ($model -eq $CodexModel) {
    $L.Add('명령: 02-isolation-recipe.txt §3 그대로 + T6 편차 2 (-c model_reasoning_effort="medium") · 편차 1 (blind-T6 · codexhome-T6 fresh 홈 · auth.json 사본만) · cwd = blind-T6')
    $L.Add('  $null | codex exec --skip-git-repo-check -s read-only -C <blind-T6> -m gpt-5.6-sol --json --ephemeral --ignore-user-config --ignore-rules --disable apps --disable plugins --disable image_generation --disable multi_agent -c ''web_search="disabled"'' -c ''mcp_servers={}'' -c ''skills.include_instructions=false'' -c ''model_reasoning_effort="medium"'' "<프롬프트>" > <raw-T6>\canary\gpt-5.6-sol.jsonl 2> <…>.stderr.txt')
  } else {
    $L.Add("명령: 02-isolation-recipe.txt §2 그대로 (모델 id $model) · T6 편차 1 (blind-T6) · `$env:CLAUDECODE = `$null · cwd = blind-T6")
    $L.Add("  claude -p `"<프롬프트>`" --model $model --tools `"`" --setting-sources `"`" --strict-mcp-config --mcp-config <blind-T6>\empty-mcp.json --disable-slash-commands --output-format stream-json --verbose --no-session-persistence > <raw-T6>\canary\$model.jsonl 2> <…>.stderr.txt")
  }
  $L.Add("시작=$ts0 · 종료=$ts1 · exit=$($call.exit) · wall_ms=$($call.wall_ms) · stderr 줄 수=$(Count-FileLines $errf)")
  $L.Add('원응답 (무편집):')
  $L.Add('----- BEGIN RAW -----')
  $L.Add([string]$ev.raw)
  $L.Add('----- END RAW -----')
  if ($ev.kind -eq 'claude') {
    $init = $ev.init
    if ($null -ne $init) {
      $plugins = @($init.plugins | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.name } })
      $L.Add("system/init: model=$($init.model) · claude_code_version=$($init.claude_code_version) · permissionMode=$($init.permissionMode)")
      $L.Add("  tools=$(CountOf $init.tools) · mcp_servers=$(CountOf $init.mcp_servers) · slash_commands=$(CountOf $init.slash_commands) · skills=$(CountOf $init.skills) · plugins=$(CountOf $init.plugins) [$($plugins -join ',')] · agents=$(CountOf $init.agents) [$(@($init.agents) -join ',')]")
    } else { $L.Add('system/init: (없음)') }
    $L.Add("assistant 이벤트 수=$($ev.asst_count) · assistant.message.model=[$($ev.asst_models -join ',')]")
    $L.Add("도구 호출(tool_use 블록) 수=$($ev.tool_use) · 이름: $(if ($ev.tool_names.Count -gt 0) { $ev.tool_names -join ',' } else { '없음' })")
    $res = $ev.result
    if ($null -ne $res) {
      $mu = @($res.modelUsage.PSObject.Properties.Name)
      $L.Add("result: is_error=$($res.is_error) · num_turns=$($res.num_turns) · duration_ms=$($res.duration_ms) · duration_api_ms=$($res.duration_api_ms) · modelUsage 키=[$($mu -join ',')]")
      $u = $res.usage
      $L.Add("usage: input_tokens=$($u.input_tokens) · output_tokens=$($u.output_tokens) · cache_creation_input_tokens=$($u.cache_creation_input_tokens) · cache_read_input_tokens=$($u.cache_read_input_tokens)")
    }
    $toolCalls = $ev.tool_use
  } else {
    $hs = @($ev.hist.Keys | Sort-Object | ForEach-Object { "$_=$($ev.hist[$_])" })
    $L.Add("events: thread.started=$($ev.thread_started) · item.completed 유형 히스토그램: $(if ($hs.Count) { $hs -join ', ' } else { '(없음)' })")
    $L.Add("도구 호출 수(item.type ∉ {agent_message, reasoning, error})=$($ev.calls.Count) · 이름: $(if ($ev.calls.Count -gt 0) { $ev.calls -join ' ; ' } else { '없음' })")
    $u = $ev.usage
    if ($null -ne $u) { $L.Add("usage: input_tokens=$($u.input_tokens) · cached_input_tokens=$($u.cached_input_tokens) · output_tokens=$($u.output_tokens) · reasoning_output_tokens=$($u.reasoning_output_tokens)") }
    $L.Add("error 항목=$($ev.errors.Count) · turn.failed=$($ev.turn_failed) · 최상위 error 이벤트=$($ev.top_errors.Count)$(if ($ev.errors.Count -or $ev.top_errors.Count) { ' — ' + (Redact (@($ev.errors + $ev.top_errors) -join ' | ')) } else { '' })")
    $toolCalls = $ev.calls.Count
  }
  $L.Add("응답 내 외부 URL(https?://) 건수=$($ev.urls)")
  $L.Add("기준 ② 도구 호출 0건: $(if ($toolCalls -eq 0) { 'PASS' } else { 'FAIL' }) ($toolCalls)")
  $L.Add("기준 ③ 외부 URL 0건: $(if ($ev.urls -eq 0) { 'PASS' } else { 'FAIL' }) ($($ev.urls))")
  $L.Add('기준 ① 모델 자기 보고(스킬·플러그인·MCP·프로젝트 파일·웹 없음): T6 세션이 원응답을 판독해 아래 「판독」 절에 적는다')
  if ($model -eq $CodexModel) {
    # 배너 실행 — 관측 모델 id 와 reasoning effort 를 읽는다 (레시피 §3 · --json 없이 · --color never)
    $bout = Join-Path $dir 'gpt-5.6-sol-banner.txt'; $berr = Join-Path $dir 'gpt-5.6-sol-banner.stderr.txt'
    $bts0 = Now
    $bcall = Invoke-CodexCall $BannerPrompt $bout $berr $false
    $bts1 = Now
    # 실측(2026-11-05): 배너·user 에코·ERROR 는 stderr 로, 모델 응답은 stdout 으로 나온다 — 두 스트림을 다 적는다
    $bannerOut = @([IO.File]::ReadAllLines($bout, $Utf8))
    $bannerErr = @([IO.File]::ReadAllLines($berr, $Utf8) | Where-Object { $_ -notmatch '^\s*session id' })
    $L.Add('')
    $L.Add("배너 실행 (레시피 §3 · 같은 플래그 + 편차 2 · --json 없이 · --color never · 프롬프트 = `"$BannerPrompt`") · 시작=$bts0 · 종료=$bts1 · exit=$($bcall.exit) · wall_ms=$($bcall.wall_ms)")
    $L.Add("----- BEGIN BANNER stderr (verbatim · 세션 id 줄만 제외 · $($bannerErr.Count)줄) -----")
    foreach ($bl in $bannerErr) { $L.Add((Redact $bl)) }
    $L.Add('----- END BANNER stderr -----')
    $L.Add("----- BEGIN BANNER stdout (verbatim · $($bannerOut.Count)줄) -----")
    foreach ($bl in $bannerOut) { $L.Add((Redact $bl)) }
    $L.Add('----- END BANNER stdout -----')
    $bannerAll = @($bannerErr + $bannerOut)
    $mline = @($bannerAll | Where-Object { $_ -match '^\s*model:' }) -join ' / '
    $rline = @($bannerAll | Where-Object { $_ -match '^\s*reasoning effort:' }) -join ' / '
    $L.Add("배너 판독(기계): [$mline] · [$rline] · 기대: model: gpt-5.6-sol · reasoning effort: medium")
  }
  Write-Utf8 (Join-Path $Data "60-canary-$model.txt") (($L -join "`n") + "`n")
  Write-Log "canary end exit=$($call.exit) wall_ms=$($call.wall_ms) tool_calls=$toolCalls urls=$($ev.urls)" $model
}

# ---------- 채점 (검사기 · P0 · 레포 루트에서 · 읽기·실행만) ----------
function Invoke-Checker([string]$model, [string]$id) {
  $rel = "$DataRel/60-code/$model/$id.abap"
  $verLine = ([IO.File]::ReadAllLines((Join-Path $Root 'interactive\checker\VERSION'), $Utf8))[0]
  $nodeVer = (Invoke-Native $NodeExe @('--version') $Root).stdout.Trim()
  $S = [System.Collections.Generic.List[string]]::new()
  $S.Add("60-checker/$model/$id.txt — 동봉 검사기 원출력 (판J T6 · 2026-11-05)")
  $S.Add("대상: $rel")
  $S.Add("검사기: $CheckerRel ($verLine) · 실행 위치 = 레포 루트 · node $nodeVer")
  $S.Add("명령 3종 (11-code-tasks.txt §1 그대로): node $CheckerRel <lint|parse|analyze> $rel — 각 stdout·stderr 원문과 exit 코드")
  $res = @{}
  foreach ($cmd in 'lint', 'parse', 'analyze') {
    $r = Invoke-Native $NodeExe @($CheckerRel, $cmd, $rel) $Root
    $res[$cmd] = $r
    $S.Add('')
    $S.Add("=== $cmd ===")
    $S.Add("`$ node $CheckerRel $cmd $rel")
    $S.Add("--- stdout ($($Utf8.GetByteCount($r.stdout)) bytes) ---")
    $S.Add($r.stdout.TrimEnd("`r", "`n"))
    $S.Add("--- stderr ($($Utf8.GetByteCount($r.stderr)) bytes) ---")
    $S.Add($r.stderr.TrimEnd("`r", "`n"))
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
  $code = Read-Utf8 (Join-Path $Data "60-code\$model\$id.abap")
  $lines = Count-Lines $code
  $bytes = $Utf8.GetByteCount($code)
  $eg = $lintE + (1 - $parseOk) + $ah
  $wn = $lintW + $am + $ai
  $S.Add('')
  $S.Add('=== metrics ===')
  $S.Add("parse_ok=$parseOk lint_errors=$lintE lint_warnings=$lintW analyze_high=$ah analyze_medium=$am analyze_info=$ai error_grade=$eg warnings=$wn source_lines=$lines bytes=$bytes analyze_json_parsed=$analyzeParsed lint_exit=$($res.lint.exit) analyze_exit=$($res.analyze.exit)")
  $S.Add('산식: error_grade = lint_errors(stdout 의 ": E [" 줄 수) + (parse exit≠0 ? 1 : 0) + analyze summary.bySeverity.high · warnings = lint_warnings(": W [") + analyze medium + analyze info')
  $S.Add('⚠ parse 는 토크나이저다 — 잘못된 ABAP 도 토큰화만 되면 exit 0 (11-code-tasks.txt §1). parse exit≠0 은 파일을 못 읽은 경우만 잡는다.')
  Write-Utf8 (Join-Path $Data "60-checker\$model\$id.txt") (($S -join "`n") + "`n")
  return @{ parse_ok = $parseOk; lint_errors = $lintE; lint_warnings = $lintW; analyze_high = $ah; analyze_medium = $am; analyze_info = $ai; error_grade = $eg; warnings = $wn; source_lines = $lines; bytes = $bytes; analyze_parsed = $analyzeParsed }
}
function Run-Score {
  $tasks = Get-Tasks
  $rows = [System.Collections.Generic.List[string]]::new()
  $rows.Add('model,id,source(11|41),valid,attempts,no_fence,blocks,parse_ok,lint_errors,lint_warnings,analyze_high,analyze_medium,analyze_info,error_grade,warnings,source_lines,bytes')
  foreach ($model in $AllModels) {
    foreach ($t in $tasks) {
      $id = $t.id
      $valid = ''; $attempts = ''; $noFence = ''; $blocks = ''
      $evPath = Join-Path $Data "60-events\$model\$id.txt"
      if (Test-Path -LiteralPath $evPath) {
        $m = [regex]::Match((Read-Utf8 $evPath), '(?m)^summary: valid=(\d) attempts=(\d+) no_fence=(\d*) blocks=(\d*)')
        if ($m.Success) { $valid = $m.Groups[1].Value; $attempts = $m.Groups[2].Value; $noFence = $m.Groups[3].Value; $blocks = $m.Groups[4].Value }
      }
      $codePath = Join-Path $Data "60-code\$model\$id.abap"
      $met = $null
      if (Test-Path -LiteralPath $codePath) { $met = Invoke-Checker $model $id; Write-Log "score $model $id error_grade=$($met.error_grade) warnings=$($met.warnings)" 'score' }
      else { Write-Log "score $model $id — 코드 없음 (INVALID 또는 미응시)" 'score' }
      if ($null -ne $met) {
        $rows.Add("$model,$id,$($t.source),$valid,$attempts,$noFence,$blocks,$($met.parse_ok),$($met.lint_errors),$($met.lint_warnings),$($met.analyze_high),$($met.analyze_medium),$($met.analyze_info),$($met.error_grade),$($met.warnings),$($met.source_lines),$($met.bytes)")
      } else {
        $rows.Add("$model,$id,$($t.source),$valid,$attempts,$noFence,$blocks,,,,,,,,,,")
      }
    }
  }
  Write-Utf8 (Join-Path $Data '60-checker-summary.csv') (($rows -join "`n") + "`n")
  Write-Log "summary rows=$($rows.Count - 1) → 60-checker-summary.csv" 'score'
}

# ---------- 완전성 검사 (RED/GREEN) ----------
function Run-Check {
  $tasks = Get-Tasks
  $ok = $true
  $out = [System.Collections.Generic.List[string]]::new()
  $out.Add("[completeness] $(Now) · data=$DataRel · root=$Root")
  $invalidTotal = 0; $noFenceTotal = 0
  foreach ($model in $AllModels) {
    $raw = 0; $code = 0; $events = 0; $checker = 0; $inv = 0; $nf = 0; $missing = @()
    foreach ($t in $tasks) {
      $id = $t.id
      $evPath = Join-Path $Data "60-events\$model\$id.txt"
      $isInvalid = $false
      if (Test-Path -LiteralPath $evPath) {
        $events++
        $txt = Read-Utf8 $evPath
        if ($txt -match '(?m)^valid=0') { $isInvalid = $true; $inv++ }
        if ($txt -match '(?m)^summary: valid=1 attempts=\d+ no_fence=1') { $nf++ }
      } else { $missing += "events:$id" }
      if ($isInvalid) {
        if (Test-Path -LiteralPath (Join-Path $Data "60-raw\$model\$id.invalid-$MaxAttempts.txt")) { $raw++ } else { $missing += "raw(invalid-3):$id" }
        $code++; $checker++   # INVALID 는 코드·검사기 파일이 없는 것이 정상 — 「설명된 부재」로 센다
      } else {
        if (Test-Path -LiteralPath (Join-Path $Data "60-raw\$model\$id.txt")) { $raw++ } else { $missing += "raw:$id" }
        if (Test-Path -LiteralPath (Join-Path $Data "60-code\$model\$id.abap")) { $code++ } else { $missing += "code:$id" }
        if (Test-Path -LiteralPath (Join-Path $Data "60-checker\$model\$id.txt")) { $checker++ } else { $missing += "checker:$id" }
      }
    }
    $canPath = Join-Path $Data "60-canary-$model.txt"
    $canary = if ((Test-Path -LiteralPath $canPath) -and ((Read-Utf8 $canPath) -match '(?m)^판정: PASS')) { 'PASS' } elseif (Test-Path -LiteralPath $canPath) { 'NOT-PASS' } else { 'MISSING' }
    $modelOk = ($raw -eq 14 -and $code -eq 14 -and $events -eq 14 -and $checker -eq 14 -and $canary -eq 'PASS')
    if (-not $modelOk) { $ok = $false }
    $out.Add(" $model : raw $raw/14 · code $code/14 · events $events/14 · checker $checker/14 · canary $canary · INVALID $inv · no_fence $nf $(if ($modelOk) { '[OK]' } else { '[RED]' })$(if ($missing.Count) { ' missing: ' + ($missing -join ' ') } else { '' })")
    $invalidTotal += $inv; $noFenceTotal += $nf
  }
  $csvPath = Join-Path $Data '60-checker-summary.csv'
  $csvRows = 0; $csvPairs = 0; $csvValid = 0
  if (Test-Path -LiteralPath $csvPath) {
    $csv = @(Import-Csv -LiteralPath $csvPath -Encoding utf8)
    $csvRows = $csv.Count
    $csvPairs = @($csv | ForEach-Object { "$($_.model)|$($_.id)" } | Select-Object -Unique).Count
    $csvValid = @($csv | Where-Object { $_.valid -eq '1' }).Count
  }
  $csvOk = ($csvRows -eq 42 -and $csvPairs -eq 42)
  if (-not $csvOk) { $ok = $false }
  $out.Add(" summary csv: rows $csvRows/42 · distinct (model,id) $csvPairs/42 · valid=1 rows $csvValid/42 $(if ($csvOk) { '[OK]' } else { '[RED]' })")
  foreach ($f in '60-retries.txt', '60-run-log.txt', '60-run-code.ps1') {
    $p = Join-Path $Data $f
    $present = Test-Path -LiteralPath $p
    if (-not $present) { $ok = $false }
    $out.Add(" $f : $(if ($present) { 'present [OK]' } else { 'MISSING [RED]' })")
  }
  $chAbsent = -not (Test-Path -LiteralPath $CodexHome)
  if (-not $chAbsent) { $ok = $false }
  $out.Add(" codexhome-T6 : $(if ($chAbsent) { 'absent [OK]' } else { 'STILL PRESENT [RED]' })")
  $status = @(& git -C $Root status --porcelain)
  $outside = @($status | Where-Object { $_.Length -gt 3 } | ForEach-Object { $_.Substring(3).Trim('"') } | Where-Object { -not $_.StartsWith("$DataRel/60-") })
  if ($outside.Count -gt 0) { $ok = $false }
  $out.Add(" git status : $($status.Count) entries · outside 60- prefix: $($outside.Count) $(if ($outside.Count -eq 0) { '[OK]' } else { '[RED] ' + ($outside -join ' ') })")
  $out.Add(" target invalid=0 : $(if ($invalidTotal -eq 0) { 'MET' } else { "MISSED ($invalidTotal INVALID)" }) · no_fence total=$noFenceTotal")
  $out.Add("RESULT: $(if ($ok) { 'GREEN' } else { 'RED' })")
  $out | ForEach-Object { Write-Host $_ }
  Write-Log ("check → " + $out[$out.Count - 1]) 'check'
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
      Write-Utf8 (Join-Path $RawRoot "prompts\$($t.id).txt") $p
      "{0,-9} src={1} chars={2,5} lines={3,3} sha256={4}" -f $t.id, $t.source, $p.Length, (Count-Lines $p), (Sha256 $p)
    }
    "fixed line chars=$($FixedLine.Length) sha256=$(Sha256 $FixedLine)"
    "prompts written to $RawRoot\prompts"
  }
  'canary' { foreach ($m in (Models-For $Model)) { Run-Canary $m } }
  'run' { foreach ($m in (Models-For $Model)) { Run-Model $m } }
  'reextract' { foreach ($m in (Models-For $Model)) { Reextract-Model $m } }
  'score' { Run-Score }
  'cleanup' { Run-Cleanup }
}
