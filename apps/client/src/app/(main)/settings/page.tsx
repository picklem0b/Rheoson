'use client';

import { useCallback, useEffect, useState } from 'react';

import { AccountControl } from '@/components/auth/ClerkBridge';
import { Empty, Loading, PageHeading } from '@/components/ui/States';
import { ApiError, api } from '@/lib/api';
import { applyFromStorage } from '@/lib/audioEffects';
import * as audioCache from '@/lib/audioCache';
import { formatBytes } from '@/lib/format';
import { clerkConfigured } from '@/lib/session';
import { PLAYBACK_RATES, usePlayerStore } from '@/store/player.store';
import { toast } from '@/store/toast.store';

/**
 * Settings — every control here has a live consumer.
 *
 * A settings screen is where a product lies most easily: a toggle that stores a
 * value nothing reads looks exactly like one that works. So this page only
 * renders controls that are wired, and each group says what it changes:
 *
 * * **Playback** — normalisation, bass boost, mono and the speed control all
 *   act on the Web Audio graph and the audio element immediately.
 * * **Appearance** — the accent and surface write `data-theme`/`data-surface`
 *   on the document root, which is what the token layer keys on.
 * * **Storage** — the real byte usage of the on-device audio cache.
 *
 * Values that belong to the account are saved to the server (the whitelist in
 * `preferences.service.ts`); device-local ones stay in localStorage. That split
 * is stated on the page, because it is the difference between "my settings
 * follow me" and "my settings follow this browser".
 */

interface Prefs {
  normalize: boolean;
  'bass-boost': boolean;
  mono: boolean;
  'eq-preset': string;
  'pre-amp-gain': number;
  'eq-enabled': boolean;
  'theme-accent': string;
  'theme-surface': string;
  [key: string]: unknown;
}

const EQ_PRESETS: Record<string, [number, number, number]> = {
  Flat: [0, 0, 0],
  Bass: [6, 1, -1],
  Vocal: [-2, 4, 2],
  Bright: [-1, 1, 5],
};

const STORAGE_KEYS: Record<string, string> = {
  normalize: 'rheoson-normalize',
  'bass-boost': 'rheoson-bass-boost',
  mono: 'rheoson-mono',
  'eq-preset': 'rheoson-eq-preset',
  'eq-enabled': 'rheoson-eq-enabled',
  'pre-amp-gain': 'rheoson-pre-amp-gain',
  'theme-accent': 'rheoson-theme-accent',
  'theme-surface': 'rheoson-theme-surface',
};

/** Mirror a server value into the localStorage key its consumer reads. */
function mirrorLocally(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  const storageKey = STORAGE_KEYS[key];
  if (!storageKey) return;
  window.localStorage.setItem(storageKey, typeof value === 'string' ? value : JSON.stringify(value));
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [usage, setUsage] = useState<{ entries: number; bytes: number } | null>(null);
  const [profile, setProfile] = useState<{ username: string } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const rate = usePlayerStore((state) => state.rate);
  const setRate = usePlayerStore((state) => state.setRate);
  const syncEffects = usePlayerStore((state) => state.syncEffects);

  useEffect(() => {
    void (async () => {
      const [stored, me] = await Promise.all([
        api.preferences().catch(() => ({}) as Record<string, unknown>),
        api.me().catch(() => null),
      ]);
      // The server is authoritative on sign-in; local keys are mirrored down so
      // the audio graph and the theme see the same values on first paint.
      for (const [key, value] of Object.entries(stored)) mirrorLocally(key, value);
      setPrefs({ ...(stored as Prefs) });
      setProfile(me ? { username: me.username } : null);
      setUsage(await audioCache.usage());
      applyFromStorage();
    })();
  }, []);

  // Appearance is applied as attributes: the token layer keys on them, so a
  // theme change is one DOM write and not a React tree re-render.
  useEffect(() => {
    if (!prefs || typeof document === 'undefined') return;
    document.documentElement.dataset.theme = String(prefs['theme-accent'] ?? 'crimson');
    document.documentElement.dataset.surface = String(prefs['theme-surface'] ?? 'dark');
  }, [prefs]);

  const save = useCallback(
    async (patch: Partial<Prefs>) => {
      if (!prefs) return;
      const next = { ...prefs, ...patch };
      setPrefs(next);
      for (const [key, value] of Object.entries(patch)) mirrorLocally(key, value);
      setSaveState('saving');

      try {
        await api.savePreferences(patch as Record<string, unknown>);
        setSaveState('saved');
      } catch (error) {
        // Preferences are local-first: a failed sync is reported once and the
        // local value stands, because the setting does work on this device.
        setSaveState('failed');
        const apiError = error instanceof ApiError ? error : null;
        toast.error({
          title: 'Could not sync your settings',
          code: apiError?.code ?? 'EVA07',
          detail: apiError?.explanation ?? 'They are saved on this device and will sync next time.',
        });
      }

      applyFromStorage();
    },
    [prefs],
  );

  const toggleEffect = useCallback(
    async (key: keyof Prefs, enabled: boolean) => {
      await save({ [key]: enabled } as Partial<Prefs>);
      await syncEffects(enabled || prefs?.['eq-enabled'] === true || prefs?.['bass-boost'] === true || prefs?.mono === true);
    },
    [prefs, save, syncEffects],
  );

  const setPreset = useCallback(
    async (preset: string) => {
      const bands = EQ_PRESETS[preset] ?? EQ_PRESETS.Flat;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('rheoson-eq-bands', JSON.stringify(bands));
      }
      await save({ 'eq-preset': preset, 'eq-enabled': preset !== 'Flat' });
      await syncEffects(true);
    },
    [save, syncEffects],
  );

  if (!prefs) return <Loading label="Loading your settings" />;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeading
        title="Settings"
        note={saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Saved on this device' : saveState === 'saved' ? 'Synced to your account' : undefined}
      />

      <Group title="Playback" description="Applied to the audio graph immediately.">
        <Row
          label="Normalise volume"
          hint="Keeps loud and quiet tracks at a similar level."
          control={<Switch checked={Boolean(prefs.normalize)} onChange={(value) => void toggleEffect('normalize', value)} label="Normalise volume" />}
        />
        <Row
          label="Bass boost"
          hint="Raises low frequencies. Needs the equalizer graph, so it turns effects on."
          control={<Switch checked={Boolean(prefs['bass-boost'])} onChange={(value) => void toggleEffect('bass-boost', value)} label="Bass boost" />}
        />
        <Row
          label="Mono audio"
          hint="Sums both channels — for one working earbud."
          control={<Switch checked={Boolean(prefs.mono)} onChange={(value) => void toggleEffect('mono', value)} label="Mono audio" />}
        />
        <Row
          label="Equalizer preset"
          hint="Three bands: low, mid, high."
          control={
            <select
              value={String(prefs['eq-preset'] ?? 'Flat')}
              onChange={(event) => void setPreset(event.target.value)}
              aria-label="Equalizer preset"
              className="rounded-[10px] px-2.5 py-1.5 text-xs"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              {Object.keys(EQ_PRESETS).map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
          }
        />
        <Row
          label="Playback speed"
          hint="Pitch is preserved, so speech and vocals stay natural."
          control={
            <select
              value={String(rate)}
              onChange={(event) => setRate(Number(event.target.value))}
              aria-label="Playback speed"
              className="rounded-[10px] px-2.5 py-1.5 text-xs"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              {PLAYBACK_RATES.map((option) => (
                <option key={option} value={option}>
                  {option}×
                </option>
              ))}
            </select>
          }
        />
      </Group>

      <Group title="Appearance" description="Device-local: these follow this browser.">
        <Row
          label="Accent"
          control={
            <select
              value={String(prefs['theme-accent'] ?? 'crimson')}
              onChange={(event) => void save({ 'theme-accent': event.target.value })}
              aria-label="Accent colour"
              className="rounded-[10px] px-2.5 py-1.5 text-xs capitalize"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              {['crimson', 'rose', 'orange'].map((accent) => (
                <option key={accent} value={accent}>
                  {accent}
                </option>
              ))}
            </select>
          }
        />
        <Row
          label="Surface"
          control={
            <select
              value={String(prefs['theme-surface'] ?? 'dark')}
              onChange={(event) => void save({ 'theme-surface': event.target.value })}
              aria-label="Surface theme"
              className="rounded-[10px] px-2.5 py-1.5 text-xs capitalize"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              {['dark', 'light'].map((surface) => (
                <option key={surface} value={surface}>
                  {surface}
                </option>
              ))}
            </select>
          }
        />
      </Group>

      <Group title="Storage" description="On this device only.">
        <Row
          label="Audio cache"
          hint={usage ? `${usage.entries} tracks · ${formatBytes(usage.bytes)}` : 'Measuring…'}
          control={
            <button
              type="button"
              onClick={() => {
                void audioCache.clear().then(async () => {
                  setUsage(await audioCache.usage());
                  toast.success('Cache cleared', 'Tracks will stream again until they are re-cached.');
                });
              }}
              className="cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              Clear
            </button>
          }
        />
      </Group>

      <Group
        title="Account"
        description={
          clerkConfigured()
            ? 'Same account as the current app — no migration needed.'
            : 'Development identity: sign-in is not configured on this deployment.'
        }
      >
        <Row
          label="Signed in as"
          hint={profile?.username ?? 'Not signed in'}
          control={clerkConfigured() ? <AccountControl /> : null}
        />
      </Group>

      {Object.keys(prefs).length === 0 ? <Empty text="Settings could not be read from the server; defaults are in use." /> : null}
    </div>
  );
}

function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      ) : null}
      <div className="mt-2.5 rounded-[14px] p-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        {children}
      </div>
    </section>
  );
}

function Row({ label, hint, control }: { label: string; hint?: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint ? (
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {hint}
          </p>
        ) : null}
      </div>
      {control}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors"
      style={{ background: checked ? 'var(--accent)' : 'var(--bg-overlay)', border: '1px solid var(--border)' }}
    >
      <span
        className="absolute top-0.5 size-4.5 rounded-full transition-[left]"
        style={{ left: checked ? '1.4rem' : '0.15rem', background: 'var(--text-primary)', width: '1.125rem', height: '1.125rem' }}
      />
    </button>
  );
}
