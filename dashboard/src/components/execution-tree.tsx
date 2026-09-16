import type { IExecutionNode } from "@/types"

function spanAttribute(span: IExecutionNode["span"], key: string) {
  const value = span.attributes[key]
  return value === undefined || value === null ? undefined : String(value)
}

function getSpanLabel(span: IExecutionNode["span"]): string {
  switch (span.type) {
    case "http.server": {
      const method = spanAttribute(span, "http.request.method") ?? span.name
      const path = spanAttribute(span, "url.path")
      return path ? `${method} ${path}` : span.name
    }

    case "http.client": {
      const method = spanAttribute(span, "http.request.method") ?? span.name
      const target =
        spanAttribute(span, "url.full") ?? spanAttribute(span, "server.address")
      return target ? `${method} ${target}` : span.name
    }

    default:
      return span.name
  }
}

function formatDuration(durationMs: number) {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`
  }

  if (durationMs < 1) {
    return `${durationMs.toFixed(2)}ms`
  }

  if (Number.isInteger(durationMs)) {
    return `${durationMs}ms`
  }

  return `${durationMs.toFixed(1)}ms`
}

function spanTypeLabel(span: IExecutionNode["span"]) {
  const type = span.type
  switch (type) {
    case "database":
      return "DATABASE"
    case "http.client":
      return "EXTERNAL API"
    case "http.server":
      return "HTTP ROUTE"
    case "framework":
      return spanAttribute(span, "express.type")?.toLowerCase().includes("middleware")
        ? "MIDDLEWARE"
        : "HANDLER"
    default:
      return undefined
  }
}

interface ExecutionTreeProps {
  nodes: IExecutionNode[]
  selectedSpanId?: string
  onSelectSpan?: (span: IExecutionNode["span"]) => void
}

function ExecutionTreeNode({
  node,
  depth = 0,
  isLast = false,
  selectedSpanId,
  onSelectSpan,
  rootRequestDurationMs,
}: Omit<ExecutionTreeProps, "nodes"> & {
  node: IExecutionNode
  depth?: number
  isLast?: boolean
  rootRequestDurationMs: number
}) {
  const hasError = Boolean(node.span.error) || node.span.status.code !== 0
  const typeLabel = spanTypeLabel(node.span)
  const isSelectable = node.span.type === "database" || node.span.type === "http.client"
  const isSelected = node.span.spanId === selectedSpanId
  const durationMs = Number.isFinite(node.span.durationMs)
    ? Math.max(0, node.span.durationMs)
    : 0
  const percentage = rootRequestDurationMs > 0
    ? (durationMs / rootRequestDurationMs) * 100
    : undefined
  const hasTimingBar = percentage !== undefined && (
    ["http.server", "database", "http.client"].includes(node.span.type)
    || (node.span.type === "framework" && typeLabel === "HANDLER")
  )
  const connector = depth === 0 ? null : isLast ? "└──" : "├──"
  const row = (
    <div className={`rounded px-2 py-1.5 text-sm ${isSelected ? "bg-muted" : hasError ? "bg-destructive/10 text-destructive" : "hover:bg-muted/40"}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          {connector && <span className="shrink-0 font-mono text-muted-foreground">{connector}</span>}
          {typeLabel && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">{typeLabel}</span>}
          <span className="truncate font-mono">{getSpanLabel(node.span)}</span>
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatDuration(durationMs)}{percentage !== undefined && ` (${percentage.toFixed(1)}%)`}
        </span>
      </div>
      {hasTimingBar && (
        <div className="ml-1 mt-1 h-0.5 overflow-hidden rounded-full bg-muted/70" aria-label={`${percentage.toFixed(1)}% of request duration`}>
          <div className="h-full rounded-full bg-muted-foreground/60" style={{ width: `${Math.min(100, percentage)}%` }} />
        </div>
      )}
    </div>
  )

  return (
    <div className={depth > 0 ? "ml-4 border-l border-border pl-3" : ""}>
      {isSelectable ? (
        <button
          type="button"
          className="block w-full text-left"
          aria-pressed={isSelected}
          onClick={() => onSelectSpan?.(node.span)}
        >
          {row}
        </button>
      ) : row}

      {node.children.length > 0 && (
        <div>
          {node.children.map((child, index) => (
            <ExecutionTreeNode
              key={child.span.spanId}
              node={child}
              depth={depth + 1}
              isLast={index === node.children.length - 1}
              selectedSpanId={selectedSpanId}
              onSelectSpan={onSelectSpan}
              rootRequestDurationMs={rootRequestDurationMs}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ExecutionTree({ nodes, selectedSpanId, onSelectSpan }: ExecutionTreeProps) {
  const rootRequestDurationMs = nodes.find((node) => node.span.type === "http.server")?.span.durationMs
    ?? nodes[0]?.span.durationMs
    ?? 0

  return (
    <div className="space-y-1">
      {nodes.map((node, index) => (
        <ExecutionTreeNode
          key={node.span.spanId}
          node={node}
          isLast={index === nodes.length - 1}
          selectedSpanId={selectedSpanId}
          onSelectSpan={onSelectSpan}
          rootRequestDurationMs={rootRequestDurationMs}
        />
      ))}
    </div>
  )
}
