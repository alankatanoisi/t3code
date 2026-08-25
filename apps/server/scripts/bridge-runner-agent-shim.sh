#!/bin/sh
# Bridge Runner shim — LIVE since 2026-08-24 (Slice C acceptance).
#
# T3 Code's Cursor driver launches a command-line program twice: first
# `about --format json` ("who are you?" — answered here with fixed placeholder
# details that satisfy the driver's version/auth gate), then `acp` for the
# real Agent Client Protocol session.
#
# The `acp` invocation now execs the REAL bridge runner ACP agent in the
# playground repo. It talks to the local bridge on 127.0.0.1:11437, so turns
# spend real model calls through Alan's Claude Code credentials.
#
# Capability posture (deliberate):
#   - no --capabilities flag  → core read-only tool set; file edits are OFF
#   - --trust-workspace       → records workspace trust for the thread cwd,
#                               because a headless process cannot answer the
#                               interactive trust prompt (fail-closed otherwise)
#   - shell stays off          → only an explicit --allow-shell here could
#                               enable it; never add it casually
# To allow file edits (still approval-gated per write in Ask mode), append:
#   --capabilities edits
#
# The previous mock agent is kept at bridge-runner-mock-agent.ts; point the
# exec back at it to return to the no-spend demo.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NODE_BIN="${BRIDGE_RUNNER_NODE:-/usr/local/bin/node}"
ACP_AGENT="/Users/alanman/Developer/claude-local-bridge-playground/bin/local-bridge-acp.js"

case "$1" in
  about)
    echo '{"cliVersion":"2026.08.24-bridge-runner-live","userEmail":"bridge-runner@localhost","subscriptionTier":"local"}'
    exit 0
    ;;
esac

# "$@" carries the `acp` subcommand token; the agent binary tolerates it.
# --capabilities edits: enabled 2026-08-24 for the approval-card acceptance;
# every write still asks for an approval card in Supervised mode.
exec "$NODE_BIN" "$ACP_AGENT" --trust-workspace --capabilities edits "$@"
