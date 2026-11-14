import { lazy, Suspense, useEffect, useState } from "react"

import { getProfile } from "@/api/auth"
import { setUnauthorizedHandler } from "@/api/client"
import { ContentReveal } from "@/components/loading/content-reveal"
import { LazyRouteFallback } from "@/components/loading/lazy-route-fallback"
import { DelayedFallback } from "@/components/loading/delayed-fallback"
import type { DashboardRouteKind } from "@/components/loading/route-skeletons"
import {
  DashboardHeaderSkeleton,
  OverviewPageSkeleton,
  RequestsPageSkeleton,
  TraceDetailsPageSkeleton,
} from "@/components/loading/route-skeletons"
import type { IDashboardRequest } from "@/types"
import { DashboardHeader } from "@/pages/dashboard-header"
import { LoginPage } from "@/pages/login-page"

const OverviewPage = lazy(() =>
  import("@/pages/overview-page").then((module) => ({
    default: module.OverviewPage,
  })),
)

const RequestsPage = lazy(() =>
  import("@/pages/requests-page").then((module) => ({
    default: module.RequestsPage,
  })),
)

const TraceDetailsPage = lazy(() =>
  import("@/pages/trace-details-page").then((module) => ({
    default: module.TraceDetailsPage,
  })),
)

const OVERVIEW_PATH = "/_devtools"
const REQUESTS_PATH = "/_devtools/requests"
const LOGIN_PATH = "/login"
const TRACE_PATH_PREFIX = "/_devtools/traces/"

type DashboardRoute =
  | { kind: "login" }
  | { kind: "overview" }
  | { kind: "requests" }
  | { kind: "trace"; traceId: string }
  | { kind: "not-found" }

function parseRoute(pathname: string): DashboardRoute {
  if (pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/`) {
    return { kind: "login" }
  }

  if (pathname === OVERVIEW_PATH || pathname === `${OVERVIEW_PATH}/`) {
    return { kind: "overview" }
  }

  if (pathname === REQUESTS_PATH || pathname === `${REQUESTS_PATH}/`) {
    return { kind: "requests" }
  }

  if (pathname.startsWith(TRACE_PATH_PREFIX)) {
    const encodedTraceId = pathname.slice(TRACE_PATH_PREFIX.length)
    try {
      return { kind: "trace", traceId: decodeURIComponent(encodedTraceId) }
    } catch {
      return { kind: "not-found" }
    }
  }

  return { kind: "not-found" }
}

function routeKindForSkeleton(route: DashboardRoute): DashboardRouteKind {
  if (route.kind === "requests") {
    return "requests"
  }
  if (route.kind === "trace") {
    return "trace"
  }
  return "overview"
}

function AuthCheckingShell({ route }: { route: DashboardRoute }) {
  const kind = routeKindForSkeleton(route)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DashboardHeaderSkeleton />
      <DelayedFallback delayMs={0} label="Loading dashboard">
        {kind === "requests" ? (
          <RequestsPageSkeleton />
        ) : kind === "trace" ? (
          <TraceDetailsPageSkeleton />
        ) : (
          <OverviewPageSkeleton />
        )}
      </DelayedFallback>
    </div>
  )
}

function App() {
  const [authState, setAuthState] = useState<
    "checking" | "authenticated" | "unauthenticated"
  >("checking")
  const [route, setRoute] = useState<DashboardRoute>(() =>
    parseRoute(window.location.pathname),
  )

  useEffect(() => {
    const handlePopState = () => setRoute(parseRoute(window.location.pathname))
    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [])

  useEffect(() => {
    const clearUnauthorizedHandler = setUnauthorizedHandler(() => {
      setAuthState("unauthenticated")
    })
    let active = true

    void getProfile()
      .then(() => {
        if (active) {
          setAuthState("authenticated")

          if (parseRoute(window.location.pathname).kind === "login") {
            navigate(OVERVIEW_PATH)
          }
        }
      })
      .catch(() => {
        if (active) {
          setAuthState("unauthenticated")
        }
      })

    return () => {
      active = false
      clearUnauthorizedHandler()
    }
  }, [])

  function navigate(path: string) {
    window.history.pushState({ serverDevToolsRoute: true }, "", path)
    setRoute(parseRoute(path))
  }

  function selectRequest(request: IDashboardRequest) {
    navigate(`${TRACE_PATH_PREFIX}${encodeURIComponent(request.id)}`)
  }

  function backToRequests() {
    if (window.history.state?.serverDevToolsRoute) {
      window.history.back()
      return
    }

    navigate(REQUESTS_PATH)
  }

  function handleLoginSuccess() {
    setAuthState("authenticated")
    navigate(OVERVIEW_PATH)
  }

  function handleLogout() {
    setAuthState("unauthenticated")
    navigate(LOGIN_PATH)
  }

  if (authState === "checking") {
    return <AuthCheckingShell route={route} />
  }

  if (authState === "unauthenticated") {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

  const lazyRouteKind = routeKindForSkeleton(route)

  return (
    <div className="min-h-screen bg-background text-foreground">
      {route.kind !== "login" && (
        <DashboardHeader onLogout={handleLogout} onNavigate={navigate} />
      )}

      {route.kind === "not-found" ? (
        <main className="p-6">
          <div className="rounded-md border p-6">
            <h1 className="text-lg font-semibold">Dashboard page not found</h1>
            <button
              className="mt-4 text-sm underline underline-offset-4"
              onClick={() => navigate(REQUESTS_PATH)}
            >
              Back to requests
            </button>
          </div>
        </main>
      ) : (
        <Suspense fallback={<LazyRouteFallback kind={lazyRouteKind} />}>
          <ContentReveal key={route.kind === "trace" ? route.traceId : route.kind}>
            {route.kind === "overview" && (
              <OverviewPage onSelectRequest={selectRequest} />
            )}

            {route.kind === "requests" && (
              <RequestsPage onSelectRequest={selectRequest} />
            )}

            {route.kind === "trace" && (
              <TraceDetailsPage
                traceId={route.traceId}
                onBack={backToRequests}
                onDeleted={() => navigate(REQUESTS_PATH)}
              />
            )}
          </ContentReveal>
        </Suspense>
      )}
    </div>
  )
}

export default App