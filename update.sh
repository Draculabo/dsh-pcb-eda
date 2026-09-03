#! /bin/bash
set -e

pids=$(lsof -ti:3080 || true)
if [ -n "$pids" ]; then
  kill -9 $pids
fi

npx @deepseek-ai/dsh plugin --profile web add ./packages/dsh-auth
npx @deepseek-ai/dsh plugin --profile web add ./packages/dsh-artifacts
npx @deepseek-ai/dsh plugin --profile web add ./packages/dsh-tool-part-search
npx @deepseek-ai/dsh plugin --profile web add ./packages/dsh-tool-symbol-footprint
npx @deepseek-ai/dsh plugin --profile web add ./packages/dsh-tool-schematic-gen

npx @deepseek-ai/dsh web
