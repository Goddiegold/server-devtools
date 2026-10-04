// tests/exporter-pipeline.test.ts

import assert from 'node:assert/strict';

import { SpanKind } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import ServerDevToolsExporter from '../src/instrumentation/exporter';
import SQLiteStorage from '../src/storage/sqlite-storage';

async function run(): Promise<void> {
const storage = new SQLiteStorage(":memory:");


const exporter = new ServerDevToolsExporter(
  storage
);

const span = {
  spanContext() {
    return {
      traceId: 'trace-123',
      spanId: 'span-123',
      traceFlags: 1,
    };
  },

  parentSpanContext: undefined,

  kind: SpanKind.SERVER,
  name: 'GET',

  startTime: [100, 0],
  duration: [0, 500_000_000],

  attributes: {
    'http.request.method': 'GET',
    'url.path': '/hello',
  },

  status: {
    code: 0,
  },
} as unknown as ReadableSpan;

await new Promise<void>((resolve, reject) => exporter.export([span], (result) => {
  if (result.error) reject(result.error);
  else resolve();
}));

const trace = await storage.getTrace('trace-123');

assert.ok(trace);
assert.equal(trace.traceId, 'trace-123');
assert.equal(trace.rootSpanId, 'span-123');
assert.equal(trace.spans.length, 1);

await storage.close();

const failingExporter = new ServerDevToolsExporter({
  saveSpan: async () => { throw new Error("write failed"); },
} as unknown as SQLiteStorage);
const failure = await new Promise<Error>((resolve) => failingExporter.export([span], (result) => {
  assert.equal(result.code, 1);
  resolve(result.error!);
}));
assert.equal(failure.message, "write failed");

console.log('Exporter pipeline test passed');
}

void run();
