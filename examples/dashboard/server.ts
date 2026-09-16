import { Express } from "express";

import ServerDevTools from "../../src";

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

  const express = require("express");
  const { MongoClient } = require("mongodb");
  const http = require("node:http");

  const mongoClient = new MongoClient("mongodb://localhost:27017");
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

    res.setHeader("x-test-response", "hello-from-server");

    res.json({
      received: req.body,
      secret: "response-secret",
    });
  });

  app.get("/users/:id", async (_req, res) => {
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
            /*
             * TEST 3:
             * Can DevTools capture ALL response headers?
             */
            console.log("DEVTOOLS NATIVE RESPONSE HEADERS:", response.headers);

            console.log(
              "DEVTOOLS NATIVE RESPONSE RAW HEADERS:",
              response.rawHeaders,
            );

            /*
             * TEST 4:
             * Can DevTools observe the response body while the
             * application consumes the IncomingMessage normally?
             */
            const capturedResponseChunks: Buffer[] = [];

            response.on("data", (chunk) => {
              capturedResponseChunks.push(Buffer.from(chunk));
            });

            (async () => {
              const applicationResponseChunks: Buffer[] = [];

              for await (const chunk of response) {
                applicationResponseChunks.push(Buffer.from(chunk));
              }

              const devtoolsResponseBody = Buffer.concat(
                capturedResponseChunks,
              ).toString("utf8");

              const applicationResponseBody = Buffer.concat(
                applicationResponseChunks,
              ).toString("utf8");

              console.log(
                "DEVTOOLS NATIVE RESPONSE BODY:",
                devtoolsResponseBody,
              );

              console.log(
                "APPLICATION NATIVE RESPONSE BODY:",
                applicationResponseBody,
              );

              console.log(
                "RESPONSE BODIES MATCH:",
                devtoolsResponseBody === applicationResponseBody,
              );

              resolve();
            })().catch(reject);
          },
        );

        request.on("error", reject);

        /*
         * TEST 1:
         * Can DevTools capture ALL outbound request headers?
         */
        console.log(
          "DEVTOOLS NATIVE REQUEST HEADERS:",
          request.getHeaders(),
        );

        /*
         * TEST 2:
         * Can DevTools capture the complete request body across
         * multiple write() calls + the final end() chunk?
         */
        const originalWrite = request.write.bind(request);
        const originalEnd = request.end.bind(request);

        const capturedRequestChunks: Buffer[] = [];

        request.write = ((chunk: any, ...args: any[]) => {
          if (chunk !== undefined && chunk !== null) {
            capturedRequestChunks.push(Buffer.from(chunk));
          }

          return originalWrite(chunk, ...args);
        }) as typeof request.write;

        request.end = ((chunk?: any, ...args: any[]) => {
          if (chunk !== undefined && chunk !== null) {
            capturedRequestChunks.push(Buffer.from(chunk));
          }

          console.log(
            "DEVTOOLS NATIVE REQUEST BODY:",
            Buffer.concat(capturedRequestChunks).toString("utf8"),
          );

          return originalEnd(chunk, ...args);
        }) as typeof request.end;

        request.write('{"name":');
        request.write('"Godwin",');
        request.end('"token":"fake-test-token"}');
      });
    }

    await testNativeHttpRequest();

    res.json({
      success: true,
    });
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