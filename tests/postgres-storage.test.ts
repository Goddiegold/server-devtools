import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import PgStorage from "../src/storage/pg-storage";
import type { IDevToolsSpan } from "../src/types";

const span: IDevToolsSpan = {
  spanId: "span-1",
  traceId: "trace-1",
  type: "http.server",
  name: "GET /users",
  startedAt: 1_700_000_000_000,
  durationMs: 12.5,
  attributes: { "http.request.method": "GET" },
  status: { code: 1 },
};

test("persists and reconstructs spans using PostgreSQL row values", async () => {
  const queries: string[] = [];
  const client = {
    query: async (text: string) => {
      queries.push(text);
      if (text.includes("FROM serverdevtools.spans") && text.includes("span_id")) {
        return {
          rows: [{
            span_id: "span-1",
            trace_id: "trace-1",
            parent_span_id: null,
            type: "http.server",
            name: "GET /users",
            started_at: "1700000000000",
            duration_ms: 12.5,
            attributes_json: '{"http.request.method":"GET"}',
            status_json: '{"code":1}',
            error_json: null,
          }],
        };
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const originalConnect = Pool.prototype.connect;
  Pool.prototype.connect = async function () {
    return client as never;
  };

  try {
    const storage = new PgStorage("postgresql://localhost/serverdevtools_test");
    await storage.saveSpan(span);
    assert.deepEqual(await storage.getSpansByTraceId("trace-1"), [{
      ...span,
      parentSpanId: undefined,
      error: undefined,
    }]);
    assert.ok(queries.some(query => query.includes("ON CONFLICT (span_id) DO UPDATE")));
  } finally {
    Pool.prototype.connect = originalConnect;
  }
});

test("close waits for an accepted PostgreSQL operation", async () => {
  let releaseSelect!: () => void;
  const selectReleased = new Promise<void>(resolve => {
    releaseSelect = resolve;
  });
  let selectStarted = false;
  let endCalls = 0;
  const client = {
    query: async (text: string) => {
      if (text.includes("FROM serverdevtools.spans") && text.includes("span_id")) {
        selectStarted = true;
        await selectReleased;
      }
      return { rows: [] };
    },
    release: () => undefined,
  };
  const originalConnect = Pool.prototype.connect;
  const originalEnd = Pool.prototype.end;
  Pool.prototype.connect = async function () {
    return client as never;
  };
  Pool.prototype.end = async function () {
    endCalls += 1;
  };

  try {
    const storage = new PgStorage("postgresql://localhost/serverdevtools_test");
    const read = storage.getSpansByTraceId("trace-1");
    while (!selectStarted) {
      await new Promise(resolve => setImmediate(resolve));
    }

    const close = storage.close();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(endCalls, 0);
    releaseSelect();
    await Promise.all([read, close]);
    assert.equal(endCalls, 1);
  } finally {
    Pool.prototype.connect = originalConnect;
    Pool.prototype.end = originalEnd;
  }
});
