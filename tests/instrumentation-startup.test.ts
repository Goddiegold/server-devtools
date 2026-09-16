import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import ServerDevTools from "../src/index";
import { Instrumentation } from "../src/instrumentation/instrumentation";
import SQLiteStorage from "../src/storage/sqlite-storage";

test("constructing ServerDevTools does not wrap global fetch", (t) => {
  const originalFetch = globalThis.fetch;
  const previousDirectory = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "server-devtools-construction-"));

  process.chdir(directory);
  try {
    const devtools = new ServerDevTools({ auth: { username: "user", password: "pass" } });
    assert.equal(globalThis.fetch, originalFetch);
    (devtools as unknown as { storage: SQLiteStorage }).storage.close();
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
  storage.close = () => {
    storageClosed = true;
    closeStorage();
  };
  const sdk = (instrumentation as unknown as {
    oTelSdk: { shutdown: () => Promise<void> };
  }).oTelSdk;
  sdk.shutdown = async () => { throw shutdownError; };

  await assert.rejects(instrumentation.shutdown(), shutdownError);
  assert.equal(storageClosed, true);
  await assert.doesNotReject(instrumentation.shutdown());
});
