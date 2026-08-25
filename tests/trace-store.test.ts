// tests/trace-store.test.ts

import assert from 'node:assert/strict';

import type { IDevToolsTrace } from '../src/types';
import TraceStore from '../src/core/trace-store';

const trace1: IDevToolsTrace = {
  traceId: 'trace-1',
  rootSpanId: 'span-1',
  spans: [],
  startedAt: 1000,
  durationMs: 100,
};

const trace2: IDevToolsTrace = {
  traceId: 'trace-2',
  rootSpanId: 'span-2',
  spans: [],
  startedAt: 2000,
  durationMs: 200,
};

const trace3: IDevToolsTrace = {
  traceId: 'trace-3',
  rootSpanId: 'span-3',
  spans: [],
  startedAt: 3000,
  durationMs: 300,
};

const store = new TraceStore(2);

store.add(trace1);
store.add(trace2);

assert.equal(store.get('trace-1'), trace1);
assert.equal(store.get('trace-2'), trace2);

assert.deepEqual(store.getAll(), [
  trace1,
  trace2,
]);

store.add(trace3);

assert.equal(store.get('trace-1'), undefined);

assert.deepEqual(store.getAll(), [
  trace2,
  trace3,
]);

store.clear();

assert.deepEqual(store.getAll(), []);

console.log('TraceStore test passed');