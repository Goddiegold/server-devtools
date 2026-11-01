import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import { test, type TestContext } from "node:test";

import DashboardServer from "../src/dashboard/dashboard-server";
import AuthService from "../src/security/auth.service";
import Config from "../src/config";
import SQLiteStorage from "../src/storage/sqlite-storage";

async function startDashboard(t: TestContext) {
  const storage = new SQLiteStorage(":memory:");
  const authService = new AuthService("admin", "correct-password", storage);
  const dashboard = new DashboardServer(storage, authService);
  const server = http.createServer((request, response) => {
    const testRemoteAddress = request.headers["x-test-remote-address"];
    if (typeof testRemoteAddress === "string") {
      Object.defineProperty(request.socket, "remoteAddress", {
        configurable: true,
        value: testRemoteAddress,
      });
    }
    void Promise.resolve(dashboard.handle(request, response)).catch(() => undefined);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "0.0.0.0", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
    storage.close();
  });

  return {
    dashboard,
    authService,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function login(
  baseUrl: string,
  socketAddress = "127.0.0.1",
  forwardedFor?: string,
  password = "wrong-password",
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-test-remote-address": socketAddress,
  };
  if (forwardedFor) {
    headers["x-forwarded-for"] = forwardedFor;
  }

  return fetch(baseUrl + "/_devtools/api/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ username: "admin", password }),
  });
}

async function loginWithBody(
  baseUrl: string,
  body: string,
  socketAddress = "127.0.0.1",
) {
  return fetch(baseUrl + "/_devtools/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-test-remote-address": socketAddress,
    },
    body,
  });
}

async function sendMalformedLogin(
  baseUrl: string,
  socketAddress: string,
) {
  const address = new URL(baseUrl);

  await new Promise<void>((resolve, reject) => {
    const request = http.request({
      hostname: address.hostname,
      port: address.port,
      path: "/_devtools/api/auth/login",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-remote-address": socketAddress,
      },
    });
    request.on("error", () => undefined);
    request.end('{"username":', () => {
      setTimeout(() => {
        request.destroy();
        resolve();
      }, 25);
    });
    request.once("timeout", () => {
      request.destroy();
      reject(new Error("malformed login request timed out"));
    });
  });
}

async function sendChunkedLoginBody(
  baseUrl: string,
  chunks: string[],
  socketAddress: string,
) {
  const address = new URL(baseUrl);

  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const request = http.request({
      hostname: address.hostname,
      port: address.port,
      path: "/_devtools/api/auth/login",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "transfer-encoding": "chunked",
        "x-test-remote-address": socketAddress,
      },
    }, resolve);
    request.once("error", reject);
    for (const chunk of chunks) {
      request.write(chunk);
    }
    request.end();
  });
}

function setTrackedKeyCapacity(
  dashboard: DashboardServer,
  capacity: number,
) {
  (dashboard as unknown as {
    maxTrackedLoginRateLimitKeys: number;
  }).maxTrackedLoginRateLimitKeys = capacity;
}

function setBlockDuration(
  dashboard: DashboardServer,
  durationSeconds: number,
) {
  (dashboard as unknown as {
    loginRateLimiter: { blockDuration: number };
  }).loginRateLimiter.blockDuration = durationSeconds;
}

test("admits five login attempts and blocks the sixth before parsing the body", async (t) => {
  const { baseUrl, authService } = await startDashboard(t);
  let validationCalls = 0;
  authService.validateCredentials = () => {
    validationCalls += 1;
    return false;
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await login(baseUrl);
    assert.equal(response.status, 401);
  }

  const address = new URL(baseUrl);
  let blockedRequest: http.ClientRequest | undefined;
  const blockedResponse = await new Promise<http.IncomingMessage>((resolve, reject) => {
    let settled = false;
    const request = http.request({
      hostname: address.hostname,
      port: address.port,
      path: "/_devtools/api/auth/login",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "100",
      },
    }, response => {
      settled = true;
      clearTimeout(timeout);
      resolve(response);
    });
    const timeout = setTimeout(() => {
      if (!settled) {
        request.destroy();
        reject(new Error("login handler read the blocked request body"));
      }
    }, 250);
    request.once("error", error => {
      if (!settled) {
        clearTimeout(timeout);
        reject(error);
      }
    });
    request.write('{"username":');
    blockedRequest = request;
  });

  const body = await new Promise<string>((resolve, reject) => {
    let responseBody = "";
    blockedResponse.setEncoding("utf8");
    blockedResponse.on("data", chunk => { responseBody += chunk; });
    blockedResponse.on("end", () => {
      blockedRequest?.destroy();
      resolve(responseBody);
    });
    blockedResponse.on("error", reject);
  });

  assert.equal(blockedResponse.statusCode, 429);
  assert.match(blockedResponse.headers["retry-after"] ?? "", /^\d+$/);
  assert.ok(Number(blockedResponse.headers["retry-after"]) >= 1);
  assert.deepEqual(JSON.parse(body), { message: "Too many login attempts" });
  assert.equal(validationCalls, 5);
});

test("isolates login limits by socket IP and ignores forwarded headers", async (t) => {
  const { baseUrl } = await startDashboard(t);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login(baseUrl, "::ffff:127.0.0.1", "127.0.0.2")).status, 401);
  }

  assert.equal((await login(baseUrl, "127.0.0.1", "127.0.0.2")).status, 429);
  assert.equal((await login(baseUrl, "127.0.0.2", "127.0.0.1")).status, 401);
});

test("does not allow concurrent attempts to exceed the allowance", async (t) => {
  const { baseUrl } = await startDashboard(t);
  const responses = await Promise.all(
    Array.from({ length: 6 }, () => login(baseUrl)),
  );

  assert.equal(responses.filter(response => response.status === 401).length, 5);
  assert.equal(responses.filter(response => response.status === 429).length, 1);
});

test("returns a generic 503 when the limiter fails unexpectedly", async (t) => {
  const { baseUrl, dashboard } = await startDashboard(t);
  const limiter = (dashboard as unknown as {
    loginRateLimiter: { consume: () => Promise<unknown> };
  }).loginRateLimiter;
  limiter.consume = async () => {
    throw new Error("unexpected limiter failure");
  };

  const response = await login(baseUrl);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    message: "Unable to process login request",
  });
});

test("refunds exactly one point after a successful login", async (t) => {
  const { baseUrl } = await startDashboard(t);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    assert.equal((await login(baseUrl, "127.0.0.3", undefined, "correct-password")).status, 200);
  }
});

test("successful login does not erase previous failed attempts", async (t) => {
  const { baseUrl } = await startDashboard(t);

  assert.equal((await login(baseUrl, "127.0.0.4")).status, 401);
  assert.equal((await login(baseUrl, "127.0.0.4", undefined, "correct-password")).status, 200);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal((await login(baseUrl, "127.0.0.4")).status, 401);
  }

  assert.equal((await login(baseUrl, "127.0.0.4")).status, 429);
});

test("refund failures do not break a successful login", async (t) => {
  const { baseUrl, dashboard } = await startDashboard(t);
  const limiter = (dashboard as unknown as {
    loginRateLimiter: { reward: () => Promise<unknown> };
  }).loginRateLimiter;
  limiter.reward = async () => {
    throw new Error("unexpected refund failure");
  };

  assert.equal((await login(baseUrl, "127.0.0.6", undefined, "correct-password")).status, 200);
});

test("failed and malformed submissions retain their consumed points", async (t) => {
  const { baseUrl } = await startDashboard(t);

  assert.equal((await loginWithBody(baseUrl, JSON.stringify({ username: "admin" }), "127.0.0.5")).status, 400);
  await sendMalformedLogin(baseUrl, "127.0.0.5");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal((await login(baseUrl, "127.0.0.5")).status, 401);
  }

  assert.equal((await login(baseUrl, "127.0.0.5")).status, 429);
});

test("does not exceed the tracked IP capacity under concurrent requests", async (t) => {
  const { baseUrl, dashboard } = await startDashboard(t);
  setTrackedKeyCapacity(dashboard, 2);

  const responses = await Promise.all(
    Array.from({ length: 6 }, (_, index) => login(baseUrl, `127.0.1.${index + 1}`)),
  );

  assert.equal(responses.filter(response => response.status === 401).length, 2);
  assert.equal(responses.filter(response => response.status === 429).length, 4);
});

test("rejects a new IP when capacity is full and keeps existing IP limits active", async (t) => {
  const { baseUrl, dashboard } = await startDashboard(t);
  setTrackedKeyCapacity(dashboard, 1);

  assert.equal((await login(baseUrl, "127.0.2.1")).status, 401);
  assert.equal((await login(baseUrl, "127.0.2.2")).status, 429);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal((await login(baseUrl, "127.0.2.1")).status, 401);
  }

  assert.equal((await login(baseUrl, "127.0.2.1")).status, 429);
});

test("reclaims expired capacity without removing an active extended block", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const { baseUrl, dashboard } = await startDashboard(t);
  setTrackedKeyCapacity(dashboard, 2);
  setBlockDuration(dashboard, 30 * 60);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login(baseUrl, "127.0.3.1")).status, 401);
  }
  assert.equal((await login(baseUrl, "127.0.3.1")).status, 429);
  assert.equal((await login(baseUrl, "127.0.3.2")).status, 401);

  t.mock.timers.setTime(15 * 60 * 1000 + 1);

  assert.equal((await login(baseUrl, "127.0.3.3")).status, 401);
  const blockedResponse = await login(baseUrl, "127.0.3.1");
  assert.equal(blockedResponse.status, 429);
  assert.ok(Number(blockedResponse.headers.get("retry-after")) > 1);
});

test("successful-login refunds keep the tracked record until it expires", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  const { baseUrl, dashboard } = await startDashboard(t);
  setTrackedKeyCapacity(dashboard, 1);

  assert.equal((await login(baseUrl, "127.0.4.1", undefined, "correct-password")).status, 200);
  assert.equal((await login(baseUrl, "127.0.4.2")).status, 429);

  t.mock.timers.setTime(15 * 60 * 1000 + 1);
  assert.equal((await login(baseUrl, "127.0.4.2")).status, 401);
});

test("accepts login JSON below and exactly at the 8 KiB limit", async (t) => {
  const { baseUrl, authService } = await startDashboard(t);
  let validationCalls = 0;
  const originalValidateCredentials = authService.validateCredentials.bind(authService);
  authService.validateCredentials = (...args) => {
    validationCalls += 1;
    return originalValidateCredentials(...args);
  };

  const validBody = JSON.stringify({ username: "admin", password: "wrong-password" });
  const exactBody = validBody + " ".repeat(
    Config.DASHBOARD_LOGIN_BODY_LIMIT_BYTES - Buffer.byteLength(validBody),
  );

  assert.equal((await loginWithBody(baseUrl, validBody, "127.0.5.1")).status, 401);
  assert.equal((await loginWithBody(baseUrl, exactBody, "127.0.5.2")).status, 401);
  assert.equal(validationCalls, 2);
});

test("rejects oversized declared and chunked login bodies before validation", async (t) => {
  const { baseUrl, authService } = await startDashboard(t);
  let validationCalls = 0;
  authService.validateCredentials = () => {
    validationCalls += 1;
    return false;
  };

  const oversizedBody = JSON.stringify({
    username: "admin",
    password: "wrong-password",
    padding: "x".repeat(Config.DASHBOARD_LOGIN_BODY_LIMIT_BYTES),
  });
  const declaredResponse = await loginWithBody(baseUrl, oversizedBody, "127.0.5.3");
  assert.equal(declaredResponse.status, 413);
  assert.deepEqual(await declaredResponse.json(), {
    message: "Login request body is too large",
  });

  const chunkedResponse = await sendChunkedLoginBody(
    baseUrl,
    [
      "{\"username\":\"admin\",\"password\":\"wrong-password\",\"padding\":\"",
      "x".repeat(Config.DASHBOARD_LOGIN_BODY_LIMIT_BYTES),
      "\"}",
    ],
    "127.0.5.4",
  );
  assert.equal(chunkedResponse.statusCode, 413);
  assert.equal(validationCalls, 0);
});
