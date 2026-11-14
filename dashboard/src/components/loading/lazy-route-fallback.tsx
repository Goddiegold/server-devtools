import { DelayedFallback } from "@/components/loading/delayed-fallback"
import {
  RoutePageSkeleton,
  type DashboardRouteKind,
} from "@/components/loading/route-skeletons"

const routeLabels: Record<DashboardRouteKind, string> = {
  overview: "Loading overview",
  requests: "Loading requests",
  trace: "Loading trace details",
}

export function LazyRouteFallback({ kind }: { kind: DashboardRouteKind }) {
  return (
    <DelayedFallback delayMs={200} label={routeLabels[kind]}>
      <RoutePageSkeleton kind={kind} />
    </DelayedFallback>
  )
}