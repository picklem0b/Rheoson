'use client';

import { create } from 'zustand';

/**
 * Toasts — the app's short-lived voice.
 *
 * Three variants, and the difference between them is not colour:
 *
 * * **success** — something finished. Green, no code, auto-dismisses.
 * * **error** — something failed. Red, **always carries a DCCNN code**, and
 *   keeps the detail that the ⓘ button reveals. Errors never auto-dismiss,
 *   because a failure the user never saw is a failure they will report as
 *   "it doesn't work".
 * * **info** — a neutral note that is not a completion ("Downloading…").
 *
 * The code requirement is enforced in the type, not by convention: an error
 * toast without a code is how the unhelpful "Download failed" message happened
 * in the first place.
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  /** One line of context. Never the only thing shown for an error. */
  message?: string;
  /** The DCCNN chip. Required for `error`, absent for `success`. */
  code?: string;
  /** What the ⓘ panel shows: the honest, unfiltered reason. */
  detail?: string;
  /** Milliseconds; `0` means "until dismissed". Errors default to 0. */
  duration: number;
  createdAt: number;
}

export interface ToastInput {
  kind: ToastKind;
  title: string;
  message?: string;
  code?: string;
  detail?: string;
  duration?: number;
}

const AUTO_DISMISS = { success: 4000, info: 5000, error: 0 } as const;

/** Cap the stack: a burst of failures must not bury the newest one. */
const MAX_VISIBLE = 4;

interface ToastState {
  toasts: Toast[];
  push: (input: ToastInput) => string;
  success: (title: string, message?: string) => string;
  /** Errors keep the code and the detail — that is what makes them traceable. */
  error: (args: { title: string; code?: string; detail?: string; message?: string }) => string;
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
      code: input.code,
      detail: input.detail,
      duration: input.duration ?? AUTO_DISMISS[input.kind],
      createdAt: Date.now(),
    };

    set((state) => ({ toasts: [toast, ...state.toasts].slice(0, MAX_VISIBLE) }));

    if (toast.duration > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => get().dismiss(toast.id), toast.duration);
    }
    return toast.id;
  },

  success: (title, message) => get().push({ kind: 'success', title, message }),

  error: ({ title, code, detail, message }) =>
    // A missing code is a programming error, and the toast says so rather than
    // pretending the failure is ordinary: this is the traceability promise.
    get().push({
      kind: 'error',
      title,
      code: code ?? 'UNCODED',
      detail: detail ?? undefined,
      message,
    }),

  info: (title, message) => get().push({ kind: 'info', title, message }),

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

/** Imperative helpers for non-React callers (stores, hooks, event handlers). */
export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().success(title, message),
  error: (args: { title: string; code?: string; detail?: string; message?: string }) =>
    useToastStore.getState().error(args),
  info: (title: string, message?: string) => useToastStore.getState().info(title, message),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
};
