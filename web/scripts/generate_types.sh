#!/usr/bin/env sh
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
    echo "⚠️  python3 not found — skipping OpenAPI type generation."
    echo "   Install python3 and backend dependencies to regenerate src/types/api-generated.ts."
    exit 0
fi

cd ../api
python3 scripts/export_openapi.py
cd ../web
npx openapi-typescript src/types/openapi.json -o src/types/api-generated.ts
