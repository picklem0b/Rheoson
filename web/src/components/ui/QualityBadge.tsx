import { cn } from '@/lib/utils'

interface QualityBadgeProps {
  format?: string
  quality?: string
  className?: string
}

const FORMAT_COLORS: Record<string, string> = {
  mp3:  'bg-blue-500/15 text-blue-400 border-blue-500/20',
  flac: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  m4a:  'bg-green-500/15 text-green-400 border-green-500/20',
  opus: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  ogg:  'bg-orange-500/15 text-orange-400 border-orange-500/20',
  wav:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
}

function formatLabel(quality?: string): string {
  if (!quality || quality === '0' || quality === 'best') return ''
  const q = parseInt(quality, 10)
  if (isNaN(q)) return quality
  return q >= 320 ? '320' : q >= 256 ? '256' : q >= 192 ? '192' : `${q}`
}

export default function QualityBadge({ format = 'mp3', quality, className }: QualityBadgeProps) {
  const fmt = format.toLowerCase()
  const colorClass = FORMAT_COLORS[fmt] || FORMAT_COLORS.mp3
  const label = formatLabel(quality)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border',
        colorClass,
        className,
      )}
    >
      {fmt}
      {label && <span className="opacity-70">{label}</span>}
    </span>
  )
}
