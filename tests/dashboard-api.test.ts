import assert from 'node:assert/strict';
import http from 'node:http';

import TraceStore from '../src/core/trace-store';
import DashboardServer from '../src/dashboard/dashboard-server';

async function run() {
  // 1. Create our in-memory trace store
  const traceStore = new TraceStore();

  // 2. Put one fake HTTP request trace inside it
  traceStore.add({
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
  });

  // 3. Start ServerDevTools' HTTP server
  const dashboard = new DashboardServer(traceStore);

  const server = http.createServer((req, res) => {
    dashboard.handle(req, res);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();

  assert(address && typeof address !== 'string');

  try {
    // 4. Call the NEW endpoint we want to build
    const response = await fetch(
      `http://127.0.0.1:${address.port}/_devtools/api/requests`,
    );

    assert.equal(response.status, 200);

    const body = await response.json();

    // 5. This is what React should eventually receive
    assert.deepEqual(body, [
      {
        id: 'trace-123',
        method: 'GET',
        path: '/users/123',
        route: '/users/:id',
        statusCode: 200,
        durationMs: 499,
        startedAt: 1000,
        hasError: false,
      },
    ]);

    const traceResponse = await fetch(
      `http://127.0.0.1:${address.port}/_devtools/api/traces/trace-123`,
    );

    assert.equal(traceResponse.status, 200);
    assert.deepEqual(await traceResponse.json(), traceStore.get('trace-123'));

    const missingTraceResponse = await fetch(
      `http://127.0.0.1:${address.port}/_devtools/api/traces/missing`,
    );

    assert.equal(missingTraceResponse.status, 404);
    assert.deepEqual(await missingTraceResponse.json(), {
      message: 'Trace not found',
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

run();
