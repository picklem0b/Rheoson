import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils'
import { useRef, useState } from 'react'

interface TopBarProps {
  title?:       string
  transparent?: boolean
  actions?:     React.ReactNode
  className?:   string
  showLogo?:    boolean   // show the animated logo mark (Home page style)
}

export default function TopBar({
  title,
  transparent = false,
  actions,
  className,
  showLogo = false,
}: TopBarProps) {
  const navigate        = useNavigate()
  const videoRef        = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  const playVideo = () => {
    if (videoRef.current && !playing) {
      setPlaying(true)
      videoRef.current.currentTime = 0
      videoRef.current.play()
    }
  }

  const stopVideo = () => {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
      setPlaying(false)
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 sticky top-0 z-20',
        transparent
          ? 'bg-transparent'
          : 'glass border-b border-[var(--border)]',
        className,
      )}
    >
      {/* Back / Forward */}
      <div className="flex items-center gap-1">
        <IconButton size="sm" variant="glass" onClick={() => navigate(-1)}>
          <ChevronLeft />
        </IconButton>
        <IconButton size="sm" variant="glass" onClick={() => navigate(1)}>
          <ChevronRight />
        </IconButton>
      </div>

      {/* Animated logo — shown when showLogo is true (e.g. Home) */}
      {showLogo && (
        <motion.div
          className="relative cursor-pointer flex-shrink-0"
          onHoverStart={playVideo}
          onHoverEnd={stopVideo}
          onTap={playVideo}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => navigate('/')}
          title="Shulker"
        >
          {/* Static logo — shown when video is not playing */}
          <AnimatePresence>
            {!playing && (
              <motion.img
                key="static-logo"
                src="/assets/logo.png"
                alt="Shulker"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-8 h-8 rounded-xl object-cover"
                style={{ boxShadow: '0 0 8px var(--accent-subtle)' }}
              />
            )}
          </AnimatePresence>

          {/* Animated logo video — plays on hover/tap */}
          <video
            ref={videoRef}
            src="/assets/anim-logo.mp4"
            muted
            playsInline
            onEnded={stopVideo}
            className={cn(
              'w-8 h-8 rounded-xl object-cover absolute inset-0',
              'transition-opacity duration-200',
              playing ? 'opacity-100' : 'opacity-0',
            )}
            style={{ boxShadow: '0 0 8px var(--accent-subtle)' }}
          />
        </motion.div>
      )}

      {/* Title */}
      {title && (
        <h1 className="flex-1 text-base font-bold text-[var(--text-primary)] truncate">
          {title}
        </h1>
      )}

      {/* Spacer when no title */}
      {!title && !showLogo && <div className="flex-1" />}
      {!title && showLogo && <div className="flex-1" />}

      {/* Actions slot */}
      {actions && (
        <div className="flex items-center gap-2 ml-auto">
          {actions}
        </div>
      )}
    </div>
  )
}