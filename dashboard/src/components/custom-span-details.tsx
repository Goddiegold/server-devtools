import { CUSTOM_TYPE_BADGE_CLASS } from "@/lib/custom-span-style"
import type { IDevToolsSpan } from "@/types"

function formatDuration(durationMs: number) {
  return `${durationMs.toFixed(2)}ms`
}

function definedValues(values: Array<[string, string | undefined]>) {
  return Object.fromEntries(values.filter(([, value]) => value !== undefined)) as Record<
    string,
    string
  >
}

function KeyValueRows({ values }: { values: Record<string, string> }) {
  return (
    <dl className="divide-y rounded-md border text-xs">
      {Object.entries(values).map(([key, value]) => (
        <div key={key} className="grid grid-cols-[minmax(8rem,30%)_1fr] gap-3 px-3 py-2">
          <dt className="font-mono text-muted-foreground">{key}</dt>
          <dd className="whitespace-pre-wrap break-words font-mono">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function CustomSpanDetails({ span }: { span: IDevToolsSpan }) {
  const details = definedValues([
    ["Name", span.name],
    ["Duration", formatDuration(span.durationMs)],
    ["Status", span.status.code === 0 ? "Success" : span.status.message ?? "Error"],
  ])

  const error = span.error
    ? definedValues([
          ["Type", span.error.type],
          ["Message", span.error.message],
        ])
    : {}

  return (
    <div className="mt-4 space-y-5 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-custom">{span.name}</h3>
        <span className={CUSTOM_TYPE_BADGE_CLASS}>CUSTOM</span>
      </div>
      <KeyValueRows values={details} />

      {span.error && (Object.keys(error).length > 0 || span.error.stack) && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">
            Error
          </h4>
          {Object.keys(error).length > 0 && <KeyValueRows values={error} />}
          {span.error.stack && (
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs">
              {span.error.stack}
            </pre>
          )}
        </section>
      )}
    </div>
  )
}