// import express from "express";

import ServerDevTools from "../../src";

async function bootstrap() {
  const devtools = new ServerDevTools();

  // Start OpenTelemetry instrumentation BEFORE loading/starting
  // the application.
  await devtools.start();

    const { default: express } = await import("express");
  const app = express();

  // ServerDevTools runs on the SAME Express server.
  // app.use("/_devtools", (req, res) => {
  //     devtools.handle(req, res);
  // });

  app.use((req, res, next) => {
    if (req.url.startsWith("/_devtools")) {
      console.log({
        method: req.method,
        url: req.url,
      });
      devtools.handle(req, res);
      return;
    }

    next();
  });

  app.get("/users/:id", (req, res) => {
    res.json({
      id: req.params.id,
      name: "John Doe",
    });
  });

  const PORT = 3000;

  app.listen(PORT, () => {
    console.log(`App: http://localhost:${PORT}`);
    console.log(`DevTools: http://localhost:${PORT}/_devtools`);
  });
}

bootstrap();