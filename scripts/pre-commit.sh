#!/usr/bin/env bash
# Pre-commit checks. Fails closed: a missing tool blocks the commit.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo 'pre-commit: gitleaks is required but was not found in PATH' >&2
  exit 1
fi

gitleaks git --staged --redact --no-banner .
npm run --silent check
