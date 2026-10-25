import { useId } from "react"

import { useTheme } from "@/theme-context"
import { THEME_OPTIONS } from "@/theme"
import { Select } from "@/components/ui/select"

export function ThemeSelector() {
  const id = useId()
  const { preference, setPreference } = useTheme()

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">Theme</label>
      <Select
        id={id}
        aria-label="Theme"
        value={preference}
        onChange={(event) => setPreference(event.target.value as typeof preference)}
        className="h-8 w-auto min-w-28 px-2 pr-8"
      >
        {THEME_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
    </div>
  )
}
