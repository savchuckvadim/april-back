import { NestFactory } from '@nestjs/core';
import { BitrixModule } from './bitrix.module';

async function bootstrap() {
  const app = await NestFactory.create(BitrixModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
