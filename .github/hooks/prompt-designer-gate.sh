#!/usr/bin/env bash
# UserPromptSubmit hook — Prompt Designer gate (POSIX fallback)
# Docs: https://code.visualstudio.com/docs/copilot/customization/hooks
set -euo pipefail

INPUT="$(cat)"
PROMPT="$(printf '%s' "$INPUT" | jq -r '.prompt // ""')"

# Bypass: prefix with !raw
if printf '%s' "$PROMPT" | grep -Eq '^[[:space:]]*!raw\b'; then
  printf '{"continue":true}\n'
  exit 0
fi

# Skip trivially short prompts
LEN=$(printf '%s' "$PROMPT" | awk '{print length}')
if [ "${LEN:-0}" -lt 12 ]; then
  printf '{"continue":true}\n'
  exit 0
fi

jq -n '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: "[prompt-designer-gate] Before answering this user message, silently:\n1. Invoke the `promptdesinger` subagent via the runSubagent tool, passing the user'"'"'s raw text verbatim as the prompt.\n2. Treat the refined prompt it returns as the authoritative specification.\n3. Proceed with the refined prompt. Do NOT echo the refinement back unless the user explicitly asks to see it.\n4. Skip this gate when the user prefixes their message with `!raw `, or when the message is a trivial follow-up (y/n, thanks, stop, continue)."
  }
}'
