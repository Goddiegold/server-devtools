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

const expressSpan = {
  spanContext() {
    return {
      traceId: 'trace-123',
      spanId: 'express-123',
      traceFlags: 1,
    };
  },

  parentSpanContext: {
    traceId: 'trace-123',
    spanId: 'server-123',
    traceFlags: 1,
  },

  kind: SpanKind.INTERNAL,

  name: 'request handler - /users/:id',

  startTime: [100, 0],
  duration: [0, 100_000_000],

  attributes: {
    'http.route': '/users/:id',
    'express.name': '/users/:id',
    'express.type': 'request_handler',
  },

  status: {
    code: 0,
  },
} as unknown as ReadableSpan;

const mongoSpan = { spanContext() { return { traceId: 'trace-123', spanId: 'mongo-123', traceFlags: 1, }; }, parentSpanContext: { traceId: 'trace-123', spanId: 'server-123', traceFlags: 1, }, kind: SpanKind.CLIENT, name: 'find users', startTime: [100, 0], duration: [0, 50_000_000], attributes: { 'db.system.name': 'mongodb', 'db.operation.name': 'find', 'db.collection.name': 'users', 'db.namespace': 'server_devtools', }, status: { code: 0, }, } as unknown as ReadableSpan;

const mapper = new SpanMapper();

const expressResult = mapper.map(expressSpan);

assert.equal(expressResult.type, 'framework');


const mongoResult = mapper.map(mongoSpan);

assert.equal(mongoResult.type, 'database');

// const mapper = new SpanMapper();

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

const errorSpan = {
  spanContext() {
    return {
      traceId: 'trace-error-123',
      spanId: 'span-error-123',
      traceFlags: 1,
    };
  },

  parentSpanContext: undefined,

  kind: SpanKind.SERVER,

  name: 'GET /users/broken',

  startTime: [100, 0],

  duration: [0, 7_000_000],

  attributes: {
    'http.request.method': 'GET',
    'http.response.status_code': 500,
  },

  status: {
    code: 2,
  },

  events: [
    {
      name: 'exception',
      time: [100, 1_000_000],
      attributes: {
        'exception.type': 'Error',
        'exception.message': 'Something went wrong',
        'exception.stacktrace':
          'Error: Something went wrong\n    at UsersController.broken',
      },
    },
  ],
} as unknown as ReadableSpan;

const errorResult = mapper.map(errorSpan);

assert.deepEqual(errorResult?.error, {
  type: 'Error',
  message: 'Something went wrong',
  stack: 'Error: Something went wrong\n    at UsersController.broken',
});
console.log('SpanMapper test passed');