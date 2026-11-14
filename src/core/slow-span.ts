import Config from "../config";

export const DEFAULT_SLOW_SPAN_THRESHOLD_MS = Config.DEFAULT_SLOW_SPAN_THRESHOLD_MS;

export function parseSlowSpanThresholdMs(
    value: unknown,
    fallback = DEFAULT_SLOW_SPAN_THRESHOLD_MS,
): number {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) {
            return parsed;
        }
    }

    return fallback;
}

export function resolveSlowSpanThresholdMs(option?: number): number {
    if (option !== undefined) {
        return parseSlowSpanThresholdMs(option);
    }

    return parseSlowSpanThresholdMs(
        process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS,
    );
}

export function isSlowSpan(
    durationMs: unknown,
    thresholdMs = DEFAULT_SLOW_SPAN_THRESHOLD_MS,
): boolean {
    if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
        return false;
    }

    const threshold = parseSlowSpanThresholdMs(thresholdMs);
    return durationMs >= threshold;
}