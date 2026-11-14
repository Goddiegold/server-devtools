import assert from "node:assert/strict";
import { test } from "node:test";

import {
    countDatabaseSpanRepeats,
    mongodbDatabaseGroupKey,
} from "../src/core/repeated-database-queries";
import type { IDevToolsSpan } from "../src/types";

function mongoSpan(
    spanId: string,
    traceId: string,
    attributes: Record<string, unknown>,
): IDevToolsSpan {
    return {
        traceId,
        spanId,
        type: "database",
        name: String(attributes["db.operation.name"] ?? "find"),
        startedAt: 1,
        durationMs: 5,
        attributes: {
            "db.system.name": "mongodb",
            ...attributes,
        },
        status: { code: 0 },
    };
}

test("mongodb group key normalizes filter shape without parameter values", () => {
    const first = mongodbDatabaseGroupKey({
        "db.system.name": "mongodb",
        "db.operation.name": "find",
        "db.collection.name": "users",
        "db.query.text": JSON.stringify({ _id: "abc", active: true }),
    });
    const second = mongodbDatabaseGroupKey({
        "db.system.name": "mongodb",
        "db.operation.name": "find",
        "db.collection.name": "users",
        "db.query.text": JSON.stringify({ active: true, _id: "xyz" }),
    });

    assert.equal(first, second);
    assert.match(first ?? "", /find@users:/);
    assert.doesNotMatch(first ?? "", /abc|xyz/);
});

test("mongodb grouping falls back to operation and collection when filter is unavailable", () => {
    const key = mongodbDatabaseGroupKey({
        "db.system.name": "mongodb",
        "db.operation.name": "find",
        "db.collection.name": "users",
    });

    assert.equal(key, "mongodb:find@users");
});

test("mongodb grouping treats different operations separately", () => {
    const traceId = "trace-mongo";
    const spans = [
        mongoSpan("mongo-find-1", traceId, {
            "db.operation.name": "find",
            "db.collection.name": "users",
            "db.query.text": JSON.stringify({ active: true }),
        }),
        mongoSpan("mongo-find-2", traceId, {
            "db.operation.name": "find",
            "db.collection.name": "users",
            "db.query.text": JSON.stringify({ active: false }),
        }),
        mongoSpan("mongo-update", traceId, {
            "db.operation.name": "update",
            "db.collection.name": "users",
            "db.query.text": JSON.stringify({ active: true }),
        }),
    ];

    const repeats = countDatabaseSpanRepeats(spans);

    assert.equal(repeats.get("mongo-find-1"), 2);
    assert.equal(repeats.get("mongo-find-2"), 2);
    assert.equal(repeats.has("mongo-update"), false);
});

test("mongodb repeats are isolated per request trace", () => {
    const spans = [
        mongoSpan("mongo-a-1", "trace-a", {
            "db.operation.name": "find",
            "db.collection.name": "users",
        }),
        mongoSpan("mongo-a-2", "trace-a", {
            "db.operation.name": "find",
            "db.collection.name": "users",
        }),
        mongoSpan("mongo-b-1", "trace-b", {
            "db.operation.name": "find",
            "db.collection.name": "users",
        }),
    ];

    assert.equal(countDatabaseSpanRepeats(spans.filter((span) => span.traceId === "trace-a")).size, 2);
    assert.equal(countDatabaseSpanRepeats(spans.filter((span) => span.traceId === "trace-b")).size, 0);
});