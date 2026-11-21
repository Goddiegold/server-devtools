import assert from "node:assert/strict";
import { test } from "node:test";

import {
    countDatabaseSpanRepeats,
    summarizeDatabaseQueryRepeats,
} from "../src/core/repeated-database-queries";
import type { IDevToolsSpan } from "../src/types";

function dbSpan(
    spanId: string,
    traceId: string,
    system: string,
    attributes: Record<string, unknown>,
): IDevToolsSpan {
    return {
        traceId,
        spanId,
        type: "database",
        name: "database",
        startedAt: 1,
        durationMs: 3,
        attributes: {
            "db.system.name": system,
            ...attributes,
        },
        status: { code: 0 },
    };
}

test("repeated-query detection stays isolated per request trace across database systems", () => {
    const traceA = "trace-a";
    const traceB = "trace-b";
    const postgresTemplate = "SELECT * FROM users WHERE id = $1";
    const spans = [
        dbSpan("pg-a-1", traceA, "postgresql", {
            "db.operation.name": "SELECT",
            "db.query.text": postgresTemplate,
        }),
        dbSpan("pg-a-2", traceA, "postgresql", {
            "db.operation.name": "SELECT",
            "db.query.text": "SELECT * FROM users WHERE id = $2",
        }),
        dbSpan("pg-b-1", traceB, "postgresql", {
            "db.operation.name": "SELECT",
            "db.query.text": postgresTemplate,
        }),
        dbSpan("mysql-a", traceA, "mysql", {
            "db.operation.name": "SELECT",
            "db.query.text": "SELECT * FROM orders WHERE id = ?",
        }),
    ];

    const traceARepeats = countDatabaseSpanRepeats(spans.filter((span) => span.traceId === traceA));
    assert.equal(traceARepeats.get("pg-a-1"), 2);
    assert.equal(traceARepeats.get("pg-a-2"), 2);
    assert.equal(traceARepeats.has("mysql-a"), false);
    assert.equal(countDatabaseSpanRepeats(spans.filter((span) => span.traceId === traceB)).size, 0);

    const summaries = summarizeDatabaseQueryRepeats(spans.filter((span) => span.traceId === traceA));
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.count, 2);
    assert.match(summaries[0]?.system ?? "", /postgres/i);
});

test("unknown database systems do not participate in relational repeat summaries", () => {
    const spans = [
        dbSpan("unknown-1", "trace-unknown", "cassandra", {
            "db.operation.name": "read",
            "db.query.text": "SELECT * FROM events",
        }),
        dbSpan("unknown-2", "trace-unknown", "cassandra", {
            "db.operation.name": "read",
            "db.query.text": "SELECT * FROM events",
        }),
    ];

    assert.equal(countDatabaseSpanRepeats(spans).size, 0);
    assert.deepEqual(summarizeDatabaseQueryRepeats(spans), []);
});