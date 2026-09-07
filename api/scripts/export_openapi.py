#!/usr/bin/env python3
"""Export the FastAPI OpenAPI schema to JSON for TypeScript codegen.

Post-processes the schema to:
1. Mark fields that always have defaults as required (non-optional in TS)
2. Fix duplicate operation IDs from GET+HEAD on the same path
"""

import json
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import app

OUTPUT = Path(__file__).resolve().parent.parent.parent / "web" / "src" / "types" / "openapi.json"

schema = app.openapi()

# Remove internal/health/debug paths that don't need TS types
SKIP_PREFIXES = ("/health", "/docs", "/redoc", "/openapi.json")
filtered_paths = {
    k: v for k, v in schema.get("paths", {}).items()
    if not any(k.startswith(p) for p in SKIP_PREFIXES)
}
schema["paths"] = filtered_paths

# ── Post-process: fix fields that are always present in responses ──
schemas = schema.get("components", {}).get("schemas", {})

ALWAYS_PRESENT = {
    "TrackSchema": ["artist", "album", "streamUrl", "filePath", "youtubeId",
                     "spotifyId", "addedAt", "trackNumber", "playCount"],
    "AlbumSchema": ["artist", "tracks", "year"],
    "PlaylistSchema": ["tracks", "description", "artworkUrl", "spotifyId",
                        "totalDuration"],
    "ArtistSchema": ["imageUrl", "followers", "monthlyListeners", "description",
                      "subscribers", "topTracks", "albums"],
    "SearchResultsSchema": ["tracks", "albums", "artists", "playlists"],
    "ResolveResponseSchema": ["tracks", "albums", "artists", "playlists", "type"],
    "PlaylistResultSchema": ["artworkUrl"],
    "DownloadJobSchema": ["error", "filePath"],
}

for schema_name, fields in ALWAYS_PRESENT.items():
    if schema_name not in schemas:
        continue
    schema_obj = schemas[schema_name]
    required = set(schema_obj.get("required", []))
    properties = schema_obj.get("properties", {})
    for field in fields:
        if field in properties and field not in required:
            required.add(field)
    if required:
        schema_obj["required"] = sorted(required)

# ── Deduplicate operation IDs deterministically ────────────────
# FastAPI generates the same operationId for GET + HEAD on the same endpoint,
# which causes TS2300 "Duplicate identifier" in TypeScript. FastAPI's internal
# method ordering is a set, so a naive text-order rename flips which method
# keeps the base name on every run. Instead walk each path with a fixed method
# priority (GET first) so the generated types are stable across regenerations.
METHOD_ORDER = ("get", "head", "put", "post", "delete", "options", "patch", "trace")

used_ids: set[str] = set()
for path in sorted(schema.get("paths", {})):
    item = schema["paths"][path]
    for method in METHOD_ORDER:
        operation = item.get(method)
        if not operation or "operationId" not in operation:
            continue
        oid = operation["operationId"]
        if oid in used_ids:
            suffix = 1
            while f"{oid}_{suffix}" in used_ids:
                suffix += 1
            operation["operationId"] = f"{oid}_{suffix}"
            oid = operation["operationId"]
        used_ids.add(oid)

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(schema, indent=2, default=str))

print(f"✅ Exported OpenAPI schema to {OUTPUT}")
print(f"   {len(filtered_paths)} endpoints, {len(schemas)} schemas")
