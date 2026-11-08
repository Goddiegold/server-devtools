
export default {
    get SERVER_DEVTOOLS_DEBUG() {
        return process.env.SERVER_DEVTOOLS_DEBUG === 'true';
    },
    DASHBOARD_API_ROUTES: {
        TRACES: '/_devtools/api/traces',
        REQUESTS: '/_devtools/api/requests',
        OVERVIEW: '/_devtools/api/overview',
        AUTH: '/_devtools/api/auth'
    },
    DASHBOARD_CONTENT_TYPES: {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".json": "application/json; charset=utf-8",
    } as Record<string, string>,
    DASHBOARD_LOGIN_RATE_LIMIT: {
        POINTS: 5,
        DURATION_SECONDS: 15 * 60,
        BLOCK_SECONDS: 15 * 60,
        MAX_TRACKED_KEYS: 1_000,
    },
    DASHBOARD_LOGIN_BODY_LIMIT_BYTES: 8 * 1024,
    DASHBOARD_LOGIN_BODY_READ_TIMEOUT_MS: 10 * 1000,
    REQUEST_METHOD: {
        GET: 'GET',
        POST: 'POST',
        PUT: 'PUT',
        DELETE: 'DELETE',
        PATCH: 'PATCH',
    },
    DEFAULT_FIELDS_TO_ENCRYPT: [
        "password",
        "accessToken",
        "refreshToken",
        "authorization",
        "cookie",
    ],
    DEFAULT_SENSITIVE_HEADER_NAMES: [
        "authorization",
        "proxy-authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
    ],
    NATIVE_HTTP_BODY_LIMIT_BYTES: 256 * 1024,
    STORAGE: {
        SCHEMA_VERSION: 2,
        BUSY_TIMEOUT_MS: 5_000,
    },
    REDACTED_KEY: "[REDACTED]"
}
