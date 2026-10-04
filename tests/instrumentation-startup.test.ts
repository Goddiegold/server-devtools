import assert from "node:assert/strict";
import { context, trace, Span } from "@opentelemetry/api";
import { mkdtempSync, rmSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import module from "node:module";

import ServerDevTools from "../src/index";
import { Instrumentation } from "../src/instrumentation/instrumentation";
import SQLiteStorage from "../src/storage/sqlite-storage";

test("startup shares ESM hook registration before OpenTelemetry starts", async (t) => {
  const hookKey = Symbol.for("server-devtools.opentelemetry.esm-hook-registered");
  const processState = process as typeof process & { [hookKey]?: boolean };
  const events: string[] = [];
  const register = t.mock.method(
    module,
    "register",
    (specifier: Parameters<typeof module.register>[0]) => {
    assert.match(String(specifier), /@opentelemetry[\\/]instrumentation[\\/]hook\.mjs/);
    events.push("register");
    },
  );
  const originalFetch = globalThis.fetch;
  const instances = [0, 1].map(() => new Instrumentation(new SQLiteStorage(":memory:")));
  t.after(async () => {
    for (const instance of instances) await instance.shutdown();
    globalThis.fetch = originalFetch;
    delete processState[hookKey];
  });
  for (const instance of instances) {
    const sdk = (instance as unknown as { oTelSdk: { start(): void } }).oTelSdk;
    t.mock.method(sdk, "start", () => { events.push("start"); });
  }

  assert.equal(register.mock.callCount(), 0);
  await Promise.all(instances.map((instance) => instance.start()));
  await instances[0].start();
  assert.equal(register.mock.callCount(), 1);
  assert.deepEqual(events, ["register", "start", "start", "start"]);
});

test("constructing ServerDevTools does not wrap global fetch", async (t) => {
  const originalFetch = globalThis.fetch;
  const previousDirectory = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "server-devtools-construction-"));

  process.chdir(directory);
  try {
    const devtools = new ServerDevTools({ auth: { username: "user", password: "pass" } });
    assert.equal(globalThis.fetch, originalFetch);
    await (devtools as unknown as { storage: SQLiteStorage }).storage.close();
  } finally {
    process.chdir(previousDirectory);
    rmSync(directory, { recursive: true, force: true });
  }

  t.after(() => {
    assert.equal(globalThis.fetch, originalFetch);
  });
});

test("Instrumentation.start enables fetch capture", async (t) => {
  const originalFetch = globalThis.fetch;
  const storage = new SQLiteStorage(":memory:");
  const instrumentation = new Instrumentation(storage);
  let shutDown = false;

  t.after(async () => {
    try {
      if (!shutDown) await instrumentation.shutdown();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  assert.equal(globalThis.fetch, originalFetch);
  await instrumentation.start();
  assert.notEqual(globalThis.fetch, originalFetch);
  await instrumentation.shutdown();
  shutDown = true;
  assert.equal(globalThis.fetch, originalFetch);
  await instrumentation.shutdown();
});

test("Instrumentation.shutdown closes storage when OpenTelemetry shutdown fails", async () => {
  const storage = new SQLiteStorage(":memory:");
  const instrumentation = new Instrumentation(storage);
  const shutdownError = new Error("OpenTelemetry shutdown failed");
  let storageClosed = false;
  const closeStorage = storage.close.bind(storage);
  storage.close = async () => {
    storageClosed = true;
    await closeStorage();
  };
  const sdk = (instrumentation as unknown as {
    oTelSdk: { shutdown: () => Promise<void> };
  }).oTelSdk;
  sdk.shutdown = async () => { throw shutdownError; };

  await assert.rejects(instrumentation.shutdown(), shutdownError);
  assert.equal(storageClosed, true);
  await assert.doesNotReject(instrumentation.shutdown());
});

test("response capture does not prevent the host response when persistence fails", async (t) => {
  const previousDirectory = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "server-devtools-response-failure-"));
  process.chdir(directory);

  const devtools = new ServerDevTools({ auth: { username: "user", password: "pass" } });
  const storage = (devtools as unknown as { storage: SQLiteStorage }).storage;
  const failingStorage = {
    saveResponseBody: () => {
      throw new Error("database unavailable");
    },
  } as unknown as SQLiteStorage;
  (devtools as unknown as { storage: SQLiteStorage }).storage = failingStorage;

  let originalEndCalls = 0;
  const response = {
    write: () => true,
    end: function () {
      originalEndCalls += 1;
      return this;
    },
    getHeader: () => undefined,
  } as unknown as ServerResponse;
  const span = {
    spanContext: () => ({
      traceId: "1".repeat(32),
      spanId: "2".repeat(16),
      traceFlags: 1,
    }),
  } as unknown as Span;

  try {
    context.with(trace.setSpan(context.active(), span), () => {
      devtools.middleware(
        { url: "/host", } as IncomingMessage,
        response,
        () => undefined,
      );

      assert.doesNotThrow(() => response.end("response body"));
    });

    assert.equal(originalEndCalls, 1);
  } finally {
    await storage.close();
    process.chdir(previousDirectory);
    rmSync(directory, { recursive: true, force: true });
  }

  t.after(() => {
    process.chdir(previousDirectory);
  });
});
