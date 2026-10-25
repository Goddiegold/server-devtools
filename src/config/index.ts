
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
        SCHEMA_VERSION: 1
    },
    REDACTED_KEY: "[REDACTED]"
}
