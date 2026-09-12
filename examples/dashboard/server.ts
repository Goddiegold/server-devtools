// import express from "express";

import { Express } from "express";
import ServerDevTools from "../../src";

async function bootstrap() {
  const devtools = new ServerDevTools({
    encryption: {
      key: "K2I3QiRWSThQR2JWUHNbRXAmRXcuJChteVBCMDhCRTE="
    }
  });

  // Start OpenTelemetry instrumentation BEFORE loading/starting
  // the application.
  await devtools.start();

  // const { default: express } = await import("express");
  const express = require("express");
  const app = express() as Express;

  app.use(express.json());
  // ServerDevTools runs on the SAME Express server.
  // app.use("/_devtools", (req, res) => {
  //     devtools.handle(req, res);
  // });

  app.use((req, res, next) => {
    devtools.middleware(req, res)

    // if (req.url.startsWith("/_devtools")) {
    //   console.log({
    //     method: req.method,
    //     url: req.url,
    //   });
    //   devtools.handle(req, res);
    //   return;
    // }

    next();
  });

  app.get("/users/:id", async (req, res) => {
    const response = await fetch('https://example.com');

    await response.text();
    res.json({
      id: req.params.id,
      name: "John Doe",
    });
  });

  app.post("/users", (req, res) => {
    res
      .status(201)
      .set({
        "X-Test-Header": "server-devtools",
        "X-Request-Source": "users-api",
      })
      .json({
        received: req.body,
      });
  });

  app.get("/stream-test", (_req, res) => {
    res.write("Hello ");
    res.write("from ");
    res.end("ServerDevTools");
  });

  app.get("/error-test", () => {
    throw new Error("ServerDevTools test error");
  });

  const PORT = 3000;

  app.listen(PORT, () => {
    console.log(`App: http://localhost:${PORT}`);
    console.log(`DevTools: http://localhost:${PORT}/_devtools`);
  });
}

bootstrap();