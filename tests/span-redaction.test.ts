import assert from "node:assert/strict";
import { test } from "node:test";
import { SpanKind } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

import ServerDevToolsExporter from "../src/instrumentation/exporter";
import SQLiteStorage from "../src/storage/sqlite-storage";
import Config from "../src/config";
import RedactionService from "../src/security/redaction.service";

test("redacts sensitive HTTP header attributes before span persistence", () => {
  const storage = new SQLiteStorage(":memory:");
  const exporter = new ServerDevToolsExporter(
    storage,
    new RedactionService(true, Config.DEFAULT_SENSITIVE_HEADER_NAMES),
  );
  const attributes = {
    "http.request.header.authorization": ["inbound-secret-a", "inbound-secret-b"],
    "http.request.header.x-visible": ["visible-request"],
    "http.response.header.X-Api-Key": ["outbound-secret"],
    "http.response.header.content-type": ["application/json"],
    "trace.custom": "unchanged",
  };
  const span = {
    spanContext() {
      return { traceId: "trace-redaction", spanId: "span-redaction" };
    },
    parentSpanContext: undefined,
    kind: SpanKind.SERVER,
    name: "GET /redaction",
    startTime: [100, 0],
    duration: [0, 1_000_000],
    attributes,
    status: { code: 0 },
  } as unknown as ReadableSpan;

  exporter.export([span], () => { });

  const persisted = storage.getSpansByTraceId("trace-redaction")[0];
  assert.ok(persisted);
  assert.deepEqual(persisted.attributes, {
    "http.request.header.authorization": "[REDACTED]",
    "http.request.header.x-visible": ["visible-request"],
    "http.response.header.X-Api-Key": "[REDACTED]",
    "http.response.header.content-type": ["application/json"],
    "trace.custom": "unchanged",
  });
  assert.deepEqual(span.attributes, attributes);

  storage.close();
});
