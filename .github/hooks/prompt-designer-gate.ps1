# UserPromptSubmit hook - Prompt Designer (HARD enforcement)
# Rewrites the user prompt via `gh models run` and injects as additionalContext.
# Bypass: prefix with `!raw `
# Fallback: soft directive on any failure.

# ---------- Config ----------
$Model       = if ($env:PROMPT_DESIGNER_MODEL)   { $env:PROMPT_DESIGNER_MODEL }   else { 'openai/gpt-4.1-mini' }
$MaxTokens   = if ($env:PROMPT_DESIGNER_MAX_TOK) { $env:PROMPT_DESIGNER_MAX_TOK } else { '600' }
$Temperature = if ($env:PROMPT_DESIGNER_TEMP)    { $env:PROMPT_DESIGNER_TEMP }    else { '0.2' }

$GhExe = 'C:\Program Files\GitHub CLI\gh.exe'
if (-not (Test-Path $GhExe)) {
    $ghCmd = Get-Command gh -ErrorAction SilentlyContinue
    if ($ghCmd) { $GhExe = $ghCmd.Source }
}

# ---------- Helpers ----------
function Emit-Continue { Write-Output '{"continue":true}'; exit 0 }
function Emit-Context($text) {
    $obj = @{ hookSpecificOutput = @{ hookEventName = 'UserPromptSubmit'; additionalContext = $text } }
    Write-Output ($obj | ConvertTo-Json -Depth 5 -Compress)
    exit 0
}

# ---------- Read stdin ----------
try   { $raw = [Console]::In.ReadToEnd(); $payload = $raw | ConvertFrom-Json; $prompt = [string]$payload.prompt }
catch { $prompt = '' }

# ---------- Short-circuits ----------
if ($prompt -match '^\s*!raw\b')  { Emit-Continue }
if ($prompt.Trim().Length -lt 12) { Emit-Continue }

# ---------- Soft fallback ----------
$softDirective = '[prompt-designer-gate | soft fallback] Before answering, silently invoke the promptdesinger subagent via runSubagent with the user raw text, then act on the refined prompt it returns.'

if (-not (Test-Path $GhExe)) { Emit-Context $softDirective }

# ---------- Resolve GH_TOKEN for keyring-less environments (VS Code hook runner) ----------
if (-not $env:GH_TOKEN) {
    try {
        $ErrorActionPreference = 'Continue'
        $token = & $GhExe auth token 2>$null
        $ErrorActionPreference = 'Stop'
        if ($token -and $token.Length -gt 10) { $env:GH_TOKEN = $token.Trim() }
    } catch {}
}
if (-not $env:GH_TOKEN) { Emit-Context $softDirective }

# ---------- Build combined prompt ----------
$combinedInput = @"
[SYSTEM]
You are a Prompt Designer. Rewrite the USER message into a precise spec a coding agent can execute.
Output ONLY the refined spec using this template:
## Objective
{what to accomplish}
## Context
{what the agent needs to know}
## Constraints
{boundaries, exclusions}
## Expected Output
{deliverable format}
## Acceptance Criteria
{testable conditions}
Rules: Replace pronouns. Preserve file paths and symbols verbatim. Convert vague qualifiers to measurable targets. If it is a question or meta-question, output only: PASSTHROUGH

[USER]
$prompt
"@

# ---------- Call gh models run (ErrorAction Continue to survive stderr spinner) ----------
try {
    $ErrorActionPreference = 'Continue'
    $lines = @()
    $combinedInput | & $GhExe models run --max-tokens $MaxTokens --temperature $Temperature $Model 2>$null | ForEach-Object { $lines += $_ }
    $ErrorActionPreference = 'Stop'
    $stdout = $lines -join "`n"

    if ([string]::IsNullOrWhiteSpace($stdout)) { Emit-Context $softDirective }

    $refined = $stdout.Trim()

    # Guard: reject error messages that gh might emit as stdout
    if ($refined -match '(?i)token|authenticate|login|error|unauthorized|forbidden') {
        if ($refined -notmatch '##') { Emit-Context $softDirective }
    }
    if ($refined -eq 'PASSTHROUGH') { Emit-Continue }

    $injected = @"
[prompt-designer-gate | hard rewrite]
The user raw message has been rewritten into the spec below.
Treat the spec as the authoritative instruction.

----- REFINED SPEC -----
$refined
----- END SPEC -----
"@
    Emit-Context $injected
}
catch {
    Emit-Context $softDirective
}
