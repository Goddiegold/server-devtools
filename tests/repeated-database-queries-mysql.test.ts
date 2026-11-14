import assert from "node:assert/strict";
import { test } from "node:test";

import {
    countDatabaseSpanRepeats,
    mysqlDatabaseGroupKey,
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
            "db.system.name": "mysql",
            "db.namespace": "server_devtools_test",
            "db.query.text": query,
        },
        status: { code: 0 },
    };
}

test("mysql group key normalizes question-mark templates", () => {
    const first = mysqlDatabaseGroupKey({
        "db.system.name": "mysql",
        "db.query.text": "SELECT * FROM users WHERE id = ?",
    });
    const second = mysqlDatabaseGroupKey({
        "db.system.name": "mysql2",
        "db.query.text": "SELECT  *  FROM users  WHERE id = ?",
    });

    assert.equal(first, second);
});

test("mysql grouping treats literal parameter variations as the same query", () => {
    const traceId = "trace-mysql";
    const spans = [
        databaseSpan("mysql-1", traceId, "SELECT * FROM users WHERE id = 1"),
        databaseSpan("mysql-2", traceId, "SELECT * FROM users WHERE id = 42"),
        databaseSpan("mysql-3", traceId, "DELETE FROM users WHERE id = ?"),
    ];

    const repeats = countDatabaseSpanRepeats(spans);

    assert.equal(repeats.get("mysql-1"), 2);
    assert.equal(repeats.get("mysql-2"), 2);
    assert.equal(repeats.has("mysql-3"), false);
});

test("mysql repeats are isolated per request trace", () => {
    const spans = [
        databaseSpan("mysql-a-1", "trace-a", "SELECT * FROM users WHERE id = ?"),
        databaseSpan("mysql-a-2", "trace-a", "SELECT * FROM users WHERE id = ?"),
        databaseSpan("mysql-b-1", "trace-b", "SELECT * FROM users WHERE id = ?"),
    ];

    assert.equal(countDatabaseSpanRepeats(spans.filter((span) => span.traceId === "trace-a")).get("mysql-a-1"), 2);
    assert.equal(countDatabaseSpanRepeats(spans.filter((span) => span.traceId === "trace-b")).size, 0);
});