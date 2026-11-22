import assert from "node:assert/strict";
import { after, before, test } from "node:test";

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

import ExecutionTreeBuilder from "../src/core/execution-tree-builder";
import ServerDevToolsExporter from "../src/instrumentation/exporter";
import ServerDevTools, { Track } from "../src/index";
import SQLiteStorage from "../src/storage/sqlite-storage";
import Config from "../src/config";
import RedactionService from "../src/security/redaction.service";
import type { IDevToolsSpan, IExecutionNode } from "../src/types";

function findNode(nodes: IExecutionNode[], spanId: string): IExecutionNode | undefined {
    for (const node of nodes) {
        if (node.span.spanId === spanId) {
            return node;
        }

        const child = findNode(node.children, spanId);
        if (child) {
            return child;
        }
    }

    return undefined;
}

function createRedactionService(): RedactionService {
    return new RedactionService(true, Config.DEFAULT_SENSITIVE_HEADER_NAMES);
}

let storage: SQLiteStorage | undefined;
let tracerProvider: NodeTracerProvider | undefined;

const tracer = trace.getTracer("server-devtools-track-test");

function spanByName(spans: IDevToolsSpan[], name: string): IDevToolsSpan | undefined {
    return spans.find((span) => span.name === name);
}

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

test("ServerDevTools.Track is the track decorator", () => {
    assert.equal(ServerDevTools.Track, Track);
});

test("tracked synchronous method is a child of the active span and preserves return values", async () => {
    class PaymentService {
        @Track("payment-processing")
        process(amount: number) {
            return amount * 2;
        }
    }

    const service = new PaymentService();
    const requestSpan = tracer.startSpan("GET /checkout", { kind: SpanKind.SERVER });

    const result = await context.with(
        trace.setSpan(context.active(), requestSpan),
        async () => {
            const value = service.process(21);
            requestSpan.end();
            return value;
        },
    );

    assert.equal(result, 42);

    const traceId = requestSpan.spanContext().traceId;
    const spans = storage!.getSpansByTraceId(traceId);
    const request = spanByName(spans, "GET /checkout");
    const payment = spanByName(spans, "payment-processing");

    assert.ok(request);
    assert.ok(payment);
    assert.equal(payment.type, "custom");
    assert.equal(payment.parentSpanId, request!.spanId);
    assert.equal(payment.attributes["server-devtools.type"], "custom");
    assert.equal(payment.status.code, SpanStatusCode.OK);
});

test("nested tracked spans build a parent-child execution tree", async () => {
    class CheckoutService {
        @Track("payment-processing")
        charge() {
            return this.validate();
        }

        @Track("validate-payment")
        validate() {
            return "ok";
        }
    }

    const service = new CheckoutService();
    const requestSpan = tracer.startSpan("POST /pay", { kind: SpanKind.SERVER });

    await context.with(trace.setSpan(context.active(), requestSpan), async () => {
        assert.equal(service.charge(), "ok");
        requestSpan.end();
    });

    const traceId = requestSpan.spanContext().traceId;
    const traceRecord = storage!.getTrace(traceId);
    assert.ok(traceRecord);

    const tree = new ExecutionTreeBuilder().build(traceRecord);
    const payment = spanByName(traceRecord.spans, "payment-processing");
    const validate = spanByName(traceRecord.spans, "validate-payment");

    assert.ok(payment);
    assert.ok(validate);
    assert.equal(validate!.parentSpanId, payment!.spanId);

    const paymentNode = findNode(tree, payment!.spanId);

    assert.ok(paymentNode);
    assert.equal(
        paymentNode.children.some((child) => child.span.spanId === validate!.spanId),
        true,
    );
});

test("tracked asynchronous method records errors and rethrows", async () => {
    class PaymentService {
        @Track("payment-processing")
        async fail() {
            await Promise.resolve();
            throw new Error("charge declined");
        }
    }

    const service = new PaymentService();
    const requestSpan = tracer.startSpan("POST /fail", { kind: SpanKind.SERVER });

    await context.with(trace.setSpan(context.active(), requestSpan), async () => {
        await assert.rejects(() => service.fail(), /charge declined/);
        requestSpan.end();
    });

    const payment = spanByName(
        storage!.getSpansByTraceId(requestSpan.spanContext().traceId),
        "payment-processing",
    );

    assert.ok(payment);
    assert.equal(payment.status.code, SpanStatusCode.ERROR);
    assert.equal(payment.error?.message, "charge declined");
});

test("tracked method preserves this binding", async () => {
    class PaymentService {
        multiplier = 3;

        @Track("payment-processing")
        process(value: number) {
            return value * this.multiplier;
        }
    }

    const service = new PaymentService();
    const requestSpan = tracer.startSpan("GET /this", { kind: SpanKind.SERVER });

    const result = await context.with(
        trace.setSpan(context.active(), requestSpan),
        async () => {
            const value = service.process(4);
            requestSpan.end();
            return value;
        },
    );

    assert.equal(result, 12);
});