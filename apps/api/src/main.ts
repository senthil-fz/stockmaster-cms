import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { UploadsService } from './uploads/uploads.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind nginx (proxies 127.0.0.1 -> :3001, sets X-Forwarded-For): trust the
  // loopback proxy so Express derives req.ip from X-Forwarded-For (the real client).
  // Without this, req.ip is nginx's loopback address for EVERY request, which
  // collapses the reader's per-IP rate limit (RateLimitGuard) into one global bucket
  // shared by all clients — so normal reading intermittently 429s once total traffic
  // crosses the window. See common/guards/rate-limit.guard.ts.
  app.set('trust proxy', 'loopback');

  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });

  // URI versioning: every route is served under /v<version>. Editor controllers live at
  // /v1/admin/*, the public mobile reader at /v1/* (its version is pinned on the controller,
  // not inherited from this default — see reader.controller.ts). defaultVersion '1' means
  // controllers/routes without an explicit @Version land on v1. /health is VERSION_NEUTRAL
  // so the deploy liveness probe stays at /health (no version segment).
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

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
