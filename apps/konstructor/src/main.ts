import { NestFactory } from '@nestjs/core';
import { KonstructorModule } from './konstructor.module';

async function bootstrap() {
    const app = await NestFactory.create(KonstructorModule);
    await app.listen(process.env.port ?? 3000);
}
bootstrap();
