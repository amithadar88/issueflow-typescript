import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties not in the DTO
      forbidNonWhitelisted: true, // 400 on unknown properties
      transform: true, // coerce payloads to DTO instances
    }),
  );
  await app.listen(3000);
}
bootstrap();
