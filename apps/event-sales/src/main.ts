import { NestFactory } from '@nestjs/core';
import { EventSalesModule } from './event-sales.module';

async function bootstrap() {
  const app = await NestFactory.create(EventSalesModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
