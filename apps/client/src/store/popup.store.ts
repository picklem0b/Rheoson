'use client';

import { create } from 'zustand';

/**
 * The popup — the app's loud voice, spent only when it must be.
 *
 * Rules the whole app agrees to:
 *
 * * **A popup is for genuine attention.** Real failures (a coded error, a
 *   destructive confirmation, something the user must act on). Never a small
 *   thing: pressing play, a like, a preference saved — those are quiet.
 * * **Every error popup carries its DCCNN code** and the ⓘ detail, so what
 *   the user sees is traceable to one raise site in the code.
 * * **Toasts are the quiet voice** — small confirmations that do not demand
 *   a click. The two never say the same thing.
 */

export type PopupKind = 'error' | 'confirm';

export interface PopupAction {
  label: string;
  variant?: 'accent' | 'plain' | 'danger';
  onClick: () => void;
}

export interface Popup {
  id: string;
  kind: PopupKind;
  /** Short, human: "Couldn't download this track". */
  title: string;
  /** The DCCNN chip — required for kind `error`. */
  code?: string;
  /** What the ⓘ panel reveals: the honest, unfiltered reason. */
  detail?: string;
  /** For confirm: what the destructive button says ("Delete"). */
  confirmLabel?: string;
  actions?: PopupAction[];
  /** Auto-dismiss seconds for errors; 0 (default) = until dismissed. */
  duration: number;
}

interface PopupState {
  popup: Popup | null;
  open: (popup: Omit<Popup, 'id' | 'duration'> & { duration?: number }) => string;
  error: (args: { title: string; code?: string; detail?: string; duration?: number }) => string;
  confirm: (args: { title: string; body?: string; confirmLabel?: string; onConfirm: () => void }) => string;
  close: () => void;
}

let counter = 0;

function nextId(): string {
  counter += 1;
  return `p${counter}`;
}

export const usePopupStore = create<PopupState>((set, get) => ({
  popup: null,

  open: (input) => {
    const id = nextId();
    set({ popup: { ...input, id, duration: input.duration ?? 0 } });
    return id;
  },

  error: ({ title, code, detail, duration }) => get().open({ kind: 'error', title, code, detail, duration }),

  confirm: ({ title, body, confirmLabel, onConfirm }) =>
    get().open({
      kind: 'confirm',
      title,
      detail: body,
      confirmLabel,
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

/** Imperative helpers so a handler reads like a sentence. */
export const popup = {
  error: (args: { title: string; code?: string; detail?: string; duration?: number }) =>
    usePopupStore.getState().error(args),
  confirm: (args: { title: string; body?: string; confirmLabel?: string; onConfirm: () => void }) =>
    usePopupStore.getState().confirm(args),
  open: (args: Omit<Popup, 'id' | 'duration'> & { duration?: number }) => usePopupStore.getState().open(args),
  close: () => usePopupStore.getState().close(),
};
