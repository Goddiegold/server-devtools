import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createServer, request as httpRequest, type Server } from "node:http";

import SQLiteStorage from "../src/storage/sqlite-storage";
import { OutboundHttpCapture } from "../src/instrumentation/outbound-http/outbound-http-capture";

function createStorage(t: TestContext): SQLiteStorage {
  const storage = new SQLiteStorage(":memory:");
  t.after(() => storage.close());
  return storage;
}

async function startServer(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

function closeServer(t: TestContext, server: Server): void {
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
}

test("SQLiteStorage creates, incrementally updates, and reconstructs HTTP client details", (t) => {
  const storage = createStorage(t);

  storage.updateHttpClientDetails("span-1", {
    requestHeaders: { "content-type": "application/json", "x-request": "one" },
    requestBody: { name: "Ada" },
  });
  assert.deepEqual(storage.getHttpClientDetails("span-1"), {
    spanId: "span-1",
    requestHeaders: { "content-type": "application/json", "x-request": "one" },
    requestBody: { name: "Ada" },
    responseHeaders: undefined,
    responseBody: undefined,
  });

  storage.updateHttpClientDetails("span-1", {
    responseHeaders: { "content-type": "application/json", "x-response": "two" },
  });
  storage.updateHttpClientDetails("span-1", {
    responseBody: { id: 42, active: true },
  });

  assert.deepEqual(storage.getHttpClientDetails("span-1"), {
    spanId: "span-1",
    requestHeaders: { "content-type": "application/json", "x-request": "one" },
    requestBody: { name: "Ada" },
    responseHeaders: { "content-type": "application/json", "x-response": "two" },
    responseBody: { id: 42, active: true },
  });
});

test("native HTTP capture records headers and complete chunked bodies without consuming the response", async (t) => {
  const storage = createStorage(t);
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", chunk => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      assert.equal(Buffer.concat(chunks).toString(), '{"part":1,"done":true}');
      response.writeHead(200, {
        "content-type": "application/json",
        "x-response": "captured",
      });
      response.write('{"received":');
      setTimeout(() => response.end('"by-app"}'), 5);
    });
  });
  closeServer(t, server);
  const baseUrl = await startServer(server);
  const capture = new OutboundHttpCapture(storage);
  const request = httpRequest(`${baseUrl}/native`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request": "captured",
    },
  });
  capture.trackNativeRequest("native-span", request);

  const responseReceived = new Promise<{ body: string; headers: Record<string, string | string[]> }>((resolve, reject) => {
    request.once("response", response => {
      capture.trackNativeResponse("native-span", response);
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.once("end", () => resolve({
        body: Buffer.concat(chunks).toString(),
        headers: response.headers as Record<string, string | string[]>,
      }));
      response.once("error", reject);
    });
    request.once("error", reject);
  });

  request.write('{"part":1,');
  request.end('"done":true}');
  const applicationResponse = await responseReceived;

  assert.equal(applicationResponse.body, '{"received":"by-app"}');
  assert.equal(applicationResponse.headers["x-response"], "captured");
  const details = storage.getHttpClientDetails("native-span");
  assert.deepEqual(details?.requestHeaders, {
    "content-type": "application/json",
    "x-request": "captured",
    host: new URL(baseUrl).host,
  });
  assert.deepEqual(details?.requestBody, { part: 1, done: true });
  assert.equal(details?.responseHeaders?.["content-type"], "application/json");
  assert.equal(details?.responseHeaders?.["x-response"], "captured");
  assert.deepEqual(details?.responseBody, { received: "by-app" });
});

test("native HTTP capture limits request and response bodies without changing stream bytes", async (t) => {
  const storage = createStorage(t);
  const bodyLimit = 256 * 1024;
  const cases = [
    { name: "below", body: "é".repeat(bodyLimit / 2 - 1) },
    { name: "exact", body: "😀".repeat(bodyLimit / 4) },
    { name: "above", body: `${"😀".repeat(bodyLimit / 4)}x` },
  ];
  const server = createServer((request, response) => {
    const testCase = cases.find((value) => request.url === `/${value.name}`);
    assert.ok(testCase);
    const requestChunks: Buffer[] = [];
    request.on("data", (chunk) => requestChunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      assert.equal(Buffer.concat(requestChunks).toString(), testCase.body);
      response.writeHead(200, { "content-type": "text/plain" });
      const responseBuffer = Buffer.from(testCase.body);
      response.write(responseBuffer.subarray(0, Math.floor(responseBuffer.length / 2)));
      response.end(responseBuffer.subarray(Math.floor(responseBuffer.length / 2)));
    });
  });
  closeServer(t, server);
  const baseUrl = await startServer(server);
  const capture = new OutboundHttpCapture(storage);

  for (const testCase of cases) {
    const request = httpRequest(`${baseUrl}/${testCase.name}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
    });
    capture.trackNativeRequest(`native-${testCase.name}`, request);
    const bodyBuffer = Buffer.from(testCase.body);
    request.write(bodyBuffer.subarray(0, Math.floor(bodyBuffer.length / 2)));

    const responseReceived = new Promise<string>((resolve, reject) => {
      request.once("response", (response) => {
        capture.trackNativeResponse(`native-${testCase.name}`, response);
        const responseChunks: Buffer[] = [];
        response.on("data", (chunk) => responseChunks.push(Buffer.from(chunk)));
        response.once("end", () => resolve(Buffer.concat(responseChunks).toString()));
        response.once("error", reject);
      });
      request.once("error", reject);
    });

    request.end(bodyBuffer.subarray(Math.floor(bodyBuffer.length / 2)));
    assert.equal(await responseReceived, testCase.body);

    const details = storage.getHttpClientDetails(`native-${testCase.name}`);
    if (bodyBuffer.length <= bodyLimit) {
      assert.equal(details?.requestBody, testCase.body);
      assert.equal(details?.responseBody, testCase.body);
    } else {
      assert.equal(details?.requestBody, undefined);
      assert.equal(details?.responseBody, undefined);
    }
  }
});

test("fetch capture stores JSON/text payloads and headers, permits bodyless requests, and isolates concurrent spans", async (t) => {
  const storage = createStorage(t);
  const server = createServer((request, response) => {
    if (request.url === "/text") {
      response.writeHead(200, { "content-type": "text/plain", "x-response": "text" });
      response.end("plain response");
      return;
    }

    if (request.url === "/empty") {
      response.writeHead(204, { "x-response": "empty" });
      response.end();
      return;
    }

    const chunks: Buffer[] = [];
    request.on("data", chunk => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const sent = JSON.parse(Buffer.concat(chunks).toString());
      response.writeHead(200, { "content-type": "application/json", "x-response": sent.id });
      response.end(JSON.stringify({ responseId: sent.id }));
    });
  });
  closeServer(t, server);
  const baseUrl = await startServer(server);
  const capture = new OutboundHttpCapture(storage);
  const originalFetch = globalThis.fetch;
  const spanByPath: Record<string, string> = {
    "/json-a": "fetch-span-a",
    "/json-b": "fetch-span-b",
    "/text": "fetch-span-text",
    "/empty": "fetch-span-empty",
  };

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    capture.associateFetchSpan(spanByPath[new URL(request.url).pathname]);
    return originalFetch(request);
  }) as typeof globalThis.fetch;
  capture.startFetchCapture();
  t.after(() => { globalThis.fetch = originalFetch; });

  const [responseA, responseB, textResponse, emptyResponse] = await Promise.all([
    globalThis.fetch(`${baseUrl}/json-a`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request": "a" },
      body: JSON.stringify({ id: "a" }),
    }),
    globalThis.fetch(`${baseUrl}/json-b`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request": "b" },
      body: JSON.stringify({ id: "b" }),
    }),
    globalThis.fetch(`${baseUrl}/text`, { headers: { "x-request": "text" } }),
    globalThis.fetch(`${baseUrl}/empty`),
  ]);

  assert.deepEqual(await responseA.json(), { responseId: "a" });
  assert.deepEqual(await responseB.json(), { responseId: "b" });
  assert.equal(await textResponse.text(), "plain response");
  assert.equal(emptyResponse.status, 204);

  for (const [spanId, id] of [["fetch-span-a", "a"], ["fetch-span-b", "b"]]) {
    const details = storage.getHttpClientDetails(spanId);
    assert.deepEqual(details?.requestHeaders, { "content-type": "application/json", "x-request": id });
    assert.deepEqual(details?.requestBody, { id });
    assert.equal(details?.responseHeaders?.["content-type"], "application/json");
    assert.equal(details?.responseHeaders?.["x-response"], id);
    assert.deepEqual(details?.responseBody, { responseId: id });
  }

  const textDetails = storage.getHttpClientDetails("fetch-span-text");
  assert.deepEqual(textDetails?.requestHeaders, { "x-request": "text" });
  assert.equal(textDetails?.requestBody, undefined);
  assert.equal(textDetails?.responseHeaders?.["content-type"], "text/plain");
  assert.equal(textDetails?.responseHeaders?.["x-response"], "text");
  assert.equal(textDetails?.responseBody, "plain response");

  const emptyDetails = storage.getHttpClientDetails("fetch-span-empty");
  assert.deepEqual(emptyDetails?.requestHeaders, {});
  assert.equal(emptyDetails?.requestBody, undefined);
  assert.equal(emptyDetails?.responseHeaders?.["x-response"], "empty");
  assert.equal(emptyDetails?.responseBody, undefined);
});

test("fetch capture errors do not reject or consume a successful response", async (t) => {
  const storage = createStorage(t);
  const capture = new OutboundHttpCapture(storage);
  const originalFetch = globalThis.fetch;
  const applicationResponse = new Response("application response");

  applicationResponse.clone = () => ({
    headers: new Headers(),
    body: {},
    text: async () => { throw new Error("capture body read failed"); },
  } as unknown as Response);

  globalThis.fetch = (async () => {
    capture.associateFetchSpan("fetch-span");
    return applicationResponse;
  }) as typeof globalThis.fetch;
  capture.startFetchCapture();
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await globalThis.fetch("http://example.test");

  assert.equal(await response.text(), "application response");
});

test("stopping fetch capture is safe before startup and restores the original fetch", (t) => {
  const storage = createStorage(t);
  const capture = new OutboundHttpCapture(storage);
  const originalFetch = globalThis.fetch;

  capture.stopFetchCapture();
  assert.equal(globalThis.fetch, originalFetch);

  capture.startFetchCapture();
  assert.notEqual(globalThis.fetch, originalFetch);

  capture.stopFetchCapture();
  assert.equal(globalThis.fetch, originalFetch);
});
