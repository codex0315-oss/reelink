import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { allowedOrigins } from './common/cors-origins';
import { StorageService } from './modules/storage/storage.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const origins = allowedOrigins();

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.use(
    helmet({
      // This is an API, not an HTML app — a CSP here protects nothing and would
      // fight the images served to the frontend from /uploads.
      contentSecurityPolicy: false,
      // Set per-route on /uploads instead, which has to be cross-origin so the
      // frontend can display listing photos. A global 'same-origin' would block them.
      crossOriginResourcePolicy: false,
    }),
  );

  // An allowlist rather than the previous bare enableCors(), which accepted every
  // origin — meaning any site could call this API with a user's token.
  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });

  // Behind a load balancer or tunnel, req.ip is the proxy's address — every visitor
  // would share one rate-limit bucket. Trusting one hop makes X-Forwarded-For the
  // client address. Only enable it when a proxy is genuinely in front, or a caller
  // can forge the header and dodge the limit entirely.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // Chrome fetches the logo over HTTP while rendering the reel's closing card.
  app.useStaticAssets(join(process.cwd(), 'brand'), { prefix: '/brand/' });

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', origins[0]);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // Uploaded files are user-supplied. Without this, a file that sniffs as HTML
      // could execute in the browser on this origin.
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  });

  // Without this, onModuleDestroy never runs on SIGINT/SIGTERM — so the warm Chrome
  // instance the reel renderer keeps would survive the process and leave a tree that
  // `nest start --watch` cannot kill on the next reload.
  app.enableShutdownHooks();

  // Which backend uploads landed in is the first thing worth knowing when a photo goes
  // missing, and it is decided by env vars rather than by anything visible in the code.
  Logger.log(
    `Uploads: ${app.get(StorageService).describe()}`,
    'Bootstrap',
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
