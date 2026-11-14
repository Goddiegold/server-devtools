import assert from "node:assert/strict";
import { test } from "node:test";

import Config from "../src/config";
import {
    DEFAULT_SLOW_SPAN_THRESHOLD_MS,
    isSlowSpan,
    parseSlowSpanThresholdMs,
    resolveSlowSpanThresholdMs,
} from "../src/core/slow-span";

test("parseSlowSpanThresholdMs defaults to 500ms", () => {
    assert.equal(parseSlowSpanThresholdMs(undefined), DEFAULT_SLOW_SPAN_THRESHOLD_MS);
    assert.equal(parseSlowSpanThresholdMs(""), DEFAULT_SLOW_SPAN_THRESHOLD_MS);
    assert.equal(parseSlowSpanThresholdMs("not-a-number"), DEFAULT_SLOW_SPAN_THRESHOLD_MS);
    assert.equal(parseSlowSpanThresholdMs(-1), DEFAULT_SLOW_SPAN_THRESHOLD_MS);
});

test("parseSlowSpanThresholdMs accepts valid custom values", () => {
    assert.equal(parseSlowSpanThresholdMs(250), 250);
    assert.equal(parseSlowSpanThresholdMs("750"), 750);
    assert.equal(parseSlowSpanThresholdMs(0), 0);
});

test("isSlowSpan compares each span duration against the threshold", () => {
    assert.equal(isSlowSpan(499), false);
    assert.equal(isSlowSpan(500), true);
    assert.equal(isSlowSpan(1200), true);
    assert.equal(isSlowSpan(500, 1000), false);
    assert.equal(isSlowSpan(1000, 1000), true);
});

test("isSlowSpan ignores missing or invalid durations", () => {
    assert.equal(isSlowSpan(undefined), false);
    assert.equal(isSlowSpan(null), false);
    assert.equal(isSlowSpan(Number.NaN), false);
    assert.equal(isSlowSpan(Number.POSITIVE_INFINITY), false);
    assert.equal(isSlowSpan(-5), false);
});

test("isSlowSpan does not infer slowness from nested spans", () => {
    const parentDurationMs = 50;
    const childDurationMs = 900;

    assert.equal(isSlowSpan(parentDurationMs), false);
    assert.equal(isSlowSpan(childDurationMs), true);
});

test("resolveSlowSpanThresholdMs reads SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS", (t) => {
    const original = process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS;

    t.after(() => {
        if (original === undefined) {
            delete process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS;
        } else {
            process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS = original;
        }
    });

    delete process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS;
    assert.equal(resolveSlowSpanThresholdMs(), Config.DEFAULT_SLOW_SPAN_THRESHOLD_MS);

    process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS = "250";
    assert.equal(resolveSlowSpanThresholdMs(), 250);

    process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS = "invalid";
    assert.equal(resolveSlowSpanThresholdMs(), DEFAULT_SLOW_SPAN_THRESHOLD_MS);
});

test("resolveSlowSpanThresholdMs prefers SDK option over environment", (t) => {
    const original = process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS;

    t.after(() => {
        if (original === undefined) {
            delete process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS;
        } else {
            process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS = original;
        }
    });

    process.env.SERVER_DEVTOOLS_SLOW_SPAN_THRESHOLD_MS = "900";
    assert.equal(resolveSlowSpanThresholdMs(300), 300);
});