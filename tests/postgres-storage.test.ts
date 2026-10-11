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

test("serializes error span and trace summary writes with the trace advisory lock", async () => {
  const queries: string[] = [];
  const client = {
    query: async (text: string) => {
      queries.push(text);
      if (text.includes("SELECT 1") && text.includes("error_json")) {
        return { rows: [] };
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
    await storage.saveSpan({ ...span, spanId: "error-span", error: { message: "boom" } });
    await storage.saveTraceSummary(span);

    const lockIndexes = queries
      .map((query, index) => query.includes("pg_advisory_xact_lock") ? index : -1)
      .filter(index => index >= 0);
    assert.equal(lockIndexes.length, 2);
    assert.match(queries[lockIndexes[0]], /hashtextextended\(\$1, 0\)/);
    assert.match(queries[lockIndexes[1]], /hashtextextended\(\$1, 0\)/);
    assert.ok(lockIndexes[0] < queries.findIndex(query => query.includes("INSERT INTO serverdevtools.spans")));
    assert.ok(lockIndexes[1] < queries.findIndex(query => query.includes("SELECT 1") && query.includes("error_json")));
  } finally {
    Pool.prototype.connect = originalConnect;
  }
});

test("filters methods by case-insensitive equality instead of a pattern", async () => {
  let filteredQuery = "";
  const client = {
    query: async (text: string) => {
      if (text.includes("COUNT(*)")) {
        filteredQuery = text;
      }
      return { rows: text.includes("COUNT(*)") ? [{ total: "0" }] : [] };
    },
    release: () => undefined,
  };
  const originalConnect = Pool.prototype.connect;
  Pool.prototype.connect = async function () {
    return client as never;
  };

  try {
    const storage = new PgStorage("postgresql://localhost/serverdevtools_test");
    await storage.getPaginatedTraceSummaries(1, 10, "", "GET");
    assert.match(filteredQuery, /LOWER\(t\.method\) = LOWER\(\$1\)/);
    assert.doesNotMatch(filteredQuery, /t\.method ILIKE/);
  } finally {
    Pool.prototype.connect = originalConnect;
  }
});
