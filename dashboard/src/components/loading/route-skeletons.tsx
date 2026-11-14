import { Skeleton } from "@/components/ui/skeleton"

export function DashboardHeaderSkeleton() {
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
        <Skeleton className="h-7 w-40" />
        <nav className="flex items-center gap-2" aria-hidden>
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-20" />
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
      </div>
    </header>
  )
}

export function OverviewMetricsSkeleton() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="size-4 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-8 w-24" />
            <Skeleton className="mt-2 h-3 w-40" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <section className="flex h-80 min-h-75 min-w-0 flex-col rounded-lg border bg-card p-5 sm:h-90 lg:h-100">
          <div className="mb-4 space-y-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-52" />
          </div>
          <Skeleton className="min-h-0 flex-1 rounded-md" />
        </section>
        <section className="flex h-80 min-h-75 min-w-0 flex-col rounded-lg border bg-card p-5 sm:h-90 lg:h-100">
          <div className="mb-4 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-44" />
          </div>
          <div className="min-h-0 flex-1 space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-md" />
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

export function OverviewPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <Skeleton className="h-10 w-52 shrink-0 rounded-md" />
      </div>

      <OverviewMetricsSkeleton />
    </main>
  )
}

export function RequestsPageSkeleton() {
  return (
    <main className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="ml-auto h-4 w-48" />
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="border-b bg-muted/40 px-4 py-3">
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-full max-w-20" />
            ))}
          </div>
        </div>
        <div className="divide-y">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="grid grid-cols-7 gap-2 px-4 py-3">
              <Skeleton className="h-6 w-14" />
              <Skeleton className="h-4 w-full max-w-48" />
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16 justify-self-end" />
              <Skeleton className="size-8 justify-self-end rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

function RequestsTableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, index) => (
        <tr key={index} className="border-b last:border-b-0">
          <td className="px-4 py-3">
            <Skeleton className="h-6 w-14" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-full max-w-64" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-6 w-12" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-24" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-36" />
          </td>
          <td className="px-4 py-3 text-right">
            <Skeleton className="ml-auto h-4 w-16" />
          </td>
          <td className="px-4 py-3 text-right">
            <Skeleton className="ml-auto size-8 rounded-md" />
          </td>
        </tr>
      ))}
    </>
  )
}

export { RequestsTableSkeletonRows }

export function TraceDetailsContentSkeleton() {
  return (
    <>
      <section className="rounded-md border p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-7 w-56 max-w-full" />
            </div>
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      </section>

      <div className="mt-6 flex gap-2 border-b pb-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-20" />
        ))}
      </div>

      <section className="mt-6 min-h-64 rounded-md border p-4">
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-[92%]" />
          <Skeleton className="h-10 w-[84%]" />
          <Skeleton className="h-10 w-[76%]" />
        </div>
      </section>
    </>
  )
}

export function TraceDetailsPageSkeleton() {
  return (
    <main className="p-6">
      <Skeleton className="mb-6 h-9 w-40" />
      <TraceDetailsContentSkeleton />
    </main>
  )
}

export function TabPanelSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-24 w-full rounded-md" />
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-32 w-full rounded-md" />
    </div>
  )
}

export type DashboardRouteKind = "overview" | "requests" | "trace"

export function RoutePageSkeleton({ kind }: { kind: DashboardRouteKind }) {
  if (kind === "requests") {
    return <RequestsPageSkeleton />
  }
  if (kind === "trace") {
    return <TraceDetailsPageSkeleton />
  }
  return <OverviewPageSkeleton />
}