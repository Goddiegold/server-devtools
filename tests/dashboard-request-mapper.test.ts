import assert from 'node:assert/strict';

import DashboardRequestMapper from '../src/dashboard/dashboard-request-mapper';
import { IDevToolsTrace } from '../src/types';

function run() {
  const mapper = new DashboardRequestMapper();

  const trace: IDevToolsTrace = {
    traceId: 'trace-123',
    rootSpanId: 'root-span',
    startedAt: 1000,
    durationMs: 499,
    spans: [
      {
        traceId: 'trace-123',
        spanId: 'root-span',
        type: 'http.server',
        name: 'GET /users/:id',
        startedAt: 1000,
        durationMs: 499,

        attributes: {
          'http.request.method': 'GET',
          'url.path': '/users/123',
          'http.route': '/users/:id',
          'http.response.status_code': 200,
        },

        status: {
          code: 0,
        },
      },
    ],
  };

  const result = mapper.map(trace);

  assert.deepEqual(result, {
    id: 'trace-123',
    method: 'GET',
    path: '/users/123',
    route: '/users/:id',
    statusCode: 200,
    durationMs: 499,
    startedAt: 1000,
    hasError: false,
  });
}

run();