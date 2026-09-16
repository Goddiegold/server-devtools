import { Express } from "express";
import { MongoClient } from "mongodb";
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

  // Instrumentation must start before MongoDB/Express are loaded.
  await devtools.start();

  const express = require("express");
  const { MongoClient } = require("mongodb");

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

  app.get("/users/:id", async (req, res) => {
    const user = await users.findOne({
      id: req.params.id,
    });

    const response = await fetch("https://example.com");
    await response.text();

    res.json({
      user,
    });
  });

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