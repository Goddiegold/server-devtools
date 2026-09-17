# ServerDevTools

**Chrome DevTools for your backend.**

ServerDevTools is an embeddable backend inspector for Node.js
applications.

It gives you a live dashboard for inspecting:

-   incoming HTTP requests
-   request headers, params, query, and body
-   response status, headers, and body
-   execution flow
-   framework middleware and handlers
-   outgoing HTTP requests
-   database operations
-   errors
-   timing

Instead of jumping between logs, traces, and multiple observability
tools, ServerDevTools lets you inspect what your backend is doing from
one developer-focused interface.

------------------------------------------------------------------------

## Demo

> Add launch GIF/video here.

``` text
POST /users
   │
   ├── Express middleware
   ├── Request handler
   ├── MongoDB query
   └── External HTTP request
```

Open:

``` text
http://localhost:3000/_devtools
```

and inspect the complete request lifecycle.

------------------------------------------------------------------------

## Why ServerDevTools?

Frontend developers have Chrome DevTools.

Backend debugging often looks like this:

``` text
console.log(...)
tail logs
search logs
inspect database
check external API logs
open tracing platform
repeat
```

ServerDevTools provides a simpler workflow:

``` text
Run request
     ↓
Open /_devtools
     ↓
Inspect what happened
```

It is designed for **live backend debugging**, not as a replacement for
full production observability platforms.

------------------------------------------------------------------------

## Installation

``` bash
npm install server-devtools
```

> Package installation instructions may change before the first public
> release.

------------------------------------------------------------------------

## Quick Start

Create an initialization file that constructs and starts your own instance.
The filename and location are up to you; `server-devtools.ts` is used here as
an example.

```ts
// server-devtools.ts (example filename; choose your own)
import ServerDevTools from "server-devtools";

export const devtools = new ServerDevTools({
  auth: {
    username: process.env.SERVER_DEVTOOLS_USERNAME!,
    password: process.env.SERVER_DEVTOOLS_PASSWORD!,
  },
  // Optional: encrypt selected captured fields in SQLite.
  encryption: {
    key: process.env.SERVER_DEVTOOLS_ENCRYPTION_KEY!,
    fields: ["authorization", "password", "token"],
  },
});

await devtools.start();
```

### Encrypt sensitive data

ServerDevTools stores captured request/response data and inspection history in
SQLite. The optional `encryption` setting encrypts matching sensitive values
before they are persisted and decrypts them when authorized users inspect them
in the dashboard. This protects data at rest; it does not change application
payloads or transport behavior and does not replace normal application security.

- `key` is a base64-encoded key that decodes to exactly 32 bytes. ServerDevTools
  uses it with AES-256-GCM. Keep it in an environment variable or secrets
  manager; do not hardcode it.
- `fields` lists object field names to protect. Matching is case-insensitive
  and recursive through captured objects and arrays. Supplying `fields`
  replaces the defaults; when omitted, the defaults are `password`,
  `accessToken`, `refreshToken`, `authorization`, and `cookie`.

Generate a key with Node.js:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'
```

Preload the initialization file before your application entry point so
instrumentation starts before application modules load. In the examples below,
adjust the paths to match your own initialization file and entry point.
Preloading is required because ServerDevTools/OpenTelemetry must initialize
before instrumented dependencies such as MongoDB are loaded.

<details open>
<summary>Node.js / TypeScript</summary>

```ts
// src/main.ts
import { createServer } from "node:http";
import { devtools } from "../server-devtools";

const server = createServer((req, res) => {
  devtools.middleware(req, res, () => {
    res.statusCode = 404;
    res.end("Not found");
  });
});

server.listen(3000);
```

```sh
# Development
npx tsx --import ./server-devtools.ts src/main.ts

# Production
node --import ./dist/server-devtools.js ./dist/main.js
```

</details>

<details>
<summary>Express</summary>

```ts
// src/main.ts
import express from "express";
import { devtools } from "../server-devtools";

const app = express();
app.use((req, res, next) => devtools.middleware(req, res, next));

app.get("/users/:id", async (req, res) => {
  res.json({ id: req.params.id, name: "John Doe" });
});

app.listen(3000);
```

```sh
# Development
npx tsx --import ./server-devtools.ts src/main.ts

# Production
node --import ./dist/server-devtools.js ./dist/main.js
```

</details>

<details>
<summary>NestJS</summary>

```ts
// src/main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { devtools } from "../server-devtools";
import ServerDevToolsNestInterceptor from "server-devtools/dist/src/integrations/nestjs/server-devtools-nest.interceptor.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use((req, res, next) => devtools.middleware(req, res, next));
  app.useGlobalInterceptors(new ServerDevToolsNestInterceptor());
  await app.listen(3000);
}

bootstrap();
```

```sh
# Development
npx tsx --import ./server-devtools.ts src/main.ts

# Production
node --import ./dist/server-devtools.js ./dist/main.js
```

</details>

Each example imports and mounts the same instance that was started by the
preloaded initialization file. Its middleware serves the dashboard from the
application's existing HTTP server at `http://localhost:<your-port>/_devtools`.

OpenTelemetry and outbound fetch capture start when `devtools.start()` is
called; constructing the instance alone does not wrap `globalThis.fetch`.

Then open:

``` text
http://localhost:3000/_devtools
```

Make requests to your application and they will appear in the dashboard.

------------------------------------------------------------------------

## Request Inspector

Inspect the incoming request, including:

-   method
-   path
-   route
-   headers
-   query parameters
-   route parameters
-   request body

Example:

``` json
{
  "name": "John Doe",
  "email": "john@example.com"
}
```

------------------------------------------------------------------------

## Response Inspector

Inspect what your application returned:

-   status code
-   response headers
-   response body

Example:

``` json
{
  "received": {
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

------------------------------------------------------------------------

## Execution View

ServerDevTools reconstructs the execution hierarchy for each request.

``` text
POST /users
│
├── Express middleware
├── Request handler
├── MongoDB query
└── HTTP request
    └── api.example.com
```

This makes it easier to understand what your backend executed during a
request and where time was spent.

------------------------------------------------------------------------

## How It Works

ServerDevTools uses OpenTelemetry instrumentation to observe supported
backend operations.

``` text
Application
    ↓
OpenTelemetry Instrumentation
    ↓
ServerDevTools Span Mapper
    ↓
Trace Assembly
    ↓
In-memory Trace Store
    ↓
ServerDevTools Dashboard
```

OpenTelemetry provides the instrumentation layer. ServerDevTools
provides the developer-focused inspection experience on top of it.

------------------------------------------------------------------------

## Embedded Dashboard

ServerDevTools does not require a separate dashboard server. It mounts
directly into your existing application:

``` text
http://localhost:3000
│
├── /api/users
├── /api/orders
├── /api/...
└── /_devtools
```

------------------------------------------------------------------------

## Current Support

Initial support focuses on Node.js applications:

-   Node.js HTTP
-   Express
-   NestJS
-   MongoDB
-   outgoing HTTP requests
-   OpenTelemetry-compatible instrumentation

Support will expand as the project develops.

------------------------------------------------------------------------

## What ServerDevTools Is Not

ServerDevTools is not intended to replace full observability,
monitoring, alerting, or log aggregation platforms.

Its focus is:

> **Interactive inspection of individual backend requests.**

------------------------------------------------------------------------

## Development Status

ServerDevTools is currently under active development.

The first release focuses on making this workflow excellent:

``` text
Install ServerDevTools
        ↓
Open /_devtools
        ↓
Run a request
        ↓
Inspect request
        ↓
Inspect execution
        ↓
Inspect response
        ↓
Inspect errors
```

Expect APIs and configuration to evolve before `1.0`.

------------------------------------------------------------------------

## Roadmap

Near-term:

-   [x] HTTP request capture
-   [x] Request headers
-   [x] Query parameters
-   [x] Route parameters
-   [x] Request body
-   [x] HTTP response status
-   [x] Response headers
-   [x] Response body
-   [x] Execution tree
-   [x] Outgoing HTTP spans
-   [ ] Error inspection
-   [ ] Database inspection
-   [ ] Request/response redaction
-   [ ] Body-size limits
-   [ ] Production-safe configuration
-   [ ] Improved NestJS support
-   [ ] Static dashboard packaging

Future ideas:

-   Redis
-   PostgreSQL
-   MySQL
-   additional Node frameworks
-   trace filtering
-   request search
-   configurable retention
-   multi-instance support

------------------------------------------------------------------------

## Security

ServerDevTools may capture sensitive application data, including request
headers, request bodies, response bodies, database operations, and
external request metadata.

Do not expose the ServerDevTools dashboard publicly without appropriate
protection.

Production-safe redaction, capture limits, and access-control options
are being developed.

------------------------------------------------------------------------

## Philosophy

ServerDevTools should remain:

-   easy to install
-   easy to understand
-   framework-friendly
-   developer-focused
-   useful without requiring a full observability stack

The goal is simple:

> **Make backend debugging feel more like using browser DevTools.**

------------------------------------------------------------------------

## Contributing

The project is still early.

Issues, ideas, bug reports, and contributions are welcome.

------------------------------------------------------------------------

## License

MIT
