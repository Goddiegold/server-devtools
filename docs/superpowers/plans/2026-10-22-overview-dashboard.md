# Overview Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated, storage-aggregated Overview dashboard with shared time filtering, request volume, and recent failures while preserving Requests.

**Architecture:** Query canonical SQLite `traces` summaries once per overview request using a shared half-open time window, then return all cards, buckets, and failures in one API payload. Add a small route-aware React page using existing primitives and inline SVG rather than introducing a chart dependency.

**Tech Stack:** Node `node:sqlite`, TypeScript, existing dashboard HTTP server/authentication, React, Tailwind/shadcn primitives, lucide-react, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-22-overview-dashboard-design.md`

## Global Constraints

- Calculate metrics from canonical persisted HTTP request/trace summaries, not raw OpenTelemetry spans.
- One incoming request counts once, regardless of child spans.
- Perform aggregations in the storage layer and reuse existing storage/auth interfaces.
- Use one consistent `[from, to)` time boundary for every metric and graph bucket.
- Keep the Requests page behavior unchanged and keep the implementation minimal.
- Support light/dark themes, responsive layout, loading/empty/error states, and ranges `15m`, `1h`, `6h`, `24h` with default `1h`.

## Review Focus

- An incomplete summary with null duration must count as a request but not poison average latency or slow-request counts — storage test covers it.
- A trace with multiple child spans must produce one total and one volume event — storage test covers it.
- A request exactly at the window start or end must obey `[from, to)` consistently — storage boundary test covers it.
- Zero requests must return zero-safe metrics and empty failures/buckets — storage/API tests cover it.
- Invalid or unauthenticated overview requests must not bypass the dashboard contract — API tests cover them.

---

### Task 1: Storage overview aggregation

**Files:**
- Modify: `src/types/dashboard.ts` or a new focused type file for the storage/API overview contract.
- Modify: `src/storage/sqlite-storage.ts`.
- Test: `tests/sqlite-storage.test.ts`.

**Interfaces:**
- Produces `SQLiteStorage.getOverview(range: "15m" | "1h" | "6h" | "24h", now?: number): IOverviewMetrics` with `range`, `from`, `to`, `totalRequests`, `errorRate`, `averageLatencyMs`, `slowRequests`, `volume`, and `recentFailures`.

- [ ] Write failing storage assertions for duplicate-child-span deduplication, 5xx rate, null durations, `>500ms` threshold, `[from,to)` boundaries, chronological buckets, recent-failure ordering/limit, and empty data.
- [ ] Run `npm test -- tests/sqlite-storage.test.ts` and observe failure because `getOverview` is missing.
- [ ] Implement the typed overview result and a single `traces`-based aggregation in `SQLiteStorage`; use deterministic bucket count/width derived from range and map rows into summary objects without reading child spans.
- [ ] Run the storage test and verify it passes.
- [ ] Run `npm test` and verify the existing suite remains green.

### Task 2: Authenticated overview API

**Files:**
- Modify: `src/config/index.ts`.
- Modify: `src/dashboard/dashboard-server.ts`.
- Test: `tests/dashboard-api.test.ts`.

**Interfaces:**
- Consumes `SQLiteStorage.getOverview(...)`.
- Produces `GET /_devtools/api/overview?range=15m|1h|6h|24h`, returning the overview payload and HTTP 400 for invalid ranges.

- [ ] Add failing API assertions for authenticated success, default `1h`, invalid range `400`, and unauthenticated `401`.
- [ ] Run the dashboard test and observe failure because the route is missing.
- [ ] Add the overview route constant and authenticated server handler with range parsing, storage error handling, JSON content type, and no-store response headers.
- [ ] Run the dashboard test and verify it passes.

### Task 3: Frontend API/types and navigation

**Files:**
- Create: `dashboard/src/api/overview.ts`.
- Modify: `dashboard/src/types/dashboard-types.ts`.
- Modify: `dashboard/src/App.tsx`.
- Modify: `dashboard/src/pages/dashboard-header.tsx` only if navigation affordances are needed.

**Interfaces:**
- Consumes the overview endpoint and returns typed `IOverviewResponse`.
- Produces route kinds `overview`, `requests`, and `trace`, with Overview at `/_devtools` and Requests at `/_devtools/requests`.

- [ ] Add the typed API function and route behavior; run `npm --prefix dashboard run build` to expose missing page/type imports before implementation is complete.
- [ ] Implement the client fetch and route navigation, retaining the existing trace detail URL and Requests component unchanged.
- [ ] Run the dashboard build and verify type checking succeeds.

### Task 4: Responsive Overview UI

**Files:**
- Create: `dashboard/src/pages/overview-page.tsx`.
- Modify: `dashboard/src/App.tsx` as needed to render Overview and route failure clicks.

**Interfaces:**
- Consumes `getOverview` and `onSelectRequest(request: IDashboardRequest)`.
- Produces four summary cards, range selector, request-volume area/line chart, recent failures, and loading/empty/error states using existing theme tokens.

- [ ] Add the Overview page with its loading/error/empty states and range selector, then run the dashboard build to catch JSX/type errors.
- [ ] Add the inline SVG chart and failure rows; clicking a failure navigates to the existing trace detail page.
- [ ] Run `npm --prefix dashboard run lint` and `npm --prefix dashboard run build` and verify both pass.

### Task 5: Full verification

**Files:**
- Modify: any implementation files required by verification findings.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Review the diff against the spec and verify Requests remains reachable at `/_devtools/requests`.
