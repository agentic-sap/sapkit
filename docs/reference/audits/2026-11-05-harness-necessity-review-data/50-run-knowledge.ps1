#Requires -Version 7.0
<#
50-run-knowledge.ps1 — 판J T5 지식 시험 응시 러너 (blind run · 3 models × 107 items)

Follows 02-isolation-recipe.txt (Claude §2 · Codex §3 · canary §0) character for character, with exactly
these deviations (T5 task brief):
  1. own blind folder   %TEMP%\sapkit-panJ\blind-T5\      (empty-mcp.json only)
     own Codex home     %TEMP%\sapkit-panJ\codexhome-T5\  (auth.json copy only — the operator deletes it at the end)
  2. Codex gets  -c model_reasoning_effort="medium"  — verified by the banner run (recorded in 50-canary-gpt-5.6-sol.txt);
     if the flag is rejected the banner is re-run without it and the run continues without it (logged).
  3. raw event streams (JSONL · stderr · banner) go to %TEMP%\sapkit-panJ\raw-T5\<model>\  — outside the repo, never committed.

Prompt contract (every model, every item): fixed line + blank line + the item's question verbatim. One question = one CLI call.
Batches of <= BatchSize items; the first call of every batch is the canary (recipe §0 prompt, three pass criteria).
Validity: tool calls > 0 or https?:// in the answer => invalid => the same item is re-run (max MaxAttempts); invalid raw answers
are kept as 50-answers/<model>/<id>.invalid-<n>.txt and logged in 50-retries.txt.
Transient errors (non-zero exit · is_error · no/empty result · rate-limit error items) => wait 60 s, doubling up to 15 min,
retry the same item (logged in 50-retries.txt). Idempotent: items with a valid answer are skipped, so a run resumes after a limit.

Usage (PowerShell 7):
  & .\50-run-knowledge.ps1 -Check                      # completeness check (regenerates 50-summary.csv) — exit 0 GREEN / 1 RED
  & .\50-run-knowledge.ps1 -Model claude-opus-5-5
  & .\50-run-knowledge.ps1 -Model claude-sonnet-5-5
  & .\50-run-knowledge.ps1 -Model gpt-5.6-sol
Exit codes: 0 ok · 1 check RED · 2 canary FAIL (batch stopped) · 3 banner FAIL · 4 transient retries exhausted
#>
[CmdletBinding()]
param(
  [ValidateSet('claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol')]
  [string]$Model,
  [switch]$Check,
  [int]$BatchSize = 30,
  [int]$MaxAttempts = 3,
  [int]$MaxTransientRetries = 50,
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
if (-not $WorkRoot) { $WorkRoot = Join-Path $env:TEMP 'sapkit-panJ' }

# ---- pre-registered prompts (verbatim) -------------------------------------------------------------
$FixedLine    = 'Answer from memory in one or two lines, concisely. Do not use any tool, file, shell, or web search. (도구·파일·셸·웹 검색을 쓰지 말고 기억에서 한두 줄로 간결히 답하라.)'
$CanaryPrompt = "First, list every tool, skill, plugin, MCP server, slash command, web/search capability and file you currently have access to (say 'none' if none). Do not use any tool or web search. Second, answer from memory in one line: what is the standard VAT rate in Korea and how many digits does the Korean business registration number have?"
$BannerPrompt = 'Reply with exactly the single word OK and nothing else. Do not use any tool.'
$Models       = @('claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-5.6-sol')

# ---- paths ----------------------------------------------------------------------------------------
$BlindDir   = Join-Path $WorkRoot 'blind-T5'
$CodexHome  = Join-Path $WorkRoot 'codexhome-T5'
$RawRoot    = Join-Path $WorkRoot 'raw-T5'
$RunLog     = Join-Path $DataDir '50-run-log.txt'
$RetryLog   = Join-Path $DataDir '50-retries.txt'
$SummaryCsv = Join-Path $DataDir '50-summary.csv'
$Items10    = Join-Path $DataDir '10-knowledge-items.json'
$Items41    = Join-Path $DataDir '41-reproducible-items.json'

$script:CallCount  = 0
$script:CanaryNo   = 0
$script:EffortArgs = @('-c', 'model_reasoning_effort="medium"')

# ---- helpers --------------------------------------------------------------------------------------
# shared log files may be appended by two model runs at once — retry briefly on a file lock
function Add-Line([string]$Path, [string]$Value) {
  for ($i = 0; $i -lt 20; $i++) {
    try { Add-Content -Path $Path -Value $Value -Encoding utf8 -ErrorAction Stop; return } catch { Start-Sleep -Milliseconds 150 }
  }
  Write-Host "WARN: could not append to $Path after 20 tries: $Value"
}

function Write-Log([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Line $RunLog $line
  Write-Host $line
}

function Write-Retry([string]$Id, [int]$Attempt, [string]$Kind, [string]$Reason, [int]$WaitSec) {
  if (-not (Test-Path $RetryLog)) {
    Add-Line $RetryLog 'timestamp | model | id | attempt | kind(transient=wait+retry same item · invalid=tool call or URL → re-run) | reason | wait_s'
  }
  $r = ($Reason -replace '[\r\n]+', ' ')
  Add-Line $RetryLog ('{0} | {1} | {2} | {3} | {4} | {5} | {6}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Model, $Id, $Attempt, $Kind, $r, $WaitSec)
}

function Get-Items {
  $j = Get-Content -Raw -Encoding utf8 $Items10 | ConvertFrom-Json
  $k = Get-Content -Raw -Encoding utf8 $Items41 | ConvertFrom-Json
  $items = @()
  foreach ($it in $j.items) { $items += [pscustomobject]@{ id = [string]$it.id; source = '10'; question = [string]$it.question } }
  foreach ($it in @($k.items | Where-Object { $_.kind -eq 'knowledge' })) { $items += [pscustomobject]@{ id = [string]$it.id; source = '41'; question = [string]$it.question } }
  return $items
}

function Get-StderrTail([string]$Path) {
  if (-not (Test-Path $Path)) { return '' }
  $t = ([IO.File]::ReadAllText($Path, $Utf8NoBom) -replace '[\r\n]+', ' ').Trim()
  if ($t.Length -gt 300) { $t = $t.Substring($t.Length - 300) }
  return $t
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
  if ($errs.Count) { $extra += 'result_errors: ' + (($errs -join ' | ') -replace '[\r\n]+', ' ') }
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
  $extra += 'model_id_note: codex --json events carry no model id — observed id comes from the banner run recorded in 50-canary-gpt-5.6-sol.txt'
  $extra += "item_types: $(Format-Hist $hist)"
  $extra += "events: $(Format-Hist $evHist) · unparsed_lines: $($j.bad)"
  if ($errs.Count) { $extra += 'error_items: ' + (($errs -join ' | ') -replace '[\r\n]+', ' ') }
  $u = [ordered]@{}
  if ($usage) { foreach ($k in 'input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens') { if ($null -ne $usage.$k) { $u[$k] = [int64]$usage.$k } } }
  return [pscustomobject]@{ text = $text; tool_calls = $calls.Count; tool_names = $calls; url_count = $urls; observed_model = 'gpt-5.6-sol (banner)'; duration_ms = $null; usage = $u; is_error = $false; has_result = $turnDone; errors = $errs; extra = $extra }
}

function Parse-Raw([string]$RawPath) { if ($Model -like 'claude-*') { return (Parse-Claude $RawPath) } else { return (Parse-Codex $RawPath) } }

# canary criterion ① (self-report) — heuristic over the raw text; a line naming the category must carry a negative marker.
function Test-SelfReport([string]$Text) {
  $neg  = "(?i)\bnone\b|\bno\b|\bnot\b|\bnothing\b|don'?t|do not|cannot|can'?t|without|unavailable|\bn/a\b"
  $cats = [ordered]@{ skills = '(?i)\bskills?\b'; plugins = '(?i)\bplugins?\b'; mcp = '(?i)\bmcp\b'; web = '(?i)\b(web|search)\b' }
  $lines = @(([string]$Text) -split "`r?`n")
  $res = [ordered]@{}
  foreach ($c in $cats.Keys) {
    $hit = $false
    foreach ($ln in $lines) { if ($ln -match $cats[$c] -and $ln -match $neg) { $hit = $true; break } }
    $res[$c] = $hit
  }
  return $res
}

# ---- one CLI call (recipe §2 / §3 — the only edits are deviations 1–3) --------------------------------
function Invoke-Model([string]$Prompt, [string]$RawPath, [string]$ErrPath) {
  $script:CallCount++
  $sw = [Diagnostics.Stopwatch]::StartNew()
  if ($Model -like 'claude-*') {
    $env:CLAUDECODE = $null
    claude -p $Prompt --model $Model --tools "" --setting-sources "" --strict-mcp-config --mcp-config "$BlindDir\empty-mcp.json" --disable-slash-commands --output-format stream-json --verbose --no-session-persistence > $RawPath 2> $ErrPath
  } else {
    $env:CODEX_HOME = $CodexHome
    $effortArgs = $script:EffortArgs
    $null | codex exec --skip-git-repo-check -s read-only -C $BlindDir -m gpt-5.6-sol --json --ephemeral --ignore-user-config --ignore-rules --disable apps --disable plugins --disable image_generation --disable multi_agent -c 'web_search="disabled"' -c 'mcp_servers={}' -c 'skills.include_instructions=false' @effortArgs $Prompt > $RawPath 2> $ErrPath
  }
  $code = $LASTEXITCODE
  $sw.Stop()
  return [pscustomobject]@{ exit = $code; wall_ms = $sw.ElapsedMilliseconds }
}

function Get-TransientReason($r, $p) {
  if ($r.exit -ne 0) { return "exit=$($r.exit)" }
  if ($p.is_error) { $t = [string]$p.text; if ($t.Length -gt 160) { $t = $t.Substring(0, 160) }; return "is_error ($t)" }
  if (-not $p.has_result) { return 'no result/turn.completed event' }
  if ([string]::IsNullOrWhiteSpace($p.text)) { return 'empty result text' }
  $errText = ($p.errors -join ' ')
  if ($errText -match '(?i)rate.?limit|overloaded|\b429\b|usage limit|hit your limit|too many requests|\b5\d\d\b') { if ($errText.Length -gt 160) { $errText = $errText.Substring(0, 160) }; return "error item: $errText" }
  return $null
}

function Invoke-WithRetry([string]$Prompt, [string]$RawBase, [string]$Id, [int]$Attempt) {
  $tr = 0; $wait = 60
  while ($true) {
    $suffix = if ($tr -eq 0) { '' } else { ".try-$tr" }
    $raw = "$RawBase$suffix.jsonl"; $err = "$RawBase$suffix.stderr.txt"
    $r = Invoke-Model $Prompt $raw $err
    $p = Parse-Raw $raw
    $reason = Get-TransientReason $r $p
    if (-not $reason) { return [pscustomobject]@{ r = $r; p = $p; raw = $raw; err = $err; transient_retries = $tr } }
    $tr++
    if ($tr -gt $MaxTransientRetries) { Write-Log "transient retries exhausted on $Id ($reason) — stopping"; exit 4 }
    Write-Retry $Id $Attempt 'transient' "$reason [stderr: $(Get-StderrTail $err)]" $wait
    Write-Log "  transient #$tr on $Id — $reason — waiting $wait s"
    Start-Sleep -Seconds $wait
    $wait = [Math]::Min($wait * 2, 900)
  }
}

# ---- events summary (committed) -------------------------------------------------------------------
function Write-Events([string]$Path, $Item, [int]$Attempt, [bool]$Valid, $p, $r, [int]$TransientRetries, [int]$PrevInvalid) {
  $dur = if ($null -ne $p.duration_ms) { $p.duration_ms } else { $r.wall_ms }
  $lines = @(
    "id: $($Item.id)", "model: $Model", "source: $($Item.source)", "attempt: $Attempt", "valid: $($Valid.ToString().ToLower())",
    "tool_calls: $($p.tool_calls)", "tool_names: $(if ($p.tool_names.Count) { $p.tool_names -join ',' } else { 'none' })",
    "url_count: $($p.url_count)", "answer_chars: $(([string]$p.text).Length)", "duration_ms: $dur",
    "duration_note: $(if ($null -ne $p.duration_ms) { 'result.duration_ms from the claude stream-json result event' } else { 'wall-clock of the CLI call (codex --json has no duration field)' })",
    "wall_ms: $($r.wall_ms)", "exit_code: $($r.exit)", "transient_retries: $TransientRetries", "previous_invalid_attempts: $PrevInvalid",
    "observed_model: $($p.observed_model)"
  )
  foreach ($k in $p.usage.Keys) { $lines += "usage_${k}: $($p.usage[$k])" }
  $lines += $p.extra
  $lines += "recorded_at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
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
  $res = Invoke-WithRetry $CanaryPrompt $base "canary-$n" 1
  $p = $res.p; $r = $res.r
  $sr = Test-SelfReport $p.text
  $srOk = (@($sr.Values | Where-Object { -not $_ }).Count -eq 0)
  $mech = ($p.tool_calls -eq 0 -and $p.url_count -eq 0)
  $verdict = if ($mech -and $srOk) { 'PASS' } else { 'FAIL' }
  $lines = @()
  $lines += "=== canary #$n · model=$Model · batch=$BatchNo · $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ==="
  $lines += 'prompt: 02-isolation-recipe.txt §0 canary prompt (verbatim)'
  $lines += "observed_model: $($p.observed_model)"
  $lines += "tool_calls: $($p.tool_calls) · names: $(if ($p.tool_names.Count) { $p.tool_names -join ',' } else { 'none' })"
  $lines += "url_count: $($p.url_count)"
  $lines += 'self_report_heuristic: ' + (($sr.GetEnumerator() | ForEach-Object { "$($_.Key)=$(if ($_.Value) { 'none' } else { '?' })" }) -join ' ') + " → $(if ($srOk) { 'ok' } else { 'NOT ok (read the raw answer)' })"
  $lines += "exit_code: $($r.exit) · duration_ms: $($p.duration_ms) · wall_ms: $($r.wall_ms) · transient_retries: $($res.transient_retries)"
  foreach ($k in $p.usage.Keys) { $lines += "usage_${k}: $($p.usage[$k])" }
  $lines += $p.extra
  $lines += "verdict: $verdict"
  $lines += '--- raw answer (unedited) ---'
  $lines += [string]$p.text
  $lines += '--- end ---'
  $lines += ''
  Add-Content -Path $CanaryFile -Value ($lines -join "`r`n") -Encoding utf8
  Write-Log "canary #$n (batch $BatchNo): $verdict · tool_calls=$($p.tool_calls) · urls=$($p.url_count) · self_report=$(if ($srOk) { 'none x4' } else { 'UNCLEAR' }) · model=$($p.observed_model) · wall_ms=$($r.wall_ms)"
  return $verdict
}

function Run-Banner {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $out = Join-Path $RawDir "banner-$stamp.txt"; $err = Join-Path $RawDir "banner-$stamp.stderr.txt"
  $env:CODEX_HOME = $CodexHome
  $effortArgs = $script:EffortArgs
  $script:CallCount++
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $null | codex exec --skip-git-repo-check -s read-only -C $BlindDir -m gpt-5.6-sol --ephemeral --ignore-user-config --ignore-rules --disable apps --disable plugins --disable image_generation --disable multi_agent -c 'web_search="disabled"' -c 'mcp_servers={}' -c 'skills.include_instructions=false' @effortArgs --color never $BannerPrompt > $out 2> $err
  $code = $LASTEXITCODE; $sw.Stop()
  # codex prints the banner on stderr (observed 2026-11-05 17:14) — read both streams, drop only the session id line
  $all = @()
  foreach ($f in $out, $err) { if (Test-Path $f) { $all += @([IO.File]::ReadAllLines($f, $Utf8NoBom)) } }
  $lines = @($all | Where-Object { $_ -notmatch '(?i)^\s*session id' })
  $modelLine  = (@($lines | Where-Object { $_ -match '^\s*model:' }) -join ' / ').Trim()
  $effortLine = (@($lines | Where-Object { $_ -match '^\s*reasoning effort:' }) -join ' / ').Trim()
  $joined = $all -join "`n"
  $limitHit = $joined -match '(?i)usage limit|rate.?limit|too many requests|overloaded|\b429\b|try again'
  $ok = ($code -eq 0) -and ($modelLine -match 'gpt-5\.6-sol') -and ($effortLine -ne '')
  # banner printed => the flags were accepted; a failure after it is downstream (API / account limit) => transient, not a flag rejection
  $transient = (-not $ok) -and ($limitHit -or ($modelLine -ne ''))
  $rejected = (-not $ok) -and (-not $transient)
  $status = if ($ok) { 'PASS' } elseif ($transient) { 'TRANSIENT (account limit / API error after the banner — retried; not a flag rejection)' } else { 'FAIL (no banner printed — flag rejected or CLI error)' }
  $flag = if ($effortArgs.Count) { ($effortArgs -join ' ') } else { '(none)' }
  $rec = @("=== banner · model=$Model · $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · effort_flag=$flag ===", "exit_code: $code · wall_ms: $($sw.ElapsedMilliseconds)", 'stdout+stderr (verbatim, session id line removed):')
  $rec += $lines
  $rec += @("model_line: $modelLine", "reasoning_effort_line: $effortLine", "banner_check: $status", '')
  Add-Line $CanaryFile ($rec -join "`r`n")
  Write-Log "banner (flag=$flag): exit=$code · $modelLine · $effortLine · check=$status"
  return [pscustomobject]@{ ok = $ok; transient = $transient; rejected = $rejected; exit = $code; model_line = $modelLine; effort_line = $effortLine; tail = (Get-StderrTail $err) }
}

# ---- items ----------------------------------------------------------------------------------------
function Get-ItemState($Item) {
  $finalEv = Join-Path $EvDir "$($Item.id).txt"; $finalAns = Join-Path $AnsDir "$($Item.id).txt"
  if ((Test-Path $finalEv) -and (Test-Path $finalAns)) { $d = Read-Events $finalEv; if ($d['valid'] -eq 'true') { return 'valid' } }
  $prev = @(Get-ChildItem -Path $AnsDir -Filter "$($Item.id).invalid-*.txt" -ErrorAction SilentlyContinue).Count
  if ($prev -ge $MaxAttempts) { return 'exhausted' }
  return 'pending'
}

function Run-Item($Item, [int]$BatchNo, [int]$Index, [int]$Total) {
  $state = Get-ItemState $Item
  if ($state -ne 'pending') { Write-Log "[$Index/$Total] $($Item.id): skipped ($state)"; return $state }
  $prevInvalid = @(Get-ChildItem -Path $AnsDir -Filter "$($Item.id).invalid-*.txt" -ErrorAction SilentlyContinue).Count
  $prompt = $FixedLine + "`n`n" + $Item.question
  $attempt = $prevInvalid
  while ($attempt -lt $MaxAttempts) {
    $attempt++
    $base = Join-Path $RawDir "$($Item.id).attempt-$attempt"
    $res = Invoke-WithRetry $prompt $base $Item.id $attempt
    $p = $res.p; $r = $res.r
    $valid = ($p.tool_calls -eq 0 -and $p.url_count -eq 0)
    if ($valid) {
      [IO.File]::WriteAllText((Join-Path $AnsDir "$($Item.id).txt"), [string]$p.text, $Utf8NoBom)
      Write-Events (Join-Path $EvDir "$($Item.id).txt") $Item $attempt $true $p $r $res.transient_retries $prevInvalid
      Copy-Item -Path $res.raw -Destination (Join-Path $RawDir "$($Item.id).jsonl") -Force
      Write-Log "[$Index/$Total] $($Item.id): valid (attempt $attempt · tool_calls=0 · urls=0 · $($r.wall_ms) ms · chars=$(([string]$p.text).Length))"
      return 'valid'
    }
    [IO.File]::WriteAllText((Join-Path $AnsDir "$($Item.id).invalid-$attempt.txt"), [string]$p.text, $Utf8NoBom)
    Write-Events (Join-Path $EvDir "$($Item.id).invalid-$attempt.txt") $Item $attempt $false $p $r $res.transient_retries $prevInvalid
    $why = "tool_calls=$($p.tool_calls) [$($p.tool_names -join ',')] url_count=$($p.url_count)"
    Write-Retry $Item.id $attempt 'invalid' $why 0
    Write-Log "[$Index/$Total] $($Item.id): INVALID attempt $attempt — $why — re-running"
    $prevInvalid = $attempt
  }
  Write-Log "[$Index/$Total] $($Item.id): INVALID after $MaxAttempts attempts — recorded as INVALID (no answer fabricated)"
  return 'exhausted'
}

# ---- completeness check + summary csv -------------------------------------------------------------
function Test-Complete {
  $items = Get-Items
  $batches = [int][Math]::Ceiling($items.Count / $BatchSize)
  $rows = @('model,id,source(10|41),valid,attempts,tool_calls,url_count,answer_chars,duration_ms')
  $green = $true
  $report = @("=== CHECK $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') · items expected per model = $($items.Count) · batch_size = $BatchSize (min canaries = $batches) ===")
  foreach ($m in $Models) {
    $ansDir = Join-Path $DataDir "50-answers\$m"; $evDir = Join-Path $DataDir "50-events\$m"; $canFile = Join-Path $DataDir "50-canary-$m.txt"
    $answers = 0; $valid = 0; $invalid = 0; $pending = 0; $modelMismatch = 0; $retriesTransient = 0; $retriesInvalid = 0
    foreach ($it in $items) {
      $finalEv = Join-Path $evDir "$($it.id).txt"; $finalAns = Join-Path $ansDir "$($it.id).txt"
      if (Test-Path $finalAns) { $answers++ }
      $d = $null; $isValid = $false
      if ((Test-Path $finalEv) -and (Test-Path $finalAns)) { $d = Read-Events $finalEv; $isValid = ($d['valid'] -eq 'true') }
      if (-not $isValid) {
        $inv = @(Get-ChildItem -Path $evDir -Filter "$($it.id).invalid-*.txt" -ErrorAction SilentlyContinue | Sort-Object { [int]($_.BaseName -replace '.*invalid-', '') })
        if ($inv.Count -ge $MaxAttempts) { $d = Read-Events $inv[-1].FullName; $isValid = $false } else { $d = $null }
      }
      if ($null -eq $d) { $pending++; continue }
      if ($isValid) { $valid++ } else { $invalid++ }
      if ($m -like 'claude-*' -and $d['observed_model'] -ne $m) { $modelMismatch++ }
      $rows += ('{0},{1},{2},{3},{4},{5},{6},{7},{8}' -f $m, $it.id, $it.source, $(if ($isValid) { 'true' } else { 'false' }), $d['attempt'], $d['tool_calls'], $d['url_count'], $d['answer_chars'], $d['duration_ms'])
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
    $okModel = ($answers -eq $items.Count) -and ($valid -eq $items.Count) -and ($invalid -eq 0) -and ($pending -eq 0) -and ($canPass -ge $batches) -and ($canFail -eq 0) -and ($modelMismatch -eq 0)
    if ($m -eq 'gpt-5.6-sol') { $okModel = $okModel -and ($bannerPass -ge 1) -and ($lastBanner -eq 'PASS') }
    if (-not $okModel) { $green = $false }
    $bannerTxt = if ($m -eq 'gpt-5.6-sol') { " · banner PASS=$bannerPass not-PASS=$bannerFail last=$lastBanner" } else { '' }
    $report += ("{0,-18} answers={1,3}/{2} valid={3,3} invalid={4} pending={5,3} canary PASS={6} FAIL={7}{8} · retries transient={9} invalid={10} · observed-model mismatches={11} → {12}" -f $m, $answers, $items.Count, $valid, $invalid, $pending, $canPass, $canFail, $bannerTxt, $retriesTransient, $retriesInvalid, $modelMismatch, $(if ($okModel) { 'ok' } else { 'NOT ok' }))
  }
  Set-Content -Path $SummaryCsv -Value ($rows -join "`r`n") -Encoding utf8
  $rowCount = $rows.Count - 1
  $expectedRows = $items.Count * $Models.Count
  if ($rowCount -ne $expectedRows) { $green = $false }
  $report += "summary rows = $rowCount / $expectedRows (50-summary.csv regenerated)"
  $report += "RESULT: $(if ($green) { 'GREEN' } else { 'RED' })"
  foreach ($l in $report) { Add-Content -Path $RunLog -Value $l -Encoding utf8; Write-Host $l }
  if ($green) { return 0 } else { return 1 }
}

# ---- main -----------------------------------------------------------------------------------------
if ($Check) { exit (Test-Complete) }
if (-not $Model) { Write-Host 'specify -Model <claude-opus-5-5|claude-sonnet-5-5|gpt-5.6-sol> or -Check'; exit 2 }

$RawDir     = Join-Path $RawRoot $Model
$AnsDir     = Join-Path $DataDir "50-answers\$Model"
$EvDir      = Join-Path $DataDir "50-events\$Model"
$CanaryFile = Join-Path $DataDir "50-canary-$Model.txt"
foreach ($d in $RawDir, $AnsDir, $EvDir, $BlindDir) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Set-Content -Path (Join-Path $BlindDir 'empty-mcp.json') -Value '{"mcpServers":{}}' -Encoding utf8
if ($Model -eq 'gpt-5.6-sol') {
  New-Item -ItemType Directory -Force -Path $CodexHome | Out-Null
  if (-not (Test-Path (Join-Path $CodexHome 'auth.json'))) { Copy-Item -Path (Join-Path $HOME '.codex\auth.json') -Destination (Join-Path $CodexHome 'auth.json') }
}
if (Test-Path $CanaryFile) { $script:CanaryNo = @([IO.File]::ReadAllLines($CanaryFile, $Utf8NoBom) | Where-Object { $_ -like '=== canary #*' }).Count }

$items = Get-Items
$runStart = Get-Date
$claudeVer = (claude --version 2>&1 | Out-String).Trim()
$codexVer  = (codex --version 2>&1 | Out-String).Trim()
Write-Log "=== START model=$Model · items=$($items.Count) (60 from 10-knowledge-items.json + 47 kind=knowledge from 41-reproducible-items.json) · batch_size=$BatchSize · max_attempts=$MaxAttempts · claude --version: $claudeVer · codex --version: $codexVer ==="
Write-Log "blind_dir=$BlindDir · codex_home=$CodexHome · raw_dir=$RawDir (raw JSONL stays outside the repo)"
Write-Log ('prompt = fixed line + blank line + question (verbatim); fixed line: ' + $FixedLine)
if ($Model -like 'claude-*') {
  Write-Log ('command: $env:CLAUDECODE = $null; claude -p "<PROMPT>" --model ' + $Model + ' --tools "" --setting-sources "" --strict-mcp-config --mcp-config "<BLIND>\empty-mcp.json" --disable-slash-commands --output-format stream-json --verbose --no-session-persistence > "<RAW>\<ID>.attempt-<N>.jsonl" 2> "<RAW>\<ID>.attempt-<N>.stderr.txt"')
} else {
  Write-Log ('command: $env:CODEX_HOME = "<CODEXHOME>"; $null | codex exec --skip-git-repo-check -s read-only -C "<BLIND>" -m gpt-5.6-sol --json --ephemeral --ignore-user-config --ignore-rules --disable apps --disable plugins --disable image_generation --disable multi_agent -c ''web_search="disabled"'' -c ''mcp_servers={}'' -c ''skills.include_instructions=false'' -c ''model_reasoning_effort="medium"'' "<PROMPT>" > "<RAW>\<ID>.attempt-<N>.jsonl" 2> "<RAW>\<ID>.attempt-<N>.stderr.txt"')
  Write-Log ('banner command: same flags without --json, plus --color never, prompt "' + $BannerPrompt + '" (model id + reasoning effort read from the banner)')
}

Push-Location $BlindDir
try {
  if ($Model -eq 'gpt-5.6-sol' -and -not $NoBanner) {
    $bw = 60; $bt = 0
    while ($true) {
      $b = Run-Banner
      if ($b.ok) { break }
      if ($b.rejected) {
        if ($script:EffortArgs.Count) { Write-Log "banner: no banner printed with the reasoning-effort flag (exit=$($b.exit) · $($b.tail)) — treating the flag as rejected; re-running the banner without it"; $script:EffortArgs = @(); continue }
        Write-Log "banner FAILED without the flag too (exit=$($b.exit) · $($b.tail)) — stopping"; exit 3
      }
      $bt++
      if ($bt -gt $MaxTransientRetries) { Write-Log 'banner: transient retries exhausted — stopping'; exit 4 }
      Write-Retry 'banner' 1 'transient' "exit=$($b.exit) [$($b.tail)]" $bw
      Write-Log "banner: transient (exit=$($b.exit) · $($b.tail)) — waiting $bw s"
      Start-Sleep -Seconds $bw
      $bw = [Math]::Min($bw * 2, 900)
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
  $elapsed = (Get-Date) - $runStart
  Write-Log "=== END model=$Model · this run: valid=$($counts.valid) · INVALID(exhausted)=$($counts.exhausted) · skipped(already done)=$($counts.skipped) · CLI calls=$($script:CallCount) · wall=$([int]$elapsed.TotalSeconds) s ($($elapsed.ToString('hh\:mm\:ss'))) ==="
} finally { Pop-Location }
exit 0
