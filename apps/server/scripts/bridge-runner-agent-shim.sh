#!/bin/sh
# Bridge Runner shim.
#
# T3 Code's Cursor driver expects to launch a command-line program. It first asks that
# program "who are you?" (`about --format json`), and then asks it to speak the Agent
# Client Protocol (`acp`). This shim answers the first question with fixed fake details
# and hands the second one to our mock agent.
#
# Nothing here contacts Cursor, and no credential is read. The email below is a
# placeholder string that only makes T3's "is this provider usable?" check pass.

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
NODE_BIN="${BRIDGE_RUNNER_NODE:-/usr/local/bin/node}"

case "$1" in
  about)
    echo '{"cliVersion":"2026.04.09-bridge-runner-mock","userEmail":"bridge-runner@localhost","subscriptionTier":"local"}'
    exit 0
    ;;
esac

exec "$NODE_BIN" "$SCRIPT_DIR/bridge-runner-mock-agent.ts" "$@"
