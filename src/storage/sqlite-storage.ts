import { DatabaseSync } from "node:sqlite";
import { IDevToolsSpan, IDevToolsTrace, ITraceMetadata, ITraceSummary } from "../types";
import EncryptDecryptService from "../security/encrypt-decrypt.service";

export default class SQLiteStorage {
    private readonly db: DatabaseSync;

    constructor(path: string,
        private readonly encryptionService?: EncryptDecryptService,
    ) {
        this.db = new DatabaseSync(path);

        this.initialize();
    }

    private initialize(): void {
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
            response_body TEXT
        );
    `);
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
            has_error = excluded.has_error
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
            span.error ? 1 : 0,
            Date.now(),
        );
    }

    getTraceSummaries(): ITraceSummary[] {
        const statement = this.db.prepare(`
        SELECT
            trace_id,
            root_span_id,
            started_at,
            duration_ms,
            method,
            path,
            route,
            status_code,
            has_error
        FROM traces
        ORDER BY started_at DESC
    `);

        const rows = statement.all();

        return rows.map((row: any) => ({
            traceId: row.trace_id,
            rootSpanId: row.root_span_id ?? undefined,
            startedAt: row.started_at,
            durationMs: row.duration_ms ?? undefined,
            method: row.method ?? undefined,
            path: row.path ?? undefined,
            route: row.route ?? undefined,
            statusCode: row.status_code ?? undefined,
            hasError: row.has_error === 1,
        }));
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
            response_body
        FROM trace_metadata
        WHERE trace_id = ?
    `);

        const row = statement.get(traceId) as {
            request_body: string | null;
            response_body: string | null;
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
        };
    }

    close(): void {
        this.db.close();
    }
}