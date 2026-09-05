#!/usr/bin/env python3
"""Export the FastAPI OpenAPI schema to JSON for TypeScript codegen.

Post-processes the schema to:
1. Mark fields that always have defaults as required (non-optional in TS)
2. Fix duplicate operation IDs from GET+HEAD on the same path
"""

import json
import re
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

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(schema, indent=2, default=str))

# ── Fix duplicate operation IDs ─────────────────────────────────
# FastAPI generates the same operationId for GET + HEAD on the same endpoint.
# This causes TS2300 "Duplicate identifier" in TypeScript.
content = OUTPUT.read_text()
# Find all operationId values and deduplicate
op_pattern = re.compile(r'"operationId":\s*"([^"]+)"')
seen: set[str] = set()
counter: dict[str, int] = {}

def _replace_op(match: re.Match) -> str:
    oid = match.group(1)
    if oid in counter:
        counter[oid] += 1
        oid = f"{oid}_{counter[oid]}"
    else:
        counter[oid] = 0
    return f'"operationId": "{oid}"'

content = op_pattern.sub(_replace_op, content)
OUTPUT.write_text(content)

print(f"✅ Exported OpenAPI schema to {OUTPUT}")
print(f"   {len(filtered_paths)} endpoints, {len(schemas)} schemas")
