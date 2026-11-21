import assert from "node:assert/strict";
import { test } from "node:test";

import DashboardErrorMapper from "../src/dashboard/dashboard-errors-mapper";
import type { IDevToolsTrace } from "../src/types";

function trace(spans: IDevToolsTrace["spans"]): IDevToolsTrace {
    return {
        traceId: "trace-errors",
        rootSpanId: spans[0]?.spanId ?? "root",
        startedAt: 1,
        durationMs: 10,
        spans,
    };
}

test("maps exception payloads and status-only span failures", () => {
    const mapper = new DashboardErrorMapper();
    const mapped = mapper.map(trace([
        {
            traceId: "trace-errors",
            spanId: "status-only",
            type: "database",
            name: "SELECT users",
            startedAt: 5,
            durationMs: 2,
            attributes: {},
            status: { code: 2, message: "connection refused" },
        },
        {
            traceId: "trace-errors",
            spanId: "exception",
            type: "framework",
            name: "handler",
            startedAt: 8,
            durationMs: 1,
            attributes: {},
            status: { code: 0 },
            error: {
                type: "Error",
                message: "boom",
                stack: "Error: boom",
            },
        },
    ]));

    assert.equal(mapped.length, 2);
    assert.equal(mapped[0].spanId, "status-only");
    assert.equal(mapped[0].message, "connection refused");
    assert.equal(mapped[1].spanId, "exception");
    assert.equal(mapped[1].message, "boom");
});

test("omits successful spans without captured errors", () => {
    const mapper = new DashboardErrorMapper();
    const mapped = mapper.map(trace([
        {
            traceId: "trace-errors",
            spanId: "ok",
            type: "http.server",
            name: "GET /ok",
            startedAt: 1,
            durationMs: 1,
            attributes: {},
            status: { code: 0 },
        },
    ]));

    assert.deepEqual(mapped, []);
});