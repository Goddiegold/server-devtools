import { context } from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { Pool, type PoolClient } from "pg";

import EncryptDecryptService from "../security/encrypt-decrypt.service";
import {
    IDevToolsCurrentUser,
    IDevToolsSpan,
    IDevToolsTrace,
    IHttpClientDetails,
    ISession,
    ITraceMetadata,
    ITraceSummary,
} from "../types";
import { IStorage } from "../types";

type PgRow = Record<string, any>;

export default class PgStorage implements IStorage {
    private readonly pool: Pool;
    private initializationPromise?: Promise<void>;
    private readonly pendingOperations = new Set<Promise<unknown>>();
    private isClosing = false;
    private closePromise?: Promise<void>;

    constructor(
        connectionString: string,
        private readonly encryptionService?: EncryptDecryptService,
    ) {
        this.pool = new Pool({ connectionString });
    }

    initialize(): Promise<void> {
        if (!this.initializationPromise) {
            this.initializationPromise = (async () => {
                let client: PoolClient | undefined;

                try {
                    await context.with(suppressTracing(context.active()), async () => {
                        client = await this.pool.connect();

                        try {
                            await client.query("BEGIN");
                            await client.query(`
                                CREATE SCHEMA IF NOT EXISTS serverdevtools;

                                CREATE TABLE IF NOT EXISTS serverdevtools.spans (
                                    span_id TEXT PRIMARY KEY,
                                    trace_id TEXT NOT NULL,
                                    parent_span_id TEXT,
                                    type TEXT NOT NULL,
                                    name TEXT NOT NULL,
                                    started_at BIGINT NOT NULL,
                                    duration_ms DOUBLE PRECISION NOT NULL,
                                    attributes_json TEXT NOT NULL,
                                    status_json TEXT NOT NULL,
                                    error_json TEXT
                                );

                                CREATE INDEX IF NOT EXISTS idx_spans_trace_id
                                ON serverdevtools.spans(trace_id);

                                CREATE TABLE IF NOT EXISTS serverdevtools.traces (
                                    trace_id TEXT PRIMARY KEY,
                                    root_span_id TEXT,
                                    started_at BIGINT NOT NULL,
                                    duration_ms DOUBLE PRECISION,
                                    method TEXT,
                                    path TEXT,
                                    route TEXT,
                                    status_code INTEGER,
                                    has_error INTEGER NOT NULL DEFAULT 0,
                                    created_at BIGINT NOT NULL
                                );

                                CREATE INDEX IF NOT EXISTS idx_traces_started_at
                                ON serverdevtools.traces(started_at);

                                CREATE TABLE IF NOT EXISTS serverdevtools.trace_metadata (
                                    trace_id TEXT PRIMARY KEY,
                                    request_body TEXT,
                                    response_body TEXT,
                                    user_json TEXT
                                );

                                CREATE TABLE IF NOT EXISTS serverdevtools.sessions (
                                    session_hash TEXT PRIMARY KEY,
                                    username TEXT NOT NULL,
                                    created_at BIGINT NOT NULL,
                                    expires_at BIGINT NOT NULL
                                );

                                CREATE TABLE IF NOT EXISTS serverdevtools.http_client_details (
                                    span_id TEXT PRIMARY KEY,
                                    request_headers TEXT,
                                    request_body TEXT,
                                    response_headers TEXT,
                                    response_body TEXT
                                );
                            `);
                            await client.query("COMMIT");
                        } catch (error) {
                            try {
                                await client.query("ROLLBACK");
                            } catch {
                                // Preserve the schema error if rollback also fails.
                            }
                            throw error;
                        }
                    });
                } finally {
                    client?.release();
                }
            })();
        }

        return this.initializationPromise;
    }

    private withClient<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
        if (this.isClosing) {
            return Promise.reject(new Error("Storage is closing"));
        }

        const pendingOperation = this.initialize().then(() =>
            context.with(suppressTracing(context.active()), async () => {
                const client = await this.pool.connect();

                try {
                    return await operation(client);
                } finally {
                    client.release();
                }
            })
        );

        this.pendingOperations.add(pendingOperation);
        void pendingOperation.finally(() => {
            this.pendingOperations.delete(pendingOperation);
        }).catch(() => undefined);

        return pendingOperation;
    }

    private async transaction<T>(client: PoolClient, operation: () => Promise<T>): Promise<T> {
        await client.query("BEGIN");

        try {
            const result = await operation();
            await client.query("COMMIT");
            return result;
        } catch (error) {
            try {
                await client.query("ROLLBACK");
            } catch {
                // Preserve the original operation error if rollback also fails.
            }
            throw error;
        }
    }

    private serializeSensitiveValue(value: unknown): string {
        const encrypted = this.encryptionService
            ? this.encryptionService.encryptData(value)
            : value;

        return JSON.stringify(encrypted);
    }

    private deserializeSensitiveValue<T>(value: string): T {
        const parsed = JSON.parse(value);

        return this.encryptionService
            ? this.encryptionService.decryptData(parsed) as T
            : parsed as T;
    }

    private mapSpan(row: PgRow): IDevToolsSpan {
        return {
            spanId: row.span_id,
            traceId: row.trace_id,
            parentSpanId: row.parent_span_id ?? undefined,
            type: row.type,
            name: row.name,
            startedAt: Number(row.started_at),
            durationMs: Number(row.duration_ms),
            attributes: JSON.parse(row.attributes_json),
            status: JSON.parse(row.status_json),
            error: row.error_json ? JSON.parse(row.error_json) : undefined,
        };
    }

    private mapSummary(row: PgRow): ITraceSummary {
        const userJson = row.user_json !== null && row.user_json !== undefined
            ? JSON.parse(row.user_json)
            : undefined;

        return {
            traceId: row.trace_id,
            rootSpanId: row.root_span_id ?? undefined,
            startedAt: Number(row.started_at),
            durationMs: row.duration_ms ?? undefined,
            method: row.method ?? undefined,
            path: row.path ?? undefined,
            route: row.route ?? undefined,
            statusCode: row.status_code ?? undefined,
            hasError: row.has_error === 1,
            user: userJson !== undefined
                ? this.encryptionService
                    ? this.encryptionService.decryptData(userJson) as IDevToolsCurrentUser
                    : userJson as IDevToolsCurrentUser
                : undefined,
        };
    }

    saveSpan(span: IDevToolsSpan): Promise<void> {
        return this.withClient(async client => {
            await this.transaction(client, async () => {
                await client.query(`
                    INSERT INTO serverdevtools.spans (
                        span_id, trace_id, parent_span_id, type, name,
                        started_at, duration_ms, attributes_json, status_json, error_json
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (span_id) DO UPDATE SET
                        trace_id = EXCLUDED.trace_id,
                        parent_span_id = EXCLUDED.parent_span_id,
                        type = EXCLUDED.type,
                        name = EXCLUDED.name,
                        started_at = EXCLUDED.started_at,
                        duration_ms = EXCLUDED.duration_ms,
                        attributes_json = EXCLUDED.attributes_json,
                        status_json = EXCLUDED.status_json,
                        error_json = EXCLUDED.error_json
                `, [
                    span.spanId,
                    span.traceId,
                    span.parentSpanId ?? null,
                    span.type,
                    span.name,
                    span.startedAt,
                    span.durationMs,
                    JSON.stringify(span.attributes),
                    JSON.stringify(span.status),
                    span.error ? JSON.stringify(span.error) : null,
                ]);

                if (span.error) {
                    await client.query(`
                        UPDATE serverdevtools.traces
                        SET has_error = 1
                        WHERE trace_id = $1
                    `, [span.traceId]);
                }
            });
        });
    }

    async getSpansByTraceId(traceId: string): Promise<IDevToolsSpan[]> {
        return this.withClient(async client => {
            const result = await client.query(`
                SELECT
                    span_id, trace_id, parent_span_id, type, name,
                    started_at, duration_ms, attributes_json, status_json, error_json
                FROM serverdevtools.spans
                WHERE trace_id = $1
                ORDER BY started_at ASC
            `, [traceId]);

            return result.rows.map(row => this.mapSpan(row));
        });
    }

    async getTrace(traceId: string): Promise<IDevToolsTrace | undefined> {
        const spans = await this.getSpansByTraceId(traceId);

        if (spans.length === 0) {
            return undefined;
        }

        const rootSpan = spans.find(span => !span.parentSpanId);

        return {
            traceId,
            rootSpanId: rootSpan?.spanId,
            spans,
            startedAt: Math.min(...spans.map(span => span.startedAt)),
            durationMs: rootSpan?.durationMs,
        };
    }

    saveTraceSummary(span: IDevToolsSpan): Promise<void> {
        return this.withClient(async client => {
            if (span.parentSpanId) {
                return;
            }

            await this.transaction(client, async () => {
                const errorResult = await client.query(`
                    SELECT 1
                    FROM serverdevtools.spans
                    WHERE trace_id = $1 AND error_json IS NOT NULL
                    LIMIT 1
                `, [span.traceId]);
                const hasError = errorResult.rows.length > 0 ? 1 : 0;

                const method = typeof span.attributes["http.request.method"] === "string"
                    ? span.attributes["http.request.method"] : null;
                const path = typeof span.attributes["url.path"] === "string"
                    ? span.attributes["url.path"] : null;
                const route = typeof span.attributes["http.route"] === "string"
                    ? span.attributes["http.route"] : null;
                const statusCode = typeof span.attributes["http.response.status_code"] === "number"
                    ? span.attributes["http.response.status_code"] : null;

                await client.query(`
                    INSERT INTO serverdevtools.traces (
                        trace_id, root_span_id, started_at, duration_ms, method,
                        path, route, status_code, has_error, created_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (trace_id) DO UPDATE SET
                        root_span_id = EXCLUDED.root_span_id,
                        started_at = EXCLUDED.started_at,
                        duration_ms = EXCLUDED.duration_ms,
                        method = EXCLUDED.method,
                        path = EXCLUDED.path,
                        route = EXCLUDED.route,
                        status_code = EXCLUDED.status_code,
                        has_error = CASE
                            WHEN serverdevtools.traces.has_error = 1
                                OR EXCLUDED.has_error = 1
                            THEN 1 ELSE 0
                        END
                `, [
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
                ]);
            });
        });
    }

    async getTraceSummaries(): Promise<ITraceSummary[]> {
        return this.withClient(async client => {
            const result = await client.query(`
                SELECT t.*, tm.user_json
                FROM serverdevtools.traces t
                LEFT JOIN serverdevtools.trace_metadata tm ON tm.trace_id = t.trace_id
                ORDER BY t.started_at DESC
            `);

            return result.rows.map(row => this.mapSummary(row));
        });
    }

    async getPaginatedTraceSummaries(
        page: number,
        limit: number,
        search = "",
        method?: string,
        statusCode?: number,
    ): Promise<{ summaries: ITraceSummary[]; total: number; }> {
        return this.withClient(async client => {
            const offset = (page - 1) * limit;
            const conditions: string[] = [];
            const parameters: (string | number)[] = [];
            const normalizedSearch = search.trim();

            if (normalizedSearch) {
                const escapedSearch = normalizedSearch.replace(/[\\%_]/g, character => `\\${character}`);
                const searchPattern = `%${escapedSearch}%`;
                const start = parameters.length + 1;
                parameters.push(searchPattern, searchPattern, searchPattern);
                conditions.push(`(
                    t.path ILIKE $${start} ESCAPE '\\'
                    OR t.route ILIKE $${start + 1} ESCAPE '\\'
                    OR EXISTS (
                        SELECT 1 FROM serverdevtools.spans s
                        WHERE s.trace_id = t.trace_id
                          AND s.span_id = t.root_span_id
                          AND s.name ILIKE $${start + 2} ESCAPE '\\'
                    )
                )`);
            }

            const normalizedMethod = method?.trim();
            if (normalizedMethod) {
                parameters.push(normalizedMethod);
                conditions.push(`t.method ILIKE $${parameters.length}`);
            }

            if (statusCode !== undefined) {
                parameters.push(statusCode);
                conditions.push(`t.status_code = $${parameters.length}`);
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(" AND ")}` : "";
            const totalResult = await client.query(`
                SELECT COUNT(*) AS total
                FROM serverdevtools.traces t
                LEFT JOIN serverdevtools.trace_metadata tm ON tm.trace_id = t.trace_id
                ${whereClause}
            `, parameters);
            const rowsResult = await client.query(`
                SELECT t.*, tm.user_json
                FROM serverdevtools.traces t
                LEFT JOIN serverdevtools.trace_metadata tm ON tm.trace_id = t.trace_id
                ${whereClause}
                ORDER BY t.started_at DESC
                LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}
            `, [...parameters, limit, offset]);

            return {
                summaries: rowsResult.rows.map(row => this.mapSummary(row)),
                total: Number(totalResult.rows[0]?.total ?? 0),
            };
        });
    }

    saveRequestBody(traceId: string, body: unknown): Promise<void> {
        return this.withClient(async client => {
            await client.query(`
                INSERT INTO serverdevtools.trace_metadata (trace_id, request_body)
                VALUES ($1, $2)
                ON CONFLICT (trace_id) DO UPDATE SET request_body = EXCLUDED.request_body
            `, [traceId, this.serializeSensitiveValue(body)]);
        });
    }

    saveResponseBody(traceId: string, body: unknown): Promise<void> {
        return this.withClient(async client => {
            await client.query(`
                INSERT INTO serverdevtools.trace_metadata (trace_id, response_body)
                VALUES ($1, $2)
                ON CONFLICT (trace_id) DO UPDATE SET response_body = EXCLUDED.response_body
            `, [traceId, this.serializeSensitiveValue(body)]);
        });
    }

    async getTraceMetadata(traceId: string): Promise<ITraceMetadata | undefined> {
        return this.withClient(async client => {
            const result = await client.query(`
                SELECT request_body, response_body, user_json
                FROM serverdevtools.trace_metadata
                WHERE trace_id = $1
            `, [traceId]);
            const row = result.rows[0] as PgRow | undefined;

            if (!row) {
                return undefined;
            }

            const requestBody = row.request_body !== null && row.request_body !== undefined
                ? this.deserializeSensitiveValue(row.request_body) : undefined;
            const responseBody = row.response_body !== null && row.response_body !== undefined
                ? this.deserializeSensitiveValue(row.response_body) : undefined;
            const user = row.user_json !== null && row.user_json !== undefined
                ? this.deserializeSensitiveValue<IDevToolsCurrentUser>(row.user_json) : undefined;

            return {
                request: requestBody !== undefined ? { body: requestBody } : undefined,
                response: responseBody !== undefined ? { body: responseBody } : undefined,
                user,
            };
        });
    }

    deleteTrace(traceId: string): Promise<void> {
        return this.withClient(async client => {
            await this.transaction(client, async () => {
                await client.query(`
                    DELETE FROM serverdevtools.trace_metadata WHERE trace_id = $1
                `, [traceId]);
                await client.query(`
                    DELETE FROM serverdevtools.http_client_details
                    WHERE span_id IN (
                        SELECT span_id FROM serverdevtools.spans WHERE trace_id = $1
                    )
                `, [traceId]);
                await client.query(`
                    DELETE FROM serverdevtools.spans WHERE trace_id = $1
                `, [traceId]);
                await client.query(`
                    DELETE FROM serverdevtools.traces WHERE trace_id = $1
                `, [traceId]);
            });
        });
    }

    clearHistory(): Promise<void> {
        return this.withClient(async client => {
            await this.transaction(client, async () => {
                await client.query("DELETE FROM serverdevtools.trace_metadata");
                await client.query("DELETE FROM serverdevtools.spans");
                await client.query("DELETE FROM serverdevtools.traces");
                await client.query("DELETE FROM serverdevtools.http_client_details");
            });
        });
    }

    saveSession(session: ISession): Promise<void> {
        return this.withClient(async client => {
            await client.query(`
                INSERT INTO serverdevtools.sessions (
                    session_hash, username, created_at, expires_at
                ) VALUES ($1, $2, $3, $4)
            `, [session.sessionHash, session.username, session.createdAt, session.expiresAt]);
        });
    }

    async getSessionByHash(sessionHash: string): Promise<ISession | undefined> {
        return this.withClient(async client => {
            const result = await client.query(`
                SELECT session_hash, username, created_at, expires_at
                FROM serverdevtools.sessions
                WHERE session_hash = $1
            `, [sessionHash]);
            const row = result.rows[0] as PgRow | undefined;

            if (!row) {
                return undefined;
            }

            return {
                sessionHash: row.session_hash,
                username: row.username,
                createdAt: Number(row.created_at),
                expiresAt: Number(row.expires_at),
            };
        });
    }

    deleteSession(sessionHash: string): Promise<void> {
        return this.withClient(async client => {
            await client.query(`
                DELETE FROM serverdevtools.sessions WHERE session_hash = $1
            `, [sessionHash]);
        });
    }

    saveCurrentUser(traceId: string, user: IDevToolsCurrentUser): Promise<void> {
        return this.withClient(async client => {
            await client.query(`
                INSERT INTO serverdevtools.trace_metadata (trace_id, user_json)
                VALUES ($1, $2)
                ON CONFLICT (trace_id) DO UPDATE SET user_json = EXCLUDED.user_json
            `, [traceId, this.serializeSensitiveValue(user)]);
        });
    }

    updateHttpClientDetails(
        spanId: string,
        details: Partial<Omit<IHttpClientDetails, "spanId">>,
    ): Promise<void> {
        return this.withClient(async client => {
            const fields: string[] = [];
            const values: (string | null)[] = [];
            const addField = (
                property: keyof Omit<IHttpClientDetails, "spanId">,
                column: string,
            ) => {
                if (!Object.prototype.hasOwnProperty.call(details, property)) {
                    return;
                }

                fields.push(`${column} = $${values.length + 1}`);
                const value = details[property];
                values.push(value === undefined ? null : this.serializeSensitiveValue(value));
            };

            addField("requestHeaders", "request_headers");
            addField("requestBody", "request_body");
            addField("responseHeaders", "response_headers");
            addField("responseBody", "response_body");

            if (fields.length === 0) {
                return;
            }

            await this.transaction(client, async () => {
                await client.query(`
                    INSERT INTO serverdevtools.http_client_details (span_id)
                    VALUES ($1)
                    ON CONFLICT (span_id) DO NOTHING
                `, [spanId]);
                await client.query(`
                    UPDATE serverdevtools.http_client_details
                    SET ${fields.join(", ")}
                    WHERE span_id = $${values.length + 1}
                `, [...values, spanId]);
            });
        });
    }

    async getHttpClientDetails(spanId: string): Promise<IHttpClientDetails | undefined> {
        return this.withClient(async client => {
            const result = await client.query(`
                SELECT span_id, request_headers, request_body,
                       response_headers, response_body
                FROM serverdevtools.http_client_details
                WHERE span_id = $1
            `, [spanId]);
            const row = result.rows[0] as PgRow | undefined;

            if (!row) {
                return undefined;
            }

            return {
                spanId: row.span_id,
                requestHeaders: row.request_headers
                    ? this.deserializeSensitiveValue(row.request_headers) : undefined,
                requestBody: row.request_body
                    ? this.deserializeSensitiveValue(row.request_body) : undefined,
                responseHeaders: row.response_headers
                    ? this.deserializeSensitiveValue(row.response_headers) : undefined,
                responseBody: row.response_body
                    ? this.deserializeSensitiveValue(row.response_body) : undefined,
            };
        });
    }

    close(): Promise<void> {
        if (this.closePromise) {
            return this.closePromise;
        }

        this.isClosing = true;
        this.closePromise = (async () => {
            let closeError: unknown;
            let hasCloseError = false;

            try {
                await this.initialize();
            } catch (error) {
                closeError = error;
                hasCloseError = true;
            }

            try {
                while (this.pendingOperations.size > 0) {
                    const operations = [...this.pendingOperations];
                    const results = await Promise.allSettled(operations);

                    for (let index = 0; index < results.length; index += 1) {
                        this.pendingOperations.delete(operations[index]);
                        const result = results[index];
                        if (result.status === "rejected" && !hasCloseError) {
                            closeError = result.reason;
                            hasCloseError = true;
                        }
                    }
                }

                if (hasCloseError) {
                    throw closeError;
                }
            } finally {
                await context.with(
                    suppressTracing(context.active()),
                    () => this.pool.end(),
                );
            }
        })();

        return this.closePromise;
    }
}
