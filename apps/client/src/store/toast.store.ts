'use client';

import { create } from 'zustand';

import { usePopupStore } from '@/store/popup.store';

/**
 * Toasts — the app's quiet voice, for small confirmations only.
 *
 * The rule the whole app agrees to, and that this module *enforces*:
 *
 * * **success** — something finished ("Download complete"). Green, auto-dismisses.
 * * **info** — a neutral note ("Staged parts are kept"). Neutral, auto-dismisses.
 * * **errors are not toasts.** `toast.error` exists so the app's existing
 *   call sites keep one voice for failures, but it forwards to the popup
 *   store — a real dialog with the DCCNN code and the ⓘ detail. A failure
 *   demands attention; a confirmation does not. The type system now makes an
 *   error toast unwritable: `ToastKind` has no `'error'` member.
 *
 * Pressing play, liking a song, saving a preference — none of these pop up.
 * A failure someone must act on — always does.
 */

export type ToastKind = 'success' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  /** One line of context. */
  message?: string;
  /** Milliseconds; toasts always auto-dismiss — that is what makes them quiet. */
  duration: number;
  createdAt: number;
}

export interface ToastInput {
  kind: ToastKind;
  title: string;
  message?: string;
}

const AUTO_DISMISS = { success: 4000, info: 5000 } as const;

/** Cap the stack: a burst of confirmations must not bury the newest one. */
const MAX_VISIBLE = 4;

interface ToastState {
  toasts: Toast[];
  push: (input: ToastInput) => string;
  success: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

function nextId(): string {
  counter += 1;
  return `t${counter}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (input) => {
    const toast: Toast = {
      id: nextId(),
      kind: input.kind,
      title: input.title,
      message: input.message,
      duration: AUTO_DISMISS[input.kind],
      createdAt: Date.now(),
    };

    set((state) => ({ toasts: [toast, ...state.toasts].slice(0, MAX_VISIBLE) }));

    if (typeof window !== 'undefined') {
      window.setTimeout(() => get().dismiss(toast.id), toast.duration);
    }
    return toast.id;
  },

  success: (title, message) => get().push({ kind: 'success', title, message }),

  info: (title, message) => get().push({ kind: 'info', title, message }),

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

/**
 * Imperative helpers for non-React callers (stores, hooks, event handlers).
 *
 * `error` is the bridge: every failure in the app — wherever it was raised —
 * becomes a popup with its DCCNN code. `detail ?? message` keeps the one-line
 * context visible in the dialog body while the full explanation sits behind
 * the "Why?" disclosure.
 */
export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().success(title, message),
  info: (title: string, message?: string) => useToastStore.getState().info(title, message),
  error: (args: { title: string; code?: string; detail?: string; message?: string; duration?: number }) =>
    usePopupStore.getState().error({
      title: args.title,
      code: args.code,
      detail: args.detail ?? args.message,
      duration: args.duration,
    }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
};
