"""Genre + persona helpers for the taste profile.

The recommendation pipeline records artist names but almost never has a
genre per play (YouTube metadata doesn't ship one). Rather than leave the
genre half of the profile empty — which silently disabled genre affinity
scoring and discovery — we infer a primary genre per artist from a
curated map plus keyword rules. Precision is imperfect for niche acts
(they simply drop out of the genre ranking), but for the artists people
actually replay it is reliably right, which is what the stats UI needs.

`compute_persona` turns the profile's shape into a human label — "what
kind of listener are you" — for the Stats page.
"""

from __future__ import annotations

import re

# ── Primary-genre map for the artists users most often replay ──
# (spelling must match the artist names stored on signals)

KNOWN_ARTISTS: dict[str, list[str]] = {
    # Hip-Hop / Rap
    "kendrick lamar": ["Hip-Hop", "Rap"],
    "drake":          ["Hip-Hop", "R&B"],
    "j. cole":        ["Hip-Hop", "Rap"],
    "travis scott":   ["Hip-Hop", "Rap"],
    "21 savage":      ["Hip-Hop", "Rap"],
    "future":         ["Hip-Hop", "Trap"],
    "cardi b":        ["Hip-Hop", "Rap"],
    "nicki minaj":    ["Hip-Hop", "Pop"],
    "megan thee stallion": ["Hip-Hop", "Rap"],
    "doja cat":       ["Pop", "Hip-Hop"],
    "kanye west":     ["Hip-Hop"],
    "eminem":         ["Hip-Hop", "Rap"],
    "tyler, the creator": ["Hip-Hop", "Rap"],
    "50 cent":        ["Hip-Hop", "Rap"],
    "snoop dogg":     ["Hip-Hop", "Rap"],
    "ice spice":      ["Hip-Hop", "Rap"],
    "playboi carti":  ["Hip-Hop", "Rap"],
    "lil uzi vert":   ["Hip-Hop", "Rap"],
    "lil baby":       ["Hip-Hop", "Rap"],
    "gunna":          ["Hip-Hop", "Rap"],
    "young thug":     ["Hip-Hop", "Rap"],
    "juice wrld":     ["Hip-Hop", "Rap"],
    "metro boomin":   ["Hip-Hop", "Rap"],
    # R&B / Soul
    "sza":            ["R&B", "Soul"],
    "frank ocean":    ["R&B", "Soul"],
    "brent faiyaz":   ["R&B", "Soul"],
    "daniel caesar":  ["R&B", "Soul"],
    "giveon":         ["R&B", "Soul"],
    "solange":        ["R&B", "Soul"],
    "alicia keys":    ["R&B", "Soul"],
    "usher":          ["R&B", "Pop"],
    "chris brown":    ["R&B", "Pop"],
    "tems":           ["R&B", "Afrobeats"],
    "jhené aiko":     ["R&B", "Soul"],
    "summer walker":  ["R&B", "Soul"],
    # Afrobeats & South African
    "burna boy":      ["Afrobeats"],
    "wizkid":         ["Afrobeats"],
    "davido":         ["Afrobeats"],
    "rema":           ["Afrobeats"],
    "asa":            ["Afrobeats", "Soul"],
    "ckay":           ["Afrobeats", "R&B"],
    "black sherif":   ["Afrobeats", "Hip-Hop"],
    "ayra starr":     ["Afrobeats", "R&B"],
    "omah lay":       ["Afrobeats", "R&B"],
    "tayc":           ["Afrobeats", "R&B"],
    "kabza de small": ["Amapiano"],
    "dj maphorisa":   ["Amapiano", "House"],
    "maphorisa":      ["Amapiano", "House"],
    "sha sha":        ["Amapiano"],
    "young stunna":   ["Amapiano"],
    "am i who":       ["Amapiano"],
    "djy ma'ten":     ["Amapiano"],
    "mr jazziq":      ["Amapiano", "Afrobeats"],
    "semi teee":      ["Amapiano"],
    "tman xpress":    ["Amapiano"],
    "master kg":      ["Kwaito", "Amapiano"],
    "arthur mafokate": ["Kwaito"],
    "mdu masuka":     ["Kwaito", "Amapiano"],
    "black coffee":   ["House"],
    "dj zinhle":      ["House", "Amapiano"],
    "mi casa":        ["House", "Amapiano"],
    "victor ntoni":   ["Gqom"],
    "dj lag":         ["Gqom"],
    "babes wodumo":   ["Gqom"],
    "amanda black":   ["R&B", "Pop"],
    "khalid":         ["R&B", "Pop"],
    "sjava":          ["R&B", "Afro-soul"],
    "mthandazo gatya": ["Afro-soul"],
    "nasty c":        ["Hip-Hop"],
    "blxckie":        ["Hip-Hop", "Amapiano"],
    "a-reece":        ["Hip-Hop"],
    "cassper nyovest": ["Hip-Hop", "Kwaito"],
    # Pop
    "taylor swift":   ["Pop"],
    "ariana grande":  ["Pop", "R&B"],
    "billie eilish":  ["Pop", "Alt-Pop"],
    "dua lipa":       ["Pop", "Dance"],
    "ed sheeran":     ["Pop"],
    "olivia rodrigo": ["Pop"],
    "the weeknd":     ["R&B", "Pop"],
    "justin bieber":  ["Pop", "R&B"],
    "harry styles":   ["Pop"],
    "bad bunny":      ["Reggaeton", "Latin"],
    "j balvin":       ["Reggaeton", "Latin"],
    "rosalía":        ["Latin", "Pop"],
    # Electronic / Dance
    "calvin harris":  ["Electronic", "Dance"],
    "david guetta":   ["Electronic", "Dance"],
    "skrillex":       ["Electronic", "Dubstep"],
    "marshmello":     ["Electronic", "Dance"],
    "fred again":     ["Electronic", "House"],
    "odesza":         ["Electronic"],
    "rufus du sol":   ["Electronic", "House"],
    "flume":          ["Electronic"],
    # Rock / Metal
    "coldplay":       ["Rock", "Pop"],
    "imagine dragons": ["Rock", "Pop"],
    "arctic monkeys": ["Rock", "Indie"],
    "foo fighters":   ["Rock"],
    "linkin park":    ["Rock", "Alt"],
    "radiohead":      ["Rock", "Indie"],
    "the 1975":       ["Rock", "Indie"],
    "metallica":      ["Metal"],
    "system of a down": ["Metal"],
    "nirvana":        ["Rock", "Grunge"],
    "tame impala":    ["Rock", "Psych"],
    # Jazz / Soul classics
    "miles davis":    ["Jazz"],
    "john coltrane":  ["Jazz"],
    "nina simone":    ["Jazz", "Soul"],
    "amy winehouse":  ["Soul", "Jazz"],
    "norah jones":    ["Jazz", "Pop"],
    # Reggae
    "bob marley":     ["Reggae"],
    "buju banton":    ["Reggae", "Dancehall"],
    "koffee":         ["Reggae"],
    # Classical / Ambient / Lo-fi
    "ludovico einaudi": ["Classical"],
    "hans zimmer":    ["Classical", "Film"],
    "max richter":    ["Classical"],
    # Country
    "kacey musgraves": ["Country"],
    "luke combs":     ["Country"],
    "zach bryan":     ["Country"],
    "morgan wallen":  ["Country"],
}

# Keyword rules for anyone not in the map — matched against the lowercased name.
_KEYWORD_RULES: list[tuple[re.Pattern, list[str]]] = [
    (re.compile(r"\b(drill|trap|gangster rap|uk rap)\b"), ["Hip-Hop"]),
    (re.compile(r"\b(amapiano|piano)\b"), ["Amapiano"]),
    (re.compile(r"\b(kwaito|kwaito)\b"), ["Kwaito"]),
    (re.compile(r"\b(gqom)\b"), ["Gqom"]),
    (re.compile(r"\b(afrobeat|afrobeats|naija)\b"), ["Afrobeats"]),
    (re.compile(r"\b(house|techno|trance|edm|dubstep|deep house)\b"), ["Electronic"]),
    (re.compile(r"\b(metal|deathcore|hardcore)\b"), ["Metal"]),
    (re.compile(r"\b(jazz|smooth jazz)\b"), ["Jazz"]),
    (re.compile(r"\b(reggae|dancehall)\b"), ["Reggae"]),
    (re.compile(r"\b(rock|indie|punk|grunge|emo)\b"), ["Rock"]),
    (re.compile(r"\b(r&b|rnb|soul|neo-soul)\b"), ["R&B", "Soul"]),
    (re.compile(r"\b(country|americana)\b"), ["Country"]),
    (re.compile(r"\b(classical|orchestra|piano)\b"), ["Classical"]),
    (re.compile(r"\b(latin|reggaeton|salsa|bachata)\b"), ["Latin"]),
    (re.compile(r"\b(lo-fi|lofi|chillhop)\b"), ["Lo-fi", "Chill"]),
    (re.compile(r"\b(childish|gambino)\b"), ["Hip-Hop"]),
]


def classify_artist_genres(artist: str | None) -> list[str]:
    """Return the inferred genre list for an artist name (best effort)."""
    if not artist:
        return []
    key = artist.strip().lower()
    if key in KNOWN_ARTISTS:
        return KNOWN_ARTISTS[key]
    for pattern, genres in _KEYWORD_RULES:
        if pattern.search(key):
            return genres
    return []


# ── Persona ───────────────────────────────────────────────────

def compute_persona(
    *,
    total_plays: int,
    top_artist_share: float,   # 0..1 — share of plays from the #1 artist
    genre_count: int,
    completion_rate: float,    # 0..1
    like_ratio: float,         # 0..1 — likes relative to plays
) -> dict:
    """Classify the listener into a readable persona for the Stats page."""
    if total_plays < 5:
        return {
            "id": "first_steps",
            "label": "First steps",
            "emoji": "🌱",
            "description": "You're just getting started — every listen sharpens your recommendations.",
        }
    if total_plays >= 300:
        return {
            "id": "melophile",
            "label": "True melophile",
            "emoji": "🎧",
            "description": "Music isn't background for you — it's the main event. Serious hours logged.",
        }
    if completion_rate < 0.35:
        return {
            "id": "skimmer",
            "label": "The skimmer",
            "emoji": "🫧",
            "description": "You flit between tracks, tasting everything. Great for discovery, rougher on the stats.",
        }
    if top_artist_share >= 0.6 and total_plays >= 20:
        return {
            "id": "superfan",
            "label": "The superfan",
            "emoji": "🔥",
            "description": "You've found your people — most of your spins belong to one favourite artist.",
        }
    if like_ratio >= 0.35 and total_plays >= 20:
        return {
            "id": "collector",
            "label": "The collector",
            "emoji": "💜",
            "description": "You like what you hear — a big share of everything you play ends up loved.",
        }
    if genre_count >= 4:
        return {
            "id": "explorer",
            "label": "The explorer",
            "emoji": "🧭",
            "description": "Your taste crosses several genres — you'll listen to almost anything once.",
        }
    return {
        "id": "balanced",
        "label": "The balanced listener",
        "emoji": "🎵",
        "description": "A healthy mix of favourites and fresh finds — the best kind of listener to recommend to.",
    }
