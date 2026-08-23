// tests/trace-assembler.test.ts

import assert from 'node:assert/strict';

import type { IDevToolsSpan } from '../src/types';
import TraceAssembler from '../src/core/trace-assembler';

const serverSpan: IDevToolsSpan = {
  traceId: 'trace-123',
  spanId: 'server-123',
  type: 'http.server',
  name: 'GET /hello',
  startedAt: 1000,
  durationMs: 500,
  attributes: {},
  status: {
    code: 0,
  },
};

const clientSpan: IDevToolsSpan = {
  traceId: 'trace-123',
  spanId: 'client-123',
  parentSpanId: 'server-123',
  type: 'http.client',
  name: 'GET example.com',
  startedAt: 1100,
  durationMs: 250,
  attributes: {},
  status: {
    code: 0,
  },
};

const assembler = new TraceAssembler();

assembler.addSpan(serverSpan);
assembler.addSpan(clientSpan);

const trace = assembler.getTrace('trace-123');

assert.ok(trace);

assert.equal(trace.traceId, 'trace-123');
assert.equal(trace.rootSpanId, 'server-123');

assert.equal(trace.spans.length, 2);
assert.deepEqual(trace.spans, [
  serverSpan,
  clientSpan,
]);

assert.equal(trace.startedAt, 1000);
assert.equal(trace.durationMs, 500);

console.log('TraceAssembler test passed');