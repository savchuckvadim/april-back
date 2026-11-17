import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { AiModule, TranscriptionStoreModule } from '@lib/call-lib';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { QueueModule } from '@lib/queue';
import { DealMovementScheduler } from './deal-movement.scheduler';
import { DealMovementRunProcessor } from './queue/deal-movement-run.processor';
import { DealMovementCallsLoader } from './services/deal-movement-calls.loader';
import { DealMovementEvaluator } from './services/deal-movement-evaluator.service';
import { DealMovementRunService } from './services/deal-movement-run.service';
import { DealMovementRunState } from './services/deal-movement-run-state';
import { DealMovementSettingsService } from './services/deal-movement-settings.service';
import { DealMovementSnapshotStore } from './services/deal-movement-snapshot.store';
import { DealMovementStateStore } from './services/deal-movement-state.store';

/**
 * Движение сделок (этап 7.3, первая волна): ночной счёт статусов открытых
 * сделок «ОП Основная» — без записи в сделки.
 *
 * Контроллеров нет: ручки «Посчитать» и «состояние» живут в админке
 * (`SalesAiAnalyticsAdminModule`, ai/rules/app-api-surface.md), сюда
 * приходит только джоба очереди EVENT_SALES_DEAL_MOVEMENT_RUN.
 *
 * Импорты обязательны: Redis (замки, состояние), настройки приложений
 * (ростер и пороги), ais и расшифровки (разборы звонков), очередь (воркер).
 */
@Module({
    imports: [
        PBXModule,
        RedisModule,
        PortalAppSettingsModule,
        AiModule,
        TranscriptionStoreModule,
        QueueModule,
    ],
    providers: [
        DealMovementSettingsService,
        DealMovementRunState,
        DealMovementStateStore,
        DealMovementSnapshotStore,
        DealMovementCallsLoader,
        DealMovementEvaluator,
        DealMovementRunService,
        DealMovementScheduler,
        DealMovementRunProcessor,
    ],
})
export class DealMovementModule {}
