import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Переиспользуемый модуль проверки живости приложения.
 * Подключается в корневом модуле каждого app монорепо.
 */
@Module({
    controllers: [HealthController],
})
export class HealthModule {}
