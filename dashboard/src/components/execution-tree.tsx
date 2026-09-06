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

function spanTypeLabel(type: string) {
  switch (type) {
    case "database":
      return "DB"
    case "http.client":
      return "HTTP"
    case "http.server":
      return "SERVER"
    case "framework":
      return "FRAMEWORK"
    default:
      return ""
  }
}

function ExecutionTreeNode({ node, depth = 0 }: { node: IExecutionNode; depth?: number }) {
  const hasError = Boolean(node.span.error) || node.span.status.code !== 0
  const typeLabel = spanTypeLabel(node.span.type)

  return (
    <div className={depth > 0 ? "ml-4 border-l border-border pl-4" : ""}>
      <div
        className={`flex items-center justify-between gap-4 rounded px-2 py-2 text-sm ${
          hasError ? "bg-destructive/10 text-destructive" : "hover:bg-muted/40"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono">{getSpanLabel(node.span)}</span>
          {typeLabel && (
            <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground">
              {typeLabel}
            </span>
          )}
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {formatDuration(node.span.durationMs)}
        </span>
      </div>

      {node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <ExecutionTreeNode
              key={child.span.spanId}
              node={child}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ExecutionTree({ nodes }: { nodes: IExecutionNode[] }) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <ExecutionTreeNode key={node.span.spanId} node={node} />
      ))}
    </div>
  )
}
