import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { context, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

import { Instrumentation } from "../src/instrumentation/instrumentation";
import SQLiteStorage from "../src/storage/sqlite-storage";
import type { IDevToolsSpan } from "../src/types/span";

const redisUrl = process.env.REDIS_TEST_URL;
const testPrefix = `server-devtools-test:${randomUUID()}:`;
const keys = new Set<string>();
const tracer = trace.getTracer("server-devtools-ioredis-test");

let storage: SQLiteStorage | undefined;
let instrumentation: Instrumentation | undefined;
let redis: any;

function key(name: string): string {
  const value = `${testPrefix}${name}`;
  keys.add(value);
  return value;
}

async function flushInstrumentation(): Promise<void> {
  const sdk = (instrumentation as unknown as {
    oTelSdk: { forceFlush: () => Promise<void> };
  }).oTelSdk;

  await sdk.forceFlush();
}

async function runRequest<T>(
  name: string,
  operation: () => Promise<T>,
): Promise<{ traceId: string; result: T }> {
  const requestSpan = tracer.startSpan(name, { kind: SpanKind.SERVER });
  const traceId = requestSpan.spanContext().traceId;

  const result = await context.with(
    trace.setSpan(context.active(), requestSpan),
    async () => {
      try {
        return await operation();
      } finally {
        requestSpan.end();
        await flushInstrumentation();
      }
    },
  );

  return { traceId, result };
}

async function redisSpans(traceId: string): Promise<IDevToolsSpan[]> {
  return (await storage!
    .getSpansByTraceId(traceId))
    .filter((span) => span.attributes["db.system.name"] === "redis");
}

function operationName(span: IDevToolsSpan): string {
  return String(span.attributes["db.operation.name"] ?? span.name).toUpperCase();
}

function spansForOperation(spans: IDevToolsSpan[], operation: string): IDevToolsSpan[] {
  return spans.filter((span) => operationName(span) === operation);
}

function assertSuccessfulCommand(span: IDevToolsSpan, operation: string): void {
  assert.equal(span.type, "database");
  assert.equal(operationName(span), operation);
  assert.equal(span.status.code, SpanStatusCode.OK);
  assert.ok(span.durationMs >= 0);
}

before(async () => {
  if (!redisUrl) return;

  storage = new SQLiteStorage(":memory:");
  instrumentation = new Instrumentation(storage);
  await instrumentation.start();

  const Redis = (await import("ioredis")).default as unknown as new (url: string) => any;
  redis = new Redis(redisUrl);
  await redis.ping();
});

after(async () => {
  if (!redis) return;

  const cleanupClient = redis.duplicate();
  if (keys.size > 0) {
    await cleanupClient.del(...keys);
  }
  await cleanupClient.quit();
  await redis.quit();
  await instrumentation?.shutdown();
});

test(
  "captures SET and GET database spans with request linkage and durations",
  { skip: !redisUrl ? "REDIS_TEST_URL is not configured" : undefined },
  async () => {
    const setKey = key("set-get");
    const { traceId, result } = await runRequest("redis set/get request", async () => {
      const setResult = await redis.set(setKey, "value");
      const getResult = await redis.get(setKey);
      return { setResult, getResult };
    });

    assert.deepEqual(result, { setResult: "OK", getResult: "value" });

    const spans = await redisSpans(traceId);
    const requestSpanId = (await storage!.getSpansByTraceId(traceId)).find((span) => span.parentSpanId === undefined)?.spanId;
    assert.equal(spans.length, 2);
    for (const span of spans) {
      assert.equal(span.parentSpanId, requestSpanId);
      assert.equal(span.traceId, traceId);
      assert.ok(span.durationMs >= 0);
    }
    assertSuccessfulCommand(spansForOperation(spans, "SET")[0]!, "SET");
    assertSuccessfulCommand(spansForOperation(spans, "GET")[0]!, "GET");
  },
);

test(
  "preserves successful missing-key results",
  { skip: !redisUrl ? "REDIS_TEST_URL is not configured" : undefined },
  async () => {
    const missingKey = key("missing");
    const { traceId, result } = await runRequest("redis missing key request", () => redis.get(missingKey));

    assert.equal(result, null);
    const [span] = await redisSpans(traceId);
    assert.ok(span);
    assertSuccessfulCommand(span, "GET");
  },
);

test(
  "persists failed command and WRONGTYPE status and exception details",
  { skip: !redisUrl ? "REDIS_TEST_URL is not configured" : undefined },
  async () => {
    const wrongTypeKey = key("wrong-type");
    await redis.set(wrongTypeKey, "string-value");

    const { traceId } = await runRequest("redis failure request", async () => {
      await assert.rejects(
        () => redis.call("SERVERDEVTOOLS_INVALID_COMMAND"),
        /unknown command/i,
      );
      await assert.rejects(
        () => redis.lpush(wrongTypeKey, "value"),
        /WRONGTYPE/i,
      );
    });

    const spans = await redisSpans(traceId);
    assert.equal(spans.length, 2);
    for (const span of spans) {
      assert.equal(span.type, "database");
      assert.equal(span.status.code, SpanStatusCode.ERROR);
      assert.ok(span.status.message);
      assert.ok(span.error);
      assert.ok(span.error.message);
      assert.ok(span.error.stack);
    }
    assert.match(spans[0]!.error!.message!, /unknown command/i);
    assert.match(spans[1]!.error!.message!, /WRONGTYPE/i);
  },
);

test(
  "captures pipeline and transaction commands once with request context",
  { skip: !redisUrl ? "REDIS_TEST_URL is not configured" : undefined },
  async () => {
    const pipelineKey = key("pipeline");
    const transactionKey = key("transaction");
    const { traceId } = await runRequest("redis pipeline transaction request", async () => {
      await redis.pipeline().set(pipelineKey, "pipeline-value").get(pipelineKey).exec();
      await redis.multi().set(transactionKey, "transaction-value").get(transactionKey).exec();
    });

    const spans = await redisSpans(traceId);
    const pipelineSpans = spans.filter((span) => operationName(span).startsWith("PIPELINE "));
    const transactionSpans = spans.filter((span) => operationName(span).startsWith("MULTI "));

    assert.equal(pipelineSpans.length, 2);
    assert.equal(transactionSpans.length, 2);
    assert.deepEqual(
      pipelineSpans.map(operationName).sort(),
      ["PIPELINE GET", "PIPELINE SET"],
    );
    assert.deepEqual(
      transactionSpans.map(operationName).sort(),
      ["MULTI GET", "MULTI SET"],
    );
    const rootSpanId = (await storage!.getSpansByTraceId(traceId)).find((root) => !root.parentSpanId)?.spanId;
    assert.ok(spans.every((span) => span.parentSpanId === rootSpanId));
  },
);

test(
  "keeps concurrent Redis spans attached to their own request traces",
  { skip: !redisUrl ? "REDIS_TEST_URL is not configured" : undefined },
  async () => {
    const firstKey = key("concurrent-a");
    const secondKey = key("concurrent-b");
    const requests = await Promise.all([
      runRequest("redis concurrent request A", async () => {
        await redis.set(firstKey, "A");
        return redis.get(firstKey);
      }),
      runRequest("redis concurrent request B", async () => {
        await redis.set(secondKey, "B");
        return redis.get(secondKey);
      }),
    ]);

    assert.deepEqual(requests.map((request) => request.result).sort(), ["A", "B"]);
    const traces = await Promise.all(requests.map((request) => storage!.getSpansByTraceId(request.traceId)));
    assert.notEqual(requests[0]!.traceId, requests[1]!.traceId);
    assert.equal(traces[0]!.filter((span) => span.type === "database").length, 2);
    assert.equal(traces[1]!.filter((span) => span.type === "database").length, 2);
    for (const traceSpans of traces) {
      const rootSpanId = traceSpans.find((span) => !span.parentSpanId)?.spanId;
      assert.ok(rootSpanId);
      assert.ok(traceSpans.filter((span) => span.type === "database").every((span) => span.parentSpanId === rootSpanId));
    }
  },
);
