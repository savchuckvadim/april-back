import { Module } from '@nestjs/common';
import { QueueModule } from '@lib/queue/queue.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { OfferWordModule } from './offer-word.module';
import { OfferGenerateProcessor } from './queue/offer-generate.processor';
import { OfferWordEphemeralPdfProcessor } from './queue/offer-word-ephemeral-pdf.processor';
import { OfferGenerateMultiProcessor } from './multi/queue/offer-generate-multi.processor';

/**
 * Воркеры очередей КП: генерация КП, КП v2 и PDF-превью.
 *
 * Подключается ТОЛЬКО в приложении konstructor (app.module.ts). Сам
 * OfferWordModule импортирует ещё и admin — ради ручек offer-word, — и пока
 * процессоры жили в нём, admin тоже слушал эти очереди: задания КП и превью
 * уходили в контейнер без Gotenberg (LIBREOFFICE_MODE=http задан только
 * konstructor в docker-compose.prod.yml), а из общей очереди 'konstructor'
 * он ронял запись сделки без обработчика (11.11.2026, CLIENT LIST в Redis).
 *
 * Ставить задания по-прежнему может любое приложение с OfferWordModule:
 * очередь общая в Redis, выполняет её только konstructor.
 */
@Module({
    imports: [QueueModule, RedisModule, OfferWordModule],
    providers: [
        OfferGenerateProcessor,
        OfferGenerateMultiProcessor,
        OfferWordEphemeralPdfProcessor,
    ],
})
export class OfferWordWorkerModule {}
