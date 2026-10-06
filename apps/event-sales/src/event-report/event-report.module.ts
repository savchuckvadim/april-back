import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { QueueModule } from '@/modules/queue/queue.module';
import { WsModule } from '@/core/ws/ws.module';
import { EventReportInitService } from './services/init/event-report-init.service';
import { EventFlowStatusService } from './services/status/event-flow-status.service';
import { StagePredictService } from './services/stage-predict/stage-predict.service';
import { StagePredictDealsCache } from './services/stage-predict/stage-predict-deals.cache';
import { RedisModule } from '@/core/redis/redis.module';
import { EventFlowGuardService } from './services/flow-guard/event-flow-guard.service';
import { EventFlowDuplicateGuardService } from './services/flow-guard/event-flow-duplicate-guard.service';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { PortalQuestionnairesModule } from '@lib/portal-lib/store/questionnaires/portal-questionnaires.module';
import { EventReportUseCase } from './use-cases/event-report.use-case';
import { EventReportPostFlowService } from './services/post-flow/event-report-post-flow.service';
import { QuestionnaireSmartContextLoader } from './services/post-flow/questionnaire-smart-context.loader';
import { EventFlowProcessor } from './queue/event-flow.processor';
import { EventSalesController } from './controllers/event-sales.controller';
import { PortalFieldsModule } from '../shared/portal-fields';
import { BxDepartmentModule } from '@lib/bx-department';
import { EventReportActingManagerService } from './services/acting-manager/event-report-acting-manager.service';

/**
 * Модуль event-report flow. Подключается родительским `EventSalesModule`.
 *
 * Контроллер только принимает отчёт и ставит его в очередь — весь batch
 * Битрикса выполняет `EventFlowProcessor`. Статус операции живёт в AppCache
 * (`AppCacheServiceModule` глобальный, отдельного импорта не требует).
 *
 * @Injectable-сервисы — только те, у кого нет bitrix-состояния. Остальные
 * flow-сервисы создаются через `new` внутри use-case рядом с конкретным
 * `BitrixService` (см. CLAUDE.md, race condition между порталами).
 */
@Module({
    // PortalFieldsModule — фактические привязки crm-полей лида: от них
    // зависит формат значения связи продажи (`to_sale_deal`).
    imports: [
        PBXModule,
        QueueModule,
        WsModule,
        PortalFieldsModule,
        // Настройки портала: гейт чек-листов в flow-guard (проверка продажи).
        PortalAppSettingsModule,
        // Портальный каталог анкет: адреса полей смарта для ответов фрейма.
        // Импортируется ЛЁГКИЙ lib-модуль глубоким путём — админ-роуты
        // каталога не должны попасть в Swagger приложения.
        PortalQuestionnairesModule,
        // Структура отдела продаж: периметр руководителя для отчёта за
        // сотрудника (режим руководителя).
        BxDepartmentModule,
        // Короткий кэш чтений предикта стадии (сделки клиента на минуту).
        RedisModule,
    ],
    controllers: [EventSalesController],
    providers: [
        EventReportInitService,
        EventReportUseCase,
        // Пост-обработка отчёта (сайд-очереди ЗПР/презентаций):
        // bitrix-состояния не держит, инжектит только stateless-сервисы.
        EventReportPostFlowService,
        // Контекст портальных анкет для сайд-очередей: читает каталог и
        // настройки портала — отдельная от раскладки джобов ответственность.
        QuestionnaireSmartContextLoader,
        EventFlowStatusService,
        EventFlowProcessor,
        // Предикт стадии: PBXService.init(domain) внутри метода —
        // bitrix-состояние per-request, инжектить его сюда безопасно.
        StagePredictService,
        // Кэш сделок клиента для предикта; отчёт сбрасывает его после батча.
        StagePredictDealsCache,
        EventFlowGuardService,
        // Гард повторной отправки: второй отчёт по тому же делу — 409.
        EventFlowDuplicateGuardService,
        // Режим руководителя: bitrix приходит параметром, в полях не живёт.
        EventReportActingManagerService,
    ],
})
export class EventReportModule {}
