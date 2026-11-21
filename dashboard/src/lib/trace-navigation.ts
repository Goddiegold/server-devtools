const TRACE_NAVIGATION_STORAGE_KEY = "server-devtools-trace-navigation"

export interface ITraceNavigationContext {
  traceIds: string[]
}

export function saveTraceNavigation(context: ITraceNavigationContext): void {
  try {
    sessionStorage.setItem(TRACE_NAVIGATION_STORAGE_KEY, JSON.stringify(context))
  } catch {
    // Storage may be unavailable; navigation still works without prev/next.
  }
}

export function loadTraceNavigation(): ITraceNavigationContext | null {
  try {
    const value = sessionStorage.getItem(TRACE_NAVIGATION_STORAGE_KEY)
    if (!value) {
      return null
    }

    const parsed = JSON.parse(value) as ITraceNavigationContext
    if (!Array.isArray(parsed.traceIds) || parsed.traceIds.length === 0) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function traceNavigationPosition(
  context: ITraceNavigationContext | null,
  traceId: string,
): { index: number; total: number; previousId?: string; nextId?: string } | null {
  if (!context) {
    return null
  }

  const index = context.traceIds.indexOf(traceId)
  if (index === -1) {
    return null
  }

  return {
    index,
    total: context.traceIds.length,
    previousId: index > 0 ? context.traceIds[index - 1] : undefined,
    nextId: index < context.traceIds.length - 1 ? context.traceIds[index + 1] : undefined,
  }
}