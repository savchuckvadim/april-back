import { Module } from '@nestjs/common';
import { QueueModule } from '@lib/queue/queue.module';
import { LegacyKonstructorQueueProcessor } from './legacy-konstructor-queue.processor';

/**
 * Временный дренаж старой очереди 'konstructor' (см. процессор). Только
 * приложение konstructor; удалить через неделю после выкатки разделения.
 */
@Module({
    imports: [QueueModule],
    providers: [LegacyKonstructorQueueProcessor],
})
export class LegacyQueueDrainModule {}
