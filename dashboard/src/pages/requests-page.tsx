import { useEffect, useState } from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { clearHistory, deleteTrace } from "@/api/traces"
import {
  getRequests,
  type IRequestsPagination,
  type RequestsSortDirection,
  type RequestsSortField,
} from "@/api/requests"
import { AlertDialogPrimitive, ConfirmDialog } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { IDashboardRequest } from "@/types"
import { ArrowDownUp, ChevronDown, ChevronUp, Filter, Loader2, Search, Trash2, X } from "lucide-react"

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
      return "border-info/20 bg-info/10 text-info"
    case "POST":
      return "border-success/20 bg-success/10 text-success"
    case "PUT":
      return "border-warning/20 bg-warning/10 text-warning"
    case "PATCH":
      return "border-info/20 bg-info/10 text-info"
    case "DELETE":
      return "border-destructive/20 bg-destructive/10 text-destructive"
    default:
      return "border-border bg-muted text-muted-foreground"
  }
}

function statusBadgeClass(statusCode?: number): string {
  switch (statusCode === undefined ? undefined : Math.floor(statusCode / 100)) {
    case 2:
      return "border-success/20 bg-success/10 text-success"
    case 3:
      return "border-info/20 bg-info/10 text-info"
    case 4:
      return "border-warning/20 bg-warning/10 text-warning"
    case 5:
      return "border-destructive/20 bg-destructive/10 text-destructive"
    default:
      return "border-border bg-muted text-muted-foreground"
  }
}

function dateInputToTimestamp(value: string): number | undefined {
  if (!value) {
    return undefined
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

type DateRangePreset = "all" | "15m" | "1h" | "24h" | "7d" | "custom"

const dateRangeOptions: Array<{ value: DateRangePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "15m", label: "Last 15 minutes" },
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "custom", label: "Custom" },
]

function getDateRangeBounds(
  preset: DateRangePreset,
  from: string,
  to: string,
  now: number,
): { from?: number; to?: number } {
  if (preset === "custom") {
    return {
      from: dateInputToTimestamp(from),
      to: dateInputToTimestamp(to),
    }
  }

  if (preset === "all") {
    return {}
  }

  const durations: Record<Exclude<DateRangePreset, "all" | "custom">, number> = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
  }

  return {
    from: now - durations[preset],
    to: now,
  }
}

export function RequestsPage({ onSelectRequest }: RequestsPageProps) {
  const [requests, setRequests] = useState<IDashboardRequest[]>([])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [method, setMethod] = useState("")
  const [status, setStatus] = useState("")
  const [sortBy, setSortBy] = useState<RequestsSortField>("startedAt")
  const [sortDirection, setSortDirection] = useState<RequestsSortDirection>("desc")
  const [dateRange, setDateRange] = useState<DateRangePreset>("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draftMethod, setDraftMethod] = useState("")
  const [draftStatus, setDraftStatus] = useState("")
  const [draftDateRange, setDraftDateRange] = useState<DateRangePreset>("all")
  const [draftFrom, setDraftFrom] = useState("")
  const [draftTo, setDraftTo] = useState("")
  const [filterError, setFilterError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<IRequestsPagination | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<IDashboardRequest | null>(null)
  const [deletingTraceId, setDeletingTraceId] = useState<string | null>(null)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)

  const activeFilterCount =
    Number(Boolean(method)) +
    Number(Boolean(status)) +
    Number(dateRange !== "all")

  function openFilters() {
    setDraftMethod(method)
    setDraftStatus(status)
    setDraftDateRange(dateRange)
    setDraftFrom(from)
    setDraftTo(to)
    setFilterError(null)
    setFiltersOpen(true)
  }

  function applyFilters() {
    const fromTimestamp = dateInputToTimestamp(draftFrom)
    const toTimestamp = dateInputToTimestamp(draftTo)

    if (
      draftDateRange === "custom" &&
      draftFrom &&
      draftTo &&
      fromTimestamp !== undefined &&
      toTimestamp !== undefined &&
      fromTimestamp > toTimestamp
    ) {
      setFilterError("From must be earlier than or equal to To.")
      return
    }

    setMethod(draftMethod)
    setStatus(draftStatus)
    setDateRange(draftDateRange)
    setFrom(draftDateRange === "custom" ? draftFrom : "")
    setTo(draftDateRange === "custom" ? draftTo : "")
    setPage(1)
    setFilterError(null)
    setFiltersOpen(false)
  }

  function clearFilters() {
    setDraftMethod("")
    setDraftStatus("")
    setDraftDateRange("all")
    setDraftFrom("")
    setDraftTo("")
    setMethod("")
    setStatus("")
    setDateRange("all")
    setFrom("")
    setTo("")
    setPage(1)
    setFilterError(null)
    setFiltersOpen(false)
  }

  function changeSort(nextSortBy: RequestsSortField) {
    if (sortBy === nextSortBy) {
      setSortDirection((currentDirection) =>
        currentDirection === "asc" ? "desc" : "asc"
      )
    } else {
      setSortBy(nextSortBy)
      setSortDirection("asc")
    }
    setPage(1)
  }

  function sortAriaValue(field: RequestsSortField): "ascending" | "descending" | "none" {
    if (sortBy !== field) {
      return "none"
    }
    return sortDirection === "asc" ? "ascending" : "descending"
  }

  function sortIndicator(field: RequestsSortField) {
    if (sortBy !== field) {
      return <ArrowDownUp aria-hidden="true" className="size-3.5 opacity-50" />
    }
    return sortDirection === "asc"
      ? <ChevronUp aria-hidden="true" className="size-3.5" />
      : <ChevronDown aria-hidden="true" className="size-3.5" />
  }

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
        const now = Date.now()
        const dateBounds = getDateRangeBounds(dateRange, from, to, now)
        const result = await getRequests(
          page,
          20,
          search,
          method,
          status,
          dateBounds.from,
          dateBounds.to,
          sortBy,
          sortDirection,
        )
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
  }, [page, search, method, status, dateRange, from, to, sortBy, sortDirection])

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
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-8"
              placeholder="Search requests..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
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
        <PopoverPrimitive.Root
          open={filtersOpen}
          onOpenChange={(open) => {
            if (open) {
              openFilters()
            } else {
              setFilterError(null)
              setFiltersOpen(false)
            }
          }}
        >
          <PopoverPrimitive.Trigger
            render={
              <Button
                variant="outline"
                size="lg"
                aria-label="Filters"
                aria-haspopup="dialog"
              />
            }
          >
            <Filter />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner
              side="bottom"
              align="start"
              sideOffset={8}
              className="z-50 max-w-[calc(100vw-2rem)]"
            >
              <PopoverPrimitive.Popup className="w-[min(24rem,calc(100vw-2rem))] rounded-lg border bg-background p-4 text-foreground shadow-lg outline-none">
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm font-medium">
                      Method
                      <select
                        aria-label="Method"
                        className="h-9 rounded-md border bg-background px-3 text-sm font-normal"
                        value={draftMethod}
                        onChange={(event) => setDraftMethod(event.target.value)}
                      >
                        <option value="">All methods</option>
                        {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      Status
                      <select
                        aria-label="Status"
                        className="h-9 rounded-md border bg-background px-3 text-sm font-normal"
                        value={draftStatus}
                        onChange={(event) => setDraftStatus(event.target.value)}
                      >
                        <option value="">All statuses</option>
                        {[200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504].map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="space-y-3 border-t pt-4">
                    <label className="grid gap-1.5 text-sm font-medium">
                      Date range
                      <select
                        aria-label="Date range"
                        className="h-9 rounded-md border bg-background px-3 text-sm font-normal"
                        value={draftDateRange}
                        onChange={(event) => {
                          const nextRange = event.target.value as DateRangePreset
                          setDraftDateRange(nextRange)
                          if (nextRange !== "custom") {
                            setDraftFrom("")
                            setDraftTo("")
                          }
                          setFilterError(null)
                        }}
                      >
                        {dateRangeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {draftDateRange === "custom" && (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                        </p>
                        <label className="grid gap-1.5 text-sm font-medium">
                          From
                          <input
                            aria-label="From date and time"
                            type="datetime-local"
                            className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground"
                            value={draftFrom}
                            onChange={(event) => {
                              setDraftFrom(event.target.value)
                              setFilterError(null)
                            }}
                          />
                        </label>
                        <label className="grid gap-1.5 text-sm font-medium">
                          To
                          <input
                            aria-label="To date and time"
                            type="datetime-local"
                            className="h-9 rounded-md border bg-background px-3 text-sm font-normal text-foreground"
                            value={draftTo}
                            onChange={(event) => {
                              setDraftTo(event.target.value)
                              setFilterError(null)
                            }}
                          />
                        </label>
                      </>
                    )}
                    {filterError && (
                      <p className="text-sm text-destructive" role="alert">
                        {filterError}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t pt-4">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={clearFilters}
                    >
                      Clear
                    </Button>
                    <Button type="button" onClick={applyFilters}>
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverPrimitive.Popup>
            </PopoverPrimitive.Positioner>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
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
              <th aria-sort={sortAriaValue("method")} className="px-4 py-3 font-medium">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 gap-1 uppercase"
                  aria-label={`Sort by HTTP method, currently ${sortAriaValue("method")}`}
                  onClick={() => changeSort("method")}
                >
                  METHOD
                  {sortIndicator("method")}
                </Button>
              </th>
              <th aria-sort={sortAriaValue("path")} className="px-4 py-3 font-medium">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 gap-1 uppercase"
                  aria-label={`Sort by path, currently ${sortAriaValue("path")}`}
                  onClick={() => changeSort("path")}
                >
                  PATH
                  {sortIndicator("path")}
                </Button>
              </th>
              <th aria-sort={sortAriaValue("statusCode")} className="px-4 py-3 font-medium">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 gap-1 uppercase"
                  aria-label={`Sort by HTTP status, currently ${sortAriaValue("statusCode")}`}
                  onClick={() => changeSort("statusCode")}
                >
                  STATUS
                  {sortIndicator("statusCode")}
                </Button>
              </th>
              <th className="px-4 py-3 font-medium">USER</th>
              <th aria-sort={sortAriaValue("startedAt")} className="px-4 py-3 font-medium">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2 gap-1 uppercase"
                  aria-label={`Sort by request start time, currently ${sortAriaValue("startedAt")}`}
                  onClick={() => changeSort("startedAt")}
                >
                  STARTED AT
                  {sortIndicator("startedAt")}
                </Button>
              </th>
              <th aria-sort={sortAriaValue("durationMs")} className="px-4 py-3 text-right font-medium">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-mr-2 gap-1 uppercase"
                  aria-label={`Sort by duration, currently ${sortAriaValue("durationMs")}`}
                  onClick={() => changeSort("durationMs")}
                >
                  DURATION
                  {sortIndicator("durationMs")}
                </Button>
              </th>
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
