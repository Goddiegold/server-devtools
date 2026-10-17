import assert from "node:assert/strict";
import test from "node:test";

import SQLiteStorage from "../src/storage/sqlite-storage";
import type { IDevToolsSpan } from "../src/types";

function span(
  traceId: string,
  spanId: string,
  statusCode: number,
  error?: object,
): IDevToolsSpan {
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

function summaryHasError(storage: SQLiteStorage, traceId: string): boolean {
  return storage.getTraceSummaries().find(summary => summary.traceId === traceId)?.hasError ?? false;
}

test("status-only errors are detected when the span arrives before the summary", () => {
  const storage = new SQLiteStorage(":memory:");

  try {
    storage.saveSpan(span("status-before", "status-before-root", 2));
    storage.saveTraceSummary(span("status-before", "status-before-root", 0));

    assert.equal(summaryHasError(storage, "status-before"), true);
  } finally {
    storage.close();
  }
});

test("status-only errors are detected when the span arrives after the summary", () => {
  const storage = new SQLiteStorage(":memory:");

  try {
    storage.saveSpan(span("status-after", "status-after-root", 0));
    storage.saveTraceSummary(span("status-after", "status-after-root", 0));
    assert.equal(summaryHasError(storage, "status-after"), false);

    storage.saveSpan(span("status-after", "status-after-error", 2));

    assert.equal(summaryHasError(storage, "status-after"), true);
  } finally {
    storage.close();
  }
});

test("exception errors are detected while successful spans remain successful", () => {
  const storage = new SQLiteStorage(":memory:");

  try {
    storage.saveSpan(span("exception", "exception-root", 0, { message: "boom" }));
    storage.saveTraceSummary(span("exception", "exception-root", 0));
    assert.equal(summaryHasError(storage, "exception"), true);

    storage.saveSpan(span("success", "success-root", 0));
    storage.saveTraceSummary(span("success", "success-root", 0));
    assert.equal(summaryHasError(storage, "success"), false);
  } finally {
    storage.close();
  }
});

test("has_error remains sticky after a later non-error summary update", () => {
  const storage = new SQLiteStorage(":memory:");

  try {
    storage.saveSpan(span("sticky", "sticky-error", 2));
    storage.saveTraceSummary(span("sticky", "sticky-root", 0));
    assert.equal(summaryHasError(storage, "sticky"), true);

    storage.saveTraceSummary(span("sticky", "sticky-root", 0));

    assert.equal(summaryHasError(storage, "sticky"), true);
  } finally {
    storage.close();
  }
});
