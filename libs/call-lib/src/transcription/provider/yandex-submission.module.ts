import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { YandexSubmissionStatsRepository } from '../repository/yandex-submission-stats.repository';
import { YandexSubmissionGuard } from './yandex-submission-guard.service';

/**
 * Страж платных отправок в Яндекс и счётчик отправок по порталу и дню
 * (всё в Redis). Подключают оба пути распознавания (роутер call-report и
 * старый POST /transcription) и страница расхода (чтение счётчика).
 */
@Module({
    imports: [RedisModule],
    providers: [YandexSubmissionStatsRepository, YandexSubmissionGuard],
    exports: [YandexSubmissionStatsRepository, YandexSubmissionGuard],
})
export class YandexSubmissionModule {}
