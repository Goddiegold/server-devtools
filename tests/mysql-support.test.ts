import assert from "node:assert/strict";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

import ServerDevToolsExporter from "../src/instrumentation/exporter";
import SpanMapper from "../src/instrumentation/span-mapper";
import SQLiteStorage from "../src/storage/sqlite-storage";

function makeSpan({
  traceId,
  spanId,
  parentSpanId,
  name,
  query,
  status = { code: SpanStatusCode.OK },
  events = [],
  system = "mysql",
}: {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  query: string;
  status?: { code: number; message?: string };
  events?: ReadableSpan["events"];
  system?: string;
}): ReadableSpan {
  return {
    spanContext: () => ({
      traceId,
      spanId,
      traceFlags: 1,
    }),
    parentSpanContext: parentSpanId
      ? {
          traceId,
          spanId: parentSpanId,
          traceFlags: 1,
        }
      : undefined,
    kind: SpanKind.CLIENT,
    name,
    startTime: [200, 500_000_000],
    duration: [0, 42_000_000],
    attributes: {
      "db.system.name": system,
      "db.namespace": "server_devtools_test",
      "db.query.text": query,
    },
    status,
    events,
  } as unknown as ReadableSpan;
}

const mapper = new SpanMapper();
const traceId = "mysql2-trace";
const requestSpanId = "mysql2-request";

const mysql2Operations = [
  {
    spanId: "mysql2-select",
    name: "SELECT",
    query: "SELECT * FROM users",
  },
  {
    spanId: "mysql2-parameterized-select",
    name: "SELECT",
    query: "SELECT * FROM users WHERE id = ?",
  },
  {
    spanId: "mysql2-insert",
    name: "INSERT",
    query: "INSERT INTO users (name, email) VALUES (?, ?)",
  },
  {
    spanId: "mysql2-update",
    name: "UPDATE",
    query: "UPDATE users SET name = ? WHERE id = ?",
  },
  {
    spanId: "mysql2-delete",
    name: "DELETE",
    query: "DELETE FROM users WHERE id = ?",
  },
].map((operation) =>
  makeSpan({
    traceId,
    parentSpanId: requestSpanId,
    ...operation,
  }),
);

const failedMysql2Span = makeSpan({
  traceId,
  spanId: "mysql2-failed",
  parentSpanId: requestSpanId,
  name: "SELECT",
  query: "SELECT * FROM missing_users",
  status: {
    code: SpanStatusCode.ERROR,
    message: "ER_NO_SUCH_TABLE: Table 'server_devtools_test.missing_users' doesn't exist",
  },
  events: [
    {
      name: "exception",
      time: [200, 501_000_000],
      attributes: {
        "exception.type": "Error",
        "exception.message": "ER_NO_SUCH_TABLE: missing_users",
        "exception.stacktrace": "Error: ER_NO_SUCH_TABLE: missing_users",
      },
    },
  ],
});

for (const span of [...mysql2Operations, failedMysql2Span]) {
  const result = mapper.map(span);

  assert.equal(result.type, "database");
  assert.equal(result.attributes["db.system.name"], "mysql");
  assert.equal(result.attributes["db.namespace"], "server_devtools_test");
  assert.equal(result.attributes["db.query.text"], span.attributes["db.query.text"]);
  assert.equal(result.startedAt, 200500);
  assert.equal(result.durationMs, 42);
}

const failedMysql2Result = mapper.map(failedMysql2Span);

assert.deepEqual(failedMysql2Result.status, {
  code: SpanStatusCode.ERROR,
  message: "ER_NO_SUCH_TABLE: Table 'server_devtools_test.missing_users' doesn't exist",
});
assert.deepEqual(failedMysql2Result.error, {
  type: "Error",
  message: "ER_NO_SUCH_TABLE: missing_users",
  stack: "Error: ER_NO_SUCH_TABLE: missing_users",
});

const requestSpan = {
  ...makeSpan({
    traceId,
    spanId: requestSpanId,
    name: "GET /mysql2-select",
    query: "",
  }),
  kind: SpanKind.SERVER,
  parentSpanContext: undefined,
  attributes: {
    "http.request.method": "GET",
    "http.route": "/mysql2-select",
    "http.response.status_code": 500,
  },
  status: {
    code: SpanStatusCode.ERROR,
  },
} as unknown as ReadableSpan;

const storage = new SQLiteStorage(":memory:");
const exporter = new ServerDevToolsExporter(storage);
let exportCode: number | undefined;

exporter.export(
  [requestSpan, ...mysql2Operations, failedMysql2Span],
  (result) => {
    exportCode = result.code;
  },
);

const trace = storage.getTrace(traceId);

assert.equal(exportCode, 0);
assert.ok(trace);
assert.equal(trace.rootSpanId, requestSpanId);
assert.equal(trace.spans.length, 7);
assert.ok(
  trace.spans
    .filter((span) => span.type === "database")
    .every((span) => span.parentSpanId === requestSpanId),
);
assert.equal(storage.getTraceSummaries()[0]?.hasError, true);

storage.close();

console.log("MySQL support tests passed");
