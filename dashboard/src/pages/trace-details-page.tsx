import { useEffect, useState } from "react"

import { getExecutionTree } from "@/api/execution"
import {
  clearHistory,
  deleteTrace,
  getTrace,
  getTraceRequest,
  getTraceResponse,
  getTraceErrors,
  type ITraceError,
  type ITraceRequest,
  type ITraceResponse,
} from "@/api/traces"
import { AlertDialogPrimitive, ConfirmDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExecutionTree } from "@/components/execution-tree"
import type { IDevToolsSpan, IDevToolsTrace, IExecutionNode } from "@/types"
import { Loader2, Trash2 } from "lucide-react"

interface TraceDetailsPageProps {
  traceId: string
  onBack: () => void
  onDeleted: () => void
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function hasEntries(value: unknown): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).length > 0
}

function formatValue(value: unknown) {
  if (typeof value === "string") {
    return value
  }

  const formatted = JSON.stringify(value, null, 2)
  return formatted === undefined ? String(value) : formatted
}

function KeyValueRows({ values }: { values: Record<string, unknown> }) {
  return (
    <dl className="divide-y rounded-md border text-xs">
      {Object.entries(values).map(([key, value]) => (
        <div key={key} className="grid grid-cols-[minmax(8rem,30%)_1fr] gap-3 px-3 py-2">
          <dt className="font-mono text-muted-foreground">{key}</dt>
          <dd className="whitespace-pre-wrap break-words font-mono">{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function EmptyDetails() {
  return <p className="text-sm text-muted-foreground">No details available.</p>
}

function RequestDetails({ request }: { request: ITraceRequest }) {
  const general = Object.fromEntries(
    [["Method", request.method], ["Path", request.path], ["Route", request.route]].filter(
      ([, value]) => value !== undefined && value !== ""
    )
  )
  const sections = []

  if (Object.keys(general).length > 0) {
    sections.push(
      <DetailSection key="general" title="General">
        <KeyValueRows values={general} />
      </DetailSection>
    )
  }
  if (hasEntries(request.headers)) {
    sections.push(
      <DetailSection key="headers" title="Headers">
        <KeyValueRows values={request.headers} />
      </DetailSection>
    )
  }
  if (hasEntries(request.query)) {
    sections.push(
      <DetailSection key="query" title="Query Parameters">
        <KeyValueRows values={request.query} />
      </DetailSection>
    )
  }
  if (hasEntries(request.params)) {
    sections.push(
      <DetailSection key="params" title="Route Parameters">
        <KeyValueRows values={request.params} />
      </DetailSection>
    )
  }
  if (request.body !== undefined) {
    sections.push(
      <DetailSection key="body" title="Body">
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 font-mono text-xs">
          {formatValue(request.body)}
        </pre>
      </DetailSection>
    )
  }

  return sections.length > 0 ? <div className="space-y-5">{sections}</div> : <EmptyDetails />
}

function ResponseDetails({ response }: { response: ITraceResponse }) {
  const contentType = Object.entries(response.headers ?? {}).find(
    ([key]) => key.toLowerCase() === "content-type"
  )?.[1]
  let formattedBody = formatValue(response.body ?? "")

  if (
    typeof response.body === "string" &&
    contentType?.some((value) => value.toLowerCase().includes("json"))
  ) {
    try {
      formattedBody = JSON.stringify(JSON.parse(response.body), null, 2)
    } catch {
      formattedBody = response.body
    }
  }

  return (
    <div className="space-y-5">
      {response.statusCode !== undefined && (
        <DetailSection title="General">
          <KeyValueRows values={{ "Status Code": response.statusCode }} />
        </DetailSection>
      )}
      {hasEntries(response.headers) && (
        <DetailSection title="Headers">
          <KeyValueRows values={response.headers} />
        </DetailSection>
      )}
      {response.body !== undefined && (
        <DetailSection title="Body">
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 font-mono text-xs">
            {formattedBody}
          </pre>
        </DetailSection>
      )}
      {response.statusCode === undefined && !hasEntries(response.headers) && response.body === undefined && (
        <EmptyDetails />
      )}
    </div>
  )
}

function ErrorDetails({ errors }: { errors: ITraceError[] }) {
  if (errors.length === 0) {
    return <p className="text-sm text-muted-foreground">No errors captured for this request.</p>
  }

  return (
    <div className="space-y-4">
      {errors.map((capturedError, index) => (
        <article key={`${capturedError.spanId ?? "error"}-${index}`} className="rounded-md border p-3">
          <p className="font-mono text-sm font-semibold text-destructive">
            {capturedError.message ?? "Unknown error"}
          </p>
          <div className="mt-3">
            <KeyValueRows
              values={Object.fromEntries(
                ([
                  ["Type", capturedError.type],
                  ["Origin", capturedError.spanName],
                  ["Span Type", capturedError.spanType],
                ] as const).filter(([, value]) => value !== undefined && value !== "")
              )}
            />
          </div>
          {capturedError.stack && (
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs">
              {capturedError.stack}
            </pre>
          )}
        </article>
      ))}
    </div>
  )
}

export function TraceDetailsPage({ traceId, onBack, onDeleted }: TraceDetailsPageProps) {
  const [trace, setTrace] = useState<IDevToolsTrace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("Overview")
  const [executionTree, setExecutionTree] = useState<IExecutionNode[] | null>(null)
  const [executionLoading, setExecutionLoading] = useState(false)
  const [executionError, setExecutionError] = useState<string | null>(null)
  const [request, setRequest] = useState<ITraceRequest | null>(null)
  const [requestLoading, setRequestLoading] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [response, setResponse] = useState<ITraceResponse | null>(null)
  const [responseLoading, setResponseLoading] = useState(false)
  const [responseError, setResponseError] = useState<string | null>(null)
  const [capturedErrors, setCapturedErrors] = useState<ITraceError[] | null>(null)
  const [capturedErrorsLoading, setCapturedErrorsLoading] = useState(false)
  const [capturedErrorsError, setCapturedErrorsError] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingTrace, setDeletingTrace] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [destructiveError, setDestructiveError] = useState<string | null>(null)

  async function confirmDelete() {
    if (deletingTrace) {
      return
    }

    setDeletingTrace(true)
    setDestructiveError(null)

    try {
      await deleteTrace(traceId)
      onDeleted()
    } catch (deleteError) {
      setDestructiveError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete trace"
      )
    } finally {
      setDeletingTrace(false)
    }
  }

  async function confirmClearHistory() {
    if (clearingHistory) {
      return
    }

    setClearingHistory(true)
    setDestructiveError(null)

    try {
      await clearHistory()
      onDeleted()
    } catch (clearError) {
      setDestructiveError(
        clearError instanceof Error
          ? clearError.message
          : "Failed to clear history"
      )
    } finally {
      setClearingHistory(false)
    }
  }

  useEffect(() => {
    let active = true

    async function loadTrace() {
      setLoading(true)
      setError(null)
      setExecutionTree(null)
      setExecutionError(null)
      setRequest(null)
      setRequestError(null)
      setResponse(null)
      setResponseError(null)
      setCapturedErrors(null)
      setCapturedErrorsError(null)
      setActiveTab("Overview")

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

  useEffect(() => {
    if (activeTab !== "Execution" || executionTree !== null) {
      return
    }

    let active = true

    void getExecutionTree(traceId)
      .then((data) => {
        if (active) {
          setExecutionTree(data)
        }
      })
      .catch((executionFetchError) => {
        if (active) {
          setExecutionError(
            executionFetchError instanceof Error
              ? executionFetchError.message
              : "Failed to load execution data"
          )
        }
      })
      .finally(() => {
        if (active) {
          setExecutionLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [activeTab, executionTree, traceId])

  useEffect(() => {
    if (activeTab !== "Request" || request !== null) {
      return
    }

    let active = true

    void getTraceRequest(traceId)
      .then((data) => {
        if (active) {
          setRequest(data)
        }
      })
      .catch((requestFetchError) => {
        if (active) {
          setRequestError(
            requestFetchError instanceof Error
              ? requestFetchError.message
              : "Failed to load request data"
          )
        }
      })
      .finally(() => {
        if (active) {
          setRequestLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [activeTab, request, traceId])

  useEffect(() => {
    if (activeTab !== "Response" || response !== null) {
      return
    }

    let active = true

    void getTraceResponse(traceId)
      .then((data) => {
        if (active) {
          setResponse(data)
        }
      })
      .catch((responseFetchError) => {
        if (active) {
          setResponseError(
            responseFetchError instanceof Error
              ? responseFetchError.message
              : "Failed to load response data"
          )
        }
      })
      .finally(() => {
        if (active) {
          setResponseLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [activeTab, response, traceId])

  useEffect(() => {
    if (activeTab !== "Error" || capturedErrors !== null) {
      return
    }

    let active = true

    void getTraceErrors(traceId)
      .then((data) => {
        if (active) {
          setCapturedErrors(data)
        }
      })
      .catch((errorsFetchError) => {
        if (active) {
          setCapturedErrorsError(
            errorsFetchError instanceof Error
              ? errorsFetchError.message
              : "Failed to load error data"
          )
        }
      })
      .finally(() => {
        if (active) {
          setCapturedErrorsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [activeTab, capturedErrors, traceId])

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

      {destructiveError && (
        <div className="mb-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          {destructiveError}
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
                  Started At: {new Date(trace.startedAt).toLocaleString()}
                </p>
                <p className="mt-1 font-mono text-sm text-muted-foreground">
                  Duration: {trace.durationMs ?? span?.durationMs ?? "—"}ms
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant={status && Number(status) >= 400 ? "destructive" : "outline"}
                >
                  {status ?? "—"}
                </Badge>
                {/*
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={deletingTrace || clearingHistory}
                  onClick={() => setClearDialogOpen(true)}
                >
                  {clearingHistory ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Clear History
                </Button>
                */}
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deletingTrace || clearingHistory}
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  {deletingTrace ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}
                  Delete
                </Button>
              </div>
            </div>
          </section>

          <nav className="mt-6 flex gap-2 border-b pb-2 text-sm">
            {["Overview", "Execution", "Request", "Response", "User", "Error"].map((tab) => (
              <Button
                key={tab}
                variant={activeTab === tab ? "secondary" : "ghost"}
                size="sm"
                onClick={() => {
                  if (tab === "Execution" && executionTree === null) {
                    setExecutionLoading(true)
                    setExecutionError(null)
                  }
                  if (tab === "Request" && request === null) {
                    setRequestLoading(true)
                    setRequestError(null)
                  }
                  if (tab === "Response" && response === null) {
                    setResponseLoading(true)
                    setResponseError(null)
                  }
                  if (tab === "Error" && capturedErrors === null) {
                    setCapturedErrorsLoading(true)
                    setCapturedErrorsError(null)
                  }
                  setActiveTab(tab)
                }}
              >
                {tab}
              </Button>
            ))}
          </nav>

          {activeTab === "Execution" ? (
            <section className="mt-6 rounded-md border p-4">
              <h2 className="mb-3 text-sm font-semibold">Execution</h2>

              {executionLoading && (
                <p className="text-sm text-muted-foreground">
                  Loading execution data...
                </p>
              )}

              {!executionLoading && executionError && (
                <p className="text-sm text-destructive">{executionError}</p>
              )}

              {!executionLoading && !executionError && executionTree?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No execution data available.
                </p>
              )}

              {!executionLoading && !executionError && executionTree && executionTree.length > 0 && (
                <ExecutionTree nodes={executionTree} />
              )}
            </section>
          ) : activeTab === "Request" ? (
            <section className="mt-6 rounded-md border p-4">
              <h2 className="mb-3 text-sm font-semibold">Request</h2>
              {requestLoading && <p className="text-sm text-muted-foreground">Loading request data...</p>}
              {!requestLoading && requestError && <p className="text-sm text-destructive">{requestError}</p>}
              {!requestLoading && !requestError && request && <RequestDetails request={request} />}
            </section>
          ) : activeTab === "Response" ? (
            <section className="mt-6 rounded-md border p-4">
              <h2 className="mb-3 text-sm font-semibold">Response</h2>
              {responseLoading && <p className="text-sm text-muted-foreground">Loading response data...</p>}
              {!responseLoading && responseError && <p className="text-sm text-destructive">{responseError}</p>}
              {!responseLoading && !responseError && response && <ResponseDetails response={response} />}
            </section>
          ) : activeTab === "User" ? (
            <section className="mt-6 rounded-md border p-4">
              <h2 className="mb-3 text-sm font-semibold">User</h2>
              {trace.user ? (
                <KeyValueRows values={trace.user} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No authenticated user captured for this request.
                </p>
              )}
            </section>
          ) : activeTab === "Error" ? (
            <section className="mt-6 rounded-md border p-4">
              <h2 className="mb-3 text-sm font-semibold">Error</h2>
              {capturedErrorsLoading && <p className="text-sm text-muted-foreground">Loading error data...</p>}
              {!capturedErrorsLoading && capturedErrorsError && (
                <p className="text-sm text-destructive">{capturedErrorsError}</p>
              )}
              {!capturedErrorsLoading && !capturedErrorsError && capturedErrors && (
                <ErrorDetails errors={capturedErrors} />
              )}
            </section>
          ) : (
            <section className="mt-6 rounded-md border p-4">
              <h2 className="mb-2 text-sm font-semibold">{activeTab}</h2>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(trace, null, 2)}
              </pre>
            </section>
          )}
        </>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!deletingTrace) {
            setDeleteDialogOpen(open)
          }
        }}
        title="Delete trace?"
        description="This permanently deletes the selected trace and all associated request, response, execution, and error data."
      >
        <AlertDialogPrimitive.Close render={<Button variant="outline" disabled={deletingTrace} />}>
          Cancel
        </AlertDialogPrimitive.Close>
        <Button
          variant="destructive"
          disabled={deletingTrace}
          onClick={() => void confirmDelete()}
        >
          {deletingTrace && <Loader2 className="animate-spin" />}
          Delete trace
        </Button>
      </ConfirmDialog>

      <ConfirmDialog
        open={clearDialogOpen}
        onOpenChange={(open) => {
          if (!clearingHistory) {
            setClearDialogOpen(open)
          }
        }}
        title="Clear all history?"
        description="This permanently deletes all captured ServerDevTools history, including traces, spans, request and response data, execution data, and errors."
      >
        <AlertDialogPrimitive.Close render={<Button variant="outline" disabled={clearingHistory} />}>
          Cancel
        </AlertDialogPrimitive.Close>
        <Button
          variant="destructive"
          disabled={clearingHistory}
          onClick={() => void confirmClearHistory()}
        >
          {clearingHistory && <Loader2 className="animate-spin" />}
          Clear history
        </Button>
      </ConfirmDialog>
    </main>
  )
}
