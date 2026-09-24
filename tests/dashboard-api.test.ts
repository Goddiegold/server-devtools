import assert from 'node:assert/strict';
import http from 'node:http';

import DashboardServer from '../src/dashboard/dashboard-server';
import SQLiteStorage from '../src/storage/sqlite-storage';
import AuthService from '../src/security/auth.service';
import { IDevToolsTrace } from '../src/types';

async function run() {
  // 1. Create the in-memory SQLite storage
  const storage = new SQLiteStorage(':memory:');

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
  storage.saveCurrentUser('trace-123', {
    id: 'user-123',
    email: 'godwin@example.com',
  });

  for (let index = 1; index <= 24; index += 1) {
    storage.saveSpan({
      traceId: `trace-page-${index}`,
      spanId: `root-page-${index}`,
      type: 'http.server',
      name: `GET /page/${index}`,
      startedAt: 1000 + index,
      durationMs: index,
      attributes: {
        'http.request.method': index === 1 ? 'POST' : 'GET',
        'url.path': `/page/${index}`,
        'http.response.status_code': index === 1 ? 201 : 200,
      },
      status: { code: 0 },
    });
    storage.saveTraceSummary(storage.getSpansByTraceId(`trace-page-${index}`)[0]);
  }

  // 3. Start ServerDevTools' HTTP server
  const authService = new AuthService('admin', 'test-password', storage);
  const dashboard = new DashboardServer(storage, authService);

  const server = http.createServer((req, res) => {
    dashboard.handle(req, res);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();

  assert(address && typeof address !== 'string');

  const sessionToken = authService.createSession('admin');
  const apiFetch = (path: string, init?: RequestInit) => fetch(
    `http://127.0.0.1:${address.port}${path}`,
    {
      ...init,
      headers: {
        ...init?.headers,
        Cookie: `sdt_session=${sessionToken}`,
      },
    },
  );

  const staticFetch = (path: string) => fetch(`http://127.0.0.1:${address.port}${path}`);

  try {
    for (const path of ['/_devtools', '/_devtools/']) {
      const dashboardResponse = await staticFetch(path);
      assert.equal(dashboardResponse.status, 200);
      assert.match(dashboardResponse.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await dashboardResponse.text(), /<html/i);
    }

    const faviconResponse = await staticFetch('/_devtools/favicon.svg');
    assert.equal(faviconResponse.status, 200);
    assert.match(faviconResponse.headers.get('content-type') ?? '', /image\/svg\+xml/);

    const missingAssetResponse = await staticFetch('/_devtools/missing.js');
    assert.equal(missingAssetResponse.status, 404);

    const traversalResponse = await staticFetch('/_devtools/%2e%2e%2f%2e%2e%2fpackage.json');
    assert.equal(traversalResponse.status, 404);

    const unauthenticatedApiResponse = await fetch(`http://127.0.0.1:${address.port}/_devtools/api/requests`);
    assert.equal(unauthenticatedApiResponse.status, 401);

    // 4. Call the NEW endpoint we want to build
    const response = await apiFetch('/_devtools/api/requests');

    assert.equal(response.status, 200);

    const body = await response.json();

    assert.equal(body.data.length, 20);
    assert.equal(body.data[0].id, 'trace-page-24');
    assert.deepEqual(body.pagination, {
      page: 1,
      limit: 20,
      total: 25,
      totalPages: 2,
      hasMore: true,
    });

    const secondPageResponse = await apiFetch('/_devtools/api/requests?page=2');
    assert.equal(secondPageResponse.status, 200);
    const secondPage = await secondPageResponse.json();
    assert.equal(secondPage.data.length, 5);
    assert.equal(secondPage.data[0].id, 'trace-page-4');
    assert.equal(secondPage.data[4].id, 'trace-123');
    assert.deepEqual(secondPage.data[4].user, {
      id: 'user-123',
      email: 'godwin@example.com',
    });
    assert.deepEqual(secondPage.pagination, {
      page: 2,
      limit: 20,
      total: 25,
      totalPages: 2,
      hasMore: false,
    });

    const customPageResponse = await apiFetch('/_devtools/api/requests?page=2&limit=5');
    const customPage = await customPageResponse.json();
    assert.equal(customPage.data.length, 5);
    assert.equal(customPage.pagination.limit, 5);
    assert.equal(customPage.pagination.totalPages, 5);

    const searchedResponse = await apiFetch('/_devtools/api/requests?search=page%2F24');
    assert.equal(searchedResponse.status, 200);
    const searched = await searchedResponse.json();
    assert.equal(searched.data.length, 1);
    assert.equal(searched.data[0].id, 'trace-page-24');
    assert.deepEqual(searched.pagination, {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasMore: false,
    });

    const searchedByNameResponse = await apiFetch('/_devtools/api/requests?search=users%2F%3Aid');
    assert.equal(searchedByNameResponse.status, 200);
    const searchedByName = await searchedByNameResponse.json();
    assert.equal(searchedByName.data.length, 1);
    assert.equal(searchedByName.data[0].id, 'trace-123');

    const methodResponse = await apiFetch('/_devtools/api/requests?method=POST');
    assert.equal(methodResponse.status, 200);
    const methodBody = await methodResponse.json();
    assert.deepEqual(methodBody.data.map((request: { id: string }) => request.id), ['trace-page-1']);
    assert.equal(methodBody.pagination.total, 1);

    const statusResponse = await apiFetch('/_devtools/api/requests?status=201');
    assert.equal(statusResponse.status, 200);
    const statusBody = await statusResponse.json();
    assert.deepEqual(statusBody.data.map((request: { id: string }) => request.id), ['trace-page-1']);
    assert.equal(statusBody.pagination.total, 1);

    const combinedFilterResponse = await apiFetch('/_devtools/api/requests?search=page&method=POST&status=201');
    assert.equal(combinedFilterResponse.status, 200);
    const combinedFilterBody = await combinedFilterResponse.json();
    assert.deepEqual(combinedFilterBody.data.map((request: { id: string }) => request.id), ['trace-page-1']);
    assert.equal(combinedFilterBody.pagination.total, 1);

    const clearedFiltersResponse = await apiFetch('/_devtools/api/requests?search=&method=&status=');
    assert.equal(clearedFiltersResponse.status, 200);
    const clearedFiltersBody = await clearedFiltersResponse.json();
    assert.equal(clearedFiltersBody.data.length, 20);
    assert.deepEqual(clearedFiltersBody.pagination, {
      page: 1,
      limit: 20,
      total: 25,
      totalPages: 2,
      hasMore: true,
    });

    for (const query of ['?page=0', '?page=1.5', '?limit=0', '?limit=101']) {
      const invalidResponse = await apiFetch(`/_devtools/api/requests${query}`);
      assert.equal(invalidResponse.status, 400);
    }

    const traceResponse = await apiFetch('/_devtools/api/traces/trace-123');

    assert.equal(traceResponse.status, 200);
    assert.deepEqual(
      await traceResponse.json(),
      {
        ...JSON.parse(JSON.stringify(storage.getTrace('trace-123'))),
        user: {
          id: 'user-123',
          email: 'godwin@example.com',
        },
      },
    );

    const missingTraceResponse = await apiFetch('/_devtools/api/traces/missing');

    assert.equal(missingTraceResponse.status, 404);
    assert.deepEqual(await missingTraceResponse.json(), {
      message: 'Trace not found',
    });

    const deleteResponse = await apiFetch('/_devtools/api/traces/trace-123', { method: 'DELETE' });

    assert.equal(deleteResponse.status, 200);

    const deleteUnknownResponse = await apiFetch('/_devtools/api/traces/missing', { method: 'DELETE' });

    assert.equal(deleteUnknownResponse.status, 404);

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

    const executionResponse = await apiFetch('/_devtools/api/traces/trace-execution/execution');

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

    const clearHistoryResponse = await apiFetch('/_devtools/api/traces', { method: 'DELETE' });

    assert.equal(clearHistoryResponse.status, 200);

    const requestsAfterClear = await apiFetch('/_devtools/api/requests');

    assert.equal(requestsAfterClear.status, 200);
    assert.deepEqual(await requestsAfterClear.json(), {
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
    });


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
