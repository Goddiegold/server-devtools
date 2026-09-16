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

  t.after(async () => {
    globalThis.fetch = originalFetch;
    await instrumentation.shutdown();
  });

  assert.equal(globalThis.fetch, originalFetch);
  await instrumentation.start();
  assert.notEqual(globalThis.fetch, originalFetch);
});
