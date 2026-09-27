import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { env, pkg } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const logger = new Logger('Bootstrap');

  app.enableShutdownHooks();
  app.useBodyParser('json', { limit: `${env.BODY_LIMIT_MB}mb` });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  if (env.CORS_ORIGIN) {
    app.enableCors({
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split('|'),
    });
  }

  if (env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle(pkg.name)
      .setDescription(pkg.description)
      .setVersion(pkg.version)
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'api-key')
      .build();
    SwaggerModule.setup(env.SWAGGER_PATH, app, () =>
      SwaggerModule.createDocument(app, config),
    );
  }

  await app.listen(env.PORT);
  logger.log(
    `${pkg.name} v${pkg.version} listening on :${env.PORT} ` +
      `(${env.PRINTER_TYPE} @ ${env.PRINTER_INTERFACE}, auth ${env.API_KEY ? 'on' : 'off'})`,
  );
  if (env.SWAGGER_ENABLED) logger.log(`Swagger UI at /${env.SWAGGER_PATH}`);
}
void bootstrap();
