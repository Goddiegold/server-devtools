import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import DashboardServer from "../src/dashboard/dashboard-server";
import ServerDevTools from "../src/index";
import AuthService from "../src/security/auth.service";
import SQLiteStorage from "../src/storage/sqlite-storage";
import { parseAllowedIps } from "../src/utils/allowed-ips";

function useTemporaryWorkingDirectory(t: TestContext) {
    const previousDirectory = process.cwd();
    const directory = mkdtempSync(join(tmpdir(), "server-devtools-ip-allowlist-"));
    process.chdir(directory);
    t.after(() => {
        process.chdir(previousDirectory);
        rmSync(directory, { recursive: true, force: true });
    });
}

async function startServer(
    t: TestContext,
    options: {
        allowedIPs?: string[];
        listenHost?: string;
    } = {},
) {
    const devtools = new ServerDevTools({
        auth: {
            username: "admin",
            password: "correct-password",
        },
        allowedIPs: options.allowedIPs,
    });

    const listenHost = options.listenHost ?? "127.0.0.1";
    const server = http.createServer((req, res) => {
        devtools.middleware(req, res, () => {
            res.statusCode = 200;
            res.end("app");
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, listenHost, resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const bracketedHost = listenHost.includes(":")
        ? `[${listenHost}]`
        : listenHost;
    const baseUrl = `http://${bracketedHost}:${address.port}`;

    t.after(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        (devtools as unknown as { storage: SQLiteStorage }).storage.close();
    });

    return { devtools, baseUrl, listenHost };
}

test("parseAllowedIps rejects invalid configured addresses", () => {
    assert.throws(
        () => parseAllowedIps(["not-an-ip"]),
        /invalid IP address/,
    );
    assert.throws(
        () => parseAllowedIps(["192.168.1.0/24"]),
        /invalid IP address/,
    );
    assert.equal(parseAllowedIps(undefined), undefined);
    assert.equal(parseAllowedIps([]), undefined);
});

test("ServerDevTools validates allowedIPs during initialization", () => {
    assert.throws(
        () => new ServerDevTools({
            auth: { username: "admin", password: "correct-password" },
            allowedIPs: ["bad-ip"],
        }),
        /invalid IP address/,
    );
});

test("allows configured IPv4 access to dashboard login and API routes", async (t) => {
    useTemporaryWorkingDirectory(t);
    const { baseUrl } = await startServer(t, {
        allowedIPs: ["127.0.0.1"],
    });

    const loginResponse = await fetch(`${baseUrl}/_devtools/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "correct-password" }),
    });

    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);

    const profileResponse = await fetch(`${baseUrl}/_devtools/api/auth/profile`, {
        headers: { cookie: cookie! },
    });
    assert.equal(profileResponse.status, 200);

    const healthResponse = await fetch(`${baseUrl}/health`);
    assert.equal(healthResponse.status, 200);
    assert.equal(await healthResponse.text(), "app");
});

test("rejects requests from non-allowed IPv4 addresses", async (t) => {
    useTemporaryWorkingDirectory(t);
    const { baseUrl } = await startServer(t, {
        allowedIPs: ["192.0.2.10"],
    });

    for (const path of [
        "/_devtools/api/auth/login",
        "/_devtools/api/auth/profile",
        "/_devtools/",
    ]) {
        const response = await fetch(`${baseUrl}${path}`, {
            method: path.endsWith("/login") ? "POST" : "GET",
            headers: path.endsWith("/login")
                ? { "content-type": "application/json" }
                : undefined,
            body: path.endsWith("/login")
                ? JSON.stringify({ username: "admin", password: "correct-password" })
                : undefined,
        });

        assert.equal(response.status, 403, path);
        assert.deepEqual(await response.json(), { message: "Forbidden" });
    }
});

test("allows configured IPv6 access", async (t) => {
    useTemporaryWorkingDirectory(t);
    const { baseUrl } = await startServer(t, {
        allowedIPs: ["::1"],
        listenHost: "::1",
    });

    const loginResponse = await fetch(`${baseUrl}/_devtools/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "correct-password" }),
    });

    assert.equal(loginResponse.status, 200);
});

test("does not trust spoofed forwarded headers", async (t) => {
    useTemporaryWorkingDirectory(t);
    const { baseUrl } = await startServer(t, {
        allowedIPs: ["192.0.2.10"],
    });

    const response = await fetch(`${baseUrl}/_devtools/api/auth/login`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-forwarded-for": "192.0.2.10",
        },
        body: JSON.stringify({ username: "admin", password: "correct-password" }),
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { message: "Forbidden" });
});

test("blocked login attempts do not consume login rate-limit points", async (t) => {
    useTemporaryWorkingDirectory(t);
    const storage = new SQLiteStorage(":memory:");
    const authService = new AuthService("admin", "correct-password", storage);
    const dashboard = new DashboardServer(
        storage,
        authService,
        500,
        parseAllowedIps(["192.0.2.10"]),
    );

    const server = http.createServer((req, res) => {
        dashboard.handle(req, res);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    t.after(async () => {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        storage.close();
    });

    for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await fetch(`${baseUrl}/_devtools/api/auth/login`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-forwarded-for": "192.0.2.10",
            },
            body: JSON.stringify({ username: "admin", password: "wrong-password" }),
        });
        assert.equal(response.status, 403);
    }

    const allowedDashboard = new DashboardServer(storage, authService);
    const allowedServer = http.createServer((req, res) => {
        allowedDashboard.handle(req, res);
    });

    await new Promise<void>((resolve) => allowedServer.listen(0, "127.0.0.1", resolve));
    const allowedAddress = allowedServer.address();
    assert.ok(allowedAddress && typeof allowedAddress !== "string");

    t.after(async () => {
        allowedServer.closeAllConnections();
        await new Promise<void>((resolve) => allowedServer.close(() => resolve()));
    });

    const allowedBaseUrl = `http://127.0.0.1:${allowedAddress.port}`;
    const successfulLogin = await fetch(`${allowedBaseUrl}/_devtools/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "correct-password" }),
    });

    assert.equal(successfulLogin.status, 200);
});