import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  await app.listen(3434);

  console.log(
    'NestJS example running at http://localhost:3434',
  );
}

bootstrap();