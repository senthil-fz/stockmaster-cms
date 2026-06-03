import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ZodValidationPipe } from 'nestjs-zod';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ScopeGuard } from './common/guards/scope.guard';
import { ReadTrackingInterceptor } from './common/interceptors/read-tracking.interceptor';
import { AuthModule } from './auth/auth.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { BooksModule } from './books/books.module';
import { ArticlesModule } from './articles/articles.module';
import { PagesModule } from './pages/pages.module';
import { UploadsModule } from './uploads/uploads.module';
import { StatsModule } from './stats/stats.module';
import { ReaderModule } from './reader/reader.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    JwtModule.register({ global: true }),
    PrismaModule,
    AuthModule,
    ApiKeysModule,
    BooksModule,
    ArticlesModule,
    PagesModule,
    UploadsModule,
    StatsModule,
    ReaderModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Registration order matters: multiple APP_GUARDs run in the order declared.
    // JwtAuthGuard populates req.scopes/req.authType BEFORE ScopeGuard reads them.
    { provide: APP_GUARD, useClass: ScopeGuard },
    { provide: APP_INTERCEPTOR, useClass: ReadTrackingInterceptor },
  ],
})
export class AppModule {}
