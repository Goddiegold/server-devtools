import { useEffect, useState } from "react"

import { clearHistory, deleteTrace } from "@/api/traces"
import { getRequests, type IRequestsPagination } from "@/api/requests"
import { AlertDialogPrimitive, ConfirmDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { IDashboardRequest } from "@/types"
import { Loader2, Trash2, X } from "lucide-react"

interface RequestsPageProps {
  onSelectRequest: (request: IDashboardRequest) => void
}

function userIdentity(user: IDashboardRequest["user"]): string | undefined {
  for (const key of ["email", "name", "username", "id"]) {
    const value = user?.[key]
    if (
      (typeof value === "string" && value.trim().length > 0) ||
      (typeof value === "number" && Number.isFinite(value)) ||
      typeof value === "boolean"
    ) {
      return String(value)
    }
  }

  return user ? "Authenticated user" : undefined
}

function methodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300"
    case "POST":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "PUT":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    case "PATCH":
      return "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300"
    case "DELETE":
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
    default:
      return "border-border bg-muted text-muted-foreground"
  }
}

function statusBadgeClass(statusCode?: number): string {
  switch (statusCode === undefined ? undefined : Math.floor(statusCode / 100)) {
    case 2:
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case 3:
      return "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300"
    case 4:
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
    case 5:
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
    default:
      return "border-border bg-muted text-muted-foreground"
  }
}

export function RequestsPage({ onSelectRequest }: RequestsPageProps) {
  const [requests, setRequests] = useState<IDashboardRequest[]>([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [method, setMethod] = useState("")
  const [status, setStatus] = useState("")
  const [pagination, setPagination] = useState<IRequestsPagination | null>(null)
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
      if (pagination) {
        const total = Math.max(0, pagination.total - 1)
        const totalPages = Math.ceil(total / pagination.limit)
        if (page > Math.max(totalPages, 1)) {
          setPage(Math.max(totalPages, 1))
        }
        setPagination({
          ...pagination,
          total,
          totalPages,
          hasMore: page < totalPages,
        })
      }
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
      setPage(1)
      setPagination({ page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false })
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
        const result = await getRequests(page, 20, search, method, status)
        if (active) {
          setRequests(result.data)
          setPagination(result.pagination)
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
  }, [page, search, method, status])

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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex w-full max-w-md items-center gap-2">
          <Input
            placeholder="Search requests..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear search"
              onClick={() => {
                setSearch("")
                setPage(1)
              }}
            >
              <X />
            </Button>
          )}
        </div>
        <select
          aria-label="Method"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={method}
          onChange={(event) => {
            setMethod(event.target.value)
            setPage(1)
          }}
        >
          <option value="">All methods</option>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select
          aria-label="Status"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setPage(1)
          }}
        >
          <option value="">All statuses</option>
          {[200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504].map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <Button
          variant="outline"
          size="lg"
          disabled={!search && !method && !status}
          onClick={() => {
            setSearch("")
            setMethod("")
            setStatus("")
            setPage(1)
          }}
        >
          Reset filters
        </Button>
        {pagination && (
          <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">
              {pagination.total === 0
                ? "No requests"
                : `Page ${pagination.page} of ${pagination.totalPages} · ${pagination.total} requests`}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || !pagination.hasMore}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">METHOD</th>
              <th className="px-4 py-3 font-medium">PATH</th>
              <th className="px-4 py-3 font-medium">STATUS</th>
              <th className="px-4 py-3 font-medium">USER</th>
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
                <td className="px-4 py-3">
                  <Badge className={methodBadgeClass(request.method)}>
                    {request.method}
                  </Badge>
                </td>
                <td className="px-4 py-3 font-mono">{request.path}</td>
                <td className="px-4 py-3">
                  <Badge className={statusBadgeClass(request.statusCode)}>
                    {request.statusCode ?? "—"}
                  </Badge>
                </td>
                <td className="max-w-48 px-4 py-3" title={userIdentity(request.user)}>
                  <span className="block truncate">
                    {userIdentity(request.user) ?? "—"}
                  </span>
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
