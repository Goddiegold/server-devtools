import "dotenv/config";

import { Express } from "express";
import type { IncomingMessage } from "node:http";

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
  const { Pool } = require("pg");
  const mysql2 = require("mysql2");
  const Redis = require("ioredis");
  const http = require("node:http");

  const mongoClient = new MongoClient(
    "mongodb://localhost:27017",
  );

  await mongoClient.connect();

  const db = mongoClient.db("server_devtools");
  const users = db.collection("users");
  const postgresPool = new Pool({
    connectionString: "postgresql://mac@localhost:5432/server_devtools_test",
  });
  const mysql2Pool = mysql2
    .createPool(
      "mysql://devtools:devtools@localhost:3306/server_devtools_test",
    )
    .promise();
  const redis = new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    username: process.env.REDIS_USER,
    password: process.env.REDIS_PASSWORD,
    db: Number(process.env.REDIS_DB_INDEX ?? 0),
  });

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

  app.get("/postgres-users", async (_req, res) => {
    const result = await postgresPool.query("SELECT * FROM users");

    res.json(result.rows);
  });

  app.get("/postgres-select", async (_req, res) => {
    const result = await postgresPool.query("SELECT * FROM users");

    res.json(result.rows);
  });

  app.get("/postgres-select-parameterized", async (req, res) => {
    const result = await postgresPool.query(
      "SELECT * FROM users WHERE id = $1",
      [req.query.id],
    );

    res.json(result.rows);
  });

  app.post("/postgres-insert", async (req, res) => {
    const { name, email } = req.body;
    const result = await postgresPool.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *",
      [name, email],
    );

    res.status(201).json(result.rows[0]);
  });

  app.patch("/postgres-update/:id", async (req, res) => {
    const result = await postgresPool.query(
      "UPDATE users SET name = $1 WHERE id = $2 RETURNING *",
      [req.body.name, req.params.id],
    );

    res.json(result.rows[0] ?? null);
  });

  app.delete("/postgres-delete/:id", async (req, res) => {
    const result = await postgresPool.query(
      "DELETE FROM users WHERE id = $1 RETURNING *",
      [req.params.id],
    );

    res.json(result.rows[0] ?? null);
  });

  app.get("/postgres-failed", async (_req, res) => {
    try {
      await postgresPool.query("SELECT * FROM intentionally_missing_users");
      res.status(500).json({
        error: "Expected PostgreSQL query to fail",
      });
    } catch (_error) {
      res.status(500).json({
        error: "Intentional PostgreSQL query failure",
      });
    }
  });

  app.get("/mysql2-users", async (_req, res) => {
    try {
      const [rows] = await mysql2Pool.execute("SELECT * FROM users");

      res.json(rows);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/mysql2-users/:id", async (req, res) => {
    try {
      const [rows] = await mysql2Pool.execute(
        "SELECT * FROM users WHERE id = ?",
        [req.params.id],
      );

      res.json(rows);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/mysql2-users", async (req, res) => {
    try {
      const [result] = await mysql2Pool.execute(
        "INSERT INTO users (name, email) VALUES (?, ?)",
        [req.body.name, req.body.email],
      );

      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.put("/mysql2-users/:id", async (req, res) => {
    try {
      const [result] = await mysql2Pool.execute(
        "UPDATE users SET name = ?, email = ? WHERE id = ?",
        [req.body.name, req.body.email, req.params.id],
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.delete("/mysql2-users/:id", async (req, res) => {
    try {
      const [result] = await mysql2Pool.execute(
        "DELETE FROM users WHERE id = ?",
        [req.params.id],
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/mysql2-failed", async (_req, res) => {
    try {
      const [rows] = await mysql2Pool.execute(
        "SELECT * FROM intentionally_missing_users",
      );

      res.json(rows);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/redis-test/:key", async (req, res) => {
    try {
      const value = `server-devtools-test:${req.params.key}`;

      await redis.set(req.params.key, value, "EX", 30);
      const retrievedValue = await redis.get(req.params.key);

      res.json({
        key: req.params.key,
        value: retrievedValue,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/repeated-redis", async (_req, res) => {
    try {
      const keys = ["user:1", "user:2", "user:3"];
      let commandCount = 0;

      for (const key of keys) {
        await redis.get(key);
        commandCount += 1;
      }

      res.json({
        ok: true,
        database: "redis",
        repeatedQueries: commandCount,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/repeated-redis-commands", async (_req, res) => {
    try {
      const getKeys = ["cache:a", "cache:b", "cache:c", "cache:d"];
      const hashKeys = ["profile:1", "profile:2", "profile:3", "profile:4"];

      for (const key of getKeys) {
        await redis.get(key);
      }

      for (const key of hashKeys) {
        await redis.hget(key, "name");
      }

      res.json({
        ok: true,
        database: "redis",
        hint:
          "Execution tab: Repeated Redis Commands (GET ? and HGET ? name groups).",
        patterns: [
          { command: "GET", executions: getKeys.length },
          { command: "HGET", executions: hashKeys.length },
        ],
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/redis-failed", async (_req, res) => {
    try {
      await redis.call("SERVERDEVTOOLS_INVALID_COMMAND");
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/stream-test", (_req, res) => {
    res.write("Hello ");
    res.write("from ");
    res.end("ServerDevTools");
  });

  app.post("/external-test", (req, res) => {
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

  app.get("/slow", async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 750));

    res.json({
      ok: true,
      delayedMs: 750,
    });
  });

  app.get("/repeated-postgres", async (_req, res) => {
    try {
      const ids = [1, 2, 3];
      let rowCount = 0;

      for (const id of ids) {
        const result = await postgresPool.query(
          "SELECT * FROM users WHERE id = $1",
          [id],
        );
        rowCount += result.rows.length;
      }

      res.json({
        ok: true,
        database: "postgresql",
        repeatedQueries: ids.length,
        rowCount,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/repeated-mysql2", async (_req, res) => {
    try {
      const ids = [1, 2, 3];
      let rowCount = 0;

      for (const id of ids) {
        const [rows] = await mysql2Pool.execute(
          "SELECT * FROM users WHERE id = ?",
          [id],
        );
        rowCount += Array.isArray(rows) ? rows.length : 0;
      }

      res.json({
        ok: true,
        database: "mysql2",
        repeatedQueries: ids.length,
        rowCount,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/repeated-mysql2-queries", async (_req, res) => {
    try {
      const ids = [1, 2, 3, 4, 5];
      let rowCount = 0;

      for (const id of ids) {
        const [rows] = await mysql2Pool.execute(
          "SELECT * FROM users WHERE id = ?",
          [id],
        );
        rowCount += Array.isArray(rows) ? rows.length : 0;
      }

      for (const id of ids) {
        await mysql2Pool.execute(
          "SELECT email FROM users WHERE id = ?",
          [id],
        );
      }

      res.json({
        ok: true,
        database: "mysql2",
        hint:
          "Execution tab: Repeated Database Queries (two normalized SELECT shapes).",
        repeatedQueries: ids.length * 2,
        rowCount,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/repeated-redis-mysql2", async (_req, res) => {
    const payload: {
      ok: boolean;
      hint: string;
      redis?: { patterns: Array<{ command: string; executions: number }> };
      mysql2?: { repeatedQueries: number; rowCount: number };
      error?: string;
    } = {
      ok: true,
      hint:
        "One trace: Repeated Redis Commands plus Repeated Database Queries (MySQL2).",
    };

    try {
      const getKeys = ["smoke:1", "smoke:2", "smoke:3"];
      for (const key of getKeys) {
        await redis.get(key);
      }
      payload.redis = {
        patterns: [{ command: "GET", executions: getKeys.length }],
      };
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    try {
      const ids = [1, 2, 3, 4];
      let rowCount = 0;
      for (const id of ids) {
        const [rows] = await mysql2Pool.execute(
          "SELECT * FROM users WHERE id = ?",
          [id],
        );
        rowCount += Array.isArray(rows) ? rows.length : 0;
      }
      payload.mysql2 = {
        repeatedQueries: ids.length,
        rowCount,
      };
    } catch (error) {
      payload.ok = false;
      payload.error = error instanceof Error ? error.message : String(error);
    }

    res.status(payload.ok ? 200 : 503).json(payload);
  });

  app.get("/repeated-mongodb", async (_req, res) => {
    try {
      const userIds = [1, 2, 3];
      let docCount = 0;

      for (const userId of userIds) {
        const docs = await users
          .find({ userId })
          .limit(5)
          .toArray();
        docCount += docs.length;
      }

      res.json({
        ok: true,
        database: "mongodb",
        repeatedQueries: userIds.length,
        docCount,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/repeated-database-queries", async (_req, res) => {
    const ids = [1, 2, 3, 4];
    const result: {
      ok: boolean;
      hint: string;
      postgresql?: { repeatedQueries: number; rowCount: number };
      mysql2?: { repeatedQueries: number; rowCount: number };
      mongodb?: { repeatedQueries: number; docCount: number };
      errors?: string[];
    } = {
      ok: true,
      hint:
        "Open this request in the dashboard Execution tab to inspect Repeated Database Queries (count, total, avg).",
    };

    const errors: string[] = [];

    try {
      let pgRows = 0;
      for (const id of ids) {
        const queryResult = await postgresPool.query(
          "SELECT * FROM users WHERE id = $1",
          [id],
        );
        pgRows += queryResult.rows.length;
      }
      result.postgresql = {
        repeatedQueries: ids.length,
        rowCount: pgRows,
      };
    } catch (error) {
      errors.push(
        `postgresql: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      let mysqlRows = 0;
      for (const id of ids) {
        const [rows] = await mysql2Pool.execute(
          "SELECT * FROM users WHERE id = ?",
          [id],
        );
        mysqlRows += Array.isArray(rows) ? rows.length : 0;
      }
      result.mysql2 = {
        repeatedQueries: ids.length,
        rowCount: mysqlRows,
      };
    } catch (error) {
      errors.push(
        `mysql2: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      let docCount = 0;
      for (const userId of ids) {
        const docs = await users
          .find({ userId })
          .limit(5)
          .toArray();
        docCount += docs.length;
      }
      result.mongodb = {
        repeatedQueries: ids.length,
        docCount,
      };
    } catch (error) {
      errors.push(
        `mongodb: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (errors.length > 0) {
      result.errors = errors;
      result.ok = errors.length < 3;
    }

    if (!result.postgresql && !result.mysql2 && !result.mongodb) {
      res.status(503).json(result);
      return;
    }

    res.json(result);
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

  app.get("/fetch-concurrent-test", async (_req, res) => {
    const responses = await Promise.all([
      fetch("http://localhost:3000/external-test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          request: "A",
        }),
      }),

      fetch("http://localhost:3000/external-test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          request: "B",
        }),
      }),

      fetch("http://localhost:3000/external-test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          request: "C",
        }),
      }),
    ]);

    const data = await Promise.all(
      responses.map((response) => response.json()),
    );

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
        (response: IncomingMessage) => {
          const chunks: Buffer[] = [];

          response.on("data", (chunk: Buffer) => {
            chunks.push(Buffer.from(chunk));
          });

          response.once("end", () => {
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
