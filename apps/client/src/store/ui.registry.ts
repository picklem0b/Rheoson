'use client';

import { create } from 'zustand';
import type { ComponentType } from 'react';

/**
 * Props are a per-slot convention documented at each use site (`now-playing`
 * takes `{ open, onClose }`; `account-sheet` the same). The registry stays
 * prop-agnostic on purpose: a replacement may extend props compatibly, and
 * holding every slot to one closed props type would make the seam harder
 * than the thing it replaces.
 */
export type UIComponent = ComponentType<any>;

/**
 * The UI registry — the seam that keeps every surface replaceable.
 *
 * The promise: **anything wired through this module can be swapped from one
 * line, in one file, without touching the call site.** Sheets, pages,
 * players, whole screens — the call site asks for a slot by name and renders
 * whatever currently owns it:
 *
 * ```ts
 * const NowPlaying = useUI('now-playing');   // read the slot
 * registerUI('now-playing', MyTakeOver);     // replace it, anywhere
 * ```
 *
 * Three rules keep this honest rather than a layer of indirection:
 *
 * 1. **Slots are named after what the surface is *for*, not how it is built.**
 *    `'now-playing'`, not `'bottom-sheet'` — the seam survives redesigns.
 * 2. **Replace components, not behaviour.** The registry swaps the *view*;
 *    state lives in stores (player, queue, popup, toasts) which the
 *    replacement reads the same way. That is what keeps a swap a swap.
 * 3. **Registration is explicit and replace-time checked.** Registering
 *    `null` clears a slot (falling back to nothing — the seam must also let
 *    a surface be *removed*), and re-registering over a slot is a deliberate
 *    override: the previous owner's identity is kept so dev-mode can say who
 *    was replaced, instead of silently double-registering.
 */

export type UISlot =
  | 'now-playing'
  | 'player-bar'
  | 'account-sheet'
  | 'playlist-create'
  | 'settings-page'
  | 'library-grid';

/** Every slot with its current owner and who overrode it, if anyone. */
interface RegistryState {
  slots: Record<UISlot, { component: UIComponent | null; replaced?: string }>;
  register: (slot: UISlot, component: UIComponent | null, replacedBy?: string) => void;
}

const useRegistry = create<RegistryState>((set) => ({
  slots: {
    'now-playing': { component: null },
    'player-bar': { component: null },
    'account-sheet': { component: null },
    'playlist-create': { component: null },
    'settings-page': { component: null },
    'library-grid': { component: null },
  },
  register: (slot, component, replacedBy) =>
    set((state) => ({
      slots: {
        ...state.slots,
        [slot]: { component, replaced: replacedBy ?? state.slots[slot]?.replaced },
      },
    })),
}));

/**
 * Register (or replace) the owner of a slot. `null` removes the current
 * owner, which renders nothing at that seam — removal is a feature, not a
 * reset. `replacedBy` is the human name of the new owner, surfaced in dev so
 * a double registration is visible instead of a silent last-write-wins.
 */
export function registerUI(slot: UISlot, component: UIComponent | null, replacedBy?: string): void {
  useRegistry.getState().register(slot, component, replacedBy);
}

/** The current owner of a slot — `null` means "nothing registered". */
export function useUI(slot: UISlot): UIComponent | null {
  return useRegistry((state) => state.slots[slot].component);
}

/** The override chain for a slot — a debug surface, and what tests assert. */
export function uiSlotInfo(slot: UISlot): { owned: boolean; replaced?: string } {
  const entry = useRegistry.getState().slots[slot];
  return { owned: entry.component !== null, replaced: entry.replaced };
}

/** Test hook: clear every slot back to unregistered. */
export function _resetUIRegistry(): void {
  useRegistry.getState().register('now-playing', null);
  useRegistry.getState().register('player-bar', null);
  useRegistry.getState().register('account-sheet', null);
  useRegistry.getState().register('playlist-create', null);
  useRegistry.getState().register('settings-page', null);
  useRegistry.getState().register('library-grid', null);
}
