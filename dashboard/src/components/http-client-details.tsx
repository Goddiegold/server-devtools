import { useEffect, useState } from "react"

import { getHttpClientDetails, type IHttpClientDetails } from "@/api/execution"
import type { IDevToolsSpan } from "@/types"

function attributeString(span: IDevToolsSpan, key: string) {
  const value = span.attributes[key]
  return value === undefined || value === null || value === "" ? undefined : String(value)
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

function formatValue(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }

  const formatted = JSON.stringify(value, null, 2)
  return formatted === undefined ? String(value) : formatted
}

function formatHeaders(headers: Record<string, string | string[]> | undefined) {
  return headers
    ? Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        ])
      )
    : {}
}

function CaptureSection({
  title,
  headers,
  body,
}: {
  title: string
  headers?: Record<string, string | string[]>
  body?: unknown
}) {
  const formattedHeaders = formatHeaders(headers)
  const hasBody = body !== undefined

  if (Object.keys(formattedHeaders).length === 0 && !hasBody) {
    return null
  }

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <div className="space-y-3">
        {Object.keys(formattedHeaders).length > 0 && (
          <KeyValueRows values={formattedHeaders} />
        )}
        {hasBody && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 font-mono text-xs">
            {formatValue(body)}
          </pre>
        )}
      </div>
    </section>
  )
}

function DetailSection({ title, values }: { title: string; values: Record<string, string> }) {
  if (Object.keys(values).length === 0) {
    return null
  }

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <KeyValueRows values={values} />
    </section>
  )
}

export function HttpClientDetails({
  traceId,
  span,
}: {
  traceId: string
  span: IDevToolsSpan
}) {
  const [details, setDetails] = useState<IHttpClientDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void getHttpClientDetails(traceId, span.spanId)
      .then((data) => {
        if (active) {
          setDetails(data.details ?? null)
        }
      })
      .catch((error) => {
        if (active) {
          setDetailsError(
            error instanceof Error
              ? error.message
              : "Failed to load HTTP client details"
          )
        }
      })
      .finally(() => {
        if (active) {
          setDetailsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [span.spanId, traceId])

  const request = definedValues([
    ["Method", attributeString(span, "http.request.method")],
    ["URL", attributeString(span, "url.full")],
    ["Status", attributeString(span, "http.response.status_code")],
    ["Duration", `${span.durationMs.toFixed(2)}ms`],
  ])
  const server = definedValues([
    ["Host", attributeString(span, "server.address")],
    ["Port", attributeString(span, "server.port")],
    ["Scheme", attributeString(span, "url.scheme")],
  ])
  const network = definedValues([
    ["Peer Address", attributeString(span, "network.peer.address")],
    ["Peer Port", attributeString(span, "network.peer.port")],
  ])
  const url = definedValues([
    ["Path", attributeString(span, "url.path")],
    ["Query", attributeString(span, "url.query")],
  ])
  const error = span.error
    ? definedValues([
        ["Type", span.error.type],
        ["Message", span.error.message],
      ])
    : {}

  return (
    <div className="mt-4 space-y-5 border-t pt-4">
      <h3 className="text-sm font-semibold">HTTP Request</h3>
      <DetailSection title="Request" values={request} />
      <DetailSection title="Server" values={server} />
      <DetailSection title="Network" values={network} />
      <DetailSection title="URL" values={url} />

      {detailsLoading && (
        <p className="text-sm text-muted-foreground">
          Loading HTTP client details...
        </p>
      )}
      {!detailsLoading && detailsError && (
        <p className="text-sm text-destructive">{detailsError}</p>
      )}
      {!detailsLoading && !detailsError && details && (
        <>
          <CaptureSection
            title="Request"
            headers={details.requestHeaders}
            body={details.requestBody}
          />
          <CaptureSection
            title="Response"
            headers={details.responseHeaders}
            body={details.responseBody}
          />
        </>
      )}

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
