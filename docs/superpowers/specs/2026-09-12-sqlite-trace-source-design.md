# SQLite as the Single Trace Source

## Goal

Make `SQLiteStorage` the only historical trace store used by the exporter and dashboard APIs. The OTel pipeline remains `ReadableSpan -> SpanMapper -> SQLiteStorage`, while `TraceMetadataStore` remains temporarily responsible for request/response body metadata.

## Design

- `ServerDevToolsExporter` accepts only `SQLiteStorage`, maps every exported span, persists it with `saveSpan`, and persists root-span summaries with `saveTraceSummary`. Its existing OTel success/failure callback behavior remains unchanged.
- `Instrumentation` owns one shared `SQLiteStorage`, passes it to the exporter and dashboard, exposes it for dashboard construction, and closes it during shutdown. `TraceStore` and `TraceAssembler` are no longer instantiated or exposed.
- `DashboardServer` receives `TraceMetadataStore` and the shared `SQLiteStorage`. Historical trace reads use `storage.getTrace(traceId)`; the requests list uses `storage.getTraceSummaries()` directly. Existing 404 responses and detail/execution/error mapping remain unchanged.
- `DashboardRequestMapper` is removed if the reference scan confirms it has no remaining consumers. `TraceStore` and `TraceAssembler`, plus only their obsolete tests, are removed once no references remain.

## Scope and compatibility

No changes are made to the SQLite schema, encryption, body persistence, authentication, dashboard UI, OTel instrumentation configuration, or unrelated server behavior. Existing tests that construct the exporter or dashboard are updated to use the shared SQLite storage API.

## Verification

Run the relevant Vitest tests and the root TypeScript check. Search production and test sources for `TraceStore` and `TraceAssembler` references and confirm none remain after cleanup.
