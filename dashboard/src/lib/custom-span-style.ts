import type { IDevToolsSpan } from "@/types"

export function isCustomSpan(span: Pick<IDevToolsSpan, "type">) {
  return span.type === "custom"
}

export const CUSTOM_TYPE_BADGE_CLASS =
  "shrink-0 rounded border border-custom/30 bg-custom/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-custom"

export function customSpanNameClass(hasError: boolean) {
  return hasError ? "" : "text-custom"
}

export function customTimelineBarClass(isSlow: boolean) {
  return isSlow ? "bg-warning/80" : "bg-custom/80"
}