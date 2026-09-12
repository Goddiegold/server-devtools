import assert from 'node:assert/strict';
import http from 'node:http';

import DashboardServer from '../src/dashboard/dashboard-server';
import TraceMetadataStore from '../src/core/trace-metadata-store';
import SQLiteStorage from '../src/storage/sqlite-storage';
import { IDevToolsTrace } from '../src/types';

async function run() {
  // 1. Create the in-memory SQLite storage
  const storage = new SQLiteStorage(':memory:');
  const traceMetadataStore = new TraceMetadataStore();

  // 2. Put one fake HTTP request trace inside it
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
  for (const span of trace.spans) storage.saveSpan(span);
  storage.saveTraceSummary(trace.spans[0]);

  // 3. Start ServerDevTools' HTTP server
  const dashboard = new DashboardServer(traceMetadataStore, storage);

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
    assert.deepEqual(
      await traceResponse.json(),
      JSON.parse(JSON.stringify(storage.getTrace('trace-123'))),
    );

    const missingTraceResponse = await fetch(
      `http://127.0.0.1:${address.port}/_devtools/api/traces/missing`,
    );

    assert.equal(missingTraceResponse.status, 404);
    assert.deepEqual(await missingTraceResponse.json(), {
      message: 'Trace not found',
    });

    const executionTrace: IDevToolsTrace = {
      traceId: "trace-execution",
      rootSpanId: "root-execution",
      startedAt: 1000,
      durationMs: 200,
      spans: [
        {
          traceId: "trace-execution",
          spanId: "root-execution",
          type: "http.server",
          name: "GET /users",
          startedAt: 1000,
          durationMs: 200,
          attributes: {
            "http.request.method": "GET",
            "url.path": "/users",
            "http.response.status_code": 200,
          },
          status: { code: 0 },
        },
        {
          traceId: "trace-execution",
          spanId: "db-execution",
          parentSpanId: "root-execution",
          type: "database",
          name: "find users",
          startedAt: 1020,
          durationMs: 20,
          attributes: {},
          status: { code: 0 },
        },
      ],
    };
    for (const span of executionTrace.spans) storage.saveSpan(span);
    storage.saveTraceSummary(executionTrace.spans[0]);

    const executionResponse = await fetch(
      `http://127.0.0.1:${address.port}/_devtools/api/traces/trace-execution/execution`
    );

    assert.equal(executionResponse.status, 200);

    const executionResponseBody = await executionResponse.json();

    assert.equal(executionResponseBody.length, 1);

    assert.equal(
      executionResponseBody[0].span.spanId,
      "root-execution"
    );

    assert.equal(
      executionResponseBody[0].children.length,
      1
    );

    assert.equal(
      executionResponseBody[0].children[0].span.spanId,
      "db-execution"
    );


    console.log('Dashboard API test passed');

  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    storage.close();
  }
}

run();
