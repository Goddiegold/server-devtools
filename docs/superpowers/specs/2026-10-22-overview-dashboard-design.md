# ServerDevTools Overview Dashboard Design

## Goal

Make the dashboard open on a compact Overview page that summarizes completed incoming HTTP requests for a shared time range, while keeping the existing Requests page available for investigation.

## Architecture

The existing SQLite `traces` table is the canonical persisted HTTP request summary: one row per incoming root request. Overview aggregation will live in `SQLiteStorage` and will query only that table, so child OpenTelemetry spans cannot inflate request counts. A single authenticated dashboard endpoint will return summary cards, time-series buckets, and recent failed request summaries using one `[from, to)` time window.

The frontend will add a route-aware Overview page and keep the current Requests page implementation intact. It will use existing UI primitives and a lightweight inline SVG chart, with explicit loading, empty, and error states and links from failures to the existing trace detail route.

## Data contract

Supported ranges are `15m`, `1h`, `6h`, and `24h`; the default is `1h`. The API accepts `range` and computes `to = Date.now()` and `from = to - range duration`. Metrics use the same window and bucket boundaries:

- total requests: all rows in the window;
- error rate: rows with HTTP status in `[500, 600)` divided by total, zero when empty;
- average latency: average non-null `duration_ms`, zero when no duration is present;
- slow requests: non-null durations strictly greater than `500ms`;
- request volume: fixed chronological buckets covering the same window;
- recent failures: newest HTTP 5xx summaries, limited to 10.

Rows with missing status or duration remain valid requests; they are counted in total but not treated as 5xx, and are excluded from latency/slow calculations where the missing value is required.

## API and UI

Add `GET /_devtools/api/overview?range=...`, protected by the current dashboard cookie authentication. Invalid ranges receive HTTP 400. The app routes `/_devtools` to Overview, `/_devtools/requests` to Requests, and preserves `/traces/:traceId` details. The Overview time selector reloads the complete payload so cards, chart, and failures always share a boundary.

## Verification

Storage tests cover deduplication, boundaries, nulls, 5xx and slow thresholds, buckets, and empty results. Dashboard API tests cover authentication, range validation, and the response contract. The dashboard build, SDK typecheck, and full test suite are required before completion.

## Scope exclusions

No endpoint analytics, database/Redis metrics, CPU monitoring, alerts, or changes to the existing Requests page behavior.
