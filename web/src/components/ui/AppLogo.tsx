import { cn } from '@/lib/utils'

/**
 * The app's brand mark.
 *
 * Every surface that means "Rheoson" — the landing hero, the auth header, the
 * About card, profile banners, onboarding — renders this instead of a generic
 * music glyph, so the identity is the same everywhere and changing the artwork
 * is a one-line change.
 *
 * Deliberately *not* used for content placeholders (a track with no cover art,
 * an empty search result): those describe media, and a music glyph says that
 * better than the product logo does.
 *
 * Served from `public/assets/logo.png`, so the path is stable in every build
 * and is precached by the service worker for offline use.
 */
export const APP_LOGO_SRC = '/assets/logo.png'

const SIZES = {
   xs: 'w-6 h-6 rounded-lg',
   sm: 'w-8 h-8 rounded-xl',
   md: 'w-9 h-9 rounded-2xl',
   lg: 'w-11 h-11 rounded-2xl',
   xl: 'w-14 h-14 rounded-2xl',
   '2xl': 'w-16 h-16 rounded-3xl',
   '3xl': 'w-[60px] h-[60px] rounded-[16px]',
} as const

export type AppLogoSize = keyof typeof SIZES

interface AppLogoProps {
   size?: AppLogoSize
   className?: string
   /** Soft accent halo — used on hero surfaces where the mark floats. */
   glow?: boolean
   alt?: string
}

export default function AppLogo({
   size = 'md',
   className,
   glow = false,
   alt = 'Rheoson',
}: AppLogoProps) {
   return (
      <img
         src={APP_LOGO_SRC}
         alt={alt}
         draggable={false}
         className={cn(
            'object-cover select-none flex-shrink-0 shadow-lg',
            SIZES[size],
            className,
         )}
         style={glow ? { boxShadow: '0 0 18px var(--accent-subtle, rgba(229,25,58,0.35))' } : undefined}
      />
   )
}
