#Requires -Version 7.0
<#
L-60-run-code.ps1 — 판L T6 「쪽지 효과 응시(E-1) + 동봉 검사기 채점」 러너 (2026-11-09)
=========================================================================================
토대: 판J docs/reference/audits/2026-11-05-harness-necessity-review-data/60-run-code.ps1 (맨 조건 러너)의 복사본.
      단계 구조(check · prompts · canary · run · reextract · score)와 Claude 호출 줄 · 이벤트 추출 · 유효성 판정 ·
      코드 추출 규칙 · 검사기 3명령 · error_grade 산식 · 재시도 규칙은 판J 그대로다. 차이 전수 = L-01-diff.txt.

무엇을 하나
  코드 과제 5종(판J 11-code-tasks.txt C-01~C-05 · 그 자리에서 읽기만)을 claude-opus-5-5 · claude-sonnet-5-5 에게
  판J 맨 조건(02-isolation-recipe.txt §2) 그대로 던진다. 바뀌는 것은 하나 — 프롬프트의 코드 고정 줄 뒤에
  ABAP 작법 쪽지 본문(interactive/core/knowledge/abap/conventions/clean-code-note.md 의 표식 사이 · LF)을 글자 그대로
  덧붙인다. 조건 문안의 정본은 L-00-recipe.txt 다. Codex 는 응시하지 않는다(D-161 ⓢ).
  이 세션 모델은 ABAP 을 한 줄도 쓰지 않는다 — 응답은 무편집으로 받는다.

쪽지 동결
  $NoteSha 는 L-00-recipe.txt 에 적은 쪽지 본문 sha256(LF 기준)이다. 러너는 매 실행 · 매 프롬프트에서 정본 파일의 표식 사이를
  다시 떼어 이 값과 대조하고, 다르면 호출하지 않고 멈춘다(exit ≠ 0). 각 호출의 대조 결과는 이벤트 요약 · 실행 기록에 남는다.

사용 (PowerShell 7 · 레포 안 어디서든)
  pwsh -NoProfile -File L-60-run-code.ps1 -Phase check                         완전성 검사 (RED/GREEN · exit 0/1)
  pwsh -NoProfile -File L-60-run-code.ps1 -Phase prompts                       프롬프트 5종 생성 · sha256 표 (모델 호출 없음)
  pwsh -NoProfile -File L-60-run-code.ps1 -Phase canary -Model <m>             카나리아 (모델별 첫 호출 · 판J §0 프롬프트)
  pwsh -NoProfile -File L-60-run-code.ps1 -Phase run -Model <m> [-Only id,…]   과제 5종 응시 (멱등 · 끝난 과제는 건너뜀)
  pwsh -NoProfile -File L-60-run-code.ps1 -Phase reextract [-Model <m>]        저장된 JSONL 에서 raw/code/events 재도출 (모델 호출 없음)
  pwsh -NoProfile -File L-60-run-code.ps1 -Phase score                         검사기 채점 → L-60-checker/ · L-60-checker-summary.csv
  pwsh -NoProfile -File L-60-run-code.ps1 -Phase log                           L-60-run-log.txt 의 호출 표 생성 (모델 호출 없음)
  공통 선택: -ScratchRoot <레포 밖 폴더>  (기본 %TEMP%\sapkit-panL) — 빈 폴더 · 원 이벤트 스트림의 자리

레포 밖 자리 (커밋하지 않음)
  <scratch>\panL-blind\              빈 폴더 · 안에는 empty-mcp.json 하나({"mcpServers":{}}) · 모든 claude 호출의 cwd
  <scratch>\panL-raw\<model>\<id>…   원 이벤트 스트림(JSONL · 세션 id · 로컬 경로 포함) · 상태 · stderr · prompts\ · canary\

유효성 (판J 그대로)
  무효 = 추출된 도구 호출 > 0 (tool_use 블록) 또는 응답에 https?:// 가 있음. 무효면 같은 과제를 최대 3회 응시,
  무효 원응답은 L-60-raw/<model>/<id>.invalid-<n>.txt. 3회 모두 무효면 INVALID (코드 추출 없음).
  전이 오류(결과 없음 · is_error · exit≠0 · 빈 본문)는 응시 횟수에 넣지 않고 60·120·240·480·900·900·900·900 s
  백오프로 같은 과제를 재시도한다 (L-60-retries.txt). 8회 넘으면 중단(재개 가능).

코드 추출 규칙 (판J 그대로)
  원응답에서 「마지막 완결 펜스 블록」을 취한다 — 여는 펜스 = ``` 로 시작하는 줄(언어 태그 허용) ·
  닫는 펜스 = ``` 만 있는 줄. 펜스 두 줄을 떼고 안의 줄들을 LF 로 이어 끝에 LF 하나를 둔다.
  완결 블록이 없으면 원응답 전체를 .abap 으로 저장하고 no_fence=1. 블록이 둘 이상이면 blocks=N.

가림 (판K 방식 · 자료 폴더에 쓰는 순간)
  자료 파일에 쓰는 글자에서 <scratch> 절대 경로 → <scratch> · %TEMP% 절대 경로 → %TEMP% · 홈 경로 → ~ ·
  계정 이름 → <usr> · CLI 오류문의 URL → <url>. 모델 답 본문(L-60-raw)은 로컬 경로 조각만 바꾸고 그 수를
  이벤트 요약의 answer_local_path_masks 에 적는다(원문은 레포 밖 JSONL 에 그대로 남는다).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('check', 'prompts', 'canary', 'run', 'reextract', 'score', 'log')]
  [string]$Phase,
  [ValidateSet('claude-opus-5-5', 'claude-sonnet-5-5', 'all')]
  [string]$Model = 'all',
  [string[]]$Only = @(),
  [string]$ScratchRoot = (Join-Path $env:TEMP 'sapkit-panL')
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
$JData = Join-Path $Data '..\2026-11-05-harness-necessity-review-data'
$CheckerRel = 'interactive/checker/sapkit-checker.bundle.cjs'
$NoteRel = 'interactive/core/knowledge/abap/conventions/clean-code-note.md'
$NoteBegin = '<!-- sapkit:conventions-note:begin -->'
$NoteEnd = '<!-- sapkit:conventions-note:end -->'
$NoteSha = '025f2602de9602dba5cc24f24e62bc79611d9f99277807e177321f5269f5b79f'   # L-00-recipe.txt §2 · 동결 값
$ScratchRoot = [IO.Path]::GetFullPath($ScratchRoot)
$Blind = Join-Path $ScratchRoot 'panL-blind'
$RawRoot = Join-Path $ScratchRoot 'panL-raw'
$AllModels = @('claude-opus-5-5', 'claude-sonnet-5-5')
$TaskCount = 5
$RetriesPath = Join-Path $Data 'L-60-retries.txt'
$IntegrityPath = Join-Path $Data 'L-60-folder-integrity.txt'
$Backoff = @(60, 120, 240, 480, 900, 900, 900, 900)
$MaxTransient = $Backoff.Count
$MaxAttempts = 3
$NodeExe = (Get-Command node -CommandType Application | Select-Object -First 1).Source

# 코드 고정 줄 (판J 60-run-code.ps1 82행 · 60-run-log.txt §4 와 글자 그대로 · 244자 · sha256 49da56ba…)
$FixedLine = @'
Write the complete ABAP source as a single file and return it in one ```abap code block, with no explanation outside the block. Do not use any tool, file, shell, or web search. (도구·파일·셸·웹 검색을 쓰지 말고, 설명 없이 단일 파일 ABAP 소스를 ```abap 코드 블록 하나로만 돌려줘.)
'@
$FixedLineSha = '49da56ba8c27e15eaf950ec982f702afc58d542a85d56523dc3a6da688bac62b'
# 카나리아 프롬프트 (판J 02-isolation-recipe.txt §0 · 글자 그대로)
$CanaryPrompt = @'
First, list every tool, skill, plugin, MCP server, slash command, web/search capability and file you currently have access to (say 'none' if none). Do not use any tool or web search. Second, answer from memory in one line: what is the standard VAT rate in Korea and how many digits does the Korean business registration number have?
'@

# ---------- 유틸 ----------
function Now { (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fffK') }
function Ensure-Dir([string]$p) { if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null } }
function Write-Utf8([string]$path, [string]$text) { Ensure-Dir (Split-Path $path -Parent); [IO.File]::WriteAllText($path, $text, $Utf8) }
function Read-Utf8([string]$path) { [IO.File]::ReadAllText($path, $Utf8) }
function Sha256([string]$text) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData($Utf8.GetBytes($text))) -replace '-', '').ToLower() }
function Sha256File([string]$path) { ([BitConverter]::ToString([Security.Cryptography.SHA256]::HashData([IO.File]::ReadAllBytes($path))) -replace '-', '').ToLower() }
function CountOf($x) { if ($null -eq $x) { return 0 }; return @($x).Count }
function Count-Lines([string]$s) {
  if ([string]::IsNullOrEmpty($s)) { return 0 }
  $n = ([regex]::Matches($s, "`n")).Count
  if (-not $s.EndsWith("`n")) { $n++ }
  return $n
}
function Count-FileLines([string]$path) { if (Test-Path -LiteralPath $path) { return (Count-Lines (Read-Utf8 $path)) }; return 0 }
# 가림 — 자료 폴더에 쓰는 글자에 적용 (판K 방식). 돌려주는 값: @{ text; n }
$MaskPairs = @(
  @{ from = $ScratchRoot; to = '<scratch>' },
  @{ from = ([IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')); to = '%TEMP%' },
  @{ from = ([IO.Path]::GetFullPath($HOME).TrimEnd('\')); to = '~' }
)
function Mask-Paths([string]$s) {
  if ($null -eq $s) { return @{ text = ''; n = 0 } }
  $n = 0
  foreach ($p in $MaskPairs) {
    foreach ($form in @($p.from, ($p.from -replace '\\', '/'), ($p.from -replace '\\', '\\'))) {
      $rx = [regex]::new([regex]::Escape($form), 'IgnoreCase')
      $c = $rx.Matches($s).Count
      if ($c -gt 0) { $n += $c; $s = $rx.Replace($s, $p.to) }
    }
  }
  $u = $env:USERNAME
  if ($u) {
    $rx = [regex]::new('(?<=[\\/])' + [regex]::Escape($u) + '(?=[\\/]|$)', 'IgnoreCase')
    $c = $rx.Matches($s).Count
    if ($c -gt 0) { $n += $c; $s = $rx.Replace($s, '<usr>') }
  }
  return @{ text = $s; n = $n }
}
function Redact([string]$s) {
  # 러너가 만든 문장 — 경로 가림 + CLI 오류문의 URL 가림. 모델 원응답(L-60-raw)에는 URL 가림을 하지 않는다.
  if ($null -eq $s) { return '' }
  return ((Mask-Paths $s).text -replace 'https?://[^\s)\]>"'']+', '<url>')
}
function Write-Data([string]$path, [string]$text) { Write-Utf8 $path (Redact $text) }
function Write-Log([string]$msg, [string]$tag = '_') {
  $line = "$(Now) [$tag] $msg"
  Write-Host $line
  Ensure-Dir $RawRoot
  [IO.File]::AppendAllText((Join-Path $RawRoot "_progress-$tag.txt"), $line + "`n", $Utf8)
}
function Add-RetryLine([string]$line) {
  $m = [Threading.Mutex]::new($false, 'Global\sapkit-panL-T6-retries')
  [void]$m.WaitOne(30000)
  try { [IO.File]::AppendAllText($RetriesPath, (Redact $line) + "`n", $Utf8) } finally { $m.ReleaseMutex(); $m.Dispose() }
}
function Get-ResetWait([string]$reason) {
  # 판J 그대로 — 사용량 한도 오류문의 「try again at H:MM AM/PM」 을 읽어 그 시각 + 60 s 까지의 초 (없으면 0 · 2 시간 상한 넘으면 -1 = 중단)
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
  # 검사기 전용 (판J 그대로)
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

# ---------- 쪽지 (정본 표식 사이 · LF · 동결 대조) ----------
function Get-Note {
  $t = (Read-Utf8 (Join-Path $Root $NoteRel)) -replace "`r`n", "`n"
  $bi = $t.IndexOf("`n$NoteBegin`n")
  $ei = $t.IndexOf("`n$NoteEnd")
  if ($bi -lt 0 -or $ei -lt 0 -or $t.IndexOf("`n$NoteBegin`n", $bi + 1) -ge 0 -or $t.IndexOf("`n$NoteEnd", $ei + 1) -ge 0) { throw "note markers not found exactly once in $NoteRel" }
  $start = $bi + 1 + $NoteBegin.Length + 1
  $body = $t.Substring($start, $ei + 1 - $start)   # 표식 줄 자체는 빼고 · 마지막 줄의 LF 는 포함
  $sha = Sha256 $body
  if ($sha -ne $NoteSha) { throw "NOTE FROZEN HASH MISMATCH — $NoteRel body sha256=$sha · L-00 frozen=$NoteSha · 응시하지 않는다" }
  return $body
}
function Test-NoteInPrompt([string]$prompt) {
  # 프롬프트에 실제로 들어간 쪽지 조각을 떼어 동결 값과 대조한다
  $head = $FixedLine + "`n`n"
  if (-not $prompt.StartsWith($head)) { return @{ sha = ''; match = 0 } }
  $len = $script:Note.Length
  $piece = $prompt.Substring($head.Length, $len)
  $sha = Sha256 $piece
  $ok = if ($sha -eq $NoteSha -and $prompt.Substring($head.Length + $len, 1) -eq "`n") { 1 } else { 0 }
  return @{ sha = $sha; match = $ok }
}

# ---------- 과제 로드·프롬프트 ----------
function Get-Tasks {
  $tasks = [System.Collections.Generic.List[object]]::new()
  # 판J 11-code-tasks.txt — C-0N 블록의 task_text / required_output (판J 파서 그대로 · 4칸 들여쓰기만 떼고 줄 구조는 그대로)
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
  if ($tasks.Count -ne $TaskCount) { throw "expected $TaskCount tasks, got $($tasks.Count)" }
  return $tasks
}
# 프롬프트 = 고정 줄 + "\n\n" + 쪽지 본문(끝 LF 포함) + "\n" + task_text + "\n\n" + "Required output: " + required_output
function Build-Prompt($t) { return $FixedLine + "`n`n" + $script:Note + "`n" + $t.task_text + "`n`n" + 'Required output: ' + $t.required_output }
function Build-JPrompt($t) { return $FixedLine + "`n`n" + $t.task_text + "`n`n" + 'Required output: ' + $t.required_output }   # 대조용 (판J 프롬프트)
function Select-Tasks { $all = Get-Tasks; if ($Only.Count -eq 0) { return $all }; return @($all | Where-Object { $Only -contains $_.id }) }
function Models-For([string]$m) { if ($m -eq 'all') { return $AllModels }; return @($m) }

# ---------- 빈 폴더 무결성 ----------
function Test-Blind([string]$model, [string]$stage) {
  $entries = @(Get-ChildItem -LiteralPath $Blind -Force -Recurse)
  $mcp = Join-Path $Blind 'empty-mcp.json'
  $mcpSha = if (Test-Path -LiteralPath $mcp) { Sha256File $mcp } else { '(없음)' }
  $mcpText = if (Test-Path -LiteralPath $mcp) { (Read-Utf8 $mcp).Trim() } else { '' }
  $same = ($entries.Count -eq 1 -and $entries[0].Name -eq 'empty-mcp.json' -and $mcpText -eq '{"mcpServers":{}}')
  $names = ($entries | ForEach-Object { $_.FullName.Substring($Blind.Length).TrimStart('\') }) -join ','
  $line = "$(Now) | $model | $stage | $(if ($same) { 'same' } else { 'DIFF' }) | entries=$($entries.Count) expected=1 [$names] · empty-mcp.json sha256=$mcpSha · content=$mcpText"
  if (-not (Test-Path -LiteralPath $IntegrityPath)) {
    Write-Utf8 $IntegrityPath ("L-60-folder-integrity.txt — 판L T6 빈 폴더(<scratch>\panL-blind) 무결성 · 모델마다 카나리아 · 응시 시작과 끝`n" +
      "기대: 항목 1개 = empty-mcp.json (내용 {`"mcpServers`":{}}) · 하위 폴더 0 · 형식: 시각 | 모델 | 단계 | same/DIFF | 항목 수 [목록] · sha256 · 내용`n")
  }
  [IO.File]::AppendAllText($IntegrityPath, (Redact $line) + "`n", $Utf8)
  return $same
}

# ---------- 환경 준비 ----------
function Initialize-Env([string]$model) {
  Ensure-Dir $Blind
  $mcp = Join-Path $Blind 'empty-mcp.json'
  if (-not (Test-Path -LiteralPath $mcp)) { Set-Content -Path $mcp -Value '{"mcpServers":{}}' -Encoding utf8 }
  Ensure-Dir (Join-Path $RawRoot $model)
  Ensure-Dir (Join-Path $RawRoot 'prompts')
  Ensure-Dir (Join-Path $RawRoot 'canary')
  foreach ($d in 'L-60-raw', 'L-60-code', 'L-60-events', 'L-60-checker') { Ensure-Dir (Join-Path $Data "$d\$model") }
  if (-not (Test-Path -LiteralPath $RetriesPath)) {
    Write-Utf8 $RetriesPath ("L-60-retries.txt — 판L T6 재시도 기록 (전이 오류 백오프 재시도 · 무효 응답 재응시 · 판J 규칙) · 2026-11-09`n" +
      "형식: 시각 | 모델 | 과제 | call k | 종류 | 사유 | 조치     (전이 = 응시 횟수에 안 셈 · 무효 = 응시 횟수에 셈 · 최대 3회)`n" +
      "백오프: 60 · 120 · 240 · 480 · 900 · 900 · 900 · 900 초 (8회 넘으면 중단 · 재개 가능)`n")
  }
}

# ---------- CLI 호출 (판J 02-isolation-recipe.txt §2 명령 줄 그대로 · 모델 id · 프롬프트 · 출력 파일만 자리) ----------
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

# ---------- 이벤트 추출 (판J 그대로) ----------
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
function Classify($ev, $call) {
  if ($null -eq $ev.result) { return @{ kind = 'transient'; reason = "no result event (exit=$($call.exit))" } }
  if ($ev.result.is_error) { $msg = [string]$ev.raw; if ($msg.Length -gt 200) { $msg = $msg.Substring(0, 200) }; return @{ kind = 'transient'; reason = "is_error=true (exit=$($call.exit)) $msg" } }
  if ($call.exit -ne 0) { return @{ kind = 'transient'; reason = "exit=$($call.exit)" } }
  if ([string]::IsNullOrWhiteSpace($ev.raw)) { return @{ kind = 'transient'; reason = 'empty result text' } }
  if ($ev.tool_use -gt 0 -or $ev.urls -gt 0) { return @{ kind = 'invalid'; reason = "tool_use=$($ev.tool_use) [$($ev.tool_names -join ',')] urls=$($ev.urls)" } }
  return @{ kind = 'valid'; reason = '' }
}
function Get-CallFacts($ev) {
  # 실행 기록용 — 관측 모델 id(init · assistant · modelUsage 세 곳) · 사용량
  $init = $ev.init; $res = $ev.result
  $mu = if ($null -ne $res -and $null -ne $res.modelUsage) { @($res.modelUsage.PSObject.Properties.Name) } else { @() }
  $observed = @(@($(if ($null -ne $init) { $init.model })) + $ev.asst_models + $mu | Where-Object { $_ } | Select-Object -Unique)
  $u = if ($null -ne $res) { $res.usage } else { $null }
  return [ordered]@{
    observed = ($observed -join ',')
    init_tools = $(if ($null -ne $init) { CountOf $init.tools } else { '' })
    init_mcp = $(if ($null -ne $init) { CountOf $init.mcp_servers } else { '' })
    tool_use = $ev.tool_use
    in = $(if ($null -ne $u) { $u.input_tokens } else { '' })
    out = $(if ($null -ne $u) { $u.output_tokens } else { '' })
    cache_create = $(if ($null -ne $u) { $u.cache_creation_input_tokens } else { '' })
    cache_read = $(if ($null -ne $u) { $u.cache_read_input_tokens } else { '' })
    cost_usd = $(if ($null -ne $res) { $res.total_cost_usd } else { '' })
    version = $(if ($null -ne $init) { $init.claude_code_version } else { '' })
  }
}

# ---------- 코드 추출 (판J 그대로) ----------
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
  if (Test-Path -LiteralPath $p) { return (Get-Content -Raw -Encoding utf8 $p | ConvertFrom-Json -AsHashtable -DateKind String) }
  return [ordered]@{ model = $model; id = $id; calls = 0; attempts = 0; transient = 0; invalid = @(); history = @(); done = $false; valid = $false; final = ''; final_call = 0 }
}
function Save-State($st) { Write-Utf8 (State-Path $st.model $st.id) (ConvertTo-Json -InputObject $st -Depth 10) }

# ---------- 이벤트 요약 파일 ----------
function Write-EventsFile([string]$model, $t, $st, $ev, $call, $ext, $nchk) {
  $id = $t.id
  $L = [System.Collections.Generic.List[string]]::new()
  $L.Add("$model · $id — 쪽지 조건 코드 과제 이벤트 추출 요약 (판L T6 · 2026-11-09)")
  $L.Add("원본: <scratch>\panL-raw\$model\$id.jsonl (원 이벤트 스트림 · 세션 id·로컬 경로 포함 · 커밋하지 않음 · 호출별 사본 $id.call-<k>.jsonl)")
  $L.Add("명령: 판J 02-isolation-recipe.txt §2 그대로 · 모델 id $model · cwd = <scratch>\panL-blind (L-00 §3)")
  $L.Add("프롬프트: L-00-recipe.txt §1 (고정 줄 + 쪽지 본문 + task_text + Required output) · chars=$($t.prompt_chars) · sha256=$($t.prompt_sha)")
  $L.Add("쪽지: 프롬프트 안 조각 sha256=$($nchk.sha) · L-00 동결 값 $NoteSha · 일치=$($nchk.match)")
  $L.Add("응시(응답) 횟수=$($st.attempts) · 전이 재시도=$($st.transient) · CLI 호출 총수=$($st.calls) · 최종=$($st.final) (call $($st.final_call))")
  foreach ($h in @($st.history)) {
    if ($h.kind -eq 'valid') { continue }
    $L.Add("  call $($h.call): $($h.kind) — $($h.reason) · exit=$($h.exit) · wall_ms=$($h.wall_ms) · $($h.ts_start) → $($h.ts_end)")
  }
  foreach ($iv in @($st.invalid)) {
    $L.Add("  무효 응시 $($iv.attempt)/$MaxAttempts (call $($iv.call)): $($iv.reason) · 원응답 → L-60-raw/$model/$id.invalid-$($iv.attempt).txt")
  }
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
  $L.Add("exit_code=$($call.exit) · wall_ms=$($call.wall_ms) · stderr 줄 수=$(Count-FileLines $call.errf) · 시작=$($call.ts_start) · 종료=$($call.ts_end)")
  $L.Add("응답 내 외부 URL(https?://) 건수=$($ev.urls)")
  $L.Add("valid=$(if ($st.valid) { 1 } else { 0 })")
  if ($st.valid) {
    $L.Add("answer_local_path_masks=$($ext.masks) (L-60-raw 에 쓸 때 가린 로컬 경로 조각 수)")
    $L.Add("펜스 블록 수=$($ext.blocks) · no_fence=$($ext.no_fence) · 추출 → L-60-code/$model/$id.abap (lines=$($ext.lines) · bytes=$($ext.bytes))")
    $L.Add("summary: valid=1 attempts=$($st.attempts) no_fence=$($ext.no_fence) blocks=$($ext.blocks) lines=$($ext.lines) bytes=$($ext.bytes) note_match=$($nchk.match)")
  } else {
    $L.Add('코드 추출 없음 (INVALID — 3회 모두 무효)')
    $L.Add("summary: valid=0 attempts=$($st.attempts) no_fence= blocks= note_match=$($nchk.match)")
  }
  Write-Data (Join-Path $Data "L-60-events\$model\$id.txt") (($L -join "`n") + "`n")
}
function Complete-Task([string]$model, $t, $st, $ev, $call, $nchk) {
  $ext = $null
  if ($st.valid) {
    $m = Mask-Paths $ev.raw
    Write-Utf8 (Join-Path $Data "L-60-raw\$model\$($t.id).txt") $m.text
    $ext = Extract-Code $ev.raw
    Write-Utf8 (Join-Path $Data "L-60-code\$model\$($t.id).abap") $ext.code
    $ext.lines = Count-Lines $ext.code
    $ext.bytes = $Utf8.GetByteCount($ext.code)
    $ext.masks = $m.n
  }
  Write-EventsFile $model $t $st $ev $call $ext $nchk
}

# ---------- 과제 실행 루프 ----------
function Run-Model([string]$model) {
  Initialize-Env $model
  $script:Note = Get-Note
  $tasks = Select-Tasks
  if (-not (Test-Blind $model 'run-start')) { throw "blind folder not pristine at run start ($model) — 응시하지 않는다" }
  $canSt = Join-Path $RawRoot "canary\$model.state.json"
  if (-not (Test-Path -LiteralPath $canSt) -or -not ((Get-Content -Raw -Encoding utf8 $canSt | ConvertFrom-Json).pass)) { throw "canary for $model has not passed — 카나리아 먼저" }
  Write-Log "run start · tasks=$($tasks.Count)" $model
  foreach ($t in $tasks) {
    $st = Load-State $model $t.id
    if ($st.done) { Write-Log "skip $($t.id) (done · final=$($st.final))" $model; continue }
    $script:Note = Get-Note   # 매 과제 직전 동결 대조
    $prompt = Build-Prompt $t
    $nchk = Test-NoteInPrompt $prompt
    if ($nchk.match -ne 1) { throw "note in prompt does not match frozen hash ($model $($t.id))" }
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
      $call = Invoke-ClaudeCall $model $prompt $jsonl $errf
      $call.ts_start = $ts0; $call.ts_end = Now; $call.k = $k; $call.jsonl = $jsonl; $call.errf = $errf
      $ev = Read-ClaudeEvents $jsonl
      $cls = Classify $ev $call
      $facts = Get-CallFacts $ev
      Write-Log "$($t.id) call $k end exit=$($call.exit) wall_ms=$($call.wall_ms) → $($cls.kind) $($cls.reason)" $model
      $st.history += @{ call = $k; kind = $cls.kind; reason = (Redact $cls.reason); exit = $call.exit; wall_ms = $call.wall_ms; ts_start = $ts0; ts_end = $call.ts_end; prompt_sha = $t.prompt_sha; note_sha = $nchk.sha; note_match = $nchk.match; facts = $facts }
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
        Write-Utf8 (Join-Path $Data "L-60-raw\$model\$($t.id).invalid-$n.txt") (Mask-Paths $ev.raw).text
        $st.invalid += @{ attempt = $n; call = $k; reason = $cls.reason }
        if ($n -ge $MaxAttempts) {
          Add-RetryLine "$(Now) | $model | $($t.id) | call $k | invalid $n/$MaxAttempts | $($cls.reason) | INVALID 확정 (코드 추출 없음)"
          $st.done = $true; $st.valid = $false; $st.final = 'INVALID'; $st.final_call = $k
          Complete-Task $model $t $st $ev $call $nchk
        } else {
          Add-RetryLine "$(Now) | $model | $($t.id) | call $k | invalid $n/$MaxAttempts | $($cls.reason) | 즉시 재응시"
        }
        Save-State $st
        continue
      }
      $st.done = $true; $st.valid = $true; $st.final = 'VALID'; $st.final_call = $k
      Copy-Item -LiteralPath $jsonl -Destination (Join-Path $RawRoot "$model\$($t.id).jsonl") -Force
      Complete-Task $model $t $st $ev $call $nchk
      Save-State $st
    }
  }
  [void](Test-Blind $model 'run-end')
  Write-Log 'run end' $model
}

# ---------- 저장된 JSONL 에서 재도출 (모델 호출 없음) ----------
function Reextract-Model([string]$model) {
  $script:Note = Get-Note
  foreach ($t in (Select-Tasks)) {
    $st = Load-State $model $t.id
    if (-not $st.done) { Write-Log "reextract skip $($t.id) (not done)" $model; continue }
    $prompt = Build-Prompt $t
    $nchk = Test-NoteInPrompt $prompt
    $t | Add-Member -NotePropertyName prompt_sha -NotePropertyValue (Sha256 $prompt) -Force
    $t | Add-Member -NotePropertyName prompt_chars -NotePropertyValue $prompt.Length -Force
    $k = [int]$st.final_call
    $jsonl = Join-Path $RawRoot "$model\$($t.id).call-$k.jsonl"
    $h = @($st.history | Where-Object { [int]$_.call -eq $k })[0]
    $call = @{ exit = $h.exit; wall_ms = $h.wall_ms; ts_start = $h.ts_start; ts_end = $h.ts_end; k = $k; jsonl = $jsonl; errf = (Join-Path $RawRoot "$model\$($t.id).call-$k.stderr.txt") }
    $ev = Read-ClaudeEvents $jsonl
    Complete-Task $model $t $st $ev $call $nchk
    Write-Log "reextract $($t.id) ok (final=$($st.final))" $model
  }
}

# ---------- 카나리아 (모델별 첫 호출 · 판J §0 프롬프트 · 기준 ②③ 기계 판정 · ① 은 T6 세션이 판독해 덧붙인다) ----------
function Run-Canary([string]$model) {
  Initialize-Env $model
  $script:Note = Get-Note   # 첫 응시 전 동결 대조 (카나리아 프롬프트에는 쪽지가 들어가지 않는다)
  if (-not (Test-Blind $model 'canary-start')) { throw "blind folder not pristine at canary start ($model)" }
  $dir = Join-Path $RawRoot 'canary'
  $jsonl = Join-Path $dir "$model.jsonl"; $errf = Join-Path $dir "$model.stderr.txt"
  $ts0 = Now
  Write-Log 'canary start' $model
  $call = Invoke-ClaudeCall $model $CanaryPrompt $jsonl $errf
  $ts1 = Now
  $ev = Read-ClaudeEvents $jsonl
  $facts = Get-CallFacts $ev
  $L = [System.Collections.Generic.List[string]]::new()
  $L.Add("L-60-canary-$model.txt — 판L T6 카나리아 (판J 02-isolation-recipe.txt §0 프롬프트 글자 그대로 · 쪽지 없음 · 2026-11-09)")
  $L.Add("명령: 판J 02-isolation-recipe.txt §2 그대로 (모델 id $model) · `$env:CLAUDECODE = `$null · cwd = <scratch>\panL-blind")
  $L.Add("  claude -p `"<프롬프트>`" --model $model --tools `"`" --setting-sources `"`" --strict-mcp-config --mcp-config <scratch>\panL-blind\empty-mcp.json --disable-slash-commands --output-format stream-json --verbose --no-session-persistence > <scratch>\panL-raw\canary\$model.jsonl 2> <…>.stderr.txt")
  $L.Add("시작=$ts0 · 종료=$ts1 · exit=$($call.exit) · wall_ms=$($call.wall_ms) · stderr 줄 수=$(Count-FileLines $errf)")
  $m = Mask-Paths ([string]$ev.raw)
  $L.Add("원응답 (무편집 · 단 로컬 경로 조각 $($m.n)곳만 가림):")
  $L.Add('----- BEGIN RAW -----')
  $L.Add($m.text)
  $L.Add('----- END RAW -----')
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
  $L.Add("응답 내 외부 URL(https?://) 건수=$($ev.urls)")
  $c2 = ($ev.tool_use -eq 0 -and $null -ne $res -and -not $res.is_error)
  $c3 = ($ev.urls -eq 0)
  $L.Add("기준 ② 도구 호출 0건: $(if ($c2) { 'PASS' } else { 'FAIL' }) ($($ev.tool_use))")
  $L.Add("기준 ③ 외부 URL 0건: $(if ($c3) { 'PASS' } else { 'FAIL' }) ($($ev.urls))")
  $L.Add('기준 ① 모델 자기 보고(스킬·플러그인·MCP·프로젝트 파일·웹 없음): T6 세션이 원응답을 판독해 아래 「판독」 절에 적는다')
  Write-Data (Join-Path $Data "L-60-canary-$model.txt") (($L -join "`n") + "`n")
  # 기계 기준(②③) 상태 — 응시 단계는 이것과 사람 판독 줄(판정: PASS)을 함께 요구한다
  $state = [ordered]@{ model = $model; ts_start = $ts0; ts_end = $ts1; exit = $call.exit; wall_ms = $call.wall_ms; machine_pass = ($c2 -and $c3); pass = $false; facts = $facts }
  Write-Utf8 (Join-Path $dir "$model.state.json") (ConvertTo-Json -InputObject $state -Depth 5)
  [void](Test-Blind $model 'canary-end')
  Write-Log "canary end exit=$($call.exit) wall_ms=$($call.wall_ms) tool_calls=$($ev.tool_use) urls=$($ev.urls) machine_pass=$($c2 -and $c3)" $model
}
function Confirm-CanaryPass([string]$model) {
  # 사람 판독 줄 「판정: PASS」가 카나리아 파일에 붙어 있고 기계 기준이 PASS 면 상태에 pass=true 를 적는다
  $dir = Join-Path $RawRoot 'canary'
  $sp = Join-Path $dir "$model.state.json"
  $st = Get-Content -Raw -Encoding utf8 $sp | ConvertFrom-Json -AsHashtable -DateKind String
  $txt = Read-Utf8 (Join-Path $Data "L-60-canary-$model.txt")
  $st.pass = ($st.machine_pass -and ($txt -match '(?m)^판정: PASS'))
  Write-Utf8 $sp (ConvertTo-Json -InputObject $st -Depth 5)
  return $st.pass
}

# ---------- 채점 (검사기 · P0 · 레포 루트에서 · 읽기·실행만 · 판J 그대로) ----------
function Invoke-Checker([string]$model, [string]$id) {
  $rel = "$DataRel/L-60-code/$model/$id.abap"
  $verLine = ([IO.File]::ReadAllLines((Join-Path $Root 'interactive\checker\VERSION'), $Utf8))[0]
  $nodeVer = (Invoke-Native $NodeExe @('--version') $Root).stdout.Trim()
  $S = [System.Collections.Generic.List[string]]::new()
  $S.Add("L-60-checker/$model/$id.txt — 동봉 검사기 원출력 (판L T6 · 2026-11-09)")
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
  $code = Read-Utf8 (Join-Path $Data "L-60-code\$model\$id.abap")
  $lines = Count-Lines $code
  $bytes = $Utf8.GetByteCount($code)
  $eg = $lintE + (1 - $parseOk) + $ah
  $wn = $lintW + $am + $ai
  $S.Add('')
  $S.Add('=== metrics ===')
  $S.Add("parse_ok=$parseOk lint_errors=$lintE lint_warnings=$lintW analyze_high=$ah analyze_medium=$am analyze_info=$ai error_grade=$eg warnings=$wn source_lines=$lines bytes=$bytes analyze_json_parsed=$analyzeParsed lint_exit=$($res.lint.exit) analyze_exit=$($res.analyze.exit)")
  $S.Add('산식: error_grade = lint_errors(stdout 의 ": E [" 줄 수) + (parse exit≠0 ? 1 : 0) + analyze summary.bySeverity.high · warnings = lint_warnings(": W [") + analyze medium + analyze info')
  $S.Add('⚠ parse 는 토크나이저다 — 잘못된 ABAP 도 토큰화만 되면 exit 0 (판J 11-code-tasks.txt §1). parse exit≠0 은 파일을 못 읽은 경우만 잡는다.')
  Write-Data (Join-Path $Data "L-60-checker\$model\$id.txt") (($S -join "`n") + "`n")
  return @{ parse_ok = $parseOk; lint_errors = $lintE; lint_warnings = $lintW; analyze_high = $ah; analyze_medium = $am; analyze_info = $ai; error_grade = $eg; warnings = $wn; source_lines = $lines; bytes = $bytes; analyze_parsed = $analyzeParsed }
}
function Run-Score {
  $tasks = Get-Tasks
  $rows = [System.Collections.Generic.List[string]]::new()
  $rows.Add('model,id,source(11|41),valid,attempts,no_fence,blocks,parse_ok,lint_errors,lint_warnings,analyze_high,analyze_medium,analyze_info,error_grade,warnings,source_lines,bytes,observed_model,note_match,tokens_in,tokens_out')
  foreach ($model in $AllModels) {
    foreach ($t in $tasks) {
      $id = $t.id
      $valid = ''; $attempts = ''; $noFence = ''; $blocks = ''; $nm = ''
      $evPath = Join-Path $Data "L-60-events\$model\$id.txt"
      $obs = ''; $tin = ''; $tout = ''
      if (Test-Path -LiteralPath $evPath) {
        $evt = Read-Utf8 $evPath
        $m = [regex]::Match($evt, '(?m)^summary: valid=(\d) attempts=(\d+) no_fence=(\d*) blocks=(\d*).*note_match=(\d)')
        if ($m.Success) { $valid = $m.Groups[1].Value; $attempts = $m.Groups[2].Value; $noFence = $m.Groups[3].Value; $blocks = $m.Groups[4].Value; $nm = $m.Groups[5].Value }
        $mo = [regex]::Match($evt, '(?m)^관측 모델 id=\[([^\]]*)\]'); if ($mo.Success) { $obs = $mo.Groups[1].Value -replace ',', ';' }
        $mu = [regex]::Match($evt, '(?m)^usage: input_tokens=(\d*) · output_tokens=(\d*) · cache_creation_input_tokens=(\d*) · cache_read_input_tokens=(\d*)'); if ($mu.Success) { $tin = [string]([int]$mu.Groups[1].Value + [int]$mu.Groups[3].Value + [int]$mu.Groups[4].Value); $tout = $mu.Groups[2].Value }   # tokens_in = input + cache_creation + cache_read (판K 와 같은 뜻 · 프롬프트 전량)
      }
      $codePath = Join-Path $Data "L-60-code\$model\$id.abap"
      $met = $null
      if (Test-Path -LiteralPath $codePath) { $met = Invoke-Checker $model $id; Write-Log "score $model $id error_grade=$($met.error_grade) warnings=$($met.warnings)" 'score' }
      else { Write-Log "score $model $id — 코드 없음 (INVALID 또는 미응시)" 'score' }
      if ($null -ne $met) {
        $rows.Add("$model,$id,$($t.source),$valid,$attempts,$noFence,$blocks,$($met.parse_ok),$($met.lint_errors),$($met.lint_warnings),$($met.analyze_high),$($met.analyze_medium),$($met.analyze_info),$($met.error_grade),$($met.warnings),$($met.source_lines),$($met.bytes),$obs,$nm,$tin,$tout")
      } else {
        $rows.Add("$model,$id,$($t.source),$valid,$attempts,$noFence,$blocks,,,,,,,,,,,$obs,$nm,$tin,$tout")
      }
    }
  }
  Write-Utf8 (Join-Path $Data 'L-60-checker-summary.csv') (($rows -join "`n") + "`n")
  Write-Log "summary rows=$($rows.Count - 1) → L-60-checker-summary.csv" 'score'
}

# ---------- 실행 기록 (호출 표 · 모델 호출 없음) ----------
function Run-Log {
  $script:Note = Get-Note
  $claudeVer = ((& claude --version) | Out-String).Trim()
  $L = [System.Collections.Generic.List[string]]::new()
  $L.Add('L-60-run-log.txt — 판L T6 「쪽지 효과 응시(E-1) + 동봉 검사기 채점」 실행 기록 (2026-11-09)')
  $L.Add('=====================================================================================')
  $L.Add('')
  $L.Add('이 파일의 §1~§3 은 L-60-run-code.ps1 -Phase log 가 레포 밖 상태 파일(<scratch>\panL-raw\…\*.state.json)에서 만든다.')
  $L.Add('§4 이후(관찰)는 T6 세션이 덧붙였다. 조건 문안 = L-00-recipe.txt · 판J/판K 와의 차이 = L-01-diff.txt.')
  $L.Add('')
  $L.Add('1. 환경')
  $L.Add('--------')
  $L.Add("  claude --version : $claudeVer")
  $L.Add("  node             : $((Invoke-Native $NodeExe @('--version') $Root).stdout.Trim()) · PowerShell $($PSVersionTable.PSVersion) (`$PSNativeCommandArgumentPassing = $PSNativeCommandArgumentPassing)")
  $L.Add("  검사기 VERSION   : $(([IO.File]::ReadAllLines((Join-Path $Root 'interactive\checker\VERSION'), $Utf8))[0]) · 번들 sha256=$(Sha256File (Join-Path $Root ($CheckerRel -replace '/', '\')))")
  $L.Add("  쪽지 정본        : $NoteRel · 표식 사이 본문 chars=$($script:Note.Length) · bytes=$($Utf8.GetByteCount($script:Note)) · sha256=$(Sha256 $script:Note) (L-00 동결 값 $NoteSha · 일치=$(if ((Sha256 $script:Note) -eq $NoteSha) { 1 } else { 0 }))")
  $L.Add("  빈 폴더 · 원본   : <scratch>\panL-blind (empty-mcp.json 하나) · <scratch>\panL-raw (원 이벤트 스트림 · 커밋하지 않음)")
  $L.Add('')
  $L.Add('2. 프롬프트 (L-00 §1 의 조립식 · 과제마다 한 번 계산 · 두 모델에 같은 글자)')
  $L.Add('-------------------------------------------------------------------------')
  $L.Add("  고정 줄 chars=$($FixedLine.Length) sha256=$(Sha256 $FixedLine) (판J 값 $FixedLineSha · 일치=$(if ((Sha256 $FixedLine) -eq $FixedLineSha) { 1 } else { 0 }))")
  foreach ($t in (Get-Tasks)) {
    $p = Build-Prompt $t; $jp = Build-JPrompt $t; $nc = Test-NoteInPrompt $p
    $L.Add(("  {0}  chars={1,5}  sha256={2}  쪽지 조각 일치={3}  · 판J 프롬프트 sha256={4} (판J 60-run-log §4 표와 대조)" -f $t.id, $p.Length, (Sha256 $p), $nc.match, (Sha256 $jp)))
  }
  $L.Add('')
  $L.Add('3. 호출 표 (카나리아 → 과제 · 시각 KST · 관측 모델 id = init.model · assistant.message.model · result.modelUsage 키의 합집합)')
  $L.Add('------------------------------------------------------------------------------------------------------------------')
  $L.Add('  모델 | 호출 | 시작 → 종료 | exit | wall_ms | 판정 | 관측 모델 id | init tools · mcp | tool_use | 토큰 in · out · cache_create · cache_read | 비용 USD | 프롬프트 sha256(앞 16) | 쪽지 조각 sha256(앞 16) · 일치')
  $noteAll = 0; $noteOk = 0; $tuAll = 0
  foreach ($model in $AllModels) {
    $cp = Join-Path $RawRoot "canary\$model.state.json"
    if (Test-Path -LiteralPath $cp) {
      $c = Get-Content -Raw -Encoding utf8 $cp | ConvertFrom-Json -DateKind String
      $f = $c.facts
      $L.Add("  $model | canary | $($c.ts_start) → $($c.ts_end) | $($c.exit) | $($c.wall_ms) | machine_pass=$($c.machine_pass) pass=$($c.pass) | $($f.observed) | $($f.init_tools) · $($f.init_mcp) | $($f.tool_use) | $($f.in) · $($f.out) · $($f.cache_create) · $($f.cache_read) | $($f.cost_usd) | (판J §0 카나리아 프롬프트 · 쪽지 없음) | —")
    } else { $L.Add("  $model | canary | (없음)") }
    foreach ($t in (Get-Tasks)) {
      $st = Load-State $model $t.id
      foreach ($h in @($st.history)) {
        $f = $h.facts
        $noteAll++; if ([int]$h.note_match -eq 1) { $noteOk++ }; $tuAll += [int]$f.tool_use
        $L.Add("  $model | $($t.id) call $($h.call) | $($h.ts_start) → $($h.ts_end) | $($h.exit) | $($h.wall_ms) | $($h.kind) | $($f.observed) | $($f.init_tools) · $($f.init_mcp) | $($f.tool_use) | $($f.in) · $($f.out) · $($f.cache_create) · $($f.cache_read) | $($f.cost_usd) | $(([string]$h.prompt_sha).Substring(0, [Math]::Min(16, ([string]$h.prompt_sha).Length))) | $(([string]$h.note_sha).Substring(0, [Math]::Min(16, ([string]$h.note_sha).Length))) · $($h.note_match)")
      }
    }
  }
  $L.Add("  합계: 과제 호출 $noteAll · 쪽지 조각 동결 값 일치 $noteOk/$noteAll · tool_use 합 $tuAll")
  Write-Data (Join-Path $Data 'L-60-run-log.txt') (($L -join "`n") + "`n")
  Write-Log "run-log written · calls=$noteAll note_ok=$noteOk" 'log'
}

# ---------- 완전성 검사 (RED/GREEN) ----------
function Run-Check {
  $tasks = Get-Tasks
  $ok = $true
  $out = [System.Collections.Generic.List[string]]::new()
  $out.Add("[completeness] $(Now) · data=$DataRel")
  $noteOkNow = $true
  try { $script:Note = Get-Note } catch { $noteOkNow = $false }
  if (-not $noteOkNow) { $ok = $false }
  $out.Add(" note frozen : $(if ($noteOkNow) { "sha256 $NoteSha [OK]" } else { 'MISMATCH [RED]' })")
  $invalidTotal = 0; $noFenceTotal = 0
  foreach ($model in $AllModels) {
    $raw = 0; $code = 0; $events = 0; $checker = 0; $inv = 0; $nf = 0; $nm = 0; $missing = @()
    foreach ($t in $tasks) {
      $id = $t.id
      $evPath = Join-Path $Data "L-60-events\$model\$id.txt"
      $isInvalid = $false
      if (Test-Path -LiteralPath $evPath) {
        $events++
        $txt = Read-Utf8 $evPath
        if ($txt -match '(?m)^valid=0') { $isInvalid = $true; $inv++ }
        if ($txt -match '(?m)^summary: valid=1 attempts=\d+ no_fence=1') { $nf++ }
        if ($txt -match '(?m)^summary: .*note_match=1') { $nm++ } else { $missing += "note:$id" }
      } else { $missing += "events:$id" }
      if ($isInvalid) {
        if (Test-Path -LiteralPath (Join-Path $Data "L-60-raw\$model\$id.invalid-$MaxAttempts.txt")) { $raw++ } else { $missing += "raw(invalid-3):$id" }
        $code++; $checker++
      } else {
        if (Test-Path -LiteralPath (Join-Path $Data "L-60-raw\$model\$id.txt")) { $raw++ } else { $missing += "raw:$id" }
        if (Test-Path -LiteralPath (Join-Path $Data "L-60-code\$model\$id.abap")) { $code++ } else { $missing += "code:$id" }
        if (Test-Path -LiteralPath (Join-Path $Data "L-60-checker\$model\$id.txt")) { $checker++ } else { $missing += "checker:$id" }
      }
    }
    $canPath = Join-Path $Data "L-60-canary-$model.txt"
    $canary = if ((Test-Path -LiteralPath $canPath) -and ((Read-Utf8 $canPath) -match '(?m)^판정: PASS')) { 'PASS' } elseif (Test-Path -LiteralPath $canPath) { 'NOT-PASS' } else { 'MISSING' }
    $modelOk = ($raw -eq $TaskCount -and $code -eq $TaskCount -and $events -eq $TaskCount -and $checker -eq $TaskCount -and $nm -eq $TaskCount -and $canary -eq 'PASS' -and $inv -eq 0)
    if (-not $modelOk) { $ok = $false }
    $out.Add(" $model : raw $raw/$TaskCount · code $code/$TaskCount · events $events/$TaskCount · checker $checker/$TaskCount · note_match $nm/$TaskCount · canary $canary · INVALID $inv · no_fence $nf $(if ($modelOk) { '[OK]' } else { '[RED]' })$(if ($missing.Count) { ' missing: ' + ($missing -join ' ') } else { '' })")
    $invalidTotal += $inv; $noFenceTotal += $nf
  }
  $want = $TaskCount * $AllModels.Count
  $csvPath = Join-Path $Data 'L-60-checker-summary.csv'
  $csvRows = 0; $csvPairs = 0; $csvValid = 0
  if (Test-Path -LiteralPath $csvPath) {
    $csv = @(Import-Csv -LiteralPath $csvPath -Encoding utf8)
    $csvRows = $csv.Count
    $csvPairs = @($csv | ForEach-Object { "$($_.model)|$($_.id)" } | Select-Object -Unique).Count
    $csvValid = @($csv | Where-Object { $_.valid -eq '1' }).Count
  }
  $csvOk = ($csvRows -eq $want -and $csvPairs -eq $want)
  if (-not $csvOk) { $ok = $false }
  $out.Add(" summary csv: rows $csvRows/$want · distinct (model,id) $csvPairs/$want · valid=1 rows $csvValid/$want $(if ($csvOk) { '[OK]' } else { '[RED]' })")
  foreach ($f in 'L-60-retries.txt', 'L-60-run-log.txt', 'L-60-run-code.ps1', 'L-60-folder-integrity.txt', 'L-00-recipe.txt', 'L-01-diff.txt') {
    $p = Join-Path $Data $f
    $present = Test-Path -LiteralPath $p
    if (-not $present) { $ok = $false }
    $out.Add(" $f : $(if ($present) { 'present [OK]' } else { 'MISSING [RED]' })")
  }
  if (Test-Path -LiteralPath $IntegrityPath) {
    $diff = @([IO.File]::ReadAllLines($IntegrityPath, $Utf8) | Where-Object { $_ -match ' \| DIFF \| ' }).Count
    if ($diff -gt 0) { $ok = $false }
    $out.Add(" folder integrity DIFF lines : $diff $(if ($diff -eq 0) { '[OK]' } else { '[RED]' })")
  }
  $status = @(& git -C $Root status --porcelain --untracked-files=all)
  $outside = @($status | Where-Object { $_.Length -gt 3 } | ForEach-Object { $_.Substring(3).Trim('"') } | Where-Object { -not ($_.StartsWith("$DataRel/L-60-") -or $_.StartsWith("$DataRel/L-00-") -or $_.StartsWith("$DataRel/L-01-")) })
  if ($outside.Count -gt 0) { $ok = $false }
  $out.Add(" git status : $($status.Count) entries · outside L-00/L-01/L-60 prefix: $($outside.Count) $(if ($outside.Count -eq 0) { '[OK]' } else { '[RED] ' + ($outside -join ' ') })")
  $out.Add(" target invalid=0 : $(if ($invalidTotal -eq 0) { 'MET' } else { "MISSED ($invalidTotal INVALID)" }) · no_fence total=$noFenceTotal")
  $out.Add("RESULT: $(if ($ok) { 'GREEN' } else { 'RED' })")
  $out | ForEach-Object { Write-Host $_ }
  Write-Log ("check → " + $out[$out.Count - 1]) 'check'
  if (-not $ok) { exit 1 }
  exit 0
}

# ---------- 진입 ----------
switch ($Phase) {
  'check' { Run-Check }
  'prompts' {
    $script:Note = Get-Note
    Ensure-Dir (Join-Path $RawRoot 'prompts')
    foreach ($t in (Get-Tasks)) {
      $p = Build-Prompt $t
      $nc = Test-NoteInPrompt $p
      Write-Utf8 (Join-Path $RawRoot "prompts\$($t.id).txt") $p
      "{0,-5} chars={1,5} lines={2,3} sha256={3} note_match={4} · panJ prompt sha256={5}" -f $t.id, $p.Length, (Count-Lines $p), (Sha256 $p), $nc.match, (Sha256 (Build-JPrompt $t))
    }
    "fixed line chars=$($FixedLine.Length) sha256=$(Sha256 $FixedLine) (panJ $FixedLineSha)"
    "note chars=$($script:Note.Length) bytes=$($Utf8.GetByteCount($script:Note)) sha256=$(Sha256 $script:Note) (frozen $NoteSha)"
  }
  'canary' {
    foreach ($m in (Models-For $Model)) {
      $cp = Join-Path $Data "L-60-canary-$m.txt"
      if ((Test-Path -LiteralPath $cp) -and ((Read-Utf8 $cp) -match '(?m)^판정: PASS')) { "canary $m : 판정 PASS 확인 → pass=$(Confirm-CanaryPass $m)" }
      else { Run-Canary $m }
    }
  }
  'run' { foreach ($m in (Models-For $Model)) { Run-Model $m } }
  'reextract' { foreach ($m in (Models-For $Model)) { Reextract-Model $m } }
  'score' { Run-Score }
  'log' { Run-Log }
}
