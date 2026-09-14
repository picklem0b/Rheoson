import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

import { Command } from 'lucide-react';

export type KeyboardShortcut = {
  keys: string[];
  label: string;
};

export type KeyboardShortcutsCardProps = Readonly<
  {
    title?: string;
    shortcuts?: KeyboardShortcut[];
    hint?: string;
  } & ComponentPropsWithoutRef<'div'>
>;

const defaultShortcuts: KeyboardShortcut[] = [
  { keys: ['Space'], label: 'Play / pause' },
  { keys: ['N'], label: 'Next track' },
  { keys: ['Q'], label: 'Toggle queue' },
  { keys: ['L'], label: 'Toggle lyrics' },
  { keys: ['Esc'], label: 'Close panel' },
];

/**
 * Shortcuts summary card.
 *
 * Styled with the app's CSS variables rather than fixed light-theme colours,
 * so it sits on the dark surface palette like every other card in the app.
 */
export const KeyboardShortcutsCard = forwardRef<
  HTMLDivElement,
  KeyboardShortcutsCardProps
>(
  (
    {
      className,
      title = 'Shortcuts',
      shortcuts = defaultShortcuts,
      hint = 'Available anywhere in the app',
      ...props
    },
    ref
  ) => (
    <div
      ref={ref}
      data-slot='keyboard-shortcuts-card'
      className={cn(
        'w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 font-sans shadow-lg md:p-5',
        className
      )}
      {...props}
    >
      <div
        data-slot='keyboard-shortcuts-card-header'
        className='mb-4 flex items-center gap-2.5'
      >
        <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-white'>
          <Command size={14} />
        </div>
        <div>
          <h4 className='text-sm font-bold text-[var(--text-primary)]'>
            {title}
          </h4>
          <p className='text-[11px] text-[var(--text-muted)]'>{hint}</p>
        </div>
      </div>

      <div data-slot='keyboard-shortcuts-card-list' className='space-y-1.5'>
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.label}
            data-slot='keyboard-shortcuts-card-item'
            className='flex items-center justify-between gap-3 rounded-xl bg-[var(--bg-elevated)] px-3 py-2'
          >
            <span className='min-w-0 truncate text-[13px] text-[var(--text-secondary)]'>
              {shortcut.label}
            </span>
            <div className='flex shrink-0 gap-1'>
              {shortcut.keys.map((key) => (
                <kbd
                  key={key}
                  className='flex h-6 min-w-6 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-1.5 font-mono text-[10px] font-medium text-[var(--text-primary)] shadow-sm'
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
);

KeyboardShortcutsCard.displayName = 'KeyboardShortcutsCard';

export default KeyboardShortcutsCard;
