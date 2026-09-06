import { useEffect, useState } from "react"

import { getTrace } from "@/api/traces"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { IDevToolsSpan, IDevToolsTrace } from "@/types"

interface TraceDetailsPageProps {
  traceId: string
  onBack: () => void
}

function rootHttpSpan(trace: IDevToolsTrace): IDevToolsSpan | undefined {
  return trace.spans.find(
    (span) => span.spanId === trace.rootSpanId && span.type === "http.server"
  )
}

function attributeString(span: IDevToolsSpan | undefined, key: string) {
  const value = span?.attributes[key]
  return value === undefined ? undefined : String(value)
}

export function TraceDetailsPage({ traceId, onBack }: TraceDetailsPageProps) {
  const [trace, setTrace] = useState<IDevToolsTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadTrace() {
      setLoading(true)
      setError(null)

      try {
        const data = await getTrace(traceId)
        if (active) {
          setTrace(data)
        }
      } catch (traceError) {
        if (active) {
          setTrace(null)
          setError(
            traceError instanceof Error
              ? traceError.message
              : "Failed to load trace"
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadTrace()

    return () => {
      active = false
    }
  }, [traceId])

  const span = trace ? rootHttpSpan(trace) : undefined
  const method = attributeString(span, "http.request.method") ?? "UNKNOWN"
  const path = attributeString(span, "url.path") ?? "Unknown path"
  const route = attributeString(span, "http.route")
  const status = attributeString(span, "http.response.status_code")

  return (
    <main className="p-6">
      <Button variant="ghost" className="mb-6 -ml-2" onClick={onBack}>
        ← Back to requests
      </Button>

      {loading && (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          Loading trace...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-md border p-6 text-sm text-destructive">
          {error.includes("404") ? "Trace not found" : error}
        </div>
      )}

      {!loading && !error && trace && (
        <>
          <section className="rounded-md border p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg font-semibold">{method}</span>
                  <span className="font-mono text-lg">{path}</span>
                </div>
                {route && (
                  <p className="mt-2 font-mono text-sm text-muted-foreground">
                    Route: {route}
                  </p>
                )}
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  Duration: {trace.durationMs ?? span?.durationMs ?? "—"}ms
                </p>
              </div>

              <Badge
                variant={status && Number(status) >= 400 ? "destructive" : "outline"}
              >
                {status ?? "—"}
              </Badge>
            </div>
          </section>

          <nav className="mt-6 flex gap-2 border-b pb-2 text-sm">
            {["Overview", "Execution", "Request", "Response", "Error"].map(
              (tab, index) => (
                <Button
                  key={tab}
                  variant={index === 0 ? "secondary" : "ghost"}
                  size="sm"
                >
                  {tab}
                </Button>
              )
            )}
          </nav>

          <section className="mt-6 rounded-md border p-4">
            <h2 className="mb-2 text-sm font-semibold">Trace data</h2>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
              {JSON.stringify(trace, null, 2)}
            </pre>
          </section>
        </>
      )}
    </main>
  )
}
