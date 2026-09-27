'use client';

/**
 * AuthVisual — the pieces the three auth screens share.
 *
 * The entrance is a two-property animation (opacity + translate) on the same
 * iOS spring the rest of the app uses, staggered by delay. The global
 * `prefers-reduced-motion` rule already flattens it for people who asked.
 */

export function LogoMark({ size = 72 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center font-black"
      style={{
        width: size,
        height: size,
        background: 'var(--accent)',
        color: 'rgb(255 255 255)',
        border: '2px solid var(--border-hard)',
        borderRadius: 'var(--radius-brut)',
        boxShadow: 'var(--hard-shadow)',
        fontSize: size * 0.52,
        fontFamily: 'var(--font-stack-display)',
      }}
      aria-hidden="true"
    >
      R
    </span>
  );
}

export function Rising({ delay = 0, children, className }: { delay?: number; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={className}
      style={{
        animation: `rise 560ms var(--ease-spring) both`,
        animationDelay: `${delay}ms`,
      }}
    >
      {children}
      <style>{`@keyframes rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
