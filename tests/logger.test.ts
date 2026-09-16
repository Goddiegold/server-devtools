import assert from "node:assert/strict";

import { debugLog } from "../src/utils/logger";

const originalDebug = console.debug;
const originalDebugSetting = process.env.SERVER_DEVTOOLS_DEBUG;
const calls: unknown[][] = [];

console.debug = (...args: unknown[]) => {
    calls.push(args);
};

try {
    delete process.env.SERVER_DEVTOOLS_DEBUG;
    debugLog("hidden", { traceId: "trace-1" });
    assert.equal(calls.length, 0);

    process.env.SERVER_DEVTOOLS_DEBUG = "1";
    debugLog("also hidden");
    assert.equal(calls.length, 0);

    process.env.SERVER_DEVTOOLS_DEBUG = "true";
    debugLog("capture started", { traceId: "trace-1" });

    assert.deepEqual(calls, [
        ["[ServerDevTools] capture started", { traceId: "trace-1" }],
    ]);
} finally {
    console.debug = originalDebug;
    if (originalDebugSetting === undefined) {
        delete process.env.SERVER_DEVTOOLS_DEBUG;
    } else {
        process.env.SERVER_DEVTOOLS_DEBUG = originalDebugSetting;
    }
}

console.log("logger tests passed");
