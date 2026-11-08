import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import SQLiteStorage from "../src/storage/sqlite-storage";
import AuthService from "../src/security/auth.service";


function createAuthService() {
    const storage = new SQLiteStorage(":memory:");

    const authService = new AuthService(
        "admin",
        "test-password",
        storage,
    );

    return {
        storage,
        authService,
    };
}

test("validates correct credentials", () => {
    const { authService } = createAuthService();

    const result = authService.validateCredentials(
        "admin",
        "test-password",
    );

    assert.equal(result, true);
});

test("rejects invalid password", () => {
    const { authService } = createAuthService();

    const result = authService.validateCredentials(
        "admin",
        "wrong-password",
    );

    assert.equal(result, false);
});

test("rejects invalid username", () => {
    const { authService } = createAuthService();

    const result = authService.validateCredentials(
        "wrong-user",
        "test-password",
    );

    assert.equal(result, false);
});

test("creates and retrieves a session", () => {
    const { authService } = createAuthService();

    const token = authService.createSession("admin");

    assert.equal(typeof token, "string");
    assert.ok(token.length > 0);

    const session = authService.getSession(token);

    assert.ok(session);
    assert.equal(session.username, "admin");
    assert.ok(session.createdAt <= Date.now());
    assert.ok(session.expiresAt > Date.now());
});

test("generates different tokens for different sessions", () => {
    const { authService } = createAuthService();

    const firstToken = authService.createSession("admin");
    const secondToken = authService.createSession("admin");

    assert.notEqual(firstToken, secondToken);

    assert.ok(authService.getSession(firstToken));
    assert.ok(authService.getSession(secondToken));
});

test("returns undefined for unknown session token", () => {
    const { authService } = createAuthService();

    const session = authService.getSession(
        "invalid-session-token",
    );

    assert.equal(session, undefined);
});

test("deletes a session", () => {
    const { authService } = createAuthService();

    const token = authService.createSession("admin");

    assert.ok(authService.getSession(token));

    authService.deleteSession(token);

    assert.equal(
        authService.getSession(token),
        undefined,
    );
});
function createDatabasePath(t: TestContext): string {
    const directory = mkdtempSync(join(tmpdir(), "server-devtools-auth-sessions-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    return join(directory, "storage.db");
}

function openAuth(path: string, username = "admin", password = "test-password") {
    const storage = new SQLiteStorage(path);
    const authService = new AuthService(username, password, storage);
    return { storage, authService };
}

function countSessions(path: string): number {
    const database = new DatabaseSync(path);
    const row = database.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
    database.close();
    return row.count;
}

function saveRawSession(storage: SQLiteStorage, sessionHash: string, expiresAt: number) {
    storage.saveSession({ sessionHash, username: "admin", createdAt: 0, expiresAt });
}

test("removes expired sessions on initialization without touching valid ones", (t) => {
    const path = createDatabasePath(t);
    const first = openAuth(path);
    const validToken = first.authService.createSession("admin");
    saveRawSession(first.storage, "expired-1", Date.now() - 1);
    saveRawSession(first.storage, "expired-2", 1);
    first.storage.close();
    assert.equal(countSessions(path), 3);

    const restarted = openAuth(path);
    assert.equal(countSessions(path), 1);
    assert.equal(restarted.storage.getSessionByHash("expired-1"), undefined);
    assert.equal(restarted.storage.getSessionByHash("expired-2"), undefined);
    assert.equal(restarted.authService.getSession(validToken)?.username, "admin");
    restarted.storage.close();
});

test("removes expired sessions before creating a new session", (t) => {
    const path = createDatabasePath(t);
    const { storage, authService } = openAuth(path);
    const validToken = authService.createSession("admin");
    saveRawSession(storage, "expired-before-login", Date.now() - 1);
    assert.equal(countSessions(path), 2);

    const newToken = authService.createSession("admin");

    assert.equal(countSessions(path), 2);
    assert.equal(storage.getSessionByHash("expired-before-login"), undefined);
    assert.ok(authService.getSession(validToken));
    assert.ok(authService.getSession(newToken));
    storage.close();
});

test("does not create a session when expired-session cleanup fails", () => {
    const { storage, authService } = createAuthService();
    storage.deleteExpiredSessions = () => {
        throw new Error("cleanup failed");
    };
    let saved = false;
    storage.saveSession = () => {
        saved = true;
    };

    assert.throws(() => authService.createSession("admin"), /cleanup failed/);
    assert.equal(saved, false);
});

test("repeated initialization with unchanged credentials preserves sessions and the verifier", (t) => {
    const path = createDatabasePath(t);
    const first = openAuth(path);
    const token = first.authService.createSession("admin");
    const verifier = first.storage.getAuthCredentialVerifier();
    assert.ok(verifier);
    first.storage.close();

    for (let restart = 0; restart < 3; restart += 1) {
        const restarted = openAuth(path, " ADMIN ", "test-password");
        assert.deepEqual(restarted.storage.getAuthCredentialVerifier(), verifier);
        assert.equal(restarted.authService.getSession(token)?.username, "admin");
        restarted.storage.close();
    }

    assert.equal(countSessions(path), 1);
});

test("password rotation deletes every session row created under the old credentials", (t) => {
    const path = createDatabasePath(t);
    const first = openAuth(path);
    const token = first.authService.createSession("admin");
    first.authService.createSession("admin");
    const oldVerifier = first.storage.getAuthCredentialVerifier();
    first.storage.close();
    assert.equal(countSessions(path), 2);

    const rotated = openAuth(path, "admin", "new-password");
    assert.equal(countSessions(path), 0);
    assert.equal(rotated.authService.getSession(token), undefined);
    assert.notDeepEqual(rotated.storage.getAuthCredentialVerifier(), oldVerifier);

    const freshToken = rotated.authService.createSession("admin");
    rotated.storage.close();

    const restarted = openAuth(path, "admin", "new-password");
    assert.ok(restarted.authService.getSession(freshToken));
    restarted.storage.close();
});

test("username rotation deletes every session row created under the old credentials", (t) => {
    const path = createDatabasePath(t);
    const first = openAuth(path);
    const token = first.authService.createSession("admin");
    first.storage.close();

    const renamed = openAuth(path, "new-admin", "test-password");
    assert.equal(countSessions(path), 0);
    assert.equal(renamed.authService.getSession(token), undefined);
    renamed.storage.close();
});

test("rotating back to previous credentials does not resurrect deleted sessions", (t) => {
    const path = createDatabasePath(t);
    const first = openAuth(path);
    const token = first.authService.createSession("admin");
    first.storage.close();

    openAuth(path, "admin", "new-password").storage.close();
    const reverted = openAuth(path);
    assert.equal(reverted.authService.getSession(token), undefined);
    assert.equal(countSessions(path), 0);
    reverted.storage.close();
});

test("stores only a salted, non-plaintext credential verifier", (t) => {
    const path = createDatabasePath(t);
    openAuth(path, "admin", "test-password").storage.close();
    openAuth(path, "admin", "test-password-2").storage.close();

    const database = new DatabaseSync(path);
    const rows = database.prepare("SELECT * FROM auth_credentials").all() as Record<string, unknown>[];
    database.close();

    assert.equal(rows.length, 1);
    const serialized = JSON.stringify(rows);
    assert.equal(serialized.includes("test-password"), false);
    assert.equal(serialized.includes("admin"), false);
    assert.match(String(rows[0].salt), /^[0-9a-f]{32}$/);
    assert.match(String(rows[0].hash), /^[0-9a-f]{64}$/);
});

test("upgrading an existing installation clears legacy session rows once", (t) => {
    const path = createDatabasePath(t);
    new SQLiteStorage(path).close();
    const legacy = new DatabaseSync(path);
    legacy.exec(`
        DROP TABLE auth_credentials;
        PRAGMA user_version = 1;
        INSERT INTO traces (trace_id, started_at, created_at) VALUES ('kept-trace', 1, 1);
        INSERT INTO sessions (session_hash, username, created_at, expires_at)
        VALUES ('legacy-sha256-session', 'admin', 1, 9999999999999);
    `);
    legacy.close();

    const upgraded = openAuth(path);
    assert.equal(countSessions(path), 0);
    assert.ok(upgraded.storage.getAuthCredentialVerifier());
    assert.equal(upgraded.storage.getTraceSummaries()[0]?.traceId, "kept-trace");
    const token = upgraded.authService.createSession("admin");
    upgraded.storage.close();

    const restarted = openAuth(path);
    assert.ok(restarted.authService.getSession(token));
    restarted.storage.close();
});

test("credential-change cleanup failure is atomic and fails initialization", (t) => {
    const path = createDatabasePath(t);
    const first = openAuth(path);
    first.authService.createSession("admin");
    const oldVerifier = first.storage.getAuthCredentialVerifier();
    first.storage.close();

    const database = new DatabaseSync(path);
    database.exec(`
        CREATE TRIGGER block_verifier_update BEFORE INSERT ON auth_credentials
        BEGIN SELECT RAISE(ABORT, 'verifier write blocked'); END;
    `);
    database.close();

    const storage = new SQLiteStorage(path);
    assert.throws(
        () => new AuthService("admin", "new-password", storage),
        /verifier write blocked/,
    );
    assert.deepEqual(storage.getAuthCredentialVerifier(), oldVerifier);
    assert.equal(countSessions(path), 1);
    storage.close();
});

test("expired-session cleanup failure during initialization is not swallowed", () => {
    const storage = new SQLiteStorage(":memory:");
    storage.deleteExpiredSessions = () => {
        throw new Error("expired cleanup failed");
    };

    assert.throws(
        () => new AuthService("admin", "test-password", storage),
        /expired cleanup failed/,
    );
    storage.close();
});
