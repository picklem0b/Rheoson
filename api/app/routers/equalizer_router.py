"""Equalizer API — preset management and custom EQ configurations.

The equalizer runs client-side (Web Audio API BiquadFilterNodes), but
preset configurations are managed server-side so they sync across devices.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.core.deps import get_current_user

router = APIRouter()

# ── Built-in presets ───────────────────────────────────────────

PRESETS: dict[str, dict] = {
    "flat": {
        "name": "Flat",
        "description": "No modification — faithful to the original mix",
        "bands": [
            {"freq": 60,   "gain": 0,  "type": "lowshelf"},
            {"freq": 230,  "gain": 0,  "type": "peaking"},
            {"freq": 910,  "gain": 0,  "type": "peaking"},
            {"freq": 3600, "gain": 0,  "type": "peaking"},
            {"freq": 14000,"gain": 0,  "type": "highshelf"},
        ],
    },
    "bass_boost": {
        "name": "Bass Boost",
        "description": "Enhanced low-end for punchy bass",
        "bands": [
            {"freq": 60,   "gain": 8,  "type": "lowshelf"},
            {"freq": 230,  "gain": 5,  "type": "peaking"},
            {"freq": 910,  "gain": 0,  "type": "peaking"},
            {"freq": 3600, "gain": 0,  "type": "peaking"},
            {"freq": 14000,"gain": 0,  "type": "highshelf"},
        ],
    },
    "treble_boost": {
        "name": "Treble Boost",
        "description": "Enhanced highs for crisp, airy sound",
        "bands": [
            {"freq": 60,   "gain": 0,  "type": "lowshelf"},
            {"freq": 230,  "gain": 0,  "type": "peaking"},
            {"freq": 910,  "gain": 2,  "type": "peaking"},
            {"freq": 3600, "gain": 5,  "type": "peaking"},
            {"freq": 14000,"gain": 8,  "type": "highshelf"},
        ],
    },
    "vocal": {
        "name": "Vocal",
        "description": "Boosted midrange for podcasts and vocal-heavy tracks",
        "bands": [
            {"freq": 60,   "gain": -2, "type": "lowshelf"},
            {"freq": 230,  "gain": 2,  "type": "peaking"},
            {"freq": 910,  "gain": 6,  "type": "peaking"},
            {"freq": 3600, "gain": 4,  "type": "peaking"},
            {"freq": 14000,"gain": 0,  "type": "highshelf"},
        ],
    },
    "electronic": {
        "name": "Electronic",
        "description": "Enhanced bass and highs for EDM and electronic music",
        "bands": [
            {"freq": 60,   "gain": 7,  "type": "lowshelf"},
            {"freq": 230,  "gain": 2,  "type": "peaking"},
            {"freq": 910,  "gain": -1, "type": "peaking"},
            {"freq": 3600, "gain": 3,  "type": "peaking"},
            {"freq": 14000,"gain": 6,  "type": "highshelf"},
        ],
    },
    "hiphop": {
        "name": "Hip-Hop",
        "description": "Heavy bass with clear mids for hip-hop and rap",
        "bands": [
            {"freq": 60,   "gain": 9,  "type": "lowshelf"},
            {"freq": 230,  "gain": 4,  "type": "peaking"},
            {"freq": 910,  "gain": 1,  "type": "peaking"},
            {"freq": 3600, "gain": 2,  "type": "peaking"},
            {"freq": 14000,"gain": 3,  "type": "highshelf"},
        ],
    },
    "rock": {
        "name": "Rock",
        "description": "Enhanced presence and power for rock and metal",
        "bands": [
            {"freq": 60,   "gain": 5,  "type": "lowshelf"},
            {"freq": 230,  "gain": 3,  "type": "peaking"},
            {"freq": 910,  "gain": 4,  "type": "peaking"},
            {"freq": 3600, "gain": 5,  "type": "peaking"},
            {"freq": 14000,"gain": 4,  "type": "highshelf"},
        ],
    },
    "acoustic": {
        "name": "Acoustic",
        "description": "Warm, natural sound for acoustic and classical",
        "bands": [
            {"freq": 60,   "gain": 3,  "type": "lowshelf"},
            {"freq": 230,  "gain": 2,  "type": "peaking"},
            {"freq": 910,  "gain": 3,  "type": "peaking"},
            {"freq": 3600, "gain": 4,  "type": "peaking"},
            {"freq": 14000,"gain": 5,  "type": "highshelf"},
        ],
    },
    "loudness": {
        "name": "Loudness",
        "description": "Equal-loudness contour — boosts lows and highs at low volumes",
        "bands": [
            {"freq": 60,   "gain": 6,  "type": "lowshelf"},
            {"freq": 230,  "gain": 2,  "type": "peaking"},
            {"freq": 910,  "gain": 0,  "type": "peaking"},
            {"freq": 3600, "gain": 2,  "type": "peaking"},
            {"freq": 14000,"gain": 6,  "type": "highshelf"},
        ],
    },
    "nightmode": {
        "name": "Night Mode",
        "description": "Reduced bass and harsh highs for late-night listening",
        "bands": [
            {"freq": 60,   "gain": -4, "type": "lowshelf"},
            {"freq": 230,  "gain": -1, "type": "peaking"},
            {"freq": 910,  "gain": 2,  "type": "peaking"},
            {"freq": 3600, "gain": -1, "type": "peaking"},
            {"freq": 14000,"gain": -3, "type": "highshelf"},
        ],
    },
}


class EQBand(BaseModel):
    freq: float
    gain: float  # -12 to +12 dB
    type: str = "peaking"  # peaking, lowshelf, highshelf


class EQPreset(BaseModel):
    name: str
    description: str = ""
    bands: list[EQBand]


@router.get("/presets")
async def list_presets(_user: dict = Depends(get_current_user)):
    """Return all built-in equalizer presets."""
    return {
        "presets": [
            {"id": k, "name": v["name"], "description": v["description"]}
            for k, v in PRESETS.items()
        ]
    }


@router.get("/presets/{preset_id}")
async def get_preset(preset_id: str, _user: dict = Depends(get_current_user)):
    """Return full band configuration for a preset."""
    preset = PRESETS.get(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail=f"Preset not found: {preset_id}")
    return {"id": preset_id, **preset}
