import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";

import Config from "../src/config";
import AuthService from "../src/security/auth.service";
import SQLiteStorage from "../src/storage/sqlite-storage";

interface ChildResult {
    username: string;
    password: string;
    token?: string;
    initError?: string;
    createError?: string;
}

const fixturePath = join(__dirname, "fixtures", "auth-session-process.ts");

function createDatabasePath(t: TestContext): string {
    const directory = mkdtempSync(join(tmpdir(), "server-devtools-auth-concurrency-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    return join(directory, "storage.db");
}

function countRows(path: string, table: string): number {
    const database = new DatabaseSync(path);
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    database.close();
    return row.count;
}

function getUserVersion(path: string): number {
    const database = new DatabaseSync(path);
    const row = database.prepare("PRAGMA user_version").get() as { user_version: number };
    database.close();
    return row.user_version;
}

function createVersionOneDatabase(path: string): void {
    new SQLiteStorage(path).close();
    const database = new DatabaseSync(path);
    database.exec(`
        DROP TABLE auth_credentials;
        PRAGMA user_version = 1;
        INSERT INTO traces (trace_id, started_at, created_at) VALUES ('kept-trace', 1, 1);
        INSERT INTO sessions (session_hash, username, created_at, expires_at)
        VALUES ('legacy-session', 'admin', 1, 9999999999999);
    `);
    database.close();
}

function runChild(path: string, username: string, password: string, startAt: number) {
    return new Promise<ChildResult>((resolve, reject) => {
        execFile(
            process.execPath,
            ["--import", "tsx", fixturePath, path, username, password, String(startAt)],
            { timeout: 30_000 },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`child failed: ${error.message}\n${stderr}`));
                    return;
                }
                resolve(JSON.parse(stdout) as ChildResult);
            },
        );
    });
}

function runConcurrently(path: string, credentials: [string, string][]) {
    const startAt = Date.now() + 2_000;
    return Promise.all(credentials.map(([username, password]) =>
        runChild(path, username, password, startAt)));
}

function useBusyTimeout(t: TestContext, timeoutMs: number) {
    const previous = Config.STORAGE.BUSY_TIMEOUT_MS;
    Config.STORAGE.BUSY_TIMEOUT_MS = timeoutMs;
    t.after(() => {
        Config.STORAGE.BUSY_TIMEOUT_MS = previous;
    });
}

test("concurrent first-time initialization across processes creates one verifier and keeps every session", async (t) => {
    const path = createDatabasePath(t);
    createVersionOneDatabase(path);

    const results = await runConcurrently(
        path,
        Array.from({ length: 6 }, () => ["admin", "shared-password"] as [string, string]),
    );

    for (const result of results) {
        assert.equal(result.initError, undefined);
        assert.equal(result.createError, undefined);
        assert.ok(result.token);
    }

    assert.equal(getUserVersion(path), 2);
    assert.equal(countRows(path, "auth_credentials"), 1);
    assert.equal(countRows(path, "traces"), 1);
    assert.equal(countRows(path, "sessions"), results.length);

    const storage = new SQLiteStorage(path);
    const authService = new AuthService("admin", "shared-password", storage);
    assert.equal(storage.getSessionByHash("legacy-session"), undefined);
    for (const result of results) {
        assert.ok(authService.getSession(result.token!));
    }
    storage.close();
});

test("concurrent rotations across processes leave only sessions valid for the final credentials", async (t) => {
    const path = createDatabasePath(t);
    new SQLiteStorage(path).close();

    const credentials: [string, string][] = [
        ["admin", "password-x"],
        ["admin", "password-y"],
        ["admin", "password-x"],
        ["admin", "password-y"],
        ["admin", "password-x"],
        ["admin", "password-y"],
    ];
    const results = await runConcurrently(path, credentials);

    for (const result of results) {
        assert.equal(result.initError, undefined);
        if (result.createError) {
            assert.match(result.createError, /credentials changed/);
        }
    }

    assert.equal(countRows(path, "auth_credentials"), 1);
    const totalRows = countRows(path, "sessions");

    const survivors: number[] = [];
    for (const password of ["password-x", "password-y"]) {
        const copyPath = `${path}.${password}`;
        copyFileSync(path, copyPath);
        const storage = new SQLiteStorage(copyPath);
        const authService = new AuthService("admin", password, storage);
        const remainingRows = countRows(copyPath, "sessions");
        const validTokens = results.filter(result =>
            result.token && authService.getSession(result.token)).length;

        assert.equal(remainingRows, validTokens);
        if (remainingRows === totalRows) {
            survivors.push(remainingRows);
        } else {
            assert.equal(remainingRows, 0);
        }
        storage.close();
    }

    assert.equal(survivors.length, totalRows === 0 ? 2 : 1);
});

test("verifier check, session deletion and verifier write happen under one write lock", (t) => {
    const path = createDatabasePath(t);
    const first = new SQLiteStorage(path);
    new AuthService("admin", "password-x", first);
    first.close();

    const probe = new DatabaseSync(path);
    t.after(() => probe.close());
    const prototype = AuthService.prototype as unknown as {
        credentialsMatch: (salt: string, hash: string) => boolean;
    };
    const originalCredentialsMatch = prototype.credentialsMatch;
    const probeErrors: string[] = [];
    prototype.credentialsMatch = function (this: unknown, salt: string, hash: string) {
        try {
            probe.exec(`
                INSERT INTO sessions (session_hash, username, created_at, expires_at)
                VALUES ('racing-session', 'admin', 1, 9999999999999)
            `);
        } catch (error) {
            probeErrors.push(error instanceof Error ? error.message : String(error));
        }
        return originalCredentialsMatch.call(this, salt, hash);
    };
    t.after(() => {
        prototype.credentialsMatch = originalCredentialsMatch;
    });

    const storage = new SQLiteStorage(path);
    new AuthService("admin", "password-y", storage);
    storage.close();

    assert.equal(probeErrors.length, 1);
    assert.match(probeErrors[0], /database is locked/);
    assert.equal(countRows(path, "sessions"), 0);
});

test("a process with stale credentials cannot create sessions after another process rotates them", (t) => {
    const path = createDatabasePath(t);
    const staleStorage = new SQLiteStorage(path);
    const staleAuth = new AuthService("admin", "password-x", staleStorage);
    const staleToken = staleAuth.createSession("admin");

    const currentStorage = new SQLiteStorage(path);
    const currentAuth = new AuthService("admin", "password-y", currentStorage);
    assert.equal(countRows(path, "sessions"), 0);

    assert.throws(() => staleAuth.createSession("admin"), /credentials changed/);
    assert.equal(countRows(path, "sessions"), 0);
    assert.equal(staleAuth.getSession(staleToken), undefined);

    const currentToken = currentAuth.createSession("admin");
    assert.ok(currentAuth.getSession(currentToken));
    assert.equal(countRows(path, "sessions"), 1);

    staleStorage.close();
    currentStorage.close();
});

test("lock contention fails cleanly and the database recovers once the lock is released", (t) => {
    useBusyTimeout(t, 50);
    const path = createDatabasePath(t);
    const storage = new SQLiteStorage(path);
    const authService = new AuthService("admin", "password-x", storage);
    const token = authService.createSession("admin");

    const holder = new DatabaseSync(path);
    t.after(() => holder.close());
    holder.exec("BEGIN IMMEDIATE");

    assert.throws(() => authService.createSession("admin"), /database is locked/);
    assert.throws(() => new AuthService("admin", "password-y", storage), /database is locked/);
    const connection = (storage as unknown as { db: DatabaseSync }).db;
    assert.equal(connection.isTransaction, false);

    holder.exec("ROLLBACK");
    assert.equal(countRows(path, "sessions"), 1);
    assert.ok(authService.getSession(token));

    new AuthService("admin", "password-y", storage);
    assert.equal(countRows(path, "sessions"), 0);
    storage.close();
});

test("schema migration under lock contention fails without partial upgrade and retries cleanly", (t) => {
    useBusyTimeout(t, 50);
    const path = createDatabasePath(t);
    createVersionOneDatabase(path);

    const holder = new DatabaseSync(path);
    t.after(() => holder.close());
    holder.exec("BEGIN IMMEDIATE");

    assert.throws(() => new SQLiteStorage(path), /database is locked/);
    holder.exec("ROLLBACK");
    assert.equal(getUserVersion(path), 1);
    assert.equal(countRows(path, "traces"), 1);

    const storage = new SQLiteStorage(path);
    assert.equal(getUserVersion(path), 2);
    storage.close();
});

test("a failed rotation leaves the same connection usable for a later rotation", (t) => {
    const path = createDatabasePath(t);
    const storage = new SQLiteStorage(path);
    new AuthService("admin", "password-x", storage).createSession("admin");

    const database = new DatabaseSync(path);
    database.exec(`
        CREATE TRIGGER block_verifier_write BEFORE INSERT ON auth_credentials
        BEGIN SELECT RAISE(ABORT, 'verifier write blocked'); END;
    `);

    assert.throws(() => new AuthService("admin", "password-y", storage), /verifier write blocked/);
    assert.equal((storage as unknown as { db: DatabaseSync }).db.isTransaction, false);
    assert.equal(countRows(path, "sessions"), 1);

    database.exec("DROP TRIGGER block_verifier_write");
    database.close();

    const rotated = new AuthService("admin", "password-y", storage);
    assert.equal(countRows(path, "sessions"), 0);
    assert.ok(rotated.getSession(rotated.createSession("admin")));
    storage.close();
});
