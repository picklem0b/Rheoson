import { useCallback } from 'react'
import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react'
import { usePlayerStore } from '@/store/playerStore'
import { Slider } from '@/components/ui/Slider'
import { IconButton } from '@/components/ui/IconButton'
import { clamp } from '@/lib/utils'

export default function VolumeControl() {
  const { volume, isMuted, setVolume, toggleMute } = usePlayerStore()

  const displayVolume = isMuted ? 0 : volume

  const VolumeIcon =
    displayVolume === 0   ? VolumeX  :
    displayVolume < 0.35  ? Volume   :
    displayVolume < 0.70  ? Volume1  : Volume2

  const handleScroll = useCallback((e: React.WheelEvent) => {
    const delta = e.deltaY < 0 ? 0.05 : -0.05
    setVolume(clamp(volume + delta, 0, 1))
  }, [volume, setVolume])

  return (
    <div className="flex items-center gap-1.5 w-32" onWheel={handleScroll}>
      <IconButton size="sm" variant="ghost" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
        <VolumeIcon />
      </IconButton>
      <Slider
        value={displayVolume}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => { setVolume(v); if (isMuted && v > 0) toggleMute() }}
        className="flex-1"
        showThumb={false}
      />
    </div>
  )
}