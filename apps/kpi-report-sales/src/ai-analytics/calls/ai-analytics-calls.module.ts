import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { PortalSessionModule } from '@lib/auth';
import {
    CallPageLinkModule,
    MethodologyModule,
    TranscriptionStoreModule,
} from '@lib/call-lib';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { CallClientTitlesService } from './call-client-titles.service';
import { CallListIndexLoader } from './calls-list-index.loader';
import { CallListPointsProvider } from './calls-list-points.provider';
import { CallsListController } from './calls-list.controller';
import { CallsListUseCase } from './calls-list.use-case';

/**
 * Срез «Разборы звонков» отчёта KPI: ручка `POST ai-analytics/calls/list`
 * (под сессией портала, только руководителям). Поверхность API приложения
 * растёт ровно на неё (ai/rules/app-api-surface.md); в админку срез не
 * подключается.
 *
 * Выборка звонков, обратная связь, периметр и кэш — из ядра
 * (`AiAnalyticsCoreModule`), ссылки на страницы разбора —
 * `CallPageLinkModule`, сущность звонка — `TranscriptionStoreModule`
 * (только сервисы), пункты методики портала для фильтров —
 * `MethodologyModule` (реестр методик, без контроллеров), имена менеджеров
 * и названия клиентов — портал (`PBXModule`). Собственный @Module:
 * корневой модуль его только импортирует.
 */
@Module({
    imports: [
        PBXModule,
        AiAnalyticsCoreModule,
        PortalSessionModule,
        CallPageLinkModule,
        TranscriptionStoreModule,
        MethodologyModule,
    ],
    controllers: [CallsListController],
    providers: [
        CallListIndexLoader,
        CallListPointsProvider,
        CallClientTitlesService,
        CallsListUseCase,
    ],
})
export class AiAnalyticsCallsModule {}
