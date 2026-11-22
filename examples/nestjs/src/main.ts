import "reflect-metadata";

import type { IncomingMessage, ServerResponse } from "node:http";
import { NestFactory } from "@nestjs/core";
import type ServerDevTools from "server-devtools";
import { ServerDevToolsNestInterceptor } from "server-devtools/nestjs";

import { AppModule } from "./app.module";
import { connectMongo } from "./mongo";

type ExampleUser = { id: string; email: string; name: string };
type RequestWithUser = IncomingMessage & { user?: ExampleUser };

declare global {
  var __serverDevtools: ServerDevTools | undefined;
}

async function bootstrap() {
  const devtools = globalThis.__serverDevtools;

  if (!devtools) {
    throw new Error(
      "ServerDevTools was not preloaded. Run from repo root: npm run nest:example",
    );
  }

  await connectMongo();

  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();
  app.useGlobalInterceptors(new ServerDevToolsNestInterceptor());

  app.use((req: IncomingMessage, _res: ServerResponse, next: () => void) => {
    (req as RequestWithUser).user = {
      id: "user-example",
      email: "nestjs@example.com",
      name: "Nest Example",
    };
    next();
  });

  app.use(
    (
      req: IncomingMessage,
      res: ServerResponse,
      next: () => void,
    ) => devtools.middleware(req, res, next),
  );

  await app.listen(3000);
  console.log("NestJS example running at http://localhost:3000");
}

bootstrap();