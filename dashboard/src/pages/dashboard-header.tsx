import { useState } from "react"
import { Loader2, LogOut } from "lucide-react"

import { ApiError } from "@/api/client"
import { logout } from "@/api/auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ThemeSelector } from "@/components/theme-selector"
import logoUrl from "../../../assets/logo/serverdevtools-icon.svg"

interface DashboardHeaderProps {
  onLogout: () => void
  onNavigate: (path: string) => void
}

export function DashboardHeader({ onLogout, onNavigate }: DashboardHeaderProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogout() {
    if (loading) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      await logout()
      onLogout()
    } catch (logoutError) {
      if (logoutError instanceof ApiError && logoutError.status === 401) {
        onLogout()
        return
      }

      setError("Unable to sign out. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
        <button
          className="flex items-center gap-2 font-semibold"
          onClick={() => onNavigate("/_devtools")}
        >
          <img className="size-7" src={logoUrl} alt="" />ServerDevTools
        </button>
        <nav className="flex items-center gap-1 text-sm" aria-label="Dashboard">
          <button className="rounded px-2 py-1 hover:bg-muted" onClick={() => onNavigate("/_devtools")}>Overview</button>
          <button className="rounded px-2 py-1 hover:bg-muted" onClick={() => onNavigate("/_devtools/requests")}>Requests</button>
        </nav>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
        {error && (
          <span className="text-xs text-destructive" role="alert">
            {error}
          </span>
        )}

        <Badge variant="outline">
          <span className="mr-2 size-2 rounded-full bg-success" />
          LIVE
        </Badge>

        <ThemeSelector />

        <Button
          variant="ghost"
          size="sm"
          disabled={loading}
          onClick={() => void handleLogout()}
        >
          {loading ? <Loader2 className="animate-spin" /> : <LogOut />}
          {loading ? "Signing out..." : "Logout"}
        </Button>
      </div>
    </header>
  )
}
