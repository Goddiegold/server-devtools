
export default {
    get SERVER_DEVTOOLS_DEBUG() {
        return process.env.SERVER_DEVTOOLS_DEBUG === 'true';
    },
    DASHBOARD_API_ROUTES: {
        TRACES: '/_devtools/api/traces',
        REQUESTS: '/_devtools/api/requests',
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
    STORAGE: {
        SCHEMA_VERSION: 1
    }
}
