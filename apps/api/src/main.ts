import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { UploadsService } from './uploads/uploads.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  // Serve uploaded images from disk at /uploads/* (replaces the S3 public bucket).
  const uploads = app.get(UploadsService);
  app.useStaticAssets(uploads.dir, { prefix: '/uploads/', index: false });

  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`StockMaster API listening on http://localhost:${port}`);
}

void bootstrap();
