import { DatabaseSync } from "node:sqlite";
import { IDevToolsCurrentUser, IDevToolsSpan, IDevToolsTrace, IHttpClientDetails, ISession, ITraceMetadata, ITraceSummary } from "../types";
import EncryptDecryptService from "../security/encrypt-decrypt.service";


interface ISessionRow {
    session_hash: string;
    username: string;
    created_at: number;
    expires_at: number;
}
export default class SQLiteStorage {
    private readonly db: DatabaseSync;

    constructor(path: string,
        private readonly encryptionService?: EncryptDecryptService,
    ) {
        this.db = new DatabaseSync(path);

        this.initialize();
    }

    private getSchemaVersion(): number {
        const row = this.db
            .prepare("PRAGMA user_version")
            .get() as { user_version: number };

        return row.user_version;
    }

    private setSchemaVersion(version: number): void {
        this.db.exec(`PRAGMA user_version = ${version}`);
    }

    private initializeV1Schema(): void {
        this.db.exec(`
        CREATE TABLE IF NOT EXISTS spans (
            span_id TEXT PRIMARY KEY,
            trace_id TEXT NOT NULL,
            parent_span_id TEXT,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            started_at INTEGER NOT NULL,
            duration_ms REAL NOT NULL,
            attributes_json TEXT NOT NULL,
            status_json TEXT NOT NULL,
            error_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_spans_trace_id
        ON spans(trace_id);

        CREATE TABLE IF NOT EXISTS traces (
            trace_id TEXT PRIMARY KEY,
            root_span_id TEXT,
            started_at INTEGER NOT NULL,
            duration_ms REAL,
            method TEXT,
            path TEXT,
            route TEXT,
            status_code INTEGER,
            has_error INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_traces_started_at
        ON traces(started_at);

        CREATE TABLE IF NOT EXISTS trace_metadata (
            trace_id TEXT PRIMARY KEY,
            request_body TEXT,
            response_body TEXT,
            user_json TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            session_hash TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS http_client_details (
            span_id TEXT PRIMARY KEY,
            request_headers TEXT,
            request_body TEXT,
            response_headers TEXT,
            response_body TEXT
        );
    `);

        const traceColumns = this.db
            .prepare(`PRAGMA table_info(traces)`)
            .all() as { name: string }[];

        if (traceColumns.some(column => column.name === "user_json")) {
            this.db.exec(`ALTER TABLE traces DROP COLUMN user_json`);
        }

        const metadataColumns = this.db
            .prepare(`PRAGMA table_info(trace_metadata)`)
            .all() as { name: string }[];

        if (!metadataColumns.some(column => column.name === "user_json")) {
            this.db.exec(`ALTER TABLE trace_metadata ADD COLUMN user_json TEXT`);
        }
    }

    private initialize(): void {
        console.log("Schema version:", this.getSchemaVersion());

        this.initializeV1Schema();
    }

    private deserializeSensitiveValue<T>(value: string): T {
        const parsed = JSON.parse(value);

        return this.encryptionService
            ? (this.encryptionService.decryptData(parsed) as T)
            : (parsed as T);
    }

    private serializeSensitiveValue(value: unknown): string {
        const encrypted = this.encryptionService
            ? this.encryptionService.encryptData(value)
            : value;

        return JSON.stringify(encrypted);
    }

    saveSpan(span: IDevToolsSpan): void {
        const statement = this.db.prepare(`
        INSERT OR REPLACE INTO spans (
            span_id,
            trace_id,
            parent_span_id,
            type,
            name,
            started_at,
            duration_ms,
            attributes_json,
            status_json,
            error_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        statement.run(
            span.spanId,
            span.traceId,
            span.parentSpanId ?? null,
            span.type,
            span.name,
            span.startedAt,
            span.durationMs,
            JSON.stringify(span.attributes),
            JSON.stringify(span.status),
            span.error
                ? JSON.stringify(span.error)
                : null,
        );

        // Handles the case where the trace summary already exists
        // when an errored child span arrives.
        if (span.error) {
            this.db.prepare(`
            UPDATE traces
            SET has_error = 1
            WHERE trace_id = ?
        `).run(span.traceId);
        }
    }

    getSpansByTraceId(traceId: string): IDevToolsSpan[] {
        const statement = this.db.prepare(`
        SELECT
            span_id,
            trace_id,
            parent_span_id,
            type,
            name,
            started_at,
            duration_ms,
            attributes_json,
            status_json,
            error_json
        FROM spans
        WHERE trace_id = ?
        ORDER BY started_at ASC
    `);

        const rows = statement.all(traceId);

        return rows.map((row: any) => ({
            spanId: row.span_id,
            traceId: row.trace_id,
            parentSpanId: row.parent_span_id ?? undefined,
            type: row.type,
            name: row.name,
            startedAt: row.started_at,
            durationMs: row.duration_ms,
            attributes: JSON.parse(row.attributes_json),
            status: JSON.parse(row.status_json),
            error: row.error_json
                ? JSON.parse(row.error_json)
                : undefined,
        }));
    }

    getTrace(traceId: string): IDevToolsTrace | undefined {
        const spans = this.getSpansByTraceId(traceId);

        if (spans.length === 0) {
            return undefined;
        }

        const rootSpan = spans.find(
            span => !span.parentSpanId
        );

        return {
            traceId,
            rootSpanId: rootSpan?.spanId,
            spans,
            startedAt: Math.min(
                ...spans.map(span => span.startedAt)
            ),
            durationMs: rootSpan?.durationMs,
        };
    }

    saveTraceSummary(span: IDevToolsSpan): void {
        if (span.parentSpanId) {
            return;
        }

        const method =
            typeof span.attributes["http.request.method"] === "string"
                ? span.attributes["http.request.method"]
                : null;

        const path =
            typeof span.attributes["url.path"] === "string"
                ? span.attributes["url.path"]
                : null;

        const statusCode =
            typeof span.attributes["http.response.status_code"] === "number"
                ? span.attributes["http.response.status_code"]
                : null;

        const route =
            typeof span.attributes["http.route"] === "string"
                ? span.attributes["http.route"]
                : null;

        // The error may exist on a child span rather than the root HTTP span.
        const errorSpan = this.db.prepare(`
        SELECT 1
        FROM spans
        WHERE trace_id = ?
          AND error_json IS NOT NULL
        LIMIT 1
    `).get(span.traceId);

        const hasError = errorSpan ? 1 : 0;

        const statement = this.db.prepare(`
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
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

        ON CONFLICT(trace_id) DO UPDATE SET
            root_span_id = excluded.root_span_id,
            started_at = excluded.started_at,
            duration_ms = excluded.duration_ms,
            method = excluded.method,
            path = excluded.path,
            route = excluded.route,
            status_code = excluded.status_code,
            has_error = CASE
                WHEN traces.has_error = 1
                    OR excluded.has_error = 1
                THEN 1
                ELSE 0
            END
    `);

        statement.run(
            span.traceId,
            span.spanId,
            span.startedAt,
            span.durationMs,
            method,
            path,
            route,
            statusCode,
            hasError,
            Date.now(),
        );
    }

    getTraceSummaries(): ITraceSummary[] {
        const statement = this.db.prepare(`
        SELECT
            t.*,
            tm.user_json
        FROM traces t
        LEFT JOIN trace_metadata tm
            ON tm.trace_id = t.trace_id
        ORDER BY started_at DESC
    `);

        const rows = statement.all();

        return rows.map((row: any) => {
            const userJson = row.user_json !== null
                ? JSON.parse(row.user_json)
                : undefined;

            return {
                traceId: row.trace_id,
                rootSpanId: row.root_span_id ?? undefined,
                startedAt: row.started_at,
                durationMs: row.duration_ms ?? undefined,
                method: row.method ?? undefined,
                path: row.path ?? undefined,
                route: row.route ?? undefined,
                statusCode: row.status_code ?? undefined,
                hasError: row.has_error === 1,
                user: userJson !== undefined
                    ? this.encryptionService
                        ? this.encryptionService.decryptData(userJson)
                        : userJson
                    : undefined,
            };
        });
    }

    getPaginatedTraceSummaries(page: number, limit: number): {
        summaries: ITraceSummary[];
        total: number;
    } {
        const offset = (page - 1) * limit;
        const totalRow = this.db.prepare(`
        SELECT COUNT(*) AS total
        FROM traces t
        LEFT JOIN trace_metadata tm
            ON tm.trace_id = t.trace_id
    `).get() as { total: number };

        const rows = this.db.prepare(`
        SELECT
            t.*,
            tm.user_json
        FROM traces t
        LEFT JOIN trace_metadata tm
            ON tm.trace_id = t.trace_id
        ORDER BY t.started_at DESC
        LIMIT ? OFFSET ?
    `).all(limit, offset);

        const summaries = rows.map((row: any) => {
            const userJson = row.user_json !== null
                ? JSON.parse(row.user_json)
                : undefined;

            return {
                traceId: row.trace_id,
                rootSpanId: row.root_span_id ?? undefined,
                startedAt: row.started_at,
                durationMs: row.duration_ms ?? undefined,
                method: row.method ?? undefined,
                path: row.path ?? undefined,
                route: row.route ?? undefined,
                statusCode: row.status_code ?? undefined,
                hasError: row.has_error === 1,
                user: userJson !== undefined
                    ? this.encryptionService
                        ? this.encryptionService.decryptData(userJson)
                        : userJson
                    : undefined,
            };
        });

        return { summaries, total: totalRow.total };
    }

    saveRequestBody(traceId: string, body: unknown): void {
        const statement = this.db.prepare(`
        INSERT INTO trace_metadata (
            trace_id,
            request_body
        )
        VALUES (?, ?)
        ON CONFLICT(trace_id) DO UPDATE SET
            request_body = excluded.request_body
    `);

        const data = this.encryptionService
            ? this.encryptionService.encryptData(body)
            : body;

        statement.run(
            traceId,
            JSON.stringify(data),
        );
    }

    saveResponseBody(traceId: string, body: unknown): void {
        const statement = this.db.prepare(`
        INSERT INTO trace_metadata (
            trace_id,
            response_body
        )
        VALUES (?, ?)
        ON CONFLICT(trace_id) DO UPDATE SET
            response_body = excluded.response_body
    `);

        const data = this.encryptionService
            ? this.encryptionService.encryptData(body)
            : body;

        statement.run(
            traceId,
            JSON.stringify(data),
        );
    }

    getTraceMetadata(traceId: string): ITraceMetadata | undefined {
        const statement = this.db.prepare(`
        SELECT
            request_body,
            response_body,
            user_json
        FROM trace_metadata
        WHERE trace_id = ?
    `);

        const row = statement.get(traceId) as {
            request_body: string | null;
            response_body: string | null;
            user_json: string | null
        } | undefined;

        if (!row) {
            return undefined;
        }

        const requestBody = row.request_body !== null
            ? JSON.parse(row.request_body)
            : undefined;

        const responseBody = row.response_body !== null
            ? JSON.parse(row.response_body)
            : undefined;

        const userJson = row.user_json !== null
            ? JSON.parse(row.user_json)
            : undefined;

        return {
            request: requestBody !== undefined
                ? {
                    body: this.encryptionService
                        ? this.encryptionService.decryptData(requestBody)
                        : requestBody,
                }
                : undefined,

            response: responseBody !== undefined
                ? {
                    body: this.encryptionService
                        ? this.encryptionService.decryptData(responseBody)
                        : responseBody,
                }
                : undefined,
            user: userJson !== undefined
                ? this.encryptionService
                    ? this.encryptionService.decryptData(userJson)
                    : userJson
                : undefined,
        };
    }

    deleteTrace(traceId: string): void {
        this.db.exec("BEGIN");

        try {
            this.db.prepare(`
            DELETE FROM trace_metadata
            WHERE trace_id = ?
        `).run(traceId);

            this.db.prepare(`
            DELETE FROM spans
            WHERE trace_id = ?
        `).run(traceId);

            this.db.prepare(`
            DELETE FROM traces
            WHERE trace_id = ?
        `).run(traceId);

            this.db.exec("COMMIT");
        } catch (error) {
            this.db.exec("ROLLBACK");
        }
    }

    clearHistory(): void {
        this.db.exec("BEGIN");

        try {
            this.db.exec(`
            DELETE FROM trace_metadata;
            DELETE FROM spans;
            DELETE FROM traces;
        `);

            this.db.exec("COMMIT");
        } catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }

    saveSession(session: ISession): void {
        this.db.prepare(`
        INSERT INTO sessions (
            session_hash,
            username,
            created_at,
            expires_at
        )
        VALUES (?, ?, ?, ?)
    `).run(
            session.sessionHash,
            session.username,
            session.createdAt,
            session.expiresAt,
        );
    }

    getSessionByHash(sessionHash: string): ISession | undefined {
        const row = this.db.prepare(`
        SELECT
            session_hash,
            username,
            created_at,
            expires_at
        FROM sessions
        WHERE session_hash = ?
    `).get(sessionHash) as ISessionRow | undefined;

        if (!row) return undefined;

        return {
            sessionHash: row.session_hash,
            username: row.username,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
        };
    }

    deleteSession(sessionHash: string) {
        this.db.prepare(`
            DELETE FROM sessions
            WHERE session_hash = ?
        `).run(sessionHash);
    }

    saveCurrentUser(
        traceId: string,
        user: IDevToolsCurrentUser,
    ) {
        const processedUser = this.encryptionService
            ? this.encryptionService.encryptData(user)
            : user;

        const userJson = JSON.stringify(processedUser);

        this.db.prepare(`
        INSERT INTO trace_metadata (
            trace_id,
            user_json
        )
        VALUES (?, ?)
        ON CONFLICT(trace_id) DO UPDATE SET
            user_json = excluded.user_json
    `).run(traceId, userJson);
    }

    updateHttpClientDetails(
        spanId: string,
        details: Partial<Omit<IHttpClientDetails, "spanId">>,
    ): void {
        const fields: string[] = [];
        const values: (string | null)[] = [];

        if (Object.prototype.hasOwnProperty.call(details, "requestHeaders")) {
            fields.push("request_headers = ?");
            values.push(
                details.requestHeaders === undefined
                    ? null
                    : this.serializeSensitiveValue(details.requestHeaders),
            );
        }

        if (Object.prototype.hasOwnProperty.call(details, "requestBody")) {
            fields.push("request_body = ?");
            values.push(
                details.requestBody === undefined
                    ? null
                    : this.serializeSensitiveValue(details.requestBody),
            );
        }

        if (Object.prototype.hasOwnProperty.call(details, "responseHeaders")) {
            fields.push("response_headers = ?");
            values.push(
                details.responseHeaders === undefined
                    ? null
                    : this.serializeSensitiveValue(details.responseHeaders),
            );
        }

        if (Object.prototype.hasOwnProperty.call(details, "responseBody")) {
            fields.push("response_body = ?");
            values.push(
                details.responseBody === undefined
                    ? null
                    : this.serializeSensitiveValue(details.responseBody),
            );
        }

        if (fields.length === 0) {
            return;
        }

        const existing = this.db
            .prepare(`
      SELECT span_id
      FROM http_client_details
      WHERE span_id = ?
    `)
            .get(spanId);

        if (!existing) {
            this.db
                .prepare(`
        INSERT INTO http_client_details (span_id)
        VALUES (?)
      `)
                .run(spanId);
        }

        values.push(spanId);

        this.db
            .prepare(`
      UPDATE http_client_details
      SET ${fields.join(", ")}
      WHERE span_id = ?
    `)
            .run(...values);
    }

    getHttpClientDetails(
        spanId: string,
    ): IHttpClientDetails | undefined {
        const row = this.db
            .prepare(`
      SELECT
        span_id,
        request_headers,
        request_body,
        response_headers,
        response_body
      FROM http_client_details
      WHERE span_id = ?
    `)
            .get(spanId) as
            | {
                span_id: string;
                request_headers: string | null;
                request_body: string | null;
                response_headers: string | null;
                response_body: string | null;
            }
            | undefined;

        if (!row) {
            return undefined;
        }

        return {
            spanId: row.span_id,

            requestHeaders: row.request_headers
                ? this.deserializeSensitiveValue(row.request_headers)
                : undefined,

            requestBody: row.request_body
                ? this.deserializeSensitiveValue(row.request_body)
                : undefined,

            responseHeaders: row.response_headers
                ? this.deserializeSensitiveValue(row.response_headers)
                : undefined,

            responseBody: row.response_body
                ? this.deserializeSensitiveValue(row.response_body)
                : undefined,
        };
    }

    close(): void {
        this.db.close();
    }
}
