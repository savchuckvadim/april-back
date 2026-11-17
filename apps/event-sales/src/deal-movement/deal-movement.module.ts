import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { BxDepartmentModule } from '@lib/bx-department';
import { AiModule, TranscriptionStoreModule } from '@lib/call-lib';
import { LlmGatewayModule } from '@lib/llm-gateway';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { QueueModule } from '@lib/queue';
import { DealAuditModule } from '../deal-audit/deal-audit.module';
import { ActiveStaffModule } from '../shared/active-staff/active-staff.module';
import { DealMovementScheduler } from './deal-movement.scheduler';
import { DealMovementRunProcessor } from './queue/deal-movement-run.processor';
import { DealMovementCallsLoader } from './services/deal-movement-calls.loader';
import { DealMovementDigestService } from './services/deal-movement-digest.service';
import { DealMovementEvaluator } from './services/deal-movement-evaluator.service';
import { DealMovementNightCounters } from './services/deal-movement-night-counters';
import { DealMovementNotesService } from './services/deal-movement-notes.service';
import { DealMovementProbeService } from './services/deal-movement-probe.service';
import { DealMovementPublishService } from './services/deal-movement-publish.service';
import { DealMovementRunService } from './services/deal-movement-run.service';
import { DealMovementRunState } from './services/deal-movement-run-state';
import { DealMovementSettingsService } from './services/deal-movement-settings.service';
import { DealMovementSnapshotStore } from './services/deal-movement-snapshot.store';
import { DealMovementStateStore } from './services/deal-movement-state.store';
import { DealMovementTodoService } from './services/deal-movement-todo.service';

/**
 * Движение сделок (этап 7.3): ночной счёт статусов открытых сделок
 * «ОП Основная», запись в ленту сделки при смене статуса, «что сделать»
 * от модели и сводка руководителям (вторая волна, всё по умолчанию
 * выключено).
 *
 * Контроллеров нет: ручки «Посчитать», «состояние» и «проверка записи»
 * живут в админке (`SalesAiAnalyticsAdminModule`, ai/rules/app-api-surface.md),
 * сюда приходят только джобы очереди EVENT_SALES_DEAL_MOVEMENT_RUN.
 *
 * Импорты обязательны: Redis (замки, состояние, счётчики ночи), настройки
 * приложений (ростер и пороги), ais и расшифровки (разборы звонков),
 * шлюз моделей и настройки AI портала («что сделать» моделью портала),
 * очередь (воркер); для сводки руководителям — получатели и каналы аудита
 * сделок (`DealAuditModule` отдаёт `DealAuditSettingsService`), структура
 * отделов (`BxDepartmentModule`) и «кто работает» (`ActiveStaffModule`).
 */
@Module({
    imports: [
        PBXModule,
        RedisModule,
        PortalAppSettingsModule,
        PortalStoreModule,
        AiModule,
        TranscriptionStoreModule,
        LlmGatewayModule,
        QueueModule,
        BxDepartmentModule,
        ActiveStaffModule,
        DealAuditModule,
    ],
    providers: [
        DealMovementSettingsService,
        DealMovementRunState,
        DealMovementStateStore,
        DealMovementSnapshotStore,
        DealMovementNightCounters,
        DealMovementCallsLoader,
        DealMovementEvaluator,
        DealMovementTodoService,
        DealMovementNotesService,
        DealMovementDigestService,
        DealMovementPublishService,
        DealMovementRunService,
        DealMovementProbeService,
        DealMovementScheduler,
        DealMovementRunProcessor,
    ],
})
export class DealMovementModule {}
