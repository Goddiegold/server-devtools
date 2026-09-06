import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { getRequests } from "@/api/requests"
import type { IDashboardRequest } from "@/types"

function App() {
  const [requests, setRequests] = useState<IDashboardRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // useEffect(() => {
  //   async function loadRequests() {
  //     try {
  //       setLoading(true)
  //       const data = await getRequests()
  //       setRequests(data)
  //     } catch (error) {
  //       setError(
  //         error instanceof Error
  //           ? error.message
  //           : "Failed to load requests"
  //       )
  //     } finally {
  //       setLoading(false)
  //     }
  //   }

  //   loadRequests()
  // }, [])
  useEffect(() => {
    async function loadRequests() {
      try {
        setLoading(true)
        const data = await getRequests()
        setRequests(data)
        setError(null)
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Failed to load requests"
        )
      } finally {
        setLoading(false)
      }
    }

    loadRequests()

    const interval = setInterval(loadRequests, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [])


  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="font-semibold">
          ServerDevTools
        </div>

        <Badge variant="outline">
          <span className="mr-2 size-2 rounded-full bg-green-500" />
          LIVE
        </Badge>
      </header>

      <main className="p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Requests</h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Inspect incoming requests and their execution.
          </p>
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
                <th className="px-4 py-3 text-right font-medium">
                  DURATION
                </th>
              </tr>
            </thead>

            <tbody>
              {requests.map((request) => (
                <tr
                  key={request.id}
                  className="border-b last:border-b-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {request.method}
                  </td>

                  <td className="px-4 py-3 font-mono">
                    {request.path}
                  </td>

                  <td className="px-4 py-3 font-mono">
                    {request.statusCode ?? "—"}
                  </td>

                  <td className="px-4 py-3 text-right font-mono">
                    {request.durationMs !== undefined
                      ? `${request.durationMs.toFixed(1)}ms`
                      : "—"}
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
            <div className="p-6 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && requests.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No requests captured yet.
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App