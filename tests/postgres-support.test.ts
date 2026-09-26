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
  kind,
  name,
  attributes,
  status,
  events = [],
}: {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  kind: SpanKind;
  name: string;
  attributes: Record<string, unknown>;
  status: { code: number; message?: string };
  events?: ReadableSpan["events"];
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
    kind,
    name,
    startTime: [100, 0],
    duration: [0, 10_000_000],
    attributes,
    status,
    events,
  } as unknown as ReadableSpan;
}

const mapper = new SpanMapper();

const successfulPostgresSpan = makeSpan({
  traceId: "postgres-success-trace",
  spanId: "postgres-success-span",
  parentSpanId: "request-success-span",
  kind: SpanKind.CLIENT,
  name: "SELECT",
  attributes: {
    "db.system.name": "postgresql",
    "db.namespace": "server_devtools_test",
    "db.query.text": "SELECT * FROM users WHERE id = $1",
  },
  status: {
    code: SpanStatusCode.OK,
  },
});

const successfulResult = mapper.map(successfulPostgresSpan);

assert.equal(successfulResult.type, "database");
assert.equal(successfulResult.traceId, "postgres-success-trace");
assert.equal(successfulResult.attributes["db.system.name"], "postgresql");
assert.equal(
  successfulResult.attributes["db.namespace"],
  "server_devtools_test",
);
assert.equal(
  successfulResult.attributes["db.query.text"],
  "SELECT * FROM users WHERE id = $1",
);
assert.deepEqual(successfulResult.status, {
  code: SpanStatusCode.OK,
  message: undefined,
});

const failedPostgresSpan = makeSpan({
  traceId: "postgres-failure-trace",
  spanId: "postgres-failure-span",
  parentSpanId: "request-failure-span",
  kind: SpanKind.CLIENT,
  name: "SELECT",
  attributes: {
    "db.system.name": "postgresql",
    "db.namespace": "server_devtools_test",
    "db.query.text": "SELECT * FROM missing_users",
  },
  status: {
    code: SpanStatusCode.ERROR,
    message: "relation missing_users does not exist",
  },
  events: [
    {
      name: "exception",
      time: [100, 1_000_000],
      attributes: {
        "exception.type": "error",
        "exception.message": "relation missing_users does not exist",
        "exception.stacktrace": "error: relation missing_users does not exist",
      },
    },
  ],
});

const failedResult = mapper.map(failedPostgresSpan);

assert.equal(failedResult.type, "database");
assert.deepEqual(failedResult.status, {
  code: SpanStatusCode.ERROR,
  message: "relation missing_users does not exist",
});
assert.deepEqual(failedResult.error, {
  type: "error",
  message: "relation missing_users does not exist",
  stack: "error: relation missing_users does not exist",
});

const storage = new SQLiteStorage(":memory:");
const exporter = new ServerDevToolsExporter(storage);

const requestSpan = makeSpan({
  traceId: "postgres-failure-trace",
  spanId: "request-failure-span",
  kind: SpanKind.SERVER,
  name: "GET /postgres-failed",
  attributes: {
    "http.request.method": "GET",
    "http.route": "/postgres-failed",
    "http.response.status_code": 500,
  },
  status: {
    code: SpanStatusCode.ERROR,
  },
});

let exportCode: number | undefined;
exporter.export([requestSpan, failedPostgresSpan], (result) => {
  exportCode = result.code;
});

const trace = storage.getTrace("postgres-failure-trace");

assert.equal(exportCode, 0);
assert.ok(trace);
assert.equal(trace.rootSpanId, "request-failure-span");
assert.equal(trace.spans.length, 2);
assert.equal(trace.spans[1].spanId, "postgres-failure-span");
assert.equal(trace.spans[1].parentSpanId, "request-failure-span");
assert.equal(trace.spans[1].traceId, trace.traceId);
assert.equal(storage.getTraceSummaries()[0]?.hasError, true);

storage.close();

console.log("PostgreSQL support tests passed");
