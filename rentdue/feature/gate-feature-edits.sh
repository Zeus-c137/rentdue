#!/usr/bin/env bash
# PreToolUse hook for Edit|Write.
# Blocks writes to feature/page/component/route files unless a blueprint
# for the current scratch run has been approved. This is the mechanical
# backstop for step2_scrutinize.md's "no inline utilities" / blueprint-first rule --
# it does not rely on the coder agent remembering the instruction.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | sed -E 's/.*: *"(.*)"/\1/')

# Only gate paths that are typical "feature-local" locations where inline
# utilities tend to get smuggled in. Shared dirs are exempt -- creating
# src/utils/foo.ts should never be blocked.
if ! echo "$FILE_PATH" | grep -Eq 'src/(features|pages|routes|components)/'; then
  exit 0
fi

# Find the most recently modified scratch run's blueprint-approved marker.
LATEST_MARKER=$(find rentdue/scratch -maxdepth 2 -name blueprint-approved 2>/dev/null | xargs -r ls -t | head -n 1 || true)

if [ -z "$LATEST_MARKER" ]; then
  echo '{"decision": "block", "reason": "No approved blueprint found for this run (rentdue/scratch/<task>/blueprint-approved missing). Run /build-feature so blueprint-architect runs before any feature-file edit."}'
  exit 0
fi

exit 0
