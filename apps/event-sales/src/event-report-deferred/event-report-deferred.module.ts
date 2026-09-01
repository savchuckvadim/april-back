import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { QueueModule } from '@/modules/queue/queue.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { PortalQuestionnairesModule } from '@lib/portal-lib/store/questionnaires/portal-questionnaires.module';
import { PortalFieldsModule } from '../shared/portal-fields';
import { EventReportInitService } from '../event-report/services/init/event-report-init.service';
import { QuestionnaireSmartContextLoader } from '../event-report/services/post-flow/questionnaire-smart-context.loader';
import { EventReportDeferredController } from './controllers/event-report-deferred.controller';
import { EventReportDeferredService } from './services/event-report-deferred.service';
import { DeferredFlowContextFactory } from './services/deferred-flow-context.factory';
import { DeferredSideFlowDispatcher } from './services/deferred-side-flow.dispatcher';
import { DeferredStepDedupStore } from './services/deferred-step-dedup.store';

/**
 * Досылка хвоста прямого исполнения (`POST /event-sales/flow/deferred`).
 *
 * Модуль АДДИТИВНЫЙ: `EventReportModule` не изменён ни строкой, его
 * контроллер, очередь и статусы работают как раньше. Отсюда и раскладка
 * провайдеров — `EventReportInitService` и `QuestionnaireSmartContextLoader`
 * объявлены ЗДЕСЬ, а не импортированы из `EventReportModule`: тот их не
 * экспортирует, и дописать ему `exports` значило бы тронуть существующий
 * flow. Оба сервиса не держат состояния Битрикса (домен приезжает
 * аргументом), поэтому второй экземпляр безопасен.
 *
 * Зачем каждый импорт:
 *  - `PBXModule` — инстанс bitrix + слепок портала по домену;
 *  - `RedisModule` — отметка исполненных шагов (идемпотентность);
 *  - `QueueModule` — постановка сайд-джобов ЗПР/«Презентаций»;
 *  - `PortalFieldsModule` — фактические привязки crm-полей лида для синка
 *    заявок (без них связь продажи молча не сохранится);
 *  - `PortalAppSettingsModule` — классы поведения полей карточки и
 *    выключатель анкет;
 *  - `PortalQuestionnairesModule` — портальный каталог анкет (лёгкий
 *    lib-модуль глубоким путём: админ-роуты каталога не должны утечь в
 *    Swagger приложения).
 */
@Module({
    imports: [
        PBXModule,
        RedisModule,
        QueueModule,
        PortalFieldsModule,
        PortalAppSettingsModule,
        PortalQuestionnairesModule,
    ],
    controllers: [EventReportDeferredController],
    providers: [
        EventReportDeferredService,
        DeferredFlowContextFactory,
        DeferredSideFlowDispatcher,
        DeferredStepDedupStore,
        EventReportInitService,
        QuestionnaireSmartContextLoader,
    ],
})
export class EventReportDeferredModule {}
