import assert from "node:assert/strict";

import SQLiteStorage from "../src/storage/sqlite-storage";

const storage = new SQLiteStorage(":memory:");


// Save root span

storage.saveSpan({
    traceId: "trace-1",
    spanId: "span-1",
    type: "http.server",
    name: "POST /users",
    startedAt: 1000,
    durationMs: 42,
    attributes: {
        "http.request.method": "POST",
    },
    status: {
        code: 0,
    },
});


// Verify single-span read

const spans = storage.getSpansByTraceId(
    "trace-1"
);

assert.equal(
    spans.length,
    1
);

assert.equal(
    spans[0].spanId,
    "span-1"
);

assert.equal(
    spans[0].traceId,
    "trace-1"
);

assert.equal(
    spans[0].type,
    "http.server"
);

assert.deepEqual(
    spans[0].attributes,
    {
        "http.request.method": "POST",
    }
);

assert.deepEqual(
    spans[0].status,
    {
        code: 0,
    }
);


// Add child span

storage.saveSpan({
    traceId: "trace-1",
    spanId: "span-2",
    parentSpanId: "span-1",
    type: "database",
    name: "find users",
    startedAt: 1010,
    durationMs: 20,
    attributes: {
        "db.system": "mongodb",
    },
    status: {
        code: 0,
    },
});


// Verify complete trace reconstruction

const trace = storage.getTrace(
    "trace-1"
);

assert.ok(trace);

assert.equal(
    trace.traceId,
    "trace-1"
);

assert.equal(
    trace.rootSpanId,
    "span-1"
);

assert.equal(
    trace.spans.length,
    2
);

assert.equal(
    trace.spans[0].spanId,
    "span-1"
);

assert.equal(
    trace.spans[1].spanId,
    "span-2"
);

assert.equal(
    trace.durationMs,
    42
);


// Verify missing trace

assert.equal(
    storage.getTrace("does-not-exist"),
    undefined
);


// Save trace summary

storage.saveTraceSummary({
    traceId: "trace-1",
    spanId: "span-1",
    type: "http.server",
    name: "POST /users",
    startedAt: 1000,
    durationMs: 42,
    attributes: {
        "http.request.method": "POST",
        "url.path": "/users",
        "http.route": "/users",
        "http.response.status_code": 201,
    },
    status: {
        code: 0,
    },
});


// Verify trace summaries

const summaries =
    storage.getTraceSummaries();

assert.equal(
    summaries.length,
    1
);

assert.deepEqual(
    summaries[0],
    {
        traceId: "trace-1",
        rootSpanId: "span-1",
        startedAt: 1000,
        durationMs: 42,
        method: "POST",
        path: "/users",
        route: "/users",
        statusCode: 201,
        hasError: false,
    }
);


// Close database

storage.close();

console.log(
    "sqlite storage tests passed"
);