import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Tailwind class merger
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generate a random ID
export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

// Clamp a number between min and max
export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

// Deep clone
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

// Shuffle an array (Fisher-Yates)
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Check if a string is a Spotify URL
export function isSpotifyUrl(str: string) {
  return /open\.spotify\.com\/(track|album|playlist|artist)\//.test(str)
}

// Extract Spotify ID and type from URL
export function parseSpotifyUrl(url: string) {
  const match = url.match(/open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/)
  if (!match) return null
  return { type: match[1] as 'track' | 'album' | 'playlist' | 'artist', id: match[2] }
}

// Check if string is a YouTube URL
export function isYouTubeUrl(str: string) {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/)/.test(str)
}

// Extract YouTube video ID
export function parseYouTubeUrl(url: string) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

// Detect if input is a URL (Spotify or YouTube)
export function detectInputType(input: string): 'spotify' | 'youtube' | 'query' {
  if (isSpotifyUrl(input)) return 'spotify'
  if (isYouTubeUrl(input)) return 'youtube'
  return 'query'
}

// Get dominant color from image (for dynamic theming)
export async function getDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve('#E5193A')
      ctx.drawImage(img, 0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      resolve(`rgb(${r},${g},${b})`)
    }
    img.onerror = () => resolve('#E5193A')
    img.src = imageUrl
  })
}