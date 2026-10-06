import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import PgStorage from "../src/storage/pg-storage";

test("initializes the PostgreSQL schema once and closes its owned pool", async () => {
  const queries: string[] = [];
  let connectCalls = 0;
  let releaseCalls = 0;
  let endCalls = 0;

  const client = {
    query: async (query: string) => {
      queries.push(query);
    },
    release: () => {
      releaseCalls += 1;
    },
  };

  const originalConnect = Pool.prototype.connect;
  const originalEnd = Pool.prototype.end;

  Pool.prototype.connect = async function () {
    connectCalls += 1;
    return client as never;
  };
  Pool.prototype.end = async function () {
    endCalls += 1;
  };

  try {
    const storage = new PgStorage("postgresql://localhost/serverdevtools_test");

    await Promise.all([storage.initialize(), storage.initialize()]);
    await storage.close();
    await storage.close();

    assert.equal(connectCalls, 1);
    assert.equal(releaseCalls, 1);
    assert.equal(endCalls, 1);
    assert.equal(queries[0], "BEGIN");
    assert.match(queries[1] ?? "", /CREATE SCHEMA IF NOT EXISTS serverdevtools/);
    assert.match(queries[1] ?? "", /started_at BIGINT NOT NULL/);
    assert.match(queries[1] ?? "", /duration_ms DOUBLE PRECISION/);
    assert.match(queries[1] ?? "", /attributes_json TEXT NOT NULL/);
    assert.match(queries[1] ?? "", /has_error INTEGER NOT NULL DEFAULT 0/);
    assert.match(queries[1] ?? "", /idx_spans_trace_id/);
    assert.match(queries[1] ?? "", /idx_traces_started_at/);
    assert.equal(queries[2], "COMMIT");
  } finally {
    Pool.prototype.connect = originalConnect;
    Pool.prototype.end = originalEnd;
  }
});

test("rolls back and releases the client when schema initialization fails", async () => {
  const queries: string[] = [];
  let releaseCalls = 0;

  const client = {
    query: async (query: string) => {
      queries.push(query);
      if (query !== "BEGIN" && query !== "ROLLBACK") {
        throw new Error("schema creation failed");
      }
    },
    release: () => {
      releaseCalls += 1;
    },
  };

  const originalConnect = Pool.prototype.connect;
  Pool.prototype.connect = async function () {
    return client as never;
  };

  try {
    const storage = new PgStorage("postgresql://localhost/serverdevtools_test");

    await assert.rejects(storage.initialize(), /schema creation failed/);
    assert.equal(queries[0], "BEGIN");
    assert.match(queries[1] ?? "", /CREATE SCHEMA IF NOT EXISTS serverdevtools/);
    assert.equal(queries[2], "ROLLBACK");
    assert.equal(releaseCalls, 1);
  } finally {
    Pool.prototype.connect = originalConnect;
  }
});
