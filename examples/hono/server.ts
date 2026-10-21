import { createServer } from "node:http";
import { Hono } from "hono";
import { getRequestListener } from "@hono/node-server";
import { serverDevTools } from "./server-devtools";

const app = new Hono();

app.get("/hello", (c) => c.json({ message: "hello" }));

app.post("/echo", async (c) => c.json(await c.req.json()));

const honoListener = getRequestListener(app.fetch);

createServer((req, res) => {
  serverDevTools.middleware(req, res, () => {
    void honoListener(req, res);
  });
}).listen(3000, () => {
  console.log("Hono example running at http://localhost:3000");
});
