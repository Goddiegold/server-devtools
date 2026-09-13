import { useEffect, useState } from "react"

import { getProfile } from "@/api/auth"
import { setUnauthorizedHandler } from "@/api/client"
import type { IDashboardRequest } from "@/types"
import { DashboardHeader } from "@/pages/dashboard-header"
import { LoginPage } from "@/pages/login-page"
import { RequestsPage } from "@/pages/requests-page"
import { TraceDetailsPage } from "@/pages/trace-details-page"

const REQUESTS_PATH = "/_devtools"
const LOGIN_PATH = "/login"
const TRACE_PATH_PREFIX = `${REQUESTS_PATH}/traces/`

type DashboardRoute =
  | { kind: "login" }
  | { kind: "requests" }
  | { kind: "trace"; traceId: string }
  | { kind: "not-found" }

function parseRoute(pathname: string): DashboardRoute {
  if (pathname === LOGIN_PATH || pathname === `${LOGIN_PATH}/`) {
    return { kind: "login" }
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

function App() {
  const [authState, setAuthState] = useState<
    "checking" | "authenticated" | "unauthenticated"
  >("checking")
  const [route, setRoute] = useState<DashboardRoute>(() =>
    parseRoute(window.location.pathname)
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
            navigate(REQUESTS_PATH)
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
    navigate(REQUESTS_PATH)
  }

  function handleLogout() {
    setAuthState("unauthenticated")
    navigate(LOGIN_PATH)
  }

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading dashboard...
      </div>
    )
  }

  if (authState === "unauthenticated") {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {route.kind !== "login" && <DashboardHeader onLogout={handleLogout} />}

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

      {route.kind === "not-found" && (
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
      )}
    </div>
  )
}

export default App
