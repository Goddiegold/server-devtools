import { NestFactory } from "@nestjs/core";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { connectMongo } from "./mongo";

import ServerDevToolsNestInterceptor from "../../src/integrations/nestjs/server-devtools-nest.interceptor";
import { serverDevTools } from "./server-devtools";
import type { Request, Response, NextFunction } from "express";


async function bootstrap() {

  await connectMongo();

  const app = await NestFactory.create(AppModule);

  app.use((req:Request, res:Response, next:NextFunction) => {
    serverDevTools.middleware(req, res, next);
  });

  app.useGlobalInterceptors(
    new ServerDevToolsNestInterceptor(),
  );

  await app.listen(3000);
  console.log('NestJS example running at http://localhost:3000');

}

bootstrap();
