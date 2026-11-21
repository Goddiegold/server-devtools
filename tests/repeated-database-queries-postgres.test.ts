import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildDatabaseSpanRepeatStats,
    countDatabaseSpanRepeats,
    postgresDatabaseGroupKey,
    summarizeDatabaseQueryRepeats,
} from "../src/core/repeated-database-queries";
import type { IDevToolsSpan } from "../src/types";

function databaseSpan(
    spanId: string,
    traceId: string,
    query: string,
): IDevToolsSpan {
    return {
        traceId,
        spanId,
        type: "database",
        name: "SELECT",
        startedAt: 1,
        durationMs: 5,
        attributes: {
            "db.system.name": "postgresql",
            "db.namespace": "server_devtools_test",
            "db.query.text": query,
        },
        status: { code: 0 },
    };
}

test("postgresql group key normalizes dollar parameter placeholders", () => {
    const first = postgresDatabaseGroupKey({
        "db.system.name": "postgresql",
        "db.query.text": "SELECT * FROM users WHERE id = $1",
    });
    const second = postgresDatabaseGroupKey({
        "db.system.name": "postgresql",
        "db.query.text": "SELECT   *   FROM users WHERE id = $2",
    });

    assert.equal(first, second);
    assert.match(first ?? "", /select \* from users where id = \?/);
});

test("postgresql grouping treats parameter variations as the same query", () => {
    const traceId = "trace-postgres";
    const spans = [
        databaseSpan("pg-1", traceId, "SELECT * FROM users WHERE id = $1"),
        databaseSpan("pg-2", traceId, "SELECT * FROM users WHERE id = $3"),
        databaseSpan("pg-3", traceId, "UPDATE users SET name = $1 WHERE id = $2"),
    ];

    const repeats = countDatabaseSpanRepeats(spans);

    assert.equal(repeats.get("pg-1"), 2);
    assert.equal(repeats.get("pg-2"), 2);
    assert.equal(repeats.has("pg-3"), false);
});

test("summarizes repeated postgres queries with cumulative and average duration", () => {
    const spans = [
        { ...databaseSpan("pg-d1", "trace", "SELECT * FROM users WHERE id = $1"), durationMs: 4 },
        { ...databaseSpan("pg-d2", "trace", "SELECT * FROM users WHERE id = $2"), durationMs: 6 },
        { ...databaseSpan("pg-d3", "trace", "UPDATE users SET name = $1 WHERE id = $2"), durationMs: 3 },
    ];

    const [summary] = summarizeDatabaseQueryRepeats(spans);
    const stats = buildDatabaseSpanRepeatStats(spans).get("pg-d1");

    assert.equal(summary.count, 2);
    assert.equal(summary.totalDurationMs, 10);
    assert.equal(summary.averageDurationMs, 5);
    assert.ok(stats);
    assert.equal(stats.summary, summary.summary);
    assert.doesNotMatch(JSON.stringify(summary), /secret|password/i);
});

test("skips postgres spans with invalid or missing durations in aggregation", () => {
    const spans = [
        { ...databaseSpan("pg-bad-1", "trace", "SELECT 1 WHERE id = $1"), durationMs: Number.NaN },
        { ...databaseSpan("pg-bad-2", "trace", "SELECT 1 WHERE id = $2"), durationMs: 5 },
    ];

    const [summary] = summarizeDatabaseQueryRepeats(spans);

    assert.equal(summary.count, 2);
    assert.equal(summary.totalDurationMs, 5);
    assert.equal(summary.averageDurationMs, 2.5);
});

test("postgresql repeats are isolated per request trace", () => {
    const spans = [
        databaseSpan("pg-a-1", "trace-a", "SELECT * FROM users WHERE id = $1"),
        databaseSpan("pg-a-2", "trace-a", "SELECT * FROM users WHERE id = $2"),
        databaseSpan("pg-b-1", "trace-b", "SELECT * FROM users WHERE id = $1"),
        databaseSpan("pg-b-2", "trace-b", "SELECT * FROM users WHERE id = $2"),
    ];

    assert.equal(countDatabaseSpanRepeats(spans.filter((span) => span.traceId === "trace-a")).size, 2);
    assert.equal(countDatabaseSpanRepeats(spans.filter((span) => span.traceId === "trace-b")).size, 2);
});