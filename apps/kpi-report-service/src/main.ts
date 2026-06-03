import { NestFactory } from '@nestjs/core';
import { KpiReportServiceModule } from './kpi-report-service.module';

async function bootstrap() {
  const app = await NestFactory.create(KpiReportServiceModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
