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

### Express

``` ts
import ServerDevTools from "server-devtools";

async function bootstrap() {
  const devtools = new ServerDevTools();

  await devtools.start();

  const express = require("express");
  const app = express();

  app.use(express.json());

  app.use((req, res, next) => {
    devtools.middleware(req, res);

    if (req.url.startsWith("/_devtools")) {
      devtools.handle(req, res);
      return;
    }

    next();
  });

  app.get("/users/:id", async (req, res) => {
    res.json({
      id: req.params.id,
      name: "John Doe",
    });
  });

  app.listen(3000, () => {
    console.log("App: http://localhost:3000");
    console.log("ServerDevTools: http://localhost:3000/_devtools");
  });
}

bootstrap();
```

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
