// tests/exporter-pipeline.test.ts

import assert from 'node:assert/strict';

import { SpanKind } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import  ServerDevToolsExporter  from '../src/instrumentation/exporter';
import  TraceAssembler from '../src/core/trace-assembler';
import  TraceStore from '../src/core/trace-store';

const assembler = new TraceAssembler();
const store = new TraceStore();

const exporter = new ServerDevToolsExporter(
  assembler,
  store,
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

exporter.export([span], () => {});

const trace = store.get('trace-123');

assert.ok(trace);
assert.equal(trace.traceId, 'trace-123');
assert.equal(trace.rootSpanId, 'span-123');
assert.equal(trace.spans.length, 1);

console.log('Exporter pipeline test passed');