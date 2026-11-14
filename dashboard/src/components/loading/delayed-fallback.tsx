import type { ReactNode } from "react"

import { useDelayedVisible } from "@/components/loading/use-delayed-visible"
import { cn } from "@/lib/utils"

interface DelayedFallbackProps {
  children: ReactNode
  className?: string
  delayMs?: number
  label?: string
}

export function DelayedFallback({
  children,
  className,
  delayMs = 200,
  label = "Loading page",
}: DelayedFallbackProps) {
  const showSkeleton = useDelayedVisible(true, delayMs)

  return (
    <div
      className={cn(className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className={showSkeleton ? undefined : "invisible"} aria-hidden={!showSkeleton}>
        {children}
      </div>
    </div>
  )
}