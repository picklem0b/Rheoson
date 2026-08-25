import { useState, useEffect, useCallback, useRef } from "react";
import { searchApi, resolveToTracks } from "@/api/search.api";
import { isAbortError } from "@/api/client.api";
import { API_BASE } from "@/lib/constants";
import type { SearchResults, SearchFilter } from "@/types/search.types";
import type { Track } from "@/types/track.types";
import { detectInputType } from "@/lib/utils";

// ── Debounce timings ──────────────────────────────────────────
// SEARCH_MS: how long to wait after the user stops typing before
// firing the full search. 350 ms is the sweet spot — fast enough to
// feel instant, slow enough that mid-word characters (e.g. "kend" in
// "kendrick") don't each fire a separate request.
//
// SUGGEST_MS: autocomplete runs faster because it only calls /suggest
// which is a cheap lookup, not a full ytmusicapi query.

const SEARCH_MS = 350;
const SUGGEST_MS = 100;

// ── Session persistence ───────────────────────────────────────

const SESSION_KEY = "shulker-last-search";

function readSession(): { query: string; filter: SearchFilter } {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : { query: "", filter: "all" };
    } catch {
        return { query: "", filter: "all" };
    }
}

function writeSession(query: string, filter: SearchFilter) {
    try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ query, filter }));
    } catch {}
}

// ── Prewarm ───────────────────────────────────────────────────
// Pre-resolves the first N tracks' stream URLs so they play instantly
// when tapped, with no stutter while yt-dlp initialises.
//
// FIX: previously called `fetch('/api/stream/...')` with a relative URL.
// That works on localhost:3000 (Vite proxies /api), but on the Android
// WebView loading from Capacitor's file:// origin, or when the frontend
// is on a different origin from the API (e.g. Render static site + Render
// API service), a relative URL resolves to the wrong host.
//
// Now uses `API_BASE` (which is already the full absolute URL in prod,
// e.g. https://shulker-api-vnny.onrender.com/api) and the local API's
// absolute URL (http://127.0.0.1:8000/api/stream/...) in dev. The HEAD
// request doesn't download audio — it just warms the yt-dlp process and
// caches the resolved format URL in the backend's request cache.

const PREWARM_N = 3;

function prewarmTracks(tracks: Track[]) {
    tracks.slice(0, PREWARM_N).forEach(t => {
        // Build the absolute stream URL using the same helper that Howler uses
        const url = `${API_BASE}/stream/${t.id}/audio`;
        fetch(url, {
            method: "HEAD",
            // signal with 8s timeout so a sleeping Render instance doesn't
            // leave these hanging forever
            signal: AbortSignal.timeout(8_000)
        }).catch(() => {}); // prewarm is best-effort — never throw
    });
}

// ── Hook ──────────────────────────────────────────────────────

export function useSearch() {
    const saved = readSession();

    const [query, setQueryState] = useState(saved.query);
    const [filter, setFilter] = useState<SearchFilter>(saved.filter);
    const [results, setResults] = useState<SearchResults | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isLoading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const searchAbort = useRef<AbortController | null>(null);
    const suggestAbort = useRef<AbortController | null>(null);
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleanup on unmount — cancel any in-flight requests and clear timers
    useEffect(
        () => () => {
            searchAbort.current?.abort();
            suggestAbort.current?.abort();
            if (searchTimer.current) clearTimeout(searchTimer.current);
            if (suggestTimer.current) clearTimeout(suggestTimer.current);
        },
        []
    );

    const setQuery = useCallback((q: string) => {
        setQueryState(q);
        if (!q) {
            setSuggestions([]);
            setResults(null);
            setError(null);
            writeSession("", "all");
        }
    }, []);

    // ── Autocomplete suggestions ───────────────────────────────
    // Only fires for plain text queries (not Spotify/YouTube URLs) and
    // only when there are no results yet (prevents ghost suggestions
    // appearing over an already-rendered results list).

    useEffect(() => {
        if (suggestTimer.current) clearTimeout(suggestTimer.current);
        suggestAbort.current?.abort();

        const q = query.trim();

        if (
            !q ||
            q.length < 2 ||
            detectInputType(q) !== "query" ||
            results !== null
        ) {
            setSuggestions([]);
            return;
        }

        suggestTimer.current = setTimeout(async () => {
            const ctrl = new AbortController();
            suggestAbort.current = ctrl;
            try {
                const data = await searchApi.getSuggestions(q, ctrl.signal);
                if (!ctrl.signal.aborted) setSuggestions(data.slice(0, 6));
            } catch (e) {
                if (!isAbortError(e)) setSuggestions([]);
            }
        }, SUGGEST_MS);
    }, [query, results]);

    // ── Full search ────────────────────────────────────────────
    // Debounced at SEARCH_MS. Each new keystroke cancels the previous
    // timer AND aborts the previous in-flight HTTP request. This means
    // typing "kendrick lamar" only ever fires ONE search — for the
    // completed phrase — not 14 searches for each character.

    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchAbort.current?.abort();

        const q = query.trim();
        if (!q) return;

        searchTimer.current = setTimeout(async () => {
            const ctrl = new AbortController();
            searchAbort.current = ctrl;

            setLoading(true);
            setError(null);
            setSuggestions([]); // hide suggestions while searching

            try {
                const type = detectInputType(q);
                let data: SearchResults;

                if (type === "spotify" || type === "youtube") {
                    // URL resolution — no filter applies here
                    const resolved = await searchApi.resolve(q, ctrl.signal);
                    const tracks = resolveToTracks(resolved);
                    data = {
                        tracks,
                        albums: [],
                        artists: [],
                        playlists: [],
                        query: q
                    };
                } else {
                    data = await searchApi.search(
                        q,
                        filter !== "all" ? filter : undefined,
                        ctrl.signal
                    );
                }

                if (!ctrl.signal.aborted) {
                    setResults(data);
                    setSuggestions([]);
                    writeSession(q, filter);
                    // Prewarm the first 3 stream URLs so playback is instant
                    if (data.tracks.length > 0) prewarmTracks(data.tracks);
                }
            } catch (e) {
                if (!isAbortError(e) && !ctrl.signal.aborted) {
                    setError(
                        e instanceof Error
                            ? e.message
                            : "Search failed. Try again."
                    );
                    setResults(null);
                }
            } finally {
                if (!ctrl.signal.aborted) setLoading(false);
            }
        }, SEARCH_MS);
    }, [query, filter]);

    const clear = useCallback(() => {
        searchAbort.current?.abort();
        suggestAbort.current?.abort();
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (suggestTimer.current) clearTimeout(suggestTimer.current);
        setQueryState("");
        setResults(null);
        setSuggestions([]);
        setError(null);
        setLoading(false);
        writeSession("", "all");
    }, []);

    const selectSuggestion = useCallback((s: string) => {
        setQueryState(s);
        setSuggestions([]);
    }, []);

    // Called by SearchBar on Enter — immediately hide suggestions so
    // the dropdown doesn't linger over the loading/results state.
    const handleSubmit = useCallback(() => {
        setSuggestions([]);
        setQueryState(q => q); // trigger the search effect
    }, []);

    return {
        query,
        setQuery,
        filter,
        setFilter,
        results,
        isLoading,
        suggestions,
        error,
        clear,
        selectSuggestion,
        handleSubmit
    };
}
