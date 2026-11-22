import assert from "node:assert/strict";
import { test } from "node:test";
import { lastValueFrom, throwError } from "rxjs";
import { SpanStatusCode, trace } from "@opentelemetry/api";

import ServerDevToolsNestInterceptor from "../src/integrations/nestjs/server-devtools-nest.interceptor";

test("Nest interceptor records handler errors on the active span", async () => {
    const interceptor = new ServerDevToolsNestInterceptor();

    let recordedError: unknown;
    let recordedStatus: unknown;

    const fakeSpan = {
        recordException(error: unknown) {
            recordedError = error;
        },

        setStatus(status: unknown) {
            recordedStatus = status;
        },
    };

    const originalGetActiveSpan = trace.getActiveSpan;

    (trace as { getActiveSpan: typeof trace.getActiveSpan }).getActiveSpan = () =>
        fakeSpan as ReturnType<typeof trace.getActiveSpan>;

    const error = new Error("Something went wrong");

    const next = {
        handle() {
            return throwError(() => error);
        },
    };

    try {
        await assert.rejects(
            () =>
                lastValueFrom(
                    interceptor.intercept({} as never, next as never),
                ),
            error,
        );

        assert.equal(recordedError, error);
        assert.deepEqual(recordedStatus, {
            code: SpanStatusCode.ERROR,
            message: "Something went wrong",
        });
    } finally {
        (trace as { getActiveSpan: typeof trace.getActiveSpan }).getActiveSpan =
            originalGetActiveSpan;
    }
});