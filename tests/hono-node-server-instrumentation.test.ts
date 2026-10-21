import assert from "node:assert/strict";
import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { test } from "node:test";

import { HonoNodeServerInstrumentation } from "../src/instrumentation/hono-node-server";

test("Hono node-server instrumentation wraps the fetch callback once and can be disabled", async () => {
    const debugCalls: unknown[][] = [];
    const originalDebug = console.debug;
    const previousDebug = process.env.SERVER_DEVTOOLS_DEBUG;
    const contextManager = new AsyncLocalStorageContextManager().enable();
    context.setGlobalContextManager(contextManager);
    process.env.SERVER_DEVTOOLS_DEBUG = "true";
    console.debug = (...args: unknown[]) => {
        debugCalls.push(args);
    };

    const listenerThis = { listener: true };
    const callbackThis = { callback: true };
    const callbackArgs = [new Request("http://localhost/hello"), { incoming: true }];
    let originalListenerCalls = 0;
    let seenFetch: ((...args: unknown[]) => unknown) | undefined;
    let seenThis: unknown;
    let seenArgs: unknown[] | undefined;

    const originalGetRequestListener = function (this: unknown, fetchCallback: (...args: unknown[]) => unknown, option: string) {
        originalListenerCalls += 1;
        seenFetch = fetchCallback;
        return { option, listenerThis: this };
    };
    const moduleExports = {
        getRequestListener: originalGetRequestListener,
    };

    const instrumentation = new HonoNodeServerInstrumentation();
    const definition = instrumentation.getModuleDefinitions()[0];
    assert.ok(definition.patch);
    assert.ok(definition.unpatch);

    try {
        definition.patch(moduleExports);
        const wrappedListener = moduleExports.getRequestListener;
        definition.patch(moduleExports);
        assert.equal(moduleExports.getRequestListener, wrappedListener);

        const listenerResult = moduleExports.getRequestListener.call(
            listenerThis,
            function (this: unknown, ...args: unknown[]) {
                seenThis = this;
                seenArgs = args;
                return "fetch-result";
            },
            "option-value",
        );

        assert.deepEqual(listenerResult, {
            option: "option-value",
            listenerThis,
        });
        assert.equal(originalListenerCalls, 1);
        assert.ok(seenFetch);

        const span = trace.wrapSpanContext({
            traceId: "1".repeat(32),
            spanId: "2".repeat(16),
            traceFlags: 1,
        });
        const result = await context.with(trace.setSpan(context.active(), span), () =>
            seenFetch!.apply(callbackThis, callbackArgs),
        );

        assert.equal(result, "fetch-result");
        assert.equal(seenThis, callbackThis);
        assert.deepEqual(seenArgs, callbackArgs);
        assert.equal(debugCalls.length, 1);
        assert.deepEqual(debugCalls[0], [
            "[ServerDevTools] Hono getRequestListener callback reached",
            { hasValidSpanContext: true },
        ]);

        const callbackError = new Error("callback failed");
        const errorListener = moduleExports.getRequestListener(
            () => {
                throw callbackError;
            },
            "error-option",
        );
        assert.throws(() => seenFetch!.call(callbackThis), (error: unknown) => error === callbackError);
        assert.equal(originalListenerCalls, 2);
        span.end();

        definition.unpatch(moduleExports);
        assert.equal(moduleExports.getRequestListener, originalGetRequestListener);
    } finally {
        console.debug = originalDebug;
        if (previousDebug === undefined) {
            delete process.env.SERVER_DEVTOOLS_DEBUG;
        } else {
            process.env.SERVER_DEVTOOLS_DEBUG = previousDebug;
        }
        contextManager.disable();
    }
});
