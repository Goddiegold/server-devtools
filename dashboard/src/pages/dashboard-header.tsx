import { useState } from "react"
import { Loader2, LogOut } from "lucide-react"

import { ApiError } from "@/api/client"
import { logout } from "@/api/auth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import logoUrl from "../../../assets/logo/serverdevtools-icon.svg"

interface DashboardHeaderProps {
  onLogout: () => void
}

export function DashboardHeader({ onLogout }: DashboardHeaderProps) {
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
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div className="flex items-center gap-2 font-semibold"><img className="size-7" src={logoUrl} alt="" />ServerDevTools</div>

      <div className="flex items-center gap-3">
        {error && (
          <span className="text-xs text-destructive" role="alert">
            {error}
          </span>
        )}

        <Badge variant="outline">
          <span className="mr-2 size-2 rounded-full bg-green-500" />
          LIVE
        </Badge>

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
