#!/usr/bin/env bash
set -e

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ ! -f node_modules/next/package.json ]]; then
  npm ci
fi

printf '%s\n' 'Starting CodeLens dashboard and API. Press Ctrl+C to stop.'
exec npm run dev -- --hostname localhost "$@"
