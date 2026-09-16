import 'reflect-metadata';

import ServerDevTools from '../../src';

const devtools = new ServerDevTools({
  auth: {
    username: 'admin',
    password: 'admin',
  },
});

async function bootstrap() {
  await devtools.start();

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('./app.module');
  const { connectMongo } = await import('./mongo');

  await connectMongo();

  const app = await NestFactory.create(AppModule);

  app.use((req, res, next) => {
    devtools.middleware(req, res, next);
  });

  await app.listen(3000);

  console.log('NestJS example running at http://localhost:3000');
}

bootstrap();
