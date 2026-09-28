'use client';

import type { ReactNode } from 'react';

import { create } from 'zustand';

/**
 * The popup system — one host, a registry of kinds, open to yours.
 *
 * Design contract (the flexibility the product asked for):
 *
 * * **`definePopupKind(name, defaults)`** registers a named kind — tone,
 *   default icon, auto-dismiss, whatever the kind always does. Call it once
 *   from any module that owns a flow ("download-finished", "sync-conflict")
 *   and raise it everywhere with `popup.show(name, { title, detail })`.
 * * **`popup.open(spec)`** is the escape hatch: full control over tone, icon,
 *   body (string *or* your own ReactNode), buttons and lifetime — no registry
 *   needed for one-off popups.
 * * **`error` and `confirm` are not special.** They are two preregistered
 *   kinds; `toast.error` forwarding to `popup.show('error', …)` is the whole
 *   bridge. Nothing about the host knows they exist.
 *
 * Rules that stay true no matter what gets registered:
 *
 * * A failure carries its DCCNN `code` — that is what makes it traceable.
 * * Popups are for genuine attention; toasts stay the quiet voice.
 */

export type PopupTone = 'danger' | 'accent' | 'success' | 'warning' | 'neutral';

export interface PopupAction {
  label: string;
  variant?: 'accent' | 'plain' | 'danger';
  onClick: () => void;
}

export interface PopupSpec {
  /** Short, human: "Couldn't download this track". */
  title: string;
  /** The DCCNN chip. Set it for failures; absent for everything else. */
  code?: string;
  /** The body — plain text or your own node (a list, a link, a form hint). */
  detail?: ReactNode;
  /** Visual voice; drives the chip colour unless `icon` overrides it. */
  tone?: PopupTone;
  /** Your own icon instead of the tone's default glyph. */
  icon?: ReactNode;
  /** Buttons. Omit for a single "Got it". */
  actions?: PopupAction[];
  /** Seconds before auto-close; 0 (default) = until dismissed. */
  duration?: number;
  /** Backdrop click and Escape close. Default true; a popup the user must
   * answer through its buttons can switch this off. */
  dismissable?: boolean;
}

export interface Popup extends PopupSpec {
  id: string;
  /** The registered kind this popup was raised as — free-form, but named. */
  kind: string;
  tone: PopupTone;
  duration: number;
  dismissable: boolean;
}

/** Defaults per registered kind; a call can override any of them. */
export type KindDefaults = Omit<PopupSpec, 'title'>;

const KINDS: Record<string, KindDefaults> = {
  error: { tone: 'danger' },
  confirm: { tone: 'accent' },
};

/**
 * Register a named popup kind. Idempotent and additive: re-registering a
 * name merges over the previous defaults, so a feature module can refine a
 * base kind without clobbering what another module added.
 */
export function definePopupKind(name: string, defaults: KindDefaults): void {
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) {
    throw new Error(`popup kind "${name}" must be a simple name`);
  }
  KINDS[name] = { ...KINDS[name], ...defaults };
}

/** The registered kind names — for tests and for a settings/debug surface. */
export function popupKindNames(): string[] {
  return Object.keys(KINDS);
}

interface PopupState {
  popup: Popup | null;
  /** Full control, no registry: tone/icon/body/buttons/lifetime as given. */
  open: (spec: PopupSpec & { kind?: string }) => string;
  /** Raise a registered kind: its defaults apply, the spec overrides. */
  show: (kind: string, spec: PopupSpec) => string;
  error: (args: { title: string; code?: string; detail?: ReactNode; duration?: number }) => string;
  confirm: (args: { title: string; body?: ReactNode; confirmLabel?: string; onConfirm: () => void }) => string;
  close: () => void;
}

let counter = 0;

function nextId(): string {
  counter += 1;
  return `p${counter}`;
}

export const usePopupStore = create<PopupState>((set, get) => ({
  popup: null,

  open: (spec) => {
    const id = nextId();
    const kind = spec.kind ?? (spec.tone ? 'open' : 'open');
    set({
      popup: {
        ...spec,
        id,
        kind,
        tone: spec.tone ?? 'neutral',
        duration: spec.duration ?? 0,
        dismissable: spec.dismissable ?? true,
      },
    });
    return id;
  },

  show: (kind, spec) => {
    const defaults = KINDS[kind];
    if (!defaults) {
      // A typo'd kind is a programming error, like an unregistered DCCNN
      // code: fail loudly here rather than render a popup that lies about
      // what it is.
      throw new Error(`popup kind "${kind}" is not registered — call definePopupKind("${kind}", …) first`);
    }
    return get().open({ kind, ...defaults, ...spec });
  },

  error: ({ title, code, detail, duration }) => get().show('error', { title, code, detail, duration }),

  confirm: ({ title, body, confirmLabel, onConfirm }) =>
    get().show('confirm', {
      title,
      detail: body,
      actions: [
        {
          label: confirmLabel ?? 'Confirm',
          variant: 'accent',
          onClick: () => {
            onConfirm();
            set({ popup: null });
          },
        },
      ],
    }),

  close: () => set({ popup: null }),
}));

/**
 * Imperative helpers so a handler reads like a sentence. `show` is the one
 * custom code goes through; `open` when a one-off needs everything.
 */
export const popup = {
  show: (kind: string, spec: PopupSpec) => usePopupStore.getState().show(kind, spec),
  open: (spec: PopupSpec & { kind?: string }) => usePopupStore.getState().open(spec),
  error: (args: { title: string; code?: string; detail?: ReactNode; duration?: number }) =>
    usePopupStore.getState().error(args),
  confirm: (args: { title: string; body?: ReactNode; confirmLabel?: string; onConfirm: () => void }) =>
    usePopupStore.getState().confirm(args),
  close: () => usePopupStore.getState().close(),
};
