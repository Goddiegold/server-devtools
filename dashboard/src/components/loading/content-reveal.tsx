import type { PropsWithChildren } from "react"

import { cn } from "@/lib/utils"

export function ContentReveal({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("content-reveal", className)}>
      {children}
    </div>
  )
}