import { useEffect, useState } from "react"

import { clearHistory, deleteTrace } from "@/api/traces"
import { getRequests } from "@/api/requests"
import { AlertDialogPrimitive, ConfirmDialog } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { IDashboardRequest } from "@/types"
import { Loader2, Trash2 } from "lucide-react"

interface RequestsPageProps {
  onSelectRequest: (request: IDashboardRequest) => void
}

export function RequestsPage({ onSelectRequest }: RequestsPageProps) {
  const [requests, setRequests] = useState<IDashboardRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<IDashboardRequest | null>(null)
  const [deletingTraceId, setDeletingTraceId] = useState<string | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)

  async function confirmDelete() {
    if (!pendingDelete || deletingTraceId !== null) {
      return
    }

    const traceId = pendingDelete.id
    setDeletingTraceId(traceId)
    setError(null)

    try {
      await deleteTrace(traceId)
      setRequests((currentRequests) =>
        currentRequests.filter((request) => request.id !== traceId)
      )
      setPendingDelete(null)
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete request"
      )
    } finally {
      setDeletingTraceId(null)
    }
  }

  async function confirmClearHistory() {
    if (clearingHistory) {
      return
    }

    setClearingHistory(true)
    setError(null)

    try {
      await clearHistory()
      setRequests([])
      setClearDialogOpen(false)
    } catch (clearError) {
      setError(
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

    async function loadRequests() {
      try {
        setLoading(true)
        const data = await getRequests()
        if (active) {
          setRequests(data)
          setError(null)
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Failed to load requests"
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadRequests()
    const interval = setInterval(() => void loadRequests(), 1000)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  return (
    <main className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect incoming requests and their execution.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={clearingHistory || deletingTraceId !== null}
          onClick={() => setClearDialogOpen(true)}
        >
          {clearingHistory ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Clear History
        </Button>
      </div>

      <div className="mb-4 max-w-md">
        <Input placeholder="Search requests..." />
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">METHOD</th>
              <th className="px-4 py-3 font-medium">PATH</th>
              <th className="px-4 py-3 font-medium">STATUS</th>
              <th className="px-4 py-3 font-medium">STARTED AT</th>
              <th className="px-4 py-3 text-right font-medium">DURATION</th>
              <th className="w-12 px-4 py-3" />
            </tr>
          </thead>

          <tbody>
            {requests.map((request) => (
              <tr
                key={request.id}
                className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40"
                onClick={() => onSelectRequest(request)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onSelectRequest(request)
                  }
                }}
                tabIndex={0}
              >
                <td className="px-4 py-3 font-mono text-xs">{request.method}</td>
                <td className="px-4 py-3 font-mono">{request.path}</td>
                <td className="px-4 py-3 font-mono">
                  {request.statusCode ?? "—"}
                </td>
                <td className="px-4 py-3 font-mono whitespace-nowrap">
                  {new Date(request.startedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {request.durationMs !== undefined
                    ? `${request.durationMs.toFixed(1)}ms`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${request.method} ${request.path}`}
                    disabled={deletingTraceId !== null || clearingHistory}
                    onClick={(event) => {
                      event.stopPropagation()
                      setPendingDelete(request)
                    }}
                  >
                    {deletingTraceId === request.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Loading requests...
          </div>
        )}

        {error && (
          <div className="p-6 text-center text-sm text-destructive">{error}</div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No requests captured yet.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && deletingTraceId === null) {
            setPendingDelete(null)
          }
        }}
        title="Delete trace?"
        description={
          pendingDelete
            ? `This permanently deletes ${pendingDelete.method} ${pendingDelete.path} and all associated request, response, execution, and error data.`
            : "This permanently deletes the selected trace and all of its captured data."
        }
      >
        <AlertDialogPrimitive.Close render={<Button variant="outline" disabled={deletingTraceId !== null} />}>
          Cancel
        </AlertDialogPrimitive.Close>
        <Button
          variant="destructive"
          disabled={deletingTraceId !== null}
          onClick={() => void confirmDelete()}
        >
          {deletingTraceId !== null && <Loader2 className="animate-spin" />}
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
