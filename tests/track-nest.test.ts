import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import "reflect-metadata";

import { Controller, Get } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import {
    SpanKind,
    SpanStatusCode,
    context,
    trace,
} from "@opentelemetry/api";
import {
    NodeTracerProvider,
    SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";

import ServerDevToolsExporter from "../src/instrumentation/exporter";
import { Track } from "../src/track";
import SQLiteStorage from "../src/storage/sqlite-storage";
import Config from "../src/config";
import RedactionService from "../src/security/redaction.service";
import type { IDevToolsSpan } from "../src/types";

function createRedactionService(): RedactionService {
    return new RedactionService(true, Config.DEFAULT_SENSITIVE_HEADER_NAMES);
}

let storage: SQLiteStorage | undefined;
let tracerProvider: NodeTracerProvider | undefined;

const tracer = trace.getTracer("server-devtools-track-nest-test");

before(() => {
    storage = new SQLiteStorage(":memory:");
    const exporter = new ServerDevToolsExporter(storage, createRedactionService());
    tracerProvider = new NodeTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    tracerProvider.register();
});

after(async () => {
    await tracerProvider?.shutdown();
    storage?.close();
});

function spanByName(spans: IDevToolsSpan[], name: string): IDevToolsSpan | undefined {
    return spans.find((span) => span.name === name);
}

test("Track on a Nest HTTP route handler is a no-op", () => {
    @Controller("payments")
    class PaymentsController {
        @Track("payment-processing")
        @Get("checkout")
        checkout() {
            return { ok: true };
        }
    }

    const handler = PaymentsController.prototype.checkout;

    assert.equal(Reflect.getMetadata("path", handler), "checkout");
    assert.deepEqual(handler.call({}), { ok: true });
});

test("Track on a Nest service wraps the method with a short-lived custom span", async () => {
    @Injectable()
    class PaymentService {
        @Track("payment-processing")
        async checkout() {
            await Promise.resolve();
            return "done";
        }
    }

    const service = new PaymentService();
    const requestSpan = tracer.startSpan("GET /pay", { kind: SpanKind.SERVER });

    const result = await context.with(
        trace.setSpan(context.active(), requestSpan),
        async () => {
            const value = await service.checkout();
            requestSpan.end();
            return value;
        },
    );

    assert.equal(result, "done");

    const payment = spanByName(
        storage!.getSpansByTraceId(requestSpan.spanContext().traceId),
        "payment-processing",
    );

    assert.ok(payment);
    assert.equal(payment.type, "custom");
    assert.equal(payment.status.code, SpanStatusCode.OK);
});

test("nested work inside a tracked service method is a child of the custom span", async () => {
    @Injectable()
    class PaymentService {
        @Track("payment-processing")
        async checkout() {
            trace.getTracer("test-db").startActiveSpan("db.charge", (span) => {
                span.end();
            });
            return { ok: true };
        }
    }

    const service = new PaymentService();
    const requestSpan = tracer.startSpan("GET /payments", { kind: SpanKind.SERVER });

    await context.with(trace.setSpan(context.active(), requestSpan), async () => {
        assert.deepEqual(await service.checkout(), { ok: true });
        requestSpan.end();
    });

    const spans = storage!.getSpansByTraceId(requestSpan.spanContext().traceId);
    const custom = spanByName(spans, "payment-processing");
    const db = spanByName(spans, "db.charge");

    assert.ok(custom);
    assert.ok(db);
    assert.equal(custom.parentSpanId, requestSpan.spanContext().spanId);
    assert.equal(db.parentSpanId, custom.spanId);
});