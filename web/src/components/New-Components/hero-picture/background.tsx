import { ChromaticImage } from '@/components/ui/ChromaticImage'
import { cn } from '@/lib/utils'

export interface HeroBackdropProps {
  /** Artwork to feature — usually the current track's cover. */
  src: string
  alt?: string
  className?: string
}

/**
 * Full-width hero picture used at the top of the House page.
 *
 * The chromatic treatment is the shared UI kit's signature effect, so this is
 * the canonical place to see it at full size.
 */
export function HeroBackdrop({ src, alt = '', className }: HeroBackdropProps) {
  return (
    <div className={cn('w-full', className)}>
      <ChromaticImage
        src={src}
        alt={alt}
        fallbackSrc='/assets/logo.png'
        intensity={10}
        className='mx-auto aspect-[16/9] w-full max-w-md rounded-4xl outline-1 -outline-offset-1 outline-white/10 sm:aspect-[2/1] sm:max-w-lg'
      />
    </div>
  )
}

export default HeroBackdrop
