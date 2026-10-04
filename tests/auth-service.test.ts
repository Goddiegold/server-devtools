import assert from "node:assert/strict";
import { test } from "node:test";
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

test("creates and retrieves a session", async () => {
    const { authService } = createAuthService();

    const token = await authService.createSession("admin");

    assert.equal(typeof token, "string");
    assert.ok(token.length > 0);

    const session = await authService.getSession(token);

    assert.ok(session);
    assert.equal(session.username, "admin");
    assert.ok(session.createdAt <= Date.now());
    assert.ok(session.expiresAt > Date.now());
});

test("generates different tokens for different sessions", async () => {
    const { authService } = createAuthService();

    const firstToken = await authService.createSession("admin");
    const secondToken = await authService.createSession("admin");

    assert.notEqual(firstToken, secondToken);

    assert.ok(await authService.getSession(firstToken));
    assert.ok(await authService.getSession(secondToken));
});

test("returns undefined for unknown session token", async () => {
    const { authService } = createAuthService();

    const session = await authService.getSession(
        "invalid-session-token",
    );

    assert.equal(session, undefined);
});

test("deletes a session", async () => {
    const { authService } = createAuthService();

    const token = await authService.createSession("admin");

    assert.ok(await authService.getSession(token));

    await authService.deleteSession(token);

    assert.equal(
        await authService.getSession(token),
        undefined,
    );
});
