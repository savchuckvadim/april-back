import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { BxDepartmentModule } from '@lib/bx-department';
import { AiModule, CallReportAnalyticsCoreModule } from '@lib/call-lib';
import { PortalAppSettingsModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.module';
import { QueueModule } from '@lib/queue';
import { RopReportsModule } from '@lib/rop-reports';
import { PortalWorkingHoursService } from '../shared/working-hours/portal-working-hours.service';
import { PeriodDigestCalendarAdapter } from './adapters/period-digest-calendar.adapter';
import { PeriodDigestDefinition } from './period-digest.definition';
import { PeriodDigestScheduler } from './period-digest.scheduler';
import { PeriodDigestRunProcessor } from './queue/period-digest-run.processor';
import { PeriodDigestCardStore } from './services/period-digest-card.store';
import { PeriodDigestCardsService } from './services/period-digest-cards.service';
import { PeriodDigestSettingsService } from './services/period-digest-settings.service';
import { PeriodDigestSourceService } from './services/period-digest-source.service';

/**
 * Итоги периода по менеджерам (этап 7.4): карточка «менеджер × период» по
 * разобранным звонкам — снимками в ais, итог выпуска — в Telegram. Пока
 * только подсчёт: задачи руководителям и Excel — следующий этап.
 *
 * Контроллеров нет: «Посчитать» и «состояние» живут в админке
 * (`SalesAiAnalyticsAdminModule`, ai/rules/app-api-surface.md), сюда
 * приходят только джобы очереди EVENT_SALES_PERIOD_DIGEST_RUN и тик крона
 * `event-sales-period-digest` (ScheduleModule поднят корнем приложения).
 *
 * Импорты: PBX (график портала для календаря), каркас отчётов РОПу
 * (замки, метки, итог прогона, движок), настройки приложений (свои и
 * AI-аналитики), лёгкая выборка разборов и ais, структура отделов,
 * очередь (воркер).
 */
@Module({
    imports: [
        PBXModule,
        RopReportsModule,
        PortalAppSettingsModule,
        CallReportAnalyticsCoreModule,
        AiModule,
        BxDepartmentModule,
        QueueModule,
    ],
    providers: [
        PortalWorkingHoursService,
        PeriodDigestCalendarAdapter,
        PeriodDigestSettingsService,
        PeriodDigestSourceService,
        PeriodDigestCardStore,
        PeriodDigestCardsService,
        PeriodDigestDefinition,
        PeriodDigestRunProcessor,
        // Крон: тик раз в час, выпуск по политикам видов периода
        PeriodDigestScheduler,
    ],
})
export class PeriodDigestModule {}
