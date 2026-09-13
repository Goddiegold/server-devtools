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