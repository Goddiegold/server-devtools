import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";

import ServerDevTools from "../src/index";
import SQLiteStorage from "../src/storage/sqlite-storage";

const processFailures: unknown[] = [];
process.on("unhandledRejection", error => processFailures.push(error));
process.on("uncaughtException", error => processFailures.push(error));

function useTemporaryWorkingDirectory(t: TestContext) {
  const previousDirectory = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "server-devtools-auth-hardening-"));
  process.chdir(directory);
  t.after(() => {
    process.chdir(previousDirectory);
    rmSync(directory, { recursive: true, force: true });
  });
}

async function startApp(
  t: TestContext,
  auth: { username: string; password: string } = { username: "admin", password: "correct-password" },
) {
  const devtools = new ServerDevTools({ auth });
  const server = http.createServer((req, res) => {
    devtools.middleware(req, res, () => {
      res.statusCode = 200;
      res.end("app");
    });
  });

  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    (devtools as unknown as { storage: SQLiteStorage }).storage.close();
  };
  t.after(stop);

  return {
    devtools,
    baseUrl: `http://127.0.0.1:${address.port}`,
    stop,
  };
}

function postLogin(baseUrl: string, body: string) {
  return fetch(`${baseUrl}/_devtools/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(2000),
  });
}

async function assertAppAlive(baseUrl: string) {
  const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "app");
  assert.deepEqual(processFailures, []);
}

async function loginAndGetCookie(baseUrl: string, username: string, password: string) {
  const response = await postLogin(baseUrl, JSON.stringify({ username, password }));
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  return setCookie.split(";")[0];
}

function countSessionRows(where = ""): number {
  const database = new DatabaseSync("./server-devtools.db");
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM sessions ${where}`)
    .get() as { count: number };
  database.close();
  return row.count;
}

function getProfile(baseUrl: string, cookie: string) {
  return fetch(`${baseUrl}/_devtools/api/auth/profile`, {
    headers: { cookie },
    signal: AbortSignal.timeout(2000),
  });
}

test("malformed login JSON returns 400 without crashing the host process", async (t) => {
  useTemporaryWorkingDirectory(t);
  const { baseUrl } = await startApp(t);

  for (const body of ["{", '{"username":', "not json"]) {
    const response = await postLogin(baseUrl, body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      message: "Login request body must be valid JSON",
    });
  }

  await assertAppAlive(baseUrl);
});

test("non-string login credentials return 400 without crashing the host process", async (t) => {
  useTemporaryWorkingDirectory(t);
  const { baseUrl } = await startApp(t);

  for (const body of [
    { username: 1, password: "correct-password" },
    { username: ["admin"], password: "correct-password" },
    { username: { toLowerCase: "admin" }, password: "correct-password" },
    { username: "admin", password: 12345 },
  ]) {
    const response = await postLogin(baseUrl, JSON.stringify(body));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      message: "Password and Username are required!",
    });
  }

  await assertAppAlive(baseUrl);
});

test("unexpected dashboard rejections become a 500 response instead of crashing", async (t) => {
  useTemporaryWorkingDirectory(t);
  const { baseUrl, devtools } = await startApp(t);
  const dashboard = (devtools as unknown as {
    dashboard: { handle: () => unknown };
  }).dashboard;

  dashboard.handle = () => Promise.reject(new Error("unexpected async failure"));
  const asyncResponse = await fetch(`${baseUrl}/_devtools/api/auth/profile`);
  assert.equal(asyncResponse.status, 500);
  assert.deepEqual(await asyncResponse.json(), { message: "Internal Server Error" });

  dashboard.handle = () => {
    throw new Error("unexpected sync failure");
  };
  const syncResponse = await fetch(`${baseUrl}/_devtools/api/auth/profile`);
  assert.equal(syncResponse.status, 500);

  await assertAppAlive(baseUrl);
});

test("malformed session cookies are treated as unauthenticated", async (t) => {
  useTemporaryWorkingDirectory(t);
  const { baseUrl } = await startApp(t);

  for (const path of ["/_devtools/api/requests", "/_devtools/api/auth/profile"]) {
    for (const cookie of ["sdt_session=%E0%A4%A", "sdt_session=%", "other=1; sdt_session=%ZZ"]) {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { cookie },
        signal: AbortSignal.timeout(2000),
      });
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { message: "Unauthorized" });
    }
  }

  await assertAppAlive(baseUrl);
});

test("sessions survive a restart with unchanged credentials", async (t) => {
  useTemporaryWorkingDirectory(t);
  const first = await startApp(t);
  const cookie = await loginAndGetCookie(first.baseUrl, "admin", "correct-password");
  assert.equal((await getProfile(first.baseUrl, cookie)).status, 200);
  await first.stop();

  const restarted = await startApp(t, { username: " Admin ", password: "correct-password" });
  assert.equal(countSessionRows(), 1);
  const response = await getProfile(restarted.baseUrl, cookie);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { username: "admin" });
});

test("login removes expired session rows and keeps valid ones", async (t) => {
  useTemporaryWorkingDirectory(t);
  const { baseUrl } = await startApp(t);
  const validCookie = await loginAndGetCookie(baseUrl, "admin", "correct-password");

  const database = new DatabaseSync("./server-devtools.db");
  database.exec(`
    INSERT INTO sessions (session_hash, username, created_at, expires_at)
    VALUES ('expired-row', 'admin', 1, ${Date.now() - 1});
  `);
  database.close();
  assert.equal(countSessionRows(), 2);

  await loginAndGetCookie(baseUrl, "admin", "correct-password");

  assert.equal(countSessionRows(), 2);
  assert.equal(countSessionRows("WHERE session_hash = 'expired-row'"), 0);
  assert.equal((await getProfile(baseUrl, validCookie)).status, 200);
});

test("sessions are invalidated after the dashboard password changes and storage is reopened", async (t) => {
  useTemporaryWorkingDirectory(t);
  const first = await startApp(t);
  const cookie = await loginAndGetCookie(first.baseUrl, "admin", "correct-password");
  assert.equal((await getProfile(first.baseUrl, cookie)).status, 200);
  await first.stop();
  assert.equal(countSessionRows(), 1);

  const rotated = await startApp(t, { username: "admin", password: "new-password" });
  assert.equal(countSessionRows(), 0);
  assert.equal((await getProfile(rotated.baseUrl, cookie)).status, 401);
  assert.equal(
    (await fetch(`${rotated.baseUrl}/_devtools/api/requests`, { headers: { cookie } })).status,
    401,
  );

  const freshCookie = await loginAndGetCookie(rotated.baseUrl, "admin", "new-password");
  assert.equal((await getProfile(rotated.baseUrl, freshCookie)).status, 200);
});

test("sessions are invalidated after the dashboard username changes and storage is reopened", async (t) => {
  useTemporaryWorkingDirectory(t);
  const first = await startApp(t);
  const cookie = await loginAndGetCookie(first.baseUrl, "admin", "correct-password");
  await first.stop();

  const renamed = await startApp(t, { username: "new-admin", password: "correct-password" });
  assert.equal(countSessionRows(), 0);
  assert.equal((await getProfile(renamed.baseUrl, cookie)).status, 401);
});
