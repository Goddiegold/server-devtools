import { useId } from "react"

import { useTheme } from "@/theme-context"
import { THEME_OPTIONS } from "@/theme"

export function ThemeSelector() {
  const id = useId()
  const { preference, setPreference } = useTheme()

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">Theme</label>
      <select
        id={id}
        aria-label="Theme"
        value={preference}
        onChange={(event) => setPreference(event.target.value as typeof preference)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}
