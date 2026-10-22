import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, AlertCircle, Clock3, Gauge, Loader2, RefreshCw } from "lucide-react"

import { getOverview } from "@/api/overview"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type {
  DashboardOverviewRange,
  IDashboardRequest,
  IOverviewMetrics,
} from "@/types"

interface OverviewPageProps {
  onSelectRequest: (request: IDashboardRequest) => void
}

const ranges: { value: DashboardOverviewRange; label: string }[] = [
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "24h", label: "24h" },
]

function formatDuration(value: number): string {
  return value < 1000 ? `${value.toFixed(1)}ms` : `${(value / 1000).toFixed(2)}s`
}

function statusClass(statusCode?: number): string {
  return statusCode !== undefined && statusCode >= 500
    ? "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
    : "border-border bg-muted text-muted-foreground"
}

function formatChartTime(timestamp: number, range: DashboardOverviewRange): string {
  const date = new Date(timestamp)
  return range === "24h"
    ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

function VolumeChart({ metrics }: { metrics: IOverviewMetrics }) {
  const chart = { width: 600, height: 210, left: 48, right: 16, top: 14, bottom: 34 }
  const plotWidth = chart.width - chart.left - chart.right
  const plotHeight = chart.height - chart.top - chart.bottom
  const maxCount = Math.max(...metrics.volume.map((bucket) => bucket.count), 0)
  const yStep = Math.max(1, Math.ceil(maxCount / 4))
  const yMax = yStep * 4
  const bucketWidth = plotWidth / Math.max(metrics.volume.length, 1)
  const points = metrics.volume.map((bucket, index) => {
    const x = chart.left + (index + 0.5) * bucketWidth
    const y = chart.top + plotHeight - (bucket.count / yMax) * plotHeight
    return `${x},${y}`
  })
  const line = points.join(" ")
  const area = points.length > 0
    ? `${chart.left},${chart.top + plotHeight} ${line} ${chart.width - chart.right},${chart.top + plotHeight}`
    : `${chart.left},${chart.top + plotHeight} ${chart.width - chart.right},${chart.top + plotHeight}`
  const yTicks = Array.from({ length: 5 }, (_, index) => index * yStep)
  const xTickCount = Math.min(metrics.volume.length, 6)
  const xTickIndices = Array.from({ length: xTickCount }, (_, index) =>
    Math.round(index * (metrics.volume.length - 1) / Math.max(xTickCount - 1, 1))
  )

  return (
    <div className="h-full w-full">
      <svg className="h-[calc(100%-22px)] w-full overflow-visible" viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" role="img" aria-label="Request volume over time">
        <defs>
          <linearGradient id="overview-volume-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => {
          const y = chart.top + plotHeight - (tick / yMax) * plotHeight
          return (
            <g key={tick}>
              <line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className="stroke-border/60" />
              <text x={chart.left - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">{tick}</text>
            </g>
          )
        })}
        <polygon points={area} className="fill-[url(#overview-volume-fill)] text-primary" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" className="text-primary" />
        {metrics.volume.map((bucket, index) => {
          const x = chart.left + index * bucketWidth
          const centerX = x + bucketWidth / 2
          const y = chart.top + plotHeight - (bucket.count / yMax) * plotHeight
          return (
            <g key={bucket.startAt}>
              <rect
                x={x}
                y={chart.top}
                width={bucketWidth}
                height={plotHeight}
                fill="transparent"
                aria-label={`${formatChartTime(bucket.startAt, metrics.range)}, ${bucket.count} requests`}
              >
                <title>{`${formatChartTime(bucket.startAt, metrics.range)} – ${formatChartTime(bucket.endAt, metrics.range)}: ${bucket.count} request${bucket.count === 1 ? "" : "s"}`}</title>
              </rect>
              <circle cx={centerX} cy={y} r="3" className="fill-primary" />
            </g>
          )
        })}
        {xTickIndices.map((index) => {
          const bucket = metrics.volume[index]
          const x = chart.left + (index + 0.5) * bucketWidth
          return (
            <text key={bucket.startAt} x={x} y={chart.height - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {formatChartTime(bucket.startAt, metrics.range)}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

export function OverviewPage({ onSelectRequest }: OverviewPageProps) {
  const [range, setRange] = useState<DashboardOverviewRange>("1h")
  const [metrics, setMetrics] = useState<IOverviewMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setMetrics(await getOverview(range))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load overview")
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadOverview(), 0)
    const interval = setInterval(() => void loadOverview(), 10_000)
    return () => {
      window.clearTimeout(initialLoad)
      clearInterval(interval)
    }
  }, [loadOverview])

  const cards = useMemo(() => metrics ? [
    { label: "Total Requests", value: metrics.totalRequests.toLocaleString(), detail: "completed incoming HTTP requests", icon: Activity },
    { label: "Error Rate", value: `${(metrics.errorRate * 100).toFixed(1)}%`, detail: "HTTP 5xx responses", icon: AlertCircle },
    { label: "Average Latency", value: formatDuration(metrics.averageLatencyMs), detail: "average request duration", icon: Gauge },
    { label: "Slow Requests", value: metrics.slowRequests.toLocaleString(), detail: "requests over 500ms", icon: Clock3 },
  ] : [], [metrics])

  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">A quick look at your backend activity.</p>
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-card p-1" aria-label="Time range">
          {ranges.map((option) => (
            <button
              key={option.value}
              className={`rounded px-3 py-1.5 text-sm ${range === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !metrics && (
        <div className="flex min-h-64 items-center justify-center rounded-lg border text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Loading overview...
        </div>
      )}

      {error && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <span className="text-destructive">{error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadOverview()}>
            <RefreshCw /> Try again
          </Button>
        </div>
      )}

      {metrics && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ label, value, detail, icon: Icon }) => (
              <div key={label} className="rounded-lg border bg-card p-5">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{label}</span>
                  <Icon className="size-4" />
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <section className="flex h-[300px] min-h-[280px] flex-col rounded-lg border bg-card p-5">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="font-semibold">Request Volume</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Incoming HTTP requests over time</p>
                </div>
                <span className="text-xs text-muted-foreground">{metrics.totalRequests.toLocaleString()} total</span>
              </div>
              {metrics.totalRequests === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">No requests in this time range.</div>
              ) : <div className="min-h-0 flex-1"><VolumeChart metrics={metrics} /></div>}
            </section>

            <section className="flex h-[300px] min-h-[280px] flex-col rounded-lg border bg-card p-5">
              <div className="mb-4">
                <h2 className="font-semibold">Recent Failures</h2>
                <p className="mt-1 text-sm text-muted-foreground">Latest HTTP 5xx requests</p>
              </div>
              {metrics.recentFailures.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center text-center text-sm text-muted-foreground">No failures in this time range.</div>
              ) : (
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                  {metrics.recentFailures.map((failure) => (
                    <button
                      key={failure.id}
                      className="flex w-full items-center justify-between gap-3 rounded-md p-3 text-left hover:bg-muted/60"
                      onClick={() => onSelectRequest(failure)}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <Badge className={statusClass(failure.statusCode)}>{failure.statusCode ?? "—"}</Badge>
                          <span className="truncate font-mono text-sm">{failure.method} {failure.path}</span>
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">{new Date(failure.startedAt).toLocaleString()}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{failure.durationMs === undefined ? "—" : formatDuration(failure.durationMs)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  )
}
