// tests/span-mapper.test.ts

import assert from 'node:assert/strict';

import { SpanKind } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';

import SpanMapper from '../src/instrumentation/span-mapper';

const span = {
  spanContext() {
    return {
      traceId: 'trace-123', 
      spanId: 'span-123',
    };
  },

  parentSpanContext: {
    spanId: 'parent-123',
  },

  kind: SpanKind.SERVER,

  name: 'GET',

  startTime: [100, 500_000_000],

  duration: [0, 250_000_000],

  attributes: {
    'http.request.method': 'GET',
    'url.path': '/hello',
  },

  status: {
    code: 0,
  },
} as unknown as ReadableSpan;

const mapper = new SpanMapper();

const result = mapper.map(span);

assert.equal(result.traceId, 'trace-123');
assert.equal(result.spanId, 'span-123');
assert.equal(result.parentSpanId, 'parent-123');

assert.equal(result.type, 'http.server');

assert.equal(result.name, 'GET');

assert.equal(result.startedAt, 100500);
assert.equal(result.durationMs, 250);

assert.deepEqual(result.attributes, {
  'http.request.method': 'GET',
  'url.path': '/hello',
});

console.log('SpanMapper test passed');