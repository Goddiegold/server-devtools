import assert from "node:assert/strict";
import test from "node:test";

import SQLiteStorage from "../src/storage/sqlite-storage";
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

async function summaryHasError(storage: SQLiteStorage, traceId: string): Promise<boolean> {
  return (await storage.getTraceSummaries()).find(summary => summary.traceId === traceId)?.hasError ?? false;
}

test("SQLite trace summaries treat status-only and exception spans as errors in either arrival order", async () => {
  const storage = new SQLiteStorage(":memory:");

  try {
    await storage.saveSpan(span("status-before", "status-before-root", 2));
    await storage.saveTraceSummary(span("status-before", "status-before-root", 0));
    assert.equal(await summaryHasError(storage, "status-before"), true);

    await storage.saveSpan(span("status-after", "status-after-root", 0));
    await storage.saveTraceSummary(span("status-after", "status-after-root", 0));
    assert.equal(await summaryHasError(storage, "status-after"), false);
    await storage.saveSpan(span("status-after", "status-after-error", 2));
    assert.equal(await summaryHasError(storage, "status-after"), true);

    await storage.saveSpan(span("exception", "exception-root", 0, { message: "boom" }));
    await storage.saveTraceSummary(span("exception", "exception-root", 0));
    assert.equal(await summaryHasError(storage, "exception"), true);

    await storage.saveSpan(span("success", "success-root", 0));
    await storage.saveTraceSummary(span("success", "success-root", 0));
    assert.equal(await summaryHasError(storage, "success"), false);
    await storage.saveSpan(span("success", "success-root", 0, { message: "sticky" }));
    assert.equal(await summaryHasError(storage, "success"), true);
  } finally {
    await storage.close();
  }
});
