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

const requestFilterStorage = new SQLiteStorage(":memory:");
for (const request of [
    { traceId: "filter-before", startedAt: 1000 },
    { traceId: "filter-start", startedAt: 2000 },
    { traceId: "filter-middle", startedAt: 3000 },
    { traceId: "filter-end", startedAt: 4000 },
]) {
    const span: IDevToolsSpan = {
        traceId: request.traceId,
        spanId: `${request.traceId}-root`,
        type: "http.server",
        name: "GET /filtered",
        startedAt: request.startedAt,
        durationMs: 10,
        attributes: {
            "http.request.method": "GET",
            "url.path": "/filtered",
            "http.response.status_code": 200,
        },
        status: { code: 0 },
    };
    requestFilterStorage.saveTraceSummary(span);
}

const filteredRequests = requestFilterStorage.getPaginatedTraceSummaries(
    1,
    20,
    "",
    undefined,
    undefined,
    2000,
    4001,
);
assert.deepEqual(
    filteredRequests.summaries.map(summary => summary.traceId),
    ["filter-end", "filter-middle", "filter-start"],
);
assert.equal(filteredRequests.total, 3);
const exclusiveEndRequests = requestFilterStorage.getPaginatedTraceSummaries(
    1,
    20,
    "",
    undefined,
    undefined,
    2000,
    4000,
);
assert.deepEqual(
    exclusiveEndRequests.summaries.map(summary => summary.traceId),
    ["filter-middle", "filter-start"],
);
assert.equal(exclusiveEndRequests.total, 2);
requestFilterStorage.close();

const sortStorage = new SQLiteStorage(":memory:");
for (const request of [
    { traceId: "sort-z", startedAt: 1000, durationMs: 50, statusCode: 200, method: "GET", path: "/z" },
    { traceId: "sort-a", startedAt: 2000, durationMs: 50, statusCode: 500, method: "POST", path: "/a" },
    { traceId: "sort-missing", startedAt: 3000, durationMs: 1 },
    { traceId: "sort-b", startedAt: 4000, durationMs: 10, statusCode: 200, method: "GET", path: "/b" },
]) {
    const span: IDevToolsSpan = {
        traceId: request.traceId,
        spanId: `${request.traceId}-root`,
        type: "http.server",
        name: "GET /sorted",
        startedAt: request.startedAt,
        durationMs: request.durationMs,
        attributes: {
            ...(request.method ? { "http.request.method": request.method } : {}),
            ...(request.path ? { "url.path": request.path } : {}),
            ...(request.statusCode === undefined
                ? {}
                : { "http.response.status_code": request.statusCode }),
        },
        status: { code: 0 },
    };
    sortStorage.saveTraceSummary(span);
}
(sortStorage as any).db
    .prepare("UPDATE traces SET duration_ms = NULL WHERE trace_id = ?")
    .run("sort-missing");

const durationAscending = sortStorage.getPaginatedTraceSummaries(
    1,
    2,
    "",
    undefined,
    undefined,
    undefined,
    undefined,
    "durationMs",
    "asc",
);
assert.deepEqual(
    durationAscending.summaries.map(summary => summary.traceId),
    ["sort-b", "sort-a"],
);
assert.equal(durationAscending.total, 4);

const statusDescending = sortStorage.getPaginatedTraceSummaries(
    1,
    20,
    "",
    undefined,
    undefined,
    undefined,
    undefined,
    "statusCode",
    "desc",
);
assert.deepEqual(
    statusDescending.summaries.map(summary => summary.traceId),
    ["sort-a", "sort-b", "sort-z", "sort-missing"],
);

const methodAscending = sortStorage.getPaginatedTraceSummaries(
    1,
    20,
    "",
    undefined,
    undefined,
    undefined,
    undefined,
    "method",
    "asc",
);
assert.deepEqual(
    methodAscending.summaries.map(summary => summary.traceId),
    ["sort-b", "sort-z", "sort-a", "sort-missing"],
);
sortStorage.close();

// Overview aggregation uses one canonical trace row per incoming request,
// ignores the exclusive upper boundary, and safely handles incomplete rows.
const overviewStorage = new SQLiteStorage(":memory:");
const overviewNow = 100_000;
const overviewFrom = overviewNow - 60 * 60 * 1000;

function saveOverviewTrace(input: {
    traceId: string;
    startedAt: number;
    durationMs?: number;
    statusCode?: number;
    child?: boolean;
}): void {
    const root: IDevToolsSpan = {
        traceId: input.traceId,
        spanId: `${input.traceId}-root`,
        type: "http.server",
        name: "GET /overview",
        startedAt: input.startedAt,
        durationMs: input.durationMs ?? 1,
        attributes: {
            "http.request.method": "GET",
            "url.path": "/overview",
            ...(input.statusCode === undefined
                ? {}
                : { "http.response.status_code": input.statusCode }),
        },
        status: { code: 0 },
    };

    overviewStorage.saveSpan(root);
    if (input.child) {
        overviewStorage.saveSpan({
            traceId: input.traceId,
            spanId: `${input.traceId}-child`,
            parentSpanId: root.spanId,
            type: "database",
            name: "query",
            startedAt: input.startedAt + 1,
            durationMs: 50,
            attributes: {},
            status: { code: 0 },
        });
    }
    overviewStorage.saveTraceSummary(root);
    if (input.durationMs === undefined) {
        (overviewStorage as unknown as { db: DatabaseSync }).db
            .prepare("UPDATE traces SET duration_ms = NULL WHERE trace_id = ?")
            .run(input.traceId);
    }
}

saveOverviewTrace({
    traceId: "overview-boundary-start",
    startedAt: overviewFrom,
    durationMs: 99,
    statusCode: 500,
});
saveOverviewTrace({
    traceId: "overview-success",
    startedAt: overviewFrom + 1,
    durationMs: 100,
    statusCode: 200,
    child: true,
});
saveOverviewTrace({
    traceId: "overview-failure",
    startedAt: overviewFrom + 10,
    durationMs: 501,
    statusCode: 503,
});
saveOverviewTrace({
    traceId: "overview-missing-duration",
    startedAt: overviewFrom + 20,
    statusCode: 200,
});
saveOverviewTrace({
    traceId: "overview-boundary-end",
    startedAt: overviewNow,
    durationMs: 1,
    statusCode: 500,
});

const overview = overviewStorage.getOverview("1h", overviewNow);
assert.equal(overview.totalRequests, 4);
assert.equal(overview.errorRate, 2 / 4);
assert.equal(overview.averageLatencyMs, 700 / 3);
assert.equal(overview.slowRequests, 1);
assert.equal(overview.volume.reduce((sum, bucket) => sum + bucket.count, 0), 4);
assert.equal(overview.volume.every((bucket) => bucket.startAt < bucket.endAt), true);
assert.equal(overview.volume.some((bucket) => bucket.count === 0), true);
assert.deepEqual(
    overview.recentFailures.map((failure) => failure.id),
    ["overview-failure", "overview-boundary-start"],
);

const emptyOverview = overviewStorage.getOverview("15m", 0);
assert.equal(emptyOverview.totalRequests, 0);
assert.equal(emptyOverview.errorRate, 0);
assert.equal(emptyOverview.averageLatencyMs, 0);
assert.equal(emptyOverview.slowRequests, 0);
assert.equal(emptyOverview.recentFailures.length, 0);
assert.equal(emptyOverview.volume.reduce((sum, bucket) => sum + bucket.count, 0), 0);

for (const range of ["15m", "1h", "6h", "24h"] as const) {
    const rangeOverview = overviewStorage.getOverview(range, overviewNow);
    assert.equal(
        rangeOverview.volume.reduce((sum, bucket) => sum + bucket.count, 0),
        rangeOverview.totalRequests,
    );
    assert.equal(rangeOverview.from < rangeOverview.to, true);
}

overviewStorage.close();

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
