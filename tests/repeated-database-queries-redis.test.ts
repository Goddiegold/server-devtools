import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildRedisSpanRepeatStats,
    countDatabaseSpanRepeats,
    normalizeRedisCommandPattern,
    redisDatabaseGroupKey,
    summarizeRedisCommandRepeats,
} from "../src/core/repeated-database-queries";
import type { SpanForRepeatDetection } from "../src/core/repeated-database-queries";

function redisSpan(
    spanId: string,
    queryText: string,
    durationMs = 4,
    operation?: string,
): SpanForRepeatDetection {
    const command = operation ?? queryText.split(" ")[0]?.toUpperCase() ?? "REDIS";

    return {
        spanId,
        type: "database",
        durationMs,
        attributes: {
            "db.system.name": "redis",
            "db.operation.name": command,
            "db.query.text": queryText,
        },
    };
}

test("normalizes repeated GET commands with different keys", () => {
    const first = redisDatabaseGroupKey({
        "db.system.name": "redis",
        "db.query.text": "GET user:1",
    });
    const second = redisDatabaseGroupKey({
        "db.system.name": "redis",
        "db.query.text": "GET user:2",
    });

    assert.equal(first, second);
    assert.equal(first, "redis:GET ?");
    assert.doesNotMatch(first ?? "", /user:1|user:2/);
});

test("normalizes repeated HGET commands with different keys", () => {
    const first = redisDatabaseGroupKey({
        "db.system.name": "redis",
        "db.query.text": "HGET user:1 name",
    });
    const second = redisDatabaseGroupKey({
        "db.system.name": "redis",
        "db.query.text": "HGET user:2 name",
    });

    assert.equal(first, second);
    assert.equal(normalizeRedisCommandPattern("HGET", ["user:1", "name"]), "HGET ? name");
});

test("keeps GET and SET commands separate", () => {
    const getKey = redisDatabaseGroupKey({
        "db.system.name": "redis",
        "db.query.text": "GET user:1",
    });
    const setKey = redisDatabaseGroupKey({
        "db.system.name": "redis",
        "db.query.text": "SET user:1 value",
    });

    assert.notEqual(getKey, setKey);
});

test("summarizes repeated Redis commands with count and cumulative duration", () => {
    const spans = [
        redisSpan("r1", "GET user:1", 2),
        redisSpan("r2", "GET user:2", 5),
        redisSpan("r3", "GET user:3", 7),
        redisSpan("r4", "SET user:9 secret", 1),
    ];

    const summaries = summarizeRedisCommandRepeats(spans);
    const [getSummary] = summaries;

    assert.equal(summaries.length, 1);
    assert.equal(getSummary.command, "GET");
    assert.equal(getSummary.pattern, "GET ?");
    assert.equal(getSummary.count, 3);
    assert.equal(getSummary.totalDurationMs, 14);
});

test("mixed Redis commands only repeat within their own pattern", () => {
    const spans = [
        redisSpan("g1", "GET a:1", 1),
        redisSpan("g2", "GET a:2", 1),
        redisSpan("s1", "SET a:1 v1", 1),
        redisSpan("s2", "SET a:2 v2", 1),
        redisSpan("h1", "HGET a:1 name", 1),
        redisSpan("h2", "HGET a:2 name", 1),
    ];

    const repeats = countDatabaseSpanRepeats(spans);

    assert.equal(repeats.get("g1"), 2);
    assert.equal(repeats.get("s1"), 2);
    assert.equal(repeats.get("h1"), 2);
});

test("repeated Redis commands are isolated per request trace", () => {
    const traceASpans = [
        redisSpan("a1", "GET user:1", 1),
        redisSpan("a2", "GET user:2", 1),
    ];
    const traceBSpans = [
        redisSpan("b1", "GET user:1", 1),
    ];

    assert.equal(countDatabaseSpanRepeats(traceASpans).size, 2);
    assert.equal(countDatabaseSpanRepeats(traceBSpans).size, 0);
});

test("handles missing Redis query attributes gracefully", () => {
    assert.equal(redisDatabaseGroupKey({
        "db.system.name": "redis",
    }), undefined);

    assert.equal(redisDatabaseGroupKey({
        "db.system.name": "redis",
        "db.operation.name": "GET",
    }), "redis:GET");
});

test("buildRedisSpanRepeatStats never includes raw argument values", () => {
    const spans = [
        redisSpan("p1", "GET secret-token-123", 1),
        redisSpan("p2", "GET secret-token-456", 2),
    ];
    const stats = buildRedisSpanRepeatStats(spans);
    const spanStats = stats.get("p1");

    assert.ok(spanStats);
    assert.equal(spanStats.pattern, "GET ?");
    assert.doesNotMatch(JSON.stringify(spanStats), /secret-token/);
});