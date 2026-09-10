import { useMemo, useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Search, X, Music2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { recommendationsApi } from '@/api/recommendations.api'
import { searchApi } from '@/api/search.api'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'

const MAX_PICKS = 3

function dismissKey(userId: string): string {
  return `rheoson:onboarding-dismissed:${userId}`
}

function wasDismissed(userId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(userId)) === '1'
  } catch {
    return false
  }
}

export default function OnboardingGate() {
  const { user } = useAuthStore()
  const userId = user?.id ?? ''
  const queryClient = useQueryClient()

  const { data: taste } = useQuery({
    queryKey: ['recommendations', 'taste', userId],
    queryFn: recommendationsApi.getTaste,
    enabled: !!userId,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const shouldShow =
    !!userId && !!taste && taste.cold_start === true && !wasDismissed(userId)

  const [open, setOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setOpen(shouldShow)
    if (!shouldShow) setFailed(false)
  }, [shouldShow])

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(userId), '1')
    } catch {
      /* ignore quota / privacy mode */
    }
    setOpen(false)
  }

  const submit = async (names: string[]) => {
    setSeeding(true)
    setFailed(false)
    const result = await recommendationsApi.onboardArtists(names)
    setSeeding(false)
    // Only treat it as done if the backend actually recorded the picks —
    // otherwise leave the gate open so the user can retry once online.
    if (result.ok) {
      dismiss()
      // Refresh every personalised surface now that the profile is seeded.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['recommendations', 'home'] }),
        queryClient.invalidateQueries({ queryKey: ['recommendations', 'taste'] }),
        queryClient.invalidateQueries({ queryKey: ['recommendations', 'mixes'] }),
        queryClient.invalidateQueries({ queryKey: ['analytics', 'stats'] }),
      ])
    } else {
      setFailed(true)
    }
  }

  if (!userId || !shouldShow) return null

  return (
    <ArtistPicker
      open={open}
      seeding={seeding}
      failed={failed}
      onCancel={dismiss}
      onSubmit={submit}
    />
  )
}

// ── Artist picker body ───────────────────────────────────────

function ArtistPicker({ open, seeding, failed, onCancel, onSubmit }: {
  open: boolean
  seeding: boolean
  failed: boolean
  onCancel: () => void
  onSubmit: (names: string[]) => void
}) {
  const [query, setQuery] = useState('')
  // The live input value; `query` feeds it instantly so typing never lags.
  // Search requests use the deferred term instead, 250ms behind, so one
  // request fires per pause rather than per keystroke.
  const [deferredTerm, setDeferredTerm] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [active, setActive] = useState<number>(-1)
  const debounceRef = useRef<number | null>(null)

  const searchTerm = deferredTerm

  const { data: results, isFetching } = useQuery({
    queryKey: ['search', 'onboarding-artists', searchTerm.toLowerCase()],
    queryFn: () => searchApi.search(searchTerm, 'artists'),
    enabled: searchTerm.length >= 2,
    staleTime: 30_000,
    retry: false,
  })

  const suggestions = useMemo(() => {
    const artists = Array.isArray(results?.artists) ? results.artists : []
    return artists
      .map((a) => a?.name)
      .filter((n): n is string => !!n && !picked.includes(n))
      .slice(0, 6)
  }, [results, picked])

  const onQueryChange = (value: string) => {
    setQuery(value)
    setActive(-1)
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      setDeferredTerm(value.trim())
    }, 250)
  }

  const pickArtist = (name: string) => {
    setPicked((prev) => {
      if (prev.includes(name)) return prev.filter((n) => n !== name)
      if (prev.length >= MAX_PICKS) return prev
      return [...prev, name]
    })
    setQuery('')
    setActive(-1)
  }

  const canSubmit = picked.length > 0 && !seeding

  const selectSuggestion = (i: number) => {
    if (i < 0 || i >= suggestions.length) return
    pickArtist(suggestions[i])
  }

  const selectedName = (i: number): void => selectSuggestion(i)

  return (
    <Modal open={open} onClose={seeding ? () => {} : onCancel} title={undefined}>
      {/* Gradient hero */}
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 px-5 pt-6 pb-5 text-white relative overflow-hidden mb-4">
        <div className="absolute right-4 top-4 opacity-30">
          <Music2 className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-xl font-black leading-tight relative">Make it yours</h2>
        <p className="text-sm text-white/80 mt-1.5 leading-relaxed relative">
          Pick up to 3 artists you love and we&apos;ll tune your Home, mixes and radio to your taste.
        </p>
      </div>

      {/* Search box */}
      <div className="flex items-center gap-2 px-3 h-11 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
        <Search className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
        <input
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, suggestions.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, -1))
            } else if (e.key === 'Enter') {
              if (active >= 0) selectedName(active)
            } else if (e.key === 'Escape') {
              setQuery('')
            }
          }}
          placeholder="Search an artist…"
          className="flex-1 h-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none bg-transparent"
        />
        {isFetching && (
          <div className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin flex-shrink-0" />
        )}
      </div>

      {/* Suggestions */}
      <div className="mt-2 min-h-[72px]">
        {searchTerm.length >= 2 && (
          <ul>
            {suggestions.length === 0 ? (
              <li className="text-sm text-[var(--text-muted)] py-2">
                {isFetching ? 'Searching…' : 'No artists found — try another name'}
              </li>
            ) : (
              suggestions.map((name, i) => (
                <li key={name}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickArtist(name)
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left',
                      i === active ? 'bg-[var(--bg-elevated)]' : ''
                    )}
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--accent)]/40 to-transparent border border-[var(--border)] flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-black text-[var(--accent)]">
                        {name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{name}</span>
                    {picked.includes(name) && <Check className="w-4 h-4 text-[var(--accent)] ml-auto" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {/* Picked chips */}
        <div className="flex flex-wrap gap-2">
          {picked.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 h-8 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent)]/30"
            >
              <span className="text-xs font-semibold text-[var(--text-primary)] max-w-[160px] truncate">{name}</span>
              <button
                type="button"
                onClick={() => pickArtist(name)}
                className="w-5 h-5 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center"
                aria-label={`Remove ${name}`}
              >
                <X className="w-3 h-3 text-[var(--text-muted)]" />
              </button>
            </span>
          ))}
          {picked.length === 0 && searchTerm.length < 2 && (
            <span className="text-xs text-[var(--text-muted)] py-1.5">
              Search above, then tap artists to add them.
            </span>
          )}
          {picked.length > 0 && (
            <span className="text-xs text-[var(--text-muted)] py-1.5 ml-auto tabular-nums">
              {picked.length}/{MAX_PICKS}
            </span>
          )}
        </div>
      </div>

      {failed && (
        <p className="mt-3 text-xs font-medium text-red-400">
          Couldn&apos;t save your picks — check your connection and try again.
        </p>
      )}

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={seeding}
          className="h-11 px-4 rounded-2xl text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-40"
        >
          Skip
        </button>
        <motion.button
          whileTap={{ scale: 0.98 }}
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(picked)}
          className={cn(
            'flex-1 h-11 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2',
            canSubmit
              ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-lg'
              : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
          )}
        >
          {seeding ? (
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {seeding ? 'Personalising…' : 'Start listening'}
        </motion.button>
      </div>
    </Modal>
  )
}
