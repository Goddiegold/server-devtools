import { Badge } from "@/components/ui/badge"

export function DashboardHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b px-6">
      <div className="font-semibold">ServerDevTools</div>

      <Badge variant="outline">
        <span className="mr-2 size-2 rounded-full bg-green-500" />
        LIVE
      </Badge>
    </header>
  )
}
