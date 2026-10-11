import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import PgStorage from "../src/storage/pg-storage";
import type { IDevToolsSpan } from "../src/types";

function span(traceId: string, spanId: string, statusCode: number, error?: object): IDevToolsSpan {
  return {
    traceId,
    spanId,
    type: "http.server",
    name: "GET /error-semantics",
    startedAt: 1,
    durationMs: 1,
    attributes: { "http.request.method": "GET" },
    status: { code: statusCode },
    error,
  };
}

test("PostgreSQL trace summaries treat status-only and exception spans as errors in either arrival order", async () => {
  const spans = new Map<string, IDevToolsSpan>();
  const summaries = new Map<string, boolean>();
  const queries: string[] = [];
  const client = {
    query: async (text: string, parameters: unknown[] = []) => {
      queries.push(text);

      if (text.includes("INSERT INTO serverdevtools.spans")) {
        const [spanId, traceId, , , name, startedAt, durationMs, attributes, status, error] = parameters;
        spans.set(String(spanId), {
          traceId: String(traceId),
          spanId: String(spanId),
          type: "http.server",
          name: String(name),
          startedAt: Number(startedAt),
          durationMs: Number(durationMs),
          attributes: JSON.parse(String(attributes)),
          status: JSON.parse(String(status)),
          error: error ? JSON.parse(String(error)) : undefined,
        });
      }

      if (text.includes("UPDATE serverdevtools.traces") && text.includes("SET has_error = 1")) {
        summaries.set(String(parameters[0]), true);
      }

      if (text.includes("SELECT 1") && text.includes("FROM serverdevtools.spans")) {
        const traceId = String(parameters[0]);
        return {
          rows: [...spans.values()]
            .filter(candidate => candidate.traceId === traceId)
            .filter(candidate => candidate.status.code === 2 || candidate.error !== undefined)
            .slice(0, 1),
        };
      }

      if (text.includes("INSERT INTO serverdevtools.traces")) {
        const traceId = String(parameters[0]);
        const hasError = Number(parameters[8]) === 1;
        summaries.set(traceId, summaries.get(traceId) === true || hasError);
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
    await storage.saveSpan(span("status-before", "status-before-root", 2));
    await storage.saveTraceSummary(span("status-before", "status-before-root", 0));
    assert.equal(summaries.get("status-before"), true);

    await storage.saveSpan(span("status-after", "status-after-root", 0));
    await storage.saveTraceSummary(span("status-after", "status-after-root", 0));
    assert.equal(summaries.get("status-after"), false);
    await storage.saveSpan(span("status-after", "status-after-error", 2));
    assert.equal(summaries.get("status-after"), true);

    await storage.saveSpan(span("exception", "exception-root", 0, { message: "boom" }));
    await storage.saveTraceSummary(span("exception", "exception-root", 0));
    assert.equal(summaries.get("exception"), true);

    await storage.saveSpan(span("success", "success-root", 0));
    await storage.saveTraceSummary(span("success", "success-root", 0));
    assert.equal(summaries.get("success"), false);
    await storage.saveSpan(span("success", "success-root", 0, { message: "sticky" }));
    assert.equal(summaries.get("success"), true);

    assert.equal(queries.filter(query => query.includes("pg_advisory_xact_lock")).length, 10);
  } finally {
    Pool.prototype.connect = originalConnect;
  }
});
