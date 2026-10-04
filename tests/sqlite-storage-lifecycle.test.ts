import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";

import SQLiteStorage from "../src/storage/sqlite-storage";

function span() {
    return {
        traceId: "lifecycle-trace",
        spanId: "lifecycle-span",
        type: "http.server",
        name: "GET /lifecycle",
        startedAt: 1,
        durationMs: 1,
        attributes: {},
        status: { code: 0 },
    } as const;
}

test("close waits for accepted writes before closing the database", async () => {
    const directory = mkdtempSync(join(tmpdir(), "server-devtools-lifecycle-"));
    const path = join(directory, "storage.db");

    try {
        const storage = new SQLiteStorage(path);
        const write = storage.saveSpan(span());
        const close = storage.close();

        await Promise.all([write, close]);

        const database = new DatabaseSync(path);
        assert.equal(
            database.prepare("SELECT span_id FROM spans WHERE span_id = ?").get("lifecycle-span")?.span_id,
            "lifecycle-span",
        );
        database.close();
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});

test("concurrent close calls share one promise", async () => {
    const storage = new SQLiteStorage(":memory:");

    const firstClose = storage.close();
    const secondClose = storage.close();

    assert.strictEqual(firstClose, secondClose);
    await firstClose;
});

test("reads and writes reject after closing begins", async () => {
    const storage = new SQLiteStorage(":memory:");
    const close = storage.close();

    await assert.rejects(storage.getSpansByTraceId("closed"));
    await assert.rejects(storage.saveSpan(span()));
    await close;
});

test("close closes the database when initialization fails", async () => {
    const storage = new SQLiteStorage(":memory:");
    let closed = false;
    const failingDatabase = {
        prepare(): never {
            throw new Error("initialization failed");
        },
        close(): void {
            closed = true;
        },
    };
    (storage as unknown as { db: typeof failingDatabase }).db = failingDatabase;

    await assert.rejects(storage.close(), /initialization failed/);
    assert.equal(closed, true);
});

test("close propagates accepted write failures after all writes settle", async () => {
    const storage = new SQLiteStorage(":memory:");
    const writes = (storage as unknown as { pendingWrites: Set<Promise<void>> }).pendingWrites;
    let secondWriteSettled = false;
    writes.add(Promise.reject(new Error("first write failed")));
    writes.add(Promise.resolve().then(() => {
        secondWriteSettled = true;
    }));

    await assert.rejects(storage.close(), /first write failed/);
    assert.equal(secondWriteSettled, true);
});
