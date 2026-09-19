import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";

import SQLiteStorage from "../src/storage/sqlite-storage";
import EncryptDecryptService from "../src/security/encrypt-decrypt.service";
import { IDevToolsSpan } from "../src/types";

/**
 * Basic SQLite storage tests
 */

const storage = new SQLiteStorage(":memory:");

// Save root span
storage.saveSpan({
    traceId: "trace-1",
    spanId: "span-1",
    type: "http.server",
    name: "POST /users",
    startedAt: 1000,
    durationMs: 42,
    attributes: {
        "http.request.method": "POST",
    },
    status: {
        code: 0,
    },
});

// Verify single-span read
const spans = storage.getSpansByTraceId("trace-1");

assert.equal(spans.length, 1);
assert.equal(spans[0].spanId, "span-1");
assert.equal(spans[0].traceId, "trace-1");
assert.equal(spans[0].type, "http.server");

assert.deepEqual(spans[0].attributes, {
    "http.request.method": "POST",
});

assert.deepEqual(spans[0].status, {
    code: 0,
});

// Add child span
storage.saveSpan({
    traceId: "trace-1",
    spanId: "span-2",
    parentSpanId: "span-1",
    type: "database",
    name: "find users",
    startedAt: 1010,
    durationMs: 20,
    attributes: {
        "db.system": "mongodb",
    },
    status: {
        code: 0,
    },
});

// Verify complete trace reconstruction
const trace = storage.getTrace("trace-1");

assert.ok(trace);
assert.equal(trace.traceId, "trace-1");
assert.equal(trace.rootSpanId, "span-1");
assert.equal(trace.spans.length, 2);
assert.equal(trace.spans[0].spanId, "span-1");
assert.equal(trace.spans[1].spanId, "span-2");
assert.equal(trace.durationMs, 42);

// Verify missing trace
assert.equal(
    storage.getTrace("does-not-exist"),
    undefined,
);

// Save trace summary
storage.saveTraceSummary({
    traceId: "trace-1",
    spanId: "span-1",
    type: "http.server",
    name: "POST /users",
    startedAt: 1000,
    durationMs: 42,
    attributes: {
        "http.request.method": "POST",
        "url.path": "/users",
        "http.route": "/users",
        "http.response.status_code": 201,
    },
    status: {
        code: 0,
    },
});

// Verify trace summaries
const summaries = storage.getTraceSummaries();

assert.equal(summaries.length, 1);

assert.deepEqual(summaries[0], {
    traceId: "trace-1",
    rootSpanId: "span-1",
    startedAt: 1000,
    durationMs: 42,
    method: "POST",
    path: "/users",
    route: "/users",
    statusCode: 201,
    hasError: false,
    user: undefined,
});

const currentUser = {
    id: "user-1",
    email: "john@example.com",
};

// A user can be saved before the trace summary exists.
storage.saveCurrentUser("trace-before-summary", currentUser);
assert.deepEqual(storage.getTraceSummaries(), [summaries[0]]);

storage.saveTraceSummary({
    traceId: "trace-before-summary",
    spanId: "trace-before-summary-root",
    type: "http.server",
    name: "GET /profile",
    startedAt: 900,
    durationMs: 8,
    attributes: {
        "http.request.method": "GET",
    },
    status: {
        code: 0,
    },
});

assert.deepEqual(
    storage.getTraceSummaries().find(summary => summary.traceId === "trace-before-summary")?.user,
    currentUser,
);

// A user can also be saved after the trace summary already exists.
storage.saveCurrentUser("trace-1", currentUser);
assert.deepEqual(
    storage.getTraceSummaries().find(summary => summary.traceId === "trace-1")?.user,
    currentUser,
);

// Save request metadata
storage.saveRequestBody("trace-1", {
    email: "john@example.com",
    password: "secret",
});

// Save response metadata
storage.saveResponseBody("trace-1", {
    id: 123,
    success: true,
});

// Read metadata back
const metadata = storage.getTraceMetadata("trace-1");

assert.deepEqual(metadata, {
    request: {
        body: {
            email: "john@example.com",
            password: "secret",
        },
    },
    response: {
        body: {
            id: 123,
            success: true,
        },
    },
    user: currentUser,
});

// Updating user metadata preserves request and response metadata.
const updatedUser = { ...currentUser, role: "admin" };
storage.saveCurrentUser("trace-1", updatedUser);
assert.deepEqual(storage.getTraceMetadata("trace-1"), {
    ...metadata,
    user: updatedUser,
});

assert.deepEqual(
    storage.getTraceSummaries().find(summary => summary.traceId === "trace-before-summary")?.user,
    currentUser,
);

// Missing metadata
assert.equal(
    storage.getTraceMetadata("missing-trace"),
    undefined,
);

// Delete all persisted data for one trace.
storage.deleteTrace("trace-1");
storage.deleteTrace("trace-before-summary");

assert.equal(storage.getTrace("trace-1"), undefined);
assert.deepEqual(storage.getSpansByTraceId("trace-1"), []);
assert.equal(storage.getTraceMetadata("trace-1"), undefined);
assert.deepEqual(storage.getTraceSummaries(), []);

// Clear all history and verify the storage can be reused afterward.
for (const traceId of ["trace-2", "trace-3"]) {
    const rootSpan: IDevToolsSpan = {
        traceId,
        spanId: `${traceId}-root`,
        type: "http.server",
        name: "GET /health",
        startedAt: 2000,
        durationMs: 10,
        attributes: {
            "http.request.method": "GET",
        },
        status: {
            code: 0,
        },
    };

    storage.saveSpan(rootSpan);
    storage.saveTraceSummary(rootSpan);
    storage.saveRequestBody(traceId, { traceId });
    storage.saveResponseBody(traceId, { ok: true });
}

storage.clearHistory();

assert.deepEqual(storage.getTraceSummaries(), []);
assert.equal(storage.getTrace("trace-2"), undefined);
assert.equal(storage.getTrace("trace-3"), undefined);
assert.equal(storage.getTraceMetadata("trace-2"), undefined);
assert.equal(storage.getTraceMetadata("trace-3"), undefined);

const postClearTrace: IDevToolsSpan = {
    traceId: "trace-after-clear",
    spanId: "trace-after-clear-root",
    type: "http.server",
    name: "GET /after-clear",
    startedAt: 3000,
    durationMs: 5,
    attributes: {
        "http.request.method": "GET",
    },
    status: {
        code: 0,
    },
};

storage.saveSpan(postClearTrace);
storage.saveTraceSummary(postClearTrace);

assert.equal(storage.getTrace("trace-after-clear")?.traceId, "trace-after-clear");
assert.equal(storage.getTraceSummaries().length, 1);

storage.close();

/**
 * Schema version and migration tests
 */

function createTemporaryDatabasePath(prefix: string): {
    directory: string;
    path: string;
} {
    const directory = mkdtempSync(join(tmpdir(), prefix));

    return {
        directory,
        path: join(directory, "storage.db"),
    };
}

function getTableColumns(
    database: DatabaseSync,
    tableName: string,
): string[] {
    const rows = database
        .prepare(`PRAGMA table_info(${tableName})`)
        .all() as { name: string }[];

    return rows.map(row => row.name);
}

function getUserVersion(database: DatabaseSync): number {
    const row = database
        .prepare("PRAGMA user_version")
        .get() as { user_version: number };

    return row.user_version;
}

function getTableNames(database: DatabaseSync): string[] {
    const rows = database
        .prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
        `)
        .all() as { name: string }[];

    return rows.map(row => row.name);
}

{
    const temporaryDatabase = createTemporaryDatabasePath(
        "server-devtools-fresh-",
    );

    try {
        const storage = new SQLiteStorage(temporaryDatabase.path);
        storage.close();

        const database = new DatabaseSync(temporaryDatabase.path);

        assert.equal(getUserVersion(database), 1);

        const tableNames = getTableNames(database);

        for (const tableName of [
            "spans",
            "traces",
            "trace_metadata",
            "sessions",
            "http_client_details",
        ]) {
            assert.ok(tableNames.includes(tableName));
        }

        assert.ok(getTableColumns(database, "trace_metadata").includes("user_json"));

        database.close();
    } finally {
        rmSync(temporaryDatabase.directory, { recursive: true, force: true });
    }
}

{
    const temporaryDatabase = createTemporaryDatabasePath(
        "server-devtools-legacy-",
    );
    const legacyDatabase = new DatabaseSync(temporaryDatabase.path);

    legacyDatabase.exec(`
        PRAGMA user_version = 0;

        CREATE TABLE traces (
            trace_id TEXT PRIMARY KEY,
            root_span_id TEXT,
            started_at INTEGER NOT NULL,
            duration_ms REAL,
            method TEXT,
            path TEXT,
            route TEXT,
            status_code INTEGER,
            has_error INTEGER NOT NULL DEFAULT 0,
            user_json TEXT,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE trace_metadata (
            trace_id TEXT PRIMARY KEY,
            request_body TEXT,
            response_body TEXT
        );

        INSERT INTO traces (
            trace_id,
            root_span_id,
            started_at,
            duration_ms,
            method,
            path,
            route,
            status_code,
            has_error,
            user_json,
            created_at
        ) VALUES (
            'legacy-trace',
            'legacy-root',
            1234,
            25,
            'GET',
            '/legacy',
            '/legacy',
            200,
            0,
            '{"email":"legacy@example.com"}',
            1234
        );
    `);
    assert.equal(getUserVersion(legacyDatabase), 0);
    legacyDatabase.close();

    try {
        const storage = new SQLiteStorage(temporaryDatabase.path);
        const database = new DatabaseSync(temporaryDatabase.path);

        assert.equal(getUserVersion(database), 1);
        assert.equal(
            database
                .prepare("SELECT path FROM traces WHERE trace_id = ?")
                .get("legacy-trace")
                ?.path,
            "/legacy",
        );
        assert.equal(
            getTableColumns(database, "traces").includes("user_json"),
            false,
        );
        assert.ok(getTableColumns(database, "trace_metadata").includes("user_json"));

        for (const tableName of [
            "spans",
            "traces",
            "trace_metadata",
            "sessions",
            "http_client_details",
        ]) {
            assert.ok(getTableNames(database).includes(tableName));
        }

        assert.equal(storage.getTraceSummaries()[0]?.traceId, "legacy-trace");

        storage.close();
        database.close();
    } finally {
        rmSync(temporaryDatabase.directory, { recursive: true, force: true });
    }
}

{
    const temporaryDatabase = createTemporaryDatabasePath(
        "server-devtools-versioned-",
    );

    try {
        const storage = new SQLiteStorage(temporaryDatabase.path);
        storage.saveTraceSummary({
            traceId: "versioned-trace",
            spanId: "versioned-root",
            type: "http.server",
            name: "GET /versioned",
            startedAt: 4321,
            durationMs: 12,
            attributes: {
                "http.request.method": "GET",
            },
            status: {
                code: 0,
            },
        });
        storage.close();

        const reopenedStorage = new SQLiteStorage(temporaryDatabase.path);
        const database = new DatabaseSync(temporaryDatabase.path);

        assert.equal(getUserVersion(database), 1);
        assert.equal(
            reopenedStorage.getTraceSummaries()[0]?.traceId,
            "versioned-trace",
        );

        reopenedStorage.close();
        database.close();
    } finally {
        rmSync(temporaryDatabase.directory, { recursive: true, force: true });
    }
}

/**
 * Encryption-at-rest tests
 */

const encryptionKey = Buffer
    .from("12345678901234567890123456789012")
    .toString("base64");

const encryptionService = new EncryptDecryptService(
    encryptionKey,
    [
        "password",
        "accessToken",
        "authorization",
    ],
);

const encryptedDbPath =
    "./server-devtools-encryption-test.db";

// Ensure an old failed test run cannot pollute this test
try {
    unlinkSync(encryptedDbPath);
} catch {
    // File does not exist
}

const encryptedStorage = new SQLiteStorage(
    encryptedDbPath,
    encryptionService,
);

const requestBody = {
    email: "john@example.com",
    password: "super-secret",
    profile: {
        name: "John",
        accessToken: "abc-123",
    },
};

const responseBody = {
    success: true,
    authorization: "Bearer secret-token",
};

encryptedStorage.saveRequestBody(
    "encrypted-trace",
    requestBody,
);

encryptedStorage.saveResponseBody(
    "encrypted-trace",
    responseBody,
);

const encryptedUser = {
    email: "john@example.com",
    password: "user-secret",
};

encryptedStorage.saveCurrentUser(
    "encrypted-trace",
    encryptedUser,
);

/**
 * Public read should decrypt everything back to
 * its original representation.
 */
const encryptedMetadata =
    encryptedStorage.getTraceMetadata(
        "encrypted-trace",
    );

assert.deepEqual(encryptedMetadata, {
    request: {
        body: requestBody,
    },
    response: {
        body: responseBody,
    },
    user: encryptedUser,
});

encryptedStorage.close();

/**
 * Inspect SQLite directly.
 *
 * Sensitive values must NOT exist in plaintext
 * inside the persisted JSON.
 */
const rawDb = new DatabaseSync(encryptedDbPath);

const rawRow = rawDb.prepare(`
    SELECT
        request_body,
        response_body,
        user_json
    FROM trace_metadata
    WHERE trace_id = ?
`).get("encrypted-trace") as {
    request_body: string;
    response_body: string;
    user_json: string;
} | undefined;

assert.ok(rawRow);

// Sensitive request values should not be plaintext
assert.equal(
    rawRow.request_body.includes("super-secret"),
    false,
);

assert.equal(
    rawRow.request_body.includes("abc-123"),
    false,
);

// Sensitive response value should not be plaintext
assert.equal(
    rawRow.response_body.includes(
        "Bearer secret-token",
    ),
    false,
);

// Non-sensitive values should remain readable
assert.equal(
    rawRow.request_body.includes(
        "john@example.com",
    ),
    true,
);

assert.equal(
    rawRow.request_body.includes("John"),
    true,
);

// Verify our encrypted format actually exists on disk
assert.equal(
    rawRow.request_body.includes("sdt:v1:"),
    true,
);

assert.equal(
    rawRow.response_body.includes("sdt:v1:"),
    true,
);

assert.equal(rawRow.user_json.includes("user-secret"), false);
assert.equal(rawRow.user_json.includes("sdt:v1:"), true);

rawDb.close();

// Clean up temporary database
unlinkSync(encryptedDbPath);

console.log("sqlite storage tests passed");
