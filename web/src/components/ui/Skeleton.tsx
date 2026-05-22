import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

export function Skeleton({ className, rounded = 'lg' }: SkeletonProps) {
  const radii = {
    sm:   'rounded-xl',
    md:   'rounded-2xl',
    lg:   'rounded-2xl',
    xl:   'rounded-3xl',
    full: 'rounded-full',
  }
  return (
    <div className={cn('shimmer', radii[rounded], className)} />
  )
}

export function TrackRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Skeleton className="w-11 h-11 flex-shrink-0" rounded="xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-36" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-3 w-10" />
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="w-full aspect-square" rounded="2xl" />
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}