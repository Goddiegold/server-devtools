import { Express } from "express";

import ServerDevTools from "../../src";
import { trace } from "@opentelemetry/api";

async function bootstrap() {
  const devtools = new ServerDevTools({
    encryption: {
      key: "K2I3QiRWSThQR2JWUHNbRXAmRXcuJChteVBCMDhCRTE=",
    },
    auth: {
      username: "godwin",
      password: "12345678",
    },
    getCurrentUser: (req) => {
      const user = (req as any).user;

      if (!user) {
        return undefined;
      }

      return {
        id: user.id,
        email: user.email,
        role: user.role,
      };
    },
  });

  // Instrumentation must start before MongoDB/Express/HTTP are loaded.
  await devtools.start();

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async function (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const beforeSpan = trace.getActiveSpan();

    console.log("FETCH BEFORE", {
      activeSpanId: beforeSpan?.spanContext().spanId,
    });

    const response = await originalFetch(input, init);

    const afterSpan = trace.getActiveSpan();

    console.log("FETCH AFTER", {
      activeSpanId: afterSpan?.spanContext().spanId,
    });

    return response;
  };

  const express = require("express");
  const { MongoClient } = require("mongodb");
  const http = require("node:http");

  const mongoClient = new MongoClient(
    "mongodb://localhost:27017",
  );

  await mongoClient.connect();

  const db = mongoClient.db("server_devtools");
  const users = db.collection("users");

  const app = express() as Express;

  app.use((req, res, next) => {
    devtools.middleware(req, res, next);
  });

  app.use((req, _res, next) => {
    (req as any).user = {
      id: "123",
      email: "godwin@example.com",
      role: "ADMIN",
    };

    next();
  });

  app.use(express.json());

  app.post("/users", async (req, res) => {
    const user = {
      ...req.body,
      createdAt: new Date(),
    };

    const result = await users.insertOne(user);

    res.status(201).json({
      id: result.insertedId,
      ...user,
    });
  });

  app.get("/stream-test", (_req, res) => {
    res.write("Hello ");
    res.write("from ");
    res.end("ServerDevTools");
  });

  app.post("/external-test", (req, res) => {
    console.log("SERVER RECEIVED BODY:", req.body);

    res.setHeader(
      "x-test-response",
      "hello-from-server",
    );

    res.json({
      received: req.body,
      secret: "response-secret",
    });
  });

  app.get("/users/:id", async (_req, res) => {
    await testNativeHttpRequest();

    res.json({
      success: true,
    });
  });

  app.get("/error-test", () => {
    throw new Error("ServerDevTools test error");
  });

  app.get("/fetch-test", async (_req, res) => {
    const response = await fetch(
      "http://localhost:3000/external-test",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-header": "fetch-test",
        },
        body: JSON.stringify({
          name: "Godwin",
          source: "fetch",
        }),
      },
    );

    const data = await response.json();

    res.json(data);
  });

  function testNativeHttpRequest() {
    return new Promise<void>((resolve, reject) => {
      const request = http.request(
        "http://localhost:3000/external-test",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-test-header": "serverdevtools-test",
            "x-another-header": "another-value",
          },
        },
        (response) => {
          const chunks: Buffer[] = [];

          response.on("data", (chunk) => {
            chunks.push(Buffer.from(chunk));
          });

          response.once("end", () => {
            console.log(
              "APPLICATION RECEIVED RESPONSE:",
              Buffer.concat(chunks).toString("utf8"),
            );

            resolve();
          });
        },
      );

      request.once("error", reject);

      request.write('{"name":');
      request.write('"Godwin",');
      request.end('"token":"fake-test-token"}');
    });
  }

  const PORT = 3000;

  app.listen(PORT, () => {
    console.log(`App: http://localhost:${PORT}`);
    console.log(
      `DevTools: http://localhost:${PORT}/_devtools`,
    );
  });
}

bootstrap();