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

![ServerDevTools demo](./assets/server-devtools-demo.gif)

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

------------------------------------------------------------------------

## Quick Start

ServerDevTools uses an authenticated, optionally encrypted initialization file.
Keep the credentials and encryption key in environment variables.

The encryption key must be a base64-encoded 32-byte key. Generate one with:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'
```

`fields` is optional. By default, ServerDevTools encrypts these field names:

- `password`
- `accessToken`
- `refreshToken`
- `authorization`
- `cookie`

Specifying `fields` replaces the default list; it does not extend it.

To customize the encrypted fields:

```ts
encryption: {
  key: process.env.SERVER_DEVTOOLS_ENCRYPTION_KEY!,
  fields: ["password", "authorization", "apiKey"],
},
```

`getCurrentUser` is optional. Use it when your application already exposes the
authenticated user on the request; ServerDevTools does not require a
Passport, JWT, or other authentication framework.

### Node.js / Express TypeScript

Create `server-devtools.ts`:

```ts
import ServerDevTools from "server-devtools";

export const devtools = new ServerDevTools({
  auth: {
    username: process.env.SERVER_DEVTOOLS_USERNAME!,
    password: process.env.SERVER_DEVTOOLS_PASSWORD!,
  },
  encryption: {
    key: process.env.SERVER_DEVTOOLS_ENCRYPTION_KEY!,
  },
  getCurrentUser: (req) => req.user,
});

await devtools.start();
```

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
tsx watch --import ./server-devtools.ts src/main.ts
```

The application can import the same instance normally and mount it in Express:

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

### Node.js / Express JavaScript

For JavaScript projects, create `server-devtools.js`:

```js
const ServerDevTools = require("server-devtools");

const devtools = new ServerDevTools({
  auth: {
    username: process.env.SERVER_DEVTOOLS_USERNAME,
    password: process.env.SERVER_DEVTOOLS_PASSWORD,
  },
  encryption: {
    key: process.env.SERVER_DEVTOOLS_ENCRYPTION_KEY,
  },
  getCurrentUser: (req) => req.user,
});

module.exports = { devtools };

void devtools.start();
```

Preload the JavaScript file normally:

```sh
node --import ./server-devtools.js src/main.js
```

In the application, import the same instance and mount it with:

```js
const express = require("express");
const { devtools } = require("../server-devtools.js");

const app = express();
app.use((req, res, next) => devtools.middleware(req, res, next));
app.listen(3000);
```

JavaScript projects do not need `allowJs`.

### NestJS

NestJS uses a different preload pattern. Create a plain `server-devtools.js`
outside `src`:

```js
const ServerDevTools = require("server-devtools");

const devtools = new ServerDevTools({
  auth: {
    username: process.env.SERVER_DEVTOOLS_USERNAME,
    password: process.env.SERVER_DEVTOOLS_PASSWORD,
  },
  encryption: {
    key: process.env.SERVER_DEVTOOLS_ENCRYPTION_KEY,
  },
  getCurrentUser: (req) => req.user,
});

globalThis.__serverDevtools = devtools;

void (async () => {
  await devtools.start();
})();
```

Enable JavaScript files in the Nest TypeScript configuration:

```json
{
  "compilerOptions": {
    "allowJs": true
  }
}
```

Start Nest with the preload file:

```sh
NODE_OPTIONS='--import ./server-devtools.js' nest start --watch
```

Do not create another `ServerDevTools` instance in `main.ts`. Retrieve the
preloaded instance instead:

```ts
// src/main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ServerDevToolsNestInterceptor } from "server-devtools/nestjs";
import ServerDevTools from "server-devtools";

declare global {
  var __serverDevtools: ServerDevTools | undefined;
}

async function bootstrap() {
  const devtools = globalThis.__serverDevtools;
  if (!devtools) {
    throw new Error(
      "ServerDevTools was not preloaded. Start Nest with NODE_OPTIONS='--import ./server-devtools.js'.",
    );
  }

  const app = await NestFactory.create(AppModule);
  app.use((req, res, next) => devtools.middleware(req, res, next));
  app.useGlobalInterceptors(
    new ServerDevToolsNestInterceptor(),
  );
  await app.listen(3000);
}

bootstrap();
```

This Nest-specific pattern initializes instrumentation before Nest and
application dependencies load, while avoiding a second ServerDevTools
initialization during watch mode.

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

## Examples

Working example applications are available if you want to see ServerDevTools
integrated into a real project.

### Express + TypeScript

[server-devtools-express-ts](https://github.com/Goddiegold/server-devtools-express-ts)

A minimal Express + TypeScript application showing ServerDevTools
initialization, preloading, middleware mounting, encryption configuration,
current-user capture, and request inspection.

### NestJS

[server-devtools-nestjs-test](https://github.com/Goddiegold/server-devtools-nestjs-test)

A minimal NestJS application showing the ServerDevTools preload setup,
middleware integration, NestJS error interceptor, encryption configuration,
current-user capture, and request inspection.

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
Application request and dependencies
    ↓
OpenTelemetry captures supported activity
    ↓
ServerDevTools maps captured spans and details
    ↓
Historical inspection data in SQLite
    ↓
Embedded dashboard on the application's HTTP server
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
-   NestJS middleware and error interception
-   MongoDB operations
-   native HTTP/HTTPS and fetch/Undici requests, including headers and bodies
-   OpenTelemetry-powered activity capture

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
Initialize + preload ServerDevTools
        ↓
Start application
        ↓
Open /_devtools
        ↓
Run and inspect requests
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
-   [x] Native HTTP/HTTPS and fetch/Undici inspection
-   [x] MongoDB inspection
-   [x] Error inspection
-   [x] NestJS integration and error interception
-   [x] Encryption at rest for selected fields
-   [ ] Request/response redaction
-   [ ] Body-size limits
-   [ ] Production-safe configuration
-   [ ] Broader NestJS compatibility
-   [x] Static dashboard packaging

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

Optional encryption at rest can protect configured fields in supported
captured data. It does not redact all captured data or replace application
security practices. The dashboard has authentication; use strong credentials
and restrict access to `/_devtools` through your network and deployment setup.

Automatic redaction and capture-size limits are not currently implemented.

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

Apache-2.0
