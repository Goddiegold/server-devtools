import { mysqlDatabaseGroupKey } from "./mysql";
import { mongodbDatabaseGroupKey } from "./mongodb";
import { postgresDatabaseGroupKey } from "./postgres";
import {
    formatRedisCommandPattern,
    redisDatabaseGroupKey,
} from "./redis";

export { mysqlDatabaseGroupKey } from "./mysql";
export { mongodbDatabaseGroupKey } from "./mongodb";
export { normalizeSqlTemplate } from "./sql-template";
export { postgresDatabaseGroupKey } from "./postgres";
export {
    formatRedisCommandPattern,
    normalizeRedisCommandPattern,
    parseRedisCommandText,
    redisDatabaseGroupKey,
} from "./redis";

export interface DatabaseSpanForRepeatDetection {
    spanId: string;
    type: string;
    attributes: Record<string, unknown>;
}

export interface SpanForRepeatDetection extends DatabaseSpanForRepeatDetection {
    durationMs?: number;
}

export interface RedisCommandRepeatSummary {
    groupKey: string;
    command: string;
    pattern: string;
    count: number;
    totalDurationMs: number;
}

export interface RedisSpanRepeatStats {
    groupKey: string;
    command: string;
    pattern: string;
    count: number;
    totalDurationMs: number;
}

export function databaseSpanGroupKey(
    span: DatabaseSpanForRepeatDetection,
): string | undefined {
    if (span.type !== "database") {
        return undefined;
    }

    return (
        postgresDatabaseGroupKey(span.attributes)
        ?? mysqlDatabaseGroupKey(span.attributes)
        ?? mongodbDatabaseGroupKey(span.attributes)
        ?? redisDatabaseGroupKey(span.attributes)
    );
}

export function countDatabaseSpanRepeats(
    spans: DatabaseSpanForRepeatDetection[],
): Map<string, number> {
    const groupCounts = new Map<string, number>();
    const spanGroups = new Map<string, string>();

    for (const span of spans) {
        const groupKey = databaseSpanGroupKey(span);
        if (!groupKey) {
            continue;
        }

        groupCounts.set(groupKey, (groupCounts.get(groupKey) ?? 0) + 1);
        spanGroups.set(span.spanId, groupKey);
    }

    const repeats = new Map<string, number>();

    for (const [spanId, groupKey] of spanGroups) {
        const count = groupCounts.get(groupKey) ?? 1;
        if (count >= 2) {
            repeats.set(spanId, count);
        }
    }

    return repeats;
}

function isRedisSpan(span: DatabaseSpanForRepeatDetection): boolean {
    return span.type === "database"
        && span.attributes["db.system.name"] === "redis";
}

function redisCommandName(span: DatabaseSpanForRepeatDetection): string {
    const operation = span.attributes["db.operation.name"];
    if (typeof operation === "string" && operation.trim() !== "") {
        return operation.trim().toUpperCase();
    }

    const groupKey = redisDatabaseGroupKey(span.attributes);
    if (!groupKey) {
        return "UNKNOWN";
    }

    return formatRedisCommandPattern(groupKey).split(" ")[0] ?? "UNKNOWN";
}

export function summarizeRedisCommandRepeats(
    spans: SpanForRepeatDetection[],
): RedisCommandRepeatSummary[] {
    const groups = new Map<string, {
        command: string;
        pattern: string;
        count: number;
        totalDurationMs: number;
    }>();

    for (const span of spans) {
        if (!isRedisSpan(span)) {
            continue;
        }

        const groupKey = redisDatabaseGroupKey(span.attributes);
        if (!groupKey) {
            continue;
        }

        const durationMs = typeof span.durationMs === "number"
            && Number.isFinite(span.durationMs)
            ? Math.max(0, span.durationMs)
            : 0;
        const pattern = formatRedisCommandPattern(groupKey);
        const existing = groups.get(groupKey);

        if (existing) {
            existing.count += 1;
            existing.totalDurationMs += durationMs;
            continue;
        }

        groups.set(groupKey, {
            command: redisCommandName(span),
            pattern,
            count: 1,
            totalDurationMs: durationMs,
        });
    }

    return [...groups.entries()]
        .filter(([, group]) => group.count >= 2)
        .map(([groupKey, group]) => ({
            groupKey,
            command: group.command,
            pattern: group.pattern,
            count: group.count,
            totalDurationMs: group.totalDurationMs,
        }))
        .sort((left, right) => right.count - left.count);
}

export function buildRedisSpanRepeatStats(
    spans: SpanForRepeatDetection[],
): Map<string, RedisSpanRepeatStats> {
    const summaries = new Map(
        summarizeRedisCommandRepeats(spans).map((summary) => [summary.groupKey, summary]),
    );
    const stats = new Map<string, RedisSpanRepeatStats>();

    for (const span of spans) {
        if (!isRedisSpan(span)) {
            continue;
        }

        const groupKey = redisDatabaseGroupKey(span.attributes);
        const summary = groupKey ? summaries.get(groupKey) : undefined;
        if (!summary) {
            continue;
        }

        stats.set(span.spanId, {
            groupKey: summary.groupKey,
            command: summary.command,
            pattern: summary.pattern,
            count: summary.count,
            totalDurationMs: summary.totalDurationMs,
        });
    }

    return stats;
}