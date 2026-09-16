import type { IDevToolsSpan } from "@/types"
import { formatDatabaseQuery } from "@/lib/database"

function attributeString(span: IDevToolsSpan, key: string) {
  const value = span.attributes[key]
  return value === undefined || value === null || value === "" ? undefined : String(value)
}

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

export function DatabaseDetails({ span }: { span: IDevToolsSpan }) {
  const details = definedValues([
      ["System", attributeString(span, "db.system.name")],
      ["Operation", attributeString(span, "db.operation.name")],
      ["Database", attributeString(span, "db.namespace")],
      ["Collection", attributeString(span, "db.collection.name")],
      ["Duration", formatDuration(span.durationMs)],
      ["Status", span.status.code === 0 ? "Success" : span.status.message ?? "Error"],
    ])
  const query = attributeString(span, "db.query.text")
  const error = span.error
    ? definedValues([
          ["Type", span.error.type],
          ["Message", span.error.message],
        ])
    : {}

  return (
    <div className="mt-4 space-y-5 border-t pt-4">
      <h3 className="text-sm font-semibold">Database Operation</h3>
      <KeyValueRows values={details} />

      {query !== undefined && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Query
          </h4>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 font-mono text-xs">
            {formatDatabaseQuery(query)}
          </pre>
        </section>
      )}

      {span.error && (Object.keys(error).length > 0 || span.error.stack) && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">
            Error
          </h4>
          {Object.keys(error).length > 0 && <KeyValueRows values={error} />}
          {span.error?.stack && (
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 font-mono text-xs">
              {span.error.stack}
            </pre>
          )}
        </section>
      )}
    </div>
  )
}
